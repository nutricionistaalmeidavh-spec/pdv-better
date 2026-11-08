import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createNexusParityFixture} from './fixtures/nexus-parity.mjs';
import {readFileSync} from 'node:fs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('catálogo pagina no SQLite, ordena estavelmente, preserva busca e omite imagens quando solicitado',()=>{
 const f=createNexusParityFixture();
 try{
   for(let i=0;i<113;i++)f.store.save('products',{name:'Item '+String(i).padStart(3,'0'),code:'PAG-'+i,unit:'UN',sale_price_cents:'2,00'});
   const all=f.store.list('products');
   assert.equal(all.length,115);
   const first=f.store.list('products','',{page:0,pageSize:35,includeImages:false});
   const next=f.store.list('products','',{page:1,pageSize:35,includeImages:false});
   const last=f.store.list('products','',{page:3,pageSize:35,includeImages:false});
   assert.equal(first.total,115);
   assert.equal(first.rows.length,35);
   assert.equal(next.rows.length,35);
   assert.equal(last.rows.length,10);
   assert.equal(new Set([...first.rows,...next.rows,...last.rows].map(x=>x.id)).size,80);
   assert.equal(Object.hasOwn(first.rows[0],'image_data'),false);
   assert.equal(f.store.list('products','PAG-112',{page:0,pageSize:10}).total,1);
   assert.equal(f.store.list('products','',{page:9,pageSize:35}).rows.length,0);
   assert.throws(()=>f.store.list('products','',{page:-1,pageSize:35}),/página|pagin/i);
   assert.throws(()=>f.store.list('products','',{page:0,pageSize:100000}),/página|pagin/i);
 }finally{f.cleanup();}
});

test('índices de navegação, histórico e filtros existem e consultas usam índice',()=>{
 const f=createNexusParityFixture();
 try{
   const db=new DatabaseSync(f.database);
   try{
     const indexes=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(x=>x.name));
     for(const name of ['idx_products_active_name','idx_categories_active_name','idx_sales_recent','idx_sales_active_recent',
       'idx_cash_movements_session_recent','idx_stock_movements_product_recent','idx_finance_entries_status_due']){
       assert.ok(indexes.has(name),name);
     }
     const plan=db.prepare('EXPLAIN QUERY PLAN SELECT id,name FROM products WHERE active=1 ORDER BY name COLLATE NOCASE,id LIMIT 75').all()
       .map(x=>x.detail).join(' ');
     assert.match(plan,/idx_products_active_name/);
   }finally{db.close();}
 }finally{f.cleanup();}
});

test('vendas paginadas respeitam terminal de caixa e vendas completas continuam disponíveis para compatibilidade',()=>{
 const f=createNexusParityFixture();
 try{
   f.store.openSession({openingCashCents:0});
   for(let i=0;i<38;i++)f.store.checkout({
     key:'sales-paged-'+i,items:[{id:f.unit.id,quantityMilli:1000}],
     payments:[{method:'pix',amountCents:1250}]
   });
   assert.equal(f.store.listSales().length,38);
   const first=f.store.listSales({page:0,pageSize:13});
   const last=f.store.listSales({page:2,pageSize:13});
   assert.equal(first.rows.length,13);
   assert.equal(first.total,38);
   assert.equal(last.rows.length,12);
   assert.equal(f.store.listSales({page:0,pageSize:13},{role:'Caixa',terminalId:'caixa-a'}).total,38);
   assert.equal(f.store.listSales({page:0,pageSize:13},{role:'Caixa',terminalId:'caixa-b'}).total,0);
 }finally{f.cleanup();}
});

test('resumo dos últimos sete dias é agregado no SQL no fuso do próprio computador',()=>{
 const old=process.env.TZ;process.env.TZ='America/Sao_Paulo';
 const f=createNexusParityFixture();
 try{
   f.store.openSession({openingCashCents:0});
   const sale=f.store.checkout({key:'daily-aggregate',items:[{id:f.unit.id,quantityMilli:1000}],
     payments:[{method:'cash',amountCents:1250}]});
   const db=new DatabaseSync(f.database);
   try{db.prepare('UPDATE sales SET created_at=? WHERE id=?').run('2026-11-08T01:30:00.000Z',sale.id);}
   finally{db.close();}
   const rows=f.store.reportDailySales({today:'2026-11-08',days:3});
   assert.equal(rows.find(x=>x.key==='2026-11-07').amount,1250);
   assert.equal(rows.find(x=>x.key==='2026-11-08').amount,0);
 }finally{f.cleanup();if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});

test('as telas cadastrais usam paginação real e relatórios não consultam histórico completo',()=>{
 const app=source('src/App.tsx');
 const commerce=source('src/Commerce.tsx');
 assert.match(app,/\.list\(view,search,\{page,pageSize/);
 assert.doesNotMatch(app,/accessible\.map\(\(kind:string\) => bridge\.list\(kind\)\)/);
 assert.match(commerce,/salesList\(\{page:salesPage,pageSize/);
 assert.match(commerce,/reportDailySales/);
 assert.doesNotMatch(commerce,/api\.salesList\(\)/);
});
