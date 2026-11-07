// Migração aditiva SQLite v12: imagens locais ficam no mesmo arquivo do catálogo,
// incluindo backup e restauração já existentes, sem servidor de imagens.
export function migratePhase12(db){
  const version=db.prepare('PRAGMA user_version').get().user_version;
  if(version>=12)return;
  if(version!==11)throw new Error('Migração de fotos requer SQLite v11.');
  db.exec('BEGIN IMMEDIATE');
  try{
    const columns=new Set(db.prepare('PRAGMA table_info(products)').all().map(col=>col.name));
    if(!columns.has('image_data'))db.exec("ALTER TABLE products ADD COLUMN image_data TEXT NOT NULL DEFAULT ''");
    db.exec('PRAGMA user_version=12');
    db.exec('COMMIT');
  }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
}
