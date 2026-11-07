// Núcleo puro da experiência de caixa; não escreve no banco nem confirma pagamentos.
export const CASHIER_MODES=Object.freeze(['compact','light','dark']);
export function normalizeCashierMode(value){
  return CASHIER_MODES.includes(value)?value:'dark';
}
export function formatCashierAmount(cents){
  if(!Number.isSafeInteger(cents)||cents<0)throw new Error('Valor inválido.');
  return (cents/100).toLocaleString('pt-BR',{useGrouping:false,minimumFractionDigits:2,maximumFractionDigits:2});
}
// A cotação pode chegar depois da digitação. Nunca substituir um valor informado.
export function suggestCashierPaymentAmount(current,totalCents){
  return current==='0,00'?formatCashierAmount(totalCents):current;
}
const shortcuts=Object.freeze({
  F2:'search',F3:'customer',F4:'discount',F5:'payment',
  F6:'pix',F7:'card',F8:'cash',F10:'payment'
});
export function resolveCashierShortcut(key,{checkout=false,session=false,hasCart=false,dialog=false}={}){
  if(dialog)return null;
  if(key==='F2')return 'search';
  if(!checkout||!session||!hasCart)return null;
  return shortcuts[key]||null;
}
