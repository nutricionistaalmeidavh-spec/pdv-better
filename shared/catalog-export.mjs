// Catálogo gerencial offline: fonte única de dados para CSV, XLSX e PDF.
// Trabalha com consulta resumida sem fotos e sem aplicar limite de paginação da interface.
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const quantity=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3});
const dateTime=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'});
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const safeText=value=>{
  const text=String(value??'');
  return /^\s*[=+\-@]/.test(text)?"'"+text:text;
};
const csvCell=value=>'"'+String(value??'').replaceAll('"','""')+'"';
const cents=value=>{
  const n=Number(value??0);
  if(!Number.isSafeInteger(n))throw new Error('Valor monetário inválido na exportação de produtos.');
  return n;
};
const stock=value=>{
  const n=Number(value??0);
  if(!Number.isSafeInteger(n))throw new Error('Estoque inválido na exportação de produtos.');
  return n;
};
function stockValue(price,quantityMilli){
  const result=Math.round(price*quantityMilli/1000);
  if(!Number.isSafeInteger(result))throw new Error('Total de estoque fora do limite seguro.');
  return result;
}
const formatPrice=value=>money.format(value/100);
const formatQuantity=(value,unit)=>unit==='UN'?quantity.format(value/1000):
  new Intl.NumberFormat('pt-BR',{minimumFractionDigits:3,maximumFractionDigits:3}).format(value/1000);
export const catalogExportColumns=Object.freeze([
  {key:'name',label:'Produto'},
  {key:'code',label:'Código / SKU'},
  {key:'category',label:'Categoria'},
  {key:'unit',label:'Unidade'},
  {key:'quantity',label:'Estoque'},
  {key:'salePrice',label:'Preço de venda'},
  {key:'costPrice',label:'Preço de custo'},
  {key:'saleStockValue',label:'Valor de venda em estoque'},
  {key:'costStockValue',label:'Valor de custo em estoque'}
]);

export function buildCatalogExport(products,categories=[],store={},issuedAt=new Date()){
  if(!Array.isArray(products)||!Array.isArray(categories))throw new Error('Catálogo inválido para exportação.');
  const names=new Map(categories.map(category=>[category.id,String(category.name??'')]));
  const rows=products.map(product=>{
    const salePriceCents=cents(product.sale_price_cents);
    const costPriceCents=cents(product.cost_price_cents);
    const quantityMilli=stock(product.stock_milli);
    const unit=product.unit==='KG'?'KG':'UN';
    return {
      name:String(product.name??''),code:String(product.code??''),
      category:names.get(product.category_id)||'Sem categoria',unit,quantityMilli,
      salePriceCents,costPriceCents,
      saleStockCents:stockValue(salePriceCents,quantityMilli),
      costStockCents:stockValue(costPriceCents,quantityMilli)
    };
  });
  const totals=rows.reduce((total,row)=>{
    total.saleStockCents+=row.saleStockCents;
    total.costStockCents+=row.costStockCents;
    if(!Number.isSafeInteger(total.saleStockCents)||!Number.isSafeInteger(total.costStockCents))
      throw new Error('Total do catálogo fora do limite seguro.');
    return total;
  },{saleStockCents:0,costStockCents:0});
  const date=issuedAt instanceof Date?issuedAt:new Date(issuedAt);
  if(!Number.isFinite(date.getTime()))throw new Error('Data de emissão inválida.');
  return {rows,totals,count:rows.length,storeName:String(store?.name||'PDV Plus'),
    issuedAt:dateTime.format(date)};
}

export function catalogSpreadsheetRows(report){
  const rows=report.rows.map(row=>({
    name:safeText(row.name),code:safeText(row.code),category:safeText(row.category),
    unit:row.unit,quantity:row.quantityMilli/1000,
    salePrice:row.salePriceCents/100,costPrice:row.costPriceCents/100,
    saleStockValue:row.saleStockCents/100,costStockValue:row.costStockCents/100
  }));
  return {columns:catalogExportColumns,rows,totals:{
    saleStockValue:report.totals.saleStockCents/100,
    costStockValue:report.totals.costStockCents/100
  }};
}

export function catalogCsv(report){
  const header=catalogExportColumns.map(col=>csvCell(col.label)).join(';');
  const lines=report.rows.map(row=>[
    safeText(row.name),safeText(row.code),safeText(row.category),row.unit,
    formatQuantity(row.quantityMilli,row.unit),formatPrice(row.salePriceCents),
    formatPrice(row.costPriceCents),formatPrice(row.saleStockCents),
    formatPrice(row.costStockCents)
  ].map(csvCell).join(';'));
  const total=['TOTAL ('+report.count+' produtos)','','','','','','',
    formatPrice(report.totals.saleStockCents),formatPrice(report.totals.costStockCents)]
    .map(csvCell).join(';');
  return '\ufeff'+[header,...lines,total,''].join('\r\n');
}

export function catalogHtml(report){
  const th=catalogExportColumns.map(col=>'<th>'+escapeHtml(col.label)+'</th>').join('');
  const tr=report.rows.map(row=>'<tr>'+[
    row.name,row.code,row.category,row.unit,formatQuantity(row.quantityMilli,row.unit),
    formatPrice(row.salePriceCents),formatPrice(row.costPriceCents),
    formatPrice(row.saleStockCents),formatPrice(row.costStockCents)
  ].map((v,i)=>'<td'+(i>=4?' class="number"':'')+'>'+escapeHtml(v)+'</td>').join('')+'</tr>').join('');
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'+
    '<title>PDV Plus - Catálogo de produtos</title><style>'+
    '@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font:10px Arial,sans-serif;color:#17263b}'+
    'h1{font-size:20px;margin:0 0 7px}p{margin:4px 0 12px}'+
    '.summary{display:flex;justify-content:space-between;gap:20px;padding:10px 0;border-top:2px solid #243e63}'+
    'table{border-collapse:collapse;width:100%;font-size:9px;table-layout:fixed}'+
    'th,td{border:1px solid #cbd5e1;padding:5px 4px;overflow-wrap:anywhere;vertical-align:top}'+
    'thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}'+
    'th{background:#e9eff6;text-align:left}th:nth-child(1){width:18%}th:nth-child(3){width:13%}'+
    '.number{text-align:right;white-space:nowrap}tfoot td{font-weight:bold;background:#e9eff6}'+
    'footer{font-size:9px;padding-top:10px;color:#526176}</style></head><body>'+
    '<h1>PDV Plus — Catálogo de produtos</h1>'+
    '<p><strong>'+escapeHtml(report.storeName)+'</strong> · Emitido em '+escapeHtml(report.issuedAt)+
    ' · '+report.count+' produtos ativos</p>'+
    '<div class="summary"><span>Valor de venda do estoque: <strong>'+escapeHtml(formatPrice(report.totals.saleStockCents))+'</strong></span>'+
    '<span>Valor de custo do estoque: <strong>'+escapeHtml(formatPrice(report.totals.costStockCents))+'</strong></span></div>'+
    '<table><thead><tr>'+th+'</tr></thead><tbody>'+tr+'</tbody><tfoot><tr>'+
    '<td colspan="7">TOTAL — '+report.count+' produtos</td><td class="number">'+
    escapeHtml(formatPrice(report.totals.saleStockCents))+'</td><td class="number">'+
    escapeHtml(formatPrice(report.totals.costStockCents))+'</td></tr></tfoot></table>'+
    '<footer>Documento gerencial não fiscal. Valores calculados a partir do estoque e dos preços cadastrados na data de emissão.</footer>'+
    '</body></html>';
}
