// Recursos locais de catálogo: migração versionada, promoção por faixa e lotes FEFO.
// Nunca executar descontos em ponto flutuante: preços em centavos e estoque em milésimos.
export function migrateNexusFeatures(db){
  const version=db.prepare('PRAGMA user_version').get().user_version;
  if(version>=5)return;
  if(version!==4)throw new Error('Migração de lotes e promoções requer banco v4.');
  db.exec('BEGIN IMMEDIATE');
  try{
    db.exec(
      "CREATE TABLE product_batches("+
        "id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),code TEXT NOT NULL,"+
        "expires_on TEXT NOT NULL,remaining_milli INTEGER NOT NULL CHECK(remaining_milli>=0),created_at TEXT NOT NULL,"+
        "UNIQUE(product_id,code));"+
      "CREATE INDEX batch_by_expiry ON product_batches(product_id,expires_on);"+
      "CREATE TABLE sale_batch_allocations("+
        "id TEXT PRIMARY KEY,sale_id TEXT NOT NULL REFERENCES sales(id),"+
        "sale_item_id TEXT NOT NULL REFERENCES sale_items(id),"+
        "batch_id TEXT NOT NULL REFERENCES product_batches(id),"+
        "quantity_milli INTEGER NOT NULL CHECK(quantity_milli>0),"+
        "UNIQUE(sale_item_id,batch_id));"+
      "CREATE TABLE product_promotions("+
        "id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),"+
        "quantity_milli INTEGER NOT NULL CHECK(quantity_milli>=1000),"+
        "bundle_price_cents INTEGER NOT NULL CHECK(bundle_price_cents>=0),"+
        "UNIQUE(product_id,quantity_milli));"+
      "ALTER TABLE sale_items ADD COLUMN promotion_discount_cents INTEGER NOT NULL DEFAULT 0;"+
      "PRAGMA user_version=5;"
    );
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
}

export function localBusinessDate(date=new Date()){
  const n=x=>String(x).padStart(2,'0');
  return date.getFullYear()+'-'+n(date.getMonth()+1)+'-'+n(date.getDate());
}

export function strictDate(value,label='Data'){
  if(typeof value!=='string'||!/^\\d{4}-\\d{2}-\\d{2}$/.test(value))throw new Error(label+' inválida.');
  const d=new Date(value+'T12:00:00Z');
  if(!Number.isFinite(d.valueOf())||d.toISOString().slice(0,10)!==value)throw new Error(label+' inválida.');
  return value;
}

// Programação dinâmica limitada: escolhe a combinação mais barata entre unitário e combos.
// A promoção nunca aumenta o preço, inclusive em produtos legados.
export function bestPromotionPrice(unitPriceCents,quantityMilli,rules=[]){
  if(!Number.isSafeInteger(unitPriceCents)||unitPriceCents<0)throw new Error('Preço inválido.');
  if(!Number.isSafeInteger(quantityMilli)||quantityMilli<=0||quantityMilli%1000!==0)
    throw new Error('Promoção por unidade exige quantidade inteira.');
  const count=quantityMilli/1000;
  if(count>10000)throw new Error('Limite de quantidade para promoção excedido.');
  const best=new Array(count+1).fill(Number.POSITIVE_INFINITY);
  best[0]=0;
  const valid=rules.filter(r=>Number.isSafeInteger(r.quantity_milli)&&r.quantity_milli>=2000&&
    r.quantity_milli%1000===0&&Number.isSafeInteger(r.bundle_price_cents)&&r.bundle_price_cents>=0);
  for(let i=1;i<=count;i++){
    best[i]=best[i-1]+unitPriceCents;
    for(const rule of valid){
      const q=rule.quantity_milli/1000;
      if(q<=i)best[i]=Math.min(best[i],best[i-q]+rule.bundle_price_cents);
    }
    if(!Number.isSafeInteger(best[i]))throw new Error('Valor promocional excede limite.');
  }
  return best[count];
}
