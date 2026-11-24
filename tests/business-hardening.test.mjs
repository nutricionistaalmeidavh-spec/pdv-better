import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {lineTotalCents,parseFixed,roundRatio} from '../shared/domain.mjs';
import {localDateKey,localDateRange} from '../shared/report-analytics.mjs';
import {createFinanceP2} from '../electron/finance-p2.mjs';
import {openCatalog} from '../electron/db.mjs';

test('multiplicação em centavos é exata mesmo quando produto intermediário ultrapassa MAX_SAFE_INTEGER',()=>{
 const a=9007199254740001,b=999;
 assert.equal(lineTotalCents(a,b),Number((BigInt(a)*BigInt(b)+500n)/1000n));
 assert.equal(roundRatio(5n,2n),3);
 assert.equal(roundRatio(-5n,2n),-2);
 assert.equal(parseFixed('1.234,56',2,'Preço'),123456);
 assert.throws(()=>parseFixed('1,234',2,'Preço'));
});
test('dia comercial inclui noite local e exclui meia-noite seguinte; financeiro e margem usam o mesmo dia',()=>{
 const old=process.env.TZ;process.env.TZ='America/Sao_Paulo';
 const db=new DatabaseSync(':memory:');
 try{
  assert.equal(localDateKey('2026-11-25T01:30:00.000Z'),'2026-11-24');
  assert.deepEqual(localDateRange('2026-11-24','2026-11-24'),{start:'2026-11-24T03:00:00.000Z',end:'2026-11-25T03:00:00.000Z'});
  db.exec("CREATE TABLE sales(id,status,is_training,created_at,total_cents); CREATE TABLE sale_payments(sale_id,amount_cents,method); CREATE TABLE sale_items(sale_id,unit_cost_cents,quantity_milli); CREATE TABLE financial_entries(id,type,status,due_on,amount_cents,category,description); CREATE TABLE finance_settlements(entry_id,amount_cents,method,created_at);");
  db.exec("INSERT INTO sales VALUES('a','completed',0,'2026-11-25T01:30:00.000Z',999),('b','completed',0,'2026-11-25T03:00:00.000Z',100); INSERT INTO sale_payments VALUES('a',999,'pix'),('b',100,'pix'); INSERT INTO sale_items VALUES('a',400,1000),('b',50,1000);");
  const f=createFinanceP2(db).financeOverview({from:'2026-11-24',to:'2026-11-24'});
  assert.equal(f.realized_in_cents,999);assert.equal(f.margin.revenue_cents,999);assert.equal(f.margin.cost_cents,400);
  assert.equal(f.timeline[0].date,'2026-11-24');
  const paged=createFinanceP2(db).financeOverview({from:'2026-11-24',to:'2026-11-24',page:0,pageSize:1});
  assert.equal(paged.total,1);assert.equal(paged.realized_in_cents,999);assert.equal(paged.margin.cost_cents,400);assert.equal(paged.timeline[0].date,'2026-11-24');
 }finally{db.close();if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});
test('cadastro paginado sem fotos e alteração de unidade com estoque são seguros',()=>{
 const store=openCatalog(':memory:');
 try{
  const p=store.save('products',{name:'A',code:'A',unit:'UN',sale_price_cents:100,stock_milli:1000});
  assert.throws(()=>store.save('products',{...p,unit:'KG'}),/unidade/i);
  for(let i=0;i<85;i++)store.save('products',{name:'B'+String(i).padStart(3,'0'),code:'B'+i,unit:'UN',sale_price_cents:100});
  const first=store.list('products','',{page:0,pageSize:50,includeImages:false}),second=store.list('products','',{page:1,pageSize:50,includeImages:false});
  assert.equal(first.total,86);assert.equal(second.rows.length,36);
  assert.equal(new Set([...first.rows,...second.rows].map(x=>x.id)).size,86);
  assert.ok(first.rows.every(x=>!Object.hasOwn(x,'image_data')));
 }finally{store.close();}
});

test('histórico do turno é paginado e resumo não transfere movimentos',()=>{
 const store=openCatalog(':memory:');
 try{
  store.openSession({openingCashCents:100});
  for(let i=0;i<82;i++)store.moveCash({kind:'reinforcement',amountCents:1,note:'QA '+i});
  const summary=store.getCurrentSessionPage({summaryOnly:true});
  assert.equal(summary.expected_cash_cents,182);assert.equal(Object.hasOwn(summary,'movements'),false);
  const a=store.getCurrentSessionPage({page:0,pageSize:50}),b=store.getCurrentSessionPage({page:1,pageSize:50});
  assert.equal(a.movementTotal,82);assert.equal(a.movements.length,50);assert.equal(b.movements.length,32);
  assert.equal(new Set([...a.movements,...b.movements].map(x=>x.id)).size,82);
 }finally{store.close();}
});
test('relatório paginado preserva total e rateio; comparação não perde vendas',()=>{
 const store=openCatalog(':memory:');
 try{
  const a=store.save('products',{name:'A',code:'A',unit:'UN',sale_price_cents:1250,stock_milli:4000});
  const b=store.save('products',{name:'B',code:'B',unit:'KG',sale_price_cents:900,stock_milli:4000});
  store.openSession({openingCashCents:0});
  const sale=store.checkout({key:'page-test',items:[{id:a.id,quantityMilli:1000},{id:b.id,quantityMilli:350}],discountCents:10,payments:[{method:'pix',amountCents:1555}]});
  const all=store.reportItems();
  const first=store.reportItems({page:0,pageSize:1}),second=store.reportItems({page:1,pageSize:1});
  assert.equal(first.total,2);assert.equal(first.summary.net_total_cents,1555);
  assert.deepEqual([...first.rows,...second.rows],all.rows);
  assert.equal(store.reportItems({productId:a.id,page:0,pageSize:1}).rows[0].net_cents,all.rows.find(r=>r.product_id===a.id).net_cents);
  const day=localDateKey(sale.created_at);
  const compare=store.compareReportPeriods({from:day,to:day,comparisonFrom:day,comparisonTo:day});
  assert.equal(compare.current.total_cents,1555);
  assert.equal(compare.current.items_count,2);
 }finally{store.close();}
});

test('índices de categoria, caixa e baixas existem e consulta por categoria não ordena tabela inteira',async()=>{
 const {createNexusParityFixture}=await import('./fixtures/nexus-parity.mjs');
 const f=createNexusParityFixture();
 const db=new DatabaseSync(f.database,{readOnly:true});
 try{
  const indexes=db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r=>r.name);
  for(const name of ['idx_products_active_category_name','idx_cash_movements_session_time','idx_finance_settlements_entry_time','idx_sale_items_product_sale'])assert.ok(indexes.includes(name),name);
  const query=db.prepare('EXPLAIN QUERY PLAN SELECT id,name FROM products WHERE active=1 AND category_id=? ORDER BY name COLLATE NOCASE,id LIMIT 50').all('qa');
  assert.ok(query.some(r=>/idx_products_active_category_name/.test(r.detail)));
  assert.ok(!query.some(r=>/TEMP B-TREE/i.test(r.detail)));
 }finally{db.close();f.cleanup();}
});
