// QA F07-F14 — cadastros reais via Electron/IPC/SQLite isolado.
// Dados inteiramente fictícios, sem mocks de persistência/autenticação.
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const folder = mkdtempSync(join(tmpdir(), 'pdv-qa-f07-f14-'));
const executable = process.env.PDV_TEST_APP_EXECUTABLE;
const passwords = {admin: 'AdministradorQA2026!', manager: 'GerenteQA2026!', changed: 'GerenteNova2026!', cashier: 'CaixaQA2026!'};
const passed = new Set();
let app;
let page;
const nav = label => page.getByRole('navigation', {name: 'Navegação principal'}).getByRole('button', {name: label, exact: true});
const row = text => page.getByRole('row').filter({hasText: text});
const data = kind => page.evaluate(kind => window.pdv.list(kind), kind);
const status = () => page.evaluate(() => window.pdv.authStatus());
const field = (dlg, label) => dlg.locator('label.form-field').filter({hasText: label}).locator('input, select').first();
const assertDenied = async (method, ...args) => {
  const message = await page.evaluate(async ({method, args}) => {
    try { await window.pdv[method](...args); return null; }
    catch (e) { return String(e?.message || e); }
  }, {method,args});
  assert.match(String(message), /permiss|não permitid|autentic|expirad/i, method + ' deveria ser negado');
};
async function add(menu, singular, inputs) {
  await nav(menu).click();
  await page.getByRole('button', {name: new RegExp('Adicionar '+singular, 'i')}).click();
  const dlg = page.getByRole('dialog', {name: 'Adicionar '+singular});
  await dlg.waitFor();
  for (const [label,value] of inputs) {
    const control = field(dlg,label);
    if (label === 'Categoria' || label === 'Unidade' || label === 'Função') await control.selectOption(value);
    else await control.fill(value);
  }
  await dlg.getByRole('button', {name: 'Salvar cadastro'}).click();
  await dlg.waitFor({state: 'hidden'});
}
async function edit(menu, singular, text, inputs) {
  await nav(menu).click();
  await row(text).getByRole('button', {name: 'Editar cadastro'}).click();
  const dlg = page.getByRole('dialog', {name: 'Editar '+singular});
  await dlg.waitFor();
  for (const [label,value] of inputs) {
    const control = field(dlg,label);
    if (label === 'Categoria' || label === 'Unidade' || label === 'Função') await control.selectOption(value);
    else await control.fill(value);
  }
  await dlg.getByRole('button', {name: 'Salvar cadastro'}).click();
  await dlg.waitFor({state: 'hidden'});
}
async function archive(menu, text) {
  await nav(menu).click();
  const target = row(text);
  await target.waitFor();
  page.once('dialog', dlg => dlg.accept());
  await target.getByRole('button', {name: 'Desativar cadastro'}).click();
  await target.waitFor({state: 'hidden'});
}
async function updatePassword(operator, value, mismatch=false) {
  await nav('Operadores').click();
  await row(operator).getByRole('button', {name:'Definir senha'}).click();
  const dlg = page.getByRole('dialog', {name:'Definir senha do operador'});
  await dlg.locator('input[type="password"]').nth(0).fill(value);
  await dlg.locator('input[type="password"]').nth(1).fill(mismatch ? 'SenhaDiferente2026!' : value);
  await dlg.getByRole('button', {name:'Salvar acesso'}).click();
  if (mismatch) {
    await dlg.getByRole('alert').getByText(/senhas não conferem/i).waitFor();
    assert.equal(await dlg.isVisible(), true);
    await dlg.locator('input[type="password"]').nth(1).fill(value);
    await dlg.getByRole('button', {name:'Salvar acesso'}).click();
  }
  await dlg.waitFor({state:'hidden'});
}
async function login(label, value) {
  await page.getByRole('combobox', {name:'Operador'}).selectOption({label});
  await page.locator('.auth-form input[type="password"]').first().fill(value);
  await page.getByRole('button', {name:'Entrar no PDV'}).click();
  await page.getByRole('heading', {name:'Bem-vindo ao PDV Better'}).waitFor({timeout:20000});
}
async function logout() {
  await page.getByRole('button', {name:'Sair',exact:true}).click();
  await page.getByRole('heading', {name:'PDV Better',exact:true}).waitFor();
}
function pass(id, message) {passed.add(id); console.log('PASS '+id+': '+message);}
try {
  app = await electron.launch({
    ...(executable ? {executablePath:executable} : {}),
    args:executable ? [] : ['.'],
    env:{...process.env, PDV_TEST_USER_DATA:folder, PDV_TEST_SMOKE:'1'},
    timeout:45000
  });
  page = await app.firstWindow();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.getByRole('heading', {name:'PDV Better', exact:true}).waitFor({timeout:30000});
  await page.getByRole('textbox', {name:'Nome do administrador'}).fill('Administrador Cadastro QA');
  await page.locator('.auth-form input[type="password"]').nth(0).fill(passwords.admin);
  await page.locator('.auth-form input[type="password"]').nth(1).fill(passwords.admin);
  await page.getByRole('button',{name:'Criar administrador'}).click();
  await page.getByRole('heading', {name:'Bem-vindo ao PDV Better'}).waitFor({timeout:30000});

  // F08 — Categoria real com edição, desativação de categoria vazia e proteção de vínculo.
  await add('Categorias','Categoria',[['Nome da categoria','Bebidas QA']]);
  let categories=await data('categories');
  const category=categories.find(x=>x.name==='Bebidas QA');
  assert.ok(category?.id,'categoria precisa persistir no SQLite');
  await edit('Categorias','Categoria','Bebidas QA',[['Nome da categoria','Bebidas e Cafés QA']]);
  categories=await data('categories');
  assert.equal(categories.find(x=>x.id===category.id).name,'Bebidas e Cafés QA');
  await add('Categorias','Categoria',[['Nome da categoria','Categoria Arquivar QA']]);
  await archive('Categorias','Categoria Arquivar QA');
  assert.equal((await data('categories')).some(x=>x.name==='Categoria Arquivar QA'),false);

  // F07 — Produto: criação/edição preserva UUID/estoque; código duplicado é rejeitado.
  await add('Produtos','Produto',[
    ['Nome do produto','Café Tradicional QA'],
    ['Código de barras / SKU','QACAFE1001'],
    ['Categoria',category.id],
    ['Unidade','UN'],
    ['Preço de venda (R$)','12,50'],
    ['Preço de custo (R$)','7,25'],
    ['Saldo em estoque','10,000']
  ]);
  let products=await data('products');
  const product=products.find(x=>x.code==='QACAFE1001');
  assert.ok(product?.id);
  assert.equal(product.stock_milli,10000);
  assert.equal(product.sale_price_cents,1250);
  assert.equal(product.category_id,category.id);
  await edit('Produtos','Produto','Café Tradicional QA',[
    ['Nome do produto','Café Especial QA'], ['Preço de venda (R$)','14,80']
  ]);
  products=await data('products');
  assert.equal(products.find(x=>x.id===product.id).name,'Café Especial QA');
  assert.equal(products.find(x=>x.id===product.id).sale_price_cents,1480);
  assert.equal(products.find(x=>x.id===product.id).stock_milli,10000);
  await page.getByRole('button', {name:/Adicionar produto/i}).click();
  const duplicate=page.getByRole('dialog', {name:'Adicionar Produto'});
  await field(duplicate,'Nome do produto').fill('Produto SKU Duplicado QA');
  await field(duplicate,'Código de barras / SKU').fill('QACAFE1001');
  await duplicate.getByRole('button', {name:'Salvar cadastro'}).click();
  await duplicate.getByRole('alert').getByText(/código já cadastrado/i).waitFor();
  assert.equal(await field(duplicate,'Nome do produto').inputValue(),'Produto SKU Duplicado QA');
  await duplicate.getByRole('button', {name:'Cancelar'}).click();
  assert.equal((await data('products')).filter(x=>x.code==='QACAFE1001').length,1);

  // F08 — Categoria ainda referenciada: deve permanecer ativa e avisar o usuário.
  await nav('Categorias').click();
  page.once('dialog',dlg=>dlg.accept());
  await row('Bebidas e Cafés QA').getByRole('button',{name:'Desativar cadastro'}).click();
  await page.getByRole('alert').getByText(/possui produtos ativos/i).waitFor();
  assert.equal((await data('categories')).some(x=>x.id===category.id),true);

  // F09 — Cliente completo: criar e editar sem perder identidade.
  await add('Clientes','Cliente',[
    ['Nome','Cliente Principal QA'],['CPF / CNPJ','12345678909'],['Telefone','11911112222'],['E-mail','cliente.qa@example.invalid']
  ]);
  const customer=(await data('customers')).find(x=>x.name==='Cliente Principal QA');
  assert.ok(customer?.id);
  await edit('Clientes','Cliente','Cliente Principal QA',[
    ['Nome','Cliente Editado QA'],['Telefone','11999998888']
  ]);
  assert.equal((await data('customers')).find(x=>x.id===customer.id).phone,'11999998888');

  // F11 — Fornecedor: criar/editar/desativar com dados de teste.
  await add('Fornecedores','Fornecedor',[
    ['Razão social / Nome','Fornecedor Teste QA'],
    ['CNPJ / CPF','00000000000191'], ['Telefone','1133334444'], ['E-mail','fornecedor.qa@example.invalid']
  ]);
  const supplier=(await data('suppliers')).find(x=>x.name==='Fornecedor Teste QA');
  assert.ok(supplier?.id);
  await edit('Fornecedores','Fornecedor','Fornecedor Teste QA',[
    ['Razão social / Nome','Fornecedor Atualizado QA']
  ]);
  assert.equal((await data('suppliers')).find(x=>x.id===supplier.id).name,'Fornecedor Atualizado QA');
  await archive('Fornecedores','Fornecedor Atualizado QA');
  assert.equal((await data('suppliers')).some(x=>x.id===supplier.id),false);
  pass('F11','fornecedor criado, editado, desativado e ocultado da consulta');

  // F12 — Busca pela UI, filtro sem correspondência e restauração da listagem.
  await nav('Produtos').click();
  let search=page.getByRole('textbox',{name:'Pesquisar cadastros'});
  await search.fill('Especial QA');
  await row('Café Especial QA').waitFor();
  await search.fill('NENHUM-PRODUTO-QA');
  await page.getByText('Nenhum resultado para a pesquisa').waitFor();
  await search.fill('');
  await row('Café Especial QA').waitFor();
  await nav('Clientes').click();
  search=page.getByRole('textbox',{name:'Pesquisar cadastros'});
  await search.fill('Editado QA');
  await row('Cliente Editado QA').waitFor();
  await search.fill('Cliente ausente teste');
  await page.getByText('Nenhum resultado para a pesquisa').waitFor();
  await search.fill('');
  await row('Cliente Editado QA').waitFor();
  pass('F12','busca, filtro, vazio e retorno à listagem em produtos e clientes');

  // Finalização do ciclo F07/F08: inativação sem exclusão física.
  await archive('Produtos','Café Especial QA');
  assert.equal((await data('products')).some(x=>x.id===product.id),false);
  pass('F07','produto criado/editado; SKU duplicado rejeitado; estoque e ID preservados; desativado');
  await archive('Categorias','Bebidas e Cafés QA');
  assert.equal((await data('categories')).some(x=>x.id===category.id),false);
  pass('F08','categoria criada/editada; vínculo ativo protegido; desativação válida');

  // F10 — Desativação do cliente não impede histórico de identidade.
  await archive('Clientes','Cliente Editado QA');
  assert.equal((await data('customers')).some(x=>x.id===customer.id),false);

  // F13 — Operadores: criação, mudança de função, remoção lógica e último admin protegido.
  await add('Operadores','Operador',[['Nome','Gerente Cadastro QA'],['Função','Gerente']]);
  let manager=(await data('operators')).find(x=>x.name==='Gerente Cadastro QA');
  assert.ok(manager?.id);
  await edit('Operadores','Operador','Gerente Cadastro QA',[['Função','Caixa']]);
  assert.equal((await data('operators')).find(x=>x.id===manager.id).role,'Caixa');
  await edit('Operadores','Operador','Gerente Cadastro QA',[['Função','Gerente']]);
  assert.equal((await data('operators')).find(x=>x.id===manager.id).role,'Gerente');
  await add('Operadores','Operador',[['Nome','Operador Temporário QA'],['Função','Caixa']]);
  const temporary=(await data('operators')).find(x=>x.name==='Operador Temporário QA');
  assert.ok(temporary);
  await archive('Operadores','Operador Temporário QA');
  assert.equal((await data('operators')).some(x=>x.id===temporary.id),false);
  const administrator=(await data('operators')).find(x=>x.role==='Administrador');
  assert.ok(administrator);
  const lastAdminError=await page.evaluate(async id=>{
    try {await window.pdv.archive('operators',id);return null;}
    catch(e){return String(e?.message||e);}
  },administrator.id);
  assert.match(String(lastAdminError),/último administrador/i);
  assert.equal((await data('operators')).some(x=>x.id===administrator.id),true);
  await add('Operadores','Operador',[['Nome','Caixa Cadastro QA'],['Função','Caixa']]);
  const cashier=(await data('operators')).find(x=>x.name==='Caixa Cadastro QA');
  assert.ok(cashier?.id);
  pass('F13','perfis alterados, colaborador desativado, último administrador preservado');

  // F14 — Senha, confirmação e rotação de credenciais.
  await updatePassword('Gerente Cadastro QA',passwords.manager,true);
  await updatePassword('Caixa Cadastro QA',passwords.cashier);
  await logout();
  await page.getByRole('combobox',{name:'Operador'}).selectOption({label:'Gerente Cadastro QA — Gerente'});
  await page.locator('.auth-form input[type="password"]').first().fill('SenhaErrada');
  await page.getByRole('button',{name:'Entrar no PDV'}).click();
  await page.getByRole('alert').getByText(/credenciais inválidas/i).waitFor();
  await login('Gerente Cadastro QA — Gerente',passwords.manager);
  assert.equal(await nav('Operadores').count(),0);
  await assertDenied('save','operators',{name:'Operador proibido QA',role:'Administrador'});
  await logout();
  await login('Administrador Cadastro QA — Administrador',passwords.admin);
  await updatePassword('Gerente Cadastro QA',passwords.changed);
  await logout();
  await page.getByRole('combobox',{name:'Operador'}).selectOption({label:'Gerente Cadastro QA — Gerente'});
  await page.locator('.auth-form input[type="password"]').first().fill(passwords.manager);
  await page.getByRole('button',{name:'Entrar no PDV'}).click();
  await page.getByRole('alert').getByText(/credenciais inválidas/i).waitFor();
  await login('Gerente Cadastro QA — Gerente',passwords.changed);
  pass('F14','senhas protegidas; login válido; credencial antiga revogada após rotação');

  // F09/F10 — Caixa pode cadastrar cliente, mas não pode desativá-lo.
  await logout();
  await login('Caixa Cadastro QA — Caixa',passwords.cashier);
  assert.equal(await nav('Fornecedores').count(),0);
  await add('Clientes','Cliente',[
    ['Nome','Cliente do Caixa QA'],['Telefone','11922223333']
  ]);
  const cashCustomer=(await data('customers')).find(x=>x.name==='Cliente do Caixa QA');
  assert.ok(cashCustomer?.id);
  pass('F09','cliente criado/editado pelo admin e cadastrado por Caixa com persistência');
  assert.equal(await row('Cliente do Caixa QA').getByRole('button',{name:'Desativar cadastro'}).count(),0);
  await assertDenied('archive','customers',cashCustomer.id);
  pass('F10','cliente desativado pelo admin; Caixa bloqueado na interface e backend');

  assert.deepEqual(errors,[],'Erros não tratados no renderer');
  assert.deepEqual([...passed].sort(),['F07','F08','F09','F10','F11','F12','F13','F14']);
  console.log('QA F07-F14 OK: 8/8 fluxos, Electron real + SQLite isolado.');
  await app.close(); app=null;

  // Verifica desativação lógica no arquivo SQLite, não apenas ausência em lista.
  const db=new DatabaseSync(join(folder,'pdv-better.sqlite'));
  try {
    for (const [table,id] of [['products',product.id],['categories',category.id],['customers',customer.id],['suppliers',supplier.id],['operators',temporary.id]]) {
      assert.equal(db.prepare('SELECT active FROM "'+table+'" WHERE id=?').get(id)?.active,0,table+' deve ser inativado sem exclusão física');
    }
  } finally {db.close();}
  console.log('QA SQLITE OK: 5 entidades desativadas preservadas fisicamente.');
} finally {
  if(app)await app.close();
  rmSync(folder,{recursive:true,force:true});
}
