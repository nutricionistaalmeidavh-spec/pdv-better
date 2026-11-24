import { assertEntity } from './contract.mjs';
export function parseFixed(value, places, label) {
  const scale = 10 ** places;
  if (typeof value === 'number' && Number.isInteger(value)) {
    if (value < 0 || !Number.isSafeInteger(value)) throw new Error(label + ': valor inválido.');
    return value;
  }
  let text=String(value??'').trim();
  if(/^\d{1,3}(?:\.\d{3})+,\d+$/.test(text))text=text.replaceAll('.','');
  const normalized=text.replace(',','.');
  const pattern = new RegExp('^(0|[1-9][0-9]*)(\\.[0-9]{1,' + places + '})?$');
  if (!pattern.test(normalized)) throw new Error(label + ': use até ' + places + ' casas decimais.');
  const [whole, fraction = ''] = normalized.split('.');
  const exact=BigInt(whole)*BigInt(scale)+BigInt(fraction.padEnd(places,'0')||'0');
  const amount=Number(exact);
  if (exact>BigInt(Number.MAX_SAFE_INTEGER)||!Number.isSafeInteger(amount)) throw new Error(label + ': valor muito grande.');
  return amount;
}
export function normalizeRecord(kind, input) {
  const schema = assertEntity(kind);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Cadastro inválido.');
  const record = {};
  for (const field of schema.fields) {
    let value = input[field.key];
    if (value === undefined || value === null || value === '') value = field.default ?? '';
    if (field.type === 'image') {
      if (value !== '' && (
        typeof value !== 'string' || value.length > 88000 ||
        !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
      )) throw new Error('Imagem do produto inválida. Use JPG, PNG ou WebP pelo cadastro (máximo 64 KB compactados).');
      if (value) {
        const bytes=Buffer.from(value.slice('data:image/jpeg;base64,'.length),'base64');
        if(bytes.length>64000||bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)
          throw new Error('Imagem do produto inválida: JPEG compactado obrigatório.');
      }
    }
    else if (field.type === 'money') value = parseFixed(value, 2, field.label);
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
// Arredondamento para o inteiro mais próximo, empate em direção a +infinito (regra anterior).
export function roundRatio(numerator,denominator) {
  const n=BigInt(numerator),d=BigInt(denominator);
  if(d<=0n)throw new Error('Divisor inválido.');
  const floor=n>=0n?n/d:-((-n+d-1n)/d);
  const remainder=n-floor*d;
  const exact=floor+(remainder*2n>=d?1n:0n);
  if(exact>BigInt(Number.MAX_SAFE_INTEGER)||exact<BigInt(Number.MIN_SAFE_INTEGER))throw new Error('Resultado excede limite seguro.');
  return Number(exact);
}
export function checkedSum(values){
  let total=0n;
  for(const value of values){if(!Number.isSafeInteger(value))throw new Error('Valor inteiro inválido.');total+=BigInt(value);}
  if(total>BigInt(Number.MAX_SAFE_INTEGER)||total<BigInt(Number.MIN_SAFE_INTEGER))throw new Error('Soma excede limite seguro.');
  return Number(total);
}
export function lineTotalCents(priceCents, quantityMilli) {
  if (!Number.isSafeInteger(priceCents) || priceCents < 0) throw new Error('Preço inválido.');
  if (!Number.isSafeInteger(quantityMilli) || quantityMilli <= 0) throw new Error('Quantidade inválida.');
  const total = roundRatio(BigInt(priceCents)*BigInt(quantityMilli),1000n);
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
  return checkedSum(cart.map(item=>lineTotalCents(item.priceCents,item.quantityMilli)));
}
export function money(cents) {
  if(!Number.isSafeInteger(cents))throw new Error('Valor monetário inválido.');
  const n=BigInt(cents),absolute=n<0n?-n:n;
  const integer=Number(absolute/100n),fraction=String(absolute%100n).padStart(2,'0');
  const signed=n<0n?-integer:integer;
  return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).formatToParts(signed).map(p=>p.type==='fraction'?fraction:p.value).join('');
}
