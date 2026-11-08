import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openCatalog} from '../electron/db.mjs';
import {allowed} from '../shared/access.mjs';
import {ALLOWED_RPC} from '../electron/lan.mjs';
import {firstAccessStorageKey,isStoreProfileReady,normalizeStoreProfile,evaluateFirstAccess}
  from '../shared/first-access.mjs';

const company={name:'Mercado Exemplo',document:'12.345.678/0001-95',address:'Rua Central, 100'};

test('primeiro acesso: sistema e cadastro essenciais; produtos e caixa opcionais',()=>{
  const initial=evaluateFirstAccess();
  assert.equal(initial.operationReady,false);
  assert.deepEqual(initial.steps.map(step=>step.id),['system','company','products','cash']);
  assert.equal(initial.completed,0);
  const ready=evaluateFirstAccess({databaseReady:true,profile:company});
  assert.equal(ready.operationReady,true);
  assert.equal(ready.completed,2);
  assert.equal(ready.percentage,50);
  assert.equal(ready.steps[2].state,'optional');
  assert.equal(ready.steps[3].state,'optional');
  const complete=evaluateFirstAccess({databaseReady:true,profile:company,productsCount:10,cashOpen:true});
  assert.equal(complete.percentage,100);
  assert.equal(new Set(complete.steps.map(s=>s.id)).size,4);
  assert.ok(complete.steps.every(s=>!s.title.toLowerCase().includes('fiscal')));
});

test('primeiro acesso: validação, normalização e preferência separada por usuário',()=>{
  assert.equal(isStoreProfileReady(company),true);
  assert.equal(isStoreProfileReady({...company,document:'123'}),false);
  assert.equal(isStoreProfileReady({...company,address:''}),false);
  assert.deepEqual(normalizeStoreProfile(company),{
    name:'Mercado Exemplo',document:'12345678000195',address:'Rua Central, 100'
  });
  assert.throws(()=>normalizeStoreProfile({name:'A',document:'123',address:'X'}),/Informe nome/);
  assert.throws(()=>normalizeStoreProfile({...company,name:12}),/Informe nome/);
  assert.notEqual(firstAccessStorageKey('admin-1'),firstAccessStorageKey('admin-2'));
});

test('primeiro acesso: cadastro persiste no SQLite canônico e sobrevive a reinício',()=>{
  const folder=mkdtempSync(join(tmpdir(),'pdv-first-access-'));
  const path=join(folder,'local.sqlite');
  try{
    let store=openCatalog(path);
    assert.equal(store.getStoreProfile().name,'');
    const saved=store.saveStoreProfile(company);
    assert.equal(saved.name,'Mercado Exemplo');
    assert.equal(saved.document,'12345678000195');
    assert.ok(saved.updated_at);
    store.close();
    store=openCatalog(path);
    assert.deepEqual(['name','document','address'].map(k=>store.getStoreProfile()[k]),
      ['Mercado Exemplo','12345678000195','Rua Central, 100']);
    store.saveStoreProfile({name:'Nova Loja',document:'12345678901',address:'Av Brasil 200'});
    assert.equal(store.getStoreProfile().name,'Nova Loja');
    assert.equal(store.overview().products,0);
    store.close();
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('primeiro acesso: alteração protegida por perfil, inclusive em LAN',()=>{
  assert.equal(allowed('Caixa','getStoreProfile'),true);
  assert.equal(allowed('Gerente','getStoreProfile'),true);
  assert.equal(allowed('Caixa','saveStoreProfile'),false);
  assert.equal(allowed('Gerente','saveStoreProfile'),false);
  assert.equal(allowed('Administrador','saveStoreProfile'),true);
  assert.ok(ALLOWED_RPC.includes('getStoreProfile'));
  assert.ok(ALLOWED_RPC.includes('saveStoreProfile'));
});
