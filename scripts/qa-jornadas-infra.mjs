// Jornadas J06/J07: dois usuários Electron reais, loja LAN e recuperação backup.
// Ações de negócio pela interface; apenas diálogos nativos de arquivo são automatizados.
// Nada é transmitido para a internet: TCP apenas 127.0.0.1 e banco fictício em temp.
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright';
import {createServer} from 'node:net';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,mkdirSync,existsSync,readdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const out='qa-artifacts';mkdirSync(out,{recursive:true});
const root=mkdtempSync(join(tmpdir(),'pdv-journey-lan-'));
const hostDir=join(root,'servidor'),clientDir=join(root,'terminal'),backup=join(root,'backup-j07.sqlite');
const exe=process.env.PDV_TEST_APP_EXECUTABLE;
const pw='AdministradorLANJornada2026!';
let hostApp,clientApp,host,client;
const result=[];
const nav=(p,name)=>p.getByRole('navigation',{name:'Navegação principal'}).getByRole('button',{name,exact:true});
const field=(scope,label)=>scope.locator('label').filter({hasText:label}).locator('input,select').first();
const api=(p,method,...args)=>p.evaluate(async({method,args})=>window.pdv[method](...args),{method,args});
async function launch(dir){
 return electron.launch({...(exe?{executablePath:exe}:{}),args:exe?[]:['.'],
  env:{...process.env,PDV_TEST_USER_DATA:dir,PDV_TEST_SMOKE:'1'},timeout:45000});
}
async function bootstrap(p){
 await p.getByRole('heading',{name:'PDV Better',exact:true}).waitFor({timeout:30000});
 await p.getByRole('textbox',{name:'Nome do administrador'}).fill('Administrador LAN Jornada');
 await p.locator('.auth-form input[type="password"]').nth(0).fill(pw);
 await p.locator('.auth-form input[type="password"]').nth(1).fill(pw);
 await p.getByRole('button',{name:'Criar administrador'}).click();
 await p.getByRole('heading',{name:'Bem-vindo ao PDV Better'}).waitFor({timeout:30000});
}
async function login(p){
 await p.getByRole('heading',{name:'PDV Better',exact:true}).waitFor({timeout:30000});
 await p.getByRole('combobox',{name:'Operador'}).selectOption({label:'Administrador LAN Jornada — Administrador'});
 await p.locator('.auth-form input[type="password"]').first().fill(pw);
 await p.getByRole('button',{name:'Entrar no PDV'}).click();
 await p.getByRole('heading',{name:'Bem-vindo ao PDV Better'}).waitFor({timeout:30000});
}
async function visit(p,name,heading){
 await nav(p,name).click();
 await p.getByRole('heading',{name:heading,exact:true}).waitFor();
}
async function product(p,name,sku){
 await visit(p,'Produtos','Produtos');
 await p.getByRole('button',{name:/Adicionar produto/i}).click();
 const d=p.getByRole('dialog',{name:'Adicionar Produto'});await d.waitFor();
 await field(d,'Nome do produto').fill(name);
 await field(d,'Código de barras / SKU').fill(sku);
 await field(d,'Preço de venda (R$)').fill('19,90');
 await field(d,'Saldo em estoque').fill('7,000');
 await d.getByRole('button',{name:'Salvar cadastro'}).click();
 await d.waitFor({state:'hidden'});
}
async function settings(p){
 await visit(p,'Dispositivos e rede','Dispositivos, rede e backups');
}
async function freePort(){
 const server=createServer();
 await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
 const p=server.address().port;await new Promise(resolve=>server.close(resolve));return p;
}
function pass(id,description){
 result.push({id,status:'PASS',description});console.log('PASS '+id+': '+description);
 writeFileSync(join(out,'infra-resultados.json'),JSON.stringify(result,null,2));
}
try{
 hostApp=await launch(hostDir);host=await hostApp.firstWindow();await bootstrap(host);
 await product(host,'Produto LAN Jornada','JORN-LAN-06');
 await settings(host);
 const port=await freePort();
 await field(host.locator('.system-settings'),'Porta do servidor').fill(String(port));
 await host.getByRole('button',{name:'Ativar servidor LAN'}).click();
 await host.getByRole('status').filter({hasText:'Servidor LAN ativado.'}).waitFor();
 const lan=await api(host,'lanStatus');
 assert.equal(lan.mode,'host');
 assert.match(lan.pairingKey,/^[a-f0-9]{64}$/);
 clientApp=await launch(clientDir);client=await clientApp.firstWindow();
 await client.getByRole('heading',{name:'PDV Better',exact:true}).waitFor({timeout:30000});
 await client.getByRole('button',{name:'Conectar a um servidor LAN'}).click();
 const auth=client.locator('.auth-panel');
 await field(auth,'Endereço do servidor').fill('http://127.0.0.1:'+port+'/');
 await field(auth,'Chave de pareamento').fill(lan.pairingKey);
 await client.getByRole('button',{name:'Conectar e selecionar operador'}).click();
 await client.getByRole('button',{name:'Entrar no PDV'}).waitFor();
 await login(client);
 await visit(client,'Frente de caixa','Frente de caixa');
 const search=client.getByRole('textbox',{name:'Pesquisar ou ler código de barras'});
 await search.fill('JORN-LAN-06');await search.press('Enter');
 await client.locator('.cart-line').getByText('Produto LAN Jornada').waitFor();
 await client.locator('.cart-panel').getByRole('button',{name:'Ir para abertura de caixa'}).click();
 await client.getByRole('heading',{name:'Controle de caixa',exact:true}).waitFor();
 const shift=client.locator('.commerce-section').filter({has:client.getByRole('heading',{name:'Abrir novo caixa'})});
 await field(shift,'Valor inicial de troco (R$)').fill('10,00');
 await shift.getByRole('button',{name:'Abrir caixa'}).click();
 await client.getByRole('status').filter({hasText:'Caixa aberto para vendas.'}).waitFor();
 await visit(client,'Frente de caixa','Frente de caixa');
 await client.locator('.cart-line').getByText('Produto LAN Jornada').waitFor();
 await client.locator('.cart-panel').getByRole('button',{name:'Receber e concluir venda'}).click();
 const d=client.getByRole('dialog',{name:'Receber venda'});
 await d.getByRole('textbox',{name:'Valor de pagamento 1'}).fill('20,00');
 await d.getByRole('button',{name:'Confirmar e concluir venda'}).click();
 const receipt=client.getByRole('dialog',{name:'Comprovante não fiscal da venda'});
 await receipt.waitFor();
 const saleId=(await api(client,'salesList'))[0].id;
 assert.equal((await api(client,'saleGet',saleId)).change_cents,10);
 await receipt.getByRole('button',{name:'Concluir'}).click();
 await visit(client,'Controle de caixa','Controle de caixa');
 const opened=client.locator('.commerce-section').filter({has:client.getByRole('heading',{name:'Turno aberto'})});
 await field(opened,'Dinheiro contado (R$)').fill('29,90');
 await opened.getByRole('button',{name:'Conferir e fechar caixa'}).click();
 await client.getByRole('status').filter({hasText:'Caixa fechado.'}).waitFor();
 await settings(host);
 await visit(host,'Vendas','Histórico de vendas');
 await host.getByRole('row').filter({hasText:saleId.slice(0,8)}).getByText('Concluída').waitFor();
 assert.equal((await api(host,'list','products')).find(x=>x.code==='JORN-LAN-06').stock_milli,6000);
 pass('J06','terminal remoto autenticado via UI vende, recebe troco, fecha e sincroniza no host');
 await clientApp.close();clientApp=null;

 // J07: banco host já contém uma venda remota real; realiza backup/restore após alteração.
 await settings(host);
 await host.getByRole('tab',{name:'Backups'}).click();
 await hostApp.evaluate(({dialog},path)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:path})},backup);
 await host.getByRole('button',{name:'Salvar backup SQLite'}).click();
 await host.getByRole('status').filter({hasText:'Backup SQLite criado e validado.'}).waitFor();
 assert.equal(existsSync(backup),true);
 const bdb=new DatabaseSync(backup,{readOnly:true});
 try{
  assert.equal(bdb.prepare('PRAGMA quick_check').get().quick_check,'ok');
  assert.equal(bdb.prepare('SELECT status FROM sales WHERE id=?').get(saleId).status,'completed');
 }finally{bdb.close();}
 await product(host,'Produto Pós Backup Jornada','JORN-POST-07');
 await settings(host);
 await host.getByRole('tab',{name:'Backups'}).click();
 await hostApp.evaluate(({dialog,app},path)=>{
   dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});
   app.relaunch=()=>{};
 },backup);
 const closing=new Promise(resolve=>hostApp.once('close',resolve));
 host.once('dialog',dialog=>dialog.accept());
 await host.getByRole('button',{name:'Selecionar backup e restaurar'}).click();
 await Promise.race([closing,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Reinício não ocorreu')),15000))]);
 hostApp=null;
 hostApp=await launch(hostDir);host=await hostApp.firstWindow();
 await login(host);
 await visit(host,'Vendas','Histórico de vendas');
 await host.getByRole('row').filter({hasText:saleId.slice(0,8)}).getByText('Concluída').waitFor();
 await visit(host,'Produtos','Produtos');
 await host.getByRole('row').filter({hasText:'Produto LAN Jornada'}).waitFor();
 assert.equal(await host.getByRole('row').filter({hasText:'Produto Pós Backup Jornada'}).count(),0);
 assert.ok(readdirSync(hostDir).some(x=>x.includes('.pre-restore-')&&x.endsWith('.sqlite')));
 const sql=new DatabaseSync(join(hostDir,'pdv-better.sqlite'),{readOnly:true});
 try{
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM products WHERE code='JORN-POST-07'").get().n,0);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM sales WHERE id=?').get(saleId).n,1);
 }finally{sql.close();}
 pass('J07','backup após venda remota, alteração posterior e restauração após reinício real');
 console.log('QA JORNADAS INFRA: 2/2 concluídas.');
} catch(e){
 const id=result.some(x=>x.id==='J06')?'J07':'J06';
 const error=String(e?.stack||e);
 try{if(host)await host.screenshot({path:join(out,id+'-host.png'),fullPage:true,timeout:3000})}catch{}
 try{if(client)await client.screenshot({path:join(out,id+'-client.png'),fullPage:true,timeout:3000})}catch{}
 result.push({id,status:'FAIL',error});console.error('FAIL '+id+': '+error);
 writeFileSync(join(out,'infra-resultados.json'),JSON.stringify(result,null,2));
 process.exitCode=1;
}finally{
 if(clientApp)try{await clientApp.close()}catch{}
 if(hostApp)try{await hostApp.close()}catch{}
 rmSync(root,{recursive:true,force:true});
}
