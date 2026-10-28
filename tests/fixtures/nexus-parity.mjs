import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCatalog } from '../../electron/db.mjs';

// Dados inteiramente ficticios. Cada caso usa um SQLite real e isolado.
// Os valores sao inteiros em centavos e milésimos, seguindo o contrato canonico.
export function createNexusParityFixture() {
  const folder = mkdtempSync(join(tmpdir(), 'pdv-plus-nexus-parity-'));
  const database = join(folder, 'loja-ficticia.sqlite');
  let store = openCatalog(database, { terminalId: 'caixa-a' });
  const unit = store.save('products', {
    name: 'Cafe Ficticio 250g',
    code: 'QA-PARITY-001',
    unit: 'UN',
    sale_price_cents: '12,50',
    cost_price_cents: '5,25',
    stock_milli: '6'
  });
  const weight = store.save('products', {
    name: 'Tomate Ficticio KG',
    code: 'QA-PARITY-002',
    unit: 'KG',
    sale_price_cents: '9,00',
    cost_price_cents: '3,00',
    stock_milli: '4,000'
  });
  const customer = store.save('customers', { name: 'Cliente Ficticio QA' });
  return {
    database,
    get store() { return store; },
    unit,
    weight,
    customer,
    reopen() {
      store.close();
      store = openCatalog(database, { terminalId: 'caixa-a' });
      return store;
    },
    cleanup() {
      try { store.close(); } finally { rmSync(folder, { recursive: true, force: true }); }
    }
  };
}
