import test from 'node:test';
import assert from 'node:assert/strict';
import {createBatchLabel,resolveBatchScan} from '../shared/batch-label.mjs';
import {createNexusParityFixture} from './fixtures/nexus-parity.mjs';

test('LABEL-01: scanner HID entrega Code128/Enter e seleciona SKU e lote exatos',()=>{
 const f=createNexusParityFixture();
 try{
  const a=f.store.receiveBatch({productId:f.unit.id,code:'LOTE-A',expiresOn:'2099-01-01',quantityMilli:1000});
  const b=f.store.receiveBatch({productId:f.unit.id,code:'LOTE-B',expiresOn:'2099-07-01',quantityMilli:1000});
  const payload=createBatchLabel(f.unit.code,'LOTE-B');
  const scanned=resolveBatchScan(payload+'\n',f.store.list('products'),f.store.listBatches());
  assert.equal(scanned.product.id,f.unit.id);
  assert.equal(scanned.batch.id,b.id);
  assert.notEqual(scanned.batch.id,a.id);
  f.store.openSession({openingCashCents:0});
  const sale=f.store.checkout({key:'label-b',items:[{id:scanned.product.id,quantityMilli:1000,batchId:scanned.batch.id}],payments:[{method:'cash',amountCents:1250}]});
  assert.equal(sale.batch_allocations[0].batch_id,b.id);
 }finally{f.cleanup();}
});

test('LABEL-02: etiqueta falsa, vencida ou sem lote nunca cai no FEFO sem avisar',()=>{
 const f=createNexusParityFixture();
 try{
  const p=f.unit,products=f.store.list('products');
  f.store.receiveBatch({productId:p.id,code:'EXPIRED',expiresOn:'2001-01-01',quantityMilli:1000});
  assert.throws(()=>resolveBatchScan(createBatchLabel(p.code,'NAO-EXISTE'),products,f.store.listBatches()),/lote|não encontrad/i);
  assert.throws(()=>resolveBatchScan(createBatchLabel(p.code,'EXPIRED'),products,f.store.listBatches()),/vencid/i);
  assert.throws(()=>resolveBatchScan('PDVLOT1|bad',products,f.store.listBatches()),/etiqueta|inválid/i);
  assert.equal(resolveBatchScan('QA-PARITY-001',products,f.store.listBatches()),null);
 }finally{f.cleanup();}
});
