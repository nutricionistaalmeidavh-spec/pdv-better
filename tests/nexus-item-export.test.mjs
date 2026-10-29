import test from 'node:test';
import assert from 'node:assert/strict';
import {itemReportCsv,itemReportHtml,itemReportSheetRows} from '../shared/item-report-export.mjs';
import {createNexusParityFixture} from './fixtures/nexus-parity.mjs';

test('EXPORT-01: CSV, HTML/PDF e XLSX partem das mesmas linhas com saldo exato',()=>{
 const f=createNexusParityFixture();
 try{
  const db=f.store;db.openSession({openingCashCents:0});
  db.checkout({key:'export-01',items:[{id:f.unit.id,quantityMilli:1000},{id:f.weight.id,quantityMilli:350}],discountCents:10,payments:[{method:'pix',amountCents:1555}]});
  const report=db.reportItems();
  const csv=itemReportCsv(report),html=itemReportHtml(report),sheets=itemReportSheetRows(report);
  assert.ok(csv.startsWith('\ufeff'));
  assert.match(csv,/Café|Cafe/);
  assert.match(html,/Relatório detalhado por item/);
  assert.equal(sheets.rows.length,2);
  assert.equal(sheets.rows.reduce((n,r)=>n+r.net_cents,0),1555);
  assert.equal(report.summary.net_total_cents,1545);
 }finally{f.cleanup();}
});

test('EXPORT-02: nomes perigosos são texto inerte em CSV e HTML',()=>{
 const report={rows:[{sale_id:'s',created_at:'2099-01-01',product_name:'=2+3 <img src=x>',code:'@SUM(1)',quantity_milli:1000,gross_cents:100,discount_cents:0,net_cents:100,payment_method:'cash',status:'completed'}],summary:{net_total_cents:100}};
 const csv=itemReportCsv(report),html=itemReportHtml(report);
 assert.ok(!csv.includes(';"=2+3'));
 assert.match(csv,/'=2\+3/);
 assert.ok(!html.includes('<img src=x>'));
 assert.match(html,/&lt;img/);
 assert.match(html,/&lt;/);
});
