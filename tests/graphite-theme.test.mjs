import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('tema PDV SUPER é o último stylesheet carregado globalmente',()=>{
 const code=read('src/main.tsx');
 assert.match(code,/import '\.\/pdv-super\.css';/);
 assert.equal(code.trim().split('\n').at(-2)?.trim(),"import './pdv-super.css';");
 assert.doesNotMatch(code,/import '\.\/graphite\.css';/);
});
test('tokens PDV SUPER cobrem superfícies, navegação, tabelas, caixa e modais',()=>{
 const css=read('src/pdv-super.css');
 for(const selector of ['.sidebar','.topbar','.nav-item.selected','.data-panel td',
  '.commerce-table td','.glass-product-grid .product-option','.auth-panel',
  '.glass-payment','.dialog','.settings-tabs button','.payment-summary',
  '.cashier-receive','.cashier-hold-panel',':focus-visible']) {
  assert.ok(css.includes(selector),'Seletor do tema ausente: '+selector);
 }
 assert.match(css,/--super-navy:\s*#071d40/i);
 assert.match(css,/--super-blue:\s*#0964e7/i);
 assert.match(css,/--super-green:\s*#06ab51/i);
 assert.match(css,/@media print/);
 assert.match(css,/@media\(prefers-reduced-transparency:reduce\)/);
});
test('novo tema não contém violeta saturado',()=>{
 const css=read('src/pdv-super.css');
 const offenders=[];
 for(const match of css.matchAll(/#([\da-f]{6})(?:[\da-f]{2})?\b/gi)){
  const h=match[1],rgb=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16));
  const max=Math.max(...rgb),min=Math.min(...rgb);
  const sat=max===0?0:(max-min)/max;
  if(rgb[0]>rgb[1]*1.18&&rgb[2]>rgb[1]*1.18&&sat>.23)offenders.push('#'+h);
 }
 assert.deepEqual(offenders,[]);
});
test('identificador técnico de operador foi substituído por nome legível do SQLite',()=>{
 const backend=read('electron/commerce.mjs'),ui=read('src/Commerce.tsx');
 assert.match(backend,/operator_name/);
 assert.match(ui,/operator_name/);
});
