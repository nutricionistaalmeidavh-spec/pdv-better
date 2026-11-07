// Fluxos de caixa locais e não fiscais. Persistência é feita no renderer,
// sempre por operador e terminal; nada neste módulo registra venda/estoque/caixa.
export const MAX_HELD_SALES=12;
export const MAX_FAVORITES=8;
const MAX_LINES=150;
const MAX_LABEL_LENGTH=60;

function safeLine(line){
  if(!line||typeof line!=='object')return null;
  const {id,name,code,unit,priceCents,quantityMilli,batchId,batchCode}=line;
  if(typeof id!=='string'||!id.trim()||id.length>128||typeof name!=='string'||!name.trim()||name.length>240)return null;
  if(unit!=='UN'&&unit!=='KG')return null;
  if(!Number.isSafeInteger(priceCents)||priceCents<0||priceCents>1_000_000_000)return null;
  if(!Number.isSafeInteger(quantityMilli)||quantityMilli<=0||quantityMilli>1_000_000_000)return null;
  if(unit==='UN'&&quantityMilli%1000!==0)return null;
  const clean={id,name,code:typeof code==='string'?code.slice(0,128):'',unit,priceCents,quantityMilli};
  if(typeof batchId==='string'&&batchId.length<=128&&batchId)clean.batchId=batchId;
  if(typeof batchCode==='string'&&batchCode.length<=128&&batchCode)clean.batchCode=batchCode;
  return clean;
}

function cleanItems(items){
  if(!Array.isArray(items)||items.length===0||items.length>MAX_LINES)return null;
  const ids=new Set();
  const clean=[];
  for(const line of items){
    const valid=safeLine(line);
    if(!valid||ids.has(valid.id))return null;
    ids.add(valid.id);
    clean.push(valid);
  }
  return clean;
}

export function normalizeHeldSales(data){
  if(!Array.isArray(data))return [];
  const seen=new Set(),result=[];
  for(const row of data){
    if(result.length===MAX_HELD_SALES)break;
    if(!row||typeof row!=='object'||typeof row.id!=='string'||!row.id.trim()||row.id.length>128||seen.has(row.id))continue;
    if(typeof row.createdAt!=='string'||!Number.isFinite(Date.parse(row.createdAt)))continue;
    const items=cleanItems(row.items);
    if(!items)continue;
    const label=typeof row.label==='string'&&row.label.trim()?row.label.trim().slice(0,MAX_LABEL_LENGTH):'Venda em espera';
    seen.add(row.id);
    result.push({id:row.id,label,createdAt:row.createdAt,items});
  }
  return result;
}

export function holdCashierSale(existing,cart,{id,label='',createdAt}){
  const items=cleanItems(cart);
  if(!items)throw new Error('Carrinho vazio ou inválido para colocar em espera.');
  if(typeof id!=='string'||!id.trim()||id.length>128)throw new Error('Identificador de espera inválido.');
  if(typeof createdAt!=='string'||!Number.isFinite(Date.parse(createdAt)))throw new Error('Data da espera inválida.');
  const held=normalizeHeldSales(existing);
  if(held.some(sale=>sale.id===id))throw new Error('Esta venda em espera já existe.');
  if(held.length>=MAX_HELD_SALES)throw new Error('Limite de vendas em espera atingido.');
  return [{
    id,label:typeof label==='string'&&label.trim()?label.trim().slice(0,MAX_LABEL_LENGTH):'Venda em espera',
    createdAt,items
  },...held];
}

export function resumeHeldSale(existing,id,products){
  const held=normalizeHeldSales(existing);
  const sale=held.find(row=>row.id===id);
  if(!sale)throw new Error('Venda em espera não encontrada.');
  if(!Array.isArray(products))throw new Error('Catálogo indisponível para conferência.');
  const catalog=new Map(products.filter(p=>p&&typeof p.id==='string').map(p=>[p.id,p]));
  const items=[],warnings=[];
  for(const item of sale.items){
    const product=catalog.get(item.id);
    if(!product){
      warnings.push('Produto '+item.name+' indisponível no catálogo; removido da retomada.');
      continue;
    }
    if(product.unit!==item.unit){
      warnings.push('Unidade do produto '+item.name+' mudou; confira o cadastro antes de adicionar novamente.');
      continue;
    }
    const priceCents=product.sale_price_cents;
    if(!Number.isSafeInteger(priceCents)||priceCents<0||priceCents>1_000_000_000){
      warnings.push('Preço do produto '+item.name+' inválido; removido da retomada.');
      continue;
    }
    if(priceCents!==item.priceCents)warnings.push('Preço atualizado para '+product.name+'; confira o novo total.');
    items.push({
      ...item,
      name:typeof product.name==='string'?product.name:item.name,
      code:typeof product.code==='string'?product.code:'',
      priceCents
    });
  }
  if(!items.length)throw new Error('Todos os itens da venda estão indisponíveis; a venda em espera foi preservada.');
  return {items,remaining:held.filter(row=>row.id!==id),warnings};
}

export function normalizeCashierFavorites(value){
  if(!Array.isArray(value))return [];
  const result=[];
  for(const id of value){
    if(typeof id!=='string'||!id.trim()||id.length>128||result.includes(id))continue;
    result.push(id);
    if(result.length===MAX_FAVORITES)break;
  }
  return result;
}
export function toggleCashierFavorite(current,id){
  if(typeof id!=='string'||!id.trim()||id.length>128)throw new Error('Produto favorito inválido.');
  const favorites=normalizeCashierFavorites(current);
  if(favorites.includes(id))return favorites.filter(x=>x!==id);
  if(favorites.length>=MAX_FAVORITES)throw new Error('Limite de produtos favoritos atingido.');
  return [...favorites,id];
}

export function canUndoCashierChange(current,undo){
  if(!undo||!Array.isArray(undo.before)||!Array.isArray(undo.after)||!Array.isArray(current))return false;
  return JSON.stringify(current)===JSON.stringify(undo.after);
}
