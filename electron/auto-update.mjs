// Atualizador Windows NSIS: GitHub Releases público, sem token no cliente.
// Nunca instala durante uma venda ou antes de obter backup local íntegro.
export function createUpdateManager({
  app, platform=process.platform, updater, notify=()=>{},
  listOpenSessions=async()=>[], backup=async()=>{},
  schedule=setTimeout, repeat=setInterval, clear=clearInterval,
  confirmUpdate=async()=>false, reportError=async()=>{}, logger=console
}){
  const enabled=Boolean(app?.isPackaged&&platform==='win32'&&updater);
  let state={
    enabled,currentVersion:String(app?.getVersion?.()||''),
    phase:enabled?'idle':'disabled',version:null,progress:0,error:null
  };
  let checking=false,started=false,installing=false;
  const timers=[];
  const status=()=>({...state});
  const publish=patch=>{
    state={...state,...patch};
    try{notify(status());}catch(e){logger?.warn?.('Falha ao informar atualização:',e?.message);}
  };
  const errorMessage=error=>String(error?.message||error||'Falha desconhecida').slice(0,240);
  if(enabled){
    updater.autoDownload=false;
    updater.autoInstallOnAppQuit=false;
    updater.allowPrerelease=false;
    updater.allowDowngrade=false;
    updater.on('checking-for-update',()=>publish({phase:'checking',error:null}));
    updater.on('update-available',info=>publish({phase:'available',version:String(info?.version||''),progress:0,error:null}));
    updater.on('download-progress',progress=>publish({phase:'downloading',progress:Math.max(0,Math.min(100,Math.round(Number(progress?.percent)||0)))}));
    updater.on('update-downloaded',info=>publish({phase:'downloaded',version:String(info?.version||state.version||''),progress:100,error:null}));
    updater.on('update-not-available',()=>publish({phase:'up-to-date',version:null,progress:0,error:null}));
    updater.on('error',error=>publish({phase:'error',error:errorMessage(error)}));
  }
  async function offerUpdate(){
    if(!['available','downloaded'].includes(state.phase))return;
    const version=state.version;
    if(!await confirmUpdate(status()))return;
    if(state.phase==='available'){
      publish({phase:'downloading',progress:0,error:null});
      try{
        await updater.downloadUpdate();
        if(state.phase!=='downloaded')throw new Error('Download não confirmado pelo atualizador.');
      }catch(error){
        publish({phase:'error',error:errorMessage(error)});
        await reportError(errorMessage(error));
        return;
      }
    }
    if(state.phase!=='downloaded'||state.version!==version)return;
    try{await install();}catch(error){await reportError(errorMessage(error));}
  }
  async function check({offer=true}={}){
    if(!enabled)throw new Error('Atualização disponível somente no aplicativo instalado no Windows.');
    if(checking||installing||state.phase==='downloading'||state.phase==='installing')return status();
    checking=true;
    try{
      if(state.phase!=='downloaded'){
        publish({phase:'checking',error:null});
        await updater.checkForUpdates();
      }
      if(offer)await offerUpdate();
    }
    catch(error){publish({phase:'error',error:errorMessage(error)});logger?.warn?.('Falha ao verificar atualização:',errorMessage(error));}
    finally{checking=false;}
    return status();
  }
  async function install(){
    if(!enabled||state.phase!=='downloaded'||installing)throw new Error('Atualização ainda não foi baixada e não está pronta para instalação.');
    installing=true;
    try{
      const sessions=await listOpenSessions();
      if(!Array.isArray(sessions))throw new Error('Não foi possível validar os caixas abertos.');
      if(sessions.length)throw new Error('Feche todos os caixas abertos antes de instalar a atualização.');
      // O backup ocorre enquanto a versão antiga ainda está funcionando.
      await backup();
      const remaining=await listOpenSessions();
      if(!Array.isArray(remaining)||remaining.length)throw new Error('Feche todos os caixas antes de instalar a atualização.');
      publish({phase:'installing',error:null});
      updater.quitAndInstall(true,true);
      return status();
    }catch(error){
      if(state.phase==='installing')publish({phase:'downloaded',error:errorMessage(error)});
      throw error;
    }finally{installing=false;}
  }
  function start(){
    if(!enabled||started)return;
    started=true;
    timers.push({handle:schedule(()=>check(),1000),kind:'schedule'});
    timers.push({handle:repeat(()=>check({offer:false}),6*60*60*1000),kind:'repeat'});
  }
  function stop(){
    for(const timer of timers)try{clear(timer.handle);}catch{}
    timers.length=0;
  }
  return {status,check,install,start,stop};
}
