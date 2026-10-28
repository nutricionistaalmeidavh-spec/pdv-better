import test from 'node:test';
import assert from 'node:assert/strict';
import { openCatalog } from '../electron/db.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('new database migrates to v2 with sales tables',()=>{
 const db=openCatalog(':memory:');
 try {
  const p=db.save('products',{name:'Água',unit:'UN',sale_price_cents:'3,50',stock_milli:'2'});
  const id='00000000-0000-4000-8000-000000000011';
  const sale=db.completeSale({id,items:[{id:p.id,quantityMilli:1000}],method:'cash',tenderedCents:500});
  const receipt=db.saleDetail(id);
  assert.equal(receipt.total_cents,350);
  assert.equal(receipt.change_cents,150);
  assert.equal(receipt.items[0].name,'Água');
  assert.equal(receipt.items[0].line_total_cents,350);
  assert.equal(db.salesList().length,1);
  assert.equal(db.completeSale({id,items:[{id:p.id,quantityMilli:1000}],method:'cash',tenderedCents:500}).id,id);
  assert.equal(db.list('products')[0].stock_milli,1000);
 } finally {db.close();}
});
test('v1 database upgrades in place without losing products',()=>{
 const dir=mkdtempSync(join(tmpdir(),'pdv-upgrade-'));const path=join(dir,'db.sqlite');
 try {
  let db=openCatalog(path);
  const p=db.save('products',{name:'Café',unit:'UN',sale_price_cents:'5',stock_milli:'3'});
  db.close();
  const raw=new DatabaseSync(path);raw.exec('DROP TABLE sale_items; DROP TABLE sales; PRAGMA user_version=1');raw.close();
  db=openCatalog(path);
  try {assert.equal(db.list('products')[0].id,p.id);assert.deepEqual(db.salesList(),[]);}finally{db.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('receipt lookup validates ids and missing sale',()=>{
 const db=openCatalog(':memory:');
 try {assert.throws(()=>db.saleDetail('../bad'),/inválida/);assert.throws(()=>db.saleDetail('00000000-0000-4000-8000-000000000099'),/não encontrada/);}finally{db.close();}
});
