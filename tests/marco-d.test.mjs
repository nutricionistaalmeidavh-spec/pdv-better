import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openCatalog} from '../electron/db.mjs';
import {startLanServer,requestLan} from '../electron/lan.mjs';
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'pdv-d-'));
 const store=openCatalog(join(dir,'data.sqlite'),{terminalId:'host-terminal'});
 const p=store.save('products',{name:'Água',unit:'UN',sale_price_cents:'3,50',stock_milli:'10'});
 return {store,p,done:()=>{store.close();rmSync(dir,{recursive:true,force:true});}};
}
test('v4 migra sessão aberta e cria caixas independentes sem compartilhar saldo',()=>{
 const t=fixture();try{
   const host={terminalId:'host-terminal'},other={terminalId:'second-terminal'};
   t.store.openSession({openingCashCents:10000},host);
   t.store.openSession({openingCashCents:2000},other);
   assert.equal(t.store.listOpenSessions().length,2);
   assert.throws(()=>t.store.openSession({openingCashCents:0},host),/aberto/i);
   t.store.checkout({key:'d1',items:[{id:t.p.id,quantityMilli:1000}],payments:[{method:'cash',amountCents:350}]},host);
   t.store.checkout({key:'d2',items:[{id:t.p.id,quantityMilli:2000}],payments:[{method:'cash',amountCents:700}]},other);
   assert.equal(t.store.getCurrentSession(host).expected_cash_cents,10350);
   assert.equal(t.store.getCurrentSession(other).expected_cash_cents,2700);
   const closed=t.store.closeSession({countedCashCents:2700},other);
   assert.equal(closed.difference_cents,0);
   assert.equal(t.store.getCurrentSession(other),null);
   assert.ok(t.store.getCurrentSession(host));
   assert.equal(t.store.list('products')[0].stock_milli,7000);
 }finally{t.done();}
});
test('login exige senha forte e perfis impõem restrições no banco, sem acesso por bypass',()=>{
 const t=fixture();try{
   const tId='host-terminal';
   const first=t.store.authBootstrap({name:'Gestor',password:'SenhaForte!2026'},tId);
   assert.equal(first.user.role,'Administrador');
   assert.throws(()=>t.store.authBootstrap({name:'Outro',password:'SenhaForte!2026'},tId),/configurad|exist/i);
   const admin=first.token;
   const u=t.store.secureCall('save',['operators',{name:'Operador',role:'Caixa'}],{sessionToken:admin,terminalId:tId});
   t.store.secureCall('setPassword',[{operatorId:u.id,password:'CaixaSeguro2026'}],{sessionToken:admin,terminalId:tId});
   const cashier=t.store.authLogin({operatorId:u.id,password:'CaixaSeguro2026'},'second-terminal');
   assert.equal(cashier.user.role,'Caixa');
   const ctx={sessionToken:cashier.token,terminalId:'second-terminal'};
   assert.throws(()=>t.store.secureCall('save',['products',{name:'Preço indevido',unit:'UN',sale_price_cents:'0,01'}],ctx),/permiss/i);
   assert.throws(()=>t.store.secureCall('report',[],ctx),/permiss/i);
   assert.throws(()=>t.store.secureCall('setPassword',[{operatorId:u.id,password:'AlterarSenha123'}],ctx),/permiss/i);
   const opened=t.store.secureCall('openSession',[{openingCashCents:0}],ctx);
   assert.equal(opened.terminal_id,'second-terminal');
   assert.throws(()=>t.store.secureCall('getCurrentSession',[{terminalId:'host-terminal'}],ctx),/sessão|não permitid|invalid/i);
   assert.throws(()=>t.store.authLogin({operatorId:u.id,password:'errada'},'third-terminal'),/credencia|senha/i);
   t.store.authLogout(cashier.token);
   assert.throws(()=>t.store.secureCall('list',['products'],ctx),/autentic/i);
 }finally{t.done();}
});
test('LAN não permite ler ou movimentar outros caixas por injetar terminalId',async()=>{
 const t=fixture();const key='e'.repeat(64);const server=await startLanServer({host:'127.0.0.1',port:0,token:key,store:t.store});
 try{
   const url='http://127.0.0.1:'+server.port;
   const admin=await requestLan(url,key,'authBootstrap',[{name:'Admin LAN',password:'AdminStrong2026'}],null,'station-A');
   const ctx={sessionToken:admin.token,terminalId:'station-A'};
   await requestLan(url,key,'openSession',[{openingCashCents:100}],ctx.sessionToken,ctx.terminalId);
   const other=await requestLan(url,key,'authLogin',[{operatorId:admin.user.id,password:'AdminStrong2026'}],null,'station-B');
   await requestLan(url,key,'openSession',[{openingCashCents:200}],other.token,'station-B');
   assert.equal((await requestLan(url,key,'getCurrentSession',[],ctx.sessionToken,ctx.terminalId)).opening_cash_cents,100);
   assert.equal((await requestLan(url,key,'getCurrentSession',[],other.token,'station-B')).opening_cash_cents,200);
   await assert.rejects(requestLan(url,key,'closeSession',[{countedCashCents:0,terminalId:'station-B'}],ctx.sessionToken,'station-B'),/autentic|acesso/i);
   assert.equal(t.store.listOpenSessions().length,2);
 }finally{await server.close();t.done();}
});

test('migração v3 preserva turno aberto de loja já em uso, sem duplicar valores',async()=>{
 const {DatabaseSync}=await import('node:sqlite');
 const {createCommerce}=await import('../electron/commerce.mjs');
 const {migrateAccess}=await import('../electron/access.mjs');
 const db=new DatabaseSync(':memory:');
 try{
   db.exec("CREATE TABLE products(id TEXT PRIMARY KEY,stock_milli INTEGER NOT NULL); CREATE TABLE operators(id TEXT PRIMARY KEY,name TEXT,role TEXT,active INTEGER NOT NULL); PRAGMA user_version=1;");
   createCommerce(db);
   db.prepare("INSERT INTO cash_sessions(id,opened_at,opening_cash_cents,status) VALUES(?,?,?,'open')").run('session-antiga','2026-10-25T12:00:00Z',12345);
   migrateAccess(db,'terminal-loja-existente');
   assert.equal(db.prepare('PRAGMA user_version').get().user_version,4);
   const current=db.prepare("SELECT id,terminal_id,opening_cash_cents,status FROM cash_sessions WHERE status='open'").get();
   assert.equal(current.id,'session-antiga');
   assert.equal(current.terminal_id,'terminal-loja-existente');
   assert.equal(current.opening_cash_cents,12345);
   migrateAccess(db,'terminal-loja-existente');
   assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cash_sessions').get().n,1);
 }finally{db.close();}
});
