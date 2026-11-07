import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openCatalog} from '../electron/db.mjs';

function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'pdv-p0p1-'));
 const db=openCatalog(join(dir,'pdv.sqlite'),{terminalId:'terminal-1'});
 const supplier=db.save('suppliers',{name:'Fornecedor Teste'});
 const product=db.save('products',{name:'Arroz',code:'P001',unit:'UN',sale_price_cents:'12,50',cost_price_cents:'6,00',stock_milli:'10'});
 return {db,product,supplier,done(){db.close();rmSync(dir,{recursive:true,force:true});}};
}
test('P0: compra em rascunho não altera estoque e recebimento é atômico/idempotente',()=>{
 const f=fixture();try{
  const draft=f.db.createPurchase({supplierId:f.supplier.id,dueOn:'2026-12-01',documentRef:'NF-123',lines:[{productId:f.product.id,quantityMilli:2000,unitCostCents:500}]});
  assert.equal(draft.status,'draft');
  assert.equal(f.db.list('products')[0].stock_milli,10000);
  assert.equal(f.db.listFinance().length,0);
  const received=f.db.receivePurchase(draft.id);
  assert.equal(received.status,'received');
  assert.equal(f.db.list('products')[0].stock_milli,12000);
  assert.equal(f.db.list('products')[0].cost_price_cents,583);
  const payable=f.db.listFinance().find(x=>x.purchase_id===draft.id);
  assert.equal(payable.amount_cents,1000);
  assert.equal(payable.remaining_cents,1000);
  assert.throws(()=>f.db.receivePurchase(draft.id),/recebid|duplicad/i);
  assert.equal(f.db.list('products')[0].stock_milli,12000);
  assert.equal(f.db.listPurchases().length,1);
 }finally{f.done();}
});
test('P0: recebimento inválido não deixa estoque, custo nem contas parcialmente alterados',()=>{
 const f=fixture();try{
  const draft=f.db.createPurchase({supplierId:f.supplier.id,lines:[{productId:f.product.id,quantityMilli:1000,unitCostCents:700}]});
  f.db.archive('products',f.product.id);
  assert.throws(()=>f.db.receivePurchase(draft.id),/produto|inativ/i);
  assert.equal(f.db.listFinance().length,0);
  assert.equal(f.db.listPurchases()[0].status,'draft');
 }finally{f.done();}
});
test('P0: baixa parcial preserva saldo, registra histórico e não duplica caixa',()=>{
 const f=fixture();try{
  f.db.openSession({openingCashCents:5000});
  const entry=f.db.createFinance({type:'payable',description:'Conta',amountCents:1000});
  let s=f.db.settleFinance({id:entry.id,method:'cash',amountCents:400});
  assert.equal(s.status,'open');assert.equal(s.paid_cents,400);assert.equal(s.remaining_cents,600);
  assert.equal(f.db.getCurrentSession().expected_cash_cents,4600);
  assert.throws(()=>f.db.settleFinance({id:entry.id,method:'cash',amountCents:601}),/saldo|exced/i);
  assert.equal(f.db.getCurrentSession().expected_cash_cents,4600);
  s=f.db.settleFinance({id:entry.id,method:'cash',amountCents:600});
  assert.equal(s.status,'settled');assert.equal(s.remaining_cents,0);assert.equal(s.settlements.length,2);
  assert.equal(f.db.getCurrentSession().expected_cash_cents,4000);
  assert.equal(f.db.report().payables_paid_cents,1000);
 }finally{f.done();}
});
test('P0: cancelamento de venda fiada com recebimento parcial é bloqueado',()=>{
 const f=fixture();try{
  const c=f.db.save('customers',{name:'Cliente'});
  f.db.openSession({openingCashCents:0});
  const sale=f.db.checkout({key:'fiado-parcial',items:[{id:f.product.id,quantityMilli:1000}],payments:[{method:'credit',amountCents:1250}],customerId:c.id});
  const entry=f.db.listFinance().find(x=>x.sale_id===sale.id);
  f.db.settleFinance({id:entry.id,method:'pix',amountCents:300});
  assert.throws(()=>f.db.cancelSale(sale.id),/recebimento|liquidad/i);
  assert.equal(f.db.listFinance().find(x=>x.id===entry.id).remaining_cents,950);
 }finally{f.done();}
});
test('P0: fechamento cego confere Pix, débito e crédito separados e registra divergências',()=>{
 const f=fixture();try{
  f.db.openSession({openingCashCents:1500});
  f.db.checkout({key:'cartao-debito',items:[{id:f.product.id,quantityMilli:1000}],payments:[{method:'card_debit',amountCents:1250}]});
  f.db.checkout({key:'pix',items:[{id:f.product.id,quantityMilli:1000}],payments:[{method:'pix',amountCents:1250}]});
  const closed=f.db.closeSession({counts:{cash:1500,pix:1200,card_debit:1250,card_credit:0,card:0}});
  assert.equal(closed.difference_cents,0);
  const pix=closed.checks.find(x=>x.method==='pix');
  assert.equal(pix.expected_cents,1250);assert.equal(pix.difference_cents,-50);
  assert.equal(closed.checks.find(x=>x.method==='card_debit').difference_cents,0);
 }finally{f.done();}
});
test('P0: fechamento pelo IPC exige autenticação adicional de gerente',()=>{
 const f=fixture();try{
  const admin=f.db.authBootstrap({name:'Gestor',password:'GestorSeguro2026'},'terminal-1');
  const cashier=f.db.secureCall('save',['operators',{name:'Caixa',role:'Caixa'}],{sessionToken:admin.token,terminalId:'terminal-1'});
  f.db.secureCall('setPassword',[{operatorId:cashier.id,password:'SenhaCaixa2026'}],{sessionToken:admin.token,terminalId:'terminal-1'});
  const login=f.db.authLogin({operatorId:cashier.id,password:'SenhaCaixa2026'},'terminal-1');
  const ctx={sessionToken:login.token,terminalId:'terminal-1'};
  f.db.secureCall('openSession',[{openingCashCents:100}],ctx);
  assert.throws(()=>f.db.secureCall('closeSession',[{counts:{cash:100,pix:0,card:0,card_credit:0,card_debit:0}}],ctx),/gerent|autoriza|senha/i);
  assert.throws(()=>f.db.secureCall('closeSession',[{counts:{cash:100,pix:0,card:0,card_credit:0,card_debit:0},managerApproval:{operatorId:admin.user.id,password:'errada'}}],ctx),/gerent|credencia|senha/i);
  const closed=f.db.secureCall('closeSession',[{counts:{cash:100,pix:0,card:0,card_credit:0,card_debit:0},managerApproval:{operatorId:admin.user.id,password:'GestorSeguro2026'}}],ctx);
  assert.equal(closed.status,'closed');
 }finally{f.done();}
});
