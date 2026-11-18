import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPrintDocument, labelPageOptions } from '../electron/printing.mjs';
import { normalizeLabelSettings } from '../shared/label-layout.mjs';

const product={name:'Café moído especial 500g',code:'7891234567890',sale_price_cents:2590};

test('bobina 58 mm: nome e valor permanecem numa única página física de 58x30 mm',()=>{
  const settings=normalizeLabelSettings({labelProfile:'58x30'});
  const html=renderPrintDocument({kind:'label',product,labelSettings:settings});
  assert.match(html,/@page\s*\{\s*size:\s*58mm 30mm;\s*margin:\s*0/);
  assert.match(html,/Café moído especial 500g/);
  assert.match(html,/R\$\s*25,90/);
  assert.match(html,/overflow:hidden/);
  assert.match(html,/break-inside:avoid/);
  assert.doesNotMatch(html,/60mm auto/);
  assert.deepEqual(labelPageOptions(settings),{
    usePrinterDefaultPageSize:false,
    pageSize:{width:58000,height:30000},
    margins:{marginType:'none'}
  });
});

test('etiqueta comprida não quebra página e escapa HTML do cadastro',()=>{
  const productLong={name:'Produto super longo '.repeat(20)+'<script>alert(1)</script>',code:'A&B<>',sale_price_cents:1350};
  const html=renderPrintDocument({kind:'label',product:productLong,labelSettings:{labelProfile:'40x30'}});
  assert.match(html,/@page\s*\{\s*size:\s*40mm 30mm;/);
  assert.match(html,/word-break:break-word/);
  assert.match(html,/-webkit-line-clamp:2/);
  assert.match(html,/&lt;script&gt;/);
  assert.doesNotMatch(html,/<script>/);
});

test('perfis e configuração manual usam somente medidas válidas',()=>{
  assert.deepEqual(normalizeLabelSettings({labelProfile:'50x30'}),{
    labelProfile:'50x30',widthMm:50,heightMm:30,marginMm:3
  });
  assert.deepEqual(normalizeLabelSettings({labelProfile:'custom',labelWidthMm:45,labelHeightMm:28,labelMarginMm:2}),{
    labelProfile:'custom',widthMm:45,heightMm:28,marginMm:2
  });
  assert.throws(()=>normalizeLabelSettings({labelProfile:'custom',labelWidthMm:500,labelHeightMm:20,labelMarginMm:2}),/Largura/);
  assert.throws(()=>normalizeLabelSettings({labelProfile:'custom',labelWidthMm:40,labelHeightMm:20,labelMarginMm:12}),/Margem/);
  assert.deepEqual(normalizeLabelSettings({labelProfile:'perfil-inexistente'}),normalizeLabelSettings({labelProfile:'50x30'}));
});

test('comprovante mantém layout antigo e não recebe tamanho de etiqueta',()=>{
  const html=renderPrintDocument({kind:'receipt',sale:{
    id:'v1',items:[],payments:[],total_cents:0,change_cents:0
  }});
  assert.match(html,/COMPROVANTE NÃO FISCAL/);
  assert.match(html,/80mm auto/);
  assert.doesNotMatch(html,/58mm 30mm/);
});
