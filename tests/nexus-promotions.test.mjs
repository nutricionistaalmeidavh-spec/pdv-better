import test from 'node:test';
import assert from 'node:assert/strict';
import { createNexusParityFixture } from './fixtures/nexus-parity.mjs';

test('NEX-PROMO-01: combo 2 unidades por R$ 20 reduz preco de 3 unidades para R$ 32,50',()=>{
 const f=createNexusParityFixture();
 try{
   const db=f.store;
   db.setPromotion({productId:f.unit.id,quantityMilli:2000,bundlePriceCents:2000});
   const cart=[{id:f.unit.id,quantityMilli:3000}];
   const quote=db.quoteSale({items:cart});
   assert.equal(quote.subtotal_cents,3750);
   assert.equal(quote.promotion_discount_cents,500);
   assert.equal(quote.total_cents,3250);
   db.openSession({openingCashCents:0});
   const s=db.checkout({key:'combo-2',items:cart,payments:[{method:'pix',amountCents:3250}]});
   assert.equal(s.total_cents,3250);
   assert.equal(s.discount_cents,500);
   assert.equal(db.report().sales_total_cents,3250);
 }finally{f.cleanup();}
});

test('NEX-PROMO-02: plano escolhe menor composicao de faixas e nunca aumenta preco',()=>{
 const f=createNexusParityFixture();
 try{
   const db=f.store;
   db.setPromotion({productId:f.unit.id,quantityMilli:2000,bundlePriceCents:2200});
   db.setPromotion({productId:f.unit.id,quantityMilli:3000,bundlePriceCents:3600});
   const quote=db.quoteSale({items:[{id:f.unit.id,quantityMilli:5000}]});
   assert.equal(quote.total_cents,5650);
   assert.equal(quote.promotion_discount_cents,600);
   assert.equal(db.listPromotions(f.unit.id).length,2);
 }finally{f.cleanup();}
});

test('NEX-PROMO-03: UN fracionada ou regra que aumenta valor sao bloqueadas',()=>{
 const f=createNexusParityFixture();
 try{
   assert.throws(()=>f.store.setPromotion({productId:f.unit.id,quantityMilli:1500,bundlePriceCents:1000}),/unidade|inteir/i);
   assert.throws(()=>f.store.setPromotion({productId:f.unit.id,quantityMilli:2000,bundlePriceCents:9999}),/maior|preco|preço/i);
   assert.throws(()=>f.store.setPromotion({productId:f.weight.id,quantityMilli:1000,bundlePriceCents:100}),/unidade|KG/i);
 }finally{f.cleanup();}
});
