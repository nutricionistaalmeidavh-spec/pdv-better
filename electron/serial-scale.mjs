import {normalizeScaleConfig,parseSerialScaleFrame} from '../shared/scale-integration.mjs';

export async function listScalePorts(){
  const {SerialPort}=await import('serialport');
  const devices=await SerialPort.list();
  return devices.filter(device=>/^COM\d{1,3}$/i.test(device.path))
    .map(({path,manufacturer,vendorId,productId})=>({path,manufacturer:manufacturer||'',vendorId:vendorId||'',productId:productId||''}));
}
export async function readSerialScale(config,timeoutMs=4000){
  const prefs=normalizeScaleConfig(config);
  if(prefs.scaleTransport!=='serial')throw new Error('Configure conexão serial antes de ler a balança.');
  if(!prefs.scaleSerialPort)throw new Error('Selecione a porta COM da balança.');
  const {SerialPort}=await import('serialport');
  const listed=await SerialPort.list();
  if(!listed.some(port=>port.path.toUpperCase()===prefs.scaleSerialPort))
    throw new Error('Porta COM selecionada não está conectada. Atualize a lista de dispositivos.');
  if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>20000)
    throw new Error('Tempo limite serial inválido.');
  return new Promise((resolve,reject)=>{
    const port=new SerialPort({path:prefs.scaleSerialPort,baudRate:prefs.scaleBaudRate,autoOpen:false});
    let completed=false,buffer='';
    const timer=setTimeout(()=>finish(new Error('A balança serial não respondeu com peso estável.')),timeoutMs);
    function finish(error,value){
      if(completed)return;completed=true;clearTimeout(timer);
      if(port.isOpen)port.close(()=>{});
      if(error)reject(error);else resolve(value);
    }
    port.on('error',e=>finish(new Error('Falha na porta serial: '+e.message)));
    port.on('data',chunk=>{
      if(completed)return;
      buffer+=Buffer.from(chunk).toString('latin1');
      if(buffer.length>512)return finish(new Error('Resposta da balança excede o limite seguro.'));
      // Aguarde o fim da trama antes de processar leituras fragmentadas.
      if(!/[\x03\r\n]|\bkg\b/i.test(buffer))return;
      try{finish(null,parseSerialScaleFrame(buffer,{brand:prefs.scaleBrand}));}
      catch(e){
        if(/instável|negativo|sobrecarga/i.test(String(e.message)))finish(e);
        // Outras tramas parciais podem chegar depois; o timeout protege o caixa.
      }
    });
    port.open(error=>{
      if(error)return finish(new Error('Não foi possível abrir a porta serial: '+error.message));
      const commands={ENQ:Buffer.from([0x05]),CR:Buffer.from([0x0d]),NONE:null};
      const command=commands[prefs.scaleRequestCommand];
      if(command)port.write(command,e=>{if(e)finish(new Error('Falha ao solicitar leitura serial: '+e.message));});
    });
  });
}
