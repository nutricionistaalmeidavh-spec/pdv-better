import test from 'node:test';
import ExcelJS from 'exceljs';
import assert from 'node:assert/strict';
import {openCatalog} from '../electron/db.mjs';
import {parseCsv, writeCsv, transferColumns, suggestTransferMapping, remapTransferTable} from '../shared/data-transfer.mjs';
import {readTransferFile, makeTransferXlsx} from '../electron/data-transfer-file.mjs';
import {allowed} from '../shared/access.mjs';

test('CSV aceita vírgula, ponto e vírgula, aspas e BOM; XLSX preserva zeros e bloqueia fórmulas',async()=>{
  assert.deepEqual(parseCsv('\uFEFFNome,CPF\r\n"A, B",00123'),[['Nome','CPF'],['A, B','00123']]);
  assert.deepEqual(parseCsv(writeCsv([['Nome','Telefone'],['Ana; B','00123']])),[['Nome','Telefone'],['Ana; B','00123']]);
  const cols=transferColumns('customers');
  const cells=[cols.map(c=>c.label),cols.map(c=>c.key==='name'?'Ana':c.key==='document'?'00123':'')];
  const bytes=await makeTransferXlsx('customers',cells);
  assert.deepEqual(await readTransferFile('xlsx',bytes),cells);
  const formulaBook=new ExcelJS.Workbook();const formulaSheet=formulaBook.addWorksheet('Dados');
  formulaSheet.addRow(['Nome']);formulaSheet.addRow([{formula:'1+1',result:2}]);
  await assert.rejects(readTransferFile('xlsx',new Uint8Array(await formulaBook.xlsx.writeBuffer())),/fórmulas/i);
  assert.ok(writeCsv([['=1+1']]).includes("'=1+1"));
});
test('prévia não grava; confirmação cria e atualiza clientes pelo documento, sem sobrescrever campos ausentes',()=>{
  const db=openCatalog(':memory:');
  try{
    const input={kind:'customers',table:[['Nome','CPF / CNPJ','Telefone'],['Ana','00123','01234']]};
    const p=db.previewDataTransfer(input);
    assert.equal(p.created,1);
    assert.equal(db.list('customers').length,0);
    db.importDataTransfer({...input,token:p.token},{operatorId:'qa'});
    const update={kind:'customers',table:[['Nome','CPF / CNPJ'],['Ana Silva','00123']]};
    const p2=db.previewDataTransfer(update);
    assert.equal(p2.updated,1);
    db.importDataTransfer({...update,token:p2.token},{operatorId:'qa'});
    assert.equal(db.list('customers')[0].phone,'01234');
    assert.equal(db.list('customers')[0].name,'Ana Silva');
    assert.throws(()=>db.importDataTransfer({...update,token:p2.token}),/prévia|mudou/i);
    assert.equal(db.list('customers').length,1);
  }finally{db.close();}
});
test('estoque em lote altera saldo com motivo e trilha, rejeita duplicatas e saldo obsoleto',()=>{
  const db=openCatalog(':memory:');
  try{
    const product=db.save('products',{name:'Café',code:'0001',unit:'UN',sale_price_cents:1000,stock_milli:2000});
    const input={kind:'inventory',reason:'Inventário',table:[['Código','Estoque'],['0001','5']]};
    const p=db.previewDataTransfer(input);
    assert.equal(db.list('products')[0].stock_milli,2000);
    db.importDataTransfer({...input,token:p.token},{operatorId:'qa'});
    assert.equal(db.list('products')[0].stock_milli,5000);
    assert.ok(db.listStockMovements(product.id).some(m=>m.delta_milli===3000&&m.reason.includes('Inventário')));
    assert.throws(()=>db.importDataTransfer({...input,token:p.token}),/prévia|mudou/i);
    assert.throws(()=>db.previewDataTransfer({...input,table:[['Código','Estoque'],['0001','3'],['0001','4']]}),/duplicad/i);
    assert.throws(()=>db.previewDataTransfer({...input,table:[['Código','Estoque'],['0001','3'],['inexistente','2']]}),/não encontrado/i);
    assert.equal(db.list('products')[0].stock_milli,5000);
  }finally{db.close();}
});
test('permissões de intercâmbio não incluem operadores ou caixa',()=>{
  assert.equal(allowed('Caixa','previewDataTransfer'),false);
  assert.equal(allowed('Gerente','importDataTransfer'),true);
  const db=openCatalog(':memory:');
  try{assert.throws(()=>db.previewDataTransfer({kind:'operators',table:[['Nome'],['X']]}),/não suportad/i);}finally{db.close();}
});

