// Jornadas completas J01-J05: todas as ações de negócio são feitas pela interface.
// Cada cenário usa Electron e SQLite NOVOS. IPC só lê o estado para asserções.
// Evidências de falhas: qa-artifacts/*.png e qa-artifacts/jornadas-resultados.json.
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const OUT='qa-artifacts';mkdirSync(OUT,{recursive:true});
const executable=process.env.PDV_TEST_APP_EXECUTABLE;
const adminPass='AdministradorJornada2026!',workerPass='OperadorJornada2026!';
const results=[];
const nav=(p,name)=>p.getByRole('navigation',{name:'Navegação principal'}).getByRole('button',{name,exact:true});
const field=(scope,label)=>scope.locator('label').filter({hasText:label}).locator('input,select').first();
const api=(p,method,...args)=>p.evaluate(async ({method,args})=>window.pdv[method](...args),{method,args});
const err=(p,method,...args)=>p.evaluate(async ({method,args})=>{try{await window.pdv[method](...args);return null;}catch(e){return String(e?.message||e)}},{method,args});
const shift=p=>p.locator('.commerce-section').filter({has:p.getByRole('heading',{name:/Turno aberto|Abrir novo caixa/})});
const finance=p=>p.locator('.commerce-section').filter({has:p.getByRole('heading',{name:'Contas a pagar e receber'})});
const receipt=p=>p.getByRole('dialog',{name:'Comprovante não fiscal da venda'});
const payment=p=>p.getByRole('dialog',{name:'Receber venda'});
async function visit(p,name,heading){
 await nav(p,name).click();
 await p.getByRole('heading',{name:heading,exact:true}).waitFor();
}
async function bootstrap(p){
 await p.getByRole('heading',{name:'PDV Better',exact:true}).waitFor({timeout:30000});
 await p.getByRole('textbox',{name:'Nome do administrador'}).fill('Administrador Jornada');
 await p.locator('.auth-form input[type="password"]').nth(0).fill(adminPass);
 await p.locator('.auth-form input[type="password"]').nth(1).fill(adminPass);
 await p.getByRole('button',{name:'Criar administrador'}).click();
 await p.getByRole('heading',{name:'Bem-vindo ao PDV Better'}).waitFor({timeout:30000});
}
async function logout(p){
 await p.getByRole('button',{name:'Sair',exact:true}).click();
 await p.getByRole('heading',{name:'PDV Better',exact:true}).waitFor();
}
async function login(p,label,password){
 await p.getByRole('combobox',{name:'Operador'}).selectOption({label});
 await p.locator('.auth-form input[type="password"]').first().fill(password);
 await p.getByRole('button',{name:'Entrar no PDV'}).click();
 await p.getByRole('heading',{name:'Bem-vindo ao PDV Better'}).waitFor({timeout:30000});
}
async function add(p,menu,singular,values){
 await nav(p,menu).click();
 await p.getByRole('heading',{name:menu,exact:true}).waitFor();
 await p.getByRole('button',{name:new RegExp('Adicionar '+singular,'i')}).click();
 const dlg=p.getByRole('dialog',{name:'Adicionar '+singular});await dlg.waitFor();
 for(const [label,value] of Object.entries(values)){
   const c=field(dlg,label);
   if(await c.evaluate(x=>x.tagName)==='SELECT')await c.selectOption(value);
   else await c.fill(value);
 }
 await dlg.getByRole('button',{name:'Salvar cadastro'}).click();
 await dlg.waitFor({state:'hidden'});
}
async function product(p,name,code,price,stock='10,000',category=''){
 await add(p,'Produtos','Produto',{'Nome do produto':name,'Código de barras / SKU':code,
  'Categoria':category,'Unidade':'UN','Preço de venda (R$)':price,
  'Preço de custo (R$)':'4,00','Saldo em estoque':stock});
}
async function operator(p,name,role){
 await add(p,'Operadores','Operador',{'Nome':name,'Função':role});
 await visit(p,'Operadores','Operadores');
 await p.getByRole('row').filter({hasText:name}).getByRole('button',{name:'Definir senha'}).click();
 const d=p.getByRole('dialog',{name:'Definir senha do operador'});
 await d.locator('input[type="password"]').nth(0).fill(workerPass);
 await d.locator('input[type="password"]').nth(1).fill(workerPass);
 await d.getByRole('button',{name:'Salvar acesso'}).click();
 await d.waitFor({state:'hidden'});
}
async function openShift(p,cash){
 await visit(p,'Controle de caixa','Controle de caixa');
 await field(shift(p),'Valor inicial de troco (R$)').fill(cash);
 await shift(p).getByRole('button',{name:'Abrir caixa'}).click();
 await p.getByRole('status').filter({hasText:'Caixa aberto para vendas.'}).waitFor();
}
async function closeShift(p,count){
 await visit(p,'Controle de caixa','Controle de caixa');
 await field(shift(p),'Dinheiro contado (R$)').fill(count);
 await shift(p).getByRole('button',{name:'Conferir e fechar caixa'}).click();
 await p.getByRole('status').filter({hasText:'Caixa fechado.'}).waitFor();
}
async function sell(p,code,{method='cash',amount='',customer='',split=null}={}){
 await visit(p,'Frente de caixa','Frente de caixa');
 const search=p.getByRole('textbox',{name:'Pesquisar ou ler código de barras'});
 await search.fill(code);await search.press('Enter');
 await p.locator('.cart-line').first().waitFor();
 await p.locator('.cart-panel').getByRole('button',{name:'Receber e concluir venda'}).click();
 const d=payment(p);await d.waitFor();
 if(customer)await field(d,'Cliente (obrigatório para fiado)').selectOption({label:customer});
 if(split){
  await d.getByRole('button',{name:'Dividir pagamento'}).click();
  for(let i=0;i<split.length;i++){
   await d.getByRole('combobox',{name:'Forma de pagamento '+(i+1)}).selectOption(split[i].method);
   await d.getByRole('textbox',{name:'Valor de pagamento '+(i+1)}).fill(split[i].amount);
  }
 }else{
  await d.getByRole('combobox',{name:'Forma de pagamento 1'}).selectOption(method);
  await d.getByRole('textbox',{name:'Valor de pagamento 1'}).fill(amount);
 }
 await d.getByRole('button',{name:'Confirmar e concluir venda'}).click();
 await receipt(p).waitFor({timeout:15000});
 const list=await api(p,'salesList');
 const s=await api(p,'saleGet',list[0].id);
 assert.equal(s.status,'completed');
 return s;
}
async function finishReceipt(p){
 await receipt(p).getByRole('button',{name:'Concluir'}).click();
 await receipt(p).waitFor({state:'hidden'});
}
async function journey(id,name,exec,verify){
 const dir=mkdtempSync(join(tmpdir(),'pdv-journey-'+id+'-'));let app,p,errors=[];
 const start=Date.now();
 try{
  app=await electron.launch({...(executable?{executablePath:executable}:{}),
   args:executable?[]:['.'],env:{...process.env,PDV_TEST_SMOKE:'1',PDV_TEST_USER_DATA:dir},timeout:45000});
  p=await app.firstWindow();p.on('pageerror',e=>errors.push(e.message));
  const state=await exec(p);
  assert.deepEqual(errors,[],'Renderer errors');
  await app.close();app=null;
  const db=new DatabaseSync(join(dir,'pdv-better.sqlite'),{readOnly:true});
  try{
   assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
   await verify(db,state);
  }finally{db.close();}
  results.push({id,name,status:'PASS',elapsed_ms:Date.now()-start});
  console.log('PASS '+id+': '+name);
 }catch(e){
  const screenshot=join(OUT,id+'.png');
  try{if(p)await p.screenshot({path:screenshot,fullPage:true,timeout:3000})}catch{}
  results.push({id,name,status:'FAIL',elapsed_ms:Date.now()-start,
   error:String(e?.stack||e),rendererErrors:errors,screenshot});
  console.error('FAIL '+id+': '+String(e?.stack||e));
  process.exitCode=1;
 }finally{
  if(app)try{await app.close()}catch{}
  rmSync(dir,{recursive:true,force:true});
  writeFileSync(join(OUT,'jornadas-resultados.json'),JSON.stringify(results,null,2));
 }
}
await journey('J01','Administrador prepara loja e todos os cadastros essenciais',async p=>{
 await bootstrap(p);
 await add(p,'Categorias','Categoria',{'Nome da categoria':'Bebidas Jornada'});
 const category=(await api(p,'list','categories')).find(c=>c.name==='Bebidas Jornada');
 await product(p,'Café Jornada','JORN-CAFE-01','18,90','12,000',category.id);
 await add(p,'Clientes','Cliente',{'Nome':'Maria Jornada','Telefone':'11912345678'});
 await add(p,'Fornecedores','Fornecedor',{'Razão social / Nome':'Fornecedor Jornada','Telefone':'1133334444'});
 await operator(p,'Caixa Jornada','Caixa');
 assert.equal((await api(p,'list','products')).length,1);
 await visit(p,'Visão geral','Bem-vindo ao PDV Better');
 return {};
},db=>{
 for(const table of ['products','customers','categories','suppliers'])
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM '+table+' WHERE active=1').get().n,1);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM operator_credentials').get().n,2);
});
await journey('J02','Caixa: login, turno, venda dinheiro, troco, comprovante e fechamento',async p=>{
 await bootstrap(p);
 await product(p,'Biscoito Jornada','JORN-BISC-02','7,00','15,000');
 await operator(p,'Operador Balcão','Caixa');
 await logout(p);await login(p,'Operador Balcão — Caixa',workerPass);
 assert.equal(await nav(p,'Financeiro').count(),0);
 assert.match(String(await err(p,'financeList')),/permiss/i);
 await openShift(p,'100,00');
 const s=await sell(p,'JORN-BISC-02',{amount:'10,00'});
 assert.equal(s.total_cents,700);assert.equal(s.change_cents,300);
 await receipt(p).getByText('Biscoito Jornada').waitFor();
 await finishReceipt(p);
 await visit(p,'Vendas','Histórico de vendas');
 await p.getByRole('row').filter({hasText:s.id.slice(0,8)}).getByText('Concluída').waitFor();
 await closeShift(p,'107,00');
 await logout(p);await login(p,'Administrador Jornada — Administrador',adminPass);
 await visit(p,'Relatórios','Relatórios e indicadores');
 assert.equal((await api(p,'report')).sales_total_cents,700);
 return {saleId:s.id};
},(db,{saleId})=>{
 assert.equal(db.prepare('SELECT total_cents FROM sales WHERE id=?').get(saleId).total_cents,700);
 assert.equal(db.prepare("SELECT stock_milli FROM products WHERE code='JORN-BISC-02'").get().stock_milli,14000);
 const shift=db.prepare('SELECT status,expected_cash_cents,counted_cash_cents,difference_cents FROM cash_sessions').get();
 assert.equal(shift.status,'closed');
 assert.equal(shift.expected_cash_cents,10700);
 assert.equal(shift.counted_cash_cents,10700);
 assert.equal(shift.difference_cents,0);
});
await journey('J03','Gerente: estoque, financeiro, liquidação e relatório',async p=>{
 await bootstrap(p);
 await product(p,'Arroz Jornada','JORN-ARROZ-03','12,00','8,000');
 await operator(p,'Gerente Estoque','Gerente');
 await logout(p);await login(p,'Gerente Estoque — Gerente',workerPass);
 assert.equal(await nav(p,'Operadores').count(),0);
 await visit(p,'Estoque','Movimentações de estoque');
 const f=p.locator('.commerce-section').filter({has:p.getByRole('heading',{name:'Movimentar estoque'})}).locator('form');
 await field(f,'Produto').selectOption({index:1});
 await field(f,'Tipo').selectOption('receipt');
 await field(f,'Quantidade').fill('5,000');
 await field(f,'Motivo').fill('Entrega fornecedor Jornada');
 await f.getByRole('button',{name:'Registrar estoque'}).click();
 await p.getByRole('status').filter({hasText:'Estoque atualizado e movimento auditado.'}).waitFor();
 await field(f,'Tipo').selectOption('adjustment');
 await field(f,'Direção').selectOption('negative');
 await field(f,'Quantidade').fill('2,000');
 await field(f,'Motivo').fill('Inventário Jornada');
 await f.getByRole('button',{name:'Registrar estoque'}).click();
 await p.getByRole('status').filter({hasText:'Estoque atualizado e movimento auditado.'}).waitFor();
 await openShift(p,'200,00');
 await visit(p,'Financeiro','Financeiro');
 const form=p.locator('.commerce-section').filter({has:p.getByRole('heading',{name:'Novo lançamento'})}).locator('form');
 await field(form,'Tipo').selectOption('payable');
 await field(form,'Descrição').fill('Energia Jornada');
 await field(form,'Valor (R$)').fill('35,00');
 await field(form,'Vencimento').fill('2026-11-20');
 await form.getByRole('button',{name:'Criar lançamento'}).click();
 await p.getByRole('status').filter({hasText:'Lançamento registrado.'}).waitFor();
 await field(finance(p),'Quitação').selectOption('cash');
 const row=finance(p).getByRole('row').filter({hasText:'Energia Jornada'});
 p.once('dialog',d=>d.accept());
 await row.getByRole('button',{name:'Liquidar'}).click();
 await row.getByText('Liquidada').waitFor();
 await visit(p,'Relatórios','Relatórios e indicadores');
 const report=await api(p,'report');
 assert.equal(report.payables_paid_cents,3500);assert.equal(report.inventory_value_cents,4400);
 await closeShift(p,'165,00');
 return {};
},db=>{
 assert.equal(db.prepare("SELECT stock_milli FROM products WHERE code='JORN-ARROZ-03'").get().stock_milli,11000);
 assert.equal(db.prepare("SELECT status FROM financial_entries WHERE description='Energia Jornada'").get().status,'settled');
 assert.equal(db.prepare('SELECT expected_cash_cents FROM cash_sessions').get().expected_cash_cents,16500);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stock_movements').get().n,3);
});
await journey('J04','Fiado: caixa, cliente, liquidação pelo gestor e saldo',async p=>{
 await bootstrap(p);
 await product(p,'Leite Jornada','JORN-LEITE-04','16,00','5,000');
 await add(p,'Clientes','Cliente',{'Nome':'Cliente Fiado Jornada'});
 await operator(p,'Caixa Fiado','Caixa');
 await logout(p);await login(p,'Caixa Fiado — Caixa',workerPass);
 await openShift(p,'20,00');
 const sale=await sell(p,'JORN-LEITE-04',{method:'credit',amount:'16,00',customer:'Cliente Fiado Jornada'});
 assert.equal(sale.payments[0].method,'credit');
 await finishReceipt(p);await closeShift(p,'20,00');
 await logout(p);await login(p,'Administrador Jornada — Administrador',adminPass);
 await openShift(p,'50,00');
 await visit(p,'Financeiro','Financeiro');
 const row=finance(p).getByRole('row').filter({hasText:'Venda fiado '+sale.id});
 await row.getByText('Em aberto').waitFor();
 await field(finance(p),'Quitação').selectOption('cash');
 p.once('dialog',d=>d.accept());await row.getByRole('button',{name:'Liquidar'}).click();
 await row.getByText('Liquidada').waitFor();
 assert.equal((await api(p,'sessionCurrent')).expected_cash_cents,6600);
 assert.match(String(await err(p,'salesCancel',sale.id)),/turno|liquidado/i);
 await closeShift(p,'66,00');return {saleId:sale.id};
},(db,{saleId})=>{
 assert.equal(db.prepare('SELECT status FROM sales WHERE id=?').get(saleId).status,'completed');
 const row=db.prepare('SELECT type,status,amount_cents FROM financial_entries WHERE sale_id=?').get(saleId);
 assert.equal(row.type,'receivable');
 assert.equal(row.status,'settled');
 assert.equal(row.amount_cents,1600);
 assert.equal(db.prepare("SELECT stock_milli FROM products WHERE code='JORN-LEITE-04'").get().stock_milli,4000);
});
await journey('J05','Cancelamento de venda mista reconcilia caixa, estoque e relatório',async p=>{
 await bootstrap(p);
 await product(p,'Produto Estorno','JORN-ESTORNO-05','25,00','6,000');
 await openShift(p,'100,00');
 const sale=await sell(p,'JORN-ESTORNO-05',{split:[{method:'cash',amount:'10,00'},{method:'pix',amount:'15,00'}]});
 assert.equal(sale.total_cents,2500);await finishReceipt(p);
 await visit(p,'Vendas','Histórico de vendas');
 const row=p.getByRole('row').filter({hasText:sale.id.slice(0,8)});
 p.once('dialog',d=>d.accept());
 await row.getByRole('button',{name:'Cancelar venda'}).click();
 await p.getByRole('status').filter({hasText:'Venda cancelada e estoque restaurado.'}).waitFor();
 await row.getByText('Cancelada').waitFor();
 await visit(p,'Relatórios','Relatórios e indicadores');
 const report=await api(p,'report');
 assert.equal(report.sales_count,0);assert.equal(report.cancelled_count,1);
 await closeShift(p,'100,00');return {saleId:sale.id};
},(db,{saleId})=>{
 assert.equal(db.prepare('SELECT status FROM sales WHERE id=?').get(saleId).status,'cancelled');
 assert.equal(db.prepare("SELECT stock_milli FROM products WHERE code='JORN-ESTORNO-05'").get().stock_milli,6000);
 assert.equal(db.prepare('SELECT SUM(delta_cents) AS n FROM cash_movements').get().n,0);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stock_movements WHERE sale_id=?').get(saleId).n,2);
});
const passed=results.filter(r=>r.status==='PASS').length;
console.log('QA JORNADAS COMPLETAS: '+passed+'/5 aprovadas.');
writeFileSync(join(OUT,'jornadas-resultados.json'),JSON.stringify({total:5,passed,failed:5-passed,journeys:results},null,2));
if(passed!==5)process.exitCode=1;
