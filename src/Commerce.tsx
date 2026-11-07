import React,{useEffect,useState} from 'react';
import { Plus,Check,AlertTriangle,ShoppingCart,Package,Wallet,ClipboardList,RotateCcw,Receipt,ArrowDownToLine,ArrowUpFromLine } from 'lucide-react';
import { money,parseFixed } from '../shared/domain.mjs';
import { reportRows } from '../shared/report.mjs';
import {reportDailySales,reportPaymentBreakdown} from '../shared/report-analytics.mjs';
import { paymentPreview } from '../shared/payment-preview.mjs';
import { suggestCashierPaymentAmount } from '../shared/cashier.mjs';
import { paymentMethods, cashMovementKinds, inventoryKinds, financeTypes, commerceLabels } from '../shared/contract.mjs';
import {normalizePayments} from '../shared/commerce.mjs';
import { SaleReceipt } from './Receipt';
import {FinanceP2Panel} from './FinanceP2';
import { buildLabeledSaleItems } from '../shared/batch-label.mjs';
type R=Record<string,any>;
const methodLabel=(id:string)=>paymentMethods.find(x=>x.id===id)?.label||id;
const errorMessage=(error:any)=>String(error?.message||error||'Não foi possível concluir').replace(/^Error invoking remote method.*?: Error: /,'');
const pretty=(timestamp:string)=>timestamp?new Date(timestamp).toLocaleString('pt-BR'):'—';
const statusText:Record<string,string>={...commerceLabels.status,...commerceLabels.finance};
function Message({error,success}:{error:string;success:string}){
  return <>{error && <div className="notice danger" role="alert"><AlertTriangle size={17}/>{error}</div>}{success && <div className="notice success" role="status"><Check size={17}/>{success}</div>}</>;
}

/* Gráficos derivados exclusivamente do SQLite; datas seguem o relógio/fuso do PC. */
function ReportCharts({sales,summary}:{sales:R[];summary:R}){
  const daily=reportDailySales(sales);
  const maximum=Math.max(1,...daily.map(day=>day.amount));
  const breakdown=reportPaymentBreakdown(summary);
  const {paymentMethods,recordedPaymentCents,creditSaleCents,openReceivablesCents,differenceCents}=breakdown;
  let at=0;
  const slices=paymentMethods.filter(row=>row.amount>0).map(row=>{
    const start=at;at+=row.amount/recordedPaymentCents*100;
    return row.color+' '+start.toFixed(3)+'% '+at.toFixed(3)+'%';
  });
  const gradient=recordedPaymentCents>0
    ?'conic-gradient('+slices.join(', ')+')'
    :'conic-gradient(#dce9f8 0% 100%)';
  return <div className="super-report-charts">
    <section className="super-report-chart-panel" aria-label="Vendas por dia">
      <h3>Vendas nos últimos 7 dias</h3>
      <p>Datas do computador. Vendas concluídas, sem treinamento nem cancelamentos.</p>
      <div className="super-report-bars">
        {daily.map(day=><div className="super-report-bar-column" key={day.key}
          title={day.label+' — '+money(day.amount)}>
          <span className="super-report-bar-value">{day.amount?money(day.amount):'—'}</span>
          <div className="super-report-bar-track"><span className="super-report-bar-fill"
            style={{height:day.amount?Math.max(5,day.amount/maximum*100)+'%':'0%'}}/></div>
          <small>{day.label}</small>
        </div>)}
      </div>
    </section>
    <section className="super-report-chart-panel" aria-label="Pagamentos registrados por forma">
      <h3>Meios de pagamento registrados</h3>
      <p>Acumulado desde o início. Pix/cartão são confirmados manualmente, sem conciliação bancária.</p>
      <div className="super-report-payment-chart">
        <div className="super-report-donut" style={{background:gradient}}
          aria-label={'Pagamentos registrados nas vendas, excluindo fiado: '+money(recordedPaymentCents)}>
          <div><strong>{money(recordedPaymentCents)}</strong><span>Sem fiado</span></div>
        </div>
        <div className="super-report-legend">
          {paymentMethods.map(row=><div key={row.name}>
            <i style={{background:row.color}} aria-hidden="true"/>
            <span>{row.name}</span><strong>{money(row.amount)}</strong>
          </div>)}
        </div>
      </div>
      <div className="super-report-payment-facts">
        <div><span>Fiado originado nas vendas</span><strong>{money(creditSaleCents)}</strong>
          <small>Não é pagamento recebido</small></div>
        <div><span>Contas a receber em aberto</span><strong>{money(openReceivablesCents)}</strong>
          <small>Inclui fiado e lançamentos financeiros avulsos</small></div>
      </div>
      {differenceCents!==0&&<p className="super-report-reconcile-error" role="alert">
        Atenção: divergência de {money(Math.abs(differenceCents))} entre vendas concluídas e
        formas de pagamento/fiado. Confira os registros.
      </p>}
    </section>
  </div>;
}

