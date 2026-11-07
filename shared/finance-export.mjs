// Exportação offline com neutralização de fórmulas CSV.
const safeCell=value=>{
 const s=String(value??'');
 const guarded=/^[\s]*[=+\-@]/.test(s)||s.includes('\t')?"'"+s:s;
 return /[;"\r\n]/.test(guarded)?'"'+guarded.replace(/"/g,'""')+'"':guarded;
};
const brMoney=cents=>(Number(cents)/100).toFixed(2).replace('.',',');
export function financeCsv({rows=[]}={}){
 const head=['Data','Descrição','Categoria','Tipo','Meio','Valor (R$)'];
 const lines=rows.map(r=>[
  r.date||'',r.description||'',r.category||'',r.kind||'',r.method||'',brMoney(r.amount_cents)
 ]);
 return '\uFEFF'+[head,...lines].map(row=>row.map(safeCell).join(';')).join('\r\n')+'\r\n';
}
