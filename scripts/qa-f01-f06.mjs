// QA F01-F06: jornada real de acesso, perfis, navegação e atalho F2 no Electron.
// Banco exclusivo por execução, sem mocks de IPC/autenticação e sem dados de produção.
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'pdv-f01-f06-'));
const executable = process.env.PDV_TEST_APP_EXECUTABLE;
const adminPassword = 'AdminQA2026!';
const cashierPassword = 'CaixaQA2026!';
let app;
const passed = [];
const navigation = page => page.getByRole('navigation', {name: 'Navegação principal'});
const menu = (page, name) => navigation(page).getByRole('button', {name, exact: true});
const success = (id, description) => { passed.push(id); console.log('PASS '+id+': '+description); };
const passwordField = page => page.locator('.auth-form input[type="password"]').first();
const errorOf = (page, method, ...args) => page.evaluate(async ({method, args}) => {
  try { await window.pdv[method](...args); return null; }
  catch (error) { return String(error?.message || error); }
}, {method, args});

try {
  app = await electron.launch({
    ...(executable ? {executablePath: executable} : {}),
    args: executable ? [] : ['.'],
    env: {...process.env, PDV_TEST_USER_DATA: dataDir, PDV_TEST_SMOKE: '1'},
    timeout: 45000
  });
  const page = await app.firstWindow();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.getByRole('heading', {name: 'PDV Better', exact: true}).waitFor({timeout: 30000});

  // F01: configuração inicial, validação de confirmação e unicidade do administrador.
  assert.equal((await page.evaluate(() => window.pdv.authStatus())).setupRequired, true);
  await page.getByRole('textbox', {name: 'Nome do administrador'}).fill('Administrador QA');
  await passwordField(page).fill(adminPassword);
  await page.locator('.auth-form input[type="password"]').nth(1).fill('SenhaDiferente!');
  await page.getByRole('button', {name: 'Criar administrador'}).click();
  await page.getByRole('alert').getByText(/senhas digitadas são diferentes/i).waitFor();
  assert.equal((await page.evaluate(() => window.pdv.authStatus())).setupRequired, true);
  await page.locator('.auth-form input[type="password"]').nth(1).fill(adminPassword);
  await page.getByRole('button', {name: 'Criar administrador'}).click();
  await page.getByRole('heading', {name: 'Bem-vindo ao PDV Better'}).waitFor({timeout: 30000});
  const state = await page.evaluate(() => window.pdv.authStatus());
  assert.equal(state.setupRequired, false);
  assert.equal(state.operators.filter(x => x.role === 'Administrador').length, 1);
  assert.match(await errorOf(page, 'authBootstrap', {name: 'Administrador duplicado', password: adminPassword}), /já configurado/i);
  success('F01', 'bootstrap único; validação de confirmação e sessão administrativa');

  // F04: o painel inicial realmente carrega depois de autenticar.
  await page.getByRole('heading', {name: 'Bem-vindo ao PDV Better'}).waitFor();
  await page.getByRole('button', {name: /Preparar uma venda/}).waitFor();
  assert.match(await page.locator('.top-actions').innerText(), /Administrador QA\s*·\s*Administrador/);
  success('F04', 'dashboard autenticado, identificação do usuário e ação inicial');

  // F05 (admin): navegar entre telas e cadastrar um operador com senha real.
  for (const name of ['Produtos', 'Clientes', 'Relatórios', 'Dispositivos e rede', 'Operadores']) {
    assert.equal(await menu(page, name).count(), 1, 'Admin precisa enxergar '+name);
  }
  await menu(page, 'Operadores').click();
  await page.getByRole('button', {name: /Adicionar operador/i}).click();
  await page.getByRole('dialog', {name: 'Adicionar Operador'}).getByRole('textbox', {name: /^Nome\b/}).fill('Caixa QA');
  await page.getByRole('combobox', {name: 'Função'}).selectOption('Caixa');
  await page.getByRole('button', {name: 'Salvar cadastro'}).click();
  const cashierRow = page.getByRole('row').filter({hasText: 'Caixa QA'});
  await cashierRow.getByRole('button', {name: 'Definir senha'}).click();
  const setPassword = page.getByRole('dialog', {name: /Definir senha: Caixa QA/});
  await setPassword.locator('input[type="password"]').nth(0).fill(cashierPassword);
  await setPassword.locator('input[type="password"]').nth(1).fill(cashierPassword);
  await setPassword.getByRole('button', {name: 'Salvar acesso'}).click();
  await setPassword.waitFor({state: 'hidden'});
  await menu(page, 'Dispositivos e rede').click();
  await page.getByRole('heading', {name: 'Dispositivos, rede e backups'}).waitFor();
  await menu(page, 'Visão geral').click();
  await page.getByRole('heading', {name: 'Bem-vindo ao PDV Better'}).waitFor();

  // F03: sair encerra autenticação e retorna ao gate.
  await page.getByRole('button', {name: 'Sair', exact: true}).click();
  await page.getByRole('heading', {name: 'PDV Better', exact: true}).waitFor();
  assert.match(await errorOf(page, 'overview'), /não autenticada|autenticad|expirada/i);
  assert.equal(await menu(page, 'Operadores').count(), 0);

  // F02: login inválido não entra; login com operador cadastrado entra.
  await page.getByRole('combobox', {name: 'Operador'}).selectOption({label: 'Caixa QA — Caixa'});
  await passwordField(page).fill('senha-incorreta');
  await page.getByRole('button', {name: 'Entrar no PDV'}).click();
  await page.getByRole('alert').getByText(/credenciais inválidas/i).waitFor();
  assert.equal(await page.getByRole('heading', {name: 'Bem-vindo ao PDV Better'}).count(), 0);
  await passwordField(page).fill(cashierPassword);
  await page.getByRole('button', {name: 'Entrar no PDV'}).click();
  await page.getByRole('heading', {name: 'Bem-vindo ao PDV Better'}).waitFor();
  assert.match(await page.locator('.top-actions').innerText(), /Caixa QA\s*·\s*Caixa/);
  success('F02', 'senha inválida rejeitada e login correto do operador persistido');

  // F05 (caixa): módulos autorizados visíveis; bloqueio real também no backend.
  for (const name of ['Frente de caixa', 'Controle de caixa', 'Vendas', 'Clientes']) {
    assert.equal(await menu(page, name).count(), 1, 'Caixa precisa enxergar '+name);
  }
  for (const name of ['Produtos', 'Categorias', 'Fornecedores', 'Financeiro', 'Relatórios', 'Operadores', 'Dispositivos e rede']) {
    assert.equal(await menu(page, name).count(), 0, 'Caixa não pode enxergar '+name);
  }
  assert.match(await errorOf(page, 'report'), /permiss/i);
  await menu(page, 'Clientes').click();
  await page.getByRole('heading', {name: 'Clientes', exact: true}).waitFor();
  await menu(page, 'Vendas').click();
  await page.getByRole('heading', {name: 'Histórico de vendas'}).waitFor();
  success('F05', 'navegação por perfil e restrições no menu e na API');

  // F06: atalho F2 a partir de outra tela abre o PDV e foca a pesquisa.
  await page.keyboard.press('F2');
  await page.getByRole('heading', {name: 'Frente de caixa', exact: true}).waitFor();
  const search = page.getByRole('textbox', {name: 'Pesquisar ou ler código de barras'});
  await search.waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Pesquisar ou ler código de barras', null, {timeout: 5000});
  assert.equal(await search.evaluate(el => document.activeElement === el), true, 'F2 precisa focar pesquisa');
  success('F06', 'F2 abre a frente de caixa com campo de busca focado');

  // F03: alternar operador no mesmo terminal e reautenticar administrador.
  await page.getByRole('button', {name: 'Sair', exact: true}).click();
  await page.getByRole('heading', {name: 'PDV Better', exact: true}).waitFor();
  assert.match(await errorOf(page, 'overview'), /não autenticada|autenticad|expirada/i);
  await page.getByRole('combobox', {name: 'Operador'}).selectOption({label: 'Administrador QA — Administrador'});
  await passwordField(page).fill(adminPassword);
  await page.getByRole('button', {name: 'Entrar no PDV'}).click();
  await page.getByRole('heading', {name: 'Bem-vindo ao PDV Better'}).waitFor();
  assert.match(await page.locator('.top-actions').innerText(), /Administrador QA\s*·\s*Administrador/);
  assert.equal(await menu(page, 'Operadores').count(), 1);
  success('F03', 'logout revoga sessão e alternância Caixa → Administrador preserva permissões');

  assert.deepEqual(pageErrors, [], 'Erros JavaScript não tratados durante os fluxos');
  assert.deepEqual([...passed].sort(), ['F01', 'F02', 'F03', 'F04', 'F05', 'F06']);
  console.log('QA F01-F06 OK: 6/6 fluxos comprovados no Electron real.');
} finally {
  if (app) await app.close();
  rmSync(dataDir, {recursive: true, force: true});
}
