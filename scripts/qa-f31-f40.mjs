// F31-F40: fluxo E2E real de caixa, histórico de vendas e estoque.
// Electron real + IPC + SQLite; um segundo terminal conecta à mesma base de teste.
// Não usa dados de produção ou mocks de persistência.
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCatalog } from '../electron/db.mjs';

const folder=mkdtempSync(join(tmpdir(),'pdv-f31-f40-'));
const exe=process.env.PDV_TEST_APP_EXECUTABLE;
const password='AdminFluxos3140QA!';
const completed=new Set();
let app,otherTerminal;
let page;
const menu=name=>page.getByRole('navigation',{name:'Navegação principal'}).getByRole('button',{name,exact:true});
const call=(method,...args)=>page.evaluate(async({method,args})=>window.pdv[method](...args),{method,args});
const error=(method,...args)=>page.evaluate(async({method,args})=>{
  try {await window.pdv[method](...args);return null;}
  catch(e){return String(e?.message||e);}
},{method,args});
const pass=(id,why)=>{completed.add(id);console.log('PASS '+id+': '+why);};
const cashPanel=()=>page.locator('.commerce-section').filter({has:page.getByRole('heading',{name:'Sangria / reforço'})});
const shiftPanel=()=>page.locator('.commerce-section').filter({has:page.getByRole('heading',{name:/Turno aberto|Abrir novo caixa/})});
const formField=(scope,label,tag='input')=>scope.locator('label').filter({hasText:label}).locator(tag).first();
const stockForm=()=>page.locator('.commerce-section').filter({has:page.getByRole('heading',{name:'Movimentar estoque'})}).locator('form');
const historyPanel=()=>page.locator('.commerce-section').filter({has:page.getByRole('heading',{name:'Histórico de movimentações'})});
const receipt=()=>page.getByRole('dialog',{name:'Comprovante não fiscal da venda'});
async function nav(name,heading){
  await menu(name).click();
  await page.getByRole('heading',{name:heading,exact:true}).waitFor();
}
async function updateStock({product,kind,quantity,direction,reason}){
  const form=stockForm();
  await formField(form,'Produto','select').selectOption(product);
  await formField(form,'Tipo','select').selectOption(kind);
  if(kind==='adjustment')await formField(form,'Direção','select').selectOption(direction);
  await formField(form,'Quantidade').fill(quantity);
  await formField(form,'Motivo').fill(reason);
  await form.getByRole('button',{name:'Registrar estoque'}).click();
  await page.getByRole('status').filter({hasText:'Estoque atualizado e movimento auditado.'}).waitFor();
  await page.getByRole('status').filter({hasText:'Estoque atualizado e movimento auditado.'}).waitFor({state:'hidden'}).catch(()=>{});
}
try{
  app=await electron.launch({
    ...(exe?{executablePath:exe}:{}),args:exe?[]:['.'],
    env:{...process.env,PDV_TEST_USER_DATA:folder,PDV_TEST_SMOKE:'1'},
    timeout:45000
  });
  page=await app.firstWindow();
  const pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(e.message));
  await page.getByRole('heading',{name:'PDV Better',exact:true}).waitFor({timeout:30000});
  await page.getByRole('textbox',{name:'Nome do administrador'}).fill('Administrador Caixa QA');
  await page.locator('.auth-form input[type="password"]').nth(0).fill(password);
  await page.locator('.auth-form input[type="password"]').nth(1).fill(password);
  await page.getByRole('button',{name:'Criar administrador'}).click();
  await page.getByRole('heading',{name:'Bem-vindo ao PDV Better'}).waitFor({timeout:30000});

  const product=await call('save','products',{
    name:'Mercadoria QA 3140',code:'ESTOQUE-3140',unit:'UN',
    sale_price_cents:'12,00',cost_price_cents:'6,00',stock_milli:'10,000'
  });
  const admin=(await call('authStatus')).operators.find(x=>x.role==='Administrador');
  assert.ok(admin?.id && product?.id);
  // Atualizar também o renderer: fixture gravada pelo IPC depois da montagem inicial.
  await page.getByRole('button',{name:'Sair',exact:true}).click();
  await page.getByRole('heading',{name:'PDV Better',exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Operador'}).selectOption({label:'Administrador Caixa QA — Administrador'});
  await page.locator('.auth-form input[type="password"]').first().fill(password);
  await page.getByRole('button',{name:'Entrar no PDV'}).click();
  await page.getByRole('heading',{name:'Bem-vindo ao PDV Better'}).waitFor();

  // Sessão local inicial com troco real.
  await nav('Controle de caixa','Controle de caixa');
  await formField(shiftPanel(),'Valor inicial de troco (R$)').fill('100,00');
  await shiftPanel().getByRole('button',{name:'Abrir caixa'}).click();
  await page.getByRole('status').filter({hasText:'Caixa aberto para vendas.'}).waitFor();
  let current=await call('sessionCurrent');
  const localShiftId=current.id;
  assert.equal(current.opening_cash_cents,10000);

  // F34: segundo terminal autenticado em OUTRA conexão, sobre o mesmo SQLite.
  otherTerminal=openCatalog(join(folder,'pdv-better.sqlite'),{terminalId:'qa-terminal-b'});
  const authB=otherTerminal.authLogin({operatorId:admin.id,password},'qa-terminal-b');
  const ctxB={terminalId:'qa-terminal-b',sessionToken:authB.token};
  const remoteShift=otherTerminal.secureCall('openSession',[{openingCashCents:'33,00'}],ctxB);
  assert.equal(remoteShift.opening_cash_cents,3300);
  assert.notEqual(remoteShift.id,localShiftId);
  await page.getByRole('button',{name:'Atualizar'}).click();
  await page.locator('.commerce-section').filter({has:page.getByRole('heading',{name:'Caixas abertos por terminal'})}).getByText('qa-terminal-b').waitFor();
  let openSessions=await call('sessionsList');
  assert.equal(openSessions.length,2);
  assert.ok(openSessions.some(s=>s.id===remoteShift.id&&s.terminal_id==='qa-terminal-b'));
  assert.ok(openSessions.some(s=>s.id===localShiftId));
  pass('F34','dois terminais e caixas independentes na mesma base SQLite, visíveis ao administrador');

  // F31: validação de saldo + reforço, sangria e razão, via tela real.
  let bad=await error('cashMove',{kind:'withdrawal',amountCents:'150,00',note:'Sangria fora do saldo'});
  assert.match(String(bad),/insuficiente/i);
  assert.equal((await call('sessionCurrent')).movements.length,0);
  const cashForm=cashPanel().locator('form');
  await formField(cashForm,'Operação','select').selectOption('reinforcement');
  await formField(cashForm,'Valor (R$)').fill('20,00');
  await formField(cashForm,'Motivo').fill('Reforço simulado QA');
  await cashForm.getByRole('button',{name:'Registrar movimentação'}).click();
  await page.getByRole('status').filter({hasText:'Movimentação de caixa registrada.'}).waitFor();
  await formField(cashForm,'Operação','select').selectOption('withdrawal');
  await formField(cashForm,'Valor (R$)').fill('15,00');
  await formField(cashForm,'Motivo').fill('Sangria simulada QA');
  await cashForm.getByRole('button',{name:'Registrar movimentação'}).click();
  await page.getByRole('status').filter({hasText:'Movimentação de caixa registrada.'}).waitFor();
  current=await call('sessionCurrent');
  assert.equal(current.expected_cash_cents,10500);
  assert.equal(current.movements.filter(x=>x.kind==='reinforcement'&&x.delta_cents===2000).length,1);
  assert.equal(current.movements.filter(x=>x.kind==='withdrawal'&&x.delta_cents===-1500).length,1);
  assert.equal(current.movements.some(x=>x.note==='Sangria simulada QA'),true);
  pass('F31','reforço/sangria auditáveis; saldo insuficiente rejeitado sem movimento');

  // Uma venda real servirá para conferir F35, F36 e F37, sem depender de mocks de IPC.
  const sale=await call('checkout',{
    key:'qa-sale-cancel-f31-f40',items:[{id:product.id,quantityMilli:1000}],
    discountCents:0,payments:[{method:'cash',amountCents:1200}]
  });
  assert.equal(sale.total_cents,1200);
  assert.equal((await call('list','products')).find(x=>x.id===product.id).stock_milli,9000);
  assert.equal((await call('sessionCurrent')).expected_cash_cents,11700);

  // F35: histórico carrega a venda do SQLite na interface.
  await nav('Vendas','Histórico de vendas');
  const saleRow=page.getByRole('row').filter({hasText:sale.id.slice(0,8)});
  await saleRow.waitFor();
  await saleRow.getByText('Concluída').waitFor();
  assert.match(await saleRow.innerText(),/12,00/);
  assert.equal((await call('salesList')).some(x=>x.id===sale.id&&x.status==='completed'),true);
  pass('F35','venda consultável no histórico com total, situação e ID');

  // F36: reabrir comprovante DE venda anterior (pelo histórico).
  await saleRow.getByRole('button',{name:'Comprovante'}).click();
  await receipt().waitFor();
  await receipt().getByText('Mercadoria QA 3140').waitFor();
  await receipt().getByText(/Comprovante de venda não fiscal/i).waitFor();
  assert.match(await receipt().innerText(),/12,00/);
  assert.match(await receipt().innerText(),new RegExp(sale.id.slice(0,8)));
  await receipt().getByRole('button',{name:'Concluir'}).click();
  await receipt().waitFor({state:'hidden'});
  pass('F36','comprovante recuperado do histórico com item, total e identificação');

  // F37: cancelar venda no mesmo turno, reverter dinheiro e estoque, rejeitar repetição.
  page.once('dialog',d=>d.accept());
  await saleRow.getByRole('button',{name:'Cancelar venda'}).click();
  await page.getByRole('status').filter({hasText:'Venda cancelada e estoque restaurado.'}).waitFor();
  assert.equal((await call('saleGet',sale.id)).status,'cancelled');
  assert.equal((await call('list','products')).find(x=>x.id===product.id).stock_milli,10000);
  assert.equal((await call('sessionCurrent')).expected_cash_cents,10500);
  assert.match(String(await error('salesCancel',sale.id)),/já cancelada/i);
  assert.equal(await saleRow.getByRole('button',{name:'Cancelar venda'}).count(),0);
  assert.equal((await call('stockHistory',product.id)).filter(x=>x.sale_id===sale.id).length,2);
  pass('F37','cancelamento único reverte estoque e dinheiro sem duplicar movimentações');

  // F38: entrada de mercadoria, registrada pela tela de estoque.
  await nav('Estoque','Movimentações de estoque');
  await updateStock({product:product.id,kind:'receipt',quantity:'5,000',reason:'Compra de estoque QA 3140'});
  assert.equal((await call('list','products')).find(x=>x.id===product.id).stock_milli,15000);
  assert.equal((await call('stockHistory',product.id)).filter(x=>x.kind==='receipt'&&x.delta_milli===5000).length,1);
  pass('F38','entrada de cinco unidades registrada com saldo e motivo');

  // F39: ajustes positivos e negativos, estoque nunca negativo, unidade fracionada proibida.
  await updateStock({product:product.id,kind:'adjustment',direction:'positive',quantity:'2,000',reason:'Ajuste positivo QA'});
  await updateStock({product:product.id,kind:'adjustment',direction:'negative',quantity:'3,000',reason:'Ajuste negativo QA'});
  assert.equal((await call('list','products')).find(x=>x.id===product.id).stock_milli,14000);
  const beforeHistory=(await call('stockHistory',product.id)).length;
  assert.match(String(await error('stockMove',{
    productId:product.id,kind:'adjustment',quantityMilli:-50000,reason:'Estoque negativo QA'
  })),/insuficiente/i);
  assert.match(String(await error('stockMove',{
    productId:product.id,kind:'adjustment',quantityMilli:500,reason:'Unidade fracionada QA'
  })),/quantidade inteira/i);
  assert.equal((await call('list','products')).find(x=>x.id===product.id).stock_milli,14000);
  assert.equal((await call('stockHistory',product.id)).length,beforeHistory);
  pass('F39','ajustes +/- persistidos; saldo negativo e fração em UN rejeitados sem mutação');

  // F40: tela e histórico imutável de seis operações, incluindo venda/cancelamento.
  const moves=await call('stockHistory',product.id);
  assert.equal(moves.length,6); // abertura, venda, cancelamento, compra, ajuste+ e ajuste-
  for (const kind of ['opening','sale','sale_cancel','receipt','adjustment'])
    assert.ok(moves.some(x=>x.kind===kind),'F40 deve incluir '+kind);
  assert.equal(moves.reduce((s,x)=>s+x.delta_milli,0),14000);
  await page.getByRole('button',{name:'Atualizar'}).click();
  const history=historyPanel();
  await history.getByText('Compra de estoque QA 3140').waitFor();
  await history.getByText('Ajuste positivo QA').waitFor();
  await history.getByText('Ajuste negativo QA').waitFor();
  assert.equal(await history.locator('tbody tr').count(),6);
  assert.ok((await history.innerText()).includes('Mercadoria QA 3140'));
  pass('F40','histórico real exibe seis eventos e ledger reconcilia saldo final');

  // F32: fechamento do próprio turno com contagem exata.
  await nav('Controle de caixa','Controle de caixa');
  assert.equal((await call('sessionCurrent')).expected_cash_cents,10500);
  await formField(shiftPanel(),'Dinheiro contado (R$)').fill('105,00');
  await shiftPanel().getByRole('button',{name:'Conferir e fechar caixa'}).click();
  await page.getByRole('status').filter({hasText:'Caixa fechado.'}).waitFor();
  assert.equal(await call('sessionCurrent'),null);
  assert.match(String(await error('sessionClose',{countedCashCents:'105,00'})),/caixa aberto/i);
  // Terminal B fica aberto e não é fechado por A.
  assert.equal(otherTerminal.secureCall('getCurrentSession',[],ctxB).id,remoteShift.id);
  assert.equal((await call('sessionsList')).length,1);
  pass('F32','fechamento do próprio caixa com contagem exata; terminal B preservado');

  // F33: uma segunda conferência com divergência explícita em centavos.
  await formField(shiftPanel(),'Valor inicial de troco (R$)').fill('50,00');
  await shiftPanel().getByRole('button',{name:'Abrir caixa'}).click();
  await page.getByRole('status').filter({hasText:'Caixa aberto para vendas.'}).waitFor();
  const shift2=await call('sessionCurrent');
  assert.equal(shift2.expected_cash_cents,5000);
  await formField(shiftPanel(),'Dinheiro contado (R$)').fill('40,00');
  await shiftPanel().getByRole('button',{name:'Conferir e fechar caixa'}).click();
  await page.getByRole('status').filter({hasText:'Caixa fechado.'}).waitFor();
  assert.equal(await call('sessionCurrent'),null);
  assert.equal((await call('sessionsList')).length,1);
  pass('F33','fechamento com divergência de -R$ 10,00 registrado');

  // Persistência física após fechar conexão Electron; loja do terminal B é independente.
  otherTerminal.close(); otherTerminal=null;
  assert.deepEqual(pageErrors,[],'Sem erros JS não tratados no renderer');
  assert.deepEqual([...completed].sort(),Array.from({length:10},(_,i)=>'F'+String(i+31)));
  console.log('QA F31-F40 OK: 10/10 fluxos Electron + dois terminais SQLite.');
  await app.close(); app=null;
  const db=new DatabaseSync(join(folder,'pdv-better.sqlite'));
  try{
    const closed=db.prepare("SELECT * FROM cash_sessions WHERE id=?").get(localShiftId);
    assert.equal(closed.status,'closed');
    assert.equal(closed.expected_cash_cents,10500);
    assert.equal(closed.counted_cash_cents,10500);
    assert.equal(closed.difference_cents,0);
    const difference=db.prepare("SELECT * FROM cash_sessions WHERE id=?").get(shift2.id);
    assert.equal(difference.status,'closed');
    assert.equal(difference.expected_cash_cents,5000);
    assert.equal(difference.counted_cash_cents,4000);
    assert.equal(difference.difference_cents,-1000);
    assert.equal(db.prepare("SELECT status FROM cash_sessions WHERE id=?").get(remoteShift.id).status,'open');
    assert.equal(db.prepare('SELECT status FROM sales WHERE id=?').get(sale.id).status,'cancelled');
    assert.equal(db.prepare('SELECT stock_milli FROM products WHERE id=?').get(product.id).stock_milli,14000);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stock_movements WHERE product_id=?').get(product.id).n,6);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cash_movements WHERE session_id=?').get(localShiftId).n,4);
    console.log('QA SQLITE OK: duas conferências, separação entre terminais, cancelamento e ledger.');
  } finally {db.close();}
}finally{
  if(otherTerminal)otherTerminal.close();
  if(app)await app.close();
  rmSync(folder,{recursive:true,force:true});
}
