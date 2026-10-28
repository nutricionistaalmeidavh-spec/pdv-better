import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openCatalog } from '../electron/db.mjs';
import { normalizeRecord, addToCart, cartTotalCents, lineTotalCents, parseFixed } from '../shared/domain.mjs';
test('categorias e produtos mantêm identidade e persistência canônica', () => {
  const store = openCatalog(':memory:');
  try {
    const category = store.save('categories', { name: 'Mercearia' });
    const p = store.save('products', { name: 'Café', code: ' ABC-1 ', category_id: category.id, unit: 'UN', sale_price_cents: '12,50', cost_price_cents: '8,00', stock_milli: '10' });
    assert.equal(p.code, 'ABC-1');
    assert.equal(p.sale_price_cents, 1250);
    assert.equal(p.stock_milli, 10000);
    assert.equal(store.list('products')[0].id, p.id);
    assert.equal(store.overview().products, 1);
    const changed = store.save('products', { ...p, name: 'Café Premium', sale_price_cents: '13,00', stock_milli: '10' });
    assert.equal(changed.id, p.id);
    assert.equal(store.list('products', 'Premium').length, 1);
    store.archive('products', p.id);
    assert.equal(store.list('products').length, 0);
  } finally { store.close(); }
});
test('código de barras não pode repetir', () => {
  const store = openCatalog(':memory:');
  try {
    const p = { name: 'Arroz', code: '789', unit: 'UN', sale_price_cents: '5', stock_milli: '0' };
    store.save('products', p);
    assert.throws(() => store.save('products', { ...p, name: 'Feijão' }), /Código já cadastrado/);
  } finally { store.close(); }
});
test('valida entradas inválidas e referências', () => {
  assert.throws(() => normalizeRecord('products', { name: '' }), /obrigatório/);
  assert.throws(() => normalizeRecord('products', { name: 'A', sale_price_cents: '-1', unit: 'UN' }), /valor|casas/);
  assert.throws(() => normalizeRecord('qualquer', {}), /não reconhecida/);
  const store = openCatalog(':memory:');
  try {
    assert.throws(() => store.save('products', {name:'A', unit:'UN', category_id:'00000000-0000-0000-0000-000000000000', sale_price_cents:'1'}), /Categoria inexistente/);
  } finally { store.close(); }
});
test('carrinho calcula centavos exatos e não salva vendas', () => {
  const product = {id:'p1', name:'Banana', code:'B1', unit:'KG', sale_price_cents:799, active:1};
  let cart = addToCart([], product, 1250);
  assert.equal(lineTotalCents(799, 1250), 999);
  assert.equal(cartTotalCents(cart), 999);
  cart = addToCart(cart, product, 250);
  assert.equal(cart[0].quantityMilli, 1500);
  assert.equal(cartTotalCents(cart), 1199);
  assert.throws(() => addToCart([], {...product, unit:'UN'}, 500), /inteira/);
  assert.equal(parseFixed('1,05', 2, 'Preço'), 105);
});

test('categoria vinculada a produto não pode ser desativada', () => {
  const store = openCatalog(':memory:');
  try {
    const category = store.save('categories', {name:'Padaria'});
    store.save('products', {name:'Pão',unit:'UN',category_id:category.id,sale_price_cents:'1,00'});
    assert.throws(() => store.archive('categories',category.id), /possui produtos ativos/);
    assert.equal(store.list('categories').length,1);
  } finally { store.close(); }
});

test('cadastros sobrevivem ao fechamento e reabertura do SQLite real', async () => {
  const {mkdtempSync,rmSync} = await import('node:fs');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const {DatabaseSync} = await import('node:sqlite');
  const {entities,entityOrder} = await import('../shared/contract.mjs');
  const dir = mkdtempSync(join(tmpdir(),'pdv-better-'));
  const filename = join(dir,'pdv.sqlite');
  try {
    let store = openCatalog(filename);
    const customer = store.save('customers',{name:'Cliente de teste',phone:'16999999999'});
    store.close();
    store = openCatalog(filename);
    assert.equal(store.list('customers')[0].id,customer.id);
    assert.equal(store.list('customers')[0].phone,'16999999999');
    store.close();
    const db = new DatabaseSync(filename);
    try {
      for(const kind of entityOrder){
        const existing = new Set(db.prepare('PRAGMA table_info("' + kind + '")').all().map(x=>x.name));
        for(const field of entities[kind].fields) assert.equal(existing.has(field.key),true,kind + ': coluna ' + field.key);
      }
    } finally { db.close(); }
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('catálogo completo não é truncado silenciosamente em 500 produtos', () => {
  const store = openCatalog(':memory:');
  try {
    for(let i=0;i<510;i++) store.save('products',{name:'Produto '+i,unit:'UN',sale_price_cents:'1,00'});
    assert.equal(store.list('products').length,510);
  } finally {store.close();}
});
