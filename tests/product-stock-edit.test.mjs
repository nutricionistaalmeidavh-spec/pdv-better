import test from 'node:test';
import assert from 'node:assert/strict';
import {openCatalog} from '../electron/db.mjs';

function fixture(t,unit='UN'){
 const db=openCatalog(':memory:'); t.after(()=>db.close());
 const product=db.save('products',{name:'Produto',code:'EDIT-1',unit,sale_price_cents:1000,stock_milli:10000});
 const edit=(stock,expected=10000,reason='Recebimento')=>db.save('products',{...product,stock_milli:stock,stockEdit:{expectedMilli:expected,reason}});
 return {db,product,edit};
}
test('cadastro permite repor e reduzir saldo, com movimentos auditáveis',t=>{
 const {db,product,edit}=fixture(t);
 assert.equal(edit(17000).stock_milli,17000);
 assert.equal(edit(13000,17000,'Perda / avaria').stock_milli,13000);
 const movements=db.listStockMovements(product.id);
 assert.equal(movements.length,3);
 assert.deepEqual(movements.map(m=>m.delta_milli),[-4000,7000,10000]);
 assert.match(movements[1].reason,/Recebimento/);
 assert.match(movements[0].reason,/Perda/);
 assert.ok(movements[0].created_at);
});
test('motivo obrigatório, unidade inteira e saldo não negativo',t=>{
 const {db,product,edit}=fixture(t);
 assert.throws(()=>edit(12000,10000,' '),/motivo/i);
 assert.throws(()=>edit(10500),/inteira/i);
 assert.throws(()=>edit(-1000));
 assert.equal(db.listStockMovements(product.id).length,1);
});
test('edição concorrente não sobrescreve movimento posterior; edição sem mudança preserva saldo',t=>{
 const {db,product,edit}=fixture(t);
 db.moveStock({productId:product.id,kind:'receipt',quantityMilli:2000,reason:'Outra entrada'});
 assert.throws(()=>edit(15000),/saldo.*(mudou|alterado)/i);
 assert.equal(edit(10000,10000,'').stock_milli,12000);
 assert.equal(db.listStockMovements(product.id).length,2);
});
test('alterar apenas preço não gera movimento',t=>{
 const {db,product}=fixture(t);
 const updated=db.save('products',{...product,sale_price_cents:1200,stockEdit:{expectedMilli:10000,reason:''}});
 assert.equal(updated.sale_price_cents,1200);
 assert.equal(db.listStockMovements(product.id).length,1);
});
test('produto KG aceita saldo fracionário',t=>{
 const {edit}=fixture(t,'KG');
 assert.equal(edit(10500).stock_milli,10500);
});
