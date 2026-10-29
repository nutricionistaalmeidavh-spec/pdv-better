import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveStockAlerts} from '../shared/stock-alerts.mjs';
test('ALERT-01: vencidos, a vencer e sem estoque são distinguidos sem vender saldos vencidos',()=>{
 const products=[{id:'a',name:'Produto A',unit:'UN',stock_milli:0,active:1},
  {id:'b',name:'Produto B',unit:'KG',stock_milli:350,active:1},{id:'c',name:'Produto C',unit:'UN',stock_milli:5000,active:0}];
 const batches=[{id:'la',product_id:'b',expires_on:'2026-10-27',remaining_milli:200},
 {id:'lb',product_id:'b',expires_on:'2026-11-02',remaining_milli:150},
 {id:'lc',product_id:'c',expires_on:'2026-10-28',remaining_milli:1000}];
 const alerts=deriveStockAlerts(products,batches,'2026-10-29');
 assert.equal(alerts.outOfStock.length,1);
 assert.equal(alerts.lowStock.length,1);
 assert.equal(alerts.expired.length,1);
 assert.equal(alerts.expiring.length,1);
 assert.equal(alerts.expired[0].id,'la');
});
test('ALERT-02: lote sem saldo e produto inativo não geram alerta e data inválida é rejeitada',()=>{
 assert.deepEqual(deriveStockAlerts([{id:'p',name:'P',unit:'UN',stock_milli:0,active:0}],
 [{id:'x',product_id:'p',expires_on:'2026-10-29',remaining_milli:1000}], '2026-10-29').expired,[]);
 assert.throws(()=>deriveStockAlerts([],[],'29/10/2026'),/data|inválid/i);
});
