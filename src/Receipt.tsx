import React from 'react';
import { Printer, X, ReceiptText } from 'lucide-react';
import { money } from '../shared/domain.mjs';
import { paymentMethods } from '../shared/contract.mjs';
const method=(id:string)=>paymentMethods.find(x=>x.id===id)?.label||id;
export function SaleReceipt({sale,onClose}:{sale:any;onClose:()=>void}){
  return <div className="modal-backdrop" role="presentation">
    <section className="dialog receipt-dialog" role="dialog" aria-modal="true" aria-label="Comprovante não fiscal da venda">
      <header className="dialog-head receipt-actions"><div><div className="eyebrow">VENDA CONCLUÍDA</div><h2>Comprovante</h2></div><button className="secondary" onClick={onClose} aria-label="Fechar comprovante"><X size={16}/>Fechar</button></header>
      <div className="receipt-content">
        <div className="receipt-brand"><ReceiptText size={23}/><h3>PDV Better</h3><p>Comprovante de venda não fiscal</p></div>
        <div className="receipt-sep"/>
        <p><strong>Venda:</strong> {sale.id}</p>
        <p><strong>Data:</strong> {new Date(sale.created_at).toLocaleString('pt-BR')}</p>
        <p><strong>Situação:</strong> {sale.status==='cancelled'?'CANCELADA':'CONCLUÍDA'}</p>
        <div className="receipt-sep"/>
        <table className="receipt-items"><thead><tr><th>Produto</th><th>Qtd.</th><th>Total</th></tr></thead><tbody>
          {(sale.items||[]).map((item:any)=><tr key={item.id}><td>{item.name}<small>{money(item.unit_price_cents)}/{item.unit}</small></td><td>{(item.quantity_milli/1000).toLocaleString('pt-BR',{maximumFractionDigits:3})} {item.unit}</td><td>{money(item.line_total_cents)}</td></tr>)}
        </tbody></table>
        <div className="receipt-sep"/>
        <div className="receipt-sum"><span>Subtotal</span><strong>{money(sale.subtotal_cents)}</strong></div>
        <div className="receipt-sum"><span>Descontos</span><strong>{money(sale.discount_cents)}</strong></div>
        <div className="receipt-sum receipt-total"><span>Total</span><strong>{money(sale.total_cents)}</strong></div>
        <div className="receipt-sep"/>
        <strong>Formas de pagamento</strong>
        {(sale.payments||[]).map((p:any)=><div className="receipt-sum" key={p.id}><span>{method(p.method)}</span><span>{money(p.amount_cents)}</span></div>)}
        {sale.change_cents>0&&<div className="receipt-sum"><span>Troco</span><strong>{money(sale.change_cents)}</strong></div>}
        <div className="receipt-sep"/>
        <p className="receipt-disclaimer">NÃO É DOCUMENTO FISCAL. Pix e cartão foram registrados manualmente no estabelecimento. Este comprovante não substitui NFC-e, SAT ou cupom fiscal.</p>
      </div>
      <footer className="dialog-footer receipt-actions"><button className="secondary" onClick={onClose}>Concluir</button><button className="primary" onClick={()=>window.print()}><Printer size={16}/>Imprimir comprovante</button></footer>
    </section>
  </div>;
}
