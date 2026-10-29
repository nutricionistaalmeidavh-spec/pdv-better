import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {tmpdir,release} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {openCatalog} from '../electron/db.mjs';
import {scheduleRestore,applyPendingRestore} from '../electron/backup.mjs';
import {normalizeSqliteError} from '../electron/sqlite-errors.mjs';

const results=[];
const output=join(process.cwd(),'qa-artifacts','virtual-windows-lab');
mkdirSync(output,{recursive:true});
const assertIntegrity=filename=>{
 const db=new DatabaseSync(filename,{readOnly:true});
 try{assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');}
 finally{db.close();}
};
async function scenario(id,description,fn){
 const t=Date.now();
 try{
  const details=await fn();
  results.push({id,description,result:'PASS',duration_ms:Date.now()-t,details:details||{}});
  console.log('PASS '+id+' — '+description);
 }catch(error){
  results.push({id,description,result:'FAIL',duration_ms:Date.now()-t,error:String(error?.stack||error)});
  console.error('FAIL '+id+' — '+String(error?.stack||error));
  process.exitCode=1;
 }
}
async function runChild(mode,database,productId){
 const script=new URL('./qa-vm-sqlite-child.mjs',import.meta.url);
 const child=spawn(process.execPath,[fileURLToPath(script),mode,database,productId],{
  stdio:['ignore','pipe','pipe'],windowsHide:true
 });
 let stderr='';
 child.stderr.on('data',buf=>stderr+=buf.toString('utf8'));
 try{
  await new Promise((resolve,reject)=>{
   let output='';
   const timer=setTimeout(()=>reject(new Error('Processo SQLite não sinalizou início em 15s. '+stderr)),15000);
   const finish=error=>{clearTimeout(timer);child.stdout.removeAllListeners('data');child.removeAllListeners('exit');child.removeAllListeners('error');error?reject(error):resolve();};
   child.on('error',error=>finish(error));
   child.on('exit',code=>finish(new Error('Processo SQLite encerrou antes de ser interrompido: '+code+' '+stderr)));
   child.stdout.on('data',data=>{
    output+=data.toString('utf8');
    if(output.includes('VM-READY'))finish(null);
   });
  });
  const exited=once(child,'exit');
  if(!child.kill())throw new Error('Não foi possível encerrar o processo SQLite virtual.');
  await exited;
  return {termination:'forced',child_mode:mode};
 }finally{
  if(child.exitCode===null)child.kill();
 }
}

await scenario('VM-DB-01','Processo abortado ANTES do COMMIT perde somente a transação incompleta',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'pdv-vm-kill-rollback-'));
 const filename=join(folder,'store.sqlite');
 try{
  const store=openCatalog(filename);
  const p=store.save('products',{name:'Produto fictício de queda',code:'VM-CRASH-1',unit:'UN',
   sale_price_cents:'12,50',stock_milli:'4'});
  store.close();
  const crash=await runChild('uncommitted',filename,p.id);
  const reopened=openCatalog(filename);
  try{
   assert.equal(reopened.list('products').find(x=>x.id===p.id).stock_milli,4000);
   assert.equal(reopened.listSales().length,0);
   assert.equal(reopened.listStockMovements(p.id).reduce((n,x)=>n+x.delta_milli,0),4000);
   assertIntegrity(filename);
   const next=reopened.save('products',{name:'Gravação depois da queda',code:'VM-CRASH-AFTER',unit:'UN',sale_price_cents:'1,50',stock_milli:'1'});
   assert.ok(next.id);
   return {...crash,stock_milli:4000,integrity:'ok',post_recovery_write:true};
  }finally{reopened.close();}
 }finally{rmSync(folder,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});

await scenario('VM-DB-02','Processo abortado DEPOIS do COMMIT mantém venda/estoque sem duplicação',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'pdv-vm-kill-committed-'));
 const filename=join(folder,'store.sqlite');
 try{
  const store=openCatalog(filename);
  const p=store.save('products',{name:'Produto fictício commit',code:'VM-CRASH-2',unit:'UN',
   sale_price_cents:'5,00',stock_milli:'3'});
  store.openSession({openingCashCents:0});
  store.close();
  const crash=await runChild('committed',filename,p.id);
  const reopened=openCatalog(filename);
  try{
   assert.equal(reopened.listSales().length,1);
   assert.equal(reopened.list('products').find(x=>x.id===p.id).stock_milli,2000);
   const saved=reopened.getSale(reopened.listSales()[0].id);
   assert.equal(saved.total_cents,500);
   assert.equal(reopened.report().sales_total_cents,500);
   assertIntegrity(filename);
   return {...crash,completed_sales:1,stock_milli:2000,integrity:'ok'};
  }finally{reopened.close();}
 }finally{rmSync(folder,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});

