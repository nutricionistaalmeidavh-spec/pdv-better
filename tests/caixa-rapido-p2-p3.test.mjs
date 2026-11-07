import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_HELD_SALES, normalizeHeldSales, holdCashierSale, resumeHeldSale,
  normalizeCashierFavorites, toggleCashierFavorite, canUndoCashierChange
} from '../shared/cashier-workflow.mjs';
import {resolveCashierShortcut} from '../shared/cashier.mjs';

const cart=[
 {id:'p-1',name:'Café',code:'001',unit:'UN',priceCents:1900,quantityMilli:2000},
 {id:'p-2',name:'Queijo',code:'002',unit:'KG',priceCents:3599,quantityMilli:750,batchId:'lote-1',batchCode:'LOTE-01'}
];
const products=[
 {id:'p-1',name:'Café atualizado',code:'001',unit:'UN',sale_price_cents:2000},
 {id:'p-2',name:'Queijo',code:'002',unit:'KG',sale_price_cents:3599}
];
const sample=()=>holdCashierSale([],cart,{id:'hold-a',label:'Cliente balcão 2',createdAt:'2026-11-07T12:00:00.000Z'});

test('P2 guarda venda em espera sem efetuar pagamento nem alterar carrinho original',()=>{
 const before=JSON.stringify(cart);
 const held=sample();
 assert.equal(held.length,1);
 assert.equal(held[0].id,'hold-a');
 assert.equal(held[0].label,'Cliente balcão 2');
 assert.equal(held[0].items.length,2);
 assert.equal(held[0].items[1].batchId,'lote-1');
 assert.equal(JSON.stringify(cart),before);
});

test('P2 rejeita carrinho vazio, IDs duplicados e limite de vendas em espera',()=>{
 assert.throws(()=>holdCashierSale([],[],{id:'empty',createdAt:'2026-11-07T12:00:00.000Z'}),/vazio/i);
 assert.throws(()=>holdCashierSale(sample(),cart,{id:'hold-a',createdAt:'2026-11-07T12:00:00.000Z'}),/existe/i);
 let list=[];for(let i=0;i<MAX_HELD_SALES;i++)list=holdCashierSale(list,cart,{id:'id-'+i,createdAt:'2026-11-07T12:00:00.000Z'});
 assert.throws(()=>holdCashierSale(list,cart,{id:'over',createdAt:'2026-11-07T12:00:00.000Z'}),/limite/i);
});

test('P2 restaura venda com preços atuais e sinaliza mudanças, sem remover outros rascunhos',()=>{
 const held=holdCashierSale(sample(),cart,{id:'hold-b',createdAt:'2026-11-07T13:00:00.000Z'});
 const restored=resumeHeldSale(held,'hold-a',products);
 assert.equal(restored.items[0].priceCents,2000);
 assert.equal(restored.items[1].quantityMilli,750);
 assert.equal(restored.items[1].batchCode,'LOTE-01');
 assert.equal(restored.remaining.length,1);
 assert.equal(restored.remaining[0].id,'hold-b');
 assert.ok(restored.warnings.some(w=>/preço/i.test(w)));
});

test('P3 retirada de catálogo ou troca de unidade exige revisão segura',()=>{
 const restored=resumeHeldSale(sample(),'hold-a',[
  {id:'p-1',name:'Café',code:'001',unit:'KG',sale_price_cents:3000},
  {id:'p-2',name:'Queijo',code:'002',unit:'KG',sale_price_cents:4000}
 ]);
 assert.deepEqual(restored.items.map(x=>x.id),['p-2']);
 assert.ok(restored.warnings.some(w=>/unidade/i.test(w)));
 assert.throws(()=>resumeHeldSale(sample(),'hold-a',[]),/indisponíveis/i);
});

test('P3 dados locais adulterados são descartados com limites rígidos',()=>{
 assert.deepEqual(normalizeHeldSales('invalid'),[]);
 const bad=[{id:'bad',label:'ruim',createdAt:'2026-11-07T12:00:00.000Z',items:[{...cart[0],priceCents:-1}]}];
 assert.deepEqual(normalizeHeldSales(bad),[]);
 const corrupted=[{...sample()[0],items:[{...cart[0],quantityMilli:500}]}];
 assert.deepEqual(normalizeHeldSales(corrupted),[]);
 assert.deepEqual(normalizeCashierFavorites(['p-1','p-1',null,'p-2']),['p-1','p-2']);
});

test('P2 favoritos alternam sem duplicar e com limite',()=>{
 assert.deepEqual(toggleCashierFavorite(['p-1'],'p-1'),[]);
 assert.deepEqual(toggleCashierFavorite([], 'p-1'),['p-1']);
 const full=Array.from({length:8},(_,i)=>'product-'+i);
 assert.throws(()=>toggleCashierFavorite(full,'new'),/limite/i);
});

test('P3 desfazer só recupera estado que não foi alterado depois da remoção',()=>{
 const after=cart.slice(1);
 assert.equal(canUndoCashierChange(after,{before:cart,after}),true);
 assert.equal(canUndoCashierChange([], {before:cart,after}),false);
 assert.equal(canUndoCashierChange(after,null),false);
});

test('P3 atalhos de espera e desfazer respeitam caixa, modal e campos editáveis',()=>{
 const base={checkout:true,session:false,hasCart:true,hasHeld:false,canUndo:false,dialog:false,editable:false};
 assert.equal(resolveCashierShortcut('F9',base),'hold');
 assert.equal(resolveCashierShortcut('F11',{...base,hasCart:false,hasHeld:true}),'resume');
 assert.equal(resolveCashierShortcut('Ctrl+Z',{...base,canUndo:true}),'undo');
 assert.equal(resolveCashierShortcut('Ctrl+Z',{...base,canUndo:true,editable:true}),null);
 assert.equal(resolveCashierShortcut('F9',{...base,dialog:true}),null);
 assert.equal(resolveCashierShortcut('F9',{...base,checkout:false}),null);
});

test('P3 componente mantém indicação não fiscal, venda em espera e favoritos no renderer',()=>{
 const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
 const cashier=readFileSync(new URL('../src/Cashier.tsx',import.meta.url),'utf8');
 assert.match(app,/holdCashierSale/);
 assert.match(app,/resumeHeldSale/);
 assert.match(app,/user\.id/);
 assert.match(cashier,/Vendas em espera/);
 assert.match(cashier,/Favoritos/);
 assert.match(cashier,/não fiscal/i);
});

test('P3 cadastro rápido no pagamento mantém estados locais e retorno ao catálogo',()=>{
 const payment=readFileSync(new URL('../src/Commerce.tsx',import.meta.url),'utf8');
 for(const name of ['newCustomerName','extraCustomers','customerBusy']){
   const setter='set'+name[0].toUpperCase()+name.slice(1);
   assert.ok(payment.includes('const ['+name+','+setter+']'),'Estado ausente: '+name);
 }
 assert.match(payment,/await onCustomerSaved\(\)/);
});
