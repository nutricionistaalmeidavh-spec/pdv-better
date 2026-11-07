import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCashierMode, resolveCashierShortcut, formatCashierAmount } from '../shared/cashier.mjs';

const source=path=>readFileSync(new URL('../'+path, import.meta.url),'utf8');

test('modos do caixa rápido suportam as três referências e fallback seguro',()=>{
  for(const mode of ['compact','light','dark'])assert.equal(normalizeCashierMode(mode),mode);
  assert.equal(normalizeCashierMode('unknown'),'dark');
  assert.equal(normalizeCashierMode(null),'dark');
});

test('atalhos diferenciam busca, cliente, desconto e formas de pagamento',()=>{
  const keyMap={F2:'search',F3:'customer',F4:'discount',F5:'payment',F6:'pix',F7:'card',F8:'cash',F10:'payment'};
  for(const [key,action] of Object.entries(keyMap))
    assert.equal(resolveCashierShortcut(key,{checkout:true,session:true,hasCart:true,dialog:false}),action);
  assert.equal(resolveCashierShortcut('F11',{checkout:true,session:true,hasCart:true,dialog:false}),null);
});

test('atalhos financeiros ficam bloqueados se não houver carrinho ou caixa aberto',()=>{
  for(const key of ['F3','F4','F5','F6','F7','F8','F10']){
    assert.equal(resolveCashierShortcut(key,{checkout:true,session:false,hasCart:true,dialog:false}),null);
    assert.equal(resolveCashierShortcut(key,{checkout:true,session:true,hasCart:false,dialog:false}),null);
  }
  assert.equal(resolveCashierShortcut('F2',{checkout:false,session:false,hasCart:false,dialog:false}),'search');
  assert.equal(resolveCashierShortcut('F6',{checkout:false,session:true,hasCart:true,dialog:false}),null);
  assert.equal(resolveCashierShortcut('F2',{checkout:true,session:true,hasCart:true,dialog:true}),null);
});

test('pré-preenchimento monetário respeita centavos e não altera o backend',()=>{
  assert.equal(formatCashierAmount(2500),'25,00');
  assert.equal(formatCashierAmount(1299),'12,99');
  assert.equal(formatCashierAmount(0),'0,00');
  assert.throws(()=>formatCashierAmount(-1),/Valor inválido/);
});

test('integração visual preserva ponte canônica e confirmação humana',()=>{
  const app=source('src/App.tsx');
  const cashier=source('src/Cashier.tsx');
  const payment=source('src/Commerce.tsx');
  const styles=source('src/cashier.css');
  assert.match(app,/resolveCashierShortcut/);
  assert.match(app,/<Cashier/);
  assert.match(app,/sessionCurrent\(/);
  assert.match(cashier,/cashier-mode/);
  assert.match(cashier,/Pesquisar ou ler código de barras/);
  assert.match(cashier,/onOpenPayment/);
  assert.match(payment,/window\.pdv\.checkout/);
  assert.match(payment,/confirmar|Confirme/i);
  for(const mode of ['compact','light','dark'])assert.ok(styles.includes('.cashier-shell.mode-'+mode));
});
