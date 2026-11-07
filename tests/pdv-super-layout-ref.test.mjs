import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('layout transversal usa navegação superior com telas de gestão acessíveis',()=>{
  const app=source('src/App.tsx');
  assert.match(app,/className="super-top-navigation"/);
  assert.match(app,/aria-label="Navegação principal"/);
  assert.match(app,/PDV SUPER/);
  assert.match(app,/menus\.map/);
  assert.match(app,/selectView\(id\)/);
});
test('catálogo em grade fica disponível na frente de caixa, inclusive com carrinho vazio',()=>{
  const cashier=source('src/Cashier.tsx');
  assert.match(cashier,/className="cashier-product-results"/);
  assert.match(cashier,/className="cashier-checkout-side"/);
  assert.match(cashier,/aria-label="Catálogo de produtos"/);
  assert.match(cashier,/product\.image_data/);
  assert.match(cashier,/productPhotos\[item\.id\]/);
  assert.match(cashier,/cashier-item-stepper/);
  assert.match(cashier,/cashier-hold-panel/);
  assert.match(cashier,/onReadScale/);
  assert.match(cashier,/onOpenPayment/);
});
test('a direção visual é consistente no catálogo, carrinho e cadastro com foto',()=>{
 const css=source('src/pdv-super.css');
 for(const token of ['.super-top-navigation','.super-top-brand','.cashier-product-results','.cashier-product-entry','.cashier-checkout-side','.cashier-payment-panel','.product-photo-field','.commerce-table','.report-grid']){
   assert.ok(css.includes(token),'ausente: '+token);
 }
 const app=source('src/App.tsx');
 assert.match(app,/encodeProductImage/);
 assert.match(app,/input type="file" accept="image\/jpeg,image\/png,image\/webp"/);
});
