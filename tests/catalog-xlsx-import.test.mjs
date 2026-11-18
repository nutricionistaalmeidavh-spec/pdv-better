import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {createNexusParityFixture} from './fixtures/nexus-parity.mjs';
import {xlsxToCatalogCsv} from '../electron/catalog-xlsx.mjs';

async function workbookBytes(header,records,{sheetName='Produtos',setup}={}){
  const workbook=new ExcelJS.Workbook();
  const sheet=workbook.addWorksheet(sheetName);
  sheet.addRow(header);
  for(const cells of records)sheet.addRow(cells);
  setup?.(sheet);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

test('XLSX-01: Excel verdadeiro tem prévia sem gravar, importe transacional e preserva códigos com zeros',async()=>{
  const bytes=await workbookBytes(
    ['Nome do produto','Código de barras','Unidade','Preço de venda','Estoque','Preço de custo','Marca'],
    [['Café especial',12345,'UN',8.9,5,4.5,'Marca QA'],
     ['Arroz integral','ARZ-02','KG',12.34,1.25,9.2,'Produtor local']],
    {setup:sheet=>{sheet.getCell('B2').numFmt='0000000000000';}}
  );
  const csv=await xlsxToCatalogCsv(bytes);
  assert.match(csv,/0000000012345/);
  const f=createNexusParityFixture();
  try{
    const original=f.store.list('products').length;
    const preview=f.store.previewCatalogCsv({csv});
    assert.equal(preview.count,2);
    assert.equal(preview.rows[0].name,'Café especial');
    assert.equal(preview.rows[0].sale_price_cents,890);
    assert.equal(f.store.list('products').length,original,'Prévia não pode alterar o SQLite');
    const imported=f.store.importCatalogCsv({csv});
    assert.equal(imported.imported,2);
    const product=f.store.list('products').find(p=>p.code==='0000000012345');
    assert.equal(product.stock_milli,5000);
    assert.equal(product.cost_price_cents,450);
    assert.equal(f.store.listStockMovements(product.id).reduce((sum,m)=>sum+m.delta_milli,0),5000);
    const kg=f.store.list('products').find(p=>p.code==='ARZ-02');
    assert.equal(kg.sale_price_cents,1234);
    assert.equal(kg.stock_milli,1250);
  } finally {f.cleanup();}
});

test('XLSX-02: células com pontuação e reais textuais preservam conteúdo',async()=>{
  const bytes=await workbookBytes(
    ['nome','codigo','unidade','preco','estoque','custo','variacao'],
    [['"Suco"; 2L','X-1','un','R$ 9,49',2,'2,00','Natural "Premium"']]
  );
  const csv=await xlsxToCatalogCsv(bytes);
  const f=createNexusParityFixture();
  try{
    const p=f.store.previewCatalogCsv({csv}).rows[0];
    assert.equal(p.name,'"Suco"; 2L');
    assert.equal(p.sale_price_cents,949);
    assert.equal(p.variant_label,'Natural "Premium"');
  }finally{f.cleanup();}
});

test('XLSX-03: rejeita fórmulas, cabeçalho inválido e valores imprecisos',async()=>{
  const headers=['nome','codigo','unidade','preco','estoque'];
  const base=['Item','SKU-1','UN',2,1];
  const formula=await workbookBytes(headers,[base],{setup:s=>s.getCell('D2').value={formula:'1+1',result:2}});
  await assert.rejects(xlsxToCatalogCsv(formula),/fórmula/i);
  const badHeader=await workbookBytes(['nome','codigo','unidade','estoque'],[['Item','SKU','UN',5]]);
  await assert.rejects(xlsxToCatalogCsv(badHeader),/coluna.*preco|preço/i);
  const badPrecision=await workbookBytes(headers,[['Item','SKU','UN',1.234,2]]);
  await assert.rejects(xlsxToCatalogCsv(badPrecision),/casas decimais|preço|valor/i);
  await assert.rejects(xlsxToCatalogCsv(new Uint8Array([1,2,3])),/Excel|XLSX/i);
  await assert.rejects(xlsxToCatalogCsv(new Uint8Array(2*1024*1024+1)),/2 MB/i);
});

test('XLSX-04: mais de 300 linhas, código duplicado ou produto já cadastrado não alteram banco',async()=>{
  const headers=['nome','codigo','unidade','preco','estoque'];
  const overflow=await workbookBytes(headers,Array.from({length:301},(_,i)=>['Item '+i,'SKU-'+i,'UN',1,1]));
  await assert.rejects(xlsxToCatalogCsv(overflow),/300 produtos/i);
  const duplicate=await workbookBytes(headers,[['A','X','UN',1,1],['B','X','UN',1,1]]);
  const duplicateCsv=await xlsxToCatalogCsv(duplicate);
  const f=createNexusParityFixture();
  try{
    const before=f.store.list('products').length;
    assert.throws(()=>f.store.importCatalogCsv({csv:duplicateCsv}),/duplicad/i);
    assert.equal(f.store.list('products').length,before);
    const existing=await workbookBytes(headers,[['Nova','SKU-NEW','UN',2,2],['Antiga','QA-PARITY-001','UN',2,2]]);
    const existingCsv=await xlsxToCatalogCsv(existing);
    assert.throws(()=>f.store.importCatalogCsv({csv:existingCsv}),/cadastrad|duplicad/i);
    assert.equal(f.store.list('products').length,before);
  }finally{f.cleanup();}
});
