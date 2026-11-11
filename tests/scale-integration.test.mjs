import test from 'node:test';
import assert from 'node:assert/strict';
import { createScaleBarcode, decodeScaleBarcode, resolveScaleScan, normalizeScaleConfig, parseSerialScaleFrame, buildScaleExport } from '../shared/scale-integration.mjs';

const products = [
  {id:'beef',code:'12345',name:'Carne',unit:'KG',sale_price_cents:3990,active:1},
  {id:'rice',code:'56789',name:'Arroz',unit:'UN',sale_price_cents:890,active:1},
  {id:'disabled',code:'11111',name:'Inativo',unit:'KG',sale_price_cents:5000,active:0}
];

test('etiqueta EAN-13 com preço embutido localiza SKU e mantém o preço em centavos',()=>{
  const barcode=createScaleBarcode('12345',1995,'DEFAULT_PRICE');
  assert.equal(barcode.length,13);
  const result=resolveScaleScan(barcode,products,'DEFAULT_PRICE');
  assert.equal(result.product.id,'beef');
  assert.equal(result.labelTotalCents,1995);
  assert.equal(result.quantityMilli,500);
  assert.equal(result.totalCents,1995);
});

test('etiqueta com peso embutido calcula subtotal e mantém três casas em KG',()=>{
  const barcode=createScaleBarcode('12345',350,'DEFAULT_WEIGHT');
  const result=resolveScaleScan(barcode,products,'DEFAULT_WEIGHT');
  assert.equal(result.quantityMilli,350);
  assert.equal(result.totalCents,1397);
});

test('etiqueta de produto estendido suporta prefixo 20 e quatro dígitos de SKU',()=>{
  const item={id:'a',code:'1234',name:'A granel',unit:'KG',sale_price_cents:2000,active:1};
  const result=resolveScaleScan(createScaleBarcode('1234',1000,'EXTENDED_PRODUCT'),[item],'EXTENDED_PRODUCT');
  assert.equal(result.product.id,'a');
  assert.equal(result.quantityMilli,500);
});

test('mantém códigos comuns fora do prefixo de balança',()=>{
  assert.equal(resolveScaleScan('7891234567895',products,'DEFAULT_PRICE'),null);
  assert.equal(decodeScaleBarcode('7891234567895','DEFAULT_PRICE'),null);
});

test('rejeita checksum, preço inválido, SKU não encontrado e produtos por unidade',()=>{
  const valid=createScaleBarcode('12345',1995,'DEFAULT_PRICE');
  const altered=valid.slice(0,-1)+(valid.at(-1)==='9'?'0':'9');
  assert.throws(()=>resolveScaleScan(altered,products,'DEFAULT_PRICE'),/verificador|checksum/i);
  assert.throws(()=>resolveScaleScan(createScaleBarcode('00000',1995,'DEFAULT_PRICE'),products,'DEFAULT_PRICE'),/não encontrado/i);
  assert.throws(()=>resolveScaleScan(createScaleBarcode('56789',1000,'DEFAULT_PRICE'),products,'DEFAULT_PRICE'),/peso|KG/i);
  assert.throws(()=>resolveScaleScan(createScaleBarcode('11111',1000,'DEFAULT_PRICE'),products,'DEFAULT_PRICE'),/inativo|indisponível/i);
  assert.throws(()=>resolveScaleScan(createScaleBarcode('12345',0,'DEFAULT_WEIGHT'),products,'DEFAULT_WEIGHT'),/peso|quantidade/i);
});

test('não altera silenciosamente subtotal impresso quando a divisão do preço por kg é inexata',()=>{
  const item={id:'p',code:'12345',name:'Produto',unit:'KG',sale_price_cents:10000,active:1};
  assert.throws(()=>resolveScaleScan(createScaleBarcode('12345',1,'DEFAULT_PRICE'),[item],'DEFAULT_PRICE'),/compatível|centavos|divergente/i);
});

test('configuração serial aceita porta COM e preserva impressora e TCP anteriores',()=>{
  const previous={printerHost:'192.168.1.5',printerPort:9100,scaleHost:'192.168.1.7',scalePort:4001};
  const config=normalizeScaleConfig({...previous,scaleTransport:'serial',scaleSerialPort:'COM12',scaleBaudRate:9600,scaleBrand:'filizola',scaleLabelMode:'DEFAULT_WEIGHT',scaleRequestCommand:'ENQ'});
  assert.equal(config.scaleSerialPort,'COM12');
  assert.equal(config.printerHost,previous.printerHost);
  assert.equal(config.scaleLabelMode,'DEFAULT_WEIGHT');
  assert.throws(()=>normalizeScaleConfig({...config,scaleSerialPort:'../../etc/passwd'}),/COM/i);
  assert.throws(()=>normalizeScaleConfig({...config,scaleBaudRate:12345}),/velocidade|baud/i);
});

test('decodifica tramas seriais de balança com estado estável e rejeita peso negativo',()=>{
  assert.equal(parseSerialScaleFrame('\x02000750\x03',{brand:'toledo'}),750);
  assert.equal(parseSerialScaleFrame('\x02000750\x03',{brand:'filizola'}),750);
  assert.equal(parseSerialScaleFrame('ST,GS, 0.750kg\r\n',{brand:'generic-streaming'}),750);
  assert.throws(()=>parseSerialScaleFrame('US,GS, 0.750kg',{brand:'generic-streaming'}),/instável/i);
  assert.throws(()=>parseSerialScaleFrame('\x02-000750\x03',{brand:'filizola'}),/negativo|peso/i);
});

test('exportações de carga Toledo e Urano usam produtos reais por KG e UN',()=>{
  const toledo=buildScaleExport(products,'toledo');
  const urano=buildScaleExport(products,'urano');
  assert.equal(toledo.fileName,'ITENSMGV.TXT');
  assert.equal(urano.fileName,'PRODUTOS.TXT');
  assert.match(toledo.content,/Carne/);
  assert.match(urano.content,/Arroz/);
  assert.doesNotMatch(toledo.content,/Inativo/);
  assert.equal(toledo.count,2);
});

test('trama Toledo longa inclui peso, status e campos monetários como no Nexus',()=>{
  const long='\x02'+'0'+'000750'+'0'+'001995'+'003990'+'\x03';
  assert.equal(parseSerialScaleFrame(long,{brand:'toledo'}),750);
});
test('protocolo serial identifica instabilidade, peso negativo e sobrecarga',()=>{
  assert.throws(()=>parseSerialScaleFrame('\x02I\x03',{brand:'generic-request-response'}),/instável/i);
  assert.throws(()=>parseSerialScaleFrame('\x02N\x03',{brand:'filizola'}),/negativo/i);
  assert.throws(()=>parseSerialScaleFrame('\x02S\x03',{brand:'toledo'}),/sobrecarga/i);
});
