import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCatalog } from '../electron/db.mjs';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'better-b-'));
  const filename = join(dir, 'pdv.sqlite');
  const store = openCatalog(filename);
  const customer = store.save('customers', {name:'Cliente B'});
  const product = store.save('products', {name:'Café',code:'A-1',unit:'UN',sale_price_cents:'12,50',cost_price_cents:'6,00',stock_milli:'10'});
  return {store,filename,customer,product,cleanup:()=>{store.close();rmSync(dir,{recursive:true,force:true});}};
}
test('turno exige abertura única, registra venda com Pix e dinheiro e calcula troco exato', () => {
  const t=fixture();try {
    assert.throws(()=>t.store.checkout({key:'k1',items:[{id:t.product.id,quantityMilli:1000}],payments:[{method:'cash',amountCents:1250}]}),/caixa aberto/i);
    const session=t.store.openSession({openingCashCents:'50,00'});
    assert.equal(session.opening_cash_cents,5000);
    assert.throws(()=>t.store.openSession({openingCashCents:'0'}),/aberto/i);
    const sale=t.store.checkout({key:'k1',items:[{id:t.product.id,quantityMilli:2000}],payments:[{method:'pix',amountCents:1000},{method:'cash',amountCents:2000}]});
    assert.equal(sale.subtotal_cents,2500);assert.equal(sale.total_cents,2500);assert.equal(sale.change_cents,500);
    assert.equal(sale.payments.find(x=>x.method==='cash').amount_cents,1500);
    assert.equal(t.store.list('products')[0].stock_milli,8000);
    assert.equal(t.store.getCurrentSession().expected_cash_cents,6500);
    assert.equal(t.store.checkout({key:'k1',items:[{id:t.product.id,quantityMilli:2000}],payments:[{method:'pix',amountCents:1000},{method:'cash',amountCents:2000}]}).id,sale.id);
    assert.equal(t.store.list('products')[0].stock_milli,8000);
  }finally{t.cleanup();}
});
test('estoque insuficiente e pagamento incorreto revertem a transação inteira',()=>{
  const t=fixture();try{
    t.store.openSession({openingCashCents:0});
    const base={key:'bad',items:[{id:t.product.id,quantityMilli:11000}],payments:[{method:'cash',amountCents:20000}]};
    assert.throws(()=>t.store.checkout(base),/estoque insuficiente/i);
    assert.equal(t.store.list('products')[0].stock_milli,10000);
    assert.equal(t.store.listSales().length,0);
    assert.throws(()=>t.store.checkout({...base,items:[{id:t.product.id,quantityMilli:1000}],payments:[{method:'pix',amountCents:100}]}),/pagamento|total/i);
    assert.equal(t.store.listSales().length,0);
  }finally{t.cleanup();}
});
test('fiado recebido concilia caixa e bloqueia cancelamento sem estorno prévio',()=>{
  const t=fixture();try{
    t.store.openSession({openingCashCents:'10,00'});
    const sale=t.store.checkout({key:'credit',items:[{id:t.product.id,quantityMilli:1000}],customerId:t.customer.id,payments:[{method:'credit',amountCents:1250}]});
    const receive=t.store.listFinance().find(e=>e.sale_id===sale.id);
    assert.equal(receive.type,'receivable');assert.equal(receive.status,'open');
    assert.equal(t.store.getCurrentSession().expected_cash_cents,1000);
    t.store.settleFinance({id:receive.id,method:'cash'});
    assert.equal(t.store.getCurrentSession().expected_cash_cents,2250);
    assert.throws(()=>t.store.cancelSale(sale.id),/recebid[oa]|liquidad[oa]/i);
    assert.equal(t.store.list('products')[0].stock_milli,9000);
  }finally{t.cleanup();}
});
test('cancelar venda no turno devolve estoque e reverte efeitos financeiros locais',()=>{
  const t=fixture();try{
    t.store.openSession({openingCashCents:0});
    const sale=t.store.checkout({key:'refund',items:[{id:t.product.id,quantityMilli:1000}],payments:[{method:'cash',amountCents:1250}]});
    const result=t.store.cancelSale(sale.id);
    assert.equal(result.status,'cancelled');
    assert.equal(t.store.list('products')[0].stock_milli,10000);
    assert.equal(t.store.getCurrentSession().expected_cash_cents,0);
    assert.throws(()=>t.store.cancelSale(sale.id),/cancelada/i);
  }finally{t.cleanup();}
});
test('sangria, reforço e fechamento conferem o saldo previsto e bloqueiam venda fora do turno',()=>{
  const t=fixture();try{
    t.store.openSession({openingCashCents:'100,00'});
    t.store.moveCash({kind:'withdrawal',amountCents:'20,00',note:'Sangria'});
    t.store.moveCash({kind:'reinforcement',amountCents:'10,00',note:'Troco'});
    const sale=t.store.checkout({key:'close',items:[{id:t.product.id,quantityMilli:1000}],payments:[{method:'cash',amountCents:1250}]});
    assert.equal(t.store.getCurrentSession().expected_cash_cents,10250);
    const closed=t.store.closeSession({countedCashCents:'100,00'});
    assert.equal(closed.difference_cents,-250);assert.equal(closed.status,'closed');
    assert.equal(t.store.getCurrentSession(),null);
    assert.throws(()=>t.store.checkout({key:'other',items:[{id:t.product.id,quantityMilli:1000}],payments:[{method:'cash',amountCents:1250}]}),/caixa aberto/i);
  }finally{t.cleanup();}
});
test('ajustes e entradas de estoque são auditáveis e o cadastro não pode sobrescrever saldo',()=>{
  const t=fixture();try{
    assert.throws(()=>t.store.save('products',{...t.product,stock_milli:'500'}),/estoque|movimenta/i);
    t.store.moveStock({productId:t.product.id,kind:'receipt',quantityMilli:3000,reason:'Compra fornecedor'});
    assert.equal(t.store.list('products')[0].stock_milli,13000);
    t.store.moveStock({productId:t.product.id,kind:'adjustment',quantityMilli:-1000,reason:'Inventário'});
    assert.equal(t.store.list('products')[0].stock_milli,12000);
    assert.equal(t.store.listStockMovements(t.product.id).reduce((a,b)=>a+b.delta_milli,0),12000);
  }finally{t.cleanup();}
});
test('contas a pagar e receber têm liquidação auditável e resumo reconciliado',()=>{
  const t=fixture();try{
    t.store.openSession({openingCashCents:'200,00'});
    const payable=t.store.createFinance({type:'payable',description:'Energia',amountCents:'30,00',dueOn:'2026-11-01'});
    assert.equal(payable.status,'open');
    t.store.settleFinance({id:payable.id,method:'cash'});
    assert.equal(t.store.getCurrentSession().expected_cash_cents,17000);
    assert.equal(t.store.report().payables_paid_cents,3000);
    assert.throws(()=>t.store.settleFinance({id:payable.id,method:'cash'}),/liquidada/i);
  }finally{t.cleanup();}
});

