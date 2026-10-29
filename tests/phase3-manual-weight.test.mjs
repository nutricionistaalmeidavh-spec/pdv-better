import test from 'node:test';
import assert from 'node:assert/strict';
import {applyManualWeight} from '../shared/manual-weight.mjs';
test('KG-MAN-01: 350g manuais atualizam apenas KG e preservam lote',()=>{
 const cart=[{id:'a',unit:'KG',priceCents:900,quantityMilli:1000,batchId:'lote-1'},{id:'b',unit:'UN',priceCents:1250,quantityMilli:1000}];
 const next=applyManualWeight(cart,'a','0,350');
 assert.equal(next[0].quantityMilli,350);
 assert.equal(next[0].batchId,'lote-1');
 assert.equal(next[1].quantityMilli,1000);
});
test('KG-MAN-02: peso zero, unidade fracionada e mais de tres casas são inválidos',()=>{
 const cart=[{id:'a',unit:'KG',priceCents:900,quantityMilli:1000},{id:'b',unit:'UN',priceCents:1250,quantityMilli:1000}];
 for(const weight of ['0','-1','1,2345','abc'])assert.throws(()=>applyManualWeight(cart,'a',weight),/peso|quantidade|inválid|positivo/i);
 assert.throws(()=>applyManualWeight(cart,'b','0,350'),/KG|pesagem|unidade/i);
});
