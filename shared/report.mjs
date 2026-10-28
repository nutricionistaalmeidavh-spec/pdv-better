import { reportFields } from './contract.mjs';
export function reportRows(report){
  return reportFields.map(field=>{
    const raw=report?.[field.key]??0;
    if(!Number.isSafeInteger(raw))throw new Error('Métrica inválida: '+field.key);
    return {key:field.key,label:field.label,type:field.type,raw,
      value:field.type==='money'?(raw/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):String(raw)};
  });
}
export function reportCsv(report){
  const rows=reportRows(report);
  const escaped=value=>'"'+String(value).replaceAll('"','""')+'"';
  return '\ufeffIndicador;Valor\n'+rows.map(row=>escaped(row.label)+';'+escaped(row.value)).join('\n')+'\n';
}
export function reportHtml(report){
  const rows=reportRows(report);
  // Labels vêm de schema estático. Valores são inteiros convertidos pelo domínio.
  const tr=rows.map(row=>'<tr><th>'+row.label+'</th><td>'+row.value+'</td></tr>').join('');
  return '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><style>'+
   'body{font:14px Arial,sans-serif;color:#282b3e;padding:24px}h1{font-size:25px;margin:0 0 8px}'+
   'p{color:#6f7484;margin:0 0 26px}table{border-collapse:collapse;width:100%}td,th{padding:12px;border-bottom:1px solid #ddd;text-align:left}'+
   'th{font-weight:600}td{text-align:right}footer{margin-top:26px;font-size:11px;color:#666}'+
   '</style></head><body><h1>PDV Better — Relatório acumulado</h1><p>Dados locais. Pix/cartão confirmados manualmente.</p><table>'+
   tr+'</table><footer>Relatório gerencial não fiscal — ArtiSys</footer></body></html>';
}
