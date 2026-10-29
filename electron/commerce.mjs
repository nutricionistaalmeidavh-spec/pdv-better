import { randomUUID, createHash } from 'node:crypto';
import {
  assertCents, assertMilli, assertChoice, assertLabel, normalizePayments,
  validateSaleInput, inventoryDelta, cashDelta, financeInput, lineTotalCents, methodIds
} from '../shared/commerce.mjs';
import {bestPromotionPrice,localBusinessDate,strictDate} from './nexus-features.mjs';
const now=()=>new Date().toISOString();
function atomic(db,fn) {
  db.exec('BEGIN IMMEDIATE');
  try {const result=fn();db.exec('COMMIT');return result;}
  catch(error){db.exec('ROLLBACK');throw error;}
}
function createTables(db){
  const old=db.prepare('PRAGMA user_version').get().user_version;
  if(old>=3)return;
  const oldSales=Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sales'").get());
  const legacySales=oldSales&&!db.prepare('PRAGMA table_info(sales)').all().some(x=>x.name==='idempotency_key');
  const hasStockHistory=Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_movements'").get());
  atomic(db,()=>{
    if(legacySales) {
      db.exec('ALTER TABLE sale_items RENAME TO legacy_sale_items');
      db.exec('ALTER TABLE sales RENAME TO legacy_sales');
    }
    db.exec([
      "CREATE TABLE IF NOT EXISTS cash_sessions(id TEXT PRIMARY KEY,opened_at TEXT NOT NULL,closed_at TEXT,opening_cash_cents INTEGER NOT NULL CHECK(opening_cash_cents>=0),counted_cash_cents INTEGER,expected_cash_cents INTEGER,difference_cents INTEGER,status TEXT NOT NULL CHECK(status IN ('open','closed')));",
      "CREATE UNIQUE INDEX IF NOT EXISTS only_one_open_cash_session ON cash_sessions(status) WHERE status='open';",
      "CREATE TABLE IF NOT EXISTS cash_movements(id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES cash_sessions(id),kind TEXT NOT NULL,delta_cents INTEGER NOT NULL CHECK(delta_cents<>0),note TEXT,sale_id TEXT,entry_id TEXT,created_at TEXT NOT NULL);",
      "CREATE INDEX IF NOT EXISTS cash_movements_session ON cash_movements(session_id);",
      "CREATE TABLE IF NOT EXISTS sales(id TEXT PRIMARY KEY,idempotency_key TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL,session_id TEXT NOT NULL REFERENCES cash_sessions(id),customer_id TEXT REFERENCES customers(id),subtotal_cents INTEGER NOT NULL,discount_cents INTEGER NOT NULL,total_cents INTEGER NOT NULL,change_cents INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('completed','cancelled')),created_at TEXT NOT NULL,cancelled_at TEXT);",
      "CREATE TABLE IF NOT EXISTS sale_items(id TEXT PRIMARY KEY,sale_id TEXT NOT NULL REFERENCES sales(id),product_id TEXT NOT NULL REFERENCES products(id),name TEXT NOT NULL,code TEXT,unit TEXT NOT NULL,quantity_milli INTEGER NOT NULL CHECK(quantity_milli>0),unit_price_cents INTEGER NOT NULL,line_total_cents INTEGER NOT NULL,unit_cost_cents INTEGER NOT NULL);",
      "CREATE INDEX IF NOT EXISTS sale_items_sale ON sale_items(sale_id);",
      "CREATE TABLE IF NOT EXISTS sale_payments(id TEXT PRIMARY KEY,sale_id TEXT NOT NULL REFERENCES sales(id),method TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),tendered_cents INTEGER NOT NULL CHECK(tendered_cents>0));",
      "CREATE INDEX IF NOT EXISTS sale_payments_sale ON sale_payments(sale_id);",
      "CREATE TABLE IF NOT EXISTS stock_movements(id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),delta_milli INTEGER NOT NULL CHECK(delta_milli<>0),kind TEXT NOT NULL,reason TEXT NOT NULL,sale_id TEXT REFERENCES sales(id),created_at TEXT NOT NULL);",
      "CREATE INDEX IF NOT EXISTS stock_movements_product ON stock_movements(product_id);",
      "CREATE TABLE IF NOT EXISTS financial_entries(id TEXT PRIMARY KEY,type TEXT NOT NULL CHECK(type IN ('payable','receivable')),description TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),due_on TEXT,customer_id TEXT REFERENCES customers(id),sale_id TEXT REFERENCES sales(id),status TEXT NOT NULL CHECK(status IN ('open','settled','cancelled')),method TEXT,created_at TEXT NOT NULL,settled_at TEXT);",
      "CREATE INDEX IF NOT EXISTS financial_entries_sale ON financial_entries(sale_id);"
    ].join('\n'));
    if(legacySales) {
      // Venda Glass v2: conservar IDs/itens/troco, e nunca dar baixa de estoque duas vezes.
      const history=db.prepare('SELECT * FROM legacy_sales ORDER BY created_at,id').all();
      const lines=db.prepare('SELECT * FROM legacy_sale_items ORDER BY sale_id,product_id').all();
      const openQuantity=new Map();
      for(const item of lines) {
        const sale=history.find(s=>s.id===item.sale_id);
        if(sale?.status!=='cancelled')openQuantity.set(item.product_id,(openQuantity.get(item.product_id)||0)+item.quantity_milli);
      }
      const historicSession=randomUUID();
      const cashTotal=history.filter(s=>s.status!=='cancelled'&&s.payment_method==='cash').reduce((sum,s)=>sum+s.total_cents,0);
      db.prepare("INSERT INTO cash_sessions(id,opened_at,closed_at,opening_cash_cents,counted_cash_cents,expected_cash_cents,difference_cents,status) VALUES(?,?,?,?,?,?,?,'closed')")
        .run(historicSession,history[0]?.created_at||now(),now(),0,cashTotal,cashTotal,0);
      for(const sale of history){
        const status=sale.status==='cancelled'?'cancelled':'completed';
        const digest=createHash('sha256').update(JSON.stringify(sale)).digest('hex');
        db.prepare('INSERT INTO sales(id,idempotency_key,request_hash,session_id,customer_id,subtotal_cents,discount_cents,total_cents,change_cents,status,created_at,cancelled_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(sale.id,'glass-v2:'+sale.id,digest,historicSession,null,sale.total_cents,0,sale.total_cents,sale.change_cents,status,sale.created_at,status==='cancelled'?sale.created_at:null);
        if(sale.total_cents>0) {
          const method=sale.payment_method==='cash'?'cash':'card';
          db.prepare('INSERT INTO sale_payments(id,sale_id,method,amount_cents,tendered_cents) VALUES(?,?,?,?,?)')
            .run(randomUUID(),sale.id,method,sale.total_cents,sale.tendered_cents);
          if(method==='cash'&&status==='completed')
            db.prepare('INSERT INTO cash_movements(id,session_id,kind,delta_cents,note,sale_id,created_at) VALUES(?,?,?,?,?,?,?)')
              .run(randomUUID(),historicSession,'legacy_sale',sale.total_cents,'Venda Glass v2 migrada',sale.id,sale.created_at);
        }
      }
      for(const item of lines){
        const product=db.prepare('SELECT id,code,cost_price_cents FROM products WHERE id=?').get(item.product_id);
        if(!product)throw new Error('Migração Glass v2 bloqueada: item histórico sem produto. Banco original preservado.');
        db.prepare('INSERT INTO sale_items(id,sale_id,product_id,name,code,unit,quantity_milli,unit_price_cents,line_total_cents,unit_cost_cents) VALUES(?,?,?,?,?,?,?,?,?,?)')
          .run(randomUUID(),item.sale_id,item.product_id,item.name,product.code||null,item.unit,item.quantity_milli,item.price_cents,item.line_total_cents,product.cost_price_cents||0);
      }
      for(const product of db.prepare('SELECT id,stock_milli FROM products').all()){
        const original=product.stock_milli+(openQuantity.get(product.id)||0);
        if(original>0)
          db.prepare('INSERT INTO stock_movements(id,product_id,delta_milli,kind,reason,created_at) VALUES(?,?,?,?,?,?)')
            .run(randomUUID(),product.id,original,'opening','Saldo reconciliado da versão Glass v2',now());
      }
      for(const item of lines){
        if(history.find(s=>s.id===item.sale_id)?.status!=='cancelled')
          db.prepare('INSERT INTO stock_movements(id,product_id,delta_milli,kind,reason,sale_id,created_at) VALUES(?,?,?,?,?,?,?)')
            .run(randomUUID(),item.product_id,-item.quantity_milli,'sale','Venda Glass v2 migrada',item.sale_id,now());
      }
      db.exec('DROP TABLE legacy_sale_items');
      db.exec('DROP TABLE legacy_sales');
    }else if(!hasStockHistory){
      // Banco v1: o saldo atual vira primeiro movimento auditável.
      for(const product of db.prepare('SELECT id,stock_milli FROM products WHERE stock_milli>0').all())
        db.prepare('INSERT INTO stock_movements(id,product_id,delta_milli,kind,reason,created_at) VALUES(?,?,?,?,?,?)')
          .run(randomUUID(),product.id,product.stock_milli,'opening','Saldo inicial migrado',now());
    }
    db.exec('PRAGMA user_version = 3');
  });
}
export function createCommerce(db,{defaultTerminalId='legacy'}={}){
  createTables(db);
  const row=(sql,...args)=>db.prepare(sql).get(...args);
  const all=(sql,...args)=>db.prepare(sql).all(...args);
  const run=(sql,...args)=>db.prepare(sql).run(...args);
  const terminal=ctx=>typeof ctx?.terminalId==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(ctx.terminalId)?ctx.terminalId:defaultTerminalId;
  const openRow=ctx=>row("SELECT * FROM cash_sessions WHERE status='open' AND terminal_id=?",terminal(ctx));
  const requireOpen=ctx=>{
    const session=openRow(ctx);
    if(!session)throw new Error('É necessário um caixa aberto neste terminal para continuar.');
    return session;
  };
  const cashExpected=session=>session.opening_cash_cents+(row('SELECT COALESCE(SUM(delta_cents),0) AS total FROM cash_movements WHERE session_id=?',session.id)?.total||0);
  function recordCash(session,kind,delta,note='',saleId=null,entryId=null,operatorId=null){
    if(!delta)return;
    if(cashExpected(session)+delta<0)throw new Error('Saldo de dinheiro insuficiente no caixa.');
    run('INSERT INTO cash_movements(id,session_id,kind,delta_cents,note,sale_id,entry_id,operator_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
      randomUUID(),session.id,kind,delta,note,saleId,entryId,operatorId,now());
  }
  function recordStock(productId,delta,kind,reason,saleId=null){
    if(!Number.isSafeInteger(delta)||delta===0)throw new Error('Movimentação de estoque inválida.');
    const p=row('SELECT id,stock_milli FROM products WHERE id=?',productId);
    if(!p)throw new Error('Produto não encontrado.');
    if(p.stock_milli+delta<0)throw new Error('Estoque insuficiente: saldo não pode ficar negativo.');
    if(!Number.isSafeInteger(p.stock_milli+delta))throw new Error('Saldo de estoque excede o limite.');
    run('UPDATE products SET stock_milli=stock_milli+?,updated_at=? WHERE id=?',delta,now(),productId);
    run('INSERT INTO stock_movements(id,product_id,delta_milli,kind,reason,sale_id,created_at) VALUES(?,?,?,?,?,?,?)',
      randomUUID(),productId,delta,kind,reason,saleId,now());
  }

  function listBatches(productId=null){
    if(productId!==null){
      const id=assertLabel(productId,'Produto',64);
      return all('SELECT * FROM product_batches WHERE product_id=? ORDER BY expires_on,code',id);
    }
    return all('SELECT * FROM product_batches ORDER BY expires_on,product_id,code');
  }
  function receiveBatch(input){
    return atomic(db,()=>{
      const productId=assertLabel(input?.productId,'Produto',64);
      const code=assertLabel(input?.code,'Código do lote',64);
      const expiresOn=strictDate(input?.expiresOn,'Validade');
      const quantity=assertMilli(input?.quantityMilli);
      const p=row('SELECT * FROM products WHERE id=? AND active=1',productId);
      if(!p)throw new Error('Produto do lote não encontrado.');
      if(p.unit==='UN'&&quantity%1000!==0)throw new Error('Lote de unidade exige quantidade inteira.');
      const existing=row('SELECT * FROM product_batches WHERE product_id=? AND code=?',productId,code);
      if(existing&&existing.expires_on!==expiresOn)throw new Error('Lote já cadastrado com outra validade.');
      recordStock(productId,quantity,'batch_receipt','Entrada do lote '+code);
      if(existing){
        run('UPDATE product_batches SET remaining_milli=remaining_milli+? WHERE id=?',quantity,existing.id);
        return row('SELECT * FROM product_batches WHERE id=?',existing.id);
      }
      const id=randomUUID();
      run('INSERT INTO product_batches(id,product_id,code,expires_on,remaining_milli,created_at) VALUES(?,?,?,?,?,?)',id,productId,code,expiresOn,quantity,now());
      return row('SELECT * FROM product_batches WHERE id=?',id);
    });
  }
  function listPromotions(productId=null){
    if(productId!==null)return all('SELECT * FROM product_promotions WHERE product_id=? ORDER BY quantity_milli',assertLabel(productId,'Produto',64));
    return all('SELECT * FROM product_promotions ORDER BY product_id,quantity_milli');
  }
  function setPromotion(input){
    return atomic(db,()=>{
      const productId=assertLabel(input?.productId,'Produto',64);
      const p=row('SELECT * FROM products WHERE id=? AND active=1',productId);
      if(!p)throw new Error('Produto da promoção não encontrado.');
      if(p.unit!=='UN')throw new Error('Promoção por quantidade exige produto por unidade, não KG.');
      const qty=assertMilli(input?.quantityMilli);
      if(qty<2000||qty%1000!==0)throw new Error('Promoção por unidade exige quantidade inteira de 2 ou mais.');
      const price=assertCents(input?.bundlePriceCents,'Preço promocional');
      const full=lineTotalCents(p.sale_price_cents,qty);
      if(price>full)throw new Error('Preço promocional não pode ser maior que preço normal.');
      const existing=row('SELECT id FROM product_promotions WHERE product_id=? AND quantity_milli=?',productId,qty);
      const id=existing?.id||randomUUID();
      run('INSERT INTO product_promotions(id,product_id,quantity_milli,bundle_price_cents) VALUES(?,?,?,?) ON CONFLICT(product_id,quantity_milli) DO UPDATE SET bundle_price_cents=excluded.bundle_price_cents',id,productId,qty,price);
      return row('SELECT * FROM product_promotions WHERE product_id=? AND quantity_milli=?',productId,qty);
    });
  }
  function calculateLines(items){
    let subtotal=0,promotionDiscount=0;
    const snapshots=items.map(item=>{
      const product=row('SELECT * FROM products WHERE id=? AND active=1',item.id);
      if(!product)throw new Error('Produto inativo ou não encontrado.');
      if(product.unit==='UN'&&item.quantityMilli%1000!==0)throw new Error('Produto por unidade exige quantidade inteira.');
      if(product.stock_milli<item.quantityMilli)throw new Error('Estoque insuficiente: '+product.name);
      const line=lineTotalCents(product.sale_price_cents,item.quantityMilli);
      const rules=product.unit==='UN'?listPromotions(item.id):[];
      const promoNet=rules.length?bestPromotionPrice(product.sale_price_cents,item.quantityMilli,rules):line;
      subtotal+=line;promotionDiscount+=line-promoNet;
      if(!Number.isSafeInteger(subtotal)||!Number.isSafeInteger(promotionDiscount))throw new Error('Total da venda excede o limite.');
      return {...item,product,line,promoDiscount:line-promoNet};
    });
    return {subtotal,promotionDiscount,snapshots};
  }
  function quoteSale(input){
    const draft=validateSaleInput({...input,key:'quote-only',payments:[]});
    const {subtotal,promotionDiscount,snapshots}=calculateLines(draft.items);
    if(draft.discountCents>subtotal-promotionDiscount)throw new Error('Desconto não pode ultrapassar o subtotal.');
    const total=subtotal-promotionDiscount-draft.discountCents;
    if(total<=0)throw new Error('Total deve ser positivo.');
    return {subtotal_cents:subtotal,promotion_discount_cents:promotionDiscount,
      manual_discount_cents:draft.discountCents,total_cents:total,
      lines:snapshots.map(s=>({product_id:s.id,gross_cents:s.line,promotion_discount_cents:s.promoDiscount}))};
  }
  function allocateBatches(product,quantity,batchId,saleId,saleItemId){
    const lots=listBatches(product.id);
    if(!lots.length && !batchId)return;
    const tracked=lots.reduce((sum,b)=>sum+b.remaining_milli,0);
    const untracked=product.stock_milli-tracked;
    if(untracked<0)throw new Error('Saldo de lotes excede estoque; concilie o inventário.');
    const valid=lots.filter(b=>b.remaining_milli>0&&b.expires_on>=localBusinessDate());
    let chosen=[];
    if(batchId){
      const batch=lots.find(b=>b.id===batchId);
      if(!batch)throw new Error('Lote físico não encontrado para este produto.');
      if(batch.expires_on<localBusinessDate())throw new Error('Lote físico vencido. Venda bloqueada.');
      if(batch.remaining_milli<quantity)throw new Error('Saldo insuficiente no lote físico informado.');
      chosen=[[batch,quantity]];
    }else{
      let left=quantity;
      for(const lot of valid){
        if(left<=0)break;
        const take=Math.min(left,lot.remaining_milli);
        if(take>0){chosen.push([lot,take]);left-=take;}
      }
      if(left>untracked)throw new Error('Estoque válido insuficiente: lotes vencidos não podem ser vendidos.');
    }
    for(const [lot,take] of chosen){
      const updated=run('UPDATE product_batches SET remaining_milli=remaining_milli-? WHERE id=? AND remaining_milli>=?',take,lot.id,take);
      if(updated.changes!==1)throw new Error('Concorrência na baixa do lote; tente novamente.');
      run('INSERT INTO sale_batch_allocations(id,sale_id,sale_item_id,batch_id,quantity_milli) VALUES(?,?,?,?,?)',randomUUID(),saleId,saleItemId,lot.id,take);
    }
  }

  function getSale(id){
    const sale=row('SELECT * FROM sales WHERE id=?',id);
    if(!sale)throw new Error('Venda não encontrada.');
    return {...sale,
      items:all('SELECT * FROM sale_items WHERE sale_id=? ORDER BY rowid',id),
      payments:all('SELECT * FROM sale_payments WHERE sale_id=? ORDER BY rowid',id),
      batch_allocations:all('SELECT * FROM sale_batch_allocations WHERE sale_id=? ORDER BY rowid',id)};
  }
  function getCurrentSession(ctx){
    const session=openRow(ctx);
    if(!session)return null;
    return {...session,expected_cash_cents:cashExpected(session),
      movements:all('SELECT * FROM cash_movements WHERE session_id=? ORDER BY created_at DESC,rowid DESC',session.id)};
  }
  function openSession(input,ctx){
    return atomic(db,()=>{
      if(openRow(ctx))throw new Error('Já existe um caixa aberto neste terminal. Feche o turno anterior.');
      const opening=assertCents(input?.openingCashCents??0,'Saldo inicial');
      run("INSERT INTO cash_sessions(id,opened_at,opening_cash_cents,terminal_id,operator_id,status) VALUES(?,?,?,?,?,'open')",
        randomUUID(),now(),opening,terminal(ctx),ctx?.operatorId||null);
      return getCurrentSession(ctx);
    });
  }
  function moveCash(input,ctx){
    return atomic(db,()=>{
      const session=requireOpen(ctx);
      const delta=cashDelta(input?.kind,input?.amountCents);
      recordCash(session,input.kind,delta,assertLabel(input?.note,'Motivo'),null,null,ctx?.operatorId||null);
      return getCurrentSession(ctx);
    });
  }
  function closeSession(input,ctx){
    return atomic(db,()=>{
      const session=requireOpen(ctx);
      const counted=assertCents(input?.countedCashCents,'Dinheiro contado');
      const expected=cashExpected(session);
      run("UPDATE cash_sessions SET status='closed',closed_at=?,counted_cash_cents=?,expected_cash_cents=?,difference_cents=? WHERE id=?",
        now(),counted,expected,counted-expected,session.id);
      return row('SELECT * FROM cash_sessions WHERE id=?',session.id);
    });
  }
  function checkout(input,ctx){
    const draft=validateSaleInput(input);
    const hash=createHash('sha256').update(JSON.stringify({
      items:draft.items,customerId:draft.customerId,discountCents:draft.discountCents,payments:draft.payments
    })).digest('hex');
    return atomic(db,()=>{
      const previous=row('SELECT s.id,s.request_hash,c.terminal_id FROM sales s JOIN cash_sessions c ON c.id=s.session_id WHERE s.idempotency_key=?',draft.key);
      if(previous){
        if(previous.terminal_id!==terminal(ctx))throw new Error('Operação pertence a outro terminal.');
        if(previous.request_hash!==hash)throw new Error('Identificador de venda reutilizado com conteúdo diferente.');
        return getSale(previous.id);
      }
      const session=requireOpen(ctx);
      const {subtotal,promotionDiscount,snapshots}=calculateLines(draft.items);
      if(draft.discountCents>subtotal-promotionDiscount)throw new Error('Desconto não pode ultrapassar o subtotal.');
      const total=subtotal-promotionDiscount-draft.discountCents;
      if(total<=0)throw new Error('Total deve ser positivo.');
      const computed=normalizePayments(draft.payments,total);
      if(computed.payments.some(p=>p.method==='credit')){
        if(!draft.customerId)throw new Error('Venda fiado exige cliente cadastrado.');
        if(!row('SELECT id FROM customers WHERE id=? AND active=1',draft.customerId))throw new Error('Cliente do fiado não encontrado ou inativo.');
      }else if(draft.customerId && !row('SELECT id FROM customers WHERE id=? AND active=1',draft.customerId)){
        throw new Error('Cliente não encontrado ou inativo.');
      }
      const saleId=randomUUID();
      run("INSERT INTO sales(id,idempotency_key,request_hash,session_id,customer_id,subtotal_cents,discount_cents,total_cents,change_cents,operator_id,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,'completed',?)",
              saleId,draft.key,hash,session.id,draft.customerId,subtotal,draft.discountCents+promotionDiscount,total,computed.change_cents,ctx?.operatorId||null,now());
      for(const item of snapshots){
        const saleItemId=randomUUID();
        run('INSERT INTO sale_items(id,sale_id,product_id,name,code,unit,quantity_milli,unit_price_cents,line_total_cents,unit_cost_cents,promotion_discount_cents) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
          saleItemId,saleId,item.id,item.product.name,item.product.code,item.product.unit,item.quantityMilli,
          item.product.sale_price_cents,item.line,item.product.cost_price_cents,item.promoDiscount);
        allocateBatches(item.product,item.quantityMilli,item.batchId,saleId,saleItemId);
        recordStock(item.id,-item.quantityMilli,'sale','Venda '+saleId,saleId);
      }
      for(const payment of computed.payments){
        run('INSERT INTO sale_payments(id,sale_id,method,amount_cents,tendered_cents) VALUES(?,?,?,?,?)',
          randomUUID(),saleId,payment.method,payment.amount_cents,payment.tendered_cents);
        if(payment.method==='cash')recordCash(session,'sale',payment.amount_cents,'Venda '+saleId,saleId,null,ctx?.operatorId||null);
        if(payment.method==='credit'){
          run("INSERT INTO financial_entries(id,type,description,amount_cents,customer_id,sale_id,status,created_at) VALUES(?,'receivable',?,?,?,?,'open',?)",
            randomUUID(),'Venda fiado '+saleId,payment.amount_cents,draft.customerId,saleId,now());
        }
      }
      return getSale(saleId);
    });
  }
  function cancelSale(id,ctx){
    return atomic(db,()=>{
      const session=requireOpen(ctx);
      const sale=getSale(id);
      if(sale.status==='cancelled')throw new Error('Venda já cancelada.');
      if(sale.session_id!==session.id)throw new Error('Somente vendas do turno aberto podem ser canceladas. Para outro turno, utilize procedimento de reembolso.');
      if(row("SELECT COUNT(*) AS n FROM financial_entries WHERE sale_id=? AND status='settled'",id).n)
        throw new Error('Recebimento do fiado já liquidado. Resolva o recebimento antes de cancelar.');
      for(const item of sale.items)recordStock(item.product_id,item.quantity_milli,'sale_cancel','Cancelamento da venda '+id,id);
      for(const allocation of sale.batch_allocations)
        run('UPDATE product_batches SET remaining_milli=remaining_milli+? WHERE id=?',allocation.quantity_milli,allocation.batch_id);
      const cash=sale.payments.filter(p=>p.method==='cash').reduce((sum,p)=>sum+p.amount_cents,0);
      if(cash)recordCash(session,'sale_cancel',-cash,'Estorno local da venda '+id,id,null,ctx?.operatorId||null);
      run("UPDATE financial_entries SET status='cancelled' WHERE sale_id=? AND status='open'",id);
      run("UPDATE sales SET status='cancelled',cancelled_at=? WHERE id=?",now(),id);
      return getSale(id);
    });
  }
  function listSales(ctx){
    if(ctx?.role==='Caixa')return all("SELECT s.* FROM sales s JOIN cash_sessions c ON c.id=s.session_id WHERE c.terminal_id=? ORDER BY s.created_at DESC,s.id DESC",terminal(ctx));
    return all('SELECT * FROM sales ORDER BY created_at DESC,id DESC');
  }
  function listOpenSessions(){
    return all("SELECT s.id,s.terminal_id,s.operator_id,o.name AS operator_name,s.opened_at,s.opening_cash_cents FROM cash_sessions s LEFT JOIN operators o ON o.id=s.operator_id WHERE s.status='open' ORDER BY s.opened_at")
      .map(session=>({...session,expected_cash_cents:cashExpected(session)}));
  }
  function moveStock(input){
    return atomic(db,()=>{
      const delta=inventoryDelta(input?.kind,input?.quantityMilli);
      const reason=assertLabel(input?.reason,'Motivo');
      const id=assertLabel(input?.productId,'Produto',64);
      const p=row('SELECT * FROM products WHERE id=? AND active=1',id);
      if(!p)throw new Error('Produto não encontrado ou desativado.');
      if(p.unit==='UN' && delta%1000!==0)throw new Error('Produto por unidade exige quantidade inteira.');
      recordStock(id,delta,input.kind,reason);
      return row('SELECT * FROM products WHERE id=?',id);
    });
  }
  function listStockMovements(productId=null){
    if(productId!==null)return all('SELECT * FROM stock_movements WHERE product_id=? ORDER BY created_at DESC,rowid DESC',assertLabel(productId,'Produto',64));
    return all('SELECT * FROM stock_movements ORDER BY created_at DESC,rowid DESC');
  }
  function createFinance(input){
    return atomic(db,()=>{
      const detail=financeInput(input),id=randomUUID();
      run("INSERT INTO financial_entries(id,type,description,amount_cents,due_on,status,created_at) VALUES(?,?,?,?,?,'open',?)",
        id,detail.type,detail.description,detail.amountCents,detail.dueOn,now());
      return row('SELECT * FROM financial_entries WHERE id=?',id);
    });
  }
  function settleFinance(input,ctx){
    return atomic(db,()=>{
      const id=assertLabel(input?.id,'Lançamento',64);
      const method=assertChoice(input?.method,methodIds.filter(x=>x!=='credit'),'Forma de quitação');
      const entry=row('SELECT * FROM financial_entries WHERE id=?',id);
      if(!entry)throw new Error('Lançamento não encontrado.');
      if(entry.status!=='open')throw new Error('Conta já liquidada ou cancelada.');
      if(method==='cash'){
        const session=requireOpen(ctx);
        recordCash(session,entry.type==='receivable'?'receivable_paid':'payable_paid',
          entry.type==='receivable'?entry.amount_cents:-entry.amount_cents,entry.description,null,id,ctx?.operatorId||null);
      }
      run("UPDATE financial_entries SET status='settled',method=?,settled_at=? WHERE id=?",method,now(),id);
      return row('SELECT * FROM financial_entries WHERE id=?',id);
    });
  }
  function listFinance(){return all('SELECT * FROM financial_entries ORDER BY created_at DESC,id DESC');}
  function report(){
    const totals=row("SELECT COUNT(*) AS sales_count, COALESCE(SUM(total_cents),0) AS sales_total_cents, COALESCE(SUM(discount_cents),0) AS discounts_cents FROM sales WHERE status='completed'");
    const payments=all("SELECT p.method,SUM(p.amount_cents) AS total FROM sale_payments p JOIN sales s ON s.id=p.sale_id WHERE s.status='completed' GROUP BY p.method");
    const amounts=Object.fromEntries(methodIds.map(id=>[id+'_cents',payments.find(p=>p.method===id)?.total||0]));
    const finance=all("SELECT type,status,COALESCE(SUM(amount_cents),0) AS total FROM financial_entries GROUP BY type,status");
    for(const type of ['payable','receivable'])for(const status of ['open','settled'])
      amounts[type+'s_'+(status==='settled'?'paid':'open')+'_cents']=finance.find(x=>x.type===type&&x.status===status)?.total||0;
    const products=all('SELECT id,name,stock_milli,cost_price_cents FROM products WHERE active=1');
    return {...totals,...amounts,
      inventory_value_cents:products.reduce((sum,p)=>sum+Math.round(p.stock_milli*p.cost_price_cents/1000),0),
      product_count:products.length,low_stock_count:products.filter(p=>p.stock_milli<=0).length,
      cancelled_count:row("SELECT COUNT(*) AS n FROM sales WHERE status='cancelled'").n
    };
  }

  function reportItems(filters={}){
    const status=filters?.status||'completed';
    if(!['completed','cancelled','all'].includes(status))throw new Error('Situação de relatório inválida.');
    const from=filters?.from?strictDate(filters.from,'Data inicial'):null;
    const to=filters?.to?strictDate(filters.to,'Data final'):null;
    if(from&&to&&from>to)throw new Error('Período inválido.');
    const productId=filters?.productId?assertLabel(filters.productId,'Produto',64):null;
    const operatorId=filters?.operatorId?assertLabel(filters.operatorId,'Operador',64):null;
    const sales=all("SELECT s.*,c.terminal_id FROM sales s JOIN cash_sessions c ON c.id=s.session_id ORDER BY s.created_at,s.id");
    if(sales.length>10000)throw new Error('Período muito grande; reduza os filtros do relatório.');
    const rows=[];
    for(const s of sales){
      if(status!=='all'&&s.status!==status)continue;
      const day=s.created_at?.slice(0,10);
      if((from&&day<from)||(to&&day>to)||(operatorId&&s.operator_id!==operatorId))continue;
      const items=all('SELECT * FROM sale_items WHERE sale_id=? ORDER BY rowid',s.id);
      const amount=s.discount_cents;
      const total=items.reduce((sum,x)=>sum+x.line_total_cents,0);
      const discounts=items.map(x=>total>0?Number(BigInt(amount)*BigInt(x.line_total_cents)/BigInt(total)):0);
      let left=amount-discounts.reduce((sum,x)=>sum+x,0);
      const ranking=items.map((x,i)=>({i,rest:total>0?(BigInt(amount)*BigInt(x.line_total_cents))%BigInt(total):0n}));
      ranking.sort((a,b)=>a.rest===b.rest?a.i-b.i:a.rest>b.rest?-1:1);
      for(const x of ranking){if(!left)break;if(discounts[x.i]<items[x.i].line_total_cents){discounts[x.i]++;left--;}}
      if(left)throw new Error('Falha de conciliação de desconto no relatório.');
      const methods=all('SELECT method FROM sale_payments WHERE sale_id=?',s.id);
      const method=methods.length===1?methods[0].method:'mixed_unallocated';
      items.forEach((item,i)=>{
        if(productId&&item.product_id!==productId)return;
        rows.push({sale_id:s.id,product_id:item.product_id,product_name:item.name,code:item.code,
          quantity_milli:item.quantity_milli,unit_price_cents:item.unit_price_cents,
          gross_cents:item.line_total_cents,discount_cents:discounts[i],
          net_cents:item.line_total_cents-discounts[i],status:s.status,payment_method:method,
          customer_id:s.customer_id,operator_id:s.operator_id,terminal_id:s.terminal_id,created_at:s.created_at});
      });
    }
    return {rows,summary:{items_count:rows.length,
      net_total_cents:rows.filter(x=>x.status==='completed').reduce((sum,x)=>sum+x.net_cents,0)}};
  }

  function recordInitialStock(productId,quantityMilli){
    if(!quantityMilli)return;
    run('INSERT INTO stock_movements(id,product_id,delta_milli,kind,reason,created_at) VALUES(?,?,?,?,?,?)',
      randomUUID(),productId,quantityMilli,'opening','Saldo inicial do cadastro',now());
  }
  return {
    openSession,getCurrentSession,closeSession,moveCash,checkout,getSale,cancelSale,listSales,listOpenSessions,
    moveStock,listStockMovements,receiveBatch,listBatches,setPromotion,listPromotions,quoteSale,reportItems,
    createFinance,settleFinance,listFinance,report,recordInitialStock
  };
}
