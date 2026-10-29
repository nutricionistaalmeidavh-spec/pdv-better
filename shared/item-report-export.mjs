// Exportação offline com a mesma lista de linhas para CSV, XLSX e PDF.
const columns=[
 ['created_at','Data'],['sale_id','Venda'],['product_name','Produto'],
 ['brand','Marca'],['producer','Produtor'],['variant_group','Grupo de variantes'],['variant_label','Variante'],
 ['code','SKU'],['quantity_milli','Quantidade (milésimos)'],
 ['gross_cents','Bruto (centavos)'],['discount_cents','Desconto (centavos)'],
 ['net_cents','Líquido (centavos)'],['payment_method','Pagamento'],['status','Situação'],['is_training','Treinamento (1/0)'],
 ['operator_id','Operador'],['terminal_id','Terminal']
];
function rows(report){
  if(!report||!Array.isArray(report.rows)||report.rows.length>100000)throw new Error('Relatório de itens inválido ou excessivo.');
  return report.rows.map(row=>Object.fromEntries(columns.map(([key])=>[key,row[key]??''])));
}
function safeText(v){
  const value=String(v??'');
  // Excel e LibreOffice podem interpretar strings iniciadas por operadores como fórmulas.
  return /^[\s]*[=+\-@]/.test(value)?'\''+value:value;
}
function csvCell(v){
  const value=typeof v==='number'?String(v):safeText(v);
  return '"'+value.replaceAll('"','""')+'"';
}
const htmlEscape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function itemReportSheetRows(report){
  return {columns:columns.map(([key,label])=>({key,label})),
    rows:rows(report).map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,typeof v==='number'?v:safeText(v)])))};
}
export function itemReportCsv(report){
  const {columns,rows:items}=itemReportSheetRows(report);
  return '\ufeff'+columns.map(c=>csvCell(c.label)).join(';')+'\n'+
    items.map(r=>columns.map(c=>csvCell(r[c.key])).join(';')).join('\n')+'\n';
}
export function itemReportHtml(report){
  const {columns,rows:items}=itemReportSheetRows(report);
  const header=columns.map(c=>'<th>'+htmlEscape(c.label)+'</th>').join('');
  const body=items.map(row=>'<tr>'+columns.map(c=>'<td>'+htmlEscape(row[c.key])+'</td>').join('')+'</tr>').join('');
  const total=Number(report?.summary?.net_total_cents??0);
  if(!Number.isSafeInteger(total))throw new Error('Total do relatório inválido.');
  return '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><style>'+
    'body{font-family:Arial,sans-serif;color:#232733;padding:14px}h1{font-size:21px}'+
    'table{border-collapse:collapse;width:100%;font-size:9px}th,td{padding:5px;border:1px solid #bbb;text-align:left;overflow-wrap:anywhere}'+
    'thead{display:table-header-group}tr{page-break-inside:avoid}footer{margin-top:16px}'+
    '</style></head><body><h1>Relatório detalhado por item — PDV Plus</h1>'+
    '<p>Registros: '+items.length+' · Total líquido (centavos): '+total+'</p>'+
    '<table><thead><tr>'+header+'</tr></thead><tbody>'+body+'</tbody></table>'+
    '<footer>Documento gerencial não fiscal. Valores de pagamento externo confirmados manualmente.</footer></body></html>';
}
