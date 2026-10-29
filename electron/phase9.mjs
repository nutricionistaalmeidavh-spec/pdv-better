export function migratePhase9(db){
 const version=db.prepare('PRAGMA user_version').get().user_version;
 if(version===9)return;
 if(version!==8)throw new Error('Migração de vendas de treinamento requer banco v8.');
 db.exec('BEGIN IMMEDIATE');
 try{
  db.exec("ALTER TABLE sales ADD COLUMN is_training INTEGER NOT NULL DEFAULT 0 CHECK(is_training IN(0,1));"+
    "CREATE INDEX sales_training_idx ON sales(is_training,status,created_at);"+
    "PRAGMA user_version=9;");
  db.exec('COMMIT');
 }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
}
