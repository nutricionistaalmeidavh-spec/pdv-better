import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { assertDeviceAddress } from '../shared/peripherals.mjs';

// Somente operações do domínio; nunca SQL, arquivos, backup, shell ou parâmetros arbitrários.
export const ALLOWED_RPC=Object.freeze([
  'list','save','archive','previewCatalogCsv','importCatalogCsv','overview','getCurrentSession','openSession','closeSession',
  'moveCash','checkout','quoteSale','listSales','getSale','cancelSale','moveStock',
  'listStockMovements','receiveBatch','listBatches','setPromotion','listPromotions','setBundlePromotion','listBundlePromotions','archiveBundlePromotion','reportItems','createFinance','listFinance','settleFinance','report','listOpenSessions',
  'authStatus','authBootstrap','authLogin','authLogout','setPassword'
]);
export function validateToken(token){
  if(typeof token!=='string'|| !/^[a-f0-9]{64}$/i.test(token))throw new Error('Chave LAN inválida: utilize 64 caracteres hexadecimais.');
  return token.toLowerCase();
}
function authorized(input,token){
  if(typeof input!=='string'|| !/^Bearer [a-f0-9]{64}$/i.test(input))return false;
  const left=Buffer.from(input.slice(7).toLowerCase(),'ascii'),right=Buffer.from(token,'ascii');
  return left.length===right.length&&timingSafeEqual(left,right);
}
const privatePeer=host=>{
  const raw=String(host||'').replace(/^::ffff:/,'');
  if(raw==='::1')return true;
  try{return !!assertDeviceAddress(raw,1);}catch{return false;}
};
export async function startLanServer({host='127.0.0.1',port=48791,token,store}={}){
  if(host!=='0.0.0.0')assertDeviceAddress(host,port||1);
  if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Porta LAN inválida.');
  const key=validateToken(token);
  if(!store)throw new Error('Banco canônico indisponível.');
  const server=createServer((req,res)=>{
    const reply=(status,obj)=>{
      res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
      res.end(JSON.stringify(obj));
    };
    if(!privatePeer(req.socket.remoteAddress))return reply(403,{error:'Acesso fora da rede privada bloqueado.'});
    if(req.method==='GET'&&req.url==='/health')return reply(200,{ready:true,mode:'host',version:1});
    if(req.method!=='POST'||req.url!=='/rpc')return reply(404,{error:'Recurso inexistente.'});
    if(!authorized(req.headers.authorization,key))return reply(401,{error:'Acesso não autorizado à rede local.'});
    let body='';let exceeded=false;
    req.on('data',chunk=>{
      body+=chunk.toString('utf8');
      if(Buffer.byteLength(body)>131072){exceeded=true;req.destroy();}
    });
    req.on('end',()=>{
      if(exceeded)return;
      try{
        const cmd=JSON.parse(body);
        if(!cmd||!ALLOWED_RPC.includes(cmd.method)||!Array.isArray(cmd.args)||cmd.args.length>5)throw new Error('Operação LAN não permitida.');
        const terminalId=String(req.headers['x-pdv-terminal']||'');
        if(!/^[a-zA-Z0-9_-]{1,100}$/.test(terminalId))throw new Error('Terminal não identificado.');
        const sessionToken=String(req.headers['x-pdv-session']||'');
        let result;
        if(cmd.method==='authStatus')result=store.authStatus();
        else if(cmd.method==='authBootstrap')result=store.authBootstrap(cmd.args[0],terminalId);
        else if(cmd.method==='authLogin')result=store.authLogin(cmd.args[0],terminalId);
        else if(cmd.method==='authLogout'){
          store.authCurrent(sessionToken,terminalId);
          result=store.authLogout(sessionToken);
        }else result=store.secureCall(cmd.method==='setPassword'?'setPassword':cmd.method,cmd.args,{sessionToken,terminalId});
        Promise.resolve(result).then(value=>reply(200,{result:value}),error=>reply(422,{error:String(error.message||error)}));
      }catch(error){reply(422,{error:String(error.message||error)});}
    });
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,host,()=>{server.off('error',reject);resolve();});
  });
  return {host,port:server.address().port,close:()=>new Promise((resolve,reject)=>{server.close(err=>err?reject(err):resolve());server.closeAllConnections?.();})};
}
export async function requestLan(url,token,method,args=[],sessionToken=null,terminalId='legacy'){
  validateToken(token);
  if(!ALLOWED_RPC.includes(method))throw new Error('Operação LAN não permitida.');
  const target=new URL(url);
  if(target.protocol!=='http:'||target.username||target.password||target.pathname!=='/'||target.search||target.hash)throw new Error('Endereço LAN inválido.');
  assertDeviceAddress(target.hostname,Number(target.port||80));
  const response=await fetch(new URL('/rpc',target),{
    method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json',
      'x-pdv-terminal':terminalId,'x-pdv-session':sessionToken||''},
    body:JSON.stringify({method,args}),signal:AbortSignal.timeout(6000),cache:'no-store'
  });
  let result;
  try{result=await response.json();}catch{throw new Error('Resposta inválida do servidor LAN.');}
  if(!response.ok)throw new Error(result.error||'Acesso à rede local falhou.');
  return result.result;
}
