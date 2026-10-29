// Impressão nativa offline em Windows. bwip-js é MIT e gera Code128 real sem serviço externo.
const bwipjs=require('bwip-js');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderPhysicalBatchLabel({payload,product,batch}){
 if(typeof payload!=='string'||!payload.startsWith('PDVLOT1|')||payload.length>180)throw new Error('Código de lote inválido para impressão.');
 if(!product||!batch||product.id!==batch.product_id)throw new Error('Produto e lote inconsistentes.');
 const svg=bwipjs.toSVG({bcid:'code128',text:payload,scale:2,height:14,includetext:false});
 return '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><style>'+
  '@page{size:80mm 42mm;margin:2mm}body{margin:0;color:#101010;font-family:Arial,sans-serif;font-size:9px}'+
  'h1{font-size:11px;margin:2px 0}.barcode svg{width:100%;height:20mm;max-width:100%}'+
  'p{margin:1px 0;overflow-wrap:anywhere}'+
  '</style></head><body><h1>'+escape(product.name)+'</h1>'+
  '<p>SKU '+escape(product.code)+' · Lote '+escape(batch.code)+' · Validade '+escape(batch.expires_on)+'</p>'+
  '<div class="barcode">'+svg+'</div><p>'+escape(payload)+'</p>'+
  '<p>Etiqueta interna de estoque — não fiscal</p></body></html>';
}
module.exports={renderPhysicalBatchLabel};
