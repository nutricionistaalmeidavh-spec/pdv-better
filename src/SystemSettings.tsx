import React,{useEffect,useState} from 'react';
import { Server,MonitorSmartphone,WifiOff,Printer,Scale,DatabaseBackup,ShieldAlert,RefreshCcw,Copy,Check,Settings2,Download,RotateCw } from 'lucide-react';
type Any=Record<string,any>;
const errText=(e:any)=>String(e?.message||e||'Operação indisponível').replace(/^Error invoking remote method.*?: Error: /,'');
export function SystemSettings(){
  const api=window.pdv;
  const [lan,setLan]=useState<Any>({});
  const [device,setDevice]=useState<Any>({printerHost:'',printerPort:9100,scaleHost:'',scalePort:4001,scaleTransport:'tcp',scaleBrand:'generic-streaming',scaleLabelMode:'DEFAULT_PRICE',scaleSerialPort:'',scaleBaudRate:9600,scaleRequestCommand:'ENQ'});
  const [scalePorts,setScalePorts]=useState<Array<{path:string;manufacturer:string}>>([]);
  const [printers,setPrinters]=useState<Any[]>([]);
  const [printJobs,setPrintJobs]=useState<Any[]>([]);
  const [printQueueError,setPrintQueueError]=useState('');
  const [address,setAddress]=useState('http://192.168.1.10:48791/');
  const [secret,setSecret]=useState('');
  const [port,setPort]=useState('48791');
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [tab,setTab]=useState<'network'|'devices'|'backup'|'updates'>('network');
  const [updateInfo,setUpdateInfo]=useState<Any|null>(null);
  const [updateBusy,setUpdateBusy]=useState(false);
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
  useEffect(()=>{
    if(!api)return;
    let mounted=true;
    void api.updateStatus().then(status=>{if(mounted)setUpdateInfo(status);})
      .catch(error=>{if(mounted)setUpdateInfo({phase:'error',error:errText(error),enabled:false});});
    const unsubscribe=api.onUpdateStatus(status=>{if(mounted)
      setUpdateInfo((previous:Any)=>({...previous,...status}));});
    return ()=>{mounted=false;unsubscribe();};
  },[api]);
  async function updateAction(action:'check'|'install'){
    if(!api||updateBusy)return;
    if(action==='install'&&!window.confirm('Feche as vendas antes de atualizar. O aplicativo salvará um backup local, fechará e executará o instalador. Continuar?'))return;
    setUpdateBusy(true);setError('');
    try{
      const status=action==='check'?await api.updateCheck():await api.updateInstall();
      setUpdateInfo((previous:Any)=>({...previous,...status}));
    }catch(e){setError(errText(e));}
    finally{setUpdateBusy(false);}
  }
  useEffect(()=>{
    if(tab!=='devices'||device.scaleTransport!=='serial'||!api)return;
    let active=true;
    void api.scalePorts().then(ports=>{if(active)setScalePorts(ports);})
      .catch(e=>{if(active)setError(errText(e));});
    return ()=>{active=false;};
  },[tab,device.scaleTransport]);
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
    <div className="page-heading"><div><div className="eyebrow">CONFIGURAÇÕES DO PDV</div><h1>Dispositivos, rede e backups</h1><p>Uma única fonte canônica de vendas, estoque e caixa, mesmo com vários terminais.</p></div><button className="secondary" onClick={()=>void reload()}><RefreshCcw size={16}/> Atualizar</button></div>
    <div className="settings-tabs" role="tablist" aria-label="Configurações do PDV">
      <button role="tab" aria-selected={tab==='network'} onClick={()=>setTab('network')}><Server size={16}/> Rede local</button>
      <button role="tab" aria-selected={tab==='devices'} onClick={()=>setTab('devices')}><Printer size={16}/> Periféricos</button>
      <button role="tab" aria-selected={tab==='backup'} onClick={()=>setTab('backup')}><DatabaseBackup size={16}/> Backups</button>
      <button role="tab" aria-selected={tab==='updates'} onClick={()=>setTab('updates')}><Download size={16}/> Atualizações{updateInfo?.phase==='downloaded'?' • Pronta':''}</button>
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
        <h2><Printer size={19}/> Fila de trabalhos pendentes</h2>
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
      <div className="panel settings-block">
        <h2><Scale size={19}/> Balanças e etiquetas</h2>
        <p>Use etiquetas EAN-13 geradas pela balança com leitor USB (modo teclado), ou capture o peso diretamente por rede TCP ou serial COM/USB.</p>
        <label className="settings-label">Formato da etiqueta EAN-13
          <select aria-label="Perfil de código da balança" value={device.scaleLabelMode||'DEFAULT_PRICE'} onChange={e=>setDevice((p:Any)=>({...p,scaleLabelMode:e.target.value}))}>
            <option value="DEFAULT_PRICE">Preço total embutido (prefixo 2)</option>
            <option value="DEFAULT_WEIGHT">Peso em gramas embutido (prefixo 2)</option>
            <option value="EXTENDED_PRODUCT">Produto estendido (prefixo 20)</option>
            <option value="legacy-brasil">Legado brasileiro (5 dígitos de preço)</option>
          </select>
        </label>
        <p className="settings-tip">O formato depende da configuração da balança, não apenas da marca. Para Ramuza, confirme o padrão com uma etiqueta real. Código de produto na etiqueta deve corresponder ao cadastro do PDV.</p>
        <label className="settings-label">Tipo de conexão para ler peso
          <select aria-label="Conexão da balança" value={device.scaleTransport||'tcp'} onChange={e=>setDevice((p:Any)=>({...p,scaleTransport:e.target.value}))}>
            <option value="tcp">Rede TCP</option>
            <option value="serial">Porta serial COM / USB</option>
          </select>
        </label>
        {device.scaleTransport==='serial'?<>
          <label className="settings-label">Porta COM da balança
            <select aria-label="Porta serial da balança" value={device.scaleSerialPort||''} onChange={e=>setDevice((p:Any)=>({...p,scaleSerialPort:e.target.value}))}>
              <option value="">Selecione uma porta COM</option>
              {device.scaleSerialPort&&!scalePorts.some(port=>port.path===device.scaleSerialPort)&&<option value={device.scaleSerialPort}>{device.scaleSerialPort} (salva, desconectada)</option>}
              {scalePorts.map(port=><option key={port.path} value={port.path}>{port.path} {port.manufacturer?'— '+port.manufacturer:''}</option>)}
            </select>
          </label>
          <button className="secondary" disabled={pending} onClick={()=>void run(async()=>{setScalePorts(await api!.scalePorts());},'Portas seriais atualizadas.',false)}>Atualizar portas COM</button>
          <label className="settings-label">Velocidade serial
            <select aria-label="Velocidade da balança" value={device.scaleBaudRate||9600} onChange={e=>setDevice((p:Any)=>({...p,scaleBaudRate:Number(e.target.value)}))}>
              {[1200,2400,4800,9600,19200,38400,57600,115200].map(baud=><option key={baud} value={baud}>{baud} baud</option>)}
            </select>
          </label>
          <label className="settings-label">Protocolo serial
            <select aria-label="Protocolo da balança" value={device.scaleBrand||'generic-streaming'} onChange={e=>setDevice((p:Any)=>({...p,scaleBrand:e.target.value}))}>
              <option value="toledo">Toledo</option>
              <option value="filizola">Filizola</option>
              <option value="generic-request-response">Genérico: solicita leitura</option>
              <option value="generic-streaming">Genérico: transmissão contínua</option>
            </select>
          </label>
          <label className="settings-label">Comando de leitura
            <select aria-label="Comando serial" value={device.scaleRequestCommand||'ENQ'} onChange={e=>setDevice((p:Any)=>({...p,scaleRequestCommand:e.target.value}))}>
              <option value="ENQ">ENQ (0x05)</option><option value="CR">CR (0x0D)</option><option value="NONE">Nenhum</option>
            </select>
          </label>
        </>:<>
          <label className="settings-label">IP da balança<input value={device.scaleHost||''} placeholder="192.168.1.110" onChange={e=>setDevice((p:Any)=>({...p,scaleHost:e.target.value}))}/></label>
          <label className="settings-label">Porta TCP<input type="number" min="1" max="65535" value={device.scalePort||4001} onChange={e=>setDevice((p:Any)=>({...p,scalePort:Number(e.target.value)}))}/></label>
        </>}
        <button className="secondary" disabled={pending||(device.scaleTransport==='serial'?!device.scaleSerialPort:!device.scaleHost)} onClick={()=>void run(()=>api!.scaleRead(),'',false)}>Ler peso agora</button>
        <p className="settings-tip">A leitura direta rejeita peso inválido e instável. O leitor USB de etiquetas EAN-13 funciona pelo campo Código da frente de caixa, mesmo sem conexão direta com a balança.</p>
      </div>
      <div className="panel settings-block">
        <h2><Scale size={19}/> Exportar produtos para balanças etiquetadoras</h2>
        <p>Gera arquivos TXT locais de carga de produtos para Toledo e Urano usando nome, código numérico e preço do cadastro. A marca Ramuza exige layout confirmado pelo manual do modelo.</p>
        <button className="secondary" disabled={pending} onClick={()=>void run(()=>api!.scaleExport('toledo'),'Arquivo ITENSMGV.TXT gerado. Confira os produtos na balança.',false)}>Exportar Toledo (ITENSMGV.TXT)</button>
        <button className="secondary" disabled={pending} onClick={()=>void run(()=>api!.scaleExport('urano'),'Arquivo PRODUTOS.TXT gerado. Confira os produtos na balança.',false)}>Exportar Urano (PRODUTOS.TXT)</button>
        <p className="settings-tip">Somente produtos ativos com código numérico de até 6 dígitos são elegíveis. Nada é enviado automaticamente para dispositivos.</p>
      </div>
      <div className="settings-wide"><button className="primary" disabled={pending} onClick={()=>void run(()=>api!.deviceSet(device),'Configuração de periféricos salva neste computador.')}><Check size={16}/> Salvar periféricos</button></div>
    </div>}
    {updateInfo?.phase==='downloaded'&&tab!=='updates'&&
      <div className="notice success" role="status">
        Nova versão {updateInfo.version} baixada. Acesse Atualizações para instalá-la após fechar os caixas.
      </div>}
    {tab==='updates'&&<div className="settings-grid">
      <div className="panel settings-block">
        <h2><Download size={19}/> Atualização do PDV Plus</h2>
        <p>Versão instalada: <strong>{updateInfo?.currentVersion||'—'}</strong></p>
        <p>Distribuição gratuita via GitHub Releases. O sistema verifica novas versões ao iniciar e a cada seis horas, quando conectado à internet.</p>
        <div className="settings-info" role="status">
          {updateInfo?.phase==='disabled'?'Atualizador disponível somente no aplicativo Windows instalado.':
           updateInfo?.phase==='checking'?'Procurando uma nova versão...':
           updateInfo?.phase==='available'?'Nova versão '+updateInfo.version+' encontrada; iniciando download...':
           updateInfo?.phase==='downloading'?'Baixando versão '+updateInfo.version+': '+updateInfo.progress+'%':
           updateInfo?.phase==='downloaded'?'Versão '+updateInfo.version+' pronta para instalação.':
           updateInfo?.phase==='installing'?'Fechando o aplicativo para concluir a atualização...':
           updateInfo?.phase==='up-to-date'?'Sistema atualizado.':
           updateInfo?.phase==='error'?'Falha ao verificar ou baixar: '+(updateInfo.error||'Erro de rede'):
           'Aguardando verificação automática.'}
        </div>
        {updateInfo?.phase==='downloading'&&
          <progress style={{width:'100%'}} max={100} value={Number(updateInfo.progress)||0}/>}
        <button className="secondary" disabled={updateBusy||!updateInfo?.enabled||['checking','downloading','installing','downloaded'].includes(updateInfo?.phase)}
          onClick={()=>void updateAction('check')}><RefreshCcw size={16}/> Buscar atualização agora</button>
        <button className="primary" disabled={updateBusy||updateInfo?.phase!=='downloaded'||!updateInfo?.canInstall}
          onClick={()=>void updateAction('install')}><RotateCw size={16}/> Instalar e reiniciar</button>
        {updateInfo?.phase==='downloaded'&&!updateInfo.canInstall&&
          <p className="settings-tip">Um gerente ou administrador deve autorizar a instalação.</p>}
      </div>
      <div className="settings-note"><ShieldAlert size={19}/>
        <p>A atualização é baixada em segundo plano, mas <strong>nunca reinicia durante uma venda</strong>. Antes da instalação, todos os caixas abertos devem ser fechados. No computador servidor, é gerado um backup SQLite validado. Sem internet, o PDV continua operando normalmente. As instalações anteriores à versão 0.6.0 precisam de uma última atualização manual.</p>
      </div>
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
