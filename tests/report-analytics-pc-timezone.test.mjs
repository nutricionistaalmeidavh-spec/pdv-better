import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createNexusParityFixture} from './fixtures/nexus-parity.mjs';
import {localDateKey,reportDailySales,reportPaymentBreakdown} from '../shared/report-analytics.mjs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('data do relatório usa o fuso e a data que o computador usa, inclusive perto de meia-noite',()=>{
  const old=process.env.TZ;
  try {
    process.env.TZ='America/Sao_Paulo';
    assert.equal(localDateKey('2026-11-08T01:30:00.000Z'),'2026-11-07');
    assert.equal(localDateKey('2026-11-07T13:00:00.000Z'),'2026-11-07');
    const daily=reportDailySales([
      {status:'completed',is_training:0,total_cents:1200,created_at:'2026-11-08T01:30:00.000Z'},
      {status:'cancelled',is_training:0,total_cents:600,created_at:'2026-11-08T01:30:00.000Z'},
      {status:'completed',is_training:1,total_cents:900,created_at:'2026-11-08T01:30:00.000Z'}
    ],new Date('2026-11-08T12:00:00.000Z'));
    assert.equal(daily.find(d=>d.key==='2026-11-07').amount,1200);
  }finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});

test('faturamento é separado de pagamentos declarados e de fiado ainda a receber',()=>{
  const r=reportPaymentBreakdown({
    sales_total_cents:15000,cash_cents:3000,pix_cents:4000,card_cents:1500,
    card_credit_cents:2500,card_debit_cents:1000,credit_cents:3000,
    receivables_open_cents:1800
  });
  assert.equal(r.recordedPaymentCents,12000);
  assert.equal(r.creditSaleCents,3000);
  assert.equal(r.openReceivablesCents,1800);
  assert.equal(r.totalSalesCents,15000);
  assert.equal(r.differenceCents,0);
  assert.equal(r.paymentMethods.some(p=>p.name==='Fiado'),false);
  assert.equal(r.paymentMethods.reduce((t,p)=>t+p.amount,0),12000);
});

test('filtro detalhado usa dia do PC, não o prefixo UTC da venda',()=>{
  const old=process.env.TZ;process.env.TZ='America/Sao_Paulo';
  const f=createNexusParityFixture();
  try{
    f.store.openSession({openingCashCents:0});
    const sale=f.store.checkout({key:'pc-midnight',items:[{id:f.unit.id,quantityMilli:1000}],
      payments:[{method:'pix',amountCents:1250}]});
    const db=new DatabaseSync(f.database);
    db.prepare('UPDATE sales SET created_at=? WHERE id=?').run('2026-11-08T01:30:00.000Z',sale.id);
    db.close();
    const onPc=f.store.reportItems({from:'2026-11-07',to:'2026-11-07'});
    assert.equal(onPc.rows.length,1);
    assert.equal(f.store.reportItems({from:'2026-11-08',to:'2026-11-08'}).rows.length,0);
    const compare=f.store.compareReportPeriods({from:'2026-11-07',to:'2026-11-07',
      comparisonFrom:'2026-11-08',comparisonTo:'2026-11-08'});
    assert.equal(compare.previous.total_cents,1250);
    assert.equal(compare.current.total_cents,0);
  }finally{f.cleanup();if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});

test('não existe corte de 500 no renderer nem bloqueio fixo de 10 mil vendas no backend',()=>{
  const ui=source('src/Commerce.tsx');
  const backend=source('electron/commerce.mjs');
  const exporter=source('shared/item-report-export.mjs');
  assert.doesNotMatch(ui,/\.slice\(0,\s*500\)/);
  assert.doesNotMatch(ui,/primeiros 500 itens|rows\.length>500/);
  assert.match(ui,/reportItemVisibleCount/);
  assert.match(ui,/Mostrar mais/);
  assert.doesNotMatch(backend,/sales\.length\s*>\s*10000/);
  assert.doesNotMatch(exporter,/report\.rows\.length\s*>\s*100000/);
});

test('histórico com mais de 500 registros é integralmente consultável',()=>{
  const f=createNexusParityFixture();
  try{
    const product=f.store.save('products',{name:'Produto de volume QA',unit:'UN',sale_price_cents:'1,00',stock_milli:'700'});
    f.store.openSession({openingCashCents:0});
    for(let i=0;i<512;i++)f.store.checkout({
      key:'stress-report-'+i,items:[{id:product.id,quantityMilli:1000}],
      payments:[{method:'cash',amountCents:100}]
    });
    const report=f.store.reportItems({productId:product.id});
    assert.equal(report.rows.length,512);
    assert.equal(report.summary.net_total_cents,51200);
    assert.equal(f.store.report().sales_total_cents,51200);
  }finally{f.cleanup();}
});
