import test from 'node:test';
import assert from 'node:assert/strict';
import { openCatalog } from '../electron/db.mjs';
import { normalizeSale,calculatePayment } from '../shared/sales.mjs';
const id='00000000-0000-4000-8000-000000000001';
test('cash change and manual card require exact payment',()=>{
 assert.deepEqual(calculatePayment([{priceCents:350,quantityMilli:1000}],'cash',500),{totalCents:350,changeCents:150});
 assert.throws(()=>calculatePayment([{priceCents:350,quantityMilli:1000}],'credit_manual',500),/exato/);
 assert.throws(()=>normalizeSale({id,items:[],method:'cash',tenderedCents:0}),/sem itens/);
});
test('sale persists once, decrements stock once and rejects insufficient stock',()=>{
 const db=openCatalog(':memory:');
 try {
  const p=db.save('products',{name:'Água',unit:'UN',sale_price_cents:'3,50',stock_milli:'2'});
  const sale={id,items:[{id:p.id,quantityMilli:1000}],method:'cash',tenderedCents:500};
  assert.equal(db.completeSale(sale).change_cents,150);
  assert.equal(db.completeSale(sale).id,id);
  assert.equal(db.list('products')[0].stock_milli,1000);
  assert.equal(db.salesList().length,1);
  assert.throws(()=>db.completeSale({...sale,id:'00000000-0000-4000-8000-000000000002',items:[{id:p.id,quantityMilli:2000}]}),/Estoque insuficiente/);
  assert.equal(db.salesList().length,1);
 } finally {db.close();}
});
