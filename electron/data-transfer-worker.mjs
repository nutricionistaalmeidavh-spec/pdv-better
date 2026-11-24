import {parentPort} from 'node:worker_threads';
import {writeFile,open,rename,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {iterateTransferRows} from './data-transfer.mjs';
import {readTransferFile,makeTransferXlsx,writeTransferXlsx} from './data-transfer-file.mjs';
import {writeCsv} from '../shared/data-transfer.mjs';
parentPort.once('message',async input=>{
 try{
  if(input.operation==='read'){
   parentPort.postMessage({ok:true,data:await readTransferFile(input.format,input.bytes)});
  }else if(input.operation==='export'){
   const db=new DatabaseSync(input.databaseFile,{readOnly:true});
   const temporary=input.filename+'.pdv-'+randomUUID()+'.tmp';
   let count=0;
   try{
    db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=5000; BEGIN;');
    const rows=iterateTransferRows(db,input.kind);
    if(input.format==='xlsx')count=await writeTransferXlsx(input.kind,rows,temporary);
    else if(input.format==='csv'){
     const file=await open(temporary,'wx');
     try{
      let first=true,chunk=[];
      const flush=async()=>{if(!chunk.length)return;const csv=writeCsv(chunk);await file.writeFile(first?csv:csv.slice(1));first=false;chunk=[];};
      for(const row of rows){chunk.push(row);count++;if(chunk.length===500)await flush();}
      await flush();count--;
     }finally{await file.close();}
    }else throw new Error('Formato inválido.');
    db.exec('COMMIT');
    await rename(temporary,input.filename);
    parentPort.postMessage({ok:true,data:count});
   }finally{db.close();await rm(temporary,{force:true}).catch(()=>{});}
  }else if(input.operation==='write'){
   const data=input.format==='csv'?writeCsv(input.table):await makeTransferXlsx(input.kind,input.table);
   await writeFile(input.filename,data);
   parentPort.postMessage({ok:true,data:true});
  }else throw new Error('Operação de planilha inválida.');
 }catch(err){parentPort.postMessage({ok:false,error:String(err?.message||err)});}
});
