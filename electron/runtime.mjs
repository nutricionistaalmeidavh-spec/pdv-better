import { randomBytes } from 'node:crypto';
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
  let mode='local',server=null,url='',token='',startError='';
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
  async function join({address,secret}={}){
    if(typeof address!=='string'||typeof secret!=='string')throw new Error('Endereço e chave do servidor são obrigatórios.');
    const key=validateToken(secret);
    await requestLan(address,key,'overview',[]);
    const encrypted=encrypt(key);
    save({mode:'client',address,secret:encrypted});
    await closeServer();
    mode='client';url=address;token=key;startError='';
    return status();
  }
  async function local(){
    save({mode:'local'});
    await closeServer();mode='local';url='';token='';startError='';
    return status();
  }
  function status(){
    return {mode,port:server?.port||null,addresses:localAddresses(),address:url,
      pairingKey:mode==='host'?token:null,warning:startError};
  }
  async function call(method,...args){
    if(!ALLOWED_RPC.includes(method))throw new Error('Acesso ao domínio não autorizado.');
    if(mode==='client')return requestLan(url,token,method,args);
    return store[method](...args);
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
  return {host,join,local,status,call,isRemote:()=>mode==='client',stop:closeServer};
}
