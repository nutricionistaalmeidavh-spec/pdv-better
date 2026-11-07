import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = path => readFileSync(new URL('../'+path, import.meta.url), 'utf8');

test('PDV SUPER é a única marca apresentada no shell, login e frente de caixa',()=>{
  for(const path of ['src/App.tsx','src/AuthGate.tsx','src/Cashier.tsx','index.html']){
    const content=source(path);
    assert.match(content,/PDV SUPER/,path+' deve conter a marca');
    assert.doesNotMatch(content,/Caixa Rápido|PDV Better|by ArtiSys/,path+' não pode exibir marca antiga');
  }
});

test('o tema transversal é a última folha importada para todas as telas',()=>{
  const main=source('src/main.tsx');
  assert.match(main,/import '\.\/pdv-super\.css';/);
  assert.ok(main.lastIndexOf("import './pdv-super.css';")>main.lastIndexOf("import './cashier.css';"));
  assert.doesNotMatch(main,/import '\.\/graphite\.css';/);
  const css=source('src/pdv-super.css');
  for(const selector of [
    '.shell', '.sidebar', '.topbar', '.content', '.nav-item.selected',
    '.auth-screen', '.auth-panel', '.panel', '.stat', '.quick',
    '.data-panel', '.commerce-section', '.commerce-table', '.settings-block',
    '.dialog', '.cashier-workspace', '.cashier-payment-panel', '.cashier-receive',
    '.cashier-item', '.cashier-hold-panel', '.receipt-content'
  ])assert.ok(css.includes(selector),selector+' precisa do tema');
  assert.match(css,/--super-navy:/);
  assert.match(css,/--super-blue:/);
  assert.match(css,/--super-green:/);
  assert.match(css,/@media print/);
});

test('fluxos de pagamento, favoritos e vendas em espera permanecem conectados',()=>{
  const cashier=source('src/Cashier.tsx');
  for(const token of [
    'onChangeQuantity','onReadScale','onOpenPayment','onToggleFavorite',
    'onHold','onResumeHeld','onUndo','cashier-methods','cashier-favorites'
  ])assert.ok(cashier.includes(token),token+' não pode ser removido no redesign');
  const app=source('src/App.tsx');
  assert.match(app,/resolveCashierShortcut/);
});
