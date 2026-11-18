import test from 'node:test';
import assert from 'node:assert/strict';
import { openCatalog } from '../electron/db.mjs';
import { buildCatalogExport, catalogCsv, catalogHtml, catalogSpreadsheetRows } from '../shared/catalog-export.mjs';

test('exporta todo o catálogo ativo, mesmo com mais de 500 produtos, sem imagens', () => {
  const store=openCatalog(':memory:');
  try {
    const category=store.save('categories',{name:'Alimentos'});
    for(let i=0;i<510;i++)store.save('products',{
      name:'Produto '+i,code:'SKU-'+i,unit:'UN',sale_price_cents:'10,00',
      cost_price_cents:'6,00',stock_milli:'2',category_id:category.id,
      image_data:i===0?'data:image/png;base64,AAAA':''
    });
    const products=store.list('products','',{slim:true});
    assert.equal(products.length,510);
    assert.equal(products[0].image_data,undefined);
    const report=buildCatalogExport(products,store.list('categories'),
      {name:'Minha Loja'},new Date('2026-11-18T12:34:00'));
    assert.equal(report.rows.length,510);
    assert.equal(report.rows[0].category,'Alimentos');
    assert.equal(report.totals.saleStockCents,1020000);
    assert.equal(report.totals.costStockCents,612000);
    assert.equal(catalogCsv(report).split('\r\n').length,513);
    assert.equal(catalogSpreadsheetRows(report).rows.length,510);
    store.archive('products',products[0].id);
    assert.equal(buildCatalogExport(store.list('products','',{slim:true}),store.list('categories')).rows.length,509);
  } finally {store.close();}
});

test('formata reais e quantidades de KG, protege CSV e escapa HTML', () => {
  const report=buildCatalogExport([
    {name:'<teste> & "Pão"',code:'=SOMA(1;1)',unit:'KG',stock_milli:1250,sale_price_cents:799,cost_price_cents:300,category_id:'cat'}
  ],[{id:'cat',name:'Doces & salgados'}],{name:'Loja <Central>'},new Date('2026-11-18T10:00:00'));
  assert.equal(report.rows[0].saleStockCents,999);
  assert.equal(report.rows[0].costStockCents,375);
  const csv=catalogCsv(report);
  assert.match(csv,/'\x27=SOMA\(1;1\)"/);
  assert.match(csv,/9,99/);
  const html=catalogHtml(report);
  assert.match(html,/&lt;teste&gt; &amp; &quot;Pão&quot;/);
  assert.match(html,/Loja &lt;Central&gt;/);
  assert.doesNotMatch(html,/<teste>/);
  assert.match(html,/Documento gerencial não fiscal/);
});

test('planilha preserva números, não fórmulas, e informa totais', () => {
  const report=buildCatalogExport([
    {name:'@produto',code:'+123',unit:'UN',stock_milli:2000,sale_price_cents:150,cost_price_cents:80}
  ],[]);
  const {rows,totals}=catalogSpreadsheetRows(report);
  assert.equal(rows[0].quantity,2);
  assert.equal(rows[0].salePrice,1.5);
  assert.equal(rows[0].saleStockValue,3);
  assert.equal(rows[0].name,"'@produto");
  assert.equal(rows[0].code,"'+123");
  assert.equal(totals.saleStockValue,3);
});
