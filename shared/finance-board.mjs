// Agrupamento visual puro. Uma conta ocupa exatamente uma coluna.
export function financeBuckets(entries,today=new Date().toISOString().slice(0,10)){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(today))throw new Error('Data de referência inválida.');
 const groups={overdue:[],upcoming:[],partial:[],settled:[],undated:[]};
 for(const entry of entries||[]){
  if(entry.status==='cancelled')continue;
  if(entry.status==='settled'||entry.remaining_cents===0)groups.settled.push(entry);
  else if(entry.paid_cents>0)groups.partial.push(entry);
  else if(!entry.due_on)groups.undated.push(entry);
  else if(entry.due_on<today)groups.overdue.push(entry);
  else groups.upcoming.push(entry);
 }
 for(const rows of Object.values(groups))rows.sort((a,b)=>(a.due_on||'9999-12-31').localeCompare(b.due_on||'9999-12-31')||String(a.id).localeCompare(String(b.id)));
 return groups;
}