test('migração de dados v1 registra saldo de abertura uma única vez',async()=>{
  const { DatabaseSync }=await import('node:sqlite');
  const { createCommerce }=await import('../electron/commerce.mjs');
  const db=new DatabaseSync(':memory:');
  try{
    db.exec("CREATE TABLE products(id TEXT PRIMARY KEY,stock_milli INTEGER NOT NULL); PRAGMA user_version=1;");
    db.prepare('INSERT INTO products(id,stock_milli) VALUES(?,?)').run('legacy',7000);
    createCommerce(db);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,3); // createCommerce isolado entrega v3; createAccess migra para v4
    assert.equal(db.prepare('SELECT SUM(delta_milli) AS quantity FROM stock_movements').get().quantity,7000);
    createCommerce(db);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stock_movements').get().n,1);
  } finally {db.close();}
});
test('idempotência rejeita reaproveitar a chave para outra venda',()=>{
  const t=fixture();try{
    t.store.openSession({openingCashCents:0});
    const input={key:'same',items:[{id:t.product.id,quantityMilli:1000}],payments:[{method:'cash',amountCents:1250}]};
    t.store.checkout(input);
    assert.throws(()=>t.store.checkout({...input,payments:[{method:'cash',amountCents:1300}]}),/reutilizado/i);
    assert.equal(t.store.listSales().length,1);
  } finally {t.cleanup();}
});
