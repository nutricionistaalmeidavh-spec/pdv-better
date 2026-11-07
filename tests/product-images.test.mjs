import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {normalizeRecord} from '../shared/domain.mjs';
import {openCatalog} from '../electron/db.mjs';
import {CONTRACT_VERSION,entities} from '../shared/contract.mjs';

const jpeg='data:image/jpeg;base64,/9j/2Q==';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('foto JPEG compactada persiste no SQLite, atualiza e pode ser removida',()=>{
  const store=openCatalog(':memory:');
  try{
    const p=store.save('products',{name:'Refrigerante',unit:'UN',sale_price_cents:'5,99',image_data:jpeg});
    assert.equal(p.image_data,jpeg);
    assert.equal(store.list('products')[0].image_data,jpeg);
    const changed=store.save('products',{...p,image_data:''});
    assert.equal(changed.image_data,'');
    assert.equal(store.list('products')[0].image_data,'');
  }finally{store.close();}
});

test('imagem rejeita URL externa, tipo inesperado, payload malformado e tamanho excessivo',()=>{
  const base={name:'Produto',unit:'UN',sale_price_cents:'1,00'};
  for(const image of ['https://host/foto.jpg','data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,AAAA','data:image/jpeg;base64,invalid!','data:image/jpeg;base64,'+'A'.repeat(100000)]){
    assert.throws(()=>normalizeRecord('products',{...base,image_data:image}),/Imagem do produto|foto|imagem/i);
  }
  assert.equal(normalizeRecord('products',{...base,image_data:jpeg}).image_data,jpeg);
});

test('migração v11 para v12 mantém produtos existentes e backup SQLite inclui fotos',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'pdv-foto-'));
  try{
    const file=join(dir,'catalog.sqlite'),backup=join(dir,'backup.sqlite');
    let store=openCatalog(file);
    const p=store.save('products',{name:'Queijo',unit:'UN',sale_price_cents:'12,90'});
    store.close();
    const legacy=new DatabaseSync(file);
    legacy.exec('PRAGMA user_version=11');
    legacy.close();
    store=openCatalog(file);
    assert.equal(store.list('products')[0].id,p.id);
    store.save('products',{...store.list('products')[0],image_data:jpeg});
    assert.equal(CONTRACT_VERSION,12);
    assert.equal(entities.products.fields.some(f=>f.key==='image_data'),true);
    await store.backupTo(backup);
    store.close();
    const archived=new DatabaseSync(backup);
    try{assert.equal(archived.prepare('SELECT image_data FROM products WHERE id=?').get(p.id).image_data,jpeg);}
    finally{archived.close();}
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('UI de cadastro e caixa usa miniatura e tabela do referencial visual',()=>{
  const app=source('src/App.tsx'),cashier=source('src/Cashier.tsx');
  assert.match(app,/type="file" accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(app,/Foto do produto/);
  assert.match(app,/product-thumbnail/);
  assert.match(cashier,/cashier-table-head/);
  assert.match(cashier,/cashier-item-unit-price/);
  assert.match(cashier,/cashier-item-photo/);
  assert.match(cashier,/productPhotos/);
});
