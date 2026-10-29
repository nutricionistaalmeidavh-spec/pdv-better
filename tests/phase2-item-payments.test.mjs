import test from 'node:test';
import assert from 'node:assert/strict';
import {createNexusParityFixture} from './fixtures/nexus-parity.mjs';

test('PAY-PROD-01: dois produtos com pix e dinheiro conciliam exatamente por item',()=>{
 const f=createNexusParityFixture();
 try{
  const db=f.store;db.openSession({openingCashCents:0});
  const sale=db.checkout({key:'pprd-a',
   items:[{id:f.unit.id,quantityMilli:1000},{id:f.weight.id,quantityMilli:350}],
   discountCents:10,payments:[{method:'pix',amountCents:1242},{method:'cash',amountCents:313}],
   itemPayments:[{productId:f.unit.id,method:'pix',amountCents:1242},{productId:f.weight.id,method:'cash',amountCents:313}]});
  assert.equal(sale.total_cents,1555);
  assert.equal(sale.item_payments.reduce((sum,r)=>sum+r.amount_cents,0),1555);
  const rows=db.reportItems().rows;
  assert.equal(rows.length,2);
  assert.equal(rows.find(r=>r.product_id===f.unit.id).payment_method,'pix');
  assert.equal(rows.find(r=>r.product_id===f.weight.id).payment_method,'cash');
  assert.equal(rows.reduce((sum,r)=>sum+r.net_cents,0),1555);
  assert.equal(db.checkout({key:'pprd-a',items:[{id:f.unit.id,quantityMilli:1000},{id:f.weight.id,quantityMilli:350}],discountCents:10,
    payments:[{method:'pix',amountCents:1242},{method:'cash',amountCents:313}],
    itemPayments:[{productId:f.unit.id,method:'pix',amountCents:1242},{productId:f.weight.id,method:'cash',amountCents:313}]}).id,sale.id);
 }finally{f.cleanup();}
});
test('PAY-PROD-02: pagamento informado por produto diverge do total; venda deve falhar sem side effects',()=>{
 const f=createNexusParityFixture();
 try{
  const db=f.store;db.openSession({openingCashCents:0});
  const input={key:'pprd-wrong',items:[{id:f.unit.id,quantityMilli:1000},{id:f.weight.id,quantityMilli:350}],
    payments:[{method:'pix',amountCents:1250},{method:'cash',amountCents:315}],
    itemPayments:[{productId:f.unit.id,method:'pix',amountCents:1249},{productId:f.weight.id,method:'cash',amountCents:316}]};
  assert.throws(()=>db.checkout(input),/pagamento|atribui|concilia/i);
  assert.equal(db.listSales().length,0);
  assert.equal(db.list('products').find(p=>p.id===f.unit.id).stock_milli,6000);
  assert.equal(db.getCurrentSession().movements.length,0);
 }finally{f.cleanup();}
});
test('PAY-PROD-03: método desconhecido e item estranho são bloqueados; misto sem alocação continua não atribuído',()=>{
 const f=createNexusParityFixture();
 try{
  const db=f.store;db.openSession({openingCashCents:0});
  const base={items:[{id:f.unit.id,quantityMilli:1000}],payments:[{method:'pix',amountCents:1250}]};
  assert.throws(()=>db.checkout({...base,key:'unknown',itemPayments:[{productId:'sku-falso',method:'pix',amountCents:1250}]}),/produto|item/i);
  assert.throws(()=>db.checkout({...base,key:'badmethod',itemPayments:[{productId:f.unit.id,method:'transfer',amountCents:1250}]}),/pagamento|método|forma/i);
  db.checkout({...base,key:'legacy'});
  assert.equal(db.reportItems().rows[0].payment_method,'pix');
 }finally{f.cleanup();}
});
