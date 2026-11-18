// QA de importação Excel pela interface REAL do Electron (sem mock de SQLite ou IPC).
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import ExcelJS from 'exceljs';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const dir=mkdtempSync(join(tmpdir(),'pdv-qa-excel-import-'));
const screenshots=join(process.cwd(),'qa-artifacts','excel-import');
mkdirSync(screenshots,{recursive:true});
let app,page;
async function excel(name,code){
  const book=new ExcelJS.Workbook();
  const sheet=book.addWorksheet('Produtos');
  sheet.addRow(['Nome','Código','Unidade','Preço','Estoque','Custo']);
  sheet.addRow([name,code,'UN',9.49,3,4.2]);
  return Buffer.from(await book.xlsx.writeBuffer());
}
const list=()=>page.evaluate(()=>window.pdv.list('products'));
async function chooseFile(file){
  await page.locator('input[aria-label="Selecionar planilha de produtos Excel ou CSV"]')
    .setInputFiles(file);
  const preview=page.getByRole('dialog',{name:'Pré-visualização da planilha'});
  await preview.waitFor({timeout:15000});
  return preview;
}
try{
  app=await electron.launch({args:['.'],env:{
    ...process.env,PDV_TEST_SMOKE:'1',PDV_TEST_USER_DATA:dir
  },timeout:45000});
  page=await app.firstWindow();
  await page.getByRole('heading',{name:'PDV Plus',exact:true}).waitFor({timeout:30000});
  await page.getByRole('textbox',{name:'Nome do administrador'}).fill('Administrador Excel QA');
  await page.locator('.auth-form input[type="password"]').nth(0).fill('SenhaExcelQA2026!');
  await page.locator('.auth-form input[type="password"]').nth(1).fill('SenhaExcelQA2026!');
  await page.getByRole('button',{name:'Criar administrador'}).click();
  await page.getByRole('heading',{name:'Bem-vindo ao PDV Plus'}).waitFor({timeout:30000});
  await page.getByRole('navigation',{name:'Navegação principal'})
    .getByRole('button',{name:'Produtos',exact:true}).click();
  await page.getByRole('heading',{name:'Produtos',exact:true}).waitFor();
  assert.equal((await list()).length,0);
  const preview=await chooseFile({name:'cadastro.xlsx',
    mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer:await excel('Café Excel QA','EXCEL-001')});
  assert.match(await preview.innerText(),/Café Excel QA/);
  assert.match(await preview.innerText(),/R\$\s*9,49/);
  assert.equal((await list()).length,0,'Pré-visualização não grava produtos');
  await page.screenshot({path:join(screenshots,'preview-excel.png')});
  await preview.getByRole('button',{name:'Cancelar'}).click();
  await preview.waitFor({state:'hidden'});
  assert.equal((await list()).length,0,'Cancelar não deve salvar produto');
  const confirm=await chooseFile({name:'cadastro.xlsx',
    mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer:await excel('Café Excel QA','EXCEL-001')});
  await confirm.getByRole('button',{name:/Confirmar importação de 1 produtos/}).click();
  await confirm.waitFor({state:'hidden'});
  const afterExcel=await list();
  assert.equal(afterExcel.length,1);
  assert.equal(afterExcel[0].sale_price_cents,949);
  assert.equal(afterExcel[0].stock_milli,3000);
  const csv=Buffer.from('nome;codigo;unidade;preco;estoque\nProduto CSV QA;CSV-002;UN;2,50;2\n');
  const csvPreview=await chooseFile({name:'cadastro.csv',mimeType:'text/csv',buffer:csv});
  assert.match(await csvPreview.innerText(),/Produto CSV QA/);
  await csvPreview.getByRole('button',{name:/Confirmar importação de 1 produtos/}).click();
  await csvPreview.waitFor({state:'hidden'});
  assert.equal((await list()).length,2,'Importação CSV mantém a mesma janela de prévia');
  writeFileSync(join(screenshots,'resultado.json'),JSON.stringify({
    format:['xlsx','csv'],cancelledPreview:true,imported:2,check:'ok'
  },null,2));
  console.log('QA_EXCEL_IMPORT_OK: prévia, cancelar, confirmar, persistência e CSV regressivo');
} catch(error){
  console.error('QA_EXCEL_IMPORT_FAILED',error);
  if(page)await page.screenshot({path:join(screenshots,'failure.png')}).catch(()=>{});
  process.exitCode=1;
} finally{
  await app?.close().catch(()=>{});
  rmSync(dir,{recursive:true,force:true});
}