await scenario('VM-DB-03','SQLite limita páginas no disco virtual e recupera após SQLITE_FULL',()=>{
 const folder=mkdtempSync(join(tmpdir(),'pdv-vm-sqlite-full-'));
 const filename=join(folder,'quota.sqlite');
 let db;
 try{
  db=new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE records (id INTEGER PRIMARY KEY, content BLOB NOT NULL);');
  const before=db.prepare('PRAGMA page_count').get().page_count;
  db.exec('PRAGMA max_page_count='+(before+3));
  const actualLimit=db.prepare('PRAGMA max_page_count').get().max_page_count;
  assert.equal(actualLimit,before+3);
  let thrown;
  try{
   db.exec('BEGIN IMMEDIATE');
   const insert=db.prepare('INSERT INTO records(content) VALUES(?)');
   for(let i=0;i<200;i++)insert.run(Buffer.alloc(65536,1));
  }catch(error){thrown=error;}
  assert.ok(thrown,'o limite de páginas precisa causar SQLITE_FULL real');
  assert.match(normalizeSqliteError(thrown).message,/disco|espaço|armazenamento/i);
  try{db.exec('ROLLBACK');}catch{/* SQLITE_FULL pode reverter automaticamente a transação */}
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM records').get().total,0);
  assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
  db.exec('PRAGMA max_page_count=1000');
  db.prepare('INSERT INTO records(content) VALUES(?)').run(Buffer.from('recuperado'));
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM records').get().total,1);
  return {fault:'SQLITE_FULL',mechanism:'PRAGMA max_page_count',integrity:'ok',post_recovery_write:true};
 }finally{try{db?.close();}catch{}rmSync(folder,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});

await scenario('VM-DB-04','Backup agendado e cópia staging corrompida não substituem SQLite válido',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'pdv-vm-restore-'));
 const database=join(folder,'active.sqlite'),backup=join(folder,'backup.sqlite');
 try{
  const store=openCatalog(database);
  store.save('products',{name:'Original preservado',code:'VM-KEEP',unit:'UN',sale_price_cents:'2,00',stock_milli:'3'});
  await store.backupTo(backup);
  store.close();
  scheduleRestore(backup,database);
  const staged=readdirSync(folder).find(x=>x.startsWith('.restore-')&&x.endsWith('.sqlite'));
  assert.ok(staged);
  writeFileSync(join(folder,staged),Buffer.from('arquivo virtual corrompido'));
  assert.throws(()=>applyPendingRestore(database),/backup|corrompid|integridade|inval/i);
  const reopened=openCatalog(database);
  try{
   assert.equal(reopened.list('products')[0].code,'VM-KEEP');
   assertIntegrity(database);
   return {integrity:'ok',original_preserved:true};
  }finally{reopened.close();}
 }finally{rmSync(folder,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});

const report={
 title:'PDV Plus — laboratório virtual Windows',
 timestamp:new Date().toISOString(),
 environment:{platform:process.platform,arch:process.arch,windows_version:release(),node:process.version,
  run_id:process.env.GITHUB_RUN_ID||null,sha:process.env.GITHUB_SHA||null},
 total:results.length,passed:results.filter(x=>x.result==='PASS').length,failed:results.filter(x=>x.result==='FAIL').length,
 tests:results,
 limitations:[
  'SQLite max_page_count simula falta de espaço SQLite; não desliga fisicamente o disco e não simula perda completa de energia.',
  'Encerramento forçado do processo é real dentro da VM, mas não desliga o host nem provoca falha física de SSD.',
  'O hardware ESC/POS, balança TCP e leitor USB/HID são simulados; compatibilidade elétrica, driver USB, porta serial COM e comportamento de modelos reais exigem teste com equipamentos.',
  'Envio TCP bem-sucedido não é comprovação física de papel impresso.'
 ]
};
writeFileSync(join(output,'results-'+process.platform+'.json'),JSON.stringify(report,null,2));
const md=['# Laboratório VM Windows', '', 'Execução: '+report.timestamp,'Plataforma: '+process.platform+' '+release(),
 'Resultado: '+report.passed+'/'+report.total+' cenários aprovados', '',
 ...results.map(t=>'- '+t.result+' '+t.id+': '+t.description),
 '', '## Limites das simulações', ...report.limitations.map(x=>'- '+x)];
writeFileSync(join(output,'REPORT-'+process.platform+'.md'),md.join('\n')+'\n');
console.log('VM-FAULT-LAB '+report.passed+'/'+report.total+' cenários. Evidências: '+output);
