import React,{useEffect,useState} from 'react';
import { Server,MonitorSmartphone,WifiOff,Printer,Scale,DatabaseBackup,ShieldAlert,RefreshCcw,Copy,Check,Settings2 } from 'lucide-react';
type Any=Record<string,any>;
const errText=(e:any)=>String(e?.message||e||'Operação indisponível').replace(/^Error invoking remote method.*?: Error: /,'');
export function SystemSettings(){
  const api=window.pdv;
  const [lan,setLan]=useState<Any>({});
  const [device,setDevice]=useState<Any>({printerHost:'',printerPort:9100,scaleHost:'',scalePort:4001});
  const [printers,setPrinters]=useState<Any[]>([]);
  const [printJobs,setPrintJobs]=useState<Any[]>([]);
  const [printQueueError,setPrintQueueError]=useState('');
  const [address,setAddress]=useState('http://192.168.1.10:48791/');
  const [secret,setSecret]=useState('');
  const [port,setPort]=useState('48791');
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [tab,setTab]=useState<'network'|'devices'|'backup'>('network');
  async function reload(){
    if(!api)return;
    try{
      const [status,prefs,list,jobs]=await Promise.all([
        api.lanStatus(),api.deviceGet(),api.devicePrinters(),
        api.printQueueList().catch(e=>{setPrintQueueError(errText(e));return [];})
      ]);
      setLan(status);setDevice(prefs);setPrinters(list);setPrintJobs(jobs);setError('');
    }catch(e){setError(errText(e));}
  }
  useEffect(()=>{void reload();},[]);
  async function run(job:()=>Promise<any>,message:string,refresh=true){
    if(!api||pending)return;
    setPending(true);setError('');setNotice('');
    try{
      const value=await job();
      if(value?.cancelled){setNotice('Operação cancelada. Nenhum dado foi alterado.');return;}
      if(refresh)await reload();
      setNotice(typeof value==='number' && !message ? 'Peso estável: '+(value/1000).toLocaleString('pt-BR',{maximumFractionDigits:3})+' kg.' : message);
    }catch(e){setError(errText(e));}
    finally{setPending(false);}
  }
  return <div className="system-settings">
    <div className="page-heading"><div><div className="eyebrow">MARCO C / CONFIGURAÇÃO LOCAL</div><h1>Dispositivos, rede e backups</h1><p>Uma única fonte canônica de vendas, estoque e caixa, mesmo com vários terminais.</p></div><button className="secondary" onClick={()=>void reload()}><RefreshCcw size={16}/> Atualizar</button></div>
    <div className="settings-tabs" role="tablist" aria-label="Configurações do PDV">
      <button role="tab" aria-selected={tab==='network'} onClick={()=>setTab('network')}><Server size={16}/> Rede local</button>
      <button role="tab" aria-selected={tab==='devices'} onClick={()=>setTab('devices')}><Printer size={16}/> Periféricos</button>
      <button role="tab" aria-selected={tab==='backup'} onClick={()=>setTab('backup')}><DatabaseBackup size={16}/> Backups</button>
    </div>
    {error&&<div className="notice danger" role="alert">{error}</div>}
    {notice&&<div className="notice success" role="status"><Check size={17}/>{notice}</div>}
    {tab==='network'&&<div className="settings-grid">
      <div className="panel settings-block"><h2><Server size={19}/> Servidor do estabelecimento</h2>
        <p>O computador servidor mantém o SQLite. Os demais caixas acessam este mesmo banco; não são feitas cópias concorrentes.</p>
        <div className="settings-info"><strong>Modo atual:</strong> {lan.mode==='host'?'Servidor LAN':lan.mode==='client'?'Terminal conectado':'Somente este computador'}</div>
        {lan.mode==='host'?<><p>Endereço de acesso: {(lan.addresses||[]).map((x:string)=><code key={x}>http://{x}:{lan.port}/ </code>)}</p><label className="settings-label">Chave de pareamento (não compartilhe fora da loja)<input aria-label="Chave de pareamento" readOnly value={lan.pairingKey||''}/></label>
          <button className="secondary" disabled={pending} onClick={()=>void run(()=>api!.lanLocal(),'Servidor LAN desativado. O banco local permanece intacto.')}>Desativar compartilhamento</button></>
        :<><label className="settings-label">Porta do servidor<input type="number" min="1024" max="65535" value={port} onChange={e=>setPort(e.target.value)}/></label>
          <button className="primary" disabled={pending} onClick={()=>void run(()=>api!.lanHost({port:Number(port)}),'Servidor LAN ativado. Use a chave de pareamento nos demais computadores.')}><Server size={16}/> Ativar servidor LAN</button></>}
      </div>
      <div className="panel settings-block"><h2><MonitorSmartphone size={19}/> Conectar terminal</h2>
        <p>Configure apenas nos caixas auxiliares. Eles usarão exclusivamente o banco do servidor enquanto conectados.</p>
        <label className="settings-label">Endereço do servidor<input aria-label="Endereço do servidor LAN" placeholder="http://192.168.1.10:48791/" value={address} onChange={e=>setAddress(e.target.value)}/></label>
        <label className="settings-label">Chave do servidor<input aria-label="Chave do servidor LAN" type="password" autoComplete="off" value={secret} onChange={e=>setSecret(e.target.value)}/></label>
        <button className="primary" disabled={pending} onClick={()=>void run(()=>api!.lanJoin({address,secret}),'Terminal conectado à base canônica. Reabra os módulos para atualizar os dados.')}><MonitorSmartphone size={16}/> Conectar ao servidor</button>
        {lan.mode==='client'&&<div className="settings-info">Conectado a <strong>{lan.address}</strong><button className="secondary" onClick={()=>void run(()=>api!.lanLocal(),'Modo local restaurado. Dados do servidor não foram copiados.')}>Voltar ao banco deste PC</button></div>}
      </div>
      <div className="settings-note"><ShieldAlert size={19}/><p>Uso restrito a uma <strong>LAN privada e confiável</strong>. O protocolo HTTP local não cifra os dados em trânsito. Não abra a porta no roteador nem publique o servidor na internet. Para acesso externo, utilize VPN privada. Sem conexão ao servidor, o terminal não grava vendas na sua base local.</p></div>
    </div>}
    {tab==='devices'&&<div className="settings-grid">
      <div className="panel settings-block"><h2><Printer size={19}/> Impressão</h2>
        <p>Impressoras USB/Windows usam o serviço de impressão do sistema. Rede ESC/POS envia comandos TCP na rede privada.</p>
        <div className="settings-info"><strong>Impressoras instaladas:</strong> {printers.length?printers.map(p=>p.displayName).join(', '):'Nenhuma detectada'}</div>
        <label className="settings-label">Endereço IPv4 da impressora ESC/POS<input value={device.printerHost||''} placeholder="192.168.1.100" onChange={e=>setDevice((p:Any)=>({...p,printerHost:e.target.value}))}/></label>
        <label className="settings-label">Porta TCP<input type="number" min="1" max="65535" value={device.printerPort||9100} onChange={e=>setDevice((p:Any)=>({...p,printerPort:Number(e.target.value)}))}/></label>
        <p className="settings-tip">Abertura de gaveta: somente ao tocar no botão. Requer gaveta ligada à impressora ESC/POS de rede.</p>
        <button className="secondary" disabled={pending||!device.printerHost} onClick={()=>void run(()=>api!.drawerOpen(),'Pulso enviado à gaveta de dinheiro.',false)}>Testar gaveta</button>
      </div>
      <div className="panel settings-block">
        <h2><Printer size={19}/> Fila local de impressão</h2>
        <p>Falhas permanecem registradas neste computador, inclusive após reinício. Antes de reenviar, confirme que a impressão anterior não saiu: um desligamento pode ocorrer após a impressora receber os dados.</p>
        {printQueueError&&<p className="form-error" role="alert">{printQueueError}</p>}
        {printJobs.length===0&&<p>Não há trabalhos na fila.</p>}
        {printJobs.slice(0,30).map(job=><div className="settings-info" key={job.id}>
          <strong>{job.payload.kind} · {job.status==='printed'?'Concluído':job.status==='failed'?'Falhou':'Pendente'}</strong>
          <div>Tentativas: {job.attempts} · {job.created_at?.slice(0,19)}</div>
          {job.last_error&&<small role="status">{job.last_error}</small>}
          {job.status!=='printed'&&<button className="secondary" disabled={pending} onClick={()=>{
            if(window.confirm('Confirme que não houve impressão física antes de reenviar. Continuar?'))
              void run(()=>api!.printQueueRetry(job.id),'Impressão reenviada; retorno do dispositivo registrado.');
          }}>Tentar novamente</button>}
        </div>)}
        <button className="plain" disabled={pending||!printJobs.some(x=>x.status==='printed')} onClick={()=>{
          if(window.confirm('Remover apenas os trabalhos já concluídos da fila?'))
            void run(()=>api!.printQueuePurge(),'Itens concluídos removidos da fila.');
        }}>Limpar impressões concluídas</button>
      </div>
      <div className="panel settings-block"><h2><Scale size={19}/> Balança de rede</h2>
        <p>Leitura TCP de peso estável em quilogramas. O PDV rejeita leituras negativas ou instáveis.</p>
        <label className="settings-label">IP da balança<input value={device.scaleHost||''} placeholder="192.168.1.110" onChange={e=>setDevice((p:Any)=>({...p,scaleHost:e.target.value}))}/></label>
        <label className="settings-label">Porta TCP<input type="number" min="1" max="65535" value={device.scalePort||4001} onChange={e=>setDevice((p:Any)=>({...p,scalePort:Number(e.target.value)}))}/></label>
        <button className="secondary" disabled={pending||!device.scaleHost} onClick={()=>void run(async()=>{return api!.scaleRead();},'',false)}>Ler peso agora</button>
        <p className="settings-tip">Leitor de código de barras USB tipo teclado funciona na pesquisa da frente de caixa; etiquetas podem ser impressas pelo cadastro de produtos.</p>
      </div>
      <div className="settings-wide"><button className="primary" disabled={pending} onClick={()=>void run(()=>api!.deviceSet(device),'Configuração de periféricos salva neste computador.')}><Check size={16}/> Salvar periféricos</button></div>
    </div>}
    {tab==='backup'&&<div className="settings-grid">
      <div className="panel settings-block"><h2><DatabaseBackup size={19}/> Exportar backup</h2>
        <p>Cria uma cópia consistente do SQLite, incluindo vendas, histórico, estoque, clientes e finanças. Funciona com WAL ativo.</p>
        <button className="primary" disabled={pending||lan.mode==='client'} onClick={()=>void run(()=>api!.backupCreate(),'Backup SQLite criado e validado.',false)}>Salvar backup SQLite</button>
      </div>
      <div className="panel settings-block"><h2><WifiOff size={19}/> Restaurar backup</h2>
        <p>Verifica integridade, agenda a restauração e reinicia. O banco anterior será preservado com a extensão .pre-restore-....sqlite.</p>
        <button className="secondary" disabled={pending||lan.mode==='client'} onClick={()=>{
          if(window.confirm('Restaurar backup substituirá os dados ativos e reiniciará o aplicativo. O banco anterior será preservado. Continuar?'))
            void run(()=>api!.backupRestore(),'Restauração agendada. O aplicativo será reiniciado.',false);
        }}>Selecionar backup e restaurar</button>
      </div>
      <div className="settings-note"><ShieldAlert size={19}/><p>Backup e restauração são executados no computador que mantém a base canônica. Uma restauração não mistura bases diferentes: substitui o arquivo íntegro após validação. Para segurança adicional, mantenha cópias em dispositivo separado.</p></div>
    </div>}
  </div>;
}
