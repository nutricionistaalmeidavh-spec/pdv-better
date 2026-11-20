import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openCatalog} from '../electron/db.mjs';
import {recoverLocalAdministrator} from '../electron/recovery.mjs';
import {verifyDatabase} from '../electron/backup.mjs';
import {ALLOWED_RPC} from '../electron/lan.mjs';
import {apiChannels} from '../shared/contract.mjs';

function fixture(){
 const folder=mkdtempSync(join(tmpdir(),'pdv-admin-recovery-'));
 const databaseFile=join(folder,'pdv-better.sqlite');
 const store=openCatalog(databaseFile,{terminalId:'terminal-original'});
 const admin=store.authBootstrap({name:'Dono da loja',password:'SenhaAntiga2026!'},'terminal-original');
 const item=store.save('products',{name:'Produto já cadastrado',unit:'UN',sale_price_cents:'12,50',stock_milli:'5'});
 store.openSession({openingCashCents:100}, {terminalId:'terminal-original'});
 const sale=store.checkout({
   key:'venda-antes-recuperacao',items:[{id:item.id,quantityMilli:1000}],
   payments:[{method:'cash',amountCents:1250}]
 },{terminalId:'terminal-original'});
 return {folder,databaseFile,store,admin,item,sale,done(){
   store.close();rmSync(folder,{recursive:true,force:true});
 }};
}
const input=operatorId=>({operatorId,password:'NovaSenha2026!',repeatPassword:'NovaSenha2026!',confirmation:'REDEFINIR'});

test('recuperação local faz backup íntegro e troca só a credencial, preservando produtos e vendas',async()=>{
 const f=fixture();
 try{
   const beforeProduct=f.store.list('products').find(p=>p.id===f.item.id);
   const beforeSale=f.store.getSale(f.sale.id);
   const result=await recoverLocalAdministrator({store:f.store,folder:f.folder,mode:'local',input:input(f.admin.user.id)});
   assert.equal(result.recovered,true);
   assert.equal(result.operatorId,f.admin.user.id);
   assert.equal(verifyDatabase(result.backupFile).integrity,'ok');
   assert.ok(readdirSync(f.folder).some(x=>x.startsWith('PDV-Plus-Antes-Recuperacao-')&&x.endsWith('.sqlite')));
   assert.throws(()=>f.store.authLogin({operatorId:f.admin.user.id,password:'SenhaAntiga2026!'},'terminal-original'),/credenciais/i);
   assert.equal(f.store.authLogin({operatorId:f.admin.user.id,password:'NovaSenha2026!'},'terminal-original').user.role,'Administrador');
   assert.deepEqual(f.store.list('products').find(p=>p.id===f.item.id),beforeProduct);
   assert.deepEqual(f.store.getSale(f.sale.id),beforeSale);
   assert.equal(f.store.listOpenSessions().length,1);
 }finally{f.done();}
});

test('recuperação recusa modo remoto, confirmação errada, senha fraca e operador caixa sem alterar dados',async()=>{
 const f=fixture();
 try{
   const other=f.store.save('operators',{name:'Caixa',role:'Caixa'});
   for(const [mode,data] of [
     ['client',input(f.admin.user.id)],
     ['local',{...input(f.admin.user.id),confirmation:'nao'}],
     ['local',{...input(f.admin.user.id),password:'123'}],
     ['local',{...input(f.admin.user.id),repeatPassword:'diferente'}],
     ['local',input(other.id)]
   ]){
     await assert.rejects(()=>recoverLocalAdministrator({store:f.store,folder:f.folder,mode,input:data}),/local|computador|confirm|senha|administrador/i);
   }
   assert.equal(readdirSync(f.folder).filter(x=>x.startsWith('PDV-Plus-Antes-Recuperacao-')).length,0);
   assert.equal(f.store.authLogin({operatorId:f.admin.user.id,password:'SenhaAntiga2026!'},'terminal-original').user.role,'Administrador');
 }finally{f.done();}
});

test('falha de backup bloqueia a troca de senha e a sessão antiga não muda',async()=>{
 const f=fixture();
 try{
   f.store.backupTo=async()=>{throw new Error('Disco sem espaço');};
   await assert.rejects(()=>recoverLocalAdministrator({
     store:f.store,folder:f.folder,mode:'host',input:input(f.admin.user.id)
   }),/Disco sem espaço/);
   assert.equal(f.store.authLogin({operatorId:f.admin.user.id,password:'SenhaAntiga2026!'},'terminal-original').user.role,'Administrador');
 }finally{f.done();}
});

test('recuperação não é RPC da LAN nem contorna a permissão de definir senha',()=>{
 assert.ok(apiChannels.authRecoverLocal);
 assert.ok(!ALLOWED_RPC.includes('authRecoverLocal'));
 assert.ok(!ALLOWED_RPC.includes('recoverLocalAdministrator'));
});
