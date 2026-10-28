// F15-F30: Jornada E2E de frente de caixa no Electron real, sem mocks de IPC/SQLite.
// Em F20/F28 somente os DISPOSITIVOS de rede são simulados via servidores TCP localhost.
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

const folder=mkdtempSync(join(tmpdir(),'pdv-f15-f30-'));
const exe=process.env.PDV_TEST_APP_EXECUTABLE;
const password='SenhaVendaQA2026!';
let app,scaleServer,printerServer;
let page;
const completed=new Set();
const navigation=name=>page.getByRole('navigation',{name:'Navegação principal'}).getByRole('button',{name,exact:true});
const search=()=>page.getByRole('textbox',{name:'Pesquisar ou ler código de barras'});
const cart=()=>page.locator('.cart-panel');
const payment=()=>page.getByRole('dialog',{name:'Receber venda'});
const receipt=()=>page.getByRole('dialog',{name:'Comprovante não fiscal da venda'});
const pass=(id,why)=>{completed.add(id);console.log('PASS '+id+': '+why);};
const call=(method,...args)=>page.evaluate(async ({method,args})=>window.pdv[method](...args),{method,args});
async function error(method,...args){
  return page.evaluate(async ({method,args})=>{
    try{await window.pdv[method](...args);return null;}
    catch(e){return String(e?.message||e);}
  },{method,args});
}
async function toCheckout(){
  await navigation('Frente de caixa').click();
  await page.getByRole('heading',{name:'Frente de caixa',exact:true}).waitFor();
  await search().waitFor();
}
async function choose(name){
  await page.locator('.product-list').getByRole('button',{name:new RegExp(name,'i')}).click();
}
async function clearCart(){
  if(await cart().getByText('Seu carrinho está vazio').count())return;
  page.once('dialog',dialog=>dialog.accept());
  await cart().getByRole('button',{name:'Limpar rascunho'}).click();
  await cart().getByText('Seu carrinho está vazio').waitFor();
}
async function checkout({kind='cash',amount,customerId=null,discount='0,00',split=null,expectedError=null}){
  await cart().getByRole('button',{name:'Receber e concluir venda'}).click();
  const dlg=payment();
  await dlg.waitFor();
  await dlg.locator('.form-grid label').filter({hasText:'Desconto em reais'}).locator('input').fill(discount);
  if(customerId) await dlg.locator('.form-grid label').filter({hasText:'Cliente (obrigatório para fiado)'}).locator('select').selectOption(customerId);
  if(split){
    await dlg.getByRole('button',{name:'Dividir pagamento'}).click();
    await dlg.getByRole('combobox',{name:'Forma de pagamento 1'}).selectOption(split[0].method);
    await dlg.getByRole('textbox',{name:'Valor de pagamento 1'}).fill(split[0].amount);
    await dlg.getByRole('combobox',{name:'Forma de pagamento 2'}).selectOption(split[1].method);
    await dlg.getByRole('textbox',{name:'Valor de pagamento 2'}).fill(split[1].amount);
  } else {
    await dlg.getByRole('combobox',{name:'Forma de pagamento 1'}).selectOption(kind);
    await dlg.getByRole('textbox',{name:'Valor de pagamento 1'}).fill(amount);
  }
  await dlg.getByRole('button',{name:'Confirmar e concluir venda'}).click();
  if(expectedError){
    await dlg.getByRole('alert').getByText(expectedError).waitFor();
    return dlg;
  }
  await receipt().waitFor({timeout:15000});
  const sales=await call('salesList');
  const result=await call('saleGet',sales[0].id);
  assert.equal(result.status,'completed');
  return result;
}
async function closeReceipt(){
  await receipt().getByRole('button',{name:'Concluir'}).click();
  await receipt().waitFor({state:'hidden'});
}
async function tcpServer(onConnection){
  const server=createServer(onConnection);
  await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
  return server;
}
try{
  scaleServer=await tcpServer(socket=>socket.end('ST,GS, 0.750kg\r\n'));
  let captured=null;
  let captureResolve;
  const capturedPromise=new Promise(resolve=>{captureResolve=resolve;});
  printerServer=await tcpServer(socket=>{
    const buffers=[];
    socket.on('data',data=>buffers.push(data));
    socket.on('end',()=>{
      captured=Buffer.concat(buffers);
      captureResolve(captured);
    });
    socket.on('error',err=>console.error('TCP impressora QA:',err.message));
  });
  app=await electron.launch({
    ...(exe?{executablePath:exe}:{}),
    args:exe?[]:['.'],
    env:{...process.env,PDV_TEST_USER_DATA:folder,PDV_TEST_SMOKE:'1'},
    timeout:45000
  });
  page=await app.firstWindow();
  const pageErrors=[];
  page.on('pageerror',err=>pageErrors.push(err.message));
  await page.getByRole('heading',{name:'PDV Better',exact:true}).waitFor({timeout:30000});
  await page.getByRole('textbox',{name:'Nome do administrador'}).fill('Admin Vendas QA');
  await page.locator('.auth-form input[type="password"]').nth(0).fill(password);
  await page.locator('.auth-form input[type="password"]').nth(1).fill(password);
  await page.getByRole('button',{name:'Criar administrador'}).click();
  await page.getByRole('heading',{name:'Bem-vindo ao PDV Better'}).waitFor({timeout:30000});

  const cat=await call('save','categories',{name:'Bebidas QA'});
  const grocery=await call('save','categories',{name:'Mercearia QA'});
  const a=await call('save','products',{name:'Café Arábica QA',code:'QA-CAFE-1001',category_id:cat.id,unit:'UN',sale_price_cents:'25,50',cost_price_cents:'10,00',stock_milli:'30,000'});
  const b=await call('save','products',{name:'Biscoito Integral QA',code:'QA-BISC-2002',category_id:grocery.id,unit:'UN',sale_price_cents:'7,00',cost_price_cents:'3,00',stock_milli:'20,000'});
  const kg=await call('save','products',{name:'Queijo a Granel QA',code:'QA-KG-3003',category_id:grocery.id,unit:'KG',sale_price_cents:'40,00',cost_price_cents:'20,00',stock_milli:'15,000'});
  const customer=await call('save','customers',{name:'Cliente Fiado QA',phone:'11999990000'});

  await toCheckout();
  // F15: busca por nome e código parcial, além de inexistente.
  await search().fill('Café Arábica');
  assert.equal(await page.locator('.product-list').getByRole('button',{name:/Café Arábica QA/}).count(),1);
  assert.equal(await page.locator('.product-list').getByRole('button',{name:/Biscoito Integral QA/}).count(),0);
  await search().fill('QA-BISC-2002');
  assert.equal(await page.locator('.product-list').getByRole('button',{name:/Biscoito Integral QA/}).count(),1);
  await search().fill('NAO-EXISTE');
  await page.getByText('Nenhum produto encontrado').waitFor();
  await search().fill('');
  pass('F15','busca por nome/SKU, filtragem e estado sem resultado');

  // F17: filtro real de categoria no catálogo de frente de caixa.
  await page.locator('.category-filter').getByRole('button',{name:'Bebidas QA'}).click();
  assert.equal(await page.locator('.product-list').getByRole('button',{name:/Café Arábica QA/}).count(),1);
  assert.equal(await page.locator('.product-list').getByRole('button',{name:/Biscoito Integral QA/}).count(),0);
  await page.locator('.category-filter').getByRole('button',{name:'Todos'}).click();
  assert.equal(await page.locator('.product-list').getByRole('button',{name:/Biscoito Integral QA/}).count(),1);
  pass('F17','filtro por categoria e retorno a todos os produtos');

  // F16: simulamos somente a digitação de um leitor HID: SKU + Enter no input real.
  await search().fill('QA-CAFE-1001');
  await search().press('Enter');
  await cart().getByText('Café Arábica QA').waitFor();
  assert.equal(await cart().getByText('1 UN').count(),1);
  pass('F16','SKU + Enter adiciona produto como leitura HID (sem scanner físico)');

  // F18/F19: seleção visual, acréscimo, redução e remoção.
  await choose('Biscoito Integral QA');
  await cart().getByText('Biscoito Integral QA').waitFor();
  pass('F18','seleção de produto atualiza rascunho e total');
  await cart().getByRole('button',{name:'Aumentar Biscoito Integral QA'}).click();
  await cart().getByText('2 UN').waitFor();
  await cart().getByRole('button',{name:'Diminuir Biscoito Integral QA'}).click();
  await cart().getByText('1 UN').waitFor();
  await cart().getByRole('button',{name:'Remover Biscoito Integral QA'}).click();
  assert.equal(await cart().getByText('Biscoito Integral QA').count(),0);
  pass('F19','aumento, redução e remoção sem perder os demais itens');

  // F21: rascunho continua salvo por operador após sair e autenticar novamente.
  await page.getByRole('button',{name:'Sair',exact:true}).click();
  await page.getByRole('heading',{name:'PDV Better',exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Operador'}).selectOption({label:'Admin Vendas QA — Administrador'});
  await page.locator('.auth-form input[type="password"]').first().fill(password);
  await page.getByRole('button',{name:'Entrar no PDV'}).click();
  await page.getByRole('heading',{name:'Bem-vindo ao PDV Better'}).waitFor();
  await toCheckout();
  await cart().getByText('Café Arábica QA').waitFor();
  pass('F21','rascunho recuperado após logout/login do mesmo operador');

  // F29: checkout requer sessão; abrir caixa com troco inicial via interface.
  assert.equal(await cart().getByRole('button',{name:'Abra o caixa para vender'}).isDisabled(),true);
  const closedError=await error('checkout',{key:'qa-without-open',items:[{id:a.id,quantityMilli:1000}],payments:[{method:'cash',amountCents:2550}]});
  assert.match(String(closedError),/caixa aberto/i);
  await cart().getByRole('button',{name:'Ir para abertura de caixa'}).click();
  await page.getByRole('heading',{name:'Controle de caixa',exact:true}).waitFor();
  await page.locator('.commerce-section').filter({hasText:'Abrir novo caixa'}).getByRole('textbox',{name:'Valor inicial de troco (R$)'}).fill('100,50');
  await page.getByRole('button',{name:'Abrir caixa',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Caixa aberto para vendas.'}).waitFor();
  let session=await call('sessionCurrent');
  assert.equal(session.opening_cash_cents,10050);
  assert.equal(session.expected_cash_cents,10050);
  pass('F29','venda bloqueada com caixa fechado; abertura em R$ 100,50 persistida');
  await toCheckout();

  // F20: sem balança configurada informa erro, com balança TCP local lê 0,750 kg.
  await choose('Queijo a Granel QA');
  await cart().getByRole('button',{name:'Ler balança para Queijo a Granel QA'}).click();
  await cart().getByRole('alert').getByText(/configure primeiro a balança/i).waitFor();
  await call('deviceSet',{
    printerHost:'127.0.0.1',printerPort:printerServer.address().port,
    scaleHost:'127.0.0.1',scalePort:scaleServer.address().port
  });
  await cart().getByRole('button',{name:'Ler balança para Queijo a Granel QA'}).click();
  await cart().getByText(/0,75 KG/).waitFor();
  pass('F20','erro sem configuração e leitura estável real por TCP de 0,750 kg');

  // F22/F23/F27: cliente, desconto, troco, baixa de estoque e atomicidade.
  let sale=await checkout({amount:'60,00',customerId:customer.id,discount:'5,50'});
  assert.equal(sale.subtotal_cents,5550);
  assert.equal(sale.discount_cents,550);
  assert.equal(sale.total_cents,5000);
  assert.equal(sale.change_cents,1000);
  assert.equal(sale.customer_id,customer.id);
  assert.equal(sale.payments.find(x=>x.method==='cash').amount_cents,5000);
  assert.equal(sale.payments.find(x=>x.method==='cash').tendered_cents,6000);
  assert.equal(sale.items.find(x=>x.product_id===kg.id).quantity_milli,750);
  assert.equal((await call('list','products')).find(x=>x.id===a.id).stock_milli,29000);
  assert.equal((await call('list','products')).find(x=>x.id===kg.id).stock_milli,14250);
  pass('F22','cliente e desconto vinculados à venda concluída');
  pass('F23','pagamento R$ 60,00 para venda R$ 50,00 gera troco R$ 10,00');

  // F28: conteúdo não fiscal e comandos ESC/POS enviados à impressora TCP de teste.
  await receipt().getByText(/Comprovante de venda não fiscal/i).waitFor();
  await receipt().getByText(/NÃO É DOCUMENTO FISCAL/i).waitFor();
  await receipt().getByText('Café Arábica QA').waitFor();
  await receipt().getByRole('button',{name:'ESC/POS rede'}).click();
  const payload=await Promise.race([
    capturedPromise,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('Impressão TCP não recebida')),8000))
  ]);
  assert.ok(Buffer.isBuffer(payload) && payload.length>40);
  assert.match(payload.toString('latin1'),/COMPROVANTE NAO FISCAL/);
  assert.deepEqual([...payload.subarray(-3)],[0x1d,0x56,0x00]);
  pass('F28','comprovante não fiscal exibido e bytes ESC/POS transmitidos via TCP local');
  await closeReceipt();
  pass('F27','venda atômica com baixa correta em UN e KG e comprovante recuperável');

  // F24: Pix e cartão são apenas REGISTROS manuais (sem cobrança externa).
  await choose('Biscoito Integral QA');
  sale=await checkout({kind:'pix',amount:'7,00'});
  assert.equal(sale.total_cents,700);
  assert.equal(sale.payments[0].method,'pix');
  await closeReceipt();
  await choose('Biscoito Integral QA');
  sale=await checkout({kind:'card',amount:'7,00'});
  assert.equal(sale.payments[0].method,'card');
  await closeReceipt();
  pass('F24','Pix e cartão persistidos manualmente, sem gateway e sem alterar caixa em dinheiro');

  // F25: Fiado exige cliente, cria recebível ao concluir.
  await choose('Biscoito Integral QA');
  let dlg=await checkout({kind:'credit',amount:'7,00',expectedError:/fiado exige cliente/i});
  assert.equal((await call('salesList')).length,3);
  await dlg.locator('.form-grid label').filter({hasText:'Cliente (obrigatório para fiado)'}).locator('select').selectOption(customer.id);
  await dlg.getByRole('button',{name:'Confirmar e concluir venda'}).click();
  await receipt().waitFor();
  sale=await call('saleGet',(await call('salesList'))[0].id);
  assert.equal(sale.payments[0].method,'credit');
  assert.equal(sale.customer_id,customer.id);
  assert.equal(sale.total_cents,700);
  await closeReceipt();
  const receivables=await call('financeList');
  assert.equal(receivables.filter(x=>x.sale_id===sale.id&&x.type==='receivable'&&x.status==='open').length,1);
  pass('F25','fiado rejeitado sem cliente e recebido como conta a receber aberta');

  // F26: duas modalidades, soma e troco verificados no SQLite.
  await choose('Biscoito Integral QA');
  sale=await checkout({split:[{method:'cash',amount:'10,00'},{method:'pix',amount:'2,00'}]});
  assert.equal(sale.total_cents,700);
  assert.equal(sale.change_cents,500);
  assert.equal(sale.payments.find(x=>x.method==='cash').amount_cents,500);
  assert.equal(sale.payments.find(x=>x.method==='cash').tendered_cents,1000);
  assert.equal(sale.payments.find(x=>x.method==='pix').amount_cents,200);
  await closeReceipt();
  pass('F26','pagamento dividido dinheiro/Pix sem duplicar valor de caixa');

  // F27 adicional: idempotência real de checkout via bridge e estoque baixado só uma vez.
  const stockBefore=(await call('list','products')).find(x=>x.id===b.id).stock_milli;
  const op={key:'qa-replay-transaction-20261028',items:[{id:b.id,quantityMilli:1000}],payments:[{method:'cash',amountCents:700}]};
  const first=await call('checkout',op),second=await call('checkout',op);
  assert.equal(second.id,first.id);
  assert.equal((await call('list','products')).find(x=>x.id===b.id).stock_milli,stockBefore-1000);
  assert.equal((await call('salesList')).length,6);
  assert.equal((await call('list','products')).find(x=>x.id===b.id).stock_milli,15000);
  console.log('F27: repetição com mesma chave não gerou venda/baixa duplicada');

  // F30: saldo e movimentos da sessão, incluindo apenas dinheiro efetivo.
  session=await call('sessionCurrent');
  assert.equal(session.opening_cash_cents,10050);
  assert.equal(session.expected_cash_cents,16250); // 100,50 + 50,00 + 5,00 + 7,00
  assert.equal(session.movements.filter(x=>x.kind==='sale').length,3);
  await navigation('Controle de caixa').click();
  await page.getByRole('heading',{name:'Controle de caixa',exact:true}).waitFor();
  await page.getByText('Histórico do turno').waitFor();
  await page.getByText(/Dinheiro previsto em caixa/).waitFor();
  await page.locator('.commerce-section').filter({hasText:'Histórico do turno'}).locator('tbody tr').first().waitFor();
  pass('F30','saldo previsto, movimentações da sessão e tela de histórico conferidos');

  await toCheckout();
  await choose('Biscoito Integral QA');
  page.once('dialog',dialog=>dialog.accept());
  await cart().getByRole('button',{name:'Limpar rascunho'}).click();
  await cart().getByText('Seu carrinho está vazio').waitFor();
  pass('F21','limpeza do rascunho confirmada sem criar venda adicional');

  assert.deepEqual(pageErrors,[], 'Renderer sem erros não tratados');
  assert.deepEqual([...completed].sort(),Array.from({length:16},(_,i)=>'F'+String(i+15).padStart(2,'0')));
  console.log('QA F15-F30 OK: 16/16 fluxos via Electron real e SQLite isolado.');
  await app.close();app=null;

  const db=new DatabaseSync(join(folder,'pdv-better.sqlite'));
  try{
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sales').get().n,6);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM financial_entries WHERE type='receivable' AND status='open'").get().n,1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cash_movements WHERE kind='sale'").get().n,3);
    assert.equal(db.prepare("SELECT stock_milli FROM products WHERE id=?").get(kg.id).stock_milli,14250);
  } finally {db.close();}
  console.log('QA SQLITE OK: vendas, recebível, dinheiro e estoque persistidos.');
}finally{
  if(app)await app.close();
  if(scaleServer)await new Promise(resolve=>scaleServer.close(resolve));
  if(printerServer)await new Promise(resolve=>printerServer.close(resolve));
  rmSync(folder,{recursive:true,force:true});
}
