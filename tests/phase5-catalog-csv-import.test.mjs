import test from 'node:test';
import assert from 'node:assert/strict';
import {createNexusParityFixture} from './fixtures/nexus-parity.mjs';
test('IMPORT-01: CSV ponto-e-virgula importa SKUs com marca, produtor e variantes e estoque auditado',()=>{
 const f=createNexusParityFixture();
 try{
  const csv='nome;codigo;unidade;preco;estoque;marca;produtor;grupo_variacao;variacao\n'+
   '"Suco de laranja; 1L";SKU-IMPORT-A;UN;8,90;5;Marca QA;Fazenda 1;SUCO;1 L\n'+
   'Suco laranja 2L;SKU-IMPORT-B;UN;15,80;3;Marca QA;Fazenda 1;SUCO;2 L\n';
  const preview=f.store.previewCatalogCsv({csv});
  assert.equal(preview.count,2);
  assert.equal(f.store.list('products').length,2);
  const imported=f.store.importCatalogCsv({csv});
  assert.equal(imported.imported,2);
  const a=f.store.list('products').find(x=>x.code==='SKU-IMPORT-A');
  const b=f.store.list('products').find(x=>x.code==='SKU-IMPORT-B');
  assert.equal(a.name,'Suco de laranja; 1L');
  assert.equal(a.sale_price_cents,890);
  assert.equal(a.stock_milli,5000);
  assert.equal(a.brand,'Marca QA');
  assert.equal(b.variant_group,'SUCO');
  assert.equal(b.variant_label,'2 L');
  assert.equal(f.store.listStockMovements(a.id).reduce((n,m)=>n+m.delta_milli,0),5000);
 }finally{f.cleanup();}
});
test('IMPORT-02: duplicidade interna ou com banco provoca rollback sem efeito parcial',()=>{
 const f=createNexusParityFixture();
 try{
  const csv='nome;codigo;unidade;preco;estoque\nProduto bom;SKU-BOM;UN;2,00;10\nDuplicado;QA-PARITY-001;UN;5,00;2\n';
  assert.throws(()=>f.store.importCatalogCsv({csv}),/duplicad|cadastrad|código/i);
  assert.equal(f.store.list('products').length,2);
  assert.equal(f.store.list('products').some(x=>x.code==='SKU-BOM'),false);
  assert.throws(()=>f.store.previewCatalogCsv({csv:'nome;codigo;unidade;preco;estoque\nA;X;UN;1,00;1\nB;X;UN;2,00;2\n'}),/duplicad/i);
 }finally{f.cleanup();}
});
test('IMPORT-03: CSV inválido, quantidade negativa, código vazio e planilha excessiva são recusados',()=>{
 const f=createNexusParityFixture();
 try{
  const valid='nome;codigo;unidade;preco;estoque\n';
  for(const csv of [
   valid+'A;;UN;1,00;1\n',valid+'A;Q;UN;1,00;-3\n',
   valid+'A;Q;T;1,00;1\n',valid+'A;Q;UN;NaN;1\n',
   valid+'"Nao fecha;Q;UN;2,00;1\n'
  ])assert.throws(()=>f.store.previewCatalogCsv({csv}),/código|unidade|preço|formato|inválid|negativ|CSV|cotação|valor|estoque|quantidade|casas/i);
  assert.equal(f.store.list('products').length,2);
 }finally{f.cleanup();}
});
