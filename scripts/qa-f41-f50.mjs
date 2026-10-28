// QA F41-F50: financeiro, relatórios e periféricos no Electron real.
// IPC/autenticação/SQLite sem mocks. Caixas de diálogo de arquivo e dispositivos
// TCP são substituídos somente nos limites externos do SO/hardware.
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const folder=mkdtempSync(join(tmpdir(),'pdv-f41-f50-'));
const exe=process.env.PDV_TEST_APP_EXECUTABLE;
let app,page,scaleServer,printerServer;
const ids=new Set();
const pass=(id,msg)=>{ids.add(id);console.log('PASS '+id+': '+msg);};
const nav=name=>page.getByRole('navigation',{name:'Navegação principal'}).getByRole('button',{name,exact:true});
const api=(method,...args)=>page.evaluate(async({method,args})=>window.pdv[method](...args),{method,args});
const error=(method,...args)=>page.evaluate(async({method,args})=>{
  try{await window.pdv[method](...args);return null;}
  catch(e){return String(e?.message||e);}
},{method,args});
const input=(form,name,tag='input')=>form.locator('label').filter({hasText:name}).locator(tag).first();
const receipt=()=>page.getByRole('dialog',{name:'Comprovante não fiscal da venda'});
const addForm=()=>page.locator('.commerce-section').filter({has:page.getByRole('heading',{name:'Novo lançamento'})}).locator('form');
const listPanel=()=>page.locator('.commerce-section').filter({has:page.getByRole('heading',{name:'Contas a pagar e receber'})});
async function visit(name,heading){await nav(name).click();await page.getByRole('heading',{name:heading,exact:true}).waitFor();}
async function addEntry(type,description,amount,due){
  const form=addForm();
  await input(form,'Tipo','select').selectOption(type);
  await input(form,'Descrição').fill(description);
  await input(form,'Valor (R$)').fill(amount);
  await input(form,'Vencimento').fill(due);
  await form.getByRole('button',{name:'Criar lançamento'}).click();
  await page.getByRole('status').filter({hasText:'Lançamento registrado.'}).waitFor();
  const entries=await api('financeList');
  const found=entries.find(x=>x.description===description);
  assert.ok(found?.id,'Lançamento não persistido: '+description);
  return found;
}
async function tcp(onConnection){
 const server=createServer(onConnection);
 await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
 return server;
}
try{
  let drawerPayload;
  let drawerResolve;
  const drawerArrived=new Promise(resolve=>{drawerResolve=resolve});
  printerServer=await tcp(socket=>{
    const chunks=[];
    socket.on('data',x=>chunks.push(x));
    socket.on('end',()=>{drawerPayload=Buffer.concat(chunks);drawerResolve(drawerPayload)});
  });
  scaleServer=await tcp(socket=>socket.end('ST,GS, +000.750kg\r\n'));
  app=await electron.launch({
    ...(exe?{executablePath:exe}:{}),args:exe?[]:['.'],
    env:{...process.env,PDV_TEST_USER_DATA:folder,PDV_TEST_SMOKE:'1'},timeout:45000
  });
  page=await app.firstWindow();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.getByRole('heading',{name:'PDV Better',exact:true}).waitFor({timeout:30000});
  await page.getByRole('textbox',{name:'Nome do administrador'}).fill('Admin Financeiro QA');
  await page.locator('.auth-form input[type="password"]').nth(0).fill('FinanceiroQA2026!');
  await page.locator('.auth-form input[type="password"]').nth(1).fill('FinanceiroQA2026!');
  await page.getByRole('button',{name:'Criar administrador'}).click();
  await page.getByRole('heading',{name:'Bem-vindo ao PDV Better'}).waitFor({timeout:30000});

  // Fixtures via IPC autorizado e SQLite real.
  const product=await api('save','products',{
    name:'Produto Financeiro QA',code:'QA-FIN-41-50',unit:'UN',
    sale_price_cents:'20,00',cost_price_cents:'8,00',stock_milli:'10,000'
  });
  const customer=await api('save','customers',{name:'Cliente Fiado Financeiro QA'});
  assert.ok(product.id && customer.id);
  const shift=await api('sessionOpen',{openingCashCents:'100,00'});
  assert.equal(shift.opening_cash_cents,10000);
  const saleCash=await api('checkout',{
    key:'qa-f41-f50-cash',items:[{id:product.id,quantityMilli:1000}],
    payments:[{method:'cash',amountCents:2000}]
  });
  const saleCredit=await api('checkout',{
    key:'qa-f41-f50-credit',items:[{id:product.id,quantityMilli:1000}],
    customerId:customer.id,payments:[{method:'credit',amountCents:2000}]
  });
  assert.equal(saleCash.total_cents,2000);
  assert.equal(saleCredit.total_cents,2000);
  await visit('Financeiro','Financeiro');

  // F41: criar conta a pagar com data e valores.
  const payable=await addEntry('payable','Aluguel fictício QA','30,00','2026-11-20');
  assert.equal(payable.type,'payable');
  assert.equal(payable.amount_cents,3000);
  assert.equal(payable.due_on,'2026-11-20');
  assert.equal(payable.status,'open');
  pass('F41','conta a pagar cadastrada pela UI, vencimento e saldo preservados');

  // F42: criar conta a receber manual.
  const manual=await addEntry('receivable','Cobrança fictícia QA','32,50','2026-11-25');
  assert.equal(manual.amount_cents,3250);
  assert.equal(manual.type,'receivable');
  assert.equal(manual.status,'open');
  pass('F42','conta a receber manual salva com vencimento e valor em centavos');

  // F43: consultar UI e discriminar contas abertas/liquidadas.
  for(const label of ['Aluguel fictício QA','Cobrança fictícia QA']){
    const row=listPanel().getByRole('row').filter({hasText:label});
    await row.waitFor();
    await row.getByText('Em aberto').waitFor();
  }
  assert.equal((await api('financeList')).filter(x=>x.status==='open').length,3);
  pass('F43','tabela de contas em aberto inclusive fiado gerado pela venda');

  // F45: fiado integrado ao financeiro com venda/cliente e status aberto.
  const credit=(await api('financeList')).find(x=>x.sale_id===saleCredit.id);
  assert.ok(credit);
  assert.equal(credit.type,'receivable');
  assert.equal(credit.customer_id,customer.id);
  assert.equal(credit.amount_cents,2000);
  assert.equal(credit.status,'open');
  await listPanel().getByRole('row').filter({hasText:'Venda fiado '+saleCredit.id}).waitFor();
  pass('F45','recebível do fiado ligado à venda e ao cliente, aberto no painel');

  // F44: quitação por dinheiro reduz caixa; Pix manual não faz movimento de dinheiro.
  await input(listPanel(),'Quitação','select').selectOption('cash');
  const payableRow=listPanel().getByRole('row').filter({hasText:'Aluguel fictício QA'});
  page.once('dialog',d=>d.accept());
  await payableRow.getByRole('button',{name:'Liquidar'}).click();
  await page.getByRole('status').filter({hasText:'Conta liquidada.'}).waitFor();
  assert.equal((await api('financeList')).find(x=>x.id===payable.id).status,'settled');
  assert.equal((await api('sessionCurrent')).expected_cash_cents,9000); // 100 + 20 - 30
  await input(listPanel(),'Quitação','select').selectOption('pix');
  const manualRow=listPanel().getByRole('row').filter({hasText:'Cobrança fictícia QA'});
  page.once('dialog',d=>d.accept());
  await manualRow.getByRole('button',{name:'Liquidar'}).click();
  await page.getByRole('status').filter({hasText:'Conta liquidada.'}).waitFor();
  assert.equal((await api('financeList')).find(x=>x.id===manual.id).status,'settled');
  assert.equal((await api('sessionCurrent')).expected_cash_cents,9000);
  assert.equal(await payableRow.getByRole('button',{name:'Liquidar'}).count(),0);
  assert.equal(await manualRow.getByRole('button',{name:'Liquidar'}).count(),0);
  await payableRow.getByText('Liquidada').waitFor();
  await manualRow.getByText('Liquidada').waitFor();
  assert.match(String(await error('financeSettle',{id:payable.id,method:'cash'})),/já liquidada/i);
  pass('F44','liquidação dinheiro/Pix com efeitos separados e bloqueio de segunda quitação');

  // F46: indicadores acumulados reais de vendas, pagamentos e estoque.
  await visit('Relatórios','Relatórios e indicadores');
  const summary=await api('report');
  assert.equal(summary.sales_count,2);
  assert.equal(summary.sales_total_cents,4000);
  assert.equal(summary.cash_cents,2000);
  assert.equal(summary.credit_cents,2000);
  assert.equal(summary.inventory_value_cents,6400);
  assert.equal(summary.receivables_open_cents,2000);
  assert.equal(summary.payables_paid_cents,3000);
  await page.getByRole('heading',{name:'Relatório gerencial acumulado'}).waitFor();
  await page.getByText('Vendas concluídas').waitFor();
  await page.getByText('Faturamento de vendas').waitFor();
  pass('F46','relatório reflete 2 vendas R$ 40, dinheiro, fiado e custo de estoque');

  // Substituímos APENAS a caixa de diálogo do SO; a exportação é feita pelo main Electron real.
  await app.evaluate(({dialog},path)=>{
    dialog.showSaveDialog=async()=>({canceled:false,filePath:path});
  },join(folder,'qa-report.pdf'));
  const pdf=await api('reportExport','pdf');
  assert.equal(pdf.cancelled,false);
  const pdfBytes=readFileSync(join(folder,'qa-report.pdf'));
  assert.equal(pdfBytes.subarray(0,5).toString('ascii'),'%PDF-');
  assert.ok(pdfBytes.length>1000);
  pass('F47','PDF verdadeiro gerado pelo Electron com cabeçalho PDF e conteúdo');

  await app.evaluate(({dialog},path)=>{
    dialog.showSaveDialog=async()=>({canceled:false,filePath:path});
  },join(folder,'qa-report.csv'));
  await api('reportExport','csv');
  const csv=readFileSync(join(folder,'qa-report.csv'),'utf8');
  assert.ok(csv.length>100);
  assert.match(csv,/Vendas concluídas/);
  await app.evaluate(({dialog},path)=>{
    dialog.showSaveDialog=async()=>({canceled:false,filePath:path});
  },join(folder,'qa-report.xlsx'));
  await api('reportExport','xlsx');
  assert.equal(readFileSync(join(folder,'qa-report.xlsx')).subarray(0,2).toString('ascii'),'PK');
  assert.ok(statSync(join(folder,'qa-report.xlsx')).size>1000);
  pass('F48','CSV real com indicadores e XLSX válido produzido por ExcelJS');

  // F49: cadastro de periféricos validado na UI e gravado em disco.
  await visit('Dispositivos e rede','Dispositivos, rede e backups');
  await page.getByRole('tab',{name:'Periféricos'}).click();
  await page.getByRole('heading',{name:'Impressão'}).waitFor();
  const settings=page.locator('.system-settings');
  const labels=settings.locator('label.settings-label');
  await labels.filter({hasText:'Endereço IPv4 da impressora ESC/POS'}).locator('input').fill('127.0.0.1');
  await labels.filter({hasText:'Porta TCP'}).first().locator('input').fill(String(printerServer.address().port));
  await labels.filter({hasText:'IP da balança'}).locator('input').fill('127.0.0.1');
  await labels.filter({hasText:'Porta TCP'}).nth(1).locator('input').fill(String(scaleServer.address().port));
  await page.getByRole('button',{name:'Salvar periféricos'}).click();
  await page.getByRole('status').filter({hasText:'Configuração de periféricos salva neste computador.'}).waitFor();
  const device=await api('deviceGet');
  assert.equal(device.printerHost,'127.0.0.1');
  assert.equal(device.scaleHost,'127.0.0.1');
  assert.equal(device.printerPort,printerServer.address().port);
  assert.equal(device.scalePort,scaleServer.address().port);
  assert.match(String(await error('deviceSet',{printerHost:'8.8.8.8',printerPort:9100})),/rede privada/i);
  pass('F49','periféricos configurados/persistidos, endereço público rejeitado');

  // F50: pulso real TCP de gaveta e leitura de balança, ambos no loopback isolado.
  await page.getByRole('button',{name:'Testar gaveta'}).click();
  await page.getByRole('status').filter({hasText:'Pulso enviado à gaveta de dinheiro.'}).waitFor();
  const pulse=await Promise.race([
    drawerArrived,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Pulso TCP ausente')),6000))
  ]);
  assert.deepEqual([...pulse],[0x1b,0x70,0x00,0x19,0xfa]);
  await page.getByRole('button',{name:'Ler peso agora'}).click();
  await page.getByRole('status').filter({hasText:/Peso estável:/}).waitFor();
  assert.equal(await api('scaleRead'),750);
  pass('F50','gaveta recebe ESC/POS TCP real e balança retorna 0,750 kg estável');

  assert.deepEqual(errors,[],'renderer sem erros JS não tratados');
  assert.deepEqual([...ids].sort(),Array.from({length:10},(_,i)=>'F'+String(i+41)));
  console.log('QA F41-F50 OK: 10/10 fluxos Electron + SQLite + arquivos + TCP');
  await app.close();app=null;
  const db=new DatabaseSync(join(folder,'pdv-better.sqlite'));
  try{
    assert.equal(db.prepare('SELECT status FROM financial_entries WHERE id=?').get(payable.id).status,'settled');
    assert.equal(db.prepare('SELECT status FROM financial_entries WHERE id=?').get(credit.id).status,'open');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sales WHERE status=?').get('completed').n,2);
    assert.equal(db.prepare('SELECT stock_milli FROM products WHERE id=?').get(product.id).stock_milli,8000);
  }finally{db.close();}
  console.log('QA SQLITE OK: contas, fiado, vendas e estoque persistidos');
}finally{
  if(app)await app.close();
  if(scaleServer)await new Promise(r=>scaleServer.close(r));
  if(printerServer)await new Promise(r=>printerServer.close(r));
  rmSync(folder,{force:true,recursive:true});
}
