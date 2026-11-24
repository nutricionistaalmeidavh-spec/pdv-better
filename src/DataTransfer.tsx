import React,{useRef,useState} from 'react';
import {Database,FileDown,FileSpreadsheet,X} from 'lucide-react';

import {money} from '../shared/domain.mjs';
type Format='csv'|'xlsx';
type Preview=Awaited<ReturnType<PdvBridge['dataTransferPreview']>>;
type Input={kind:string;format:Format;bytes:Uint8Array;reason?:string};
const labels:Record<string,string>={products:'Produtos',inventory:'Estoque',categories:'Categorias',customers:'Clientes',suppliers:'Fornecedores'};
const actions:Record<string,string>={created:'Novo',updated:'Atualizar',unchanged:'Sem alteração'};
export function DataTransfer({kind,onChanged}:{kind:string;onChanged:()=>Promise<void>}){
 const bridge=window.pdv;
 const [open,setOpen]=useState(false);
 const [format,setFormat]=useState<Format>('xlsx');
 const [reason,setReason]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [pending,setPending]=useState<{input:Input;preview:Preview;name:string}|null>(null);
 const picker=useRef<HTMLInputElement>(null);
 const fail=(e:unknown)=>setError(String((e as Error)?.message||e).replace(/^Error invoking remote method.*?: Error: /,''));
 async function exportFile(template:boolean){
  if(!bridge||busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const result=await bridge.dataTransferExport({kind,format,template});
   if(!result.cancelled)setNotice(template?'Modelo salvo. Preencha os campos e importe o arquivo.':result.count+' registros exportados em '+format.toUpperCase()+'.');
  }catch(e){fail(e);}finally{setBusy(false);}
 }
 async function choose(event:React.ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];event.target.value='';
  if(!bridge||!file||busy)return;
  setBusy(true);setError('');setNotice('');setPending(null);
  try{
   if(file.size>10*1024*1024||!file.size)throw new Error('Selecione arquivo de até 10 MB.');
   const ext=file.name.split('.').pop()?.toLowerCase();
   if(ext!=='xlsx'&&ext!=='csv')throw new Error('Selecione XLSX ou CSV UTF-8.');
   if(kind==='inventory'&&!reason.trim())throw new Error('Informe o motivo do ajuste antes de importar.');
   const input:Input={kind,format:ext,bytes:new Uint8Array(await file.arrayBuffer()),reason};
   const preview=await bridge.dataTransferPreview(input);
   setOpen(false);setPending({input,preview,name:file.name});
  }catch(e){fail(e);}finally{setBusy(false);}
 }
 async function confirm(){
  if(!bridge||!pending||busy)return;
  setBusy(true);setError('');
  try{
   const result=await bridge.dataTransferImport({...pending.input,token:pending.preview.token});
   setPending(null);setNotice(result.created+' novos, '+result.updated+' atualizados, '+result.unchanged+' sem alteração.');
   try{await onChanged();}catch{setNotice('Importação concluída. Reabra a tela para atualizar os dados.');}
  }catch(e){fail(e);}finally{setBusy(false);}
 }
 return <div className="transfer-control">
  <button type="button" className="icon-btn" title={'Planilhas de '+labels[kind]} aria-label={'Planilhas de '+labels[kind]} aria-expanded={open} disabled={busy} onClick={()=>setOpen(true)}><FileSpreadsheet size={20}/></button>
  {open&&<div className="modal-backdrop" role="presentation"><section className="dialog catalog-import-preview" role="dialog" aria-modal="true" aria-labelledby="transfer-options-title" onKeyDown={e=>{if(e.key==='Escape'&&!busy)setOpen(false);}}>
   <header className="dialog-head"><h2 id="transfer-options-title">Planilhas de {labels[kind]}</h2><button autoFocus type="button" className="icon-btn" aria-label="Fechar opções de planilha" disabled={busy} onClick={()=>setOpen(false)}><X size={20}/></button></header>
   <div className="catalog-import-preview-content">
   <p>{kind==='inventory'?'Informe o saldo final por código. A diferença será registrada como ajuste, com motivo e histórico.':'Use o modelo ou exporte os dados atuais. Registros identificados serão atualizados; os demais serão cadastrados.'} Até 10.000 registros e 10 MB por importação.</p>
   <div style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'center'}}>
    <label>Formato <select aria-label="Formato da planilha" value={format} disabled={busy} onChange={e=>setFormat(e.target.value as Format)}><option value="xlsx">Excel XLSX</option><option value="csv">CSV UTF-8</option></select></label>
    <button type="button" className="secondary" disabled={busy} onClick={()=>void exportFile(true)}><FileDown size={16}/> Baixar modelo</button>
    <button type="button" className="secondary" disabled={busy} onClick={()=>void exportFile(false)}><FileDown size={16}/> Exportar cadastros</button>
    {kind==='inventory'&&<label>Motivo <input value={reason} maxLength={150} disabled={busy} placeholder="Ex.: inventário, recebimento, devolução" onChange={e=>setReason(e.target.value)}/></label>}
    <input ref={picker} type="file" accept=".xlsx,.csv" hidden onChange={e=>void choose(e)}/>
    <button type="button" className="primary" disabled={busy||(kind==='inventory'&&!reason.trim())} onClick={()=>picker.current?.click()}><Database size={16}/> {busy?'Processando…':'Importar planilha'}</button>
   </div>
   <p>Em rede local, execute no computador servidor. Em Excel, mantenha códigos, documentos e telefones como texto.</p>
   {error&&<p role="alert">{error}</p>}
   </div></section></div>}
  {notice&&<p role="status">{notice}</p>}
  {error&&!pending&&!open&&<p role="alert">{error}</p>}
  {pending&&<div className="modal-backdrop" role="presentation"><section className="dialog catalog-import-preview" role="dialog" aria-modal="true" aria-labelledby="transfer-title">
   <header className="dialog-head"><div><div className="eyebrow">CONFERÊNCIA ANTES DE SALVAR</div><h2 id="transfer-title">Prévia — {labels[kind]}</h2></div><button type="button" className="icon-btn" aria-label="Fechar prévia de planilha" disabled={busy} onClick={()=>setPending(null)}><X size={20}/></button></header>
   <div className="catalog-import-preview-content">
    <p><strong>{pending.name}</strong></p>
    <p>{pending.preview.count} registros: {pending.preview.created} novos, {pending.preview.updated} atualizações e {pending.preview.unchanged} sem alteração. Nenhum dado gravado ainda.</p>
    <div className="table-wrap"><table><thead><tr><th>Nome</th><th>Código / documento</th><th>Ação</th>{kind==='inventory'&&<><th>Anterior</th><th>Final</th></>}{kind==='products'&&<><th>Preço anterior / novo</th><th>Custo anterior / novo</th></>}</tr></thead><tbody>{pending.preview.rows.map((row,i)=><tr key={i}><td>{row.name}</td><td>{row.code}</td><td>{actions[row.action]}</td>{kind==='inventory'&&<><td>{Number(row.before)/1000}</td><td>{Number(row.after)/1000}</td></>}{kind==='products'&&<><td>{row.priceBefore===undefined?'—':money(row.priceBefore)} / {money(row.priceAfter??0)}</td><td>{row.costBefore===undefined?'—':money(row.costBefore)} / {money(row.costAfter??0)}</td></>}</tr>)}</tbody></table></div>
    <p>Exibindo os primeiros {pending.preview.rows.length} registros. Erros cancelam todo o lote.</p>
    {error&&<p role="alert">{error}</p>}
    <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><button type="button" className="secondary" disabled={busy} onClick={()=>setPending(null)}>Cancelar</button><button type="button" className="primary" disabled={busy} onClick={()=>void confirm()}>{busy?'Gravando…':'Confirmar planilha'}</button></div>
   </div>
  </section></div>}
 </div>;
}
