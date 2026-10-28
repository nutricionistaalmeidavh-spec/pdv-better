import React,{useEffect,useState} from 'react';
import {App} from './App';
import {ShieldCheck,Server,LogIn,EyeOff,Eye} from 'lucide-react';
type Person={id:string;name:string;role:string};
const errText=(error:any)=>String(error?.message||error||'Operação indisponível').replace(/^Error invoking remote method.*?: Error: /,'');
export function AuthGate(){
 const api=window.pdv;
 const [status,setStatus]=useState<{setupRequired:boolean;operators:Person[]}|null>(null);
 const [user,setUser]=useState<Person|null>(null);
 const [operatorId,setOperatorId]=useState('');
 const [name,setName]=useState('');
 const [password,setPassword]=useState('');
 const [repeat,setRepeat]=useState('');
 const [address,setAddress]=useState('http://192.168.1.10:48791/');
 const [pairing,setPairing]=useState('');
 const [advanced,setAdvanced]=useState(false);
 const [lanMode,setLanMode]=useState('local');
 const [show,setShow]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 async function refresh(){
   try{
     if(!api)throw new Error('Inicie pelo executável Electron do PDV Better.');
     const net=await api.lanStatus();setLanMode(net.mode);
     const data=await api.authStatus();
     setStatus(data);setOperatorId(old=>data.operators.some(x=>x.id===old)?old:(data.operators[0]?.id||''));
     setError('');
   }catch(e){setError(errText(e));}
 }
 useEffect(()=>{void refresh();},[]);
 const submit=async(ev:React.FormEvent)=>{
   ev.preventDefault();if(!api||busy)return;
   setError('');setBusy(true);
   try{
     if(status?.setupRequired&&password!==repeat)throw new Error('As senhas digitadas são diferentes.');
     const result=status?.setupRequired?await api.authBootstrap({name,password}):await api.authLogin({operatorId,password});
     setPassword('');setRepeat('');setUser(result);
   }catch(e){setError(errText(e));}
   finally{setBusy(false);}
 };
 const logout=async()=>{
   try{await api?.authLogout();}catch{}
   setUser(null);setStatus(null);setPassword('');setRepeat('');
   await refresh();
 };
 if(user)return <App user={user} onLogout={logout}/>;
 return <div className="auth-screen"><div className="auth-panel">
   <div className="auth-icon"><ShieldCheck size={25}/></div>
   <h1>PDV Better</h1><p>{status?.setupRequired?'Configure o primeiro administrador do estabelecimento.':'Acesse com sua conta de operador para usar o caixa.'}</p>
   <form onSubmit={submit} className="auth-form">
     {status?.setupRequired?
       <label>Nome do administrador<input required autoFocus value={name} autoComplete="name" onChange={e=>setName(e.target.value)}/></label>
       :<label>Operador<select required value={operatorId} onChange={e=>setOperatorId(e.target.value)}><option value="" disabled>Selecione o operador</option>{status?.operators.map(op=><option key={op.id} value={op.id}>{op.name} — {op.role}</option>)}</select></label>}
     <label>Senha de acesso<div className="auth-password"><input type={show?'text':'password'} required minLength={status?.setupRequired?8:1} autoComplete={status?.setupRequired?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" title={show?'Ocultar senha':'Mostrar senha'} onClick={()=>setShow(x=>!x)}>{show?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></label>
     {status?.setupRequired&&<label>Repita a senha<input type="password" required minLength={8} autoComplete="new-password" value={repeat} onChange={e=>setRepeat(e.target.value)}/></label>}
     {error&&<p role="alert" className="auth-error">{error}</p>}
     <button className="primary" type="submit" disabled={busy||!status||(status.setupRequired&&!name)||( !status.setupRequired&&!operatorId)}><LogIn size={17}/>{busy?'Acessando…':status?.setupRequired?'Criar administrador':'Entrar no PDV'}</button>
   </form>
   <button type="button" className="auth-connect" onClick={()=>setAdvanced(x=>!x)}><Server size={15}/> {advanced?'Ocultar conexão LAN':'Conectar a um servidor LAN'}</button>
   {advanced&&<div className="auth-form">
      <label>Endereço do servidor<input value={address} onChange={e=>setAddress(e.target.value)} placeholder="http://192.168.1.10:48791/"/></label>
      <label>Chave de pareamento<input type="password" autoComplete="off" value={pairing} onChange={e=>setPairing(e.target.value)}/></label>
      <button className="secondary" type="button" disabled={busy} onClick={()=>void(async()=>{
       try{setBusy(true);await api?.lanJoin({address,secret:pairing});await refresh();setAdvanced(false);setPairing('');}
       catch(e){setError(errText(e));}
       finally{setBusy(false);}
      })()}>Conectar e selecionar operador</button>
      {lanMode==='client'&&<button type="button" className="secondary" disabled={busy} onClick={()=>void(async()=>{
        try{setBusy(true);await api?.lanLocal();await refresh();setAdvanced(false);}
        catch(e){setError(errText(e));}finally{setBusy(false);}
      })()}>Voltar ao banco local deste computador</button>}
   </div>}
   <span className="auth-footer">Funcionamento local e LAN privada · Windows 10/11</span>
 </div></div>;
}
