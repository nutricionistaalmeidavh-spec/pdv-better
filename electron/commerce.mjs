import { randomUUID, createHash } from 'node:crypto';
import {
  assertCents, assertMilli, assertChoice, assertLabel, normalizePayments,
  validateSaleInput, inventoryDelta, cashDelta, financeInput, lineTotalCents, methodIds
} from '../shared/commerce.mjs';
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
export function createCommerce(db){
  createTables(db);
  const row=(sql,...args)=>db.prepare(sql).get(...args);
  const all=(sql,...args)=>db.prepare(sql).all(...args);
  const run=(sql,...args)=>db.prepare(sql).run(...args);
  const openRow=()=>row("SELECT * FROM cash_sessions WHERE status='open'");
  const requireOpen=()=>{
    const session=openRow();
    if(!session)throw new Error('É necessário um caixa aberto para continuar.');
    return session;
  };
  const cashExpected=session=>session.opening_cash_cents+(row('SELECT COALESCE(SUM(delta_cents),0) AS total FROM cash_movements WHERE session_id=?',session.id)?.total||0);
  function recordCash(session,kind,delta,note='',saleId=null,entryId=null){
    if(!delta)return;
    if(cashExpected(session)+delta<0)throw new Error('Saldo de dinheiro insuficiente no caixa.');
    run('INSERT INTO cash_movements(id,session_id,kind,delta_cents,note,sale_id,entry_id,created_at) VALUES(?,?,?,?,?,?,?,?)',
      randomUUID(),session.id,kind,delta,note,saleId,entryId,now());
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
  function getSale(id){
    const sale=row('SELECT * FROM sales WHERE id=?',id);
    if(!sale)throw new Error('Venda não encontrada.');
    return {...sale,
      items:all('SELECT * FROM sale_items WHERE sale_id=? ORDER BY rowid',id),
      payments:all('SELECT * FROM sale_payments WHERE sale_id=? ORDER BY rowid',id)};
  }
  function getCurrentSession(){
    const session=openRow();
    if(!session)return null;
    return {...session,expected_cash_cents:cashExpected(session),
      movements:all('SELECT * FROM cash_movements WHERE session_id=? ORDER BY created_at DESC,rowid DESC',session.id)};
  }
  function openSession(input){
    return atomic(db,()=>{
      if(openRow())throw new Error('Já existe um caixa aberto. Feche o turno anterior.');
      const opening=assertCents(input?.openingCashCents??0,'Saldo inicial');
      run("INSERT INTO cash_sessions(id,opened_at,opening_cash_cents,status) VALUES(?,?,?,'open')",randomUUID(),now(),opening);
      return getCurrentSession();
    });
  }
  function moveCash(input){
    return atomic(db,()=>{
      const session=requireOpen();
      const delta=cashDelta(input?.kind,input?.amountCents);
      recordCash(session,input.kind,delta,assertLabel(input?.note,'Motivo'));
      return getCurrentSession();
    });
  }
  function closeSession(input){
    return atomic(db,()=>{
      const session=requireOpen();
      const counted=assertCents(input?.countedCashCents,'Dinheiro contado');
      const expected=cashExpected(session);
      run("UPDATE cash_sessions SET status='closed',closed_at=?,counted_cash_cents=?,expected_cash_cents=?,difference_cents=? WHERE id=?",
        now(),counted,expected,counted-expected,session.id);
      return row('SELECT * FROM cash_sessions WHERE id=?',session.id);
    });
  }
  function checkout(input){
    const draft=validateSaleInput(input);
    const hash=createHash('sha256').update(JSON.stringify({
      items:draft.items,customerId:draft.customerId,discountCents:draft.discountCents,payments:draft.payments
    })).digest('hex');
    return atomic(db,()=>{
      const previous=row('SELECT id,request_hash FROM sales WHERE idempotency_key=?',draft.key);
      if(previous){
        if(previous.request_hash!==hash)throw new Error('Identificador de venda reutilizado com conteúdo diferente.');
        return getSale(previous.id);
      }
      const session=requireOpen();
      let subtotal=0;
      const snapshots=draft.items.map(item=>{
        const product=row('SELECT * FROM products WHERE id=? AND active=1',item.id);
        if(!product)throw new Error('Produto inativo ou não encontrado.');
        if(product.unit==='UN' && item.quantityMilli%1000!==0)throw new Error('Produto por unidade exige quantidade inteira.');
        if(product.stock_milli<item.quantityMilli)throw new Error('Estoque insuficiente: '+product.name);
        const line=lineTotalCents(product.sale_price_cents,item.quantityMilli);
        subtotal+=line;
        if(!Number.isSafeInteger(subtotal))throw new Error('Total da venda excede o limite.');
        return {...item,product,line};
      });
      if(draft.discountCents>subtotal)throw new Error('Desconto não pode ultrapassar o subtotal.');
      const total=subtotal-draft.discountCents;
      if(total<=0)throw new Error('Total deve ser positivo.');
      const computed=normalizePayments(draft.payments,total);
      if(computed.payments.some(p=>p.method==='credit')){
        if(!draft.customerId)throw new Error('Venda fiado exige cliente cadastrado.');
        if(!row('SELECT id FROM customers WHERE id=? AND active=1',draft.customerId))throw new Error('Cliente do fiado não encontrado ou inativo.');
      }else if(draft.customerId && !row('SELECT id FROM customers WHERE id=? AND active=1',draft.customerId)){
        throw new Error('Cliente não encontrado ou inativo.');
      }
      const saleId=randomUUID();
      run("INSERT INTO sales(id,idempotency_key,request_hash,session_id,customer_id,subtotal_cents,discount_cents,total_cents,change_cents,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,'completed',?)",
        saleId,draft.key,hash,session.id,draft.customerId,subtotal,draft.discountCents,total,computed.change_cents,now());
      for(const item of snapshots){
        run('INSERT INTO sale_items(id,sale_id,product_id,name,code,unit,quantity_milli,unit_price_cents,line_total_cents,unit_cost_cents) VALUES(?,?,?,?,?,?,?,?,?,?)',
          randomUUID(),saleId,item.id,item.product.name,item.product.code,item.product.unit,item.quantityMilli,
          item.product.sale_price_cents,item.line,item.product.cost_price_cents);
        recordStock(item.id,-item.quantityMilli,'sale','Venda '+saleId,saleId);
      }
      for(const payment of computed.payments){
        run('INSERT INTO sale_payments(id,sale_id,method,amount_cents,tendered_cents) VALUES(?,?,?,?,?)',
          randomUUID(),saleId,payment.method,payment.amount_cents,payment.tendered_cents);
        if(payment.method==='cash')recordCash(session,'sale',payment.amount_cents,'Venda '+saleId,saleId);
        if(payment.method==='credit'){
          run("INSERT INTO financial_entries(id,type,description,amount_cents,customer_id,sale_id,status,created_at) VALUES(?,'receivable',?,?,?,?,'open',?)",
            randomUUID(),'Venda fiado '+saleId,payment.amount_cents,draft.customerId,saleId,now());
        }
      }
      return getSale(saleId);
    });
  }
  function cancelSale(id){
    return atomic(db,()=>{
      const session=requireOpen();
      const sale=getSale(id);
      if(sale.status==='cancelled')throw new Error('Venda já cancelada.');
      if(sale.session_id!==session.id)throw new Error('Somente vendas do turno aberto podem ser canceladas. Para outro turno, utilize procedimento de reembolso.');
      if(row("SELECT COUNT(*) AS n FROM financial_entries WHERE sale_id=? AND status='settled'",id).n)
        throw new Error('Recebimento do fiado já liquidado. Resolva o recebimento antes de cancelar.');
      for(const item of sale.items)recordStock(item.product_id,item.quantity_milli,'sale_cancel','Cancelamento da venda '+id,id);
      const cash=sale.payments.filter(p=>p.method==='cash').reduce((sum,p)=>sum+p.amount_cents,0);
      if(cash)recordCash(session,'sale_cancel',-cash,'Estorno local da venda '+id,id);
      run("UPDATE financial_entries SET status='cancelled' WHERE sale_id=? AND status='open'",id);
      run("UPDATE sales SET status='cancelled',cancelled_at=? WHERE id=?",now(),id);
      return getSale(id);
    });
  }
  function listSales(){return all('SELECT * FROM sales ORDER BY created_at DESC,id DESC');}
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
  function settleFinance(input){
    return atomic(db,()=>{
      const id=assertLabel(input?.id,'Lançamento',64);
      const method=assertChoice(input?.method,methodIds.filter(x=>x!=='credit'),'Forma de quitação');
      const entry=row('SELECT * FROM financial_entries WHERE id=?',id);
      if(!entry)throw new Error('Lançamento não encontrado.');
      if(entry.status!=='open')throw new Error('Conta já liquidada ou cancelada.');
      if(method==='cash'){
        const session=requireOpen();
        recordCash(session,entry.type==='receivable'?'receivable_paid':'payable_paid',
          entry.type==='receivable'?entry.amount_cents:-entry.amount_cents,entry.description,null,id);
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
  function recordInitialStock(productId,quantityMilli){
    if(!quantityMilli)return;
    run('INSERT INTO stock_movements(id,product_id,delta_milli,kind,reason,created_at) VALUES(?,?,?,?,?,?)',
      randomUUID(),productId,quantityMilli,'opening','Saldo inicial do cadastro',now());
  }
  return {
    openSession,getCurrentSession,closeSession,moveCash,checkout,getSale,cancelSale,listSales,
    moveStock,listStockMovements,createFinance,settleFinance,listFinance,report,recordInitialStock
  };
}
