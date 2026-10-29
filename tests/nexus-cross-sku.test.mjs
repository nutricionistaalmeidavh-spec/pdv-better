import test from 'node:test';
import assert from 'node:assert/strict';
import {createNexusParityFixture} from './fixtures/nexus-parity.mjs';

test('CROSS-01: combo de SKUs distintos cobra menor valor, persiste desconto e baixa estoque',()=>{
 const f=createNexusParityFixture();
 try{
  const db=f.store;
  const group=db.setBundlePromotion({name:'Café e tomate',items:[{productId:f.unit.id,quantityMilli:1000},{productId:f.weight.id,quantityMilli:1000}],bundlePriceCents:1900});
  assert.equal(group.items.length,2);
  db.openSession({openingCashCents:0});
  const quote=db.quoteSale({items:[{id:f.unit.id,quantityMilli:1000},{id:f.weight.id,quantityMilli:1000}]});
  assert.equal(quote.subtotal_cents,2150);
  assert.equal(quote.promotion_discount_cents,250);
  assert.equal(quote.total_cents,1900);
  const sale=db.checkout({key:'cross-01',items:[{id:f.unit.id,quantityMilli:1000},{id:f.weight.id,quantityMilli:1000}],payments:[{method:'pix',amountCents:1900}]});
  assert.equal(sale.total_cents,quote.total_cents);
  assert.equal(sale.items.reduce((n,x)=>n+x.promotion_discount_cents,0),250);
  assert.equal(db.reportItems().rows.reduce((n,x)=>n+x.net_cents,0),1900);
  assert.equal(db.list('products').find(x=>x.id===f.unit.id).stock_milli,5000);
 }finally{f.cleanup();}
});

test('CROSS-02: combo misto é repetível e não substitui desconto individual melhor',()=>{
 const f=createNexusParityFixture();
 try{
  const db=f.store;
  db.setPromotion({productId:f.unit.id,quantityMilli:2000,bundlePriceCents:1900});
  db.setBundlePromotion({name:'Dois SKUs',items:[{productId:f.unit.id,quantityMilli:1000},{productId:f.weight.id,quantityMilli:1000}],bundlePriceCents:1800});
  const both=db.quoteSale({items:[{id:f.unit.id,quantityMilli:2000},{id:f.weight.id,quantityMilli:2000}]});
  assert.equal(both.total_cents,3600);
  const single=db.quoteSale({items:[{id:f.unit.id,quantityMilli:2000}]});
  assert.equal(single.total_cents,1900);
  assert.equal(db.listBundlePromotions().length,1);
 }finally{f.cleanup();}
});

test('CROSS-03: rejeita itens duplicados, inexistentes, desconto acima do valor e uma só SKU',()=>{
 const f=createNexusParityFixture();
 try{
  const base={name:'Combinado QA',items:[{productId:f.unit.id,quantityMilli:1000},{productId:f.weight.id,quantityMilli:1000}]};
  assert.throws(()=>f.store.setBundlePromotion({...base,items:[base.items[0],base.items[0]],bundlePriceCents:1000}),/diferent|duplicad/i);
  assert.throws(()=>f.store.setBundlePromotion({...base,items:[base.items[0]],bundlePriceCents:1000}),/duas|dois|distint/i);
  assert.throws(()=>f.store.setBundlePromotion({...base,bundlePriceCents:99999}),/preço|maior|total/i);
  assert.throws(()=>f.store.setBundlePromotion({...base,items:[base.items[0],{productId:'nao-existe',quantityMilli:1000}],bundlePriceCents:1000}),/produto|inexistente/i);
 }finally{f.cleanup();}
});

test('CROSS-04: upgrade v5-v6 preserva produtos e movimentos e nao replica tabelas',async()=>{
 const {DatabaseSync}=await import('node:sqlite');
 const {createCommerce}=await import('../electron/commerce.mjs');
 const {migrateAccess}=await import('../electron/access.mjs');
 const {migrateNexusFeatures}=await import('../electron/nexus-features.mjs');
 const {migrateCrossSku}=await import('../electron/cross-sku.mjs');
 const db=new DatabaseSync(':memory:');
 try{
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE products(id TEXT PRIMARY KEY,stock_milli INTEGER NOT NULL); CREATE TABLE operators(id TEXT PRIMARY KEY,name TEXT,role TEXT,active INTEGER NOT NULL); PRAGMA user_version=1;");
  db.prepare('INSERT INTO products(id,stock_milli) VALUES(?,?)').run('sku-legado',4000);
  createCommerce(db);migrateAccess(db,'terminal-legado');migrateNexusFeatures(db);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,5);
  migrateCrossSku(db);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,6);
  migrateCrossSku(db);
  assert.equal(db.prepare('SELECT stock_milli FROM products WHERE id=?').get('sku-legado').stock_milli,4000);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stock_movements').get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='bundle_promotions'").get().n,1);
 }finally{db.close();}
});
