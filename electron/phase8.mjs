// Campos opcionais de marca/produtor e variantes físicas (cada SKU preserva estoque próprio).
export function migratePhase8(db){
 const version=db.prepare('PRAGMA user_version').get().user_version;
 if(version===8)return;
 if(version!==7)throw new Error('Migração de catálogo v8 requer banco v7.');
 db.exec('BEGIN IMMEDIATE');
 try{
  const productCols=new Set(db.prepare('PRAGMA table_info(products)').all().map(x=>x.name));
  const itemCols=new Set(db.prepare('PRAGMA table_info(sale_items)').all().map(x=>x.name));
  for(const col of ['brand','producer','variant_group','variant_label']){
   if(!productCols.has(col))db.exec('ALTER TABLE products ADD COLUMN "'+col+'" TEXT');
   if(!itemCols.has(col))db.exec('ALTER TABLE sale_items ADD COLUMN "'+col+'" TEXT');
  }
  db.exec("CREATE INDEX IF NOT EXISTS products_brand_idx ON products(brand) WHERE active=1;"+
    "CREATE INDEX IF NOT EXISTS sale_items_brand_idx ON sale_items(brand);"+
    "PRAGMA user_version=8;");
  db.exec('COMMIT');
 }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
}
