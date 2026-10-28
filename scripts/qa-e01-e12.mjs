// QA E01-E12: falhas e excecoes reais em autenticacao, caixa, cadastro, LAN e SQLite.
// Usa Electron, IPC, servidor HTTP local e bancos exclusivamente ficticios.
// Nao modifica configuracoes ou dados do usuario.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { _electron as electron } from 'playwright';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCatalog } from '../electron/db.mjs';
import { verifyDatabase, scheduleRestore } from '../electron/backup.mjs';

const root=mkdtempSync(join(tmpdir(),'pdv-qa-e01-e12-'));
const hostDir=join(root,'host'),clientDir=join(root,'client');
const executable=process.env.PDV_TEST_APP_EXECUTABLE;
const adminPassword='ExcecoesAdminQA2026!';
const cashierPassword='ExcecoesCaixaQA2026!';
const passed=new Set();
let hostApp,clientApp,host,client;
const pageErrors=[];
const pass=(id,why)=>{passed.add(id);console.log('PASS '+id+': '+why);};
const call=(page,method,...args)=>page.evaluate(async({method,args})=>window.pdv[method](...args),{method,args});
const error=(page,method,...args)=>page.evaluate(async({method,args})=>{
  try {await window.pdv[method](...args);return null;}
  catch(e){return String(e?.message||e);}
},{method,args});
const nav=(page,name)=>page.getByRole('navigation',{name:'Navegação principal'}).getByRole('button',{name,exact:true});
const productStock=async(page,id)=>(await call(page,'list','products')).find(p=>p.id===id)?.stock_milli;
const checkout=(product,key,quantityMilli=1000,amountCents=1000)=>({
  key,items:[{id:product.id,quantityMilli}],discountCents:0,
  payments:[{method:'cash',amountCents}]
});
async function launch(folder){
  const app=await electron.launch({
    ...(executable?{executablePath:executable}:{}),
    args:executable?[]:['.'],
    env:{...process.env,PDV_TEST_USER_DATA:folder,PDV_TEST_SMOKE:'1'},timeout:45000
  });
  const page=await app.firstWindow();
  page.on('pageerror',e=>pageErrors.push(e.message));
  await page.getByRole('heading',{name:'PDV Better',exact:true}).waitFor({timeout:30000});
  return {app,page};
}
async function login(page,label,password){
  await page.getByRole('combobox',{name:'Operador'}).selectOption({label});
  await page.locator('.auth-form input[type="password"]').first().fill(password);
  await page.getByRole('button',{name:'Entrar no PDV'}).click();
  await page.getByRole('heading',{name:'Bem-vindo ao PDV Better'}).waitFor({timeout:25000});
}
async function freePort(){
  const server=createServer();
  await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
  return port;
}
try{
  // E01 e E02: motor canonico real, SQLite em memoria para controlar expiracao
  // do relogio sem interferir com o processo Electron.
  const store=openCatalog(':memory:',{terminalId:'exception-unit'});
  try{
    const admin=store.authBootstrap({name:'Admin QA E',password:adminPassword},'exception-unit');
    const operator=store.save('operators',{name:'Caixa QA E',role:'Caixa'});
    const adminCtx={sessionToken:admin.token,terminalId:'exception-unit'};
    store.secureCall('setPassword',[{operatorId:operator.id,password:cashierPassword}],adminCtx);
    assert.throws(()=>store.authLogin({operatorId:operator.id,password:'senha-errada'},'exception-unit'),/Credenciais inválidas/i);
    const worker=store.authLogin({operatorId:operator.id,password:cashierPassword},'exception-unit');
    const workerCtx={sessionToken:worker.token,terminalId:'exception-unit'};
    assert.throws(()=>store.secureCall('report',[],workerCtx),/Permissão insuficiente/i);
    assert.throws(()=>store.secureCall('save',['products',{name:'Proibido',unit:'UN',sale_price_cents:'1,00'}],workerCtx),/Permissão insuficiente/i);
    pass('E02','Caixa bloqueado na API real para relatorios e cadastros administrativos');
    const originalNow=Date.now;
    const issuedAt=Date.now();
    try{
      Date.now=()=>issuedAt+12*60*60*1000+1;
      assert.throws(()=>store.authCurrent(worker.token,'exception-unit'),/expirada/i);
    }finally{Date.now=originalNow;}
    const activeAgain=store.authLogin({operatorId:operator.id,password:cashierPassword},'exception-unit');
    store.archive('operators',operator.id);
    assert.throws(()=>store.authCurrent(activeAgain.token,'exception-unit'),/inativo/i);
    assert.throws(()=>store.authLogin({operatorId:operator.id,password:cashierPassword},'exception-unit'),/Credenciais inválidas/i);
    pass('E01','senha incorreta, sessao expirada e operador inativo realmente rejeitados');
  }finally{store.close();}

  const launched=await launch(hostDir);
  hostApp=launched.app;host=launched.page;
  await host.getByRole('textbox',{name:'Nome do administrador'}).fill('Administrador QA Excecoes');
  await host.locator('.auth-form input[type="password"]').nth(0).fill(adminPassword);
  await host.locator('.auth-form input[type="password"]').nth(1).fill(adminPassword);
  await host.getByRole('button',{name:'Criar administrador'}).click();
  await host.getByRole('heading',{name:'Bem-vindo ao PDV Better'}).waitFor({timeout:30000});

  const product=await call(host,'save','products',{
    name:'Produto de Excecoes QA',code:'QA-EXC-001',unit:'UN',
    sale_price_cents:'10,00',stock_milli:'2,000'
  });
  const inactive=await call(host,'save','products',{
    name:'Produto Arquivado QA',code:'QA-EXC-002',unit:'UN',
    sale_price_cents:'10,00',stock_milli:'1,000'
  });
  const insufficient=await call(host,'save','products',{
    name:'Produto Estoque Curto QA',code:'QA-EXC-003',unit:'UN',
    sale_price_cents:'10,00',stock_milli:'1,000'
  });

  // E05: tentar vender antes de abrir qualquer caixa.
  assert.match(String(await error(host,'checkout',checkout(product,'qa-e05-closed'))),/caixa aberto/i);
  assert.deepEqual(await call(host,'salesList'),[]);
  pass('E05','caixa fechado impede venda e nao produz movimentos');

  await call(host,'sessionOpen',{openingCashCents:'20,00'});

  // E03: inexistente, inativo e estoque insuficiente; transacoes sem efeitos.
  assert.match(String(await error(host,'checkout',{
    key:'qa-e03-missing',items:[{id:randomUUID(),quantityMilli:1000}],
    payments:[{method:'cash',amountCents:1000}]
  })),/inativo|não encontrado/i);
  await call(host,'archive','products',inactive.id);
  assert.match(String(await error(host,'checkout',checkout(inactive,'qa-e03-inactive'))),/inativo|não encontrado/i);
  assert.match(String(await error(host,'checkout',checkout(insufficient,'qa-e03-stock',2000,2000))),/Estoque insuficiente/i);
  assert.equal(await productStock(host,insufficient.id),1000);
  assert.deepEqual(await call(host,'salesList'),[]);
  pass('E03','produto inexistente, inativo e sem saldo rejeitados sem baixa');

  // E04: insuficiente, duplicado e valores invalidos, sem venda parcial.
  assert.match(String(await error(host,'checkout',checkout(product,'qa-e04-short',1000,500))),/Dinheiro insuficiente/i);
  assert.match(String(await error(host,'checkout',{
    key:'qa-e04-duplicate',items:[{id:product.id,quantityMilli:1000}],
    payments:[{method:'cash',amountCents:500},{method:'cash',amountCents:500}]
  })),/duplicada/i);
  assert.match(String(await error(host,'checkout',checkout(product,'qa-e04-negative',1000,-100))),/inválid/i);
  assert.equal(await productStock(host,product.id),2000);
  assert.deepEqual(await call(host,'salesList'),[]);
  pass('E04','pagamento insuficiente, repetido ou negativo nao gera venda');

  // E06: repeticao simultanea e reenvio de chave, inclusive com payload divergente.
  const op=checkout(product,'qa-e06-idempotency');
  const [first,retry]=await Promise.all([call(host,'checkout',op),call(host,'checkout',op)]);
  assert.equal(first.id,retry.id);
  assert.equal(await productStock(host,product.id),1000);
  assert.equal((await call(host,'salesList')).filter(s=>s.id===first.id).length,1);
  assert.equal((await call(host,'stockHistory',product.id)).filter(m=>m.kind==='sale').length,1);
  assert.match(String(await error(host,'checkout',{
    ...op,discountCents:100,payments:[{method:'cash',amountCents:900}]
  })),/reutilizado com conteúdo diferente/i);
  pass('E06','dupla confirmacao cria uma venda e uma baixa; chave alterada rejeitada');

  // E07: erro real de UNIQUE no modal React, mantendo conteudo digitado.
  await nav(host,'Produtos').click();
  await host.getByRole('heading',{name:'Produtos',exact:true}).waitFor();
  await host.getByRole('button',{name:/Adicionar produto/i}).click();
  const dlg=host.getByRole('dialog',{name:'Adicionar Produto'});
  await dlg.waitFor();
  const field=label=>dlg.locator('label.form-field').filter({hasText:label}).locator('input,select').first();
  await field('Nome do produto').fill('Produto duplicado nao salvo');
  await field('Código de barras / SKU').fill('QA-EXC-001');
  await field('Preço de venda (R$)').fill('10,00');
  await field('Saldo em estoque').fill('1,000');
  await dlg.getByRole('button',{name:'Salvar cadastro'}).click();
  await dlg.getByRole('alert').getByText(/Código já cadastrado/i).waitFor();
  assert.equal(await dlg.isVisible(),true);
  assert.equal(await field('Nome do produto').inputValue(),'Produto duplicado nao salvo');
  assert.equal(await field('Código de barras / SKU').inputValue(),'QA-EXC-001');
  assert.equal((await call(host,'list','products')).filter(p=>p.code==='QA-EXC-001').length,1);
  await dlg.getByRole('button',{name:'Fechar formulário'}).click();
  pass('E07','falha de cadastro mantem formulario preenchido e nao duplica SKU');

  // E08: venda do caixa fechado nao pode ser cancelada no proximo turno.
  const older=await call(host,'checkout',checkout(insufficient,'qa-e08-sale'));
  await call(host,'sessionClose',{countedCashCents:'40,00'});
  await call(host,'sessionOpen',{openingCashCents:'10,00'});
  assert.match(String(await error(host,'salesCancel',older.id)),/Somente vendas do turno aberto/i);
  assert.equal((await call(host,'saleGet',older.id)).status,'completed');
  assert.equal(await productStock(host,insufficient.id),0);
  pass('E08','cancelamento de turno anterior recusado sem restituir estoque');

  // E09: segundo Electron real, perda do servidor LAN e nenhuma substituicao silenciosa por SQLite local.
  const hostNetwork=await call(host,'lanHost',{port:await freePort()});
  assert.equal(hostNetwork.mode,'host');
  assert.match(hostNetwork.pairingKey,/^[a-f0-9]{64}$/i);
  const address='http://127.0.0.1:'+hostNetwork.port+'/';
  const secondary=await launch(clientDir);
  clientApp=secondary.app;client=secondary.page;
  await call(client,'lanJoin',{address,secret:hostNetwork.pairingKey});
  await client.reload();
  const operator=(await call(host,'authStatus')).operators.find(o=>o.role==='Administrador');
  assert.ok(operator);
  await login(client,operator.name+' — Administrador',adminPassword);
  assert.equal((await call(client,'list','products')).some(p=>p.id===product.id),true);
  await call(host,'lanLocal');
  const offline=await error(client,'list','products');
  assert.match(String(offline),/fetch|network|failed|conex|indispon|aborted|timeout/i);
  assert.equal((await call(client,'lanStatus')).mode,'client');
  assert.equal((await call(host,'list','products')).some(p=>p.id===product.id),true);
  const replacement=await call(host,'lanHost',{port:await freePort()});
  await call(client,'lanJoin',{address:'http://127.0.0.1:'+replacement.port+'/',secret:replacement.pairingKey});
  await client.reload();
  await login(client,operator.name+' — Administrador',adminPassword);
  assert.equal((await call(client,'list','products')).some(p=>p.id===product.id),true);
  pass('E09','queda LAN mostra erro, nao troca a base e recupera apos novo pareamento');

  // E10: dispositivos TCP apontam para porta local sem servidor real.
  const unavailable=await freePort();
  await call(host,'deviceSet',{
    printerHost:'127.0.0.1',printerPort:unavailable,
    scaleHost:'127.0.0.1',scalePort:unavailable
  });
  const salesBefore=(await call(host,'salesList')).length;
  assert.match(String(await error(host,'devicePrint',{kind:'receipt-tcp',saleId:first.id})),/TCP|impressora|conex/i);
  assert.match(String(await error(host,'drawerOpen')),/TCP|impressora|conex/i);
  assert.match(String(await error(host,'scaleRead')),/balança|conex|TCP/i);
  assert.equal((await call(host,'salesList')).length,salesBefore);
  assert.equal(await productStock(host,product.id),1000);
  pass('E10','impressora, balanca e gaveta indisponiveis sem afetar vendas');

  // E11: indisponibilidade da base, backup corrompido e restauracao com caixa aberto.
  const invalidFile=join(root,'backup-invalido.sqlite');
  const databaseFile=join(hostDir,'pdv-better.sqlite');
  writeFileSync(invalidFile,'nao e um arquivo SQLite valido');
  assert.throws(()=>verifyDatabase(invalidFile),/Backup inválido ou corrompido/i);
  assert.throws(()=>scheduleRestore(invalidFile,databaseFile),/Backup inválido ou corrompido/i);
  assert.equal(existsSync(databaseFile+'.restore-pending.json'),false);
  assert.throws(()=>openCatalog(join(root,'pasta-inexistente','db.sqlite')),/SQLITE|open|directory|banco/i);
  assert.match(String(await error(host,'backupRestore')),/Feche todos os caixas/i);
  assert.equal((await call(host,'sessionCurrent')).status,'open');
  pass('E11','banco inacessivel, backup invalido e restauracao perigosa bloqueados');

  // E12: duas sessoes de terminais distintos disputam a unica unidade.
  const contested=await call(host,'save','products',{
    name:'Ultima Unidade Concorrente QA',code:'QA-EXC-012',unit:'UN',
    sale_price_cents:'10,00',stock_milli:'1,000'
  });
  await call(client,'sessionOpen',{openingCashCents:'0,00'});
  const outcomes=await Promise.allSettled([
    call(host,'checkout',checkout(contested,'qa-e12-terminal-host')),
    call(client,'checkout',checkout(contested,'qa-e12-terminal-client'))
  ]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
  assert.match(String(outcomes.find(x=>x.status==='rejected').reason),/Estoque insuficiente/i);
  assert.equal(await productStock(host,contested.id),0);
  assert.equal(await productStock(client,contested.id),0);
  assert.equal((await call(host,'stockHistory',contested.id)).filter(x=>x.kind==='sale').length,1);
  const sold=(await call(host,'salesList')).filter(s=>s.id===outcomes.find(x=>x.status==='fulfilled').value.id);
  assert.equal(sold.length,1);
  pass('E12','duas vendas concorrentes, apenas uma autorizada; saldo nunca negativo');

  const expected=Array.from({length:12},(_,i)=>'E'+String(i+1).padStart(2,'0'));
  assert.deepEqual([...passed].sort(),expected);
  assert.deepEqual(pageErrors,[],'Nao pode haver erros JS nao tratados');
  console.log('QA E01-E12 OK: 12/12 fluxos de erro e excecao validados.');
}finally{
  if(clientApp)await clientApp.close().catch(()=>{});
  if(hostApp)await hostApp.close().catch(()=>{});
  rmSync(root,{recursive:true,force:true});
}
