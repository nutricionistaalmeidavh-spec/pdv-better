import test from 'node:test';
import assert from 'node:assert/strict';
import {renderItemReportWorker} from '../electron/report-worker-client.mjs';
import {itemReportCsv,itemReportHtml} from '../shared/item-report-export.mjs';
const report={rows:[{sale_id:'qa-01',product_name:'Produto fictício',code:'QA-X',quantity_milli:1000,
  gross_cents:1250,discount_cents:50,net_cents:1200,payment_method:'pix',status:'completed',
  created_at:'2026-10-29T00:00:00Z',brand:'Marca QA',producer:'Produtor QA'}],
  summary:{items_count:1,net_total_cents:1200}};
test('WORK-01: worker exporta CSV e HTML idênticos aos formatos canônicos',async()=>{
 assert.equal(await renderItemReportWorker('csv',report),itemReportCsv(report));
 assert.equal(await renderItemReportWorker('html',report),itemReportHtml(report));
});
test('WORK-02: XLSX binário criado no worker sem depender de nuvem',async()=>{
 const bytes=await renderItemReportWorker('xlsx',report);
 assert.equal(Buffer.from(bytes).subarray(0,2).toString('ascii'),'PK');
 assert.ok(bytes.length>1000);
});
test('WORK-03: formato desconhecido recusa no worker sem gerar arquivo',async()=>{
 await assert.rejects(renderItemReportWorker('unknown',report),/formato|inválido/i);
});
