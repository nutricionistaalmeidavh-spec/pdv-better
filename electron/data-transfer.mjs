import {createHash,randomUUID} from 'node:crypto';
import {transferColumns,transferRecords} from '../shared/data-transfer.mjs';
import {normalizeRecord,parseFixed} from '../shared/domain.mjs';
import {entities} from '../shared/contract.mjs';
const key=v=>String(v??'').trim().toLocaleLowerCase('pt-BR');
const doc=v=>String(v??'').replace(/\D/g,'');
const uuid=/^[0-9a-f-]{36}$/i;
const fixed=(n,places)=>{
 const value=BigInt(n),scale=10n**BigInt(places);
 return String(value/scale)+'.'+String(value%scale).padStart(places,'0');
};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function* iterateTransferRows(db,kind){
 const cols=transferColumns(kind),entity=kind==='inventory'?'products':kind;
 const names=kind==='products'?new Map(db.prepare('SELECT id,name FROM categories WHERE active=1').all().map(r=>[r.id,r.name])):null;
 const fields=cols.map(c=>c.key);
 yield cols.map(c=>c.label);
 for(const record of db.prepare('SELECT '+fields.map(k=>'"'+k+'"').join(',')+' FROM "'+entity+'" WHERE active=1 ORDER BY name COLLATE NOCASE,id').iterate()){
  yield cols.map(({key:k})=>{
   if(k==='category_id')return names?.get(record[k])??'';
   if(k==='stock_milli')return fixed(record[k],3);
   if(k.endsWith('_cents'))return fixed(record[k],2);
   return String(record[k]??'');
  });
 }
}
export function createDataTransfer(db,save){
 db.exec('CREATE TABLE IF NOT EXISTS data_transfer_audit (id TEXT PRIMARY KEY, kind TEXT NOT NULL, created_at TEXT NOT NULL, operator_id TEXT, created_count INTEGER NOT NULL, updated_count INTEGER NOT NULL, reason TEXT)');
 db.exec('CREATE INDEX IF NOT EXISTS idx_data_transfer_audit_kind_time ON data_transfer_audit(kind,created_at DESC,id DESC)');
 function dataTransferHistory(input){
  const {kind,page=0,pageSize=25}=input||{};
  transferColumns(kind);
  if(!Number.isSafeInteger(page)||page<0||page>10000000||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>100)throw new Error('Paginação de importações inválida.');
  const total=db.prepare('SELECT COUNT(*) AS n FROM data_transfer_audit WHERE kind=?').get(kind).n;
  const rows=db.prepare('SELECT a.*,o.name AS operator_name FROM data_transfer_audit a LEFT JOIN operators o ON o.id=a.operator_id WHERE a.kind=? ORDER BY a.created_at DESC,a.id DESC LIMIT ? OFFSET ?').all(kind,pageSize,page*pageSize);
  return {total,page,pageSize,rows};
 }
 function exportDataTransfer(kind){
  const table=Array.from(iterateTransferRows(db,kind));
  return {count:table.length-1,table};
 }
 function plan(input){
  const kind=input?.kind;const entries=transferRecords(kind,input?.table);
  const entity=kind==='inventory'?'products':kind;
  const reason=String(input?.reason??'').trim();
  if(kind==='inventory'&&(!reason||reason.length>150))throw new Error('Informe o motivo do ajuste de estoque (até 150 caracteres).');
  const identityColumns=entity==='products'?'id,name,code,active':entity==='categories'?'id,name,active':'id,name,document,active';
  const candidates=entity==='products'?[]:db.prepare('SELECT '+identityColumns+' FROM "'+entity+'"').all();
  const productById=entity==='products'?db.prepare('SELECT id,active FROM products WHERE id=?'):null;
  const productByCode=entity==='products'?db.prepare('SELECT id,active FROM products WHERE code=?'):null;
  const index=new Map();
  const add=(type,value,r)=>{if(!value)return;const k=type+':'+value;const list=index.get(k)||[];list.push(r);index.set(k,list);};
  for(const r of candidates){add('id',r.id,r);add('name',key(r.name),r);if(entity==='products')add('code',r.code,r);else if(entity!=='categories')add('doc',doc(r.document),r);}
  const lookup=(type,value)=>{
   if(!value)return [];
   if(entity==='products'){const row=(type==='id'?productById:type==='code'?productByCode:null)?.get(value);return row?[row]:[];}
   return index.get(type+':'+value)||[];
  };
  // Fotos não participam de planilhas; não carregar blobs em prévias com milhares de produtos.
  const projection=entity==='products'?['id','active','created_at','updated_at',...entities.products.fields.filter(f=>f.key!=='image_data').map(f=>f.key)].join(','):'*';
  const load=db.prepare('SELECT '+projection+' FROM "'+entity+'" WHERE id=?');
  const categories=kind==='products'?db.prepare('SELECT id,name FROM categories WHERE active=1').all():[];
  const seen=new Set(),result=[],errors=[];let invalid=0;
  for(let i=0;i<entries.length;i++){
   const raw=entries[i];
   try{
    if(raw.id&&!uuid.test(raw.id))throw new Error('ID inválido.');
    const code=String(raw.code??'').trim().toUpperCase();
    if((kind==='products'||kind==='inventory')&&!code&&!raw.id)throw new Error('Código ou ID obrigatório.');
    const hits=[...lookup('id',raw.id),...(entity==='products'?lookup('code',code):entity==='categories'?lookup('name',key(raw.name)):lookup('doc',doc(raw.document)))];
    const matches=[...new Map(hits.map(r=>[r.id,r])).values()];
    if(matches.length>1)throw new Error('Cadastro ambíguo ou duplicado no banco.');
    const old=matches.length?load.get(matches[0].id):null;
    if(entity==='products'&&!code&&!old)throw new Error('Código obrigatório para novo produto.');
    if(old&&!old.active)throw new Error('Cadastro desativado; reative manualmente.');
    const identity=old?.id|| (entity==='products'?code:entity==='categories'?key(raw.name):doc(raw.document)||key(raw.name)+'|'+key(raw.phone)+'|'+key(raw.email));
    if(seen.has(identity))throw new Error('Registro duplicado no arquivo.');
    seen.add(identity);
    if(kind==='inventory'){
     if(!old)throw new Error('Produto não encontrado: '+code);
     if(!raw.stock_milli)throw new Error('Saldo obrigatório.');
     const target=parseFixed(raw.stock_milli,3,'Estoque');
     if(old.unit==='UN'&&target%1000)throw new Error('Produto UN exige quantidade inteira.');
     const tracked=db.prepare('SELECT COALESCE(SUM(remaining_milli),0) AS total FROM product_batches WHERE product_id=?').get(old.id).total;
     if(target<tracked)throw new Error('Saldo menor que os lotes rastreados.');
     result.push({old,values:{...old,stock_milli:target},action:target===old.stock_milli?'unchanged':'updated'});
     continue;
    }
    const values={...(old||{}),...raw};delete values.id;
    if(entity==='products'&&old&&raw.unit&&raw.unit.toUpperCase()!==old.unit&&(old.stock_milli||db.prepare('SELECT 1 FROM stock_movements WHERE product_id=? LIMIT 1').get(old.id)||db.prepare('SELECT 1 FROM sale_items WHERE product_id=? LIMIT 1').get(old.id)||db.prepare('SELECT 1 FROM commercial_purchase_lines WHERE product_id=? LIMIT 1').get(old.id)||db.prepare('SELECT 1 FROM product_batches WHERE product_id=? LIMIT 1').get(old.id)))throw new Error('Unidade com estoque ou histórico não pode ser alterada.');
    if(entity==='products'){
     values.code=code||old?.code||'';values.unit=String(values.unit).toUpperCase();
     if(Object.hasOwn(raw,'category_id')){
      const name=raw.category_id;
      const hits=categories.filter(c=>c.id===name||key(c.name)===key(name));
      if(name&&hits.length!==1)throw new Error('Categoria não encontrada ou ambígua: '+name+'. Importe categorias primeiro.');
      values.category_id=name?hits[0].id:null;
     }
     if(old){if(Object.hasOwn(raw,'stock_milli')&&raw.stock_milli!==''&&parseFixed(raw.stock_milli,3,'Estoque')!==old.stock_milli)throw new Error('Use a planilha de Estoque para alterar o saldo de produto existente.');values.stock_milli=old.stock_milli;}
    }
    if(entity==='products'){for(const field of ['sale_price_cents','cost_price_cents'])if(typeof values[field]==='string')values[field]=values[field].replace(/^R\$\s*/,'').trim();}
    const normalized=normalizeRecord(entity,values);
    if(entity==='products'&&normalized.unit==='UN'&&normalized.stock_milli%1000)throw new Error('Produto UN exige quantidade inteira.');
    if(!old&&['customers','suppliers'].includes(entity)&&!doc(raw.document)&&lookup('name',key(raw.name)).length>0)throw new Error('Nome já cadastrado sem identificação única. Exporte e use o ID ou informe CPF/CNPJ.');
    const changed=!old||entities[entity].fields.some(f=>f.type!=='image'&&(old[f.key]??'')!==(normalized[f.key]??''));
    result.push({old,values:normalized,action:old?(changed?'updated':'unchanged'):'created'});
   }catch(err){invalid++;if(errors.length<20)errors.push('Linha '+(i+2)+': '+err.message);}
  }
  if(invalid)throw new Error(invalid+' linha(s) inválida(s). '+errors.join(' | ')+(invalid>errors.length?' | E mais '+(invalid-errors.length)+' linha(s).':''));
  const token=hash({kind,reason,records:result.map(x=>({old:x.old&&[x.old.id,x.old.updated_at,x.old.stock_milli,x.old.name,x.old.code,x.old.document,x.old.phone,x.old.email,x.old.sale_price_cents,x.old.cost_price_cents,x.old.unit,x.old.category_id,x.old.brand,x.old.producer,x.old.variant_group,x.old.variant_label],values:x.values,action:x.action}))});
  const count=a=>result.filter(x=>x.action===a).length;
  return {kind,entity,reason,result,token,count:result.length,created:count('created'),updated:count('updated'),unchanged:count('unchanged')};
 }
 function publicPreview(p){return {token:p.token,count:p.count,created:p.created,updated:p.updated,unchanged:p.unchanged,rows:p.result.slice(0,10).map(x=>({name:x.values.name,code:x.values.code||x.values.document||'',action:x.action,before:x.old?.stock_milli,after:x.values.stock_milli,priceBefore:x.old?.sale_price_cents,priceAfter:x.values.sale_price_cents,costBefore:x.old?.cost_price_cents,costAfter:x.values.cost_price_cents}))};}
 function previewDataTransfer(input){return publicPreview(plan(input));}
 function importDataTransfer(input,context={}){
  db.exec('BEGIN IMMEDIATE');
  try{
   const p=plan(input);
   if(p.token!==input.token)throw new Error('O cadastro mudou desde a prévia. Gere uma nova prévia.');
   for(const x of p.result){
    if(x.action==='unchanged')continue;
    const values={...x.values,id:x.old?.id};
    if(p.entity==='products'&&x.old)values.image_data=db.prepare('SELECT image_data FROM products WHERE id=?').get(x.old.id)?.image_data||'';
    if(p.kind==='inventory')values.stockEdit={expectedMilli:x.old.stock_milli,reason:p.reason};
    save(p.entity,values,{...context,bulkTransaction:true});
   }
   db.prepare('INSERT INTO data_transfer_audit VALUES(?,?,?,?,?,?,?)').run(randomUUID(),p.kind,new Date().toISOString(),context.operatorId??null,p.created,p.updated,p.reason||null);
   db.exec('COMMIT');
   return {imported:p.created+p.updated,created:p.created,updated:p.updated,unchanged:p.unchanged};
  }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
 }
 return {previewDataTransfer,importDataTransfer,exportDataTransfer,dataTransferHistory};
}
