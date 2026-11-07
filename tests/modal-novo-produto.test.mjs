import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('novo produto abre dialog diretamente no caixa e respeita permissao de cadastro',()=>{
  const app=source('src/App.tsx');
  const cashier=source('src/Cashier.tsx');
  assert.match(app,/editingEntity/);
  assert.match(app,/const dialogSchema\s*=\s*definitions\[editingEntity\s*\|\|\s*view\]/);
  assert.match(app,/setEditingEntity\('products'\)/);
  assert.match(app,/onProducts=\{openNewProductModal\}/);
  assert.match(app,/canCreateProduct=\{allowed\(user\.role,'save',\['products'\]\)\}/);
  assert.match(cashier,/canCreateProduct\s*&&/);
  assert.match(cashier,/>Novo produto</);
});

test('modal de cadastro prioriza foto e campos da imagem de referencia',()=>{
  const app=source('src/App.tsx');
  const css=source('src/pdv-super.css');
  assert.match(app,/Cadastro de Produto/);
  assert.match(app,/productCoreKeys/);
  assert.match(app,/product-advanced-fields/);
  assert.match(app,/product-editor-dialog/);
  assert.match(css,/\.product-main-name/);
  assert.match(css,/\.product-advanced-fields/);
});

test('QA visual existente captura formulario de adicionar produto e edicao com foto',()=>{
  const script=source('scripts/qa-all-screens.mjs');
  assert.match(script,/capture\('Cadastro - adicionar '\+singular\+' - formulario'\)/);
  assert.match(script,/capture\('Cadastro - produto - foto enviada e miniatura'\)/);
});
