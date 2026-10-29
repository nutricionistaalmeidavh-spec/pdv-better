import {randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';

// Fila local por estação. Não considera "printed" se o hardware não confirmou o retorno.
// Travamento após enviar bytes pode produzir impressão duplicada no reenvio: operador decide.
export function openPrintQueue(folder){
 mkdirSync(folder,{recursive:true});
 const path=join(folder,'print-jobs.json');
 let jobs=[];
 if(existsSync(path)){
  try{
   const parsed=JSON.parse(readFileSync(path,'utf8'));
   if(!Array.isArray(parsed)||parsed.length>500||
     parsed.some(x=>!x||typeof x.id!=='string'||!['pending','failed','printed'].includes(x.status)||
       !x.payload||typeof x.attempts!=='number'))throw new Error('schema');
   jobs=parsed;
  }catch{throw new Error('Fila de impressão corrompida; arquivo original preservado.');}
 }
 const inflight=new Set();
 function commit(next){
  const temp=path+'.tmp-'+randomUUID();
  try{
   writeFileSync(temp,JSON.stringify(next),{encoding:'utf8',mode:0o600,flag:'wx'});
   renameSync(temp,path);
   jobs=next;
  }catch(error){try{unlinkSync(temp);}catch{}throw error;}
 }
 function list(){return jobs.slice().reverse().map(x=>({...x,payload:{...x.payload}}));}
 function validate(payload){
  if(!payload||!['receipt','receipt-tcp','label','batch-label'].includes(payload.kind))
   throw new Error('Tipo de impressão inválido.');
  const id=payload.kind==='receipt'||payload.kind==='receipt-tcp'?payload.saleId:payload.productId;
  if(typeof id!=='string'||!id.trim()||id.length>128)throw new Error('Identificador de impressão excede limite.');
  if(payload.kind==='batch-label'&&(!payload.batchId||String(payload.batchId).length>128))
   throw new Error('Lote inválido para impressão.');
  if(payload.printer!==undefined&&(typeof payload.printer!=='string'||payload.printer.length>200))
   throw new Error('Impressora inválida.');
  return {kind:payload.kind,...(payload.saleId?{saleId:id}:{}),
   ...(payload.productId?{productId:id}:{}),
   ...(payload.batchId?{batchId:String(payload.batchId)}:{}),
   ...(payload.printer?{printer:payload.printer}:{})};
 }
 function enqueue(payload){
  if(jobs.length>=500)throw new Error('Fila de impressão atingiu o limite. Limpe os itens concluídos.');
  const entry={id:randomUUID(),payload:validate(payload),status:'pending',attempts:0,
   last_error:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  commit([...jobs,entry]);return {...entry};
 }
 function update(id,changes){
  const index=jobs.findIndex(x=>x.id===id);
  if(index<0)throw new Error('Impressão não encontrada na fila.');
  const next=jobs.slice();
  next[index]={...jobs[index],...changes,updated_at:new Date().toISOString()};
  commit(next);return next[index];
 }
 function markFailed(id,error){
  const item=jobs.find(x=>x.id===id);
  if(!item)throw new Error('Impressão não encontrada na fila.');
  return update(id,{status:'failed',attempts:item.attempts+1,last_error:String(error?.message||error).slice(0,200)});
 }
 async function retry(id,send){
  const job=jobs.find(x=>x.id===id);
  if(!job)throw new Error('Impressão não encontrada na fila.');
  if(job.status==='printed')throw new Error('Impressão já concluída, reenvio bloqueado.');
  if(inflight.has(id))throw new Error('Impressão em andamento.');
  if(typeof send!=='function')throw new Error('Impressora indisponível.');
  inflight.add(id);
  update(id,{status:'pending',attempts:job.attempts+1,last_error:null});
  try{
   await send({...job.payload});
   return {...update(id,{status:'printed',last_error:null})};
  }catch(error){update(id,{status:'failed',last_error:String(error?.message||error).slice(0,200)});throw error;}
  finally{inflight.delete(id);}
 }
 function purgePrinted(){
  const next=jobs.filter(x=>x.status!=='printed');
  const removed=jobs.length-next.length;
  commit(next);return {removed};
 }
 return {list,enqueue,markFailed,retry,purgePrinted};
}
