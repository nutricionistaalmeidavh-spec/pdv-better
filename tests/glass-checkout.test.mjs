import test from 'node:test';
import assert from 'node:assert/strict';
import { filterCheckoutProducts } from '../shared/catalog.mjs';
const products = [
 { id:'1', name:'Água Mineral', code:'AG001', category_id:'bebidas' },
 { id:'2', name:'Pão de Queijo', code:'PA002', category_id:'lanches' },
 { id:'3', name:'Café', code:'CF003', category_id:'bebidas' }
];
test('category and case-insensitive name filter', () => assert.deepEqual(filterCheckoutProducts(products,'bebidas','CAFÉ').map(p=>p.id),['3']));
test('barcode search across categories', () => assert.deepEqual(filterCheckoutProducts(products,'all','PA002').map(p=>p.id),['2']));
test('result limit preserves original order', () => assert.deepEqual(filterCheckoutProducts(products,'all','',2).map(p=>p.id),['1','2']));
test('empty result when category does not match', () => assert.deepEqual(filterCheckoutProducts(products,'bebidas','PA002'),[]));
