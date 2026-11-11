// Núcleo local de etiquetas e balanças. Sem API, telemetria ou serviço pago.
// Formatos EAN-13 e layouts de carga equivalentes aos usados no PDV Nexus.
// Posições são configuradas por perfil; a marca sozinha não garante compatibilidade.
export const SCALE_LABEL_PROFILES=Object.freeze({
  DEFAULT_PRICE:Object.freeze({prefix:'2',codeStart:1,codeLength:5,valueStart:6,valueLength:6,mode:'price',decimals:2}),
  DEFAULT_WEIGHT:Object.freeze({prefix:'2',codeStart:1,codeLength:5,valueStart:6,valueLength:6,mode:'weight',decimals:3}),
  EXTENDED_PRODUCT:Object.freeze({prefix:'20',codeStart:2,codeLength:4,valueStart:6,valueLength:6,mode:'price',decimals:2}),
  'legacy-brasil':Object.freeze({prefix:'2',codeStart:1,codeLength:5,valueStart:7,valueLength:5,mode:'price',decimals:2})
});
const BRANDS=['toledo','filizola','generic-request-response','generic-streaming'];
const TRANSPORTS=['tcp','serial'];
const COMMANDS=['ENQ','CR','NONE'];
const BAUD_RATES=[1200,2400,4800,9600,19200,38400,57600,115200];
function ensureDigits(code,label){if(!/^\d+$/.test(code))throw new Error(label+' precisa ser numérico.');}
export function ean13CheckDigit(twelve){
  if(!/^\d{12}$/.test(twelve))throw new Error('EAN-13 requer 12 dígitos antes do verificador.');
  const sum=[...twelve].reduce((total,digit,index)=>total+Number(digit)*(index%2===0?1:3),0);
  return String((10-sum%10)%10);
}
export function createScaleBarcode(productCode,value,mode='DEFAULT_PRICE'){
  const profile=SCALE_LABEL_PROFILES[mode];
  if(!profile)throw new Error('Perfil de etiqueta não reconhecido.');
  const code=String(productCode);
  ensureDigits(code,'Código do produto');
  if(code.length>profile.codeLength)throw new Error('Código do produto excede o perfil.');
  if(!Number.isSafeInteger(value)||value<0)throw new Error('Valor de etiqueta inválido.');
  const data=String(value).padStart(profile.valueLength,'0');
  if(data.length>profile.valueLength)throw new Error('Valor excede os dígitos da etiqueta.');
  const first=profile.prefix+code.padStart(profile.codeLength,'0');
  const prefix=first.padEnd(profile.valueStart,'0')+data;
  if(prefix.length!==12)throw new Error('Perfil incompatível com EAN-13.');
  return prefix+ean13CheckDigit(prefix);
}
export function decodeScaleBarcode(barcode,mode='DEFAULT_PRICE'){
  const profile=SCALE_LABEL_PROFILES[mode];
  if(!profile)throw new Error('Perfil de etiqueta não reconhecido.');
  const code=String(barcode??'').trim();
  if(!/^\d{13}$/.test(code))return null;
  if(!code.startsWith(profile.prefix))return null;
  if(code[12]!==ean13CheckDigit(code.slice(0,12)))throw new Error('Dígito verificador EAN-13 inválido (checksum).');
  const productCode=code.slice(profile.codeStart,profile.codeStart+profile.codeLength);
  const encoded=code.slice(profile.valueStart,profile.valueStart+profile.valueLength);
  if(encoded.length!==profile.valueLength)throw new Error('Etiqueta incompleta.');
  return {barcode:code,productCode,mode:profile.mode,rawValue:Number(encoded),profile:mode};
}
export function resolveScaleScan(barcode,products,profile='DEFAULT_PRICE'){
  const decoded=decodeScaleBarcode(barcode,profile);
  if(!decoded)return null;
  if(!Array.isArray(products))throw new Error('Catálogo indisponível.');
  const width=SCALE_LABEL_PROFILES[profile].codeLength;
  const product=products.find(item=>/^\d+$/.test(String(item.code||''))&&String(item.code).padStart(width,'0')===decoded.productCode);
  if(!product)throw new Error('Produto '+decoded.productCode+' não encontrado para etiqueta da balança.');
  if(product.active===0)throw new Error('Produto inativo ou indisponível.');
  if(product.unit!=='KG')throw new Error('Etiqueta de balança exige produto vendido por peso (KG).');
  const price=product.sale_price_cents;
  if(!Number.isSafeInteger(price)||price<=0)throw new Error('Configure preço por KG maior que zero para este produto.');
  let quantityMilli,labelTotalCents;
  if(decoded.mode==='weight'){
    quantityMilli=decoded.rawValue;
    labelTotalCents=Math.round(price*quantityMilli/1000);
  }else{
    labelTotalCents=decoded.rawValue;
    quantityMilli=Math.round(labelTotalCents*1000/price);
    // O formato com preço não carrega o peso exato. Reconstituímos a
    // quantidade com precisão de 1 g, sem cobrar preço diferente da etiqueta.
    const matches=[];
    for(let diff=-5;diff<=5;diff++){
      const candidate=quantityMilli+diff;
      if(candidate>0&&Math.round(candidate*price/1000)===labelTotalCents)
        matches.push(candidate);
    }
    if(matches.length)quantityMilli=matches.reduce((best,n)=>Math.abs(n-quantityMilli)<Math.abs(best-quantityMilli)?n:best);
    if(!matches.length)throw new Error('Preço da etiqueta não é compatível com a precisão em gramas e o preço/KG cadastrado.');
  }
  if(!Number.isSafeInteger(quantityMilli)||quantityMilli<=0)throw new Error('Peso ou quantidade da etiqueta inválido.');
  if(!Number.isSafeInteger(labelTotalCents)||labelTotalCents<=0)throw new Error('Preço total da etiqueta inválido.');
  const totalCents=Math.round(price*quantityMilli/1000);
  if(totalCents!==labelTotalCents)throw new Error('Subtotal divergente da etiqueta; operação bloqueada.');
  return {product,quantityMilli,labelTotalCents,totalCents,barcode:decoded.barcode,profile};
}
export function normalizeScaleConfig(input){
  const transport=String(input?.scaleTransport||'tcp');
  const brand=String(input?.scaleBrand||'generic-streaming');
  const labelMode=String(input?.scaleLabelMode||'DEFAULT_PRICE');
  const baudRate=Number(input?.scaleBaudRate||9600);
  const serialPort=String(input?.scaleSerialPort||'').trim().toUpperCase();
  const requestCommand=String(input?.scaleRequestCommand||'ENQ');
  if(!TRANSPORTS.includes(transport))throw new Error('Conexão da balança inválida.');
  if(!BRANDS.includes(brand))throw new Error('Fabricante/protocolo da balança inválido.');
  if(!(labelMode in SCALE_LABEL_PROFILES))throw new Error('Perfil da etiqueta inválido.');
  if(!BAUD_RATES.includes(baudRate))throw new Error('Velocidade baud serial inválida.');
  if(serialPort&&!/^COM(?:[1-9]|[1-9]\d{1,2})$/.test(serialPort))throw new Error('Porta serial deve ser COM1 até COM999.');
  if(!COMMANDS.includes(requestCommand))throw new Error('Comando serial inválido.');
  return {...input,scaleTransport:transport,scaleBrand:brand,scaleLabelMode:labelMode,scaleBaudRate:baudRate,scaleSerialPort:serialPort,scaleRequestCommand:requestCommand};
}
export function parseSerialScaleFrame(frame,{brand='generic-streaming'}={}){
  const raw=String(frame??'');
  if(!BRANDS.includes(brand))throw new Error('Protocolo serial inválido.');
  if(/(?:^|[,;\s])US(?:[,;\s]|$)|unstable|inst[aá]vel/i.test(raw))throw new Error('Leitura instável da balança.');
  if(/overload|sobrecarga/i.test(raw))throw new Error('Sobrecarga na balança.');
  // Toledo: frame longo carrega 6 dígitos de peso, byte de estado e preços.
  // É o mesmo divisor de peso utilizado pelo adaptador Nexus.
  if(brand==='toledo'&&raw.length>20){
    const peso=raw.slice(2,8);
    if(/^\d{6}$/.test(peso)){
      const divisor=(raw.charCodeAt(8)&8)!==0?100:1000;
      const milli=Math.round(Number(peso)*1000/divisor);
      if(Number.isSafeInteger(milli)&&milli>0&&milli<=100000000)return milli;
      throw new Error('Peso inválido na trama Toledo.');
    }
  }
  const body=raw.includes('\x02')?raw.split('\x02').at(-1).split(/[\x03\r\n]/)[0].trim():raw.trim();
  if(!body)throw new Error('Resposta vazia da balança.');
  const status=body[0]?.toUpperCase();
  if(body==='I')throw new Error('Leitura instável da balança.');
  if(body==='N')throw new Error('Peso negativo da balança.');
  if(body==='S')throw new Error('Sobrecarga da balança.');
  if(/^-/.test(body))throw new Error('Peso negativo não é aceito.');
  let kg;
  const explicit=body.match(/(?:ST[,;\s]+GS[,;\s]+)?\+?(-?\d+(?:[.,]\d{1,3})?)\s*kg\b/i);
  if(explicit)kg=Number(explicit[1].replace(',','.'));
  else if(brand==='filizola'&&body.length>10&&/^\d{6}/.test(body))kg=Number(body.slice(0,6))/1000;
  else if(/^\+?\d{4,8}$/.test(body))kg=Number(body)/1000;
  else if(/^\+?\d+(?:[.,]\d{1,3})?$/.test(body))kg=Number(body.replace(',','.'));
  else throw new Error('Resposta serial da balança não reconhecida.');
  const milli=Math.round(kg*1000);
  if(!Number.isSafeInteger(milli)||milli<=0||milli>100000000)throw new Error('Peso negativo, zero ou fora dos limites.');
  return milli;
}
const asciiName=(input,size)=>String(input||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9 .\-\/]/g,' ').slice(0,size).padEnd(size,' ');
const padInt=(value,length)=>String(value).padStart(length,'0');
export function buildScaleExport(products,brand){
  if(!['toledo','urano'].includes(brand))throw new Error('Exportação de balança não reconhecida.');
  if(!Array.isArray(products))throw new Error('Catálogo inválido.');
  const eligible=products.filter(p=>p.active!==0&&['KG','UN'].includes(p.unit)&&/^\d{1,6}$/.test(String(p.code||''))&&Number.isSafeInteger(p.sale_price_cents)&&p.sale_price_cents>=0&&p.sale_price_cents<=999999);
  if(!eligible.length)throw new Error('Nenhum produto ativo com código numérico de até 6 dígitos para exportar.');
  const lines=eligible.map(p=>{
    const type=p.unit==='KG'?'0':'1',code=padInt(p.code,6);
    if(brand==='toledo')return type+code+padInt(p.sale_price_cents,6)+'000'+asciiName(p.name,25);
    return code+type+asciiName(p.name,30)+padInt(p.sale_price_cents,9);
  });
  return {fileName:brand==='toledo'?'ITENSMGV.TXT':'PRODUTOS.TXT',content:lines.join('\r\n')+'\r\n',count:eligible.length,skipped:products.length-eligible.length};
}
