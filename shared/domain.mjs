import { assertEntity } from './contract.mjs';
export function parseFixed(value, places, label) {
  const scale = 10 ** places;
  if (typeof value === 'number' && Number.isInteger(value)) {
    if (value < 0 || !Number.isSafeInteger(value)) throw new Error(label + ': valor inválido.');
    return value;
  }
  const normalized = String(value ?? '').trim().replace(',', '.');
  const pattern = new RegExp('^(0|[1-9][0-9]*)(\\.[0-9]{1,' + places + '})?$');
  if (!pattern.test(normalized)) throw new Error(label + ': use até ' + places + ' casas decimais.');
  const [whole, fraction = ''] = normalized.split('.');
  const amount = Number(whole) * scale + Number(fraction.padEnd(places, '0'));
  if (!Number.isSafeInteger(amount)) throw new Error(label + ': valor muito grande.');
  return amount;
}
export function normalizeRecord(kind, input) {
  const schema = assertEntity(kind);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Cadastro inválido.');
  const record = {};
  for (const field of schema.fields) {
    let value = input[field.key];
    if (value === undefined || value === null || value === '') value = field.default ?? '';
    if (field.type === 'money') value = parseFixed(value, 2, field.label);
    else if (field.type === 'quantity') value = parseFixed(value, 3, field.label);
    else {
      value = String(value).trim();
      if (value.length > 200) throw new Error(field.label + ': limite de 200 caracteres.');
      if (field.type === 'select' && !field.values.includes(value)) throw new Error(field.label + ': opção inválida.');
      if (field.type === 'reference' && value && !/^[0-9a-f-]{36}$/i.test(value)) throw new Error(field.label + ': referência inválida.');
      if (field.key === 'code') value = value.toUpperCase();
    }
    if (field.required && value === '') throw new Error(field.label + ' é obrigatório.');
    record[field.key] = value || (field.type === 'reference' ? null : value);
  }
  return record;
}
export function lineTotalCents(priceCents, quantityMilli) {
  if (!Number.isSafeInteger(priceCents) || priceCents < 0) throw new Error('Preço inválido.');
  if (!Number.isSafeInteger(quantityMilli) || quantityMilli <= 0) throw new Error('Quantidade inválida.');
  const total = Math.round(priceCents * quantityMilli / 1000);
  if (!Number.isSafeInteger(total)) throw new Error('Total excede o limite.');
  return total;
}
export function addToCart(cart, product, quantityMilli = 1000) {
  if (!product || product.active === 0) throw new Error('Produto indisponível.');
  if (product.unit === 'UN' && quantityMilli % 1000 !== 0) throw new Error('Unidades exigem quantidade inteira.');
  lineTotalCents(product.sale_price_cents, quantityMilli);
  const current = cart.find(item => item.id === product.id);
  if (current) {
    const next = current.quantityMilli + quantityMilli;
    if (!Number.isSafeInteger(next)) throw new Error('Quantidade excede o limite.');
    return cart.map(item => item.id === product.id ? { ...item, quantityMilli: next } : item);
  }
  return [...cart, {
    id: product.id, name: product.name, code: product.code || '',
    unit: product.unit, priceCents: product.sale_price_cents, quantityMilli
  }];
}
export function cartTotalCents(cart) {
  return cart.reduce((sum, item) => sum + lineTotalCents(item.priceCents, item.quantityMilli), 0);
}
export function money(cents) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
