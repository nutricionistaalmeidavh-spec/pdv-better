import test from 'node:test';
import assert from 'node:assert/strict';
import { createNexusParityFixture } from './fixtures/nexus-parity.mjs';
import { DatabaseSync } from 'node:sqlite';
import { createCommerce } from '../electron/commerce.mjs';
import { migrateAccess } from '../electron/access.mjs';
import { migrateNexusFeatures } from '../electron/nexus-features.mjs';

test('NEX-FEFO-01: lote com validade mais proxima sai primeiro e cancelamento restaura lote exato',()=>{
 const f=createNexusParityFixture();
 try{
   const db=f.store;
   const a=db.receiveBatch({productId:f.weight.id,code:'LOTE-A',expiresOn:'2099-01-01',quantityMilli:900});
   const b=db.receiveBatch({productId:f.weight.id,code:'LOTE-B',expiresOn:'2099-07-01',quantityMilli:800});
   db.openSession({openingCashCents:0});
   const sale=db.checkout({key:'fefo-a',items:[{id:f.weight.id,quantityMilli:1200}],payments:[{method:'pix',amountCents:1080}]});
   const used=db.getSale(sale.id).batch_allocations;
   assert.equal(used.length,2);
   assert.equal(used.find(x=>x.batch_id===a.id).quantity_milli,900);
   assert.equal(used.find(x=>x.batch_id===b.id).quantity_milli,300);
   assert.equal(db.listBatches(f.weight.id).find(x=>x.id===a.id).remaining_milli,0);
   assert.equal(db.cancelSale(sale.id).status,'cancelled');
   assert.equal(db.listBatches(f.weight.id).find(x=>x.id===a.id).remaining_milli,900);
   assert.equal(db.listBatches(f.weight.id).find(x=>x.id===b.id).remaining_milli,800);
 }finally{f.cleanup();}
});

test('NEX-FEFO-02: leitura de lote fisico B nunca troca pelo A com vencimento anterior',()=>{
 const f=createNexusParityFixture();
 try{
   const db=f.store;
   const a=db.receiveBatch({productId:f.unit.id,code:'A',expiresOn:'2099-01-01',quantityMilli:2000});
   const b=db.receiveBatch({productId:f.unit.id,code:'B',expiresOn:'2099-02-01',quantityMilli:1000});
   db.openSession({openingCashCents:0});
   const sale=db.checkout({key:'lote-fisico',items:[{id:f.unit.id,quantityMilli:1000,batchId:b.id}],payments:[{method:'cash',amountCents:1250}]});
   assert.equal(db.getSale(sale.id).batch_allocations[0].batch_id,b.id);
   assert.equal(db.listBatches(f.unit.id).find(x=>x.id===a.id).remaining_milli,2000);
   assert.equal(db.listBatches(f.unit.id).find(x=>x.id===b.id).remaining_milli,0);
   assert.throws(()=>db.checkout({key:'fisico-sem-saldo',items:[{id:f.unit.id,quantityMilli:1000,batchId:b.id}],payments:[{method:'cash',amountCents:1250}]}),/lote|saldo|estoque/i);
   assert.equal(db.listSales().length,1);
 }finally{f.cleanup();}
});

test('NEX-FEFO-03: lote vencido nao pode ser vendido nem substituido silenciosamente',()=>{
 const f=createNexusParityFixture();
 try{
   const db=f.store;
   const old=db.receiveBatch({productId:f.unit.id,code:'VENCIDO',expiresOn:'2001-01-01',quantityMilli:1000});
   db.openSession({openingCashCents:0});
   assert.throws(()=>db.checkout({key:'expired',items:[{id:f.unit.id,quantityMilli:1000,batchId:old.id}],payments:[{method:'pix',amountCents:1250}]}),/vencido|validade/i);
   assert.equal(db.listBatches(f.unit.id)[0].remaining_milli,1000);
   assert.equal(db.listSales().length,0);
 }finally{f.cleanup();}
});

test('NEX-FEFO-04: migrar banco com vendas nao altera saldo ou historico, e batch persiste em reabertura',()=>{
 const f=createNexusParityFixture();
 try{
   const db=f.store;
   const before=db.list('products').find(x=>x.id===f.unit.id).stock_milli;
   const batch=db.receiveBatch({productId:f.unit.id,code:'PERSISTENTE',expiresOn:'2099-11-30',quantityMilli:1000});
   const reopened=f.reopen();
   assert.equal(reopened.listBatches(f.unit.id)[0].id,batch.id);
   assert.equal(reopened.list('products').find(x=>x.id===f.unit.id).stock_milli,before+1000);
   assert.equal(reopened.listStockMovements(f.unit.id).reduce((sum,x)=>sum+x.delta_milli,0),before+1000);
 }finally{f.cleanup();}
});

test('NEX-FEFO-05: ajuste nao pode reduzir saldo global abaixo de lotes rastreados',()=>{
 const f=createNexusParityFixture();
 try{
  const db=f.store;
  db.receiveBatch({productId:f.weight.id,code:'RESERVA-FISICA',expiresOn:'2099-12-01',quantityMilli:900});
  const previous=db.list('products').find(x=>x.id===f.weight.id).stock_milli;
  assert.throws(()=>db.moveStock({productId:f.weight.id,kind:'adjustment',quantityMilli:-4300,reason:'Inventario inconsistente'}),/lote|rastreado|saldo/i);
  assert.equal(db.list('products').find(x=>x.id===f.weight.id).stock_milli,previous);
  assert.equal(db.listBatches(f.weight.id)[0].remaining_milli,900);
 }finally{f.cleanup();}
});

test('NEX-MIG-01: migracao real v4 para v5 e idempotente e preserva produtos',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE products(id TEXT PRIMARY KEY,stock_milli INTEGER NOT NULL); CREATE TABLE operators(id TEXT PRIMARY KEY,name TEXT,role TEXT,active INTEGER NOT NULL); PRAGMA user_version=1;");
  db.prepare('INSERT INTO products(id,stock_milli) VALUES(?,?)').run('old-sku',7000);
  createCommerce(db);
  migrateAccess(db,'loja-legada');
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,4);
  migrateNexusFeatures(db);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,5);
  assert.equal(db.prepare('SELECT stock_milli FROM products WHERE id=?').get('old-sku').stock_milli,7000);
  migrateNexusFeatures(db);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='product_batches'").get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='product_promotions'").get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stock_movements').get().n,1);
 }finally{db.close();}
});
