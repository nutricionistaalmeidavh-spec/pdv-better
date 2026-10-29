import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createNexusParityFixture} from './fixtures/nexus-parity.mjs';
test('COMPARE-01: compara dois períodos comerciais em centavos sem duplicar pagamentos',()=>{
 const f=createNexusParityFixture();
 try{
  let db=f.store;db.openSession({openingCashCents:0});
  const a=db.checkout({key:'period-01',items:[{id:f.unit.id,quantityMilli:1000}],payments:[{method:'pix',amountCents:1250}]});
  const b=db.checkout({key:'period-02',items:[{id:f.unit.id,quantityMilli:2000}],payments:[{method:'cash',amountCents:2500}]});
  const raw=new DatabaseSync(f.database);
  raw.prepare('UPDATE sales SET created_at=? WHERE id=?').run('2026-10-01T12:00:00Z',a.id);
  raw.prepare('UPDATE sales SET created_at=? WHERE id=?').run('2026-10-15T12:00:00Z',b.id);
  raw.close();
  db=f.reopen();
  const result=db.compareReportPeriods({from:'2026-10-01',to:'2026-10-07',comparisonFrom:'2026-10-15',comparisonTo:'2026-10-21'});
  assert.equal(result.previous.total_cents,1250);
  assert.equal(result.current.total_cents,2500);
  assert.equal(result.previous.sales_count,1);
  assert.equal(result.current.sales_count,1);
  assert.equal(result.delta_cents,1250);
  assert.equal(result.delta_basis_points,10000);
 }finally{f.cleanup();}
});
test('COMPARE-02: datas sobrepostas são permitidas mas ordem invertida e ISO inválido são recusados',()=>{
 const f=createNexusParityFixture();
 try{
  assert.throws(()=>f.store.compareReportPeriods({from:'2026-10-31',to:'2026-10-01',comparisonFrom:'2026-10-10',comparisonTo:'2026-10-20'}),/período|inválid/i);
  assert.throws(()=>f.store.compareReportPeriods({from:'2026-99-01',to:'2026-10-30',comparisonFrom:'2026-10-01',comparisonTo:'2026-10-30'}),/data|inválid/i);
 }finally{f.cleanup();}
});
