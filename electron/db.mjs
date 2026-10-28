import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { assertEntity, entities, entityOrder, CONTRACT_VERSION } from '../shared/contract.mjs';
import { normalizeRecord } from '../shared/domain.mjs';
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
  return { list, save, archive, overview, close: () => db.close() };
}