export function PaymentModal({cart,products,customers,role,onClose,onDone,onCustomerSaved,initialMethod='cash',initialFocus}:{
  cart:any[];products:R[];customers:R[];role:string;onClose:()=>void;onDone:(sale:R)=>void;onCustomerSaved:()=>Promise<void>;
  initialMethod?:'cash'|'pix'|'card';initialFocus?:'customer'|'discount';
}){
  const subtotal=cart.reduce((sum,row)=>sum+Math.round(row.priceCents*row.quantityMilli/1000),0);
  const [discount,setDiscount]=useState('0,00');
  const [customerId,setCustomerId]=useState('');
  const [newCustomerName,setNewCustomerName]=useState('');
  const [extraCustomers,setExtraCustomers]=useState<R[]>([]);
  const [customerBusy,setCustomerBusy]=useState(false);
  const [payments,setPayments]=useState<Array<{method:string;amount:string}>>([{method:initialMethod,amount:'0,00'}]);
  const [initialAmountFilled,setInitialAmountFilled]=useState(false);
  const [itemMethods,setItemMethods]=useState<Record<string,string>>({});
  const [splitByQuantity,setSplitByQuantity]=useState(false);
  const [splitQuantities,setSplitQuantities]=useState<Record<string,string>>({});
  const [training,setTraining]=useState(false);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const [operationKey]=useState(()=>crypto.randomUUID());
  const [quote,setQuote]=useState<R|null>(null);
  const [quoteError,setQuoteError]=useState('');
  const [batches,setBatches]=useState<R[]>([]);
  const [selectedBatches,setSelectedBatches]=useState<Record<string,string>>(()=>
    Object.fromEntries(cart.filter(row=>row.batchId).map(row=>[row.id,row.batchId])));
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
    window.pdv?.quoteSale({items:buildLabeledSaleItems(cart,selectedBatches),discountCents})
      .then(result=>{if(mounted){setQuote(result);setQuoteError('');}})
      .catch(err=>{if(mounted){setQuoteError(errorMessage(err));setQuote(null);}});
    return ()=>{mounted=false;};
  },[cart,discountCents,discountError,selectedBatches]);
  total=quote?.total_cents??total;
  // Apenas sugere o valor após a cotação real (promoções/FEFO). Nunca confirma cobrança.
  useEffect(()=>{
    if(!quote||initialAmountFilled)return;
    setPayments(rows=>rows.map((row,i)=>i===0?{...row,amount:suggestCashierPaymentAmount(row.amount,quote.total_cents)}:row));
    setInitialAmountFilled(true);
  },[quote?.total_cents,initialAmountFilled]);
  useEffect(()=>{
    const onKey=(ev:KeyboardEvent)=>{
      if(ev.key==='Escape'&&!pending){ev.preventDefault();onClose();}
    };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[pending,onClose]);
  const payment=paymentPreview(total,payments);
  const selectedAssignments=Object.values(itemMethods).filter(Boolean).length;
  const explicitItems=quote?.lines||[];
  const fullAssignment=selectedAssignments>0&&explicitItems.every((line:R)=>!!itemMethods[line.product_id]);
  let splitAssignments:R[]=[];
  let splitError='';
  if(splitByQuantity&&quote&&payments.length>1){
    try{
      for(const line of explicitItems){
        const lineQty=cart.find(x=>x.id===line.product_id)?.quantityMilli;
        if(!Number.isSafeInteger(lineQty)||lineQty<=0)throw new Error('Produto sem quantidade válida.');
        const quantities=payments.map(p=>({
          method:p.method,
          quantityMilli:splitQuantities[line.product_id+':'+p.method]
            ?parseFixed(splitQuantities[line.product_id+':'+p.method],3,'Quantidade')
            :0
        })).filter(x=>x.quantityMilli>0);
        if(quantities.reduce((sum,x)=>sum+x.quantityMilli,0)!==lineQty)
          throw new Error('Distribua toda a quantidade de '+(cart.find(x=>x.id===line.product_id)?.name||'cada produto')+' entre os meios de pagamento.');
        let balance=line.net_cents;
        for(let i=0;i<quantities.length;i++){
          const qty=quantities[i];
          const cents=i===quantities.length-1?balance:Math.round(line.net_cents*qty.quantityMilli/lineQty);
          balance-=cents;
          if(cents<=0)throw new Error('A divisão gera uma parcela sem valor. Ajuste as quantidades.');
          splitAssignments.push({productId:line.product_id,method:qty.method,quantityMilli:qty.quantityMilli,amountCents:cents});
        }
      }
      if(payment.canSubmit){
        const normalized=normalizePayments(payments.map(p=>({method:p.method,amountCents:parseFixed(p.amount,2,'Pagamento')})),total);
        for(const p of normalized.payments){
          if(splitAssignments.filter(x=>x.method===p.method).reduce((sum,x)=>sum+x.amountCents,0)!==p.amount_cents)
            throw new Error('Quantidades distribuídas não conciliam com o valor de '+methodLabel(p.method)+'.');
        }
      }
    }catch(err){splitAssignments=[];splitError=errorMessage(err);}
  }
  const assignmentError=splitByQuantity?splitError:
    selectedAssignments>0&&!fullAssignment
      ?'Atribua uma forma de pagamento a todos os produtos ou remova as atribuições.'
      :fullAssignment&&explicitItems.some((line:R)=>!payments.some(p=>p.method===itemMethods[line.product_id]))
        ?'A forma atribuída deve estar entre os pagamentos informados.':'';

  const createQuickCustomer=async()=>{
    if(!newCustomerName.trim()||!window.pdv||pending||customerBusy)return;
    setCustomerBusy(true);setError('');
    try{
      const customer=await window.pdv.save('customers',{name:newCustomerName.trim()});
      setExtraCustomers(current=>[...current,customer]);setCustomerId(customer.id);setNewCustomerName('');
      await onCustomerSaved();
    }catch(err){setError(errorMessage(err));}
    finally{setCustomerBusy(false);}
  };
  const updatePayment=(i:number,key:string,value:string)=>setPayments(rows=>rows.map((r,index)=>i===index?{...r,[key]:value}:r));
  const send=async(ev:React.FormEvent)=>{
    ev.preventDefault();if(pending || customerBusy || !window.pdv)return;
    if(discountError || quoteError || assignmentError || !quote || !payment.canSubmit){setError(discountError || quoteError || assignmentError || payment.error || 'Aguarde a cotação e confira os pagamentos.');return;}
    setPending(true);setError('');
    try{
      const result=await window.pdv.checkout({
        key:operationKey,
        items:buildLabeledSaleItems(cart,selectedBatches),
        customerId:customerId||null,discountCents,training,
        payments:payments.map(p=>({method:p.method,amountCents:parseFixed(p.amount,2,'Pagamento')})),
        ...(splitByQuantity?{itemPayments:splitAssignments}:fullAssignment?{itemPayments:explicitItems.map((line:R)=>({
          productId:line.product_id,method:itemMethods[line.product_id],amountCents:line.net_cents
        }))}:{})
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
          <label className="form-field"><span>Desconto em reais</span><input autoFocus={initialFocus==='discount'} value={discount} inputMode="decimal" onChange={e=>setDiscount(e.target.value)}/></label>
          <label className="form-field"><span>Promoções automáticas</span><input value={money(quote?.promotion_discount_cents??0)} readOnly/></label>
          <label className="form-field"><span>Total com desconto</span><input value={money(total)} readOnly/></label>
          {role!=='Caixa'&&<label className="form-field">
            <span>Venda de treinamento — simulação sem estoque, caixa ou faturamento</span>
            <input type="checkbox" checked={training} onChange={e=>setTraining(e.target.checked)}/>
          </label>}
          <label className="form-field"><span>Cliente (obrigatório para fiado)</span><select autoFocus={initialFocus==='customer'} value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Consumidor não identificado</option>{[...customers,...extraCustomers.filter(r=>!customers.some(item=>item.id===r.id))].map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        </div>
        <div className="payment-inputs"><h3>Cadastro rápido de cliente</h3>
          <p>Não encontrou o cliente? Cadastre sem perder o carrinho nem os valores informados.</p>
          <div className="payment-row">
            <input aria-label="Nome do novo cliente" maxLength={120} placeholder="Nome do cliente" value={newCustomerName}
              onChange={e=>setNewCustomerName(e.target.value)}/>
            <button type="button" className="secondary" disabled={customerBusy||pending||!newCustomerName.trim()}
              onClick={()=>void createQuickCustomer()}>{customerBusy?'Cadastrando…':'Cadastrar cliente'}</button>
          </div>
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
        {payments.length>1&&quote&&<div className="payment-inputs">
          <h3>Pagamento por produto (opcional)</h3>
          <label className="form-field">Dividir quantidade do produto entre meios de pagamento
            <input type="checkbox" checked={splitByQuantity} onChange={e=>setSplitByQuantity(e.target.checked)}/>
          </label>
          <p>{splitByQuantity
            ?'Informe as quantidades de cada produto por meio. O total das quantidades deve ser exato e os valores devem conciliar com cada pagamento.'
            :'Atribua um meio por produto. Para distribuir unidades do mesmo produto em meios diferentes, ative a divisão por quantidade.'}</p>
          {splitByQuantity?explicitItems.map((line:R)=><div key={line.product_id} className="form-grid">
            <strong>{cart.find(x=>x.id===line.product_id)?.name||'Produto'} — {(cart.find(x=>x.id===line.product_id)?.quantityMilli||0)/1000} unidades/kg — {money(line.net_cents)}</strong>
            {payments.map(p=><label key={p.method} className="form-field">Quantidade em {methodLabel(p.method)}
              <input inputMode="decimal" placeholder="0,000" aria-label={'Quantidade de '+line.product_id+' em '+p.method}
                value={splitQuantities[line.product_id+':'+p.method]||''}
                onChange={e=>setSplitQuantities(current=>({...current,[line.product_id+':'+p.method]:e.target.value}))}/>
            </label>)}
          </div>):explicitItems.map((line:R)=><label key={line.product_id} className="form-field">
            {cart.find(row=>row.id===line.product_id)?.name||'Produto'} — líquido {money(line.net_cents)}
            <select aria-label={'Forma de pagamento do produto '+(cart.find(row=>row.id===line.product_id)?.name||line.product_id)}
              value={itemMethods[line.product_id]||''}
              onChange={e=>setItemMethods(old=>({...old,[line.product_id]:e.target.value}))}>
              <option value="">Não atribuir por item</option>
              {payments.map(p=><option key={p.method} value={p.method}>{methodLabel(p.method)}</option>)}
            </select>
          </label>)}
          {assignmentError&&<p className="form-error" role="alert">{assignmentError}</p>}
        </div>}
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
          {training&&<p role="status" className="commerce-warning">SIMULAÇÃO: nenhuma cobrança será registrada no caixa, nenhum estoque será baixado e nenhum fiado será lançado.</p>}
          <p className="commerce-warning">Pix e cartão são registrados manualmente. Confirme o recebimento no aplicativo do banco ou na maquininha antes de concluir. Este comprovante não é fiscal.</p>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <footer className="dialog-footer"><button className="secondary" type="button" disabled={pending} onClick={onClose}>Cancelar</button><button className="primary" disabled={pending||customerBusy||!cart.length||total<=0||!!discountError||!!quoteError||!!assignmentError||!quote||!payment.canSubmit} type="submit">{pending?'Registrando…':training?'Registrar simulação sem movimento real':'Confirmar e concluir venda'}<Check size={17}/></button></footer>
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
  const [categories,setCategories]=useState<R[]>([]);
  const [movements,setMovements]=useState<R[]>([]);
  const [finance,setFinance]=useState<R[]>([]);
  const [settleAmounts,setSettleAmounts]=useState<Record<string,string>>({});
  const [suppliers,setSuppliers]=useState<R[]>([]);
  const [purchases,setPurchases]=useState<R[]>([]);
  const [purchaseSupplier,setPurchaseSupplier]=useState('');
  const [purchaseProduct,setPurchaseProduct]=useState('');
  const [purchaseQty,setPurchaseQty]=useState('1');
  const [purchaseCost,setPurchaseCost]=useState('0,00');
  const [purchaseLines,setPurchaseLines]=useState<R[]>([]);
  const [purchaseDoc,setPurchaseDoc]=useState('');
  const [purchaseDue,setPurchaseDue]=useState('');
  const [summary,setSummary]=useState<R>({});
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [busy,setBusy]=useState(false);
  const [amount,setAmount]=useState('0,00');
  const [methodCounts,setMethodCounts]=useState<Record<string,string>>({cash:'',pix:'',card_credit:'',card_debit:'',card:''});
  const [closeReview,setCloseReview]=useState(false);
  const [managerOperators,setManagerOperators]=useState<R[]>([]);
  const [managerSelection,setManagerSelection]=useState('');
  const [managerPassword,setManagerPassword]=useState('');
  const [lastClose,setLastClose]=useState<R|null>(null);
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
  const [bundles,setBundles]=useState<R[]>([]);
  const [bundleName,setBundleName]=useState('');
  const [bundleA,setBundleA]=useState('');
  const [bundleB,setBundleB]=useState('');
  const [bundleQtyA,setBundleQtyA]=useState('1,000');
  const [bundleQtyB,setBundleQtyB]=useState('1,000');
  const [bundlePrice,setBundlePrice]=useState('20,00');
  const [compareFrom,setCompareFrom]=useState('');
  const [compareTo,setCompareTo]=useState('');
  const [compareNextFrom,setCompareNextFrom]=useState('');
  const [compareNextTo,setCompareNextTo]=useState('');
  const [comparison,setComparison]=useState<R|null>(null);
  const [reportFrom,setReportFrom]=useState('');
  const [reportTo,setReportTo]=useState('');
  const [reportProduct,setReportProduct]=useState('');
  const [reportBrand,setReportBrand]=useState('');
  const [reportProducer,setReportProducer]=useState('');
  const [reportVariant,setReportVariant]=useState('');
  const [reportTraining,setReportTraining]=useState<'exclude'|'only'|'include'>('exclude');
  const [itemReport,setItemReport]=useState<R|null>(null);
  const [reportItemVisibleCount,setReportItemVisibleCount]=useState(250);
  const [financeType,setFinanceType]=useState('payable');
  const [financeCategory,setFinanceCategory]=useState('');
  const [description,setDescription]=useState('');
  const [dueOn,setDueOn]=useState('');
  const [paymentMethod,setPaymentMethod]=useState('cash');
  async function load(){
    if(!api){setError('Abra pelo aplicativo Electron.');return;}
    try{
      const manager=role!=='Caixa';
      const [s,sl,pr,m,fin,r,other,lots,priceRules,groupRules,who,sp,purchasesNow,cats]=await Promise.all([
        api.sessionCurrent(),api.salesList(),api.list('products'),manager?api.stockHistory():Promise.resolve([]),
        manager?api.financeList():Promise.resolve([]),manager?api.report():Promise.resolve({}),
        manager?api.sessionsList():Promise.resolve([]),
        manager?api.batchesList():Promise.resolve([]),manager?api.promotionsList():Promise.resolve([]),manager?api.bundleList():Promise.resolve([]),
        api.authStatus(),manager?api.list('suppliers'):Promise.resolve([]),manager?api.purchaseList():Promise.resolve([]),
        manager?api.list('categories'):Promise.resolve([])
      ]);
      setSession(s);setSales(sl);setProducts(pr);setMovements(m);setFinance(fin);setSummary(r);setOtherSessions(other);setBatches(lots);setPromotions(priceRules);setBundles(groupRules);setError('');
      setSuppliers(sp);setPurchases(purchasesNow);setCategories(cats);setSettleAmounts({});
      const possibleManagers=(who.operators||[]).filter((x:R)=>x.role==='Administrador'||x.role==='Gerente');
      setManagerOperators(possibleManagers);
      setManagerSelection(current=>current||possibleManagers[0]?.id||'');
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
  async function exportItemReport(format:'pdf'|'xlsx'|'csv'){
    if(busy||!api)return;
    setBusy(true);setError('');setSuccess('');
    try{
      const result=await api.reportItemsExport({format,filters:{
        from:reportFrom||undefined,to:reportTo||undefined,productId:reportProduct||undefined,
        brand:reportBrand||undefined,producer:reportProducer||undefined,variantGroup:reportVariant||undefined,training:reportTraining
      }});
      if(!result.cancelled)setSuccess('Relatório por item '+format.toUpperCase()+' exportado com os filtros selecionados.');
    }catch(err){setError(errorMessage(err));}
    finally{setBusy(false);}
  }
  const title:Record<string,string>={cash:'Controle de caixa',sales:'Vendas realizadas',inventory:'Movimentações de estoque',purchases:'Compras e fornecedores',finance:'Financeiro',reports:'Relatórios e indicadores'};
  return <div className="commerce-screen">
    {receipt && <SaleReceipt sale={receipt} onClose={()=>setReceipt(null)}/>}
    <div className="page-heading"><div><div className="eyebrow">MARCO B / OPERAÇÃO LOCAL</div><h1>{title[view]}</h1><p>Registros persistidos no SQLite do estabelecimento.</p></div><button className="secondary" disabled={busy} onClick={()=>void load()}><RotateCcw size={16}/>Atualizar</button></div>
    <Message error={error} success={success}/>
    {closeReview&&<div className="modal-backdrop" role="presentation"><section className="dialog commerce-dialog glass-payment" role="dialog" aria-modal="true" aria-label="Confirmar fechamento de caixa">
      <header className="dialog-head"><h2>Revisar fechamento cego</h2></header>
      <p>Confira os valores informados. As diferenças serão registradas por meio de pagamento; nenhuma cobrança externa é realizada.</p>
      <div className="commerce-table"><table><thead><tr><th>Meio</th><th>Valor informado</th></tr></thead><tbody>
        {['cash','pix','card_credit','card_debit','card'].map(id=><tr key={id}><td>{methodLabel(id)}</td><td>{methodCounts[id]}</td></tr>)}
      </tbody></table></div>
      <label className="form-field">Gerente que autoriza
        <select required value={managerSelection} onChange={e=>setManagerSelection(e.target.value)}>
          {managerOperators.map(o=><option key={o.id} value={o.id}>{o.name} — {o.role}</option>)}
        </select>
      </label>
      <label className="form-field">Senha do gerente
        <input required type="password" autoComplete="off" value={managerPassword} onChange={e=>setManagerPassword(e.target.value)}/>
      </label>
      {error&&<p role="alert" className="form-error">{error}</p>}
      <footer className="dialog-footer">
        <button className="secondary" type="button" disabled={busy} onClick={()=>{setCloseReview(false);setManagerPassword('');}}>Voltar à contagem</button>
        <button className="primary" type="button" disabled={busy||!managerPassword||!managerSelection}
          onClick={()=>void action(async()=>{
            const counts=Object.fromEntries(Object.entries(methodCounts).map(([key,value])=>[key,parseFixed(value,2,'Conferência '+key)]));
            const closed=await api!.sessionClose({counts,managerApproval:{operatorId:managerSelection,password:managerPassword}});
            setLastClose(closed);setCloseReview(false);setManagerPassword('');
          },'Fechamento autorizado. Divergências registradas.')}>Autorizar e fechar caixa</button>
      </footer>
    </section></div>}
    {view==='cash' && <div className="commerce-columns">
      {role!=='Caixa'&&<div className="panel commerce-section commerce-wide"><h2>Caixas abertos por terminal</h2><p>Cada caixa tem abertura, movimentações, saldo e fechamento independentes. O gerente visualiza os terminais, mas não fecha outro caixa remotamente.</p>
        <div className="commerce-table"><table><thead><tr><th>Terminal</th><th>Operador de abertura</th><th>Aberto em</th><th>Troco inicial</th><th>Saldo previsto</th></tr></thead><tbody>
          {otherSessions.map(x=><tr key={x.id}><td>{x.terminal_id}</td><td>{x.operator_name|| (x.operator_id?'Operador não encontrado':'Turno legado')}</td><td>{pretty(x.opened_at)}</td><td>{money(x.opening_cash_cents)}</td><td>{money(x.expected_cash_cents)}</td></tr>)}
        </tbody></table>{otherSessions.length===0&&<p className="commerce-empty">Nenhum caixa aberto.</p>}</div>
      </div>}
      <div className="panel commerce-section"><h2>{session?'Turno aberto':'Abrir novo caixa'}</h2>
        {session?<><p>Aberto em {pretty(session.opened_at)}</p>
          <p>Contagem cega: registre cada meio sem consultar os valores previstos. A comparação acontece somente após a autorização.</p>
          <form className="commerce-form" onSubmit={e=>{e.preventDefault();setCloseReview(true);}}>
            {(['cash','pix','card_credit','card_debit','card'] as const).map(id=>
              <label key={id}>{methodLabel(id)} conferido (R$)
                <input required inputMode="decimal" placeholder="0,00" value={methodCounts[id]}
                  onChange={e=>{const value=e.target.value;setMethodCounts(previous=>({...previous,[id]:value}));}}/>
              </label>)}
            <button disabled={busy} className="primary" type="submit">Revisar fechamento e solicitar gerente</button>
          </form>
        </>:<form className="commerce-form" onSubmit={e=>{e.preventDefault();void action(()=>api!.sessionOpen({openingCashCents:amount}),'Caixa aberto para vendas.');}}>
          <label>Valor inicial de troco (R$)<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label><button disabled={busy} className="primary" type="submit">Abrir caixa</button>
        </form>}
      </div>
      {lastClose&&<div className="panel commerce-section"><h2>Última conferência concluída</h2>
        <div className="commerce-table"><table><thead><tr><th>Meio</th><th>Previsto</th><th>Contado</th><th>Diferença</th></tr></thead><tbody>
          {(lastClose.checks||[]).map((x:R)=><tr key={x.method}><td>{methodLabel(x.method)}</td><td>{money(x.expected_cents)}</td><td>{money(x.counted_cents)}</td><td>{money(x.difference_cents)}</td></tr>)}
        </tbody></table></div></div>}
      <div className="panel commerce-section"><h2>Sangria / reforço</h2><p>Movimentações auditáveis em dinheiro, vinculadas ao turno aberto.</p><form className="commerce-form" onSubmit={e=>{e.preventDefault();void action(()=>api!.cashMove({kind,amountCents:amount,note:reason}),'Movimentação de caixa registrada.');}}>
        <label>Operação<select value={kind} onChange={e=>setKind(e.target.value)}>{cashMovementKinds.map(k=><option value={k} key={k}>{commerceLabels.cash[k]}</option>)}</select></label>
        <label>Valor (R$)<input value={amount} inputMode="decimal" onChange={e=>setAmount(e.target.value)}/></label>
      <label>Categoria<input maxLength={80} value={financeCategory} onChange={e=>setFinanceCategory(e.target.value)} placeholder="Ex.: Infraestrutura"/></label>
        <label>Motivo<input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Descreva o motivo"/></label>
        <button disabled={!session||busy} className="secondary" type="submit">Registrar movimentação</button></form>
        {!session&&<p className="commerce-warning">É necessário abrir o caixa antes de movimentar dinheiro.</p>}
      </div>
      {session&&<div className="panel commerce-section commerce-wide"><h2>Histórico do turno</h2><div className="commerce-table"><table><thead><tr><th>Data</th><th>Operação</th><th>Valor</th><th>Motivo</th></tr></thead><tbody>{session.movements?.map((m:R)=><tr key={m.id}><td>{pretty(m.created_at)}</td><td>{m.kind}</td><td>{money(m.delta_cents)}</td><td>{m.note}</td></tr>)}</tbody></table>{!session.movements?.length&&<p className="commerce-empty">Nenhuma movimentação neste turno.</p>}</div></div>}
    </div>}
    {view==='sales'&&<div className="panel commerce-section"><h2>Histórico de vendas</h2><p>O cancelamento só é permitido no mesmo turno aberto e atualiza os movimentos locais. Estornos de Pix/cartão devem ser realizados externamente.</p><div className="commerce-table"><table><thead><tr><th>Data</th><th>Venda</th><th>Cliente</th><th>Total</th><th>Situação</th><th>Ação</th></tr></thead><tbody>{sales.map(s=><tr key={s.id}><td>{pretty(s.created_at)}</td><td title={s.id}>{s.id.slice(0,8)}</td><td>{s.customer_id?.slice(0,8)||'Consumidor final'}</td><td>{money(s.total_cents)}</td><td>{s.is_training?'TREINAMENTO — '+statusText[s.status]:statusText[s.status]}</td><td><button className="secondary" type="button" disabled={busy} onClick={async()=>{try{setReceipt(await api!.saleGet(s.id));setError('');}catch(err){setError(errorMessage(err));}}}>Comprovante</button> {s.status==='completed'&&<button disabled={busy||session?.id!==s.session_id} className="secondary button-danger" onClick={()=>{
            if(window.confirm('Cancelar venda? Estoque e registros locais serão revertidos. Pix e cartão exigem reembolso externo manual.')) void action(()=>api!.salesCancel(s.id),'Venda cancelada e estoque restaurado.',true);
          }}>Cancelar venda</button>}</td></tr>)}</tbody></table>{sales.length===0&&<p className="commerce-empty">Nenhuma venda foi realizada ainda.</p>}</div></div>}
    {view==='inventory'&&<>
      <div className="panel commerce-section super-inventory-overview">
        <div className="commerce-heading"><div><h2>Controle de estoque</h2><p>Saldo real dos produtos. Alerta de atenção: até 5 unidades ou kg, sem configurar mínimo.</p></div>
          <span className="count-chip">{products.length} produtos cadastrados</span></div>
        <div className="super-inventory-grid">
          <div className="super-inventory-stat"><strong>{products.length}</strong><span>Produtos ativos</span></div>
          <div className="super-inventory-stat"><strong>{products.filter(p=>Number(p.stock_milli||0)>0).length}</strong><span>Em estoque</span></div>
          <div className="super-inventory-stat super-inventory-warning"><strong>{products.filter(p=>Number(p.stock_milli||0)>0&&Number(p.stock_milli||0)<=5000).length}</strong><span>Atenção (até 5)</span></div>
          <div className="super-inventory-stat super-inventory-danger"><strong>{products.filter(p=>Number(p.stock_milli||0)<=0).length}</strong><span>Sem estoque</span></div>
        </div>
        <div className="commerce-table super-inventory-table"><table><thead><tr><th>Código</th><th>Produto</th><th>Categoria</th><th>Estoque atual</th><th>Situação</th></tr></thead>
          <tbody>{products.slice(0,100).map(p=><tr key={p.id}>
            <td>{p.code||'—'}</td>
            <td className="super-stock-product">{p.image_data?<img src={p.image_data} alt="" loading="lazy"/>:<span className="super-stock-empty"><Package size={18}/></span>}<strong>{p.name}</strong></td>
            <td>{categories.find(c=>c.id===p.category_id)?.name||'Sem categoria'}</td>
            <td>{(Number(p.stock_milli||0)/1000).toLocaleString('pt-BR',{maximumFractionDigits:3})} {p.unit}</td>
            <td><span className={'super-stock-status '+(Number(p.stock_milli||0)<=0?'out':Number(p.stock_milli||0)<=5000?'low':'good')}>{Number(p.stock_milli||0)<=0?'Sem estoque':Number(p.stock_milli||0)<=5000?'Atenção':'Em estoque'}</span></td>
          </tr>)}</tbody></table>{products.length>100&&<p className="commerce-warning">Mostrando os primeiros 100 itens. Use o cadastro de produtos para consultar todo o catálogo.</p>}</div>
        <div className="super-inventory-actions">
          <button className="primary" type="button" onClick={()=>{setStockKind('receipt');setStockDirection('positive');document.getElementById('inventory-move-form')?.scrollIntoView({block:'center',behavior:'smooth'});}}><Plus size={16}/> Entrada de estoque</button>
          <button className="secondary" type="button" onClick={()=>{setStockKind('adjustment');setStockDirection('negative');document.getElementById('inventory-move-form')?.scrollIntoView({block:'center',behavior:'smooth'});}}><ArrowDownToLine size={16}/> Saída de estoque</button>
          <button className="secondary" type="button" onClick={()=>{setStockKind('adjustment');setStockDirection('positive');document.getElementById('inventory-move-form')?.scrollIntoView({block:'center',behavior:'smooth'});}}><RotateCcw size={16}/> Ajuste de estoque</button>
        </div>
      </div>
      <div className="panel commerce-section" id="inventory-move-form"><h2>Movimentar estoque</h2><p>Entradas e ajustes registrados no histórico. O saldo do cadastro não pode ser alterado diretamente.</p>
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
        <div className="commerce-table"><table><thead><tr><th>Produto</th><th>Lote</th><th>Validade</th><th>Saldo</th><th>Etiqueta</th></tr></thead><tbody>
          {batches.slice(0,300).map(b=><tr key={b.id}><td>{products.find(p=>p.id===b.product_id)?.name||b.product_id.slice(0,8)}</td><td>{b.code}</td><td>{b.expires_on}</td><td>{b.remaining_milli/1000}</td><td><button type="button" className="secondary" disabled={busy} onClick={()=>void action(()=>api!.devicePrint({kind:'batch-label',productId:b.product_id,batchId:b.id}),'Etiqueta Code128 enviada para a impressora.')}>Imprimir lote</button></td></tr>)}
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
      <div className="panel commerce-section"><h2>Kits entre SKUs diferentes</h2>
        <p>Configure duas mercadorias distintas. O PDV compara esse kit com descontos por SKU e utiliza o menor preço, sem aplicar o mesmo item em dois kits.</p>
        <form className="commerce-inline-form" onSubmit={e=>{e.preventDefault();void action(()=>api!.bundleSet({
          name:bundleName,bundlePriceCents:bundlePrice,
          items:[{productId:bundleA,quantityMilli:parseFixed(bundleQtyA,3,'Quantidade')},
                 {productId:bundleB,quantityMilli:parseFixed(bundleQtyB,3,'Quantidade')}]
        }),'Kit promocional de duas SKUs registrado.');}}>
          <label>Nome do kit<input required maxLength={100} value={bundleName} onChange={e=>setBundleName(e.target.value)} placeholder="Ex.: café + biscoito"/></label>
          <label>Produto A<select required value={bundleA} onChange={e=>setBundleA(e.target.value)}><option value="">Selecione</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>Quantidade A<input required inputMode="decimal" value={bundleQtyA} onChange={e=>setBundleQtyA(e.target.value)}/></label>
          <label>Produto B<select required value={bundleB} onChange={e=>setBundleB(e.target.value)}><option value="">Selecione</option>{products.filter(p=>p.id!==bundleA).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>Quantidade B<input required inputMode="decimal" value={bundleQtyB} onChange={e=>setBundleQtyB(e.target.value)}/></label>
          <label>Valor do kit (R$)<input required inputMode="decimal" value={bundlePrice} onChange={e=>setBundlePrice(e.target.value)}/></label>
          <button type="submit" className="primary" disabled={busy||!bundleA||!bundleB||bundleA===bundleB}>Salvar kit</button>
        </form>
        <div className="commerce-table"><table><thead><tr><th>Kit</th><th>Itens</th><th>Preço</th><th>Ação</th></tr></thead><tbody>
          {bundles.map(b=><tr key={b.id}><td>{b.name}</td><td>{b.items.map((i:R)=>String(i.quantity_milli/1000)+' × '+(products.find(p=>p.id===i.product_id)?.name||i.product_id.slice(0,8))).join(' + ')}</td><td>{money(b.bundle_price_cents)}</td>
            <td><button className="secondary" type="button" disabled={busy} onClick={()=>{if(window.confirm('Desativar este kit promocional?'))void action(()=>api!.bundleArchive(b.id),'Kit desativado.');}}>Desativar</button></td></tr>)}
        </tbody></table></div>
      </div>
      <div className="panel commerce-section"><h2>Histórico de movimentações</h2><div className="commerce-table"><table><thead><tr><th>Data</th><th>Produto</th><th>Origem</th><th>Quantidade</th><th>Motivo</th></tr></thead><tbody>{movements.slice(0,300).map(m=><tr key={m.id}><td>{pretty(m.created_at)}</td><td>{products.find(p=>p.id===m.product_id)?.name||m.product_id.slice(0,8)}</td><td>{m.kind}</td><td>{(m.delta_milli/1000).toLocaleString('pt-BR',{maximumFractionDigits:3})}</td><td>{m.reason}</td></tr>)}</tbody></table>{!movements.length&&<p className="commerce-empty">Nenhuma movimentação encontrada.</p>}</div></div></>}
    {view==='purchases'&&<>
      <div className="panel commerce-section">
        <h2>Nova compra — etapa 1: revisar itens</h2>
        <p>Uma compra em rascunho não movimenta estoque nem cria conta a pagar. O custo médio será atualizado somente ao confirmar o recebimento físico.</p>
        <div className="commerce-inline-form">
          <label>Fornecedor
            <select value={purchaseSupplier} onChange={e=>setPurchaseSupplier(e.target.value)} required>
              <option value="">Selecione um fornecedor</option>
              {suppliers.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>Documento de referência<input value={purchaseDoc} maxLength={100} onChange={e=>setPurchaseDoc(e.target.value)} placeholder="Nota ou pedido (opcional)"/></label>
          <label>Vencimento<input type="date" value={purchaseDue} onChange={e=>setPurchaseDue(e.target.value)}/></label>
        </div>
        <div className="commerce-inline-form">
          <label>Produto
            <select value={purchaseProduct} onChange={e=>setPurchaseProduct(e.target.value)}>
              <option value="">Selecione</option>
              {products.map(item=><option key={item.id} value={item.id}>{item.name} — saldo {item.stock_milli/1000}</option>)}
            </select>
          </label>
          <label>Quantidade<input inputMode="decimal" value={purchaseQty} onChange={e=>setPurchaseQty(e.target.value)} placeholder="1,000"/></label>
          <label>Custo unitário (R$)<input inputMode="decimal" value={purchaseCost} onChange={e=>setPurchaseCost(e.target.value)}/></label>
          <button type="button" className="secondary" disabled={!purchaseProduct||purchaseLines.some(x=>x.productId===purchaseProduct)}
            onClick={()=>{try{const qty=parseFixed(purchaseQty,3,'Quantidade'),cost=parseFixed(purchaseCost,2,'Custo');
              if(qty<=0||cost<0)throw new Error('Quantidade ou custo inválido.');
              setPurchaseLines(current=>[...current,{productId:purchaseProduct,quantityMilli:qty,unitCostCents:cost}]);
              setPurchaseProduct('');
            }catch(err){setError(errorMessage(err));}}}>Adicionar item</button>
        </div>
        <div className="commerce-table"><table><thead><tr><th>Produto</th><th>Quantidade</th><th>Custo</th><th>Total</th><th>Ação</th></tr></thead><tbody>
          {purchaseLines.map(x=><tr key={x.productId}><td>{products.find(p=>p.id===x.productId)?.name}</td><td>{x.quantityMilli/1000}</td>
            <td>{money(x.unitCostCents)}</td><td>{money(Math.round(x.quantityMilli*x.unitCostCents/1000))}</td>
            <td><button type="button" className="secondary" onClick={()=>setPurchaseLines(lines=>lines.filter(i=>i.productId!==x.productId))}>Remover</button></td></tr>)}
        </tbody></table></div>
        <button type="button" className="primary" disabled={busy||!purchaseSupplier||purchaseLines.length===0}
          onClick={()=>void action(async()=>{
            await api!.purchaseCreate({supplierId:purchaseSupplier,documentRef:purchaseDoc,dueOn:purchaseDue,lines:purchaseLines});
            setPurchaseLines([]);setPurchaseDoc('');setPurchaseDue('');
          },'Compra salva como rascunho; estoque e financeiro inalterados.')}>Salvar compra em rascunho</button>
      </div>
      <div className="panel commerce-section"><h2>Etapa 2: receber compras</h2>
        <p>Confira fisicamente a mercadoria, as quantidades e os custos antes de confirmar. O recebimento é irreversível pelo fluxo comum e não pode ser repetido.</p>
        <div className="commerce-table"><table><thead><tr><th>Fornecedor</th><th>Documento</th><th>Itens</th><th>Total</th><th>Situação</th><th>Operação</th></tr></thead><tbody>
          {purchases.map(p=><tr key={p.id}><td>{p.supplier_name}</td><td>{p.document_ref||'—'}</td>
            <td><details><summary>{p.lines.length} item(ns)</summary>
              {p.lines.map((line:R)=><p key={line.id}>{products.find(prod=>prod.id===line.product_id)?.name||line.product_id} · {line.quantity_milli/1000} · {money(line.unit_cost_cents)} / unidade</p>)}
            </details></td>
            <td>{money(p.total_cents)}</td><td>{p.status==='received'?'Recebida':'Rascunho'}</td>
            <td>{p.status==='draft'&&<button type="button" className="secondary" disabled={busy}
              onClick={()=>{if(window.confirm('Mercadoria conferida fisicamente? Receber a compra atualizará estoque, custo médio e conta a pagar.'))
                void action(()=>api!.purchaseReceive(p.id),'Compra recebida e custo médio atualizado.',true);}}>Conferir e receber</button>}</td>
          </tr>)}
        </tbody></table></div>
      </div>
    </>}
    {view==='finance'&&<FinanceP2Panel entries={finance} onChanged={load}/>}
    {view==='finance'&&<><div className="panel commerce-section"><h2>Novo lançamento</h2><form className="commerce-inline-form" onSubmit={e=>{e.preventDefault();void action(()=>api!.financeCreate({type:financeType,description,amountCents:amount,dueOn,category:financeCategory}), 'Lançamento registrado.');}}>
      <label>Tipo<select value={financeType} onChange={e=>setFinanceType(e.target.value)}>{financeTypes.map(t=><option value={t} key={t}>{commerceLabels.finance[t]}</option>)}</select></label>
      <label>Descrição<input required value={description} onChange={e=>setDescription(e.target.value)} placeholder="Ex.: aluguel"/></label>
      <label>Valor (R$)<input value={amount} inputMode="decimal" onChange={e=>setAmount(e.target.value)}/></label>
      <label>Vencimento<input type="date" value={dueOn} onChange={e=>setDueOn(e.target.value)}/></label>
      <button disabled={busy} className="primary" type="submit"><Plus size={16}/>Criar lançamento</button></form></div>
      <div className="panel commerce-section"><div className="commerce-heading"><div><h2>Contas a pagar e receber</h2><p>O fiado aparece automaticamente como conta a receber.</p></div><label>Quitação<select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}>{paymentMethods.filter(m=>m.id!=='credit').map(m=><option value={m.id} key={m.id}>{m.label}</option>)}</select></label></div>
        <div className="commerce-table"><table><thead><tr><th>Descrição</th><th>Tipo</th><th>Valor</th><th>Pago</th><th>Saldo</th><th>Vencimento</th><th>Situação</th><th>Baixa parcial (R$)</th><th>Operação</th></tr></thead><tbody>{finance.map(f=><tr key={f.id}><td>{f.description}
          {(f.settlements||[]).length>0&&<details><summary>Histórico de baixas ({f.settlements.length})</summary>
            {(f.settlements||[]).map((settlement:R)=><p key={settlement.id}>
              {pretty(settlement.created_at)} · {money(settlement.amount_cents)} · {methodLabel(settlement.method)}
            </p>)}
          </details>}</td><td>{statusText[f.type]}</td><td>{money(f.amount_cents)}</td><td>{money(f.paid_cents||0)}</td><td>{money(f.remaining_cents??f.amount_cents)}</td>
          <td>{f.due_on||'—'}</td><td>{statusText[f.status]}</td>
          <td>{f.status==='open'&&<input aria-label={'Valor a baixar de '+f.description} inputMode="decimal"
            value={settleAmounts[f.id]??((f.remaining_cents??f.amount_cents)/100).toFixed(2)}
            onChange={e=>setSettleAmounts(values=>({...values,[f.id]:e.target.value}))}/>}</td>
          <td>{f.status==='open'&&<button className="secondary" disabled={busy||paymentMethod==='cash'&&!session} onClick={()=>{
            try{const amountCents=parseFixed(settleAmounts[f.id]??((f.remaining_cents??f.amount_cents)/100).toFixed(2),2,'Valor de baixa');
              if(amountCents<=0||amountCents>(f.remaining_cents??f.amount_cents))throw new Error('Valor ultrapassa saldo em aberto.');
              if(window.confirm('Confirmar baixa de '+money(amountCents)+' via '+methodLabel(paymentMethod)+'?'))
                void action(()=>api!.financeSettle({id:f.id,method:paymentMethod,amountCents}),'Baixa financeira registrada.');
            }catch(err){setError(errorMessage(err));}
          }}>Dar baixa</button>}</td></tr>)}</tbody></table>{!finance.length&&<p className="commerce-empty">Nenhum lançamento financeiro.</p>}</div><p className="commerce-warning">Pagamentos não realizados em dinheiro são registrados manualmente. Nenhuma cobrança é executada em gateways externos.</p></div></>}
    {view==='reports'&&<>
      <div className="commerce-heading">
        <div><h2>Relatório gerencial acumulado</h2><p>Exporte localmente; nenhum dado é enviado a serviços externos.</p></div>
        <div className="report-actions">{(['pdf','csv','xlsx'] as const).map(format=><button key={format} className="secondary" disabled={busy} onClick={()=>void exportReport(format)}>Exportar {format.toUpperCase()}</button>)}</div>
      </div>
      <div className="super-report-kpis">
        <div className="stat"><span>Vendas (R$)</span><strong>{money(summary.sales_total_cents||0)}</strong><small>Faturamento acumulado</small></div>
        <div className="stat"><span>Quantidade de vendas</span><strong>{summary.sales_count||0}</strong><small>Concluídas</small></div>
        <div className="stat"><span>Ticket médio</span><strong>{money(summary.sales_count?Math.round((summary.sales_total_cents||0)/summary.sales_count):0)}</strong><small>Por venda concluída</small></div>
        <div className="stat"><span>Descontos</span><strong>{money(summary.discounts_cents||0)}</strong><small>Concedidos</small></div>
      </div>
      <ReportCharts sales={sales} summary={summary}/>
      <details className="super-report-details"><summary>Ver todos os indicadores do relatório</summary>
        <div className="report-grid">{reportRows(summary).map(row=><div className="stat" key={row.key}><span className="report-label">{row.label}</span><strong className="report-number">{row.type==='money'?money(row.raw):row.value}</strong><span className="stat-bottom">Acumulado local</span></div>)}</div>
      </details>
      <div className="panel commerce-section"><h2>Relatório detalhado por item vendido</h2>
        <form className="commerce-inline-form" onSubmit={e=>{e.preventDefault();void action(async()=>{setReportItemVisibleCount(250);setItemReport(await api!.reportItems({
          from:reportFrom||undefined,to:reportTo||undefined,productId:reportProduct||undefined,
          brand:reportBrand||undefined,producer:reportProducer||undefined,variantGroup:reportVariant||undefined,training:reportTraining
        }));},'Detalhamento consultado.');}}>
          <label>Início<input type="date" value={reportFrom} onChange={e=>setReportFrom(e.target.value)}/></label>
          <label>Fim<input type="date" value={reportTo} onChange={e=>setReportTo(e.target.value)}/></label>
          <label>Produto<select value={reportProduct} onChange={e=>setReportProduct(e.target.value)}><option value="">Todos os produtos</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>Marca<input value={reportBrand} onChange={e=>setReportBrand(e.target.value)} placeholder="Todas as marcas"/></label>
          <label>Produtor<input value={reportProducer} onChange={e=>setReportProducer(e.target.value)} placeholder="Todos os produtores"/></label>
          <label>Grupo de variantes<input value={reportVariant} onChange={e=>setReportVariant(e.target.value)} placeholder="Todos os grupos"/></label>
          <label>Treinamento<select value={reportTraining} onChange={e=>setReportTraining(e.target.value as 'exclude'|'only'|'include')}>
            <option value="exclude">Excluir treinamento (faturamento)</option>
            <option value="only">Somente treinamento</option>
            <option value="include">Todas (inclui simulações)</option>
          </select></label>
          <button className="primary" type="submit" disabled={busy}>Consultar itens</button>
        </form>
        <div className="report-actions" aria-label="Exportação detalhada">{(['csv','xlsx','pdf'] as const).map(format=>
          <button type="button" className="secondary" key={format} disabled={busy} onClick={()=>void exportItemReport(format)}>Exportar itens {format.toUpperCase()}</button>)}</div>
        {itemReport&&<><p>Itens encontrados: {itemReport.rows?.length||0} · Total líquido: {money(itemReport.summary?.net_total_cents||0)}</p>
          <div className="commerce-table"><table><thead><tr><th>Data</th><th>Produto</th><th>Quantidade</th><th>Bruto</th><th>Desconto</th><th>Líquido</th><th>Pagamento</th></tr></thead><tbody>
            {(itemReport.rows||[]).slice(0,reportItemVisibleCount).map((row:R,i:number)=><tr key={row.sale_id+'-'+row.product_id+'-'+i}>
              <td>{pretty(row.created_at)}</td><td>{row.product_name}</td><td>{row.quantity_milli/1000}</td><td>{money(row.gross_cents)}</td><td>{money(row.discount_cents)}</td><td>{money(row.net_cents)}</td>
              <td>{row.payment_method==='mixed_unallocated'?'Misto: não atribuído por item':row.payment_method==='mixed_allocated'?'Misto: atribuído por item':methodLabel(row.payment_method)}</td>
            </tr>)}
          </tbody></table>
            {itemReport.rows?.length>reportItemVisibleCount&&
              <div className="super-report-more" aria-live="polite">
                <span>Exibindo {reportItemVisibleCount.toLocaleString('pt-BR')} de {itemReport.rows.length.toLocaleString('pt-BR')} registros. Nenhum dado é descartado.</span>
                <button type="button" className="secondary"
                  onClick={()=>setReportItemVisibleCount(count=>count+250)}>Mostrar mais 250</button>
                <button type="button" className="secondary"
                  onClick={()=>setReportItemVisibleCount(itemReport.rows.length)}>Exibir todos</button>
              </div>}
          </div>
        </>}
      </div>
      <div className="panel commerce-section"><h2>Comparativo de períodos comerciais</h2>
        <p>Compare duas janelas de datas utilizando somente vendas reais concluídas. Simulações e cancelamentos não entram nos totais.</p>
        <form className="commerce-inline-form" onSubmit={e=>{e.preventDefault();void action(async()=>{
          const result=await api!.reportCompare({from:compareFrom,to:compareTo,comparisonFrom:compareNextFrom,comparisonTo:compareNextTo});
          setComparison(result);
        },'Comparativo atualizado.');}}>
          <label>Primeiro período — início<input type="date" required value={compareFrom} onChange={e=>setCompareFrom(e.target.value)}/></label>
          <label>Primeiro período — fim<input type="date" required value={compareTo} onChange={e=>setCompareTo(e.target.value)}/></label>
          <label>Segundo período — início<input type="date" required value={compareNextFrom} onChange={e=>setCompareNextFrom(e.target.value)}/></label>
          <label>Segundo período — fim<input type="date" required value={compareNextTo} onChange={e=>setCompareNextTo(e.target.value)}/></label>
          <button type="submit" className="primary" disabled={busy}>Comparar períodos</button>
        </form>
        {comparison&&<div className="report-grid" aria-live="polite">
          <div className="stat"><span>Primeiro período</span><strong>{money(comparison.previous.total_cents)}</strong><span>{comparison.previous.sales_count} vendas</span></div>
          <div className="stat"><span>Segundo período</span><strong>{money(comparison.current.total_cents)}</strong><span>{comparison.current.sales_count} vendas</span></div>
          <div className="stat"><span>Variação absoluta</span><strong>{money(comparison.delta_cents)}</strong></div>
          <div className="stat"><span>Variação percentual</span><strong>{comparison.delta_basis_points===null?'Sem base anterior':(comparison.delta_basis_points/100).toLocaleString('pt-BR',{maximumFractionDigits:2})+'%'}</strong></div>
        </div>}
      </div>
      <div className="info-bar"><AlertTriangle size={19}/><p>Relatório acumulado no banco local. Os valores de Pix e cartão refletem confirmações manuais, não consultas bancárias. Vendas canceladas não integram o faturamento.</p></div>
    </>}
  </div>;
}
