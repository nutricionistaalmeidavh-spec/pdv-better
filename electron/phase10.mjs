// Migração aditiva: nenhum lançamento ou estoque histórico é descartado.
export function migratePhase10(db){
 const version=db.prepare('PRAGMA user_version').get().user_version;
 if(version>=10)return;
 if(version!==9)throw new Error('Migração comercial P0/P1 requer banco v9.');
 db.exec('BEGIN IMMEDIATE');
 try{
  db.exec(`
   CREATE TABLE commercial_purchases(
    id TEXT PRIMARY KEY, supplier_id TEXT NOT NULL REFERENCES suppliers(id),
    status TEXT NOT NULL CHECK(status IN('draft','received')),
    document_ref TEXT, due_on TEXT, total_cents INTEGER NOT NULL CHECK(total_cents>=0),
    created_at TEXT NOT NULL, received_at TEXT, operator_id TEXT
   );
   CREATE TABLE commercial_purchase_lines(
    id TEXT PRIMARY KEY, purchase_id TEXT NOT NULL REFERENCES commercial_purchases(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    quantity_milli INTEGER NOT NULL CHECK(quantity_milli>0),
    unit_cost_cents INTEGER NOT NULL CHECK(unit_cost_cents>=0)
   );
   CREATE INDEX purchase_lines_parent ON commercial_purchase_lines(purchase_id);
   CREATE TABLE finance_settlements(
    id TEXT PRIMARY KEY,entry_id TEXT NOT NULL REFERENCES financial_entries(id),
    amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
    method TEXT NOT NULL,operator_id TEXT,created_at TEXT NOT NULL
   );
   CREATE INDEX finance_settlements_entry ON finance_settlements(entry_id);
   CREATE TABLE cash_count_checks(
    session_id TEXT NOT NULL REFERENCES cash_sessions(id),method TEXT NOT NULL,
    expected_cents INTEGER NOT NULL CHECK(expected_cents>=0),
    counted_cents INTEGER NOT NULL CHECK(counted_cents>=0),
    difference_cents INTEGER NOT NULL,verified_by TEXT,created_at TEXT NOT NULL,
    PRIMARY KEY(session_id,method)
   );
   ALTER TABLE sale_item_payments ADD COLUMN quantity_milli INTEGER CHECK(quantity_milli IS NULL OR quantity_milli>0);
   ALTER TABLE financial_entries ADD COLUMN purchase_id TEXT REFERENCES commercial_purchases(id);
   CREATE UNIQUE INDEX payable_by_purchase ON financial_entries(purchase_id) WHERE purchase_id IS NOT NULL;
  `);
  // Liquidações antigas já tiveram efeito no caixa: criar somente rastreabilidade.
  db.exec(`INSERT INTO finance_settlements(id,entry_id,amount_cents,method,operator_id,created_at)
    SELECT 'legacy:' || id,id,amount_cents,COALESCE(method,'legacy'),NULL,COALESCE(settled_at,created_at)
    FROM financial_entries WHERE status='settled';`);
  db.exec('PRAGMA user_version=10;');
  db.exec('COMMIT');
 }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
}
