import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,writeFileSync,existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCatalog } from '../electron/db.mjs';
import { makeReceipt,drawerPulse,parseScaleWeight,assertDeviceAddress } from '../shared/peripherals.mjs';
import { sendTcp,readScale } from '../electron/peripherals.mjs';
import { startLanServer, requestLan, ALLOWED_RPC } from '../electron/lan.mjs';
import { createRuntime } from '../electron/runtime.mjs';
import { verifyDatabase,stageRestore,scheduleRestore,applyPendingRestore } from '../electron/backup.mjs';
import { createServer } from 'node:net';

test('cupom ESC/POS contém dados e corte; pulso de gaveta não dispara com impressão',()=>{
 const sale={id:'abc-123',created_at:'2026-10-28T10:00:00Z',total_cents:1250,change_cents:250,
   items:[{name:'Pão de queijo',quantity_milli:1000,unit:'UN',line_total_cents:1250}],payments:[{method:'cash',amount_cents:1250}]};
 const data=makeReceipt(sale);
 assert.ok(Buffer.isBuffer(data));
 assert.match(data.toString('latin1'),/NAO FISCAL/);
 assert.match(data.toString('latin1'),/Pao de queijo/);
 assert.equal(data.at(-3),0x1d);assert.equal(data.at(-2),0x56);
 assert.deepEqual([...drawerPulse().subarray(0,3)],[0x1b,0x70,0x00]);
 assert.equal(data.indexOf(drawerPulse()),-1,'a impressão não deve abrir a gaveta automaticamente');
});
test('balança aceita apenas leituras estáveis e válidas',()=>{
 assert.equal(parseScaleWeight('ST,GS,   0.750kg\\r\\n'),750);
 assert.equal(parseScaleWeight('ST,GS,+001.250kg'),1250);
 assert.throws(()=>parseScaleWeight('US,GS,0.750kg'),/instável/i);
 assert.throws(()=>parseScaleWeight('ST,GS,-0.750kg'),/inválid/i);
 assert.throws(()=>parseScaleWeight('lixo'),/não reconhecid/i);
});
test('endereços de periféricos não permitem destino público, DNS ou zero',()=>{
 assert.equal(assertDeviceAddress('192.168.1.20',9100).port,9100);
 assert.throws(()=>assertDeviceAddress('example.com',9100),/privada/i);
 assert.throws(()=>assertDeviceAddress('8.8.8.8',9100),/privada/i);
 assert.throws(()=>assertDeviceAddress('192.168.1.1',0),/porta/i);
});
test('escrita TCP e leitura simulada de balança pela rede local',async()=>{
 let received=Buffer.alloc(0);
 let receivedSignal;
 const receivedReady=new Promise(resolve=>{receivedSignal=resolve;});
 const printer=createServer(socket=>socket.on('data',data=>{received=Buffer.concat([received,data]);receivedSignal();socket.end();}));
 await new Promise(resolve=>printer.listen(0,'127.0.0.1',resolve));
 try{
   const port=printer.address().port;
   await sendTcp({host:'127.0.0.1',port},Buffer.from([0x1b,0x40]));
   await receivedReady;
   assert.deepEqual([...received],[0x1b,0x40]);
 }finally{await new Promise(resolve=>printer.close(resolve));}
 const scale=createServer(socket=>{socket.end('ST,GS,0.825kg\\r\\n');});
 await new Promise(resolve=>scale.listen(0,'127.0.0.1',resolve));
 try{assert.equal(await readScale({host:'127.0.0.1',port:scale.address().port}),825);}
 finally{await new Promise(resolve=>scale.close(resolve));}
});
test('LAN rejeita ausência de chave e chamadas não autorizadas; opera na fonte canônica',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'pdv-c-lan-')), store=openCatalog(join(dir,'db.sqlite'));
 const p=store.save('products',{name:'Água',sale_price_cents:'3,50',stock_milli:'3',unit:'UN'});
 const token='a'.repeat(64);
 const lan=await startLanServer({host:'127.0.0.1',port:0,token,store});
 const address='http://127.0.0.1:'+lan.port;
 const admin=await requestLan(address,token,'authBootstrap',[{name:'Admin teste',password:'SenhaSegura2026'}]);
 const auth=admin.token;
 try{
   assert.ok(ALLOWED_RPC.includes('checkout'));
   await assert.rejects(requestLan(address,'b'.repeat(64),'list',['products']),/acesso|autoriz/i);
   await assert.rejects(requestLan(address,token,'close',[]),/não permitida/i);
   const rows=await requestLan(address,token,'list',['products'],auth);
   assert.equal(rows[0].id,p.id);
   await requestLan(address,token,'openSession',[{openingCashCents:0}],auth);
   const payload={key:'lan-one',items:[{id:p.id,quantityMilli:1000}],payments:[{method:'cash',amountCents:350}]};
   const [x,y]=await Promise.all([requestLan(address,token,'checkout',[payload],auth),requestLan(address,token,'checkout',[payload],auth)]);
   assert.equal(x.id,y.id);
   assert.equal(store.listSales().length,1);
   assert.equal(store.list('products')[0].stock_milli,2000);
 }finally{await lan.close();store.close();rmSync(dir,{recursive:true,force:true});}
});
test('backup usa snapshot SQLite consistente e restauração rejeita arquivo corrompido',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'pdv-c-backup-'));
 const source=join(dir,'working.sqlite'),backup=join(dir,'backup.sqlite');
 const store=openCatalog(source);
 try{
   store.save('products',{name:'Produto Backup',sale_price_cents:'1,00',stock_milli:'5',unit:'UN'});
   await store.backupTo(backup);
   assert.ok(existsSync(backup));
   assert.equal(verifyDatabase(backup).version,5);
   const snapshot=openCatalog(backup);
   try{assert.equal(snapshot.list('products')[0].name,'Produto Backup');}
   finally{snapshot.close();}
   const corrupt=join(dir,'corrupt.sqlite');writeFileSync(corrupt,'not a SQLite database');
   assert.throws(()=>stageRestore(corrupt,source),/inválid|corrompid/i);
   const staged=stageRestore(backup,source);
   assert.ok(existsSync(staged.stagedPath));assert.equal(staged.version,4);
   assert.equal(store.list('products').length,1);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('restauração agendada troca banco íntegro e preserva cópia de segurança para rollback',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'pdv-c-restore-'));
  const active=join(dir,'active.sqlite'),source=join(dir,'source.sqlite');
  try{
    let store=openCatalog(active);
    store.save('products',{name:'Antigo',unit:'UN',sale_price_cents:'2,00'});
    store.close();
    store=openCatalog(source);
    store.save('products',{name:'Restaurado',unit:'UN',sale_price_cents:'9,00'});
    store.close();
    assert.equal(scheduleRestore(source,active).pending,true);
    const result=applyPendingRestore(active);
    assert.equal(result.restored,true);
    assert.equal(verifyDatabase(result.previous).version,5);
    store=openCatalog(active);
    assert.equal(store.list('products')[0].name,'Restaurado');
    store.close();
    const retained=openCatalog(result.previous);
    assert.equal(retained.list('products')[0].name,'Antigo');
    retained.close();
    assert.equal(applyPendingRestore(active).restored,false);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('terminal auxiliar autentica e grava somente no host; offline nunca muda para base própria',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'pdv-c-two-stations-'));
  const hostStore=openCatalog(join(dir,'server.sqlite'));
  const clientStore=openCatalog(join(dir,'client.sqlite'));
  const key='d'.repeat(64);
  const lan=await startLanServer({host:'127.0.0.1',port:0,token:key,store:hostStore});
  const secure={isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from(value,'utf8'),decryptString:buffer=>buffer.toString('utf8')};
  const adm=hostStore.authBootstrap({name:'Admin remoto',password:'SenhaRemota2026'},'legacy');
  const remote=await createRuntime({store:clientStore,folder:dir,safeStorage:secure});
  try{
    assert.equal((await remote.join({address:'http://127.0.0.1:'+lan.port+'/',secret:key})).mode,'client');
    await remote.login({operatorId:adm.user.id,password:'SenhaRemota2026'});
    const result=await remote.call('save','products',{name:'Host stock',unit:'UN',sale_price_cents:'1,20',stock_milli:'3'});
    assert.equal(hostStore.list('products')[0].id,result.id);
    assert.equal(clientStore.list('products').length,0);
    // Sair do modo terminal não replica os dados para o SQLite local.
    await remote.local();
    assert.deepEqual(clientStore.list('products'),[]);
  } finally{
    await remote.stop();
    await lan.close();
    hostStore.close();clientStore.close();
    rmSync(dir,{recursive:true,force:true});
  }
});
