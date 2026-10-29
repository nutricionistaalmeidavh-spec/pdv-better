import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openPrintQueue} from '../electron/print-queue.mjs';

test('PRINT-01: falha de impressão persiste job, tentativa posterior conclui sem duplicar',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'pdv-print-queue-'));
 try{
  let q=openPrintQueue(folder);
  const item=q.enqueue({kind:'receipt',saleId:'sale-qa'});
  assert.equal(item.status,'pending');
  await assert.rejects(q.retry(item.id,async()=>{throw new Error('Impressora desligada.');}),/impressora/i);
  assert.equal(q.list()[0].attempts,1);
  assert.equal(q.list()[0].status,'failed');
  q=openPrintQueue(folder); // reinício de processo
  let sent=0;
  const done=await q.retry(item.id,async input=>{sent++;assert.equal(input.saleId,'sale-qa');return {printed:true};});
  assert.equal(done.status,'printed');
  assert.equal(sent,1);
  assert.equal(q.list()[0].attempts,2);
  await assert.rejects(q.retry(item.id,async()=>{sent++;}),/concluíd|impress/i);
  assert.equal(sent,1);
 }finally{rmSync(folder,{recursive:true,force:true});}
});
test('PRINT-02: rejeita payload estranho e JSON corrompido sem apagar histórico de fila',()=>{
 const folder=mkdtempSync(join(tmpdir(),'pdv-print-queue-'));
 try{
  const q=openPrintQueue(folder);
  assert.throws(()=>q.enqueue({kind:'invalid',saleId:'x'}),/impressão|tipo/i);
  assert.throws(()=>q.enqueue({kind:'receipt',saleId:'a'.repeat(10000)}),/identificador|limite/i);
  writeFileSync(join(folder,'print-jobs.json'),'arquivo corrompido');
  assert.throws(()=>openPrintQueue(folder),/corrompid|inválid|integridade/i);
 }finally{rmSync(folder,{recursive:true,force:true});}
});
