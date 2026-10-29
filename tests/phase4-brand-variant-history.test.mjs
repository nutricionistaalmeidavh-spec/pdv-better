import test from 'node:test';
import assert from 'node:assert/strict';
import {createNexusParityFixture} from './fixtures/nexus-parity.mjs';
test('HIST-01: marca/produtor e grupo de variantes ficam no snapshot da venda depois de editar cadastro',()=>{
 const f=createNexusParityFixture();
 try{
  let db=f.store;
  db.save('products',{...f.unit,name:f.unit.name,code:f.unit.code,unit:'UN',sale_price_cents:'12,50',
   stock_milli:6000,brand:'Marca antiga',producer:'Produtor A',variant_group:'CAFES',variant_label:'250g'});
  db.openSession({openingCashCents:0});
  const sale=db.checkout({key:'brand-old',items:[{id:f.unit.id,quantityMilli:1000}],payments:[{method:'pix',amountCents:1250}]});
  const current=db.list('products').find(x=>x.id===f.unit.id);
  db.save('products',{...current,brand:'Marca nova',producer:'Produtor B',variant_label:'novo'});
  const old=db.reportItems({brand:'Marca antiga',producer:'Produtor A'}).rows;
  assert.equal(old.length,1);
  assert.equal(old[0].variant_group,'CAFES');
  assert.equal(db.reportItems({brand:'Marca nova'}).rows.length,0);
  assert.equal(db.getSale(sale.id).items[0].brand,'Marca antiga');
  db=f.reopen();
  assert.equal(db.reportItems({brand:'Marca antiga'}).rows.length,1);
 }finally{f.cleanup();}
});
test('HIST-02: SKUs variantes continuam estoque e precificação independentes',()=>{
 const f=createNexusParityFixture();
 try{
  const db=f.store;
  const a=db.save('products',{name:'Variação A',code:'V-A',unit:'UN',sale_price_cents:'5,00',stock_milli:'2',variant_group:'FAMILIA',variant_label:'A'});
  const b=db.save('products',{name:'Variação B',code:'V-B',unit:'UN',sale_price_cents:'9,00',stock_milli:'3',variant_group:'FAMILIA',variant_label:'B'});
  db.openSession({openingCashCents:0});
  db.checkout({key:'variant-a',items:[{id:a.id,quantityMilli:1000}],payments:[{method:'pix',amountCents:500}]});
  assert.equal(db.list('products').find(x=>x.id===a.id).stock_milli,1000);
  assert.equal(db.list('products').find(x=>x.id===b.id).stock_milli,3000);
  assert.equal(db.reportItems({variantGroup:'FAMILIA'}).rows.length,1);
 }finally{f.cleanup();}
});
