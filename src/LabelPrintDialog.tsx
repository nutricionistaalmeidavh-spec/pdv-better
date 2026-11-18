import React,{useEffect,useMemo,useState} from 'react';
import {Printer,X} from 'lucide-react';
import {normalizeLabelSettings,renderLabelDocument} from '../shared/label-layout.mjs';

type Product={id:string;name:string;code?:string;sale_price_cents:number};
type PrinterInfo={name:string;displayName:string;isDefault?:boolean};
type Preview={size:{widthMm:number;heightMm:number;marginMm:number};html:string}|{error:string}|null;
const friendlyError=(e:unknown)=>String((e as Error)?.message||e||'Falha na impressão').replace(/^Error invoking remote method.*?: Error: /,'');
export function LabelPrintDialog({product,onClose}:{product:Product;onClose:()=>void}){
  const [settings,setSettings]=useState<Record<string,unknown>|null>(null);
  const [printers,setPrinters]=useState<PrinterInfo[]>([]);
  const [printer,setPrinter]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    let alive=true;
    Promise.all([window.pdv.deviceGet(),window.pdv.devicePrinters()])
      .then(([saved,available])=>{if(alive){setSettings(saved);setPrinters(available);}})
      .catch(e=>{if(alive)setError(friendlyError(e));});
    return ()=>{alive=false;};
  },[product.id]);
  const preview:Preview=useMemo(()=>{
    if(!settings)return null;
    try{
      const size=normalizeLabelSettings(settings);
      return {size,html:renderLabelDocument(product,settings)};
    }catch(e){return {error:friendlyError(e)};}
  },[product,settings]);
  async function print(){
    if(!preview||'error' in preview||busy)return;
    setBusy(true);setError('');
    try{
      await window.pdv.devicePrint({kind:'label',productId:product.id,...(printer?{printer}:{})});
      onClose();
    }catch(e){setError(friendlyError(e));}
    finally{setBusy(false);}
  }
  return <div className="modal-backdrop" role="presentation">
    <section className="dialog label-print-dialog" role="dialog" aria-modal="true" aria-label="Pré-visualização da etiqueta">
      <header className="dialog-head">
        <div><h2>Pré-visualizar etiqueta</h2><p>Confira nome, código e preço antes de imprimir.</p></div>
        <button className="icon-btn" type="button" aria-label="Fechar pré-visualização" onClick={onClose}><X size={18}/></button>
      </header>
      {error&&<div className="notice danger" role="alert">{error}</div>}
      {!settings&&!error&&<p>Carregando configurações da impressora…</p>}
      {preview&&'error' in preview&&<div className="notice danger" role="alert">{preview.error}</div>}
      {preview&&'html' in preview&&<div className="label-preview-wrap">
        <p>Papel: {preview.size.widthMm} × {preview.size.heightMm} mm · Margem: {preview.size.marginMm} mm</p>
        <div className="label-preview-paper">
          <iframe title="Pré-visualização do papel em tamanho real aproximado" sandbox=""
            srcDoc={preview.html} style={{width:preview.size.widthMm+'mm',height:preview.size.heightMm+'mm',border:0,display:'block',background:'#fff'}}/>
        </div>
        <p className="settings-tip">A visualização representa o layout da etiqueta. Para mudar medidas, acesse Configurações → Periféricos. O driver do Windows deve usar o mesmo tamanho de papel, sem redimensionamento.</p>
        <label className="settings-label">Impressora
          <select aria-label="Impressora para etiqueta" value={printer} onChange={e=>setPrinter(e.target.value)}>
            <option value="">Escolher na janela de impressão do Windows</option>
            {printers.map(p=><option key={p.name} value={p.name}>{p.displayName}{p.isDefault?' (padrão)':''}</option>)}
          </select>
        </label>
      </div>}
      <div className="label-print-actions">
        <button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancelar</button>
        <button type="button" className="primary" disabled={busy||!preview||'error' in preview} onClick={()=>void print()}><Printer size={16}/>{busy?'Imprimindo…':'Imprimir etiqueta'}</button>
      </div>
    </section>
  </div>;
}
