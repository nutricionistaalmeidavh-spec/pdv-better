import React,{useEffect,useMemo,useState} from 'react';
import {money,parseFixed} from '../shared/domain.mjs';
import {financeBuckets} from '../shared/finance-board.mjs';

type R=Record<string,any>;
const textError=(x:any)=>String(x?.message||x||'Falha operacional').replace(/^Error invoking remote method.*?: Error: /,'');
const groupNames:Record<string,string>={overdue:'Vencidas',upcoming:'A vencer',partial:'Parciais',settled:'Liquidadas',undated:'Sem vencimento'};
const ptType=(type:string)=>type==='payable'?'A pagar':'A receber';
const defaultFavoriteKey='pdv-better:p2:finance-filter:v1';

export function FinanceP2Panel({entries,onChanged,pageLabel}:{entries:R[];onChanged:()=>Promise<void>;pageLabel?:string}){
 const api=window.pdv;
 const [type,setType]=useState('payable');
 const [description,setDescription]=useState('');
 const [category,setCategory]=useState('');
 const [amount,setAmount]=useState('0,00');
 const [due,setDue]=useState('');
 const [months,setMonths]=useState(3);
 const [operationKey,setOperationKey]=useState(()=>crypto.randomUUID());
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 const [selection,setSelection]=useState('');
 const [timelineVisible,setTimelineVisible]=useState(150);
 const [search,setSearch]=useState('');
 const [filterType,setFilterType]=useState('all');
 const [from,setFrom]=useState('');
 const [to,setTo]=useState('');
 const [overview,setOverview]=useState<R|null>(null);
 const [favorite,setFavorite]=useState<R|null>(()=>{
  try{const s=JSON.parse(localStorage.getItem(defaultFavoriteKey)||'null');
    return s&&typeof s==='object'?s:null;}catch{return null;}
 });
 const filtered=useMemo(()=>entries.filter(e=>
  (filterType==='all'||e.type===filterType)&&
  (!search||String([e.description,e.category,e.id].join(' ')).toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
 ),[entries,filterType,search]);
 const board=useMemo(()=>financeBuckets(filtered),[filtered]);
 const selected=entries.find(e=>e.id===selection)||null;
 useEffect(()=>{
  if(!api)return;
  let live=true;
  setError('');
  void api.financeOverview({from:from||undefined,to:to||undefined})
    .then(data=>{if(live)setOverview(data);})
    .catch(err=>{if(live)setError(textError(err));});
  return()=>{live=false;};
 },[from,to,entries]);
 const saveFavorite=()=>{
  const preference={from,to,filterType,search};
  try{localStorage.setItem(defaultFavoriteKey,JSON.stringify(preference));setFavorite(preference);setMessage('Filtro salvo neste computador.');}
  catch(err){setError('Não foi possível salvar o favorito local: '+textError(err));}
 };
 const useFavorite=()=>{
  if(!favorite)return;
  setFrom(String(favorite.from||''));setTo(String(favorite.to||''));
  setFilterType(String(favorite.filterType||'all'));setSearch(String(favorite.search||''));
 };
 const createSchedule=async(ev:React.FormEvent)=>{
  ev.preventDefault();if(!api||busy)return;
  setBusy(true);setError('');setMessage('');
  try{
   const result=await api.financeSchedule({
    key:operationKey,type,description,amountCents:parseFixed(amount,2,'Valor'),
    dueOn:due,category,months
   });
   await onChanged();
   setOperationKey(crypto.randomUUID());
   setDescription('');setAmount('0,00');setDue('');
   setMessage(result.entries.length+' obrigação(ões) registrada(s), sem pagamento automático.');
  }catch(err){setError(textError(err));}
  finally{setBusy(false);}
 };
 const exportFlow=async(format:'csv'|'xlsx'|'pdf')=>{
  if(!api||busy)return;
  setBusy(true);setError('');setMessage('');
  try{
   const r=await api.financeExport({format,filters:{from:from||undefined,to:to||undefined}});
   if(!r.cancelled)setMessage('Fluxo '+format.toUpperCase()+' exportado localmente ('+r.rows+' linhas).');
  }catch(err){setError(textError(err));}
  finally{setBusy(false);}
 };
 return <div className="p2-finance-stack">
   <div className="panel commerce-section">
     <div className="commerce-heading"><div><h2>Fluxo financeiro operacional</h2>
       <p>Realizado versus previsto, sem conexão bancária e sem duplicar recebimento de fiado.</p></div>
       <div className="report-actions">
         {(['csv','xlsx','pdf'] as const).map(fmt=><button className="secondary" key={fmt}
            disabled={busy} onClick={()=>void exportFlow(fmt)}>Exportar {fmt.toUpperCase()}</button>)}
       </div>
     </div>
     <div className="commerce-inline-form">
       <label>Início<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
       <label>Fim<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
       <button className="secondary" type="button" onClick={saveFavorite}>Salvar filtro favorito</button>
       <button className="secondary" type="button" disabled={!favorite} onClick={useFavorite}>Aplicar favorito</button>
     </div>
     {overview&&<div className="report-grid">
       <div className="stat"><span>Entradas realizadas</span><strong>{money(overview.realized_in_cents)}</strong></div>
       <div className="stat"><span>Saídas realizadas</span><strong>{money(overview.realized_out_cents)}</strong></div>
       <div className="stat"><span>Entradas previstas</span><strong>{money(overview.forecast_in_cents)}</strong></div>
       <div className="stat"><span>Saídas previstas</span><strong>{money(overview.forecast_out_cents)}</strong></div>
       <div className="stat"><span>Receita das vendas</span><strong>{money(overview.margin.revenue_cents)}</strong></div>
       <div className="stat"><span>Custo histórico das vendas</span><strong>{money(overview.margin.cost_cents)}</strong></div>
       <div className="stat"><span>Margem bruta estimada</span><strong>{money(overview.margin.gross_margin_cents)}</strong></div>
     </div>}
     {!!overview?.margin?.missing_cost_lines&&<p role="status" className="commerce-warning">
       {overview.margin.missing_cost_lines} linha(s) de venda sem custo histórico informado. A margem pode estar superestimada.
     </p>}
     <details><summary>Ver lançamentos do fluxo no período</summary>
       <div className="commerce-table"><table><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Meio</th><th>Valor</th></tr></thead><tbody>
         {[...(overview?.timeline||[]),...(overview?.forecasts||[])].slice(0,timelineVisible).map((r:R)=>
           <tr key={r.id}><td>{r.date}</td><td>{r.source==='forecast'?'Previsto '+r.kind:r.kind}</td>
             <td>{r.description}</td><td>{r.method}</td><td>{money(r.amount_cents)}</td></tr>)}
       </tbody></table></div>
       {(overview?.timeline?.length||0)+(overview?.forecasts?.length||0)>timelineVisible&&
          <div className="pagination">
            <span>Exibindo {timelineVisible.toLocaleString('pt-BR')} de {((overview?.timeline?.length||0)+(overview?.forecasts?.length||0)).toLocaleString('pt-BR')} movimentos</span>
            <button type="button" className="secondary" onClick={()=>setTimelineVisible(n=>n+150)}>Mostrar mais 150</button>
            <button type="button" className="secondary"
              onClick={()=>setTimelineVisible((overview?.timeline?.length||0)+(overview?.forecasts?.length||0))}>Exibir todos</button>
          </div>}
     </details>
   </div>
   <div className="panel commerce-section">
     <h2>Contas por situação — Kanban</h2>
     {pageLabel&&<p className="count-chip">{pageLabel}. Navegue pelas páginas na tabela de contas abaixo.</p>}
     <p>Selecione uma conta para ver seus documentos e baixas; mover visualmente um cartão não realiza pagamento.</p>
     <div className="commerce-inline-form">
       <label>Pesquisar<input aria-label="Pesquisar conta no Kanban" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Descrição, categoria ou ID"/></label>
       <label>Tipo<select value={filterType} onChange={e=>setFilterType(e.target.value)}>
         <option value="all">Todos</option><option value="payable">A pagar</option><option value="receivable">A receber</option>
       </select></label>
     </div>
     <div className="finance-kanban" aria-label="Quadro de contas">
       {Object.entries(board).map(([bucket,rows])=><section className="finance-kanban-column" key={bucket}>
         <h3>{groupNames[bucket]} <span>{(rows as R[]).length}</span></h3>
         {(rows as R[]).map(e=><button type="button" className={'finance-kanban-item'+(selection===e.id?' selected':'')}
           key={e.id} onClick={()=>setSelection(e.id)} aria-pressed={selection===e.id}>
           <strong>{e.description}</strong>
           <span>{ptType(e.type)} · {e.category||'Sem categoria'}</span>
           <span>{e.due_on||'Sem data'}</span>
           <b>{money(e.remaining_cents??e.amount_cents)}</b>
         </button>)}
       </section>)}
     </div>
     {selected&&<div className="finance-p2-detail" role="region" aria-label="Detalhe da conta selecionada">
       <div className="commerce-heading"><h3>{selected.description}</h3><button className="secondary" type="button" onClick={()=>setSelection('')}>Fechar detalhe</button></div>
       <p>{ptType(selected.type)} · Valor original {money(selected.amount_cents)} · Pago {money(selected.paid_cents||0)} · Saldo {money(selected.remaining_cents??selected.amount_cents)}</p>
       <p>Vencimento: {selected.due_on||'Não informado'} · Categoria: {selected.category||'Sem categoria'} · Referência: {selected.id}</p>
       {!!selected.purchase_id&&<p>Origem da compra: {selected.purchase_id}</p>}
       {!!selected.sale_id&&<p>Origem da venda: {selected.sale_id}</p>}
       {(selected.settlements||[]).map((x:R)=><p key={x.id}>Baixa de {money(x.amount_cents)} em {x.created_at?.slice(0,10)} por {x.method}</p>)}
     </div>}
   </div>
   <div className="panel commerce-section">
     <h2>Agendar contas recorrentes</h2>
     <p>Repete a obrigação pelo número escolhido de meses. Não liquida parcelas automaticamente, nem gera transações bancárias.</p>
     <form className="commerce-inline-form" onSubmit={createSchedule}>
       <label>Tipo<select value={type} onChange={e=>setType(e.target.value)}>
         <option value="payable">Conta a pagar</option><option value="receivable">Conta a receber</option>
       </select></label>
       <label>Descrição<input required maxLength={200} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Ex.: Aluguel"/></label>
       <label>Categoria<input maxLength={80} value={category} onChange={e=>setCategory(e.target.value)} placeholder="Ex.: Infraestrutura"/></label>
       <label>Valor mensal (R$)<input required inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
       <label>Primeiro vencimento<input required type="date" value={due} onChange={e=>setDue(e.target.value)}/></label>
       <label>Repetir<select value={months} onChange={e=>setMonths(Number(e.target.value))}>
         {[1,3,6,12].map(n=><option key={n} value={n}>{n} {n===1?'mês':'meses'}</option>)}
       </select></label>
       <button type="submit" className="primary" disabled={busy||!description.trim()||!due}>Criar recorrência</button>
     </form>
   </div>
   {error&&<p className="notice danger" role="alert">{error}</p>}
   {message&&<p className="notice success" role="status">{message}</p>}
 </div>;
}
