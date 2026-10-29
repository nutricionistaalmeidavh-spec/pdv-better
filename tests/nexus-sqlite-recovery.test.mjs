import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCatalog } from '../electron/db.mjs';
import { normalizeSqliteError } from '../electron/sqlite-errors.mjs';

test('NEX-R01: SQLite ocupado retorna erro controlado sem gravar parcialmente e recupera',()=>{
  const dir=mkdtempSync(join(tmpdir(),'nex-sqlite-busy-'));
  const path=join(dir,'dados.sqlite');
  let holder,second;
  try{
    const original=openCatalog(path);
    const p=original.save('products',{name:'Cafe QA',code:'QA-BUSY',unit:'UN',sale_price_cents:'12,50',stock_milli:'4'});
    original.close();
    second=openCatalog(path,{busyTimeoutMs:25});
    holder=new DatabaseSync(path);
    holder.exec('PRAGMA busy_timeout=25; BEGIN IMMEDIATE');
    holder.prepare('UPDATE products SET name=? WHERE id=?').run('Transacao ainda nao confirmada',p.id);
    const start=Date.now();
    assert.throws(()=>second.save('products',{name:'Produto no lock',code:'QA-LOCK',unit:'UN',sale_price_cents:'3,50',stock_milli:'1'}),/ocupado|bloqueado|tente novamente/i);
    assert.ok(Date.now()-start<1200,'timeout configurado deve ser respeitado');
    assert.equal(second.list('products').length,1);
    second.close(); second=null;
    holder.exec('ROLLBACK');holder.close();holder=null;
    const reopened=openCatalog(path,{busyTimeoutMs:25});
    try{
      assert.equal(reopened.list('products').length,1);
      assert.equal(reopened.list('products')[0].name,'Cafe QA');
      const q=reopened.save('products',{name:'Depois do lock',code:'QA-NEXT',unit:'UN',sale_price_cents:'1,00',stock_milli:'1'});
      assert.equal(reopened.list('products').some(x=>x.id===q.id),true);
    }finally{reopened.close();}
  }finally{
    try{second?.close();}catch{}
    try{holder?.exec('ROLLBACK');holder?.close();}catch{}
    rmSync(dir,{recursive:true,force:true});
  }
});

test('NEX-R02: SQLite ilegivel falha fechado com mensagem de integridade, nao recria historico',()=>{
  const dir=mkdtempSync(join(tmpdir(),'nex-sqlite-corrupt-'));
  const path=join(dir,'dados.sqlite');
  try{
    writeFileSync(path,'banco corrompido nao e SQLite');
    assert.throws(()=>openCatalog(path),/corrompid|integridade|inválid/i);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('NEX-R03: SQLite persistido passa quick_check na nova abertura e preserva venda e estoque',()=>{
  const dir=mkdtempSync(join(tmpdir(),'nex-sqlite-check-'));
  const path=join(dir,'dados.sqlite');
  try{
    let store=openCatalog(path);
    const p=store.save('products',{name:'Acucar ficticio',code:'QA-CHECK',unit:'UN',sale_price_cents:'8,50',stock_milli:'2'});
    store.openSession({openingCashCents:0});
    const sale=store.checkout({key:'qa-integrity',items:[{id:p.id,quantityMilli:1000}],payments:[{method:'pix',amountCents:850}]});
    store.close();
    store=openCatalog(path);
    try{
      assert.equal(store.getSale(sale.id).total_cents,850);
      assert.equal(store.list('products')[0].stock_milli,1000);
      assert.equal(store.listSales().length,1);
    }finally{store.close();}
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('NEX-R04: erros de disco cheio e banco bloqueado mostram mensagem operacional segura',()=>{
 assert.match(normalizeSqliteError(new Error('SQLITE_FULL: database or disk is full')).message,/espaço|disco|armazenamento/i);
 assert.match(normalizeSqliteError(new Error('SQLITE_BUSY: database is locked')).message,/ocupado|bloqueado/i);
 assert.match(normalizeSqliteError(new Error('SQLITE_CORRUPT: database disk image is malformed')).message,/corrompid|integridade/i);
});

test('NEX-R05: lock durante checkout nao confirma venda parcial e retorna erro controlado',()=>{
  const dir=mkdtempSync(join(tmpdir(),'nex-checkout-busy-'));
  const path=join(dir,'dados.sqlite');
  let store,holder;
  try{
    store=openCatalog(path,{busyTimeoutMs:25});
    const p=store.save('products',{name:'Feijao QA',code:'QA-LOCK-SALE',unit:'UN',sale_price_cents:'5,00',stock_milli:'3'});
    store.openSession({openingCashCents:0});
    holder=new DatabaseSync(path);
    holder.exec('PRAGMA busy_timeout=25; BEGIN IMMEDIATE');
    const input={key:'nex-locked-checkout',items:[{id:p.id,quantityMilli:1000}],payments:[{method:'cash',amountCents:500}]};
    assert.throws(()=>store.checkout(input),/ocupado|bloqueado|tente novamente/i);
    holder.exec('ROLLBACK'); holder.close(); holder=null;
    assert.equal(store.listSales().length,0);
    assert.equal(store.list('products')[0].stock_milli,3000);
    const confirmed=store.checkout(input);
    assert.equal(confirmed.total_cents,500);
    assert.equal(store.listSales().length,1);
  }finally{
    try{holder?.exec('ROLLBACK');holder?.close();}catch{}
    try{store?.close();}catch{}
    rmSync(dir,{recursive:true,force:true});
  }
});
