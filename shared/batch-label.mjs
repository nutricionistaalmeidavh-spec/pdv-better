// Texto legível por leitores USB/HID configurados para enviar Enter após a leitura.
// Code 128 transporta exatamente estes caracteres. Etiquetas desconhecidas falham fechado.
const PREFIX='PDVLOT1|';
const MAX=180;
function nonempty(value,label){
  const s=String(value??'').trim();
  if(!s||s.length>64||/[\r\n|]/.test(s))throw new Error(label+' inválido para etiqueta.');
  return s;
}
export function createBatchLabel(sku,lot){
  const code=PREFIX+encodeURIComponent(nonempty(sku,'Código do produto'))+'|'+encodeURIComponent(nonempty(lot,'Código do lote'));
  if(code.length>MAX)throw new Error('Etiqueta excede tamanho permitido.');
  return code;
}
export function parseBatchLabel(raw){
  const value=String(raw??'').trim();
  if(!value.startsWith('PDVLOT1'))return null; // produtos comuns continuam no fluxo anterior
  if(value.length>MAX||!value.startsWith(PREFIX))throw new Error('Etiqueta de lote inválida.');
  const parts=value.slice(PREFIX.length).split('|');
  if(parts.length!==2)throw new Error('Etiqueta de lote inválida.');
  try{
    const sku=nonempty(decodeURIComponent(parts[0]),'Código do produto');
    const lot=nonempty(decodeURIComponent(parts[1]),'Código do lote');
    if(createBatchLabel(sku,lot)!==value)throw new Error('Etiqueta de lote inválida.');
    return {sku:sku.toUpperCase(),lot};
  }catch{throw new Error('Etiqueta de lote inválida.');}
}
export function resolveBatchScan(raw,products,batches,today){
  const parsed=parseBatchLabel(raw);
  if(!parsed)return null;
  const product=products.find(p=>String(p.code||'').toUpperCase()===parsed.sku&&p.active!==0);
  if(!product)throw new Error('Produto da etiqueta não encontrado ou desativado.');
  const batch=batches.find(b=>b.product_id===product.id&&b.code===parsed.lot);
  if(!batch)throw new Error('Lote da etiqueta não encontrado para o produto.');
  const date=today||(()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');})();
  if(batch.expires_on<date)throw new Error('Lote vencido: venda bloqueada.');
  if(batch.remaining_milli<=0)throw new Error('Lote sem saldo para venda.');
  return {product,batch};
}

export function buildLabeledSaleItems(cart,batchIds={}){
 if(!Array.isArray(cart))throw new Error('Carrinho inválido.');
 return cart.map(x=>({
   id:x.id,quantityMilli:x.quantityMilli,batchId:Object.prototype.hasOwnProperty.call(batchIds,x.id)?(batchIds[x.id]||null):(x.batchId||null)
 }));
}
