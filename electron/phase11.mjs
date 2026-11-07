// Migração exclusivamente aditiva: preserva valores históricos e fluxo original.
export function migratePhase11(db){
 const v=db.prepare('PRAGMA user_version').get().user_version;
 if(v>=11)return;
 if(v!==10)throw new Error('Migração financeira P2 requer SQLite v10.');
 db.exec('BEGIN IMMEDIATE');
 try{
  db.exec(`
   CREATE TABLE finance_recurring_groups(
    id TEXT PRIMARY KEY,request_key TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('payable','receivable')),
    category TEXT,created_at TEXT NOT NULL,created_by TEXT
   );
   ALTER TABLE financial_entries ADD COLUMN category TEXT;
   ALTER TABLE financial_entries ADD COLUMN recurrence_group_id TEXT REFERENCES finance_recurring_groups(id);
   ALTER TABLE financial_entries ADD COLUMN recurrence_index INTEGER;
   CREATE INDEX finance_due_status_idx ON financial_entries(status,due_on,type);
   CREATE INDEX finance_recurrence_idx ON financial_entries(recurrence_group_id,recurrence_index);
   PRAGMA user_version=11;
  `);
  db.exec('COMMIT');
 }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
}