test('importa mais de 500 produtos, preserva saldo, exporta cadastro reimportável e cria fornecedores e categorias',()=>{
 const db=openCatalog(':memory:');
 const commit=input=>db.importDataTransfer({...input,token:db.previewDataTransfer(input).token});
 try{
  commit({kind:'categories',table:[['Nome'],['Bebidas']]});
  commit({kind:'suppliers',table:[['Nome','CNPJ'],['Fornecedor QA','00123456789012']]});
  const table=[['Nome','Código','Unidade','Preço','Estoque','Categoria'],...Array.from({length:601},(_,i)=>['Item '+i,'SKU'+i,'UN','9,49','2','Bebidas'])];
  assert.equal(commit({kind:'products',table}).created,601);
  const exported=db.exportDataTransfer('products');
  assert.equal(exported.count,601);
  assert.equal(db.previewDataTransfer({kind:'products',table:exported.table}).unchanged,601);
  assert.equal(db.list('products').length,601);
  assert.equal(db.list('suppliers').length,1);
  assert.equal(db.list('products')[0].sale_price_cents,949);
  assert.equal(db.list('products')[0].stock_milli,2000);
 }finally{db.close();}
});

test('mapeia cabeçalhos externos, ignora coluna escolhida e consulta histórico paginado',()=>{
 const headers=['Razão social','Documento','Observações internas'];
 const table=[headers,['Fornecedor A','00123','ignorar']];
 assert.deepEqual(suggestTransferMapping('suppliers',headers),['name','document','']);
 assert.deepEqual(remapTransferTable('suppliers',table,['name','document','']),[['name','document'],['Fornecedor A','00123']]);
 assert.throws(()=>remapTransferTable('suppliers',table,['name','name','']),/repetir/i);
 const store=openCatalog(':memory:');
 try{
  const input={kind:'suppliers',table:remapTransferTable('suppliers',table,['name','document',''])};
  store.importDataTransfer({...input,token:store.previewDataTransfer(input).token});
  assert.equal(store.dataTransferHistory({kind:'suppliers',page:0,pageSize:1}).rows[0].created_count,1);
  assert.equal(store.dataTransferHistory({kind:'suppliers',page:1,pageSize:1}).rows.length,0);
  assert.equal(store.dataTransferHistory({kind:'customers',page:0,pageSize:1}).total,0);
 }finally{store.close();}
});
test('XLSX utiliza células numéricas para preço/quantidade e texto para identificadores',async()=>{
 const columns=transferColumns('inventory');
 const bytes=await makeTransferXlsx('inventory',[columns.map(c=>c.label),['','000123','1.250']]);
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(bytes));
 const sheet=workbook.worksheets[0];
 assert.equal(sheet.getCell('B2').value,'000123');
 assert.equal(sheet.getCell('C2').value,1.25);
 assert.equal(sheet.getCell('C2').numFmt,'0.000');
});

test('worker exporta snapshot SQLite em CSV e XLSX sem materializar catálogo no renderer',async()=>{
 const {createNexusParityFixture}=await import('./fixtures/nexus-parity.mjs');
 const {runTransferWorker}=await import('../electron/data-transfer-worker-client.mjs');
 const {readFile}=await import('node:fs/promises');
 const f=createNexusParityFixture();
 try{
  for(const format of ['csv','xlsx']){
   const filename=f.database+'.'+format;
   const count=await runTransferWorker({operation:'export',format,kind:'products',databaseFile:f.database,filename});
   assert.equal(count,2);
   const table=await readTransferFile(format,new Uint8Array(await readFile(filename)));
   assert.equal(table.length,3);
   assert.ok(table.some(row=>row.includes('QA-PARITY-001')));
  }
 }finally{f.cleanup();}
});
