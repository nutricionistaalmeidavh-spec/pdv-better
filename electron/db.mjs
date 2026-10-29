import { DatabaseSync, backup } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { assertEntity, entities, entityOrder, CONTRACT_VERSION } from '../shared/contract.mjs';
import { normalizeRecord } from '../shared/domain.mjs';
import { createCommerce } from './commerce.mjs';
import {migrateAccess,createAccess} from './access.mjs';
import {migrateNexusFeatures} from './nexus-features.mjs';
import {migrateCrossSku} from './cross-sku.mjs';
import {migratePhase7} from './phase7.mjs';
import {migratePhase8} from './phase8.mjs';
import {parseCatalogCsv} from '../shared/catalog-import.mjs';
import {normalizeSqliteError} from './sqlite-errors.mjs';
const sqlType = f => f.type === 'money' || f.type === 'quantity' ? 'INTEGER' : 'TEXT';
export function openCatalog(filename,{terminalId='legacy',busyTimeoutMs=5000}={}) {
  const timeout=Number.isSafeInteger(busyTimeoutMs)&&busyTimeoutMs>=0&&busyTimeoutMs<=30000?busyTimeoutMs:5000;
  const storageError=normalizeSqliteError;
  let db;
  try {
  db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = '+timeout);
  if (filename !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  const check=db.prepare('PRAGMA quick_check').get();
  if(!check||check.quick_check!=='ok')throw new Error('Integridade do SQLite inválida: falha no quick_check.');
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
      db.exec('PRAGMA user_version = 1'); // v1 cadastros; a migração v2 é canônica em commerce.mjs
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const commerce = createCommerce(db,{defaultTerminalId:terminalId});
  migrateAccess(db,terminalId);
  migrateNexusFeatures(db);
  migrateCrossSku(db);
  migratePhase7(db);
  migratePhase8(db);
  const access=createAccess(db);
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
    const existing = db.prepare('SELECT * FROM "' + kind + '" WHERE id = ?').get(id);
    if(kind==='products' && existing && values.stock_milli!==existing.stock_milli)
      throw new Error('Estoque só pode ser alterado pelo módulo de movimentações; o saldo do cadastro é somente leitura.');
    const insertColumns = ['id', 'created_at', 'updated_at', 'active', ...columns];
    const args = [id, existing?.created_at || now, now, 1, ...columns.map(key => values[key] === '' && key === 'code' ? null : values[key])];
    const query = 'INSERT INTO "' + kind + '" (' + insertColumns.map(k => '"' + k + '"').join(',') + ') VALUES (' +
      insertColumns.map(() => '?').join(',') + ') ON CONFLICT(id) DO UPDATE SET ' +
      [...columns, 'updated_at', 'active'].map(k => '"' + k + '"=excluded."' + k + '"').join(',');
    let started=false;
    try {
      if(kind==='products'){db.exec('BEGIN IMMEDIATE');started=true;}
      db.prepare(query).run(...args);
      if(kind==='products' && !existing && values.stock_milli>0) commerce.recordInitialStock(id,values.stock_milli);
      if(started){db.exec('COMMIT');started=false;}
    } catch (error) {
      if(started){try{db.exec('ROLLBACK');}catch{}}
      if (String(error).includes('UNIQUE')) throw new Error('Código já cadastrado em outro produto.');
      throw storageError(error);
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
  const operations={list,save,archive,overview,...commerce};
  const sessionAware=new Set(['getCurrentSession','openSession','closeSession','moveCash','checkout','cancelSale','settleFinance','listSales']);
  const noArgs=new Set(['getCurrentSession','listSales','listOpenSessions','report','overview','listFinance']);
  function secureCall(method,args=[],ctx={}){
    if(typeof method!=='string'||typeof operations[method]!=='function') {
      if(method==='setPassword'){
        const user=access.authorize(ctx.sessionToken,ctx.terminalId,method,args);
        return access.setPassword(args[0]);
      }
      throw new Error('Operação não permitida.');
    }
    if(!Array.isArray(args)||args.length>4)throw new Error('Argumentos inválidos.');
    const user=access.authorize(ctx.sessionToken,ctx.terminalId,method,args);
    if(noArgs.has(method)&&args.length)throw new Error('Argumentos de sessão não permitidos.');
    access.ensureLastAdmin(method,args);
    if(method==='getSale'&&user.role==='Caixa'){
      const sale=commerce.getSale(args[0]);
      const own=commerce.listSales({terminalId:ctx.terminalId,role:'Caixa'});
      if(!own.some(x=>x.id===sale.id))throw new Error('Permissão insuficiente: venda de outro terminal.');
    }
    if(method==='listStockMovements'&&user.role==='Caixa')throw new Error('Permissão insuficiente.');
    const context={terminalId:ctx.terminalId,operatorId:user.id,role:user.role};
    return sessionAware.has(method)?operations[method](...args,context):operations[method](...args);
  }
  return { ...operations,secureCall,
    authStatus:access.status,authBootstrap:access.bootstrap,authLogin:access.login,
    authLogout:access.logout,authCurrent:access.current,
    backupTo: (destination) => backup(db,destination), close: () => db.close() };
  }catch(error){
    try{db?.close();}catch{}
    throw storageError(error);
  }
}
