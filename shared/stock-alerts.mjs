// Alertas apenas informativos: não modificam lotes, vendas ou estoque.
const validDate=value=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Data de referência inválida.');
 const time=Date.parse(value+'T12:00:00Z');
 if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value)throw new Error('Data de referência inválida.');
 return time;
};
export function deriveStockAlerts(products,batches,today,days=30){
 const now=validDate(today);
 if(!Number.isInteger(days)||days<0||days>365)throw new Error('Janela de validade inválida.');
 const active=(Array.isArray(products)?products:[]).filter(p=>p.active!==0);
 const ids=new Set(active.map(p=>p.id));
 const outOfStock=active.filter(p=>p.stock_milli<=0);
 const lowStock=active.filter(p=>p.stock_milli>0&&p.stock_milli<=(p.unit==='UN'?2000:1000));
 const expired=[],expiring=[];
 for(const lot of (Array.isArray(batches)?batches:[])){
  if(!ids.has(lot.product_id)||lot.remaining_milli<=0)continue;
  const due=validDate(lot.expires_on),left=Math.floor((due-now)/86400000);
  const item={...lot,days_until_expiry:left,product_name:active.find(p=>p.id===lot.product_id)?.name||lot.product_id};
  if(left<0)expired.push(item);
  else if(left<=days)expiring.push(item);
 }
 return {outOfStock,lowStock,expired,expiring};
}
