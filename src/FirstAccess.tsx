import React,{useEffect,useState} from 'react';
import {ArrowRight,Building2,Check,CheckCircle2,ChevronRight,ClipboardList,GraduationCap,Info,RefreshCcw,X} from 'lucide-react';
import {evaluateFirstAccess,firstAccessStorageKey} from '../shared/first-access.mjs';

type StoreProfile={name:string;document:string;address:string;updated_at?:string|null};
type Props={
  userId:string;databaseReady:boolean;productsCount:number;cashOpen:boolean;startSignal:number;
  onNavigate:(view:string)=>void;onStartTour:()=>void;
};
const emptyProfile:StoreProfile={name:'',document:'',address:''};
const labels:Record<string,string>={done:'Concluído',pending:'Pendente',optional:'Opcional'};
const errorText=(error:any)=>String(error?.message||error||'Operação indisponível')
  .replace(/^Error invoking remote method.*?: Error: /,'');

export function FirstAccess({userId,databaseReady,productsCount,cashOpen,startSignal,onNavigate,onStartTour}:Props){
  const api=window.pdv;
  const [profile,setProfile]=useState<StoreProfile|null>(null);
  const [form,setForm]=useState<StoreProfile>(emptyProfile);
  const [modal,setModal]=useState<'checklist'|'company'|null>(null);
  const [dismissed,setDismissed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [checking,setChecking]=useState(true);
  const [error,setError]=useState('');
  const status=evaluateFirstAccess({databaseReady,profile,productsCount,cashOpen});
  const preference=firstAccessStorageKey(userId);

  useEffect(()=>{
    try{setDismissed(localStorage.getItem(preference)==='yes');}
    catch{setDismissed(false);}
  },[preference]);

  useEffect(()=>{
    let active=true;
    setChecking(true);
    if(!api){setError('Banco local indisponível. Abra o aplicativo de desktop.');setChecking(false);return;}
    api.storeProfileGet().then(result=>{
      if(active){setProfile(result);setForm(result);setError('');}
    }).catch(err=>{if(active){setProfile(null);setError(errorText(err));}})
      .finally(()=>{if(active)setChecking(false);});
    return ()=>{active=false;};
  },[userId]);

  useEffect(()=>{if(startSignal>0)setModal('checklist');},[startSignal]);

  function dismiss(){
    if(!status.operationReady)return;
    try{localStorage.setItem(preference,'yes');}catch{}
    setDismissed(true);setModal(null);
  }
  function company(){
    setForm(profile||emptyProfile);setError('');setModal('company');
  }
  function navigate(action:string|null){
    if(action==='company'){company();return;}
    if(action==='products'||action==='cash'){setModal(null);onNavigate(action);}
  }
  async function save(ev:React.FormEvent){
    ev.preventDefault();if(!api||busy)return;
    setBusy(true);setError('');
    try{
      const saved=await api.storeProfileSet(form);
      setProfile(saved);setForm(saved);setModal('checklist');
    }catch(err){setError(errorText(err));}
    finally{setBusy(false);}
  }
  const progress=<div className="first-access-progress-area">
    <div className="first-access-progress-info"><strong>{status.completed} de {status.total} etapas</strong>
      <span>{status.percentage}% concluído</span></div>
    <div className="first-access-progress" role="progressbar" aria-label="Etapas de preparação concluídas"
      aria-valuemin={0} aria-valuemax={status.total} aria-valuenow={status.completed}>
      <span style={{width:status.percentage+'%'}}/></div>
  </div>;
  const steps=<div className="first-access-steps" aria-label="Etapas do primeiro acesso">
    {status.steps.map(step=><button className="first-access-step" key={step.id}
      type="button" data-state={step.state} disabled={!step.action}
      onClick={()=>navigate(step.action)}>
      <span className="first-access-step-icon" aria-hidden="true">
        {step.state==='done'?<Check size={17}/>:<span className="first-access-empty-circle"/>}
      </span>
      <span className="first-access-step-content"><strong>{step.title}</strong><small>{step.detail}</small></span>
      <span className="first-access-step-state">{labels[step.state]}</span>
      {step.action&&<ChevronRight size={16} aria-hidden="true"/>}
    </button>)}
  </div>;
  const message=status.operationReady
    ?<div className="first-access-ready" role="status"><CheckCircle2 size={20}/><span>
        <strong>Seu PDV já pode funcionar</strong><small>Produtos e caixa podem ser preparados conforme sua necessidade.</small></span></div>
    :<div className="first-access-notice" role="status"><Info size={20}/><span>
        <strong>Conclua os dados do estabelecimento</strong><small>O cadastro inicial deixa a loja preparada para começar.</small></span></div>;

  return <>
    <section className={'panel first-access-card'+(dismissed?' first-access-card-compact':'')}
      aria-label="Preparação do PDV SUPER">
      {dismissed?
        <><div className="first-access-card-heading"><ClipboardList size={23}/><div>
          <strong>Preparação do PDV</strong><p>Revise o checklist ou atualize os dados da loja.</p>
        </div></div><button type="button" className="secondary" onClick={()=>setModal('checklist')}>Ver checklist</button></>
        :<><div className="first-access-header"><div className="first-access-card-heading"><Building2 size={23}/><div>
          <h2>Prepare seu PDV</h2><p>Configure o essencial para começar a vender</p>
        </div></div><span className="first-access-count">{status.completed}/{status.total}</span></div>
        {progress}
        {checking&&<p className="first-access-warning" role="status">Verificando as configurações salvas…</p>}
        {error&&<p className="first-access-warning" role="alert">{error}</p>}
        {steps}{message}
        <div className="first-access-footer">
          <button type="button" className="secondary" onClick={()=>setModal('checklist')}>Ver todas as opções</button>
          {status.operationReady&&<button type="button" className="primary" onClick={dismiss}>Começar a trabalhar <ArrowRight size={16}/></button>}
        </div></>}
    </section>
    {modal&&<div className="first-access-backdrop" role="presentation" onMouseDown={event=>{
      if(event.target===event.currentTarget&&!busy)setModal(null);
    }}>
      <section className="first-access-dialog" role="dialog" aria-modal="true"
        aria-label={modal==='company'?'Dados do estabelecimento':'Prepare seu PDV'}>
        <header className="first-access-dialog-head">
          <div><span className="eyebrow">PRIMEIRO ACESSO</span><h2>{modal==='company'?'Dados do estabelecimento':'Prepare seu PDV'}</h2></div>
          <button type="button" className="first-access-icon-button" disabled={busy}
            aria-label="Fechar" onClick={()=>setModal(null)}><X size={19}/></button>
        </header>
        {modal==='company'?
          <form className="first-access-form" onSubmit={save}>
            <p>Esses dados ficam no banco local do estabelecimento e acompanham os backups.</p>
            <label>Nome do estabelecimento<input autoFocus required minLength={2} maxLength={120}
              value={form.name} onChange={ev=>setForm(old=>({...old,name:ev.target.value}))}
              placeholder="Ex.: Mercado Central"/></label>
            <label>CPF ou CNPJ<input required inputMode="numeric" maxLength={24}
              value={form.document} onChange={ev=>setForm(old=>({...old,document:ev.target.value}))}
              placeholder="CPF ou CNPJ do responsável"/></label>
            <label>Endereço<input required minLength={5} maxLength={300}
              value={form.address} onChange={ev=>setForm(old=>({...old,address:ev.target.value}))}
              placeholder="Rua, número, bairro e cidade"/></label>
            {error&&<p className="first-access-warning" role="alert">{error}</p>}
            <div className="first-access-footer"><button type="button" className="secondary" disabled={busy}
              onClick={()=>setModal('checklist')}>Voltar</button>
              <button type="submit" className="primary" disabled={busy}>{busy?'Salvando…':'Salvar dados'} <Check size={16}/></button>
            </div>
          </form>
          :<div className="first-access-panel">
            <p>Confira o que já está pronto. As etapas opcionais podem ser realizadas depois.</p>
            {progress}
            {error&&<p className="first-access-warning" role="alert">{error}</p>}
            {steps}{message}
            <div className="first-access-shortcuts">
              <h3>Atalhos de configuração</h3>
              <div>
                <button type="button" className="secondary" onClick={company}>Dados da loja</button>
                <button type="button" className="secondary" onClick={()=>navigate('products')}>Produtos</button>
                <button type="button" className="secondary" onClick={()=>navigate('cash')}>Caixa</button>
                <button type="button" className="secondary" onClick={()=>{
                  setModal(null);onStartTour();
                }}><GraduationCap size={16}/> Tour pelas telas</button>
                <button type="button" className="secondary" onClick={()=>{
                  setChecking(true);
                  api?.storeProfileGet().then(result=>{setProfile(result);setError('');})
                    .catch(err=>setError(errorText(err))).finally(()=>setChecking(false));
                }} disabled={checking}><RefreshCcw size={15}/> Reconsultar</button>
              </div>
            </div>
            <div className="first-access-footer">
              <button type="button" className="secondary" onClick={()=>setModal(null)}>Fechar</button>
              {status.operationReady?
                <button type="button" className="primary" onClick={dismiss}>Começar a trabalhar <ArrowRight size={16}/></button>:
                <button type="button" className="primary" onClick={company}>Completar dados da loja <ArrowRight size={16}/></button>}
            </div>
          </div>}
      </section>
    </div>}
  </>;
}
