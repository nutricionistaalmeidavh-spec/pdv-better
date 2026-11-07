import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,GraduationCap,Play,X} from 'lucide-react';
import {getTourSteps,tourStorageKey,hasCompletedTour,nextTourStepIndex,previousTourStepIndex} from '../shared/guided-tour.mjs';

type Mode='idle'|'invite'|'tour';
type Rect={top:number;left:number;width:number;height:number};
type Position={top:number;left:number};
type Props={userId:string;role:string;view:string;loading:boolean;startSignal:number;onNavigate:(view:string)=>void};

export function GuidedTour({userId,role,view,loading,startSignal,onNavigate}:Props){
  const steps=useMemo(()=>getTourSteps(role),[role]);
  const [mode,setMode]=useState<Mode>('idle');
  const [index,setIndex]=useState(0);
  const [spotlight,setSpotlight]=useState<Rect|null>(null);
  const [position,setPosition]=useState<Position|null>(null);
  const dialogRef=useRef<HTMLDivElement>(null);
  const step=steps[index];

  function remember(value:'completed'|'dismissed'){
    try{localStorage.setItem(tourStorageKey(userId),value);}catch{/* O tour funciona mesmo sem armazenamento. */}
  }
  function start(){
    setIndex(0);setSpotlight(null);setPosition(null);setMode('tour');
    onNavigate(steps[0].view);
  }
  function exit(value:'completed'|'dismissed'){
    remember(value);setMode('idle');setSpotlight(null);
  }
  function move(nextIndex:number){
    setIndex(nextIndex);setSpotlight(null);setPosition(null);
    if(steps[nextIndex]?.view!==view)onNavigate(steps[nextIndex].view);
  }

  // Primeiro acesso: convite discreto e não bloqueante; o caixa continua utilizável.
  useEffect(()=>{
    if(loading)return;
    let seen=false;
    try{seen=hasCompletedTour(localStorage.getItem(tourStorageKey(userId)));}catch{}
    if(!seen)setMode(old=>old==='idle'?'invite':old);
  },[loading,userId]);
  useEffect(()=>{if(startSignal>0)start();},[startSignal]);

  useLayoutEffect(()=>{
    if(mode!=='tour'||!step||view!==step.view)return;
    let animation=0;
    let resizeObserver:ResizeObserver|undefined;
    const update=()=>{
      const element=document.querySelector<HTMLElement>(step.selector);
      if(!element){setSpotlight(null);setPosition(null);return;}
      const rect=element.getBoundingClientRect();
      if(rect.width<1||rect.height<1){setSpotlight(null);setPosition(null);return;}
      const pad=6;
      const next={top:Math.max(6,rect.top-pad),left:Math.max(6,rect.left-pad),
        width:Math.min(window.innerWidth-12,rect.width+pad*2),
        height:Math.min(window.innerHeight-12,rect.height+pad*2)};
      setSpotlight(next);
      const width=Math.min(360,window.innerWidth-24);
      const height=275;
      const below=rect.bottom+20;
      const top=below+height<window.innerHeight-12?below:Math.max(12,rect.top-height-20);
      const left=Math.max(12,Math.min(window.innerWidth-width-12,rect.left));
      setPosition({top:Math.min(window.innerHeight-120,top),left});
    };
    const element=document.querySelector<HTMLElement>(step.selector);
    if(element){
      element.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
      resizeObserver=new ResizeObserver(update);resizeObserver.observe(element);
    }
    animation=requestAnimationFrame(update);
    window.addEventListener('resize',update);
    window.addEventListener('scroll',update,true);
    return ()=>{cancelAnimationFrame(animation);resizeObserver?.disconnect();
      window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};
  },[mode,index,view,step?.id]);

  useEffect(()=>{
    if(mode!=='tour')return;
    dialogRef.current?.focus();
    const handleKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();exit('dismissed');return;}
      if(event.key!=='Tab'||!dialogRef.current)return;
      const controls=Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled)'));
      if(!controls.length)return;
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialogRef.current)){
        event.preventDefault();last.focus();
      }else if(!event.shiftKey&&document.activeElement===last){
        event.preventDefault();first.focus();
      }
    };
    document.addEventListener('keydown',handleKey);
    return ()=>document.removeEventListener('keydown',handleKey);
  },[mode,index]);

  if(loading||mode==='idle')return null;
  // Não sobrepor botões de cadastro, pagamento ou modais operacionais.
  if(mode==='invite'&&view!=='dashboard')return null;
  if(mode==='invite')return <aside className="guided-tour-invite" aria-label="Convite para conhecer o PDV SUPER">
    <div className="guided-tour-invite-icon"><GraduationCap size={21}/></div>
    <div className="guided-tour-invite-copy">
      <strong>Primeira vez por aqui?</strong>
      <p>Conheça as telas do PDV SUPER em um tour rápido e interativo.</p>
      <div className="guided-tour-invite-actions">
        <button type="button" className="guided-tour-start" onClick={start}><Play size={14}/> Começar tour</button>
        <button type="button" className="guided-tour-skip" onClick={()=>exit('dismissed')}>Agora não</button>
      </div>
    </div>
    <button type="button" className="guided-tour-invite-close" onClick={()=>exit('dismissed')} aria-label="Dispensar tour"><X size={17}/></button>
  </aside>;

  if(!step)return null;
  const last=index===steps.length-1;
  return <div className="guided-tour-root">
    <div className={'guided-tour-veil'+(!spotlight?' guided-tour-veil-full':'')} aria-hidden="true"/>
    {spotlight&&<div className="guided-tour-spotlight" aria-hidden="true" style={{
      top:spotlight.top,left:spotlight.left,width:spotlight.width,height:spotlight.height
    }}/>}
    <div className="guided-tour-card" ref={dialogRef} tabIndex={-1}
      role="dialog" aria-modal="true" aria-label="Tour guiado do PDV SUPER"
      style={position?{top:position.top,left:position.left}:undefined}>
      <div className="guided-tour-card-top">
        <span><GraduationCap size={17}/> TOUR GUIADO</span>
        <button type="button" aria-label="Fechar tour" title="Pular tour" onClick={()=>exit('dismissed')}><X size={18}/></button>
      </div>
      <div className="guided-tour-progress" aria-label={`Passo ${index+1} de ${steps.length}`}>
        {steps.map((s,i)=><span key={s.id} className={i<=index?'done':''}/>)}
      </div>
      <div className="guided-tour-count">PASSO {index+1} DE {steps.length}</div>
      <h2>{step.title}</h2>
      <p>{step.description}</p>
      <div className="guided-tour-actions">
        <button type="button" className="guided-tour-skip" onClick={()=>exit('dismissed')}>Pular</button>
        <div className="guided-tour-actions-right">
          <button type="button" className="guided-tour-back" disabled={index===0}
            onClick={()=>move(previousTourStepIndex(index))}><ArrowLeft size={16}/> Voltar</button>
          {last?
            <button type="button" className="guided-tour-next" onClick={()=>exit('completed')}><Check size={16}/> Concluir</button>:
            <button type="button" className="guided-tour-next" onClick={()=>move(nextTourStepIndex(index,steps.length))}>Próximo <ArrowRight size={16}/></button>}
        </div>
      </div>
    </div>
  </div>;
}
