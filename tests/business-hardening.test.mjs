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
