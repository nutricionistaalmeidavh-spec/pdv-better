import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openCatalog} from '../electron/db.mjs';
import {financeBuckets} from '../shared/finance-board.mjs';
import {financeCsv} from '../shared/finance-export.mjs';

function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'pdv-p2-'));
 const store=openCatalog(join(dir,'p2.sqlite'),{terminalId:'manager-terminal'});
 const product=store.save('products',{name:'Café',unit:'UN',code:'CAFE-P2',sale_price_cents:'20,00',cost_price_cents:'10,00',stock_milli:'10'});
 return {store,product,done(){store.close();rmSync(dir,{recursive:true,force:true});}};
}

test('P2: lançamento recorrente gera 3 vencimentos corretos sem baixar nem movimentar caixa',()=>{
 const f=fixture();try{
  f.store.openSession({openingCashCents:4000});
  const result=f.store.createFinanceSchedule({type:'payable',description:'Aluguel',amountCents:2500,dueOn:'2026-01-31',months:3,category:'Aluguel',key:'recurrence-jan-2026'});
  assert.equal(result.entries.length,3);
  assert.deepEqual(result.entries.map(x=>x.due_on),['2026-01-31','2026-02-28','2026-03-31']);
  assert.ok(result.entries.every(x=>x.remaining_cents===2500&&x.paid_cents===0&&x.status==='open'));
  assert.equal(f.store.getCurrentSession().expected_cash_cents,4000);
  const repeated=f.store.createFinanceSchedule({type:'payable',description:'Aluguel',amountCents:2500,dueOn:'2026-01-31',months:3,category:'Aluguel',key:'recurrence-jan-2026'});
  assert.deepEqual(repeated.entries.map(x=>x.id),result.entries.map(x=>x.id));
  assert.throws(()=>f.store.createFinanceSchedule({type:'payable',description:'Outro',amountCents:5000,dueOn:'2026-01-31',months:3,category:'Aluguel',key:'recurrence-jan-2026'}),/reutilizad|diferente/i);
  assert.equal(f.store.listFinance().length,3);
 }finally{f.done();}
});

test('P2: frequência não fabrica pagamentos passados; rejeita data inválida e limite de recorrência',()=>{
 const f=fixture();try{
  assert.throws(()=>f.store.createFinanceSchedule({type:'receivable',description:'Mensalidade',amountCents:1000,dueOn:'2026-02-30',months:3}),/data|vencimento/i);
  assert.throws(()=>f.store.createFinanceSchedule({type:'receivable',description:'Mensalidade',amountCents:1000,dueOn:'2026-02-01',months:50}),/recorr|meses|limite/i);
  assert.equal(f.store.listFinance().length,0);
 }finally{f.done();}
});

test('P2: projeção contabiliza venda recebida e pagamento do fiado apenas quando baixado',()=>{
 const f=fixture();try{
  const cust=f.store.save('customers',{name:'Cliente P2'});
  f.store.openSession({openingCashCents:0});
  f.store.checkout({key:'p2-direct',items:[{id:f.product.id,quantityMilli:1000}],payments:[{method:'pix',amountCents:2000}]});
  const credit=f.store.checkout({key:'p2-credit',customerId:cust.id,items:[{id:f.product.id,quantityMilli:1000}],payments:[{method:'credit',amountCents:2000}]});
  const receivable=f.store.listFinance().find(x=>x.sale_id===credit.id);
  f.store.settleFinance({id:receivable.id,method:'pix',amountCents:750});
  const overview=f.store.financeOverview({});
  assert.equal(overview.realized_in_cents,2750);
  assert.equal(overview.realized_out_cents,0);
  assert.equal(overview.forecast_in_cents,1250);
  assert.equal(overview.margin.revenue_cents,4000);
  assert.equal(overview.margin.cost_cents,2000);
  assert.equal(overview.margin.gross_margin_cents,2000);
  assert.equal(overview.margin.missing_cost_lines,0);
 }finally{f.done();}
});

test('P2: Kanban separa atrasadas, próximas, parciais, liquidadas e sem vencimento sem duplicar entradas',()=>{
 const rows=[
  {id:'a',status:'open',due_on:'2026-01-01',paid_cents:0,remaining_cents:100},
  {id:'b',status:'open',due_on:'2026-03-01',paid_cents:0,remaining_cents:100},
  {id:'c',status:'open',due_on:'2026-01-01',paid_cents:50,remaining_cents:50},
  {id:'d',status:'settled',due_on:'2026-01-01',paid_cents:100,remaining_cents:0},
  {id:'e',status:'open',due_on:null,paid_cents:0,remaining_cents:200}
 ];
 const board=financeBuckets(rows,'2026-02-01');
 assert.deepEqual(Object.fromEntries(Object.entries(board).map(([k,v])=>[k,v.map(x=>x.id)])),
   {overdue:['a'],upcoming:['b'],partial:['c'],settled:['d'],undated:['e']});
 assert.equal(Object.values(board).reduce((sum,x)=>sum+x.length,0),rows.length);
});

test('P2: CSV offline protege fórmulas de células e exporta valores exatos',()=>{
 const output=financeCsv({rows:[{date:'2026-01-01',description:'=HYPERLINK("evil")',category:'Serviços',kind:'entrada',method:'pix',amount_cents:2500}]});
 assert.match(output,/^\uFEFF/);
 assert.match(output,/\\'=HYPERLINK|"'=HYPERLINK/);
 assert.match(output,/25,00/);
});

test('P2: categoria acompanha lançamento avulso, permanece no Kanban e na projeção',()=>{
 const f=fixture();try{
  const entry=f.store.createFinance({type:'payable',description:'Serviço de nuvem local',amountCents:900,dueOn:'2026-12-20',category:'Infraestrutura'});
  assert.equal(entry.category,'Infraestrutura');
  assert.equal(f.store.listFinance().find(x=>x.id===entry.id).category,'Infraestrutura');
  const projected=f.store.financeOverview({from:'2026-12-01',to:'2026-12-31'}).forecasts;
  assert.equal(projected.find(x=>x.id===entry.id)?.category,'Infraestrutura');
 }finally{f.done();}
});
test('P2: reenvio de recorrência mostra saldo já liquidado sem recriar contas',()=>{
 const f=fixture();try{
  f.store.openSession({openingCashCents:5000});
  const input={type:'receivable',description:'Mensalidade',amountCents:1000,dueOn:'2026-11-20',months:3,key:'mensalidade-retry'};
  const initial=f.store.createFinanceSchedule(input);
  f.store.settleFinance({id:initial.entries[0].id,method:'pix',amountCents:300});
  const replay=f.store.createFinanceSchedule(input);
  assert.equal(replay.entries[0].paid_cents,300);
  assert.equal(replay.entries[0].remaining_cents,700);
  assert.equal(f.store.listFinance().length,3);
 }finally{f.done();}
});
