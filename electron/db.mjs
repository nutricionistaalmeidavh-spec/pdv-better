import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { assertEntity, entities, entityOrder, CONTRACT_VERSION } from '../shared/contract.mjs';
import { normalizeRecord, lineTotalCents } from '../shared/domain.mjs';
import { normalizeSale, calculatePayment } from '../shared/sales.mjs';
const sqlType = f => f.type === 'money' || f.type === 'quantity' ? 'INTEGER' : 'TEXT';
export function openCatalog(filename) {
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  if (filename !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > CONTRACT_VERSION) throw new Error('Banco de versão mais recente. Atualize o aplicativo.');
  if (version === 0) {
    db.exec('BEGIN');
    try {
      for (const kind of entityOrder) {
        const fields = entities[kind].fields.map(f => '"' + f.key + '" ' + sqlType(f) +
          (f.required ? ' NOT NULL' : '') +
          ((f.type === 'money' || f.type === 'quantity') ? ' CHECK("' + f.key + '" >= 0)' : ''));
        db.exec('CREATE TABLE IF NOT EXISTS "' + kind + '" (id TEXT PRIMARY KEY, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, ' + fields.join(', ') + ')');
      }
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS products_code_unique ON products(code) WHERE code IS NOT NULL AND code <> ''");
      db.exec('PRAGMA user_version = ' + CONTRACT_VERSION);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  if (version < 2) {
    db.exec('BEGIN');
    try {
      db.exec("CREATE TABLE IF NOT EXISTS sales (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, total_cents INTEGER NOT NULL, tendered_cents INTEGER NOT NULL, change_cents INTEGER NOT NULL, payment_method TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'completed')");
      db.exec("CREATE TABLE IF NOT EXISTS sale_items (sale_id TEXT NOT NULL REFERENCES sales(id), product_id TEXT NOT NULL, name TEXT NOT NULL, unit TEXT NOT NULL, price_cents INTEGER NOT NULL, quantity_milli INTEGER NOT NULL, line_total_cents INTEGER NOT NULL, PRIMARY KEY(sale_id, product_id))");
      db.exec('PRAGMA user_version = 2');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function completeSale(input) {
    const sale = normalizeSale(input);
    db.exec('BEGIN IMMEDIATE');
    try {
      const previous = db.prepare('SELECT * FROM sales WHERE id=?').get(sale.id);
      if (previous) { db.exec('COMMIT'); return previous; }
      const lines = sale.items.map(item => {
        const product = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(item.productId);
        if (!product) throw new Error('Produto não encontrado ou inativo.');
        if (product.unit === 'UN' && item.quantityMilli % 1000 !== 0) throw new Error('Unidade exige quantidade inteira.');
        if (product.stock_milli < item.quantityMilli) throw new Error('Estoque insuficiente: ' + product.name);
        return {...item,product,priceCents:product.sale_price_cents,quantityMilli:item.quantityMilli};
      });
      const cart = lines.map(line=>({priceCents:line.priceCents,quantityMilli:line.quantityMilli}));
      const payment = calculatePayment(cart,sale.method,sale.tenderedCents);
      const now = new Date().toISOString();
      db.prepare('INSERT INTO sales (id,created_at,total_cents,tendered_cents,change_cents,payment_method,status) VALUES (?,?,?,?,?,?,?)')
        .run(sale.id,now,payment.totalCents,sale.tenderedCents,payment.changeCents,sale.method,'completed');
      for (const line of lines) {
        const update = db.prepare('UPDATE products SET stock_milli=stock_milli-?,updated_at=? WHERE id=? AND stock_milli>=?').run(line.quantityMilli,now,line.productId,line.quantityMilli);
        if (update.changes !== 1) throw new Error('Estoque insuficiente.');
        db.prepare('INSERT INTO sale_items (sale_id,product_id,name,unit,price_cents,quantity_milli,line_total_cents) VALUES (?,?,?,?,?,?,?)')
          .run(sale.id,line.productId,line.product.name,line.product.unit,line.priceCents,line.quantityMilli,lineTotalCents(line.priceCents,line.quantityMilli));
      }
      db.exec('COMMIT');
      return db.prepare('SELECT * FROM sales WHERE id=?').get(sale.id);
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function salesList() { return db.prepare('SELECT * FROM sales ORDER BY created_at DESC LIMIT 100').all(); }
  function list(kind, search = '') {
    const schema = assertEntity(kind);
    const term = String(search || '').trim().slice(0, 120);
    const searchable = schema.fields.filter(f => f.type === 'text').map(f => '"' + f.key + '" LIKE ?');
    const query = 'SELECT * FROM "' + kind + '" WHERE active=1' +
      (term && searchable.length ? ' AND (' + searchable.join(' OR ') + ')' : '') +
      ' ORDER BY name COLLATE NOCASE';
    return db.prepare(query).all(...(term ? searchable.map(() => '%' + term.replace(/[%_]/g, '') + '%') : []));
  }
  function save(kind, input) {
    const schema = assertEntity(kind);
    const values = normalizeRecord(kind, input);
    if (kind === 'products' && values.category_id) {
      if (!db.prepare('SELECT id FROM categories WHERE id = ? AND active = 1').get(values.category_id)) {
        throw new Error('Categoria inexistente ou inativa.');
      }
    }
    const id = typeof input.id === 'string' && /^[0-9a-f-]{36}$/i.test(input.id) ? input.id : randomUUID();
    const now = new Date().toISOString();
    const columns = schema.fields.map(f => f.key);
    const existing = db.prepare('SELECT id, created_at FROM "' + kind + '" WHERE id = ?').get(id);
    const insertColumns = ['id', 'created_at', 'updated_at', 'active', ...columns];
    const args = [id, existing?.created_at || now, now, 1, ...columns.map(key => values[key] === '' && key === 'code' ? null : values[key])];
    const query = 'INSERT INTO "' + kind + '" (' + insertColumns.map(k => '"' + k + '"').join(',') + ') VALUES (' +
      insertColumns.map(() => '?').join(',') + ') ON CONFLICT(id) DO UPDATE SET ' +
      [...columns, 'updated_at', 'active'].map(k => '"' + k + '"=excluded."' + k + '"').join(',');
    try { db.prepare(query).run(...args); }
    catch (error) {
      if (String(error).includes('UNIQUE')) throw new Error('Código já cadastrado em outro produto.');
      throw error;
    }
    return db.prepare('SELECT * FROM "' + kind + '" WHERE id = ?').get(id);
  }
  function archive(kind, id) {
    assertEntity(kind);
    if (typeof id !== 'string') throw new Error('Identificador inválido.');
    if (kind === 'categories') {
      const linked = db.prepare('SELECT COUNT(*) AS n FROM products WHERE category_id=? AND active=1').get(id).n;
      if (linked > 0) throw new Error('Categoria possui produtos ativos. Altere a categoria desses produtos antes de desativá-la.');
    }
    const result = db.prepare('UPDATE "' + kind + '" SET active=0, updated_at=? WHERE id=? AND active=1').run(new Date().toISOString(), id);
    if (!result.changes) throw new Error('Cadastro não encontrado ou já desativado.');
    return { id, archived: true };
  }
  function overview() {
    return Object.fromEntries(entityOrder.map(kind => [kind, db.prepare('SELECT COUNT(*) AS n FROM "' + kind + '" WHERE active=1').get().n]));
  }
  return { list, save, archive, overview, completeSale, salesList, close: () => db.close() };
}
