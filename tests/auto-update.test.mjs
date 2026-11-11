import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createUpdateManager} from '../electron/auto-update.mjs';

const setup=({packaged=true,sessions=[],backupError=null}={})=>{
  const updater=new EventEmitter();
  updater.checks=0;updater.installs=0;
  updater.checkForUpdates=async()=>{updater.checks++;return {updateInfo:{version:'0.7.0'}};};
  updater.quitAndInstall=()=>{updater.installs++;};
  const notices=[];
  const jobs=[];
  const callbacks={};
  let backups=0;
  const manager=createUpdateManager({
    app:{isPackaged:packaged,getVersion:()=> '0.6.0'},
    platform:'win32',
    updater,
    notify:s=>notices.push(s),
    listOpenSessions:async()=>sessions,
    backup:async()=>{backups++;if(backupError)throw backupError;},
    schedule:(fn,ms)=>{jobs.push({fn,ms});return jobs.length;},
    repeat:(fn,ms)=>{jobs.push({fn,ms});return jobs.length;},
    clear:()=>{},
  });
  return {updater,notices,jobs,manager,getBackups:()=>backups};
};
test('não habilita atualizações em desenvolvimento nem tenta baixar',async()=>{
  const {manager,updater}=setup({packaged:false});
  assert.equal(manager.status().phase,'disabled');
  await assert.rejects(()=>manager.check(),/instalado|disponível|empacotado/i);
  assert.equal(updater.checks,0);
});
test('apenas consulta no startup e agenda verificações periódicas, sem instalar',async()=>{
  const {manager,updater,jobs}=setup();
  manager.start();
  assert.equal(updater.autoDownload,true);
  assert.equal(updater.autoInstallOnAppQuit,false);
  assert.equal(jobs[0].ms,15000);
  assert.equal(jobs[1].ms,6*60*60*1000);
  await jobs[0].fn();
  assert.equal(updater.checks,1);
  assert.equal(updater.installs,0);
});
test('mostra download, progresso e versão sem permitir instalação prematura',async()=>{
  const {manager,updater,notices}=setup();
  updater.emit('update-available',{version:'0.7.0'});
  assert.equal(manager.status().phase,'available');
  await assert.rejects(()=>manager.install(),/download|baixad/i);
  updater.emit('download-progress',{percent:47.7,transferred:500,total:1000});
  assert.equal(manager.status().progress,48);
  updater.emit('update-downloaded',{version:'0.7.0'});
  assert.equal(manager.status().phase,'downloaded');
  assert.equal(manager.status().version,'0.7.0');
  assert.equal(notices.at(-1).phase,'downloaded');
});
test('não interrompe venda com caixa aberto, mesmo após download',async()=>{
  const {manager,updater,getBackups}=setup({sessions:[{id:'cx-1'}]});
  updater.emit('update-downloaded',{version:'0.7.0'});
  await assert.rejects(()=>manager.install(),/feche|aberto|caixa/i);
  assert.equal(getBackups(),0);
  assert.equal(updater.installs,0);
});
test('faz backup antes da atualização e nunca instala após falha de backup',async()=>{
  const {manager,updater,getBackups}=setup({backupError:new Error('disco cheio')});
  updater.emit('update-downloaded',{version:'0.7.0'});
  await assert.rejects(()=>manager.install(),/disco cheio/);
  assert.equal(getBackups(),1);
  assert.equal(updater.installs,0);
});
test('instala somente por comando explícito após salvar backup, impedindo clique duplo',async()=>{
  const {manager,updater,getBackups}=setup();
  updater.emit('update-downloaded',{version:'0.7.0'});
  await manager.install();
  assert.equal(getBackups(),1);
  assert.equal(updater.installs,1);
  assert.equal(manager.status().phase,'installing');
  await assert.rejects(()=>manager.install(),/pronta|baixada|instalação/i);
});
test('falha de rede não desativa a interface nem apaga versão',async()=>{
  const {manager,updater}=setup();
  updater.checkForUpdates=async()=>{throw new Error('rede indisponível');};
  await manager.check();
  assert.equal(manager.status().phase,'error');
  assert.match(manager.status().error,/rede indisponível/);
  assert.equal(manager.status().currentVersion,'0.6.0');
});
test('disponível somente Windows e artefato NSIS',async()=>{
  const updater=new EventEmitter();
  const manager=createUpdateManager({app:{isPackaged:true,getVersion:()=> '0.6.0'},platform:'linux',updater});
  assert.equal(manager.status().enabled,false);
  assert.equal(manager.status().phase,'disabled');
});
