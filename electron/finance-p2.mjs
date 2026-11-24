import {randomUUID,createHash} from 'node:crypto';
import {assertCents,assertDate,assertChoice,assertLabel} from '../shared/commerce.mjs';
import {localDateKey,localDateRange} from '../shared/report-analytics.mjs';
import {lineTotalCents,checkedSum} from '../shared/domain.mjs';
import {normalizeSqliteError} from './sqlite-errors.mjs';
const now=()=>new Date().toISOString();
const typeChoices=['payable','receivable'];
function atomic(db,fn){
 try{db.exec('BEGIN IMMEDIATE');const result=fn();db.exec('COMMIT');return result;}
 catch(error){try{db.exec('ROLLBACK');}catch{}throw normalizeSqliteError(error);}
}
export function nextMonthlyDue(start,index){
 const [y,m,d]=start.split('-').map(Number);
 const date=new Date(Date.UTC(y,m-1+index,1));
 const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
 date.setUTCDate(Math.min(d,last));
 return date.toISOString().slice(0,10);
}
export function createFinanceP2(db){
 const one=(q,...v)=>db.prepare(q).get(...v);
 const many=(q,...v)=>db.prepare(q).all(...v);
 const exec=(q,...v)=>db.prepare(q).run(...v);
 function groupEntries(id){
  return many("SELECT f.* FROM financial_entries f WHERE recurrence_group_id=? ORDER BY recurrence_index",id).map(e=>{
   const settlements=many('SELECT * FROM finance_settlements WHERE entry_id=? ORDER BY created_at,id',e.id);
   const paid=settlements.reduce((sum,x)=>sum+x.amount_cents,0);
   if(!Number.isSafeInteger(paid)||paid>e.amount_cents)throw new Error('Saldo de recorrência inconsistente.');
   return {...e,paid_cents:paid,remaining_cents:e.amount_cents-paid,settlements};
  });
 }
 function createFinanceSchedule(input,ctx={}){
  const type=assertChoice(input?.type,typeChoices,'Tipo');
  const description=assertLabel(input?.description,'Descrição',200);
  const amount=assertCents(input?.amountCents,'Valor da recorrência');
  if(amount<=0)throw new Error('Valor da recorrência deve ser positivo.');
  const start=assertDate(input?.dueOn);
  if(!start)throw new Error('Informe o vencimento da recorrência.');
  const months=input?.months;
  if(![1,3,6,12].includes(months))throw new Error('Recorrência deve conter 1, 3, 6 ou 12 meses.');
  const category=input?.category?assertLabel(input.category,'Categoria',80):null;
  const key=input?.key?assertLabel(input.key,'Identificador de recorrência',128):randomUUID();
  const normalized={type,description,amount,start,months,category};
  const digest=createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  return atomic(db,()=>{
   const previous=one('SELECT * FROM finance_recurring_groups WHERE request_key=?',key);
   if(previous){
    if(previous.request_hash!==digest)throw new Error('Identificador reutilizado com conteúdo diferente.');
    return {id:previous.id,entries:groupEntries(previous.id),replayed:true};
   }
   const id=randomUUID(),at=now();
   exec('INSERT INTO finance_recurring_groups(id,request_key,request_hash,type,category,created_at,created_by) VALUES(?,?,?,?,?,?,?)',
    id,key,digest,type,category,at,ctx?.operatorId||null);
   for(let index=0;index<months;index++){
    exec(`INSERT INTO financial_entries
      (id,type,description,amount_cents,due_on,status,created_at,category,recurrence_group_id,recurrence_index)
      VALUES(?,?,?,?,?,'open',?,?,?,?)`,
      randomUUID(),type,description,amount,nextMonthlyDue(start,index),at,category,id,index);
   }
   return {id,entries:groupEntries(id),replayed:false};
  });
 }
 function financeOverview(filters={}){
  const from=filters?.from?assertDate(filters.from):null;
  const to=filters?.to?assertDate(filters.to):null;
  if(from&&to&&from>to)throw new Error('Período inválido.');
  const within=date=>(!from||date>=from)&&(!to||date<=to);
  const {start,end}=localDateRange(from,to);
  const range=(alias)=>({sql:(start?' AND '+alias+'.created_at>=?':'')+(end?' AND '+alias+'.created_at<?':''),params:[...(start?[start]:[]),...(end?[end]:[])]});
  const salesRange=range('s'),paidRange=range('fs');
  if(filters.page!==undefined||filters.pageSize!==undefined){
   const page=filters.page??0,pageSize=filters.pageSize??150;
   if(!Number.isSafeInteger(page)||page<0||page>10000000||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>250)throw new Error('Paginação financeira inválida.');
   const timelineSql=`WITH movements AS (
    SELECT 'sale:'||s.id||':'||p.method AS id,s.created_at AS at,'entrada' AS kind,
      'Vendas' AS category,'Venda '||substr(s.id,1,8) AS description,p.method,p.amount_cents,'sale' AS source
    FROM sales s JOIN sale_payments p ON p.sale_id=s.id WHERE s.status='completed' AND s.is_training=0 AND p.method<>'credit'`+salesRange.sql+`
    UNION ALL SELECT 'settlement:'||fs.entry_id||':'||fs.rowid,fs.created_at,CASE WHEN e.type='payable' THEN 'saida' ELSE 'entrada' END,
      COALESCE(e.category,CASE WHEN e.type='payable' THEN 'Despesas' ELSE 'Recebimentos' END),e.description,fs.method,fs.amount_cents,'financial_settlement'
    FROM finance_settlements fs JOIN financial_entries e ON e.id=fs.entry_id WHERE e.status<>'cancelled'`+paidRange.sql+`) `;
   const timelineParams=[...salesRange.params,...paidRange.params];
   const forecastSql=`WITH balances AS (SELECT e.id,e.due_on,e.type,e.category,e.description,
    e.amount_cents-COALESCE((SELECT SUM(fs.amount_cents) FROM finance_settlements fs WHERE fs.entry_id=e.id),0) AS amount_cents
    FROM financial_entries e WHERE e.status='open'`+(from?' AND e.due_on>=?':'')+(to?' AND e.due_on<=?':'')+`) `;
   const forecastParams=[...(from?[from]:[]),...(to?[to]:[])];
   const realized=one(timelineSql+"SELECT COUNT(*) AS n,COALESCE(SUM(CASE WHEN kind='entrada' THEN amount_cents ELSE 0 END),0) AS incoming,COALESCE(SUM(CASE WHEN kind='saida' THEN amount_cents ELSE 0 END),0) AS outgoing FROM movements",...timelineParams);
   const predicted=one(forecastSql+"SELECT COUNT(CASE WHEN amount_cents>0 THEN 1 END) AS n,COALESCE(SUM(CASE WHEN type='receivable' THEN amount_cents ELSE 0 END),0) AS incoming,COALESCE(SUM(CASE WHEN type='payable' THEN amount_cents ELSE 0 END),0) AS outgoing,COALESCE(MIN(amount_cents),0) AS minimum FROM balances",...forecastParams);
   if(predicted.minimum<0)throw new Error('Saldo financeiro inconsistente.');
   const offset=page*pageSize;
   const timeline=offset<realized.n?many(timelineSql+"SELECT * FROM movements ORDER BY at,id LIMIT ? OFFSET ?",...timelineParams,pageSize,offset).map(({at,...record})=>({...record,date:localDateKey(at)})):[];
   const forecastLimit=pageSize-timeline.length;
   const forecasts=forecastLimit>0?many(forecastSql+"SELECT * FROM balances WHERE amount_cents>0 ORDER BY due_on,id LIMIT ? OFFSET ?",...forecastParams,forecastLimit,Math.max(0,offset-realized.n)).map(e=>({id:e.id,date:e.due_on||'Sem vencimento',kind:e.type==='payable'?'saida':'entrada',category:e.category||'Sem categoria',description:e.description,amount_cents:e.amount_cents,source:'forecast',method:'previsto'})):[];
   const sales=one("SELECT COUNT(*) AS n,COALESCE(SUM(s.total_cents),0) AS revenue FROM sales s WHERE s.status='completed' AND s.is_training=0"+salesRange.sql,...salesRange.params);
   const cost=one("SELECT COALESCE(SUM((i.quantity_milli/1000)*i.unit_cost_cents+((i.quantity_milli%1000)*i.unit_cost_cents+500)/1000),0) AS total,COALESCE(SUM(CASE WHEN i.unit_cost_cents=0 THEN 1 ELSE 0 END),0) AS missing FROM sales s JOIN sale_items i ON i.sale_id=s.id WHERE s.status='completed' AND s.is_training=0"+salesRange.sql,...salesRange.params);
   for(const n of [realized.incoming,realized.outgoing,predicted.incoming,predicted.outgoing,sales.revenue,cost.total])if(!Number.isSafeInteger(n)||n<0)throw new Error('Soma financeira excede limite.');
   return {from,to,page,pageSize,total:realized.n+predicted.n,timeline,forecasts,
    realized_in_cents:realized.incoming,realized_out_cents:realized.outgoing,realized_net_cents:realized.incoming-realized.outgoing,
    forecast_in_cents:predicted.incoming,forecast_out_cents:predicted.outgoing,
    margin:{revenue_cents:sales.revenue,cost_cents:cost.total,gross_margin_cents:sales.revenue-cost.total,missing_cost_lines:cost.missing,sales_count:sales.n}};
  }
  const entries=many("SELECT e.*,COALESCE((SELECT SUM(fs.amount_cents) FROM finance_settlements fs WHERE fs.entry_id=e.id),0) AS paid_cents FROM financial_entries e WHERE status='open'"+(from?' AND due_on>=?':'')+(to?' AND due_on<=?':'')+" ORDER BY due_on,id",...([...(from?[from]:[]),...(to?[to]:[])]));
  const paid=many(`SELECT fs.entry_id,fs.amount_cents,fs.method,fs.created_at,
    e.type,e.description,COALESCE(e.category,CASE WHEN e.type='payable' THEN 'Despesas' ELSE 'Recebimentos' END) category
    FROM finance_settlements fs JOIN financial_entries e ON e.id=fs.entry_id WHERE e.status<>'cancelled' `+paidRange.sql,...paidRange.params);
  const direct=many(`SELECT s.created_at,p.amount_cents,p.method,s.id
    FROM sales s JOIN sale_payments p ON p.sale_id=s.id
    WHERE s.status='completed' AND s.is_training=0 AND p.method<>'credit'`+salesRange.sql,...salesRange.params);
  const timeline=[];
  for(const item of direct)if(within(localDateKey(item.created_at))){
    timeline.push({id:'sale:'+item.id+':'+item.method,date:localDateKey(item.created_at),
      kind:'entrada',category:'Vendas',description:'Venda '+item.id.slice(0,8),
      method:item.method,amount_cents:item.amount_cents,source:'sale'});
  }
  for(const entry of paid)if(within(localDateKey(entry.created_at))){
    timeline.push({id:'settlement:'+entry.entry_id+':'+entry.created_at,
      date:localDateKey(entry.created_at),kind:entry.type==='payable'?'saida':'entrada',
      category:entry.category,description:entry.description,method:entry.method,
      amount_cents:entry.amount_cents,source:'financial_settlement'});
  }
  timeline.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  const realizedIn=checkedSum(timeline.filter(x=>x.kind==='entrada').map(x=>x.amount_cents));
  const realizedOut=checkedSum(timeline.filter(x=>x.kind==='saida').map(x=>x.amount_cents));
  const forecasts=[];
  for(const e of entries){
   const remaining=e.amount_cents-e.paid_cents;
   if(!Number.isSafeInteger(remaining)||remaining<0)throw new Error('Saldo financeiro inconsistente.');
   if(e.status==='settled'||!remaining)continue;
   if((e.due_on&&within(e.due_on))||(!e.due_on&&!from&&!to))forecasts.push({
    id:e.id,date:e.due_on||'Sem vencimento',kind:e.type==='payable'?'saida':'entrada',
    category:e.category||'Sem categoria',description:e.description,
    amount_cents:remaining,source:'forecast',method:'previsto'});
  }
  const marginRows=many(`SELECT s.id,s.total_cents,s.created_at,
    i.unit_cost_cents,i.quantity_milli
    FROM sales s JOIN sale_items i ON i.sale_id=s.id
    WHERE s.status='completed' AND s.is_training=0`+salesRange.sql,...salesRange.params);
  const marginSaleIds=new Set(),saleRevenue=new Map();
  let cost=0,missing=0;
  for(const item of marginRows)if(within(localDateKey(item.created_at))){
   marginSaleIds.add(item.id);saleRevenue.set(item.id,item.total_cents);
   cost=checkedSum([cost,lineTotalCents(item.unit_cost_cents,item.quantity_milli)]);
   if(item.unit_cost_cents===0)missing++;
  }
  const revenue=checkedSum(saleRevenue.values());
  const result={from,to,realized_in_cents:realizedIn,realized_out_cents:realizedOut,
   realized_net_cents:realizedIn-realizedOut,
   forecast_in_cents:checkedSum(forecasts.filter(x=>x.kind==='entrada').map(x=>x.amount_cents)),
   forecast_out_cents:checkedSum(forecasts.filter(x=>x.kind==='saida').map(x=>x.amount_cents)),
   timeline,forecasts,margin:{
    revenue_cents:revenue,cost_cents:cost,gross_margin_cents:revenue-cost,
    missing_cost_lines:missing,sales_count:marginSaleIds.size
   }};
  for(const n of [result.realized_in_cents,result.realized_out_cents,result.forecast_in_cents,result.forecast_out_cents,cost,revenue])
   if(!Number.isSafeInteger(n)||n<0)throw new Error('Soma financeira excede limite.');
  return result;
 }
 return {createFinanceSchedule,financeOverview};
}
