import test from 'node:test';
import assert from 'node:assert/strict';
import {createNexusParityFixture} from './fixtures/nexus-parity.mjs';

test('TRAIN-01: treinamento persiste no histórico mas não movimenta estoque, caixa ou faturamento',()=>{
 const f=createNexusParityFixture();
 try{
  const db=f.store;db.openSession({openingCashCents:1500});
  const original=db.list('products').find(p=>p.id===f.unit.id).stock_milli;
  const s=db.checkout({key:'training-A',training:true,items:[{id:f.unit.id,quantityMilli:1000}],
    payments:[{method:'pix',amountCents:1250}]},{role:'Gerente',terminalId:'caixa-a'});
  assert.equal(s.is_training,1);
  assert.equal(db.listSales().length,1);
  assert.equal(db.list('products').find(p=>p.id===f.unit.id).stock_milli,original);
  assert.equal(db.getCurrentSession().expected_cash_cents,1500);
  assert.equal(db.report().sales_total_cents,0);
  assert.equal(db.report().sales_count,0);
  assert.equal(db.reportItems().rows.length,0);
  assert.equal(db.reportItems({training:'only'}).rows.length,1);
  assert.equal(db.reportItems({training:'only'}).summary.net_total_cents,0);
  assert.equal(db.listStockMovements(f.unit.id).filter(m=>m.sale_id===s.id).length,0);
 }finally{f.cleanup();}
});
test('TRAIN-02: cancelamento de simulação não estorna estoque ou caixa e é irrepetível',()=>{
 const f=createNexusParityFixture();
 try{
  const db=f.store;db.openSession({openingCashCents:0});
  const s=db.checkout({key:'training-B',training:true,items:[{id:f.unit.id,quantityMilli:1000}],
    payments:[{method:'cash',amountCents:2000}]},{role:'Administrador',terminalId:'caixa-a'});
  assert.equal(db.cancelSale(s.id).status,'cancelled');
  assert.throws(()=>db.cancelSale(s.id),/cancelada/i);
  assert.equal(db.listStockMovements(f.unit.id).filter(m=>m.sale_id===s.id).length,0);
  assert.equal(db.report().cancelled_count,0);
  assert.equal(db.list('products').find(p=>p.id===f.unit.id).stock_milli,6000);
 }finally{f.cleanup();}
});
test('TRAIN-03: Caixa não pode criar simulação e treinamento fiado não cria conta a receber',()=>{
 const f=createNexusParityFixture();
 try{
  const db=f.store;db.openSession({openingCashCents:0});
  const input={key:'training-C',training:true,items:[{id:f.unit.id,quantityMilli:1000}],
    payments:[{method:'credit',amountCents:1250}],customerId:f.customer.id};
  assert.throws(()=>db.checkout(input,{role:'Caixa',terminalId:'caixa-a'}),/permissão|gerente|administrador/i);
  const saved=db.checkout(input,{role:'Gerente',terminalId:'caixa-a'});
  assert.equal(saved.is_training,1);
  assert.equal(db.listFinance().length,0);
  assert.equal(db.report().receivables_open_cents,0);
 }finally{f.cleanup();}
});
