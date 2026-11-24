import {Worker} from 'node:worker_threads';
export function runTransferWorker(input){
 return new Promise((resolve,reject)=>{
  let worker,done=false;
  const finish=(err,result)=>{
   if(done)return;done=true;clearTimeout(timer);
   if(worker)void worker.terminate();
   if(err)reject(err);else resolve(result);
  };
  const timer=setTimeout(()=>finish(new Error('Processamento da planilha excedeu 120 segundos.')),120000);
  try{
   worker=new Worker(new URL('./data-transfer-worker.mjs',import.meta.url));
   worker.once('message',m=>m?.ok?finish(null,m.data):finish(new Error(m?.error||'Falha no processamento de planilha.')));
   worker.once('error',err=>finish(err));
   worker.once('exit',()=>{if(!done)finish(new Error('Processamento da planilha interrompido.'));});
   worker.postMessage(input);
  }catch(e){finish(e);}
 });
}
