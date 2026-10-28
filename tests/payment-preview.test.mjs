import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentPreview } from '../shared/payment-preview.mjs';

test('pagamento exato por Pix habilita confirmação sem troco',()=>{
 const x=paymentPreview(2500,[{method:'pix',amount:'25,00'}]);
 assert.equal(x.canSubmit,true);
 assert.equal(x.remainingCents,0);
 assert.equal(x.changeCents,0);
});
test('dinheiro recebido acima do total mostra troco real',()=>{
 const x=paymentPreview(2500,[{method:'cash',amount:'30,00'}]);
 assert.equal(x.canSubmit,true);
 assert.equal(x.changeCents,500);
 assert.equal(x.remainingCents,0);
});
test('pagamento dividido indica saldo restante até completar',()=>{
 const x=paymentPreview(2500,[{method:'pix',amount:'10,00'},{method:'cash',amount:'0,00'}]);
 assert.equal(x.canSubmit,false);
 assert.equal(x.remainingCents,1500);
 const y=paymentPreview(2500,[{method:'pix',amount:'10,00'},{method:'cash',amount:'20,00'}]);
 assert.equal(y.canSubmit,true);
 assert.equal(y.changeCents,500);
});
test('não permite valor excedente em cartão ou forma inválida',()=>{
 const x=paymentPreview(2500,[{method:'card',amount:'30,00'}]);
 assert.equal(x.canSubmit,false);
 assert.match(x.error,/excede/i);
 const y=paymentPreview(2500,[{method:'cash',amount:'abc'}]);
 assert.equal(y.canSubmit,false);
 assert.match(y.error,/pagamento/i);
});
test('não permite pagamento duplicado nem zero',()=>{
 const duplicate=paymentPreview(2500,[{method:'pix',amount:'10,00'},{method:'pix',amount:'15,00'}]);
 assert.equal(duplicate.canSubmit,false);
 const zero=paymentPreview(2500,[{method:'cash',amount:'0,00'}]);
 assert.equal(zero.canSubmit,false);
 assert.equal(zero.remainingCents,2500);
});
