import {Worker} from 'node:worker_threads';
export async function renderItemReportWorker(format,report,{timeoutMs=45000}={}){
 if(!['csv','html','xlsx'].includes(format))throw new Error('Formato de relatório inválido.');
 if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>120000)throw new Error('Timeout de relatório inválido.');
 return new Promise((resolve,reject)=>{
  let worker,done=false;
  const complete=(err,result)=>{
   if(done)return;
   done=true;clearTimeout(timer);
   if(worker)void worker.terminate();
   if(err)reject(err);else resolve(result);
  };
  // Erros assíncronos retornam ao renderer sem deixar o processo principal bloqueado.
  const timer=setTimeout(()=>complete(new Error('Worker de relatório excedeu o limite de processamento.')),timeoutMs);
  try{
   worker=new Worker(new URL('./item-report-worker.mjs',import.meta.url));
   worker.once('message',message=>{
    if(message?.ok)complete(null,message.data);
    else complete(new Error(message?.error||'Falha ao gerar relatório offline.'));
   });
   worker.once('error',error=>complete(error));
   worker.once('exit',code=>{if(code!==0)complete(new Error('Worker de relatório encerrado antes da conclusão.'));});
   worker.postMessage({format,report});
  }catch(error){complete(error);}
 });
}
