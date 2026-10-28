// QA F51-F54: LAN, terminal remoto, backup e restauração com reinício real.
// Usa duas instâncias Electron e diretórios SQLite exclusivos desta execução.
// Diálogos nativos de arquivos são automatizados; relaunch externo é suprimido
// para que o mesmo runner controle explicitamente a inicialização seguinte.
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const work=mkdtempSync(join(tmpdir(),'pdv-f51-f54-'));
const hostDir=join(work,'host'),clientDir=join(work,'client'),backupFile=join(work,'backup-f53.sqlite');
const executable=process.env.PDV_TEST_APP_EXECUTABLE;
const password='RedeBackupQA2026!';
let hostApp,clientApp,host,client;
const ok=new Set();
const pass=(id,description)=>{ok.add(id);console.log('PASS '+id+': '+description);};
const call=(page,method,...args)=>page.evaluate(async ({method,args})=>window.pdv[method](...args),{method,args});
const error=(page,method,...args)=>page.evaluate(async ({method,args})=>{
  try{await window.pdv[method](...args);return null;}
  catch(e){return String(e?.message||e);}
},{method,args});
const menu=(page,name)=>page.getByRole('navigation',{name:'Navegação principal'}).getByRole('button',{name,exact:true});
async function launch(dataDir){
  return electron.launch({
    ...(executable?{executablePath:executable}:{}),
    args:executable?[]:['.'],
    env:{...process.env,PDV_TEST_USER_DATA:dataDir,PDV_TEST_SMOKE:'1'},
    timeout:45000
  });
}
async function openPort(){
  const server=createServer();
  await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}
