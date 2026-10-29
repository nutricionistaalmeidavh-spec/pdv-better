import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openCatalog} from '../electron/db.mjs';
import {scheduleRestore,applyPendingRestore} from '../electron/backup.mjs';
test('REST-01: restauração pendente duplicada não cria arquivo órfão',()=>{
 const folder=mkdtempSync(join(tmpdir(),'pdv-restore-leak-'));
 const target=join(folder,'active.sqlite'),backup=join(folder,'backup.sqlite');
 try{
  const store=openCatalog(target);store.close();
  const other=openCatalog(backup);other.close();
  scheduleRestore(backup,target);
  const before=readdirSync(folder).sort();
  assert.throws(()=>scheduleRestore(backup,target),/pendente|agendad/i);
  assert.deepEqual(readdirSync(folder).sort(),before);
  const done=applyPendingRestore(target);
  assert.equal(done.restored,true);
 }finally{rmSync(folder,{recursive:true,force:true});}
});
test('REST-02: snapshot corrompido após agendamento preserva base ativa',()=>{
 const folder=mkdtempSync(join(tmpdir(),'pdv-restore-crash-'));
 const target=join(folder,'active.sqlite'),backup=join(folder,'backup.sqlite');
 try{
  let store=openCatalog(target);store.save('products',{name:'Histórico preservado',code:'REST-KEEP',unit:'UN',sale_price_cents:'1,00',stock_milli:'2'});store.close();
  store=openCatalog(backup);store.close();
  scheduleRestore(backup,target);
  const stage=readdirSync(folder).find(x=>x.startsWith('.restore-'));
  writeFileSync(join(folder,stage),'conteudo corrompido');
  assert.throws(()=>applyPendingRestore(target),/corromp|backup|SQLite|integridade/i);
  const saved=openCatalog(target);
  assert.equal(saved.list('products')[0].code,'REST-KEEP');
  saved.close();
 }finally{rmSync(folder,{recursive:true,force:true});}
});
