// O mesmo rateio é usado na baixa financeira e no relatório por item.
// Restos de divisão são resolvidos por maior fração e ordem estável.
export function allocateDiscounts(lines,totalDiscount){
 if(!Array.isArray(lines)||!lines.length||lines.some(x=>!Number.isSafeInteger(x)||x<0))
  throw new Error('Linhas de venda inválidas.');
 const total=lines.reduce((a,b)=>a+b,0);
 if(!Number.isSafeInteger(total)||!Number.isSafeInteger(totalDiscount)||totalDiscount<0||totalDiscount>total||total===0)
  throw new Error('Desconto não conciliável.');
 const parts=lines.map(x=>Number(BigInt(x)*BigInt(totalDiscount)/BigInt(total)));
 let left=totalDiscount-parts.reduce((a,b)=>a+b,0);
 const order=lines.map((gross,i)=>({i,rest:BigInt(gross)*BigInt(totalDiscount)%BigInt(total)}))
  .sort((a,b)=>a.rest===b.rest?a.i-b.i:(a.rest>b.rest?-1:1));
 for(const x of order){if(!left)break;if(parts[x.i]<lines[x.i]){parts[x.i]++;left--;}}
 if(left)throw new Error('Falha de conciliação do desconto.');
 return parts;
}