async function login(page,label,pw){
  await page.getByRole('heading',{name:'PDV Better',exact:true}).waitFor({timeout:30000});
  await page.getByRole('combobox',{name:'Operador'}).selectOption({label});
  await page.locator('.auth-form input[type="password"]').first().fill(pw);
  await page.getByRole('button',{name:'Entrar no PDV'}).click();
  await page.getByRole('heading',{name:'Bem-vindo ao PDV Better'}).waitFor({timeout:25000});
}
async function settings(page){
  await menu(page,'Dispositivos e rede').click();
  await page.getByRole('heading',{name:'Dispositivos, rede e backups'}).waitFor();
}
try{
  hostApp=await launch(hostDir);
  host=await hostApp.firstWindow();
  const hostErrors=[];
  host.on('pageerror',e=>hostErrors.push(e.message));
  await host.getByRole('heading',{name:'PDV Better',exact:true}).waitFor({timeout:30000});
  await host.getByRole('textbox',{name:'Nome do administrador'}).fill('Administrador LAN QA');
  await host.locator('.auth-form input[type="password"]').nth(0).fill(password);
  await host.locator('.auth-form input[type="password"]').nth(1).fill(password);
  await host.getByRole('button',{name:'Criar administrador'}).click();
  await host.getByRole('heading',{name:'Bem-vindo ao PDV Better'}).waitFor({timeout:30000});
  const operator=(await call(host,'authStatus')).operators.find(x=>x.role==='Administrador');
  assert.ok(operator?.id);
  const baseline=await call(host,'save','products',{
    name:'Produto Canônico LAN QA',code:'LAN-BACKUP-51',unit:'UN',
    sale_price_cents:'19,90',stock_milli:'12,000'
  });
  assert.ok(baseline.id);

  // F51 — hospedar no loopback, UI e segurança do pareamento.
  await settings(host);
  const port=await openPort();
  await host.locator('label.settings-label').filter({hasText:'Porta do servidor'}).locator('input').fill(String(port));
  await host.getByRole('button',{name:'Ativar servidor LAN'}).click();
  await host.getByRole('status').filter({hasText:'Servidor LAN ativado.'}).waitFor();
  const lan=await call(host,'lanStatus');
  assert.equal(lan.mode,'host');
  assert.equal(lan.port,port);
  assert.match(lan.pairingKey,/^[a-f0-9]{64}$/i);
  assert.equal(await host.getByText('Servidor LAN', {exact:true}).count(),1);
  const address='http://127.0.0.1:'+port+'/';
  const health=await fetch('http://127.0.0.1:'+port+'/health');
  assert.equal(health.status,200);
  assert.equal((await health.json()).ready,true);
  const invalid=await fetch('http://127.0.0.1:'+port+'/rpc',{
    method:'POST',headers:{authorization:'Bearer '+('0'.repeat(64)),'content-type':'application/json'},
    body:JSON.stringify({method:'authStatus',args:[]})
  });
  assert.equal(invalid.status,401);
  pass('F51','servidor LAN ativado via UI, health OK, chave de pareamento e acesso indevido bloqueado');

  // F52 — segunda instância Electron, SQLite local independente e autenticação remota.
  clientApp=await launch(clientDir);
  client=await clientApp.firstWindow();
  const clientErrors=[];
  client.on('pageerror',e=>clientErrors.push(e.message));
  await client.getByRole('heading',{name:'PDV Better',exact:true}).waitFor({timeout:30000});
  assert.equal((await call(client,'authStatus')).setupRequired,true);
  assert.match(String(await error(client,'lanJoin',{address,secret:'chave-errada'})),/chave/i);
  const joined=await call(client,'lanJoin',{address,secret:lan.pairingKey});
  assert.equal(joined.mode,'client');
  assert.equal(joined.address,address);
  await client.reload();
  await login(client,'Administrador LAN QA — Administrador',password);
  await menu(client,'Produtos').click();
  await client.getByRole('heading',{name:'Produtos',exact:true}).waitFor();
  await client.getByRole('cell',{name:'Produto Canônico LAN QA'}).waitFor();
  const remoteRows=await call(client,'list','products');
  assert.equal(remoteRows.find(x=>x.id===baseline.id)?.code,'LAN-BACKUP-51');
  const remoteCustomer=await call(client,'save','customers',{name:'Cliente criado no terminal LAN QA'});
  assert.ok(remoteCustomer?.id);
  assert.equal((await call(host,'list','customers')).some(x=>x.id===remoteCustomer.id),true);
  const a=await call(host,'sessionOpen',{openingCashCents:'70,00'});
  const b=await call(client,'sessionOpen',{openingCashCents:'10,00'});
  assert.notEqual(a.id,b.id);
  assert.equal((await call(host,'sessionsList')).length,2);
  assert.equal((await call(client,'sessionCurrent')).id,b.id);
  await call(client,'sessionClose',{countedCashCents:'10,00'});
  assert.equal((await call(host,'sessionCurrent')).id,a.id);
  await call(host,'sessionClose',{countedCashCents:'70,00'});
  assert.equal((await call(host,'sessionsList')).length,0);
  // Sem fallback automático/copiar banco local: o cliente ainda não foi configurado nele.
  await client.getByRole('button',{name:'Sair',exact:true}).click();
  await client.getByRole('heading',{name:'PDV Better',exact:true}).waitFor();
  const isolated=await call(client,'lanLocal');
  assert.equal(isolated.mode,'local');
  assert.equal((await call(client,'authStatus')).setupRequired,true);
  assert.deepEqual((await call(host,'list','customers')).map(x=>x.id),[remoteCustomer.id]);
  assert.deepEqual(clientErrors,[]);
  await clientApp.close();clientApp=null;
  pass('F52','segundo Electron conecta e grava na base do host; sessões por terminal; retorno local isolado');

  // F53 — backup SQLite com WAL aberto via verdadeiro mecanismo do Electron.
  await host.getByRole('tab',{name:'Backups'}).click();
  await host.getByRole('button',{name:'Salvar backup SQLite'}).waitFor();
  await hostApp.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},backupFile);
  await host.getByRole('button',{name:'Salvar backup SQLite'}).click();
  await host.getByRole('status').filter({hasText:'Backup SQLite criado e validado.'}).waitFor();
  assert.equal(existsSync(backupFile),true);
  const bdb=new DatabaseSync(backupFile,{readOnly:true});
  try{
    assert.equal(bdb.prepare('PRAGMA quick_check').get().quick_check,'ok');
    assert.equal(bdb.prepare('SELECT code FROM products WHERE id=?').get(baseline.id).code,'LAN-BACKUP-51');
    assert.equal(bdb.prepare('SELECT name FROM customers WHERE id=?').get(remoteCustomer.id).name,'Cliente criado no terminal LAN QA');
  }finally{bdb.close();}
  pass('F53','backup real íntegro inclui dados gravados via terminal remoto e mantém SQLite ativo');

  // F54 — simula alterações APÓS backup, garante bloqueio com caixa aberto,
  // agenda restauração via UI e inicia NOVO processo Electron para aplicá-la.
  const post=await call(host,'save','products',{
    name:'Produto posterior ao backup QA',code:'APOS-BACKUP-54',unit:'UN',
    sale_price_cents:'5,00',stock_milli:'2,000'
  });
  assert.ok(post.id);
  await call(host,'sessionOpen',{openingCashCents:'9,00'});
  assert.match(String(await error(host,'backupRestore')),/feche todos os caixas/i);
  assert.equal(existsSync(join(hostDir,'pdv-better.sqlite.restore-pending.json')),false);
  await call(host,'sessionClose',{countedCashCents:'9,00'});

  await hostApp.evaluate(({dialog,app:electronApp},filePath)=>{
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[filePath]});
    // O próximo início é exercido explicitamente pelo teste, sem deixar
    // um processo relançado pelo Windows fora do controle do runner.
    electronApp.relaunch=()=>{};
  },backupFile);
  const closing=new Promise(resolve=>hostApp.on('close',resolve));
  host.once('dialog',d=>d.accept());
  await host.getByRole('button',{name:'Selecionar backup e restaurar'}).click();
  await Promise.race([closing,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Aplicativo não reiniciou após restauração')),15000))]);
  hostApp=null;
  assert.equal(existsSync(join(hostDir,'pdv-better.sqlite.restore-pending.json')),true);
  hostApp=await launch(hostDir);
  host=await hostApp.firstWindow();
  await login(host,'Administrador LAN QA — Administrador',password);
  const restored=await call(host,'list','products');
  assert.equal(restored.some(x=>x.id===baseline.id),true);
  assert.equal(restored.some(x=>x.id===post.id),false);
  assert.equal((await call(host,'list','customers')).some(x=>x.id===remoteCustomer.id),true);
  assert.equal(existsSync(join(hostDir,'pdv-better.sqlite.restore-pending.json')),false);
  const previous=readdirSync(hostDir).filter(x=>x.includes('.pre-restore-')&&x.endsWith('.sqlite'));
  assert.equal(previous.length,1);
  const prev=new DatabaseSync(join(hostDir,previous[0]),{readOnly:true});
  try{assert.equal(prev.prepare('SELECT COUNT(*) AS n FROM products WHERE id=?').get(post.id).n,1);}
  finally{prev.close();}
  assert.deepEqual(hostErrors,[]);
  pass('F54','restauração via UI após fechamento, reinício, banco antigo preservado e dados recuperados');

  assert.deepEqual([...ok].sort(),['F51','F52','F53','F54']);
  console.log('QA F51-F54 OK: 4/4 fluxos com Electron real, LAN HTTP e restauração SQLite.');
}finally{
  if(clientApp)await clientApp.close().catch(()=>{});
  if(hostApp)await hostApp.close().catch(()=>{});
  rmSync(work,{recursive:true,force:true});
}
