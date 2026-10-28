import test from 'node:test';
import assert from 'node:assert/strict';
import { openCatalog } from '../electron/db.mjs';
test('comprovante canônico preserva produtos, troco e formas de pagamento',()=>{
  const db=openCatalog(':memory:');
  try {
    const p=db.save('products',{name:'Água',unit:'UN',sale_price_cents:'3,50',stock_milli:'2'});
    db.openSession({openingCashCents:0});
    const input={key:'receipt-test',items:[{id:p.id,quantityMilli:1000}],payments:[{method:'cash',amountCents:500}]};
    const sale=db.checkout(input),receipt=db.getSale(sale.id);
    assert.equal(receipt.total_cents,350);assert.equal(receipt.change_cents,150);
    assert.equal(receipt.items[0].name,'Água');assert.equal(receipt.items[0].line_total_cents,350);
    assert.equal(receipt.payments[0].amount_cents,350);
    assert.equal(db.checkout(input).id,sale.id);
    assert.equal(db.list('products')[0].stock_milli,1000);
  }finally{db.close();}
});
test('consulta de venda inexistente informa erro',()=>{
  const db=openCatalog(':memory:');
  try{assert.throws(()=>db.getSale('00000000-0000-4000-8000-000000000099'),/não encontrada/);}
  finally{db.close();}
});
