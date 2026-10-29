import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {makeReceipt,drawerPulse} from '../shared/peripherals.mjs';
import {sendTcp,readScale} from '../electron/peripherals.mjs';
import {openPrintQueue} from '../electron/print-queue.mjs';
import {startVirtualEscPosPrinter,startVirtualScale} from '../scripts/virtual-device-lab.mjs';

test('VM-PRN-01: impressora ESC/POS virtual TCP recebe bytes de cupom e corte, sem pulso de gaveta',async()=>{
 const server=await startVirtualEscPosPrinter();
 try{
  const sale={id:'VM-TEST-01',created_at:'2026-10-29T12:00:00Z',total_cents:1250,change_cents:0,
   items:[{name:'Cafe virtual',quantity_milli:1000,unit:'UN',line_total_cents:1250}],
   payments:[{method:'pix',amount_cents:1250}]};
  const receipt=makeReceipt(sale);
  assert.equal((await sendTcp(server.target,receipt)).sentBytes,receipt.length);
  const actual=await server.nextDocument();
  assert.deepEqual(actual,receipt,'a impressora virtual deve receber exatamente os bytes gerados pelo sistema');
  assert.ok(actual.includes(Buffer.from([0x1d,0x56,0x00])),'corte ESC/POS');
  assert.ok(!actual.includes(drawerPulse()),'gaveta nunca abre na impressão normal');
 }finally{await server.close();}
});

test('VM-SCL-01: balança virtual TCP aceita peso estável, rejeita leitura instável e silêncio',async()=>{
 const stable=await startVirtualScale({reply:'ST,GS,0.350kg\r\n'});
 const unstable=await startVirtualScale({reply:'US,GS,0.350kg\r\n'});
 const silent=await startVirtualScale({reply:null});
 try{
  assert.equal(await readScale(stable.target,1000),350);
  await assert.rejects(readScale(unstable.target,1000),/instável/i);
  await assert.rejects(readScale(silent.target,150),/não respondeu/i);
 }finally{await Promise.all([stable.close(),unstable.close(),silent.close()]);}
});

test('VM-PRN-02: falha TCP mantém impressão na fila em disco e reenvio funciona após reinício',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'vm-print-spool-'));
 const initial=await startVirtualEscPosPrinter();
 let recovered=null;
 try{
  const target=initial.target;
  await initial.close();
  let queue=openPrintQueue(folder);
  const queued=queue.enqueue({kind:'receipt-tcp',saleId:'VM-QUEUE-01'});
  await assert.rejects(queue.retry(queued.id,()=>sendTcp(target,Buffer.from('teste'),300)),/TCP|impressora/i);
  assert.equal(queue.list()[0].status,'failed');
  queue=openPrintQueue(folder);
  assert.equal(queue.list()[0].attempts,1);
  recovered=await startVirtualEscPosPrinter();
  const payload=Buffer.from('VM-QUEUE-DATA','ascii');
  const sent=await queue.retry(queued.id,()=>sendTcp(recovered.target,payload));
  assert.equal(sent.status,'printed');
  assert.deepEqual(await recovered.nextDocument(),payload);
  await assert.rejects(queue.retry(queued.id,()=>sendTcp(recovered.target,payload)),/concluíd/i);
 }finally{await recovered?.close();rmSync(folder,{recursive:true,force:true});}
});
