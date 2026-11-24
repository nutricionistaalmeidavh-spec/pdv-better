import {createHash,randomUUID} from 'node:crypto';
import {transferColumns,transferRecords} from '../shared/data-transfer.mjs';
import {normalizeRecord,parseFixed} from '../shared/domain.mjs';
import {entities} from '../shared/contract.mjs';
const key=v=>String(v??'').trim().toLocaleLowerCase('pt-BR');
const doc=v=>String(v??'').replace(/\D/g,'');
const uuid=/^[0-9a-f-]{36}$/i;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function createDataTransfer(db,save){
 db.exec('CREATE TABLE IF NOT EXISTS data_transfer_audit (id TEXT PRIMARY KEY, kind TEXT NOT NULL, created_at TEXT NOT NULL, operator_id TEXT, created_count INTEGER NOT NULL, updated_count INTEGER NOT NULL, reason TEXT)');
 function rowsFor(kind){
  const entity=kind==='inventory'?'products':kind;
  const cols=transferColumns(kind).map(c=>c.key).filter(k=>k!=='category_id');
  const fields=entity==='products'?[...new Set([...cols,'id','name','code','unit','stock_milli','category_id'])]:cols;
  return db.prepare('SELECT '+fields.map(k=>'"'+k+'"').join(',')+' FROM "'+entity+'" WHERE active=1 ORDER BY name COLLATE NOCASE,id').all();
 }
 function exportDataTransfer(kind){
  const cols=transferColumns(kind);
  const names=new Map(db.prepare('SELECT id,name FROM categories WHERE active=1').all().map(r=>[r.id,r.name]));
  const data=rowsFor(kind);
  return {count:data.length,table:[cols.map(c=>c.label),...data.map(r=>cols.map(({key:k})=>{
   if(k==='category_id')return names.get(r[k])??'';
   if(k==='stock_milli')return (r[k]/1000).toFixed(3);
   if(k.endsWith('_cents'))return (r[k]/100).toFixed(2);
   return String(r[k]??'');
  }))]};
 }
 function plan(input){
  const kind=input?.kind;const entries=transferRecords(kind,input?.table);
  const entity=kind==='inventory'?'products':kind;
  const reason=String(input?.reason??'').trim();
  if(kind==='inventory'&&(!reason||reason.length>150))throw new Error('Informe o motivo do ajuste de estoque (até 150 caracteres).');
  const candidates=db.prepare('SELECT * FROM "'+entity+'"').all();
  const categories=kind==='products'?db.prepare('SELECT id,name FROM categories WHERE active=1').all():[];
  const seen=new Set(),result=[];
  for(let i=0;i<entries.length;i++){
   const raw=entries[i];
   try{
    if(raw.id&&!uuid.test(raw.id))throw new Error('ID inválido.');
    const code=String(raw.code??'').trim().toUpperCase();
    if((kind==='products'||kind==='inventory')&&!code)throw new Error('Código obrigatório.');
    const matches=candidates.filter(r=>(raw.id&&r.id===raw.id)||
      (entity==='products'&&code&&r.code===code)||
      (entity==='categories'&&key(r.name)===key(raw.name))||
      (['customers','suppliers'].includes(entity)&&doc(raw.document)&&doc(r.document)===doc(raw.document)));
    if(matches.length>1)throw new Error('Cadastro ambíguo ou duplicado no banco.');
    const old=matches[0];
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
    if(entity==='products'){
     values.code=code;values.unit=String(values.unit).toUpperCase();
     if(Object.hasOwn(raw,'category_id')){
      const name=raw.category_id;
      const hits=categories.filter(c=>c.id===name||key(c.name)===key(name));
      if(name&&hits.length!==1)throw new Error('Categoria não encontrada ou ambígua: '+name+'. Importe categorias primeiro.');
      values.category_id=name?hits[0].id:null;
     }
     if(old){if(Object.hasOwn(raw,'stock_milli')&&raw.stock_milli!==''&&parseFixed(raw.stock_milli,3,'Estoque')!==old.stock_milli)throw new Error('Use a planilha de Estoque para alterar o saldo de produto existente.');values.stock_milli=old.stock_milli;}
    }
    const normalized=normalizeRecord(entity,values);
    if(entity==='products'&&normalized.unit==='UN'&&normalized.stock_milli%1000)throw new Error('Produto UN exige quantidade inteira.');
    if(!old&&['customers','suppliers'].includes(entity)&&!doc(raw.document)&&candidates.some(r=>key(r.name)===key(raw.name)))throw new Error('Nome já cadastrado sem identificação única. Exporte e use o ID ou informe CPF/CNPJ.');
    const changed=!old||entities[entity].fields.some(f=>(old[f.key]??'')!==(normalized[f.key]??''));
    result.push({old,values:normalized,action:old?(changed?'updated':'unchanged'):'created'});
   }catch(err){throw new Error('Linha '+(i+2)+': '+err.message);}
  }
  const token=hash({kind,reason,records:result.map(x=>({old:x.old&&[x.old.id,x.old.updated_at,x.old.stock_milli,x.old.name,x.old.code,x.old.document,x.old.phone,x.old.email,x.old.sale_price_cents,x.old.cost_price_cents,x.old.unit,x.old.category_id,x.old.brand,x.old.producer,x.old.variant_group,x.old.variant_label],values:x.values,action:x.action}))});
  const count=a=>result.filter(x=>x.action===a).length;
  return {kind,entity,reason,result,token,count:result.length,created:count('created'),updated:count('updated'),unchanged:count('unchanged')};
 }
 function publicPreview(p){return {token:p.token,count:p.count,created:p.created,updated:p.updated,unchanged:p.unchanged,rows:p.result.slice(0,10).map(x=>({name:x.values.name,code:x.values.code||x.values.document||'',action:x.action,before:x.old?.stock_milli,after:x.values.stock_milli}))};}
 function previewDataTransfer(input){return publicPreview(plan(input));}
 function importDataTransfer(input,context={}){
  db.exec('BEGIN IMMEDIATE');
  try{
   const p=plan(input);
   if(p.token!==input.token)throw new Error('O cadastro mudou desde a prévia. Gere uma nova prévia.');
   for(const x of p.result){
    if(x.action==='unchanged')continue;
    const values={...x.values,id:x.old?.id};
    if(p.kind==='inventory')values.stockEdit={expectedMilli:x.old.stock_milli,reason:p.reason};
    save(p.entity,values,{...context,bulkTransaction:true});
   }
   db.prepare('INSERT INTO data_transfer_audit VALUES(?,?,?,?,?,?,?)').run(randomUUID(),p.kind,new Date().toISOString(),context.operatorId??null,p.created,p.updated,p.reason||null);
   db.exec('COMMIT');
   return {imported:p.created+p.updated,created:p.created,updated:p.updated,unchanged:p.unchanged};
  }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
 }
 return {previewDataTransfer,importDataTransfer,exportDataTransfer};
}
