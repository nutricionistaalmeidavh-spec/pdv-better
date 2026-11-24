import test from 'node:test';
import assert from 'node:assert/strict';
import {openCatalog} from '../electron/db.mjs';
import {parseCsv, writeCsv, transferColumns} from '../shared/data-transfer.mjs';
import {readTransferFile, makeTransferXlsx} from '../electron/data-transfer-file.mjs';
import {allowed} from '../shared/access.mjs';

test('CSV aceita vírgula, ponto e vírgula, aspas e BOM; XLSX preserva zeros e bloqueia fórmulas',async()=>{
  assert.deepEqual(parseCsv('\uFEFFNome,CPF\r\n"A, B",00123'),[['Nome','CPF'],['A, B','00123']]);
  assert.deepEqual(parseCsv(writeCsv([['Nome','Telefone'],['Ana; B','00123']])),[['Nome','Telefone'],['Ana; B','00123']]);
  const cols=transferColumns('customers');
  const cells=[cols.map(c=>c.label),cols.map(c=>c.key==='name'?'Ana':c.key==='document'?'00123':'')];
  const bytes=await makeTransferXlsx('customers',cells);
  assert.deepEqual(await readTransferFile('xlsx',bytes),cells);
  assert.match(writeCsv([['=1+1']]),/'=1\+1/);
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
