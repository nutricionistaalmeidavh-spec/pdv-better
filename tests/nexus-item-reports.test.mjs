import test from 'node:test';
import assert from 'node:assert/strict';
import { createNexusParityFixture } from './fixtures/nexus-parity.mjs';

test('NEX-REP-01: descontos em centavos conciliam entre itens sem duplicar pagamentos mistos',()=>{
 const f=createNexusParityFixture();
 try{
  const db=f.store;
  db.openSession({openingCashCents:0});
  db.checkout({key:'report-mixed',items:[{id:f.unit.id,quantityMilli:1000},{id:f.weight.id,quantityMilli:350}],discountCents:10,payments:[{method:'pix',amountCents:500},{method:'cash',amountCents:1055}]});
  const report=db.reportItems();
  assert.equal(report.rows.length,2);
  assert.equal(report.rows.reduce((s,x)=>s+x.net_cents,0),1555);
  assert.equal(report.rows.reduce((s,x)=>s+x.discount_cents,0),10);
  assert.ok(report.rows.every(r=>r.payment_method==='mixed_unallocated'));
  assert.equal(db.report().sales_total_cents,1555);
 }finally{f.cleanup();}
});

test('NEX-REP-02: filtro por SKU e periodo nao inventa atribuicao de pagamento',()=>{
 const f=createNexusParityFixture();
 try{
  const db=f.store;
  db.openSession({openingCashCents:0});
  db.checkout({key:'report-single',items:[{id:f.unit.id,quantityMilli:1000}],payments:[{method:'pix',amountCents:1250}]});
  assert.equal(db.reportItems({productId:f.unit.id}).rows.length,1);
  assert.equal(db.reportItems({productId:f.weight.id}).rows.length,0);
  assert.equal(db.reportItems({from:'2099-01-01'}).rows.length,0);
  assert.equal(db.reportItems().rows[0].payment_method,'pix');
 }finally{f.cleanup();}
});

test('NEX-REP-03: cancelamento permanece consultavel, mas nao soma faturamento',()=>{
 const f=createNexusParityFixture();
 try{
  const db=f.store; db.openSession({openingCashCents:0});
  const s=db.checkout({key:'report-cancel',items:[{id:f.unit.id,quantityMilli:1000}],payments:[{method:'cash',amountCents:1250}]});
  db.cancelSale(s.id);
  assert.equal(db.reportItems().rows.length,0);
  const cancelled=db.reportItems({status:'cancelled'});
  assert.equal(cancelled.rows.length,1);
  assert.equal(cancelled.rows[0].status,'cancelled');
  assert.equal(db.report().sales_total_cents,0);
 }finally{f.cleanup();}
});
