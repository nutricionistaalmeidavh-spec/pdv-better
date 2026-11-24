import {parentPort} from 'node:worker_threads';
import {writeFile} from 'node:fs/promises';
import {readTransferFile,makeTransferXlsx} from './data-transfer-file.mjs';
import {writeCsv} from '../shared/data-transfer.mjs';
parentPort.once('message',async input=>{
 try{
  if(input.operation==='read'){
   parentPort.postMessage({ok:true,data:await readTransferFile(input.format,input.bytes)});
  }else if(input.operation==='write'){
   const data=input.format==='csv'?writeCsv(input.table):await makeTransferXlsx(input.kind,input.table);
   await writeFile(input.filename,data);
   parentPort.postMessage({ok:true,data:true});
  }else throw new Error('Operação de planilha inválida.');
 }catch(err){parentPort.postMessage({ok:false,error:String(err?.message||err)});}
});
