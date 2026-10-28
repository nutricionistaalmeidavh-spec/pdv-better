import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('tema grafite é o último stylesheet carregado globalmente',()=>{
 const code=read('src/main.tsx');
 assert.match(code,/import '\.\/graphite\.css';/);
 assert.equal(code.trim().split('\n').at(-2),"import './graphite.css';");
});
test('tokens de contraste cobrem superfícies, navegação, tabelas e modais',()=>{
 const css=read('src/graphite.css');
 for(const selector of ['.sidebar','.topbar','.nav-item.selected','.data-panel td',
  '.commerce-table td','.glass-product-grid .product-option','.auth-panel',
  '.glass-payment','.dialog','.settings-tabs button','.payment-summary',':focus-visible']) {
  assert.ok(css.includes(selector),'Seletor do tema ausente: '+selector);
 }
 assert.match(css,/--graphite-text:\s*#f5f6f7/i);
 assert.match(css,/@media print/);
 assert.match(css,/@media\(prefers-reduced-transparency:reduce\)/);
});
test('nenhum stylesheet global retém roxo ou violeta saturado',()=>{
 const paths=['src/styles.css','src/glass.css','src/system.css','src/auth.css','src/graphite.css'];
 const offenders=[];
 for(const path of paths){
   const css=read(path);
   for(const match of css.matchAll(/#([\da-f]{6})(?:[\da-f]{2})?\b/gi)){
     const h=match[1],rgb=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16));
     const max=Math.max(...rgb),min=Math.min(...rgb);
     const sat=max===0?0:(max-min)/max;
     if(rgb[2]>rgb[1]*1.18 && rgb[2]>rgb[0]*1.07 && sat>.23)offenders.push(path+':#'+h);
   }
 }
 assert.deepEqual(offenders,[]);
});
test('identificador técnico de operador foi substituído por nome legível do SQLite',()=>{
 const backend=read('electron/commerce.mjs'),ui=read('src/Commerce.tsx');
 assert.match(backend,/operator_name/);
 assert.match(ui,/operator_name/);
});
