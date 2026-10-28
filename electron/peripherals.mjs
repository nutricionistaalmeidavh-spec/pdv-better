import { Socket } from 'node:net';
import { assertDeviceAddress, parseScaleWeight } from '../shared/peripherals.mjs';

export async function sendTcp(target,data,timeoutMs=3500){
  const {host,port}=assertDeviceAddress(target?.host,target?.port);
  if(!Buffer.isBuffer(data)||data.length>65536)throw new Error('Dados da impressora inválidos.');
  return new Promise((resolve,reject)=>{
    const socket=new Socket();let finished=false;
    const finish=(error)=>{
      if(finished)return;finished=true;socket.destroy();
      error?reject(error):resolve({sentBytes:data.length});
    };
    socket.setTimeout(timeoutMs,()=>finish(new Error('Impressora não respondeu.')));
    socket.once('error',error=>finish(new Error('Falha TCP na impressora: '+error.message)));
    socket.connect(port,host,()=>socket.end(data,()=>finish(null)));
  });
}
export async function readScale(target,timeoutMs=3000){
  const {host,port}=assertDeviceAddress(target?.host,target?.port);
  return new Promise((resolve,reject)=>{
    const socket=new Socket();let data='';let settled=false;
    const done=(err,weight)=>{
      if(settled)return;settled=true;socket.destroy();
      err?reject(err):resolve(weight);
    };
    socket.setTimeout(timeoutMs,()=>done(new Error('Balança não respondeu.')));
    socket.on('error',e=>done(new Error('Falha de conexão com a balança: '+e.message)));
    socket.on('data',chunk=>{
      data+=chunk.toString('ascii');
      if(data.length>256)return done(new Error('Resposta da balança excedeu o limite.'));
      if(data.includes('\n') || /kg/i.test(data)){
        try{done(null,parseScaleWeight(data));}
        catch(err){done(err);}
      }
    });
    socket.on('end',()=>{
      if(settled)return;
      try{done(null,parseScaleWeight(data));}
      catch(err){done(err);}
    });
    socket.connect(port,host);
  });
}
