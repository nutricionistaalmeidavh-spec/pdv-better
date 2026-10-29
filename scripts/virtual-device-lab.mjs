// Simuladores TCP confinados ao loopback da máquina virtual Windows.
// Nunca se conectam a dispositivos reais nem à LAN do estabelecimento.
import {createServer} from 'node:net';

async function listen(handler){
 const sockets=new Set();
 const server=createServer(socket=>{
  sockets.add(socket);socket.once('close',()=>sockets.delete(socket));
  handler(socket);
 });
 await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});
 });
 const close=async()=>{
  for(const socket of sockets)socket.destroy();
  if(server.listening)await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
 };
 return {target:{host:'127.0.0.1',port:server.address().port},close};
}
export async function startVirtualEscPosPrinter(){
 const frames=[];
 const waiters=[];
 const endpoint=await listen(socket=>{
  const chunks=[];
  socket.on('data',chunk=>chunks.push(chunk));
  socket.on('end',()=>{
   const frame=Buffer.concat(chunks);
   if(waiters.length)waiters.shift().resolve(frame);
   else frames.push(frame);
  });
 });
 const nextDocument=(timeoutMs=3000)=>{
  if(frames.length)return Promise.resolve(frames.shift());
  return new Promise((resolve,reject)=>{
   const waiter={resolve:data=>{clearTimeout(timer);resolve(data);}};
   waiters.push(waiter);
   const timer=setTimeout(()=>{
    const i=waiters.indexOf(waiter);
    if(i>=0)waiters.splice(i,1);
    reject(new Error('Impressora virtual não recebeu o documento.'));
   },timeoutMs);
  });
 };
 return {...endpoint,nextDocument,close:async()=>{
  for(const waiter of waiters.splice(0))waiter.resolve(Buffer.alloc(0));
  await endpoint.close();
 }};
}
export async function startVirtualScale({reply='ST,GS,0.350kg\\r\\n'}={}){
 return listen(socket=>{
  if(reply!==null)socket.end(reply,'ascii');
  // reply:null deixa a conexão aberta até o timeout do cliente (balança sem resposta).
 });
}
