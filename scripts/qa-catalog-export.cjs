// QA do catálogo no Chromium/Electron Windows real: >500 linhas, PDF multipágina e planilha.
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const ExcelJS=require('exceljs');

const out=path.resolve('qa-artifacts','catalog-export');
async function run(){
  const {buildCatalogExport,catalogCsv,catalogHtml,catalogSpreadsheetRows}=
    await import(pathToFileURL(path.resolve('shared/catalog-export.mjs')).href);
  const products=Array.from({length:510},(_,i)=>({
    name:'Produto '+String(i+1).padStart(4,'0'),
    code:'QA-'+String(i+1).padStart(4,'0'),
    unit:'UN',stock_milli:2000,
    sale_price_cents:1000,cost_price_cents:600,category_id:'cat-qa'
  }));
  products[1]={...products[1],name:'Produto 0002 Café especial',
    unit:'KG',stock_milli:1250,sale_price_cents:799,cost_price_cents:300};
  const report=buildCatalogExport(products,[{id:'cat-qa',name:'Mercearia'}],
    {name:'Loja QA PDV Plus'},new Date('2026-11-18T12:34:00'));
  assert.equal(report.count,510);
  assert.equal(report.rows[1].saleStockCents,999);
  const csv=catalogCsv(report);
  assert.ok(csv.includes('Produto 0510'));
  fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'catalogo.csv'),csv);
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Produtos');
  const {columns,rows,totals}=catalogSpreadsheetRows(report);
  sheet.columns=columns.map(col=>({header:col.label,key:col.key}));
  rows.forEach(row=>sheet.addRow(row));
  sheet.addRow({name:'TOTAL',saleStockValue:totals.saleStockValue,
    costStockValue:totals.costStockValue});
  const xlsxPath=path.join(out,'catalogo.xlsx');
  await book.xlsx.writeFile(xlsxPath);
  const reopened=new ExcelJS.Workbook();
  await reopened.xlsx.readFile(xlsxPath);
  assert.equal(reopened.getWorksheet('Produtos').rowCount,512);
  assert.equal(reopened.getWorksheet('Produtos').getRow(511).getCell(1).value,'Produto 0510');
  const temporary=fs.mkdtempSync(path.join(app.getPath('temp'),'pdv-plus-qa-catalog-'));
  const win=new BrowserWindow({show:false,width:1100,height:700,
    webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
  try{
    const file=path.join(temporary,'catalogo.html');
    fs.writeFileSync(file,catalogHtml(report),{encoding:'utf8',mode:0o600});
    await win.loadFile(file);
    const rendered=await win.webContents.executeJavaScript(
      '({rows:document.querySelectorAll("tbody tr").length,'+
      'last:document.querySelector("tbody tr:last-child")?.textContent})'
    );
    assert.equal(rendered.rows,510);
    assert.ok(rendered.last.includes('Produto 0510'));
    const pdf=await win.webContents.printToPDF({
      pageSize:'A4',landscape:true,printBackground:true
    });
    assert.ok(pdf.length>3000&&pdf.subarray(0,5).toString()==='%PDF-',
      'Chromium não gerou um PDF válido');
    fs.writeFileSync(path.join(out,'catalogo.pdf'),pdf);
    fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({
      expected:510,lastProduct:'Produto 0510',
      saleStockCents:report.totals.saleStockCents,
      costStockCents:report.totals.costStockCents,
      pdfBytes:pdf.length
    },null,2));
    console.log('CATALOG_QA_RENDER_OK 510 produtos, Excel e PDF gerados');
  }finally{
    if(!win.isDestroyed())win.destroy();
    fs.rmSync(temporary,{recursive:true,force:true});
  }
}
app.whenReady().then(run).then(()=>app.quit()).catch(error=>{
  console.error('CATALOG_QA_FAILED',error);
  app.exit(1);
});
