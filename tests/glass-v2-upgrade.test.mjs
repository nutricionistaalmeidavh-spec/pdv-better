import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openCatalog } from '../electron/db.mjs';

test('Glass v2: preserva venda, itens, estoque e caixa fechado ao migrar para schema v3 canônico',()=>{
  const folder=mkdtempSync(join(tmpdir(),'pdv-glass-v2-')); const path=join(folder,'legacy.sqlite');
  const product='00000000-0000-4000-8000-000000000001';
  const sale='00000000-0000-4000-8000-000000000002';
  try {
    const old=new DatabaseSync(path);
    old.exec(`PRAGMA user_version=2;
      CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, unit TEXT,code TEXT, sale_price_cents INTEGER,cost_price_cents INTEGER,stock_milli INTEGER,active INTEGER,created_at TEXT,updated_at TEXT);
      CREATE TABLE customers(id TEXT PRIMARY KEY,name TEXT,active INTEGER);
      CREATE TABLE sales (id TEXT PRIMARY KEY,created_at TEXT NOT NULL,total_cents INTEGER NOT NULL,tendered_cents INTEGER NOT NULL,change_cents INTEGER NOT NULL,payment_method TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'completed');
      CREATE TABLE sale_items (sale_id TEXT NOT NULL REFERENCES sales(id),product_id TEXT NOT NULL,name TEXT NOT NULL,unit TEXT NOT NULL,price_cents INTEGER NOT NULL,quantity_milli INTEGER NOT NULL,line_total_cents INTEGER NOT NULL,PRIMARY KEY(sale_id,product_id));`);
    old.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run(product,'Café','UN','CX',750,450,2000,1,'2026-10-01','2026-10-01');
    old.prepare('INSERT INTO sales VALUES(?,?,?,?,?,?,?)').run(sale,'2026-10-27T12:30:00.000Z',750,1000,250,'cash','completed');
    old.prepare('INSERT INTO sale_items VALUES(?,?,?,?,?,?,?)').run(sale,product,'Café','UN',750,1000,750);
    old.close();
    const store=openCatalog(path);
    try {
      const rows=store.listSales();assert.equal(rows.length,1);
      const migrated=store.getSale(rows[0].id);
      assert.equal(migrated.id,sale);
      assert.equal(migrated.total_cents,750);
      assert.equal(migrated.change_cents,250);
      assert.equal(migrated.items[0].name,'Café');
      assert.equal(migrated.payments[0].amount_cents,750);
      assert.equal(store.list('products')[0].stock_milli,2000);
      assert.equal(store.listStockMovements(product).reduce((sum,item)=>sum+item.delta_milli,0),2000);
      assert.equal(store.getCurrentSession(),null);
    } finally {store.close();}
    const again=openCatalog(path);
    try{assert.equal(again.listSales().length,1);assert.equal(again.listStockMovements(product).length,2);}
    finally{again.close();}
    const verify=new DatabaseSync(path);assert.equal(verify.prepare('PRAGMA user_version').get().user_version,5);verify.close();
  } finally {rmSync(folder,{recursive:true,force:true});}
});
