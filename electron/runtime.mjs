import { randomBytes,randomUUID } from 'node:crypto';
import {allowed} from '../shared/access.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { startLanServer,requestLan,ALLOWED_RPC,validateToken } from './lan.mjs';

export function localAddresses(){
  const found=[];
  for(const list of Object.values(networkInterfaces()))
    for(const x of list||[])if(x.family==='IPv4'&&!x.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(x.address))found.push(x.address);
  return [...new Set(found)];
}
export async function createRuntime({store,folder,safeStorage}){
  const filename=join(folder,'lan-settings.json');
  const terminalFile=join(folder,'terminal-id.txt');
  let terminalId;
  if(existsSync(terminalFile))terminalId=readFileSync(terminalFile,'utf8').trim();
  else{terminalId=randomUUID();writeFileSync(terminalFile,terminalId,{mode:0o600});}
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(terminalId))throw new Error('Identificador de terminal corrompido.');
  let mode='local',server=null,url='',token='',startError='',sessionToken='',user=null;
  const encrypt=value=>{
    if(!safeStorage?.isEncryptionAvailable())throw new Error('Criptografia local indisponível; conexão LAN não foi salva.');
    return safeStorage.encryptString(value).toString('base64');
  };
  const decrypt=value=>safeStorage.decryptString(Buffer.from(value,'base64'));
  const save=config=>writeFileSync(filename,JSON.stringify(config),{encoding:'utf8',mode:0o600});
  const closeServer=async()=>{if(server){await server.close();server=null;}};
  async function host({port=48791}={}){
    await closeServer();
    const nextToken=randomBytes(32).toString('hex');
    const encrypted=encrypt(nextToken);
    const next=await startLanServer({host:'0.0.0.0',port,token:nextToken,store});
    try{save({mode:'host',port:next.port,secret:encrypted});}
    catch(error){await next.close();throw error;}
    mode='host';server=next;token=nextToken;url='';startError='';
    return status();
  }
  async function connectClient({address,secret}={}){
    if(typeof address!=='string'||typeof secret!=='string')throw new Error('Endereço e chave do servidor são obrigatórios.');
    const key=validateToken(secret);
    await requestLan(address,key,'authStatus',[],null,terminalId);
    const encrypted=encrypt(key);
    save({mode:'client',address,secret:encrypted});
    await closeServer();
    mode='client';url=address;token=key;startError='';sessionToken='';user=null;
    return status();
  }
  async function local(){
    save({mode:'local'});
    await closeServer();mode='local';url='';token='';startError='';sessionToken='';user=null;
    return status();
  }
  function status(){
    return {mode,port:server?.port||null,addresses:localAddresses(),address:url,
      pairingKey:mode==='host'&&user?.role==='Administrador'?token:null,terminalId,warning:startError};
  }
  async function authStatus(){
    return mode==='client' ? requestLan(url,token,'authStatus',[],null,terminalId):store.authStatus();
  }
  async function bootstrap(input){
    const result=mode==='client' ? await requestLan(url,token,'authBootstrap',[input],null,terminalId):store.authBootstrap(input,terminalId);
    sessionToken=result.token;user=result.user;
    return result.user;
  }
  async function login(input){
    const result=mode==='client' ? await requestLan(url,token,'authLogin',[input],null,terminalId):store.authLogin(input,terminalId);
    sessionToken=result.token;user=result.user;
    return result.user;
  }
  async function logout(){
    const key=sessionToken;sessionToken='';user=null;
    if(!key)return {loggedOut:true};
    return mode==='client'?requestLan(url,token,'authLogout',[],key,terminalId):store.authLogout(key);
  }
  function authorize(method,args=[]){
    if(!user||!sessionToken)throw new Error('Sessão não autenticada.');
    if(mode!=='client')user=store.authCurrent(sessionToken,terminalId);
    if(!allowed(user.role,method,args))throw new Error('Permissão insuficiente.');
    return user;
  }
  async function call(method,...args){
    if(!ALLOWED_RPC.includes(method)||['authBootstrap','authLogin','authLogout','authStatus'].includes(method))
      throw new Error('Operação de domínio não autorizada.');
    authorize(method,args);
    if(mode==='client')return requestLan(url,token,method,args,sessionToken,terminalId);
    return store.secureCall(method,args,{sessionToken,terminalId});
  }
  if(existsSync(filename)){
    try{
      const config=JSON.parse(readFileSync(filename,'utf8'));
      if(config.mode==='host'){
        const key=validateToken(decrypt(config.secret));
        server=await startLanServer({host:'0.0.0.0',port:config.port,token:key,store});
        mode='host';token=key;
      }else if(config.mode==='client'){
        const key=validateToken(decrypt(config.secret));
        // Não silenciosamente usar a base local quando o host estiver offline.
        mode='client';url=config.address;token=key;
      }
    }catch(error){mode='local';startError='Configuração LAN não iniciada: '+String(error.message||error);}
  }
  return {host,join:connectClient,local,status,call,authStatus,bootstrap,login,logout,authorize,
    currentUser:()=>user,terminalId,isRemote:()=>mode==='client',stop:closeServer};
}
