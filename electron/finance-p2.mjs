import {randomUUID,createHash} from 'node:crypto';
import {assertCents,assertDate,assertChoice,assertLabel} from '../shared/commerce.mjs';
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
  const entries=many("SELECT * FROM financial_entries WHERE status<>'cancelled' ORDER BY due_on,id");
  const paid=many(`SELECT fs.entry_id,fs.amount_cents,fs.method,fs.created_at,
    e.type,e.description,COALESCE(e.category,CASE WHEN e.type='payable' THEN 'Despesas' ELSE 'Recebimentos' END) category
    FROM finance_settlements fs JOIN financial_entries e ON e.id=fs.entry_id WHERE e.status<>'cancelled'`);
  const direct=many(`SELECT s.created_at,p.amount_cents,p.method,s.id
    FROM sales s JOIN sale_payments p ON p.sale_id=s.id
    WHERE s.status='completed' AND s.is_training=0 AND p.method<>'credit'`);
  const timeline=[];
  for(const item of direct)if(within(item.created_at.slice(0,10))){
    timeline.push({id:'sale:'+item.id+':'+item.method,date:item.created_at.slice(0,10),
      kind:'entrada',category:'Vendas',description:'Venda '+item.id.slice(0,8),
      method:item.method,amount_cents:item.amount_cents,source:'sale'});
  }
  for(const entry of paid)if(within(entry.created_at.slice(0,10))){
    timeline.push({id:'settlement:'+entry.entry_id+':'+entry.created_at,
      date:entry.created_at.slice(0,10),kind:entry.type==='payable'?'saida':'entrada',
      category:entry.category,description:entry.description,method:entry.method,
      amount_cents:entry.amount_cents,source:'financial_settlement'});
  }
  timeline.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  const realizedIn=timeline.filter(x=>x.kind==='entrada').reduce((sum,x)=>sum+x.amount_cents,0);
  const realizedOut=timeline.filter(x=>x.kind==='saida').reduce((sum,x)=>sum+x.amount_cents,0);
  const balances=new Map();
  for(const x of paid)balances.set(x.entry_id,(balances.get(x.entry_id)||0)+x.amount_cents);
  const forecasts=[];
  for(const e of entries){
   const remaining=e.amount_cents-(balances.get(e.id)||0);
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
    WHERE s.status='completed' AND s.is_training=0`);
  const marginSaleIds=new Set(),saleRevenue=new Map();
  let cost=0,missing=0;
  for(const item of marginRows)if(within(item.created_at.slice(0,10))){
   marginSaleIds.add(item.id);saleRevenue.set(item.id,item.total_cents);
   cost+=Math.round(item.unit_cost_cents*item.quantity_milli/1000);
   if(item.unit_cost_cents===0)missing++;
  }
  const revenue=[...saleRevenue.values()].reduce((sum,n)=>sum+n,0);
  const result={from,to,realized_in_cents:realizedIn,realized_out_cents:realizedOut,
   realized_net_cents:realizedIn-realizedOut,
   forecast_in_cents:forecasts.filter(x=>x.kind==='entrada').reduce((sum,x)=>sum+x.amount_cents,0),
   forecast_out_cents:forecasts.filter(x=>x.kind==='saida').reduce((sum,x)=>sum+x.amount_cents,0),
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
