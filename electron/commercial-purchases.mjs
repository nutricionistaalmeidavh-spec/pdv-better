import {randomUUID} from 'node:crypto';
import {assertLabel,assertMilli,assertCents,assertDate} from '../shared/commerce.mjs';
import {normalizeSqliteError} from './sqlite-errors.mjs';
const now=()=>new Date().toISOString();
function atomic(db,fn){
 try{db.exec('BEGIN IMMEDIATE');const result=fn();db.exec('COMMIT');return result;}
 catch(error){try{db.exec('ROLLBACK');}catch{}throw normalizeSqliteError(error);}
}
export function createCommercialPurchases(db){
 const get=(sql,...args)=>db.prepare(sql).get(...args);
 const all=(sql,...args)=>db.prepare(sql).all(...args);
 const run=(sql,...args)=>db.prepare(sql).run(...args);
 function details(id){
  const purchase=get(`SELECT p.*,s.name AS supplier_name FROM commercial_purchases p JOIN suppliers s ON s.id=p.supplier_id WHERE p.id=?`,id);
  if(!purchase)throw new Error('Compra não encontrada.');
  return {...purchase,lines:all('SELECT * FROM commercial_purchase_lines WHERE purchase_id=? ORDER BY rowid',id)};
 }
 function listPurchases(options=null){
  if(options===null||options===undefined)
    return all('SELECT id FROM commercial_purchases ORDER BY created_at DESC,rowid DESC').map(x=>details(x.id));
  const {page=0,pageSize=75}=options;
  if(!Number.isSafeInteger(page)||page<0||page>10000000||
     !Number.isSafeInteger(pageSize)||pageSize<1||pageSize>250)
    throw new Error('Paginação de compras inválida.');
  const total=get('SELECT COUNT(*) AS n FROM commercial_purchases').n;
  const rows=all('SELECT id FROM commercial_purchases ORDER BY created_at DESC,rowid DESC LIMIT ? OFFSET ?',
    pageSize,page*pageSize).map(x=>details(x.id));
  return {rows,total,page,pageSize};
 }
 function createPurchase(input,ctx={}){
  return atomic(db,()=>{
   const supplierId=assertLabel(input?.supplierId,'Fornecedor',64);
   if(!get('SELECT id FROM suppliers WHERE id=? AND active=1',supplierId))throw new Error('Fornecedor inexistente ou inativo.');
   const lines=input?.lines;
   if(!Array.isArray(lines)||lines.length<1||lines.length>100)throw new Error('Informe de 1 a 100 itens de compra.');
   const normalized=lines.map(line=>{
    const productId=assertLabel(line?.productId,'Produto',64);
    const product=get('SELECT id,unit FROM products WHERE id=? AND active=1',productId);
    if(!product)throw new Error('Produto da compra inexistente ou inativo.');
    const quantity=assertMilli(line.quantityMilli);
    if(product.unit==='UN'&&quantity%1000!==0)throw new Error('Quantidade de produto UN deve ser inteira.');
    const cost=assertCents(line.unitCostCents,'Custo unitário');
    const total=Math.round(quantity*cost/1000);
    if(!Number.isSafeInteger(total))throw new Error('Valor do item de compra excede o limite.');
    return {productId,quantity,cost,total};
   });
   if(new Set(normalized.map(x=>x.productId)).size!==normalized.length)throw new Error('Produto duplicado na mesma compra.');
   const total=normalized.reduce((sum,x)=>sum+x.total,0);
   if(!Number.isSafeInteger(total)||total<=0)throw new Error('Total da compra deve ser positivo.');
   const due=assertDate(input?.dueOn);
   const reference=input?.documentRef==null||input.documentRef===''?null:assertLabel(input.documentRef,'Documento',100);
   const id=randomUUID();
   run("INSERT INTO commercial_purchases(id,supplier_id,status,document_ref,due_on,total_cents,created_at,operator_id) VALUES(?,?,'draft',?,?,?,?,?)",
    id,supplierId,reference,due,total,now(),ctx?.operatorId||null);
   for(const line of normalized)
    run('INSERT INTO commercial_purchase_lines(id,purchase_id,product_id,quantity_milli,unit_cost_cents) VALUES(?,?,?,?,?)',
     randomUUID(),id,line.productId,line.quantity,line.cost);
   return details(id);
  });
 }
 function receivePurchase(id,ctx={}){
  return atomic(db,()=>{
   const purchase=details(assertLabel(id,'Compra',64));
   if(purchase.status!=='draft')throw new Error('Compra já recebida; recebimento duplicado bloqueado.');
   for(const line of purchase.lines){
    const product=get('SELECT * FROM products WHERE id=? AND active=1',line.product_id);
    if(!product)throw new Error('Produto de compra inativo; recebimento não aplicado.');
    if(!Number.isSafeInteger(product.stock_milli+line.quantity_milli))throw new Error('Estoque excede limite.');
    const nextStock=product.stock_milli+line.quantity_milli;
    const newCost=Math.round((product.stock_milli*product.cost_price_cents+line.quantity_milli*line.unit_cost_cents)/nextStock);
    if(!Number.isSafeInteger(newCost)||newCost<0)throw new Error('Custo médio fora de limite.');
    run('UPDATE products SET stock_milli=?,cost_price_cents=?,updated_at=? WHERE id=?',
     nextStock,newCost,now(),product.id);
    run('INSERT INTO stock_movements(id,product_id,delta_milli,kind,reason,created_at) VALUES(?,?,?,?,?,?)',
     randomUUID(),product.id,line.quantity_milli,'purchase_receipt','Compra recebida '+purchase.id,now());
   }
   run("UPDATE commercial_purchases SET status='received',received_at=? WHERE id=? AND status='draft'",now(),purchase.id);
   run("INSERT INTO financial_entries(id,type,description,amount_cents,due_on,status,created_at,purchase_id) VALUES(?,'payable',?,?,?,'open',?,?)",
    randomUUID(),'Compra '+(purchase.document_ref||purchase.id.slice(0,8)),purchase.total_cents,purchase.due_on,now(),purchase.id);
   return details(id);
  });
 }
 return {createPurchase,receivePurchase,listPurchases};
}
