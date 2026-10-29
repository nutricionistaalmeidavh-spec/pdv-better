import {parseFixed,lineTotalCents} from './domain.mjs';
export function applyManualWeight(cart,productId,quantity){
 if(!Array.isArray(cart))throw new Error('Carrinho inválido.');
 const item=cart.find(x=>x.id===productId);
 if(!item)throw new Error('Produto não encontrado no carrinho.');
 if(item.unit!=='KG')throw new Error('Pesagem manual somente para produto KG.');
 const milli=parseFixed(quantity,3,'Peso');
 if(!Number.isSafeInteger(milli)||milli<=0)throw new Error('Peso deve ser positivo em milésimos.');
 lineTotalCents(item.priceCents,milli);
 return cart.map(x=>x.id===productId?{...x,quantityMilli:milli}:x);
}
