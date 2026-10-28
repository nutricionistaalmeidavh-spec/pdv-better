import { randomUUID } from 'node:crypto';
import { cartTotalCents, lineTotalCents } from './domain.mjs';
export const PAYMENT_METHODS = Object.freeze(['cash','credit_manual','debit_manual']);
export function normalizeSale(input) {
 if (!input || !Array.isArray(input.items) || !input.items.length) throw new Error('Venda sem itens.');
 if (!PAYMENT_METHODS.includes(input.method)) throw new Error('Forma de pagamento indisponível.');
 const id = String(input.id || '');
 if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Identificador da venda inválido.');
 const items = input.items.map(item => {
  const productId = String(item.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(productId)) throw new Error('Produto inválido.');
  const quantityMilli = item.quantityMilli;
  if (!Number.isSafeInteger(quantityMilli) || quantityMilli <= 0) throw new Error('Quantidade inválida.');
  return {productId,quantityMilli};
 });
 if (new Set(items.map(x=>x.productId)).size !== items.length) throw new Error('Produto repetido na venda.');
 const tenderedCents = input.tenderedCents;
 if (!Number.isSafeInteger(tenderedCents) || tenderedCents < 0) throw new Error('Valor recebido inválido.');
 return {id,items,method:input.method,tenderedCents};
}
export function calculatePayment(cart,method,tenderedCents) {
 const totalCents = cartTotalCents(cart);
 if (!PAYMENT_METHODS.includes(method)) throw new Error('Pagamento indisponível.');
 if (!Number.isSafeInteger(tenderedCents) || tenderedCents < totalCents) throw new Error('Valor recebido insuficiente.');
 if (method !== 'cash' && tenderedCents !== totalCents) throw new Error('Pagamento manual exige valor exato.');
 return {totalCents,changeCents:tenderedCents-totalCents};
}
