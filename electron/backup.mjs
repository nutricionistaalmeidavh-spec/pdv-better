import { DatabaseSync } from 'node:sqlite';
import { join,dirname,basename,resolve } from 'node:path';
import { copyFileSync,existsSync,renameSync,unlinkSync,mkdirSync,writeFileSync,readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

export function verifyDatabase(filename){
  let db;
  try{
    if(!existsSync(filename))throw new Error('Arquivo inexistente.');
    db=new DatabaseSync(filename,{readOnly:true});
    const integrity=db.prepare('PRAGMA quick_check').get();
    if(!integrity||integrity.quick_check!=='ok')throw new Error('Integridade do SQLite inválida.');
    const version=db.prepare('PRAGMA user_version').get().user_version;
    if(!Number.isInteger(version)||version<1||version>3)throw new Error('Versão do banco inválida ou incompatível.');
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);
    for(const table of ['products','categories','customers','suppliers','operators'])
      if(!tables.includes(table))throw new Error('Banco inválido: tabela '+table+' ausente.');
    if(version>=3)for(const table of ['sales','stock_movements','cash_sessions'])
      if(!tables.includes(table))throw new Error('Banco inválido: tabela '+table+' ausente.');
    return {version,integrity:'ok'};
  }catch(err){throw new Error('Backup inválido ou corrompido: '+String(err.message||err));}
  finally{try{db?.close();}catch{}}
}
export function stageRestore(source,currentDatabase){
  if(resolve(source)===resolve(currentDatabase))throw new Error('Não é permitido restaurar o próprio arquivo aberto.');
  const verified=verifyDatabase(source);
  const staged=join(dirname(currentDatabase),'.restore-'+randomUUID()+'.sqlite');
  mkdirSync(dirname(currentDatabase),{recursive:true});
  copyFileSync(source,staged);
  try{verifyDatabase(staged);}catch(error){try{unlinkSync(staged);}catch{}throw error;}
  return {stagedPath:staged,version:verified.version};
}
export function scheduleRestore(source,currentDatabase){
  const staged=stageRestore(source,currentDatabase);
  const marker=currentDatabase+'.restore-pending.json';
  if(existsSync(marker))throw new Error('Já existe uma restauração agendada.');
  writeFileSync(marker,JSON.stringify({staged:staged.stagedPath,target:resolve(currentDatabase)}),{flag:'wx',mode:0o600});
  return {pending:true,version:staged.version};
}
export function applyPendingRestore(currentDatabase){
  const marker=currentDatabase+'.restore-pending.json';
  if(!existsSync(marker))return {restored:false};
  let info;
  try{info=JSON.parse(readFileSync(marker,'utf8'));}
  catch{throw new Error('Marcador de restauração inválido; banco atual preservado.');}
  const folder=resolve(dirname(currentDatabase));
  const staged=resolve(info.staged||'');
  if(info.target!==resolve(currentDatabase)||dirname(staged)!==folder||!basename(staged).startsWith('.restore-'))
    throw new Error('Restauração pendente aponta para caminho inválido; banco preservado.');
  verifyDatabase(staged);
  const retained=currentDatabase+'.pre-restore-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite';
  // Todos os handles de SQLite devem estar fechados antes deste ponto.
  if(existsSync(currentDatabase))renameSync(currentDatabase,retained);
  try{
    renameSync(staged,currentDatabase);
    verifyDatabase(currentDatabase);
    unlinkSync(marker);
    return {restored:true,previous:retained};
  }catch(error){
    if(existsSync(retained)&&!existsSync(currentDatabase))renameSync(retained,currentDatabase);
    throw new Error('Restaurar falhou; original preservado: '+String(error.message||error));
  }
}
