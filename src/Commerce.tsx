import React,{useEffect,useState} from 'react';
import { Plus,Check,AlertTriangle,ShoppingCart,Package,Wallet,ClipboardList,RotateCcw,Receipt,ArrowDownToLine,ArrowUpFromLine } from 'lucide-react';
import { money,parseFixed } from '../shared/domain.mjs';
import { reportRows } from '../shared/report.mjs';
import { paymentPreview } from '../shared/payment-preview.mjs';
import { paymentMethods, cashMovementKinds, inventoryKinds, financeTypes, commerceLabels } from '../shared/contract.mjs';
import { SaleReceipt } from './Receipt';
type R=Record<string,any>;
const methodLabel=(id:string)=>paymentMethods.find(x=>x.id===id)?.label||id;
const errorMessage=(error:any)=>String(error?.message||error||'Não foi possível concluir').replace(/^Error invoking remote method.*?: Error: /,'');
const pretty=(timestamp:string)=>timestamp?new Date(timestamp).toLocaleString('pt-BR'):'—';
const statusText:Record<string,string>={...commerceLabels.status,...commerceLabels.finance};
function Message({error,success}:{error:string;success:string}){
  return <>{error && <div className="notice danger" role="alert"><AlertTriangle size={17}/>{error}</div>}{success && <div className="notice success" role="status"><Check size={17}/>{success}</div>}</>;
}
export function PaymentModal({cart,products,customers,onClose,onDone}:{
  cart:any[];products:R[];customers:R[];onClose:()=>void;onDone:(sale:R)=>void;
}){
  const subtotal=cart.reduce((sum,row)=>sum+Math.round(row.priceCents*row.quantityMilli/1000),0);
  const [discount,setDiscount]=useState('0,00');
  const [customerId,setCustomerId]=useState('');
  const [payments,setPayments]=useState([{method:'cash',amount:'0,00'}]);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const [operationKey]=useState(()=>crypto.randomUUID());
  const [quote,setQuote]=useState<R|null>(null);
  const [quoteError,setQuoteError]=useState('');
  const [batches,setBatches]=useState<R[]>([]);
  const [selectedBatches,setSelectedBatches]=useState<Record<string,string>>({});
  useEffect(()=>{let mounted=true;
    window.pdv?.batchesList().then(rows=>{if(mounted)setBatches(rows);}).catch(()=>{});
    return ()=>{mounted=false;};
  },[]);
  let discountCents=0,total=subtotal,discountError='';
  try{
    discountCents=parseFixed(discount,2,'Desconto');
    if(discountCents>=subtotal)throw new Error('Desconto deve ser menor que o subtotal.');
    total=subtotal-discountCents;
  }catch(err){discountError=errorMessage(err);}
  useEffect(()=>{let mounted=true;
    if(discountError){setQuote(null);setQuoteError(discountError);return ()=>{mounted=false;};}
    setQuote(null);setQuoteError('');
    window.pdv?.quoteSale({items:cart.map(row=>({id:row.id,quantityMilli:row.quantityMilli,batchId:selectedBatches[row.id]||undefined})),discountCents})
      .then(result=>{if(mounted){setQuote(result);setQuoteError('');}})
      .catch(err=>{if(mounted){setQuoteError(errorMessage(err));setQuote(null);}});
    return ()=>{mounted=false;};
  },[cart,discountCents,discountError]);
  total=quote?.total_cents??total;
  const payment=paymentPreview(total,payments);
  const updatePayment=(i:number,key:string,value:string)=>setPayments(rows=>rows.map((r,index)=>i===index?{...r,[key]:value}:r));
  const send=async(ev:React.FormEvent)=>{
    ev.preventDefault();if(pending || !window.pdv)return;
    if(discountError || quoteError || !quote || !payment.canSubmit){setError(discountError || quoteError || payment.error || 'Aguarde a cotação e confira os pagamentos.');return;}
    setPending(true);setError('');
    try{
      const result=await window.pdv.checkout({
        key:operationKey,
        items:cart.map(row=>({id:row.id,quantityMilli:row.quantityMilli})),
        customerId:customerId||null,discountCents,
        payments:payments.map(p=>({method:p.method,amountCents:parseFixed(p.amount,2,'Pagamento')}))
      });
      onDone(result);
    }catch(err){setError(errorMessage(err));}
    finally{setPending(false);}
  };
  return <div className="modal-backdrop" role="presentation">
    <section className="dialog commerce-dialog glass-payment" role="dialog" aria-modal="true" aria-label="Receber venda">
      <header className="dialog-head"><div><div className="eyebrow">FECHAMENTO DA VENDA</div><h2>Receber pagamento</h2></div><button className="secondary" disabled={pending} onClick={onClose}>Voltar ao carrinho</button></header>
      <form onSubmit={send} className="dialog-form">
        <div className="form-grid">
          <label className="form-field"><span>Subtotal</span><input value={money(subtotal)} readOnly/></label>
          <label className="form-field"><span>Desconto em reais</span><input value={discount} inputMode="decimal" onChange={e=>setDiscount(e.target.value)}/></label>
          <label className="form-field"><span>Promoções automáticas</span><input value={money(quote?.promotion_discount_cents??0)} readOnly/></label>
          <label className="form-field"><span>Total com desconto</span><input value={money(total)} readOnly/></label>
          <label className="form-field"><span>Cliente (obrigatório para fiado)</span><select value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Consumidor não identificado</option>{customers.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        </div>
        {(discountError||quoteError)&&<div className="form-error" role="alert">{discountError||quoteError}</div>}
        {cart.filter(item=>batches.some(b=>b.product_id===item.id&&b.remaining_milli>0)).map(item=>
          <label key={item.id} className="form-field">Lote físico — {item.name}
            <select aria-label={'Lote físico de '+item.name} value={selectedBatches[item.id]||''} onChange={e=>setSelectedBatches(current=>({...current,[item.id]:e.target.value}))}>
              <option value="">Seleção automática FEFO</option>
              {batches.filter(b=>b.product_id===item.id&&b.remaining_milli>0).map(b=>
                <option key={b.id} value={b.id}>{b.code} — validade {b.expires_on} — saldo {b.remaining_milli/1000}</option>)}
            </select>
          </label>)}
        <div className="payment-inputs"><h3>Formas de pagamento</h3><p>Informe o valor de cada forma. No dinheiro, informe quanto recebeu para calcular o troco.</p>
          {payments.map((p,i)=><div className="payment-row" key={i}>
            <select aria-label={'Forma de pagamento '+(i+1)} value={p.method} onChange={e=>updatePayment(i,'method',e.target.value)}>
              {paymentMethods.map(m=><option key={m.id} value={m.id} disabled={payments.some((x,j)=>j!==i&&x.method===m.id)}>{m.label}</option>)}
            </select>
            <input aria-label={'Valor de pagamento '+(i+1)} inputMode="decimal" placeholder="0,00" value={p.amount} onChange={e=>updatePayment(i,'amount',e.target.value)}/>
            <button className="secondary" type="button" disabled={payments.length===1} onClick={()=>setPayments(rows=>rows.filter((_,j)=>j!==i))}>Remover</button>
          </div>)}
          {payments.length<paymentMethods.length && <button className="plain" type="button" onClick={()=>{
            const next=paymentMethods.find(p=>!payments.some(r=>r.method===p.id));
            if(next)setPayments(rows=>[...rows,{method:next.id,amount:'0,00'}]);
          }}><Plus size={16}/> Dividir pagamento</button>}
          <div className="payment-summary" aria-invalid={!payment.canSubmit && !!payment.error}>
            <div><small>Valor informado</small><strong>{money(payment.paidCents)}</strong></div>
            <div><small>Saldo restante</small><strong className={payment.remainingCents>0?'payment-balance':'payment-ready'}>{money(payment.remainingCents)}</strong></div>
            <div><small>Troco previsto</small><strong>{money(payment.changeCents)}</strong></div>
          </div>
          <p className={'payment-status'+(payment.error?' is-error':'')} role="status" aria-live="polite">
            {payment.canSubmit?'Valores conferidos. Confirme o recebimento externo antes de concluir.':
              payment.remainingCents>0?'Faltam '+money(payment.remainingCents)+' para concluir. '+payment.error:payment.error}
          </p>
          <p className="commerce-warning">Pix e cartão são registrados manualmente. Confirme o recebimento no aplicativo do banco ou na maquininha antes de concluir. Este comprovante não é fiscal.</p>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <footer className="dialog-footer"><button className="secondary" type="button" disabled={pending} onClick={onClose}>Cancelar</button><button className="primary" disabled={pending||!cart.length||total<=0||!!discountError||!!quoteError||!quote||!payment.canSubmit} type="submit">{pending?'Registrando…':'Confirmar e concluir venda'}<Check size={17}/></button></footer>
      </form>
    </section>
  </div>;
}
export function CommerceView({view,onDataChanged,role}:{view:string;onDataChanged:()=>Promise<void>;role:string}){
  const api=window.pdv;
  const [session,setSession]=useState<R|null>(null);
  const [otherSessions,setOtherSessions]=useState<R[]>([]);
  const [sales,setSales]=useState<R[]>([]);
  const [receipt,setReceipt]=useState<R|null>(null);
  const [products,setProducts]=useState<R[]>([]);
  const [movements,setMovements]=useState<R[]>([]);
  const [finance,setFinance]=useState<R[]>([]);
  const [summary,setSummary]=useState<R>({});
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [busy,setBusy]=useState(false);
  const [amount,setAmount]=useState('0,00');
  const [counted,setCounted]=useState('0,00');
  const [kind,setKind]=useState('withdrawal');
  const [reason,setReason]=useState('');
  const [productId,setProductId]=useState('');
  const [stockKind,setStockKind]=useState('receipt');
  const [stockDirection,setStockDirection]=useState('positive');
  const [stockQuantity,setStockQuantity]=useState('1,000');
  const [batchCode,setBatchCode]=useState('');
  const [batchExpires,setBatchExpires]=useState('');
  const [batchQuantity,setBatchQuantity]=useState('1,000');
  const [batches,setBatches]=useState<R[]>([]);
  const [promotionQuantity,setPromotionQuantity]=useState('2');
  const [promotionPrice,setPromotionPrice]=useState('20,00');
  const [promotions,setPromotions]=useState<R[]>([]);
  const [reportFrom,setReportFrom]=useState('');
  const [reportTo,setReportTo]=useState('');
  const [reportProduct,setReportProduct]=useState('');
  const [itemReport,setItemReport]=useState<R|null>(null);
  const [financeType,setFinanceType]=useState('payable');
  const [description,setDescription]=useState('');
  const [dueOn,setDueOn]=useState('');
  const [paymentMethod,setPaymentMethod]=useState('cash');
  async function load(){
    if(!api){setError('Abra pelo aplicativo Electron.');return;}
    try{
      const manager=role!=='Caixa';
      const [s,sl,pr,m,fin,r,other,lots,priceRules]=await Promise.all([
        api.sessionCurrent(),api.salesList(),api.list('products'),manager?api.stockHistory():Promise.resolve([]),
        manager?api.financeList():Promise.resolve([]),manager?api.report():Promise.resolve({}),
        manager?api.sessionsList():Promise.resolve([]),
        manager?api.batchesList():Promise.resolve([]),manager?api.promotionsList():Promise.resolve([])
      ]);
      setSession(s);setSales(sl);setProducts(pr);setMovements(m);setFinance(fin);setSummary(r);setOtherSessions(other);setBatches(lots);setPromotions(priceRules);setError('');
      if(s)setCounted((s.expected_cash_cents/100).toFixed(2));
    }catch(err){setError(errorMessage(err));}
  }
  useEffect(()=>{setSuccess('');void load();},[view]);
  async function action(fn:()=>Promise<any>,message:string,updateProducts=false) {
    if(busy)return;
    setBusy(true);setError('');setSuccess('');
    try{await fn();if(updateProducts)await onDataChanged();await load();setSuccess(message);}
    catch(err){setError(errorMessage(err));}
    finally{setBusy(false);}
  }
  async function exportReport(format:'pdf'|'xlsx'|'csv'){
    if(busy || !api)return;
    setBusy(true);setError('');setSuccess('');
    try{const result=await api.reportExport(format);if(!result.cancelled)setSuccess('Relatório '+format.toUpperCase()+' exportado.');}
    catch(err){setError(errorMessage(err));}finally{setBusy(false);}
  }
  const title:Record<string,string>={cash:'Controle de caixa',sales:'Vendas realizadas',inventory:'Movimentações de estoque',finance:'Financeiro',reports:'Relatórios e indicadores'};
  return <div className="commerce-screen">
    {receipt && <SaleReceipt sale={receipt} onClose={()=>setReceipt(null)}/>}
    <div className="page-heading"><div><div className="eyebrow">MARCO B / OPERAÇÃO LOCAL</div><h1>{title[view]}</h1><p>Registros persistidos no SQLite do estabelecimento.</p></div><button className="secondary" disabled={busy} onClick={()=>void load()}><RotateCcw size={16}/>Atualizar</button></div>
    <Message error={error} success={success}/>
    {view==='cash' && <div className="commerce-columns">
      {role!=='Caixa'&&<div className="panel commerce-section commerce-wide"><h2>Caixas abertos por terminal</h2><p>Cada caixa tem abertura, movimentações, saldo e fechamento independentes. O gerente visualiza os terminais, mas não fecha outro caixa remotamente.</p>
        <div className="commerce-table"><table><thead><tr><th>Terminal</th><th>Operador de abertura</th><th>Aberto em</th><th>Troco inicial</th><th>Saldo previsto</th></tr></thead><tbody>
          {otherSessions.map(x=><tr key={x.id}><td>{x.terminal_id}</td><td>{x.operator_name|| (x.operator_id?'Operador não encontrado':'Turno legado')}</td><td>{pretty(x.opened_at)}</td><td>{money(x.opening_cash_cents)}</td><td>{money(x.expected_cash_cents)}</td></tr>)}
        </tbody></table>{otherSessions.length===0&&<p className="commerce-empty">Nenhum caixa aberto.</p>}</div>
      </div>}
      <div className="panel commerce-section"><h2>{session?'Turno aberto':'Abrir novo caixa'}</h2>
        {session?<><p>Aberto em {pretty(session.opened_at)}</p><div className="total-line"><span>Dinheiro previsto em caixa</span><strong>{money(session.expected_cash_cents)}</strong></div>
          <form className="commerce-form" onSubmit={e=>{e.preventDefault();void action(()=>api!.sessionClose({countedCashCents:counted}), 'Caixa fechado. Consulte a conferência nos relatórios.');}}>
            <label>Dinheiro contado (R$)<input inputMode="decimal" value={counted} onChange={e=>setCounted(e.target.value)}/></label>
            <button disabled={busy} className="primary" type="submit">Conferir e fechar caixa</button>
          </form>
        </>:<form className="commerce-form" onSubmit={e=>{e.preventDefault();void action(()=>api!.sessionOpen({openingCashCents:amount}),'Caixa aberto para vendas.');}}>
          <label>Valor inicial de troco (R$)<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label><button disabled={busy} className="primary" type="submit">Abrir caixa</button>
        </form>}
      </div>
      <div className="panel commerce-section"><h2>Sangria / reforço</h2><p>Movimentações auditáveis em dinheiro, vinculadas ao turno aberto.</p><form className="commerce-form" onSubmit={e=>{e.preventDefault();void action(()=>api!.cashMove({kind,amountCents:amount,note:reason}),'Movimentação de caixa registrada.');}}>
        <label>Operação<select value={kind} onChange={e=>setKind(e.target.value)}>{cashMovementKinds.map(k=><option value={k} key={k}>{commerceLabels.cash[k]}</option>)}</select></label>
        <label>Valor (R$)<input value={amount} inputMode="decimal" onChange={e=>setAmount(e.target.value)}/></label>
        <label>Motivo<input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Descreva o motivo"/></label>
        <button disabled={!session||busy} className="secondary" type="submit">Registrar movimentação</button></form>
        {!session&&<p className="commerce-warning">É necessário abrir o caixa antes de movimentar dinheiro.</p>}
      </div>
      {session&&<div className="panel commerce-section commerce-wide"><h2>Histórico do turno</h2><div className="commerce-table"><table><thead><tr><th>Data</th><th>Operação</th><th>Valor</th><th>Motivo</th></tr></thead><tbody>{session.movements?.map((m:R)=><tr key={m.id}><td>{pretty(m.created_at)}</td><td>{m.kind}</td><td>{money(m.delta_cents)}</td><td>{m.note}</td></tr>)}</tbody></table>{!session.movements?.length&&<p className="commerce-empty">Nenhuma movimentação neste turno.</p>}</div></div>}
    </div>}
    {view==='sales'&&<div className="panel commerce-section"><h2>Histórico de vendas</h2><p>O cancelamento só é permitido no mesmo turno aberto e atualiza os movimentos locais. Estornos de Pix/cartão devem ser realizados externamente.</p><div className="commerce-table"><table><thead><tr><th>Data</th><th>Venda</th><th>Cliente</th><th>Total</th><th>Situação</th><th>Ação</th></tr></thead><tbody>{sales.map(s=><tr key={s.id}><td>{pretty(s.created_at)}</td><td title={s.id}>{s.id.slice(0,8)}</td><td>{s.customer_id?.slice(0,8)||'Consumidor final'}</td><td>{money(s.total_cents)}</td><td>{statusText[s.status]}</td><td><button className="secondary" type="button" disabled={busy} onClick={async()=>{try{setReceipt(await api!.saleGet(s.id));setError('');}catch(err){setError(errorMessage(err));}}}>Comprovante</button> {s.status==='completed'&&<button disabled={busy||session?.id!==s.session_id} className="secondary button-danger" onClick={()=>{
            if(window.confirm('Cancelar venda? Estoque e registros locais serão revertidos. Pix e cartão exigem reembolso externo manual.')) void action(()=>api!.salesCancel(s.id),'Venda cancelada e estoque restaurado.',true);
          }}>Cancelar venda</button>}</td></tr>)}</tbody></table>{sales.length===0&&<p className="commerce-empty">Nenhuma venda foi realizada ainda.</p>}</div></div>}
    {view==='inventory'&&<><div className="panel commerce-section"><h2>Movimentar estoque</h2><p>Entradas e ajustes registrados no histórico. O saldo do cadastro não pode ser alterado diretamente.</p>
      <form className="commerce-inline-form" onSubmit={e=>{e.preventDefault();void action(async()=>{
        const q=parseFixed(stockQuantity,3,'Quantidade');
        const delta=stockDirection==='negative'?-q:q;
        await api!.stockMove({productId,kind:stockKind,quantityMilli:stockKind==='receipt'?q:delta,reason});
      },'Estoque atualizado e movimento auditado.',true);}}>
        <label>Produto<select required value={productId} onChange={e=>setProductId(e.target.value)}><option value="">Selecione</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} — {p.stock_milli/1000} {p.unit}</option>)}</select></label>
        <label>Tipo<select value={stockKind} onChange={e=>setStockKind(e.target.value)}>{inventoryKinds.map(k=><option value={k} key={k}>{commerceLabels.inventory[k]}</option>)}</select></label>
        {stockKind==='adjustment'&&<label>Direção<select value={stockDirection} onChange={e=>setStockDirection(e.target.value)}><option value="positive">Adicionar</option><option value="negative">Retirar</option></select></label>}
        <label>Quantidade<input required inputMode="decimal" value={stockQuantity} onChange={e=>setStockQuantity(e.target.value)}/></label>
        <label>Motivo<input required value={reason} onChange={e=>setReason(e.target.value)} placeholder="Compra, inventário…"/></label>
        <button disabled={busy||!productId} className="primary" type="submit">Registrar estoque</button>
      </form></div>
      <div className="panel commerce-section"><h2>Entrada rastreada por lote</h2><p>O lote registrado passa a ser considerado na ordem FEFO. Etiquetas físicas podem ser escolhidas na venda.</p>
        <form className="commerce-inline-form" onSubmit={e=>{e.preventDefault();void action(()=>api!.batchReceive({
          productId,code:batchCode,expiresOn:batchExpires,quantityMilli:parseFixed(batchQuantity,3,'Quantidade')
        }),'Lote recebido com rastreabilidade e estoque atualizado.',true);}}>
          <label>Produto<select required value={productId} onChange={e=>setProductId(e.target.value)}><option value="">Selecione</option>{products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
          <label>Código do lote<input required value={batchCode} onChange={e=>setBatchCode(e.target.value)} placeholder="Ex.: LOTE-2026-A"/></label>
          <label>Validade<input type="date" required value={batchExpires} onChange={e=>setBatchExpires(e.target.value)}/></label>
          <label>Quantidade<input required inputMode="decimal" value={batchQuantity} onChange={e=>setBatchQuantity(e.target.value)}/></label>
          <button type="submit" className="primary" disabled={busy||!productId}>Receber lote</button>
        </form>
        <div className="commerce-table"><table><thead><tr><th>Produto</th><th>Lote</th><th>Validade</th><th>Saldo</th></tr></thead><tbody>
          {batches.slice(0,300).map(b=><tr key={b.id}><td>{products.find(p=>p.id===b.product_id)?.name||b.product_id.slice(0,8)}</td><td>{b.code}</td><td>{b.expires_on}</td><td>{b.remaining_milli/1000}</td></tr>)}
        </tbody></table>{!batches.length&&<p className="commerce-empty">Nenhum lote registrado.</p>}</div>
      </div>
      <div className="panel commerce-section"><h2>Combos por quantidade</h2><p>Preço promocional automático para produto por unidade. A cotação e a cobrança usam o mesmo cálculo.</p>
        <form className="commerce-inline-form" onSubmit={e=>{e.preventDefault();void action(()=>api!.promotionSet({
          productId,quantityMilli:parseFixed(promotionQuantity,3,'Quantidade'),bundlePriceCents:promotionPrice
        }),'Promoção de quantidade cadastrada.');}}>
          <label>Produto<select required value={productId} onChange={e=>setProductId(e.target.value)}><option value="">Selecione</option>{products.filter(p=>p.unit==='UN').map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
          <label>Quantidade (UN)<input required inputMode="numeric" value={promotionQuantity} onChange={e=>setPromotionQuantity(e.target.value)}/></label>
          <label>Preço do combo (R$)<input required inputMode="decimal" value={promotionPrice} onChange={e=>setPromotionPrice(e.target.value)}/></label>
          <button type="submit" className="primary" disabled={busy||!productId}>Salvar combo</button>
        </form>
        <div className="commerce-table"><table><thead><tr><th>Produto</th><th>Quantidade</th><th>Preço do combo</th></tr></thead><tbody>
        {promotions.map(p=><tr key={p.id}><td>{products.find(x=>x.id===p.product_id)?.name||p.product_id.slice(0,8)}</td><td>{p.quantity_milli/1000} UN</td><td>{money(p.bundle_price_cents)}</td></tr>)}
        </tbody></table></div>
      </div>
      <div className="panel commerce-section"><h2>Histórico de movimentações</h2><div className="commerce-table"><table><thead><tr><th>Data</th><th>Produto</th><th>Origem</th><th>Quantidade</th><th>Motivo</th></tr></thead><tbody>{movements.slice(0,300).map(m=><tr key={m.id}><td>{pretty(m.created_at)}</td><td>{products.find(p=>p.id===m.product_id)?.name||m.product_id.slice(0,8)}</td><td>{m.kind}</td><td>{(m.delta_milli/1000).toLocaleString('pt-BR',{maximumFractionDigits:3})}</td><td>{m.reason}</td></tr>)}</tbody></table>{!movements.length&&<p className="commerce-empty">Nenhuma movimentação encontrada.</p>}</div></div></>}
    {view==='finance'&&<><div className="panel commerce-section"><h2>Novo lançamento</h2><form className="commerce-inline-form" onSubmit={e=>{e.preventDefault();void action(()=>api!.financeCreate({type:financeType,description,amountCents:amount,dueOn}), 'Lançamento registrado.');}}>
      <label>Tipo<select value={financeType} onChange={e=>setFinanceType(e.target.value)}>{financeTypes.map(t=><option value={t} key={t}>{commerceLabels.finance[t]}</option>)}</select></label>
      <label>Descrição<input required value={description} onChange={e=>setDescription(e.target.value)} placeholder="Ex.: aluguel"/></label>
      <label>Valor (R$)<input value={amount} inputMode="decimal" onChange={e=>setAmount(e.target.value)}/></label>
      <label>Vencimento<input type="date" value={dueOn} onChange={e=>setDueOn(e.target.value)}/></label>
      <button disabled={busy} className="primary" type="submit"><Plus size={16}/>Criar lançamento</button></form></div>
      <div className="panel commerce-section"><div className="commerce-heading"><div><h2>Contas a pagar e receber</h2><p>O fiado aparece automaticamente como conta a receber.</p></div><label>Quitação<select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}>{paymentMethods.filter(m=>m.id!=='credit').map(m=><option value={m.id} key={m.id}>{m.label}</option>)}</select></label></div>
        <div className="commerce-table"><table><thead><tr><th>Descrição</th><th>Tipo</th><th>Valor</th><th>Vencimento</th><th>Situação</th><th>Operação</th></tr></thead><tbody>{finance.map(f=><tr key={f.id}><td>{f.description}</td><td>{statusText[f.type]}</td><td>{money(f.amount_cents)}</td><td>{f.due_on||'—'}</td><td>{statusText[f.status]}</td><td>{f.status==='open'&&<button className="secondary" disabled={busy||paymentMethod==='cash'&&!session} onClick={()=>{
          if(window.confirm('Confirmar liquidação via '+methodLabel(paymentMethod)+'?'))void action(()=>api!.financeSettle({id:f.id,method:paymentMethod}), 'Conta liquidada.');
        }}>Liquidar</button>}</td></tr>)}</tbody></table>{!finance.length&&<p className="commerce-empty">Nenhum lançamento financeiro.</p>}</div><p className="commerce-warning">Pagamentos não realizados em dinheiro são registrados manualmente. Nenhuma cobrança é executada em gateways externos.</p></div></>}
    {view==='reports'&&<>
      <div className="commerce-heading">
        <div><h2>Relatório gerencial acumulado</h2><p>Exporte localmente; nenhum dado é enviado a serviços externos.</p></div>
        <div className="report-actions">{(['pdf','csv','xlsx'] as const).map(format=><button key={format} className="secondary" disabled={busy} onClick={()=>void exportReport(format)}>Exportar {format.toUpperCase()}</button>)}</div>
      </div>
      <div className="report-grid">{reportRows(summary).map(row=><div className="stat" key={row.key}><span className="report-label">{row.label}</span><strong className="report-number">{row.type==='money'?money(row.raw):row.value}</strong><span className="stat-bottom">Acumulado local</span></div>)}</div>
      <div className="panel commerce-section"><h2>Relatório detalhado por item vendido</h2>
        <form className="commerce-inline-form" onSubmit={e=>{e.preventDefault();void action(async()=>{setItemReport(await api!.reportItems({
          from:reportFrom||undefined,to:reportTo||undefined,productId:reportProduct||undefined
        }));},'Detalhamento consultado.');}}>
          <label>Início<input type="date" value={reportFrom} onChange={e=>setReportFrom(e.target.value)}/></label>
          <label>Fim<input type="date" value={reportTo} onChange={e=>setReportTo(e.target.value)}/></label>
          <label>Produto<select value={reportProduct} onChange={e=>setReportProduct(e.target.value)}><option value="">Todos os produtos</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <button className="primary" type="submit" disabled={busy}>Consultar itens</button>
        </form>
        {itemReport&&<><p>Itens encontrados: {itemReport.rows?.length||0} · Total líquido: {money(itemReport.summary?.net_total_cents||0)}</p>
          <div className="commerce-table"><table><thead><tr><th>Data</th><th>Produto</th><th>Quantidade</th><th>Bruto</th><th>Desconto</th><th>Líquido</th><th>Pagamento</th></tr></thead><tbody>
            {(itemReport.rows||[]).slice(0,500).map((row:R,i:number)=><tr key={row.sale_id+'-'+row.product_id+'-'+i}>
              <td>{pretty(row.created_at)}</td><td>{row.product_name}</td><td>{row.quantity_milli/1000}</td><td>{money(row.gross_cents)}</td><td>{money(row.discount_cents)}</td><td>{money(row.net_cents)}</td>
              <td>{row.payment_method==='mixed_unallocated'?'Misto: não atribuído por item':methodLabel(row.payment_method)}</td>
            </tr>)}
          </tbody></table>{itemReport.rows?.length>500&&<p>Mostrando os primeiros 500 itens. Refine o período para visualizar os demais.</p>}</div>
        </>}
      </div>
      <div className="info-bar"><AlertTriangle size={19}/><p>Relatório acumulado no banco local. Os valores de Pix e cartão refletem confirmações manuais, não consultas bancárias. Vendas canceladas não integram o faturamento.</p></div>
    </>}
  </div>;
}
