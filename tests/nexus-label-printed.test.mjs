import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createBatchLabel,buildLabeledSaleItems} from '../shared/batch-label.mjs';
const require=createRequire(import.meta.url);
const {renderPhysicalBatchLabel}=require('../electron/physical-label.cjs');
test('LABEL-03: etiqueta gerada em Code128 possui SVG e texto legivel sem HTML executavel',()=>{
 const product={id:'p',code:'SKU-12',name:'Produto <script>malicioso</script>'};
 const batch={id:'b',product_id:'p',code:'VAL-1',expires_on:'2099-12-31'};
 const payload=createBatchLabel(product.code,batch.code);
 const html=renderPhysicalBatchLabel({payload,product,batch});
 assert.match(html,/<svg[\s>]/);
 assert.match(html,/SKU-12/);
 assert.match(html,/PDVLOT1\|SKU-12\|VAL-1/);
 assert.ok(!html.includes('<script>'));
 assert.match(html,/&lt;script&gt;/);
 assert.throws(()=>renderPhysicalBatchLabel({payload,product,batch:{...batch,product_id:'wrong'}}),/inconsistente/i);
});
test('LABEL-04: cotacao e confirmacao compartilham o lote escaneado',()=>{
 const cart=[{id:'prod',quantityMilli:1000}];
 const items=buildLabeledSaleItems(cart,{prod:'batch-exato'});
 assert.deepEqual(items,[{id:'prod',quantityMilli:1000,batchId:'batch-exato'}]);
 assert.equal(buildLabeledSaleItems(cart,{})[0].batchId,null);
 assert.equal(buildLabeledSaleItems([{...cart[0],batchId:'lote-escaneado'}],{})[0].batchId,'lote-escaneado');
 assert.equal(buildLabeledSaleItems([{...cart[0],batchId:'lote-escaneado'}],{prod:''})[0].batchId,null);
});
