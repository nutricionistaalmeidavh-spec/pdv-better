import test from 'node:test';
import assert from 'node:assert/strict';
import { openCatalog } from '../electron/db.mjs';
import { normalizePayments } from '../shared/commerce.mjs';
test('dinheiro com troco e cartão manual usam cálculo canônico',()=>{
  assert.equal(normalizePayments([{method:'cash',amountCents:500}],350).change_cents,150);
  assert.throws(()=>normalizePayments([{method:'card',amountCents:500}],350),/excede/);
});
test('venda persiste uma vez, desconta estoque uma vez, rejeita saldo insuficiente',()=>{
  const db=openCatalog(':memory:');
  try{
    const p=db.save('products',{name:'Água',unit:'UN',sale_price_cents:'3,50',stock_milli:'2'});
    db.openSession({openingCashCents:0});
    const sale={key:'glass-sale-regression',items:[{id:p.id,quantityMilli:1000}],payments:[{method:'cash',amountCents:500}]};
    const result=db.checkout(sale);
    assert.equal(result.change_cents,150);
    assert.equal(db.checkout(sale).id,result.id);
    assert.equal(db.list('products')[0].stock_milli,1000);
    assert.equal(db.listSales().length,1);
    assert.throws(()=>db.checkout({...sale,key:'other-key',items:[{id:p.id,quantityMilli:2000}]}),/Estoque insuficiente/);
    assert.equal(db.listSales().length,1);
  }finally{db.close();}
});
