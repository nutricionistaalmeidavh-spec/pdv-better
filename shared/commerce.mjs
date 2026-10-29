import { paymentMethods, financeTypes, cashMovementKinds, inventoryKinds } from './contract.mjs';
import { parseFixed, lineTotalCents } from './domain.mjs';
export const methodIds = Object.freeze(paymentMethods.map(x => x.id));
export const assertCents = (value,label='Valor') => {
  const n = parseFixed(value, 2, label);
  if(!Number.isSafeInteger(n) || n < 0) throw new Error(label+': inválido.');
  return n;
};
export const assertMilli = (value,label='Quantidade') => {
  if(!Number.isSafeInteger(value) || value <= 0) throw new Error(label+': deve ser positiva em milésimos.');
  return value;
};
export function assertChoice(value, choices, label) {
  if(!choices.includes(value)) throw new Error(label+': opção inválida.');
  return value;
}
export function assertLabel(value,label,max=200) {
  const s=String(value??'').trim();
  if(!s || s.length>max) throw new Error(label+': informe de 1 a '+max+' caracteres.');
  return s;
}
export function assertDate(value) {
  if(value===null || value===undefined || value==='') return null;
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value+'T00:00:00Z')) || new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value) throw new Error('Data de vencimento inválida.');
  return value;
}
export function normalizePayments(input,totalCents) {
  if(!Array.isArray(input)||!input.length) throw new Error('Informe ao menos um pagamento.');
  if(!Number.isSafeInteger(totalCents) || totalCents<=0) throw new Error('Total da venda inválido.');
  const seen=new Set();let nonCash=0;let cash=null;
  const result=[];
  for(const row of input) {
    const method=assertChoice(row?.method,methodIds,'Pagamento');
    if(seen.has(method)) throw new Error('Forma de pagamento duplicada.');
    seen.add(method);
    const tendered=assertCents(row.amountCents,'Pagamento');
    if(tendered<=0) throw new Error('Pagamento deve ser positivo.');
    if(method==='cash') cash=tendered;
    else nonCash+=tendered;
    result.push({method,amount_cents:tendered,tendered_cents:tendered});
  }
  if(nonCash>totalCents) throw new Error('Soma dos pagamentos excede o total.');
  const balance=totalCents-nonCash;
  if(cash===null && balance!==0) throw new Error('Pagamentos não cobrem o total da venda.');
  if(cash!==null && (balance<=0 || cash<balance)) throw new Error('Dinheiro insuficiente ou forma de pagamento excede o total.');
  const change=cash===null?0:cash-balance;
  for(const row of result) if(row.method==='cash') row.amount_cents=balance;
  return {payments:result,change_cents:change};
}
export function validateSaleInput(input) {
  if(!input || typeof input!=='object') throw new Error('Venda inválida.');
  const key=assertLabel(input.key,'Identificador da operação',128);
  if(input.training!==undefined&&typeof input.training!=='boolean')throw new Error('Modo de treinamento inválido.');
  const training=input.training===true;
  if(!Array.isArray(input.items) || !input.items.length || input.items.length>200) throw new Error('Inclua de 1 a 200 produtos na venda.');
  const unique=new Set();
  const items=input.items.map(row=>{
    const id=assertLabel(row?.id,'Produto',64);
    if(unique.has(id)) throw new Error('Produto duplicado na venda.');
    unique.add(id);
    const batchId=row?.batchId===undefined||row.batchId===null||row.batchId===''?null:assertLabel(row.batchId,'Lote físico',64);
    return {id,quantityMilli:assertMilli(row?.quantityMilli),batchId};
  });
  const discountCents=assertCents(input.discountCents??0,'Desconto');
  const itemPayments=input.itemPayments===undefined?null:input.itemPayments;
  if(itemPayments!==null&&(!Array.isArray(itemPayments)||!itemPayments.length||itemPayments.length>500))throw new Error('Atribuição por produto inválida.');
  const normalizedItemPayments=itemPayments?.map(x=>({productId:assertLabel(x?.productId,'Produto',64),method:assertChoice(x?.method,methodIds,'Forma de pagamento'),amountCents:assertCents(x?.amountCents,'Pagamento por produto')}))||null;
  if(normalizedItemPayments?.some(x=>x.amountCents<=0))throw new Error('Pagamento por produto deve ser positivo.');
  const customerId=input.customerId || null;
  if(customerId!==null && (typeof customerId!=='string'||customerId.length>64)) throw new Error('Cliente inválido.');
  return {key,items,discountCents,customerId,payments:input.payments,itemPayments:normalizedItemPayments,training};
}
export function inventoryDelta(kind,quantityMilli) {
  assertChoice(kind,inventoryKinds,'Movimento de estoque');
  if(!Number.isSafeInteger(quantityMilli)||quantityMilli===0) throw new Error('Quantidade de estoque inválida.');
  if(kind==='receipt' && quantityMilli<0) throw new Error('Entrada de estoque deve ser positiva.');
  return quantityMilli;
}
export function cashDelta(kind,amountCents) {
  assertChoice(kind,cashMovementKinds,'Movimento de caixa');
  const value=assertCents(amountCents,'Valor do caixa');
  if(value<=0) throw new Error('Movimento precisa ser positivo.');
  return kind==='withdrawal'?-value:value;
}
export function financeInput(row){
  if(!row||typeof row!=='object') throw new Error('Lançamento inválido.');
  const type=assertChoice(row.type,financeTypes,'Tipo financeiro');
  const description=assertLabel(row.description,'Descrição');
  const amountCents=assertCents(row.amountCents,'Valor');
  if(amountCents<=0) throw new Error('O valor deve ser positivo.');
  return {type,description,amountCents,dueOn:assertDate(row.dueOn)};
}
export { lineTotalCents };
