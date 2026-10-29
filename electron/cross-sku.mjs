import {bestPromotionPrice} from './nexus-features.mjs';
import {lineTotalCents} from '../shared/domain.mjs';

export function migrateCrossSku(db){
 const version=db.prepare('PRAGMA user_version').get().user_version;
 if(version>=6)return;
 if(version!==5)throw new Error('Migração de kits entre SKUs exige banco v5.');
 db.exec('BEGIN IMMEDIATE');
 try{
  db.exec("CREATE TABLE bundle_promotions("+
    "id TEXT PRIMARY KEY,name TEXT NOT NULL,bundle_price_cents INTEGER NOT NULL CHECK(bundle_price_cents>0),"+
    "active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);"+
    "CREATE TABLE bundle_promotion_items("+
    "bundle_id TEXT NOT NULL REFERENCES bundle_promotions(id),"+
    "product_id TEXT NOT NULL REFERENCES products(id),"+
    "quantity_milli INTEGER NOT NULL CHECK(quantity_milli>0),"+
    "PRIMARY KEY(bundle_id,product_id));"+
    "CREATE INDEX bundle_items_product ON bundle_promotion_items(product_id);"+
    "PRAGMA user_version=6;");
  db.exec('COMMIT');
 }catch(err){db.exec('ROLLBACK');throw err;}
}

// A regra mais vantajosa é selecionada dentre os combos de SKU e um único kit
// multisku, repetível, com o restante do carrinho elegível às promoções por SKU.
// Kits diferentes não são empilhados entre si: não há consumo duplo de itens.
export function optimizeCrossSkuDiscounts(snapshots,groups,rulesForProduct){
 const baseline=snapshots.map(s=>s.promoDiscount);
 let best=baseline;
 let bestCost=snapshots.reduce((n,s,i)=>n+s.line-baseline[i],0);
 for(const group of groups){
  const req=group.items.map(c=>({
    idx:snapshots.findIndex(s=>s.id===c.product_id),
    q:c.quantity_milli
  }));
  if(req.some(r=>r.idx<0))continue;
  const max=Math.min(...req.map(r=>Math.floor(snapshots[r.idx].quantityMilli/r.q)));
  if(max<1)continue;
  if(max>10000)throw new Error('Quantidade de kits excede limite seguro.');
  for(let copies=1;copies<=max;copies++){
   const discounts=[...baseline];
   let grossGroup=0;
   const consumed=[];
   for(const {idx,q} of req){
    const s=snapshots[idx],remaining=s.quantityMilli-q*copies;
    const leftGross=remaining?lineTotalCents(s.product.sale_price_cents,remaining):0;
    const groupedGross=s.line-leftGross;
    const leftCost=remaining
      ? (s.product.unit==='UN'
          ? bestPromotionPrice(s.product.sale_price_cents,remaining,rulesForProduct(s.id))
          : leftGross)
      : 0;
    consumed.push({idx,groupedGross,leftDiscount:leftGross-leftCost});
    grossGroup+=groupedGross;
   }
   const bundleNet=group.bundle_price_cents*copies;
   if(!Number.isSafeInteger(bundleNet))throw new Error('Total do kit excede limite.');
   const saving=grossGroup-bundleNet;
   if(saving<=0)continue;
   let distributed=0;
   const remainders=[];
   for(const part of consumed){
    const scaled=BigInt(saving)*BigInt(part.groupedGross);
    const share=Number(scaled/BigInt(grossGroup));
    discounts[part.idx]=share+part.leftDiscount;
    distributed+=share;
    remainders.push({idx:part.idx,rem:scaled%BigInt(grossGroup)});
   }
   remainders.sort((a,b)=>a.rem===b.rem?a.idx-b.idx:(a.rem>b.rem?-1:1));
   for(let i=0;i<saving-distributed;i++)discounts[remainders[i].idx]++;
   const cost=snapshots.reduce((n,s,i)=>n+s.line-discounts[i],0);
   if(cost<bestCost){
    bestCost=cost;
    best=discounts;
   }
  }
 }
 return {snapshots:snapshots.map((s,i)=>({...s,promoDiscount:best[i]})),
   promotionDiscount:best.reduce((sum,n)=>sum+n,0)};
}
