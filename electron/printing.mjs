import { money } from '../shared/domain.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export function renderPrintDocument({kind,sale,product}){
  if(kind==='receipt'){
    if(!sale||!Array.isArray(sale.items))throw new Error('Venda ausente para impressão.');
    const rows=sale.items.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc((x.quantity_milli/1000).toLocaleString('pt-BR',{maximumFractionDigits:3}))+' '+esc(x.unit)+'</td><td>'+esc(money(x.line_total_cents))+'</td></tr>').join('');
    const payments=(sale.payments||[]).map(x=>'<p>'+esc(x.method)+' — '+esc(money(x.amount_cents))+'</p>').join('');
    return page('<h2>PDV Better</h2><p class="center">COMPROVANTE NÃO FISCAL</p><p>Venda: '+esc(sale.id)+'</p><table><thead><tr><th>Produto</th><th>Qtd.</th><th>Total</th></tr></thead><tbody>'+rows+'</tbody></table><h3>Total: '+esc(money(sale.total_cents))+'</h3><p>Troco: '+esc(money(sale.change_cents))+'</p>'+payments+'<p class="center">Não substitui documento fiscal.</p>',80);
  }
  if(kind==='label'){
    if(!product)throw new Error('Produto ausente para etiqueta.');
    return page('<div class="label"><strong>'+esc(product.name)+'</strong><p>'+esc(product.code||'Sem código')+'</p><h2>'+esc(money(product.sale_price_cents))+'</h2></div>',60);
  }
  throw new Error('Tipo de impressão não autorizado.');
}
function page(html,width){
  return '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><style>@page{size:'+width+'mm auto;margin:3mm}body{font:12px Arial,sans-serif;color:#111;width:'+(width-8)+'mm;margin:0}h2,.center{text-align:center}table{border-collapse:collapse;width:100%}th,td{font-size:10px;text-align:left;padding:4px 2px;border-bottom:1px dashed #777}td:last-child{text-align:right}.label{text-align:center;padding:7px}.label strong{font-size:13px}</style></head><body>'+html+'</body></html>';
}
