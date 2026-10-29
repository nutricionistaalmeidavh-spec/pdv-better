export function migratePhase7(db){
 const version=db.prepare('PRAGMA user_version').get().user_version;
 if(version>=7)return;
 if(version!==6)throw new Error('Migração financeira v7 requer base v6.');
 db.exec('BEGIN IMMEDIATE');
 try{
  db.exec("CREATE TABLE sale_item_payments("+
   "id TEXT PRIMARY KEY,sale_id TEXT NOT NULL REFERENCES sales(id),"+
   "sale_item_id TEXT NOT NULL REFERENCES sale_items(id),"+
   "sale_payment_id TEXT NOT NULL REFERENCES sale_payments(id),"+
   "amount_cents INTEGER NOT NULL CHECK(amount_cents>0),"+
   "UNIQUE(sale_item_id,sale_payment_id));"+
   "CREATE INDEX sale_item_payments_sale ON sale_item_payments(sale_id);"+
   "PRAGMA user_version=7;");
  db.exec('COMMIT');
 }catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}
}
