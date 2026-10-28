import { parseFixed } from './domain.mjs';
import { normalizePayments } from './commerce.mjs';

/** Read-only preview: same canonical payment rules as checkout, without persisting money. */
export function paymentPreview(totalCents, entries) {
  const empty = { paidCents: 0, remainingCents: Math.max(0,totalCents), changeCents: 0, canSubmit: false, error: '' };
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) return {...empty,error:'Informe um total válido para a venda.'};
  try {
    const payments = entries.map(entry=>({
      method:entry.method,amountCents:parseFixed(entry.amount,2,'Pagamento')
    }));
    const paidCents=payments.reduce((sum,p)=>sum+p.amountCents,0);
    if (!Number.isSafeInteger(paidCents)) throw new Error('Soma dos pagamentos excede o limite.');
    const remainingCents=Math.max(0,totalCents-paidCents);
    try {
      const normalized=normalizePayments(payments,totalCents);
      return {paidCents,remainingCents,changeCents:normalized.change_cents,canSubmit:true,error:''};
    } catch(error) {
      return {paidCents,remainingCents,changeCents:0,canSubmit:false,error:String(error?.message||error)};
    }
  } catch(error) {
    return {...empty,error:String(error?.message||error)};
  }
}
