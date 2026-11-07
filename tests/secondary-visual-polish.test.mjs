import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('modulos comerciais preservam operacoes e fornecem identidade visual por tela',()=>{
  const commerce=source('src/Commerce.tsx');
  for(const key of ['cash','sales','inventory','purchases','finance','reports']){
    assert.match(commerce,new RegExp("view==='"+key+"'"),key);
  }
  assert.match(commerce,/className="commerce-screen" data-module=\{view\}/);
  assert.match(commerce,/purchase-order-card/);
  assert.match(commerce,/purchase-receipt-card/);
  assert.match(commerce,/finance-entry-card/);
  assert.match(commerce,/finance-accounts-card/);
  assert.match(commerce,/commerce-empty-state/);
});

test('cadastro de produtos prioriza colunas comerciais reais sem perder as demais entidades',()=>{
  const app=source('src/App.tsx');
  assert.match(app,/const listFields/);
  for(const key of ['sale_price_cents','stock_milli','category_id'])assert.ok(app.includes("'"+key+"'"),key);
  assert.match(app,/listFields\.map/);
  assert.match(app,/data-panel-products/);
});

test('linguagem visual secundaria e acessibilidade responsiva permanecem no tema gratuito',()=>{
  const css=source('src/pdv-super.css');
  assert.match(css,/PDV SUPER — refino transversal de telas secundárias/);
  for(const selector of ['.commerce-screen[data-module="purchases"]','.commerce-screen[data-module="finance"]','.system-settings .settings-tabs','.p2-finance-stack .report-grid','.shell.super-shell .data-panel','.shell.super-shell .dialog:not(.product-editor-dialog)']){
    assert.ok(css.includes(selector),'seletor ausente: '+selector);
  }
  assert.match(css,/@media \(max-width: 760px\)/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css,/@import\s+url\(/);
});

test('configuracoes e formularios mantem operacoes locais e nomenclatura final do produto',()=>{
  const settings=source('src/SystemSettings.tsx'), app=source('src/App.tsx');
  assert.match(settings,/CONFIGURAÇÕES DO PDV/);
  for(const method of ['lanHost','lanJoin','deviceSet','backupCreate','backupRestore'])assert.ok(settings.includes(method),method);
  assert.match(app,/className="modal-backdrop"/);
  assert.match(app,/Cadastro de Produto/);
});
