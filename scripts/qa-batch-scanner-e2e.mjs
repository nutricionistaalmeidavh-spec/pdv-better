// QA automatizado: leitor HID simulado por teclado, Electron real e SQLite isolado.
// Homologação da leitora física ainda precisa ser executada em loja com equipamento real.
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBatchLabel } from '../shared/batch-label.mjs';
const folder=mkdtempSync(join(tmpdir(),'pdv-physical-lot-e2e-'));
const exe=process.env.PDV_TEST_APP_EXECUTABLE;
let app;
let page;
const api=(method,...args)=>page.evaluate(async ({method,args})=>window.pdv[method](...args),{method,args});
const nav=name=>page.getByRole('navigation',{name:'Navegação principal'}).getByRole('button',{name,exact:true});
try{
 app=await electron.launch({...(exe?{executablePath:exe}:{}),args:exe?[]:['.'],
  env:{...process.env,PDV_TEST_USER_DATA:folder,PDV_TEST_SMOKE:'1'},timeout:45000});
 page=await app.firstWindow();
 const pageErrors=[];
 page.on('pageerror',e=>pageErrors.push(e.message));
 await page.getByRole('heading',{name:'PDV Better',exact:true}).waitFor({timeout:30000});
 await page.getByRole('textbox',{name:'Nome do administrador'}).fill('Gerente de testes');
 await page.locator('.auth-form input[type="password"]').nth(0).fill('SenhaQA!Comercial2026');
 await page.locator('.auth-form input[type="password"]').nth(1).fill('SenhaQA!Comercial2026');
 await page.getByRole('button',{name:'Criar administrador'}).click();
 await page.getByRole('heading',{name:'Bem-vindo ao PDV Better'}).waitFor({timeout:30000});
 const a=await api('save','products',{name:'Café teste 250g',code:'HID-CAFE',unit:'UN',sale_price_cents:'12,50',stock_milli:'2'});
 const b=await api('save','products',{name:'Biscoito teste',code:'HID-BISCOITO',unit:'UN',sale_price_cents:'9,00',stock_milli:'2'});
 const batchA=await api('batchReceive',{productId:a.id,code:'TESTE-ANTIGO',expiresOn:'2099-01-01',quantityMilli:1000});
 const batchB=await api('batchReceive',{productId:a.id,code:'TESTE-FISICO',expiresOn:'2099-07-01',quantityMilli:1000});
 await api('bundleSet',{name:'Café com biscoito',items:[{productId:a.id,quantityMilli:1000},{productId:b.id,quantityMilli:1000}],bundlePriceCents:1800});
 await page.getByRole('button',{name:'Sair',exact:true}).click();
 await page.getByRole('heading',{name:'PDV Better',exact:true}).waitFor();
 await page.getByRole('combobox',{name:'Operador'}).selectOption({label:'Gerente de testes — Administrador'});
 await page.locator('.auth-form input[type="password"]').first().fill('SenhaQA!Comercial2026');
 await page.getByRole('button',{name:'Entrar no PDV'}).click();
 await page.getByRole('heading',{name:'Bem-vindo ao PDV Better'}).waitFor();
 await api('sessionOpen',{openingCashCents:0});
 await nav('Frente de caixa').click();
 const search=page.getByRole('textbox',{name:'Pesquisar ou ler código de barras'});
 await search.waitFor();
 await search.fill(createBatchLabel(a.code,batchB.code));
 await search.press('Enter');
 await page.locator('.cart-line').filter({hasText:'Lote físico TESTE-FISICO'}).waitFor({timeout:20000});
 await search.fill(b.code);await search.press('Enter');
 await page.locator('.cart-line').filter({hasText:'Biscoito teste'}).waitFor();
 await page.locator('.cart-panel').getByRole('button',{name:'Receber e concluir venda'}).click();
 const dlg=page.getByRole('dialog',{name:'Receber venda'});
 await dlg.waitFor();
 await dlg.locator('label').filter({hasText:'Total com desconto'}).locator('input').first().waitFor();
 assert.match(await dlg.locator('label').filter({hasText:'Total com desconto'}).locator('input').first().inputValue(),/18,00/);
 await dlg.getByRole('combobox',{name:'Forma de pagamento 1'}).selectOption('pix');
 await dlg.getByRole('textbox',{name:'Valor de pagamento 1'}).fill('18,00');
 await dlg.getByRole('button',{name:'Confirmar e concluir venda'}).click();
 await page.getByRole('dialog',{name:'Comprovante não fiscal da venda'}).waitFor({timeout:20000});
 const sales=await api('salesList');
 assert.equal(sales.length,1);
 const saved=await api('saleGet',sales[0].id);
 assert.equal(saved.total_cents,1800);
 assert.equal(saved.batch_allocations.length,1);
 assert.equal(saved.batch_allocations[0].batch_id,batchB.id);
 assert.notEqual(saved.batch_allocations[0].batch_id,batchA.id);
 assert.deepEqual(pageErrors,[],'sem erros de Javascript no Electron');
 console.log('PASS CROSS-SKU-HID-E2E: leitura de etiqueta B, menor preço do kit e baixa física exata');
}finally{
 try{await app?.close();}catch{}
 rmSync(folder,{recursive:true,force:true,maxRetries:10,retryDelay:150});
}
