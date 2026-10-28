import { isIP } from 'node:net';
import { money } from './domain.mjs';

export function assertDeviceAddress(host,port){
  if(typeof host!=='string'||isIP(host)!==4)throw new Error('Use um endereço IPv4 de rede privada.');
  const bits=host.split('.').map(Number);
  const privateAddress=bits[0]===10||(bits[0]===172&&bits[1]>=16&&bits[1]<=31)||(bits[0]===192&&bits[1]===168)||bits[0]===127;
  if(!privateAddress || bits.some(x=>x<0||x>255))throw new Error('Destino deve ser uma rede privada ou loopback.');
  const number=Number(port);
  if(!Number.isInteger(number)||number<1||number>65535)throw new Error('Porta TCP inválida.');
  return {host,port:number};
}
const plain=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'?');
function line(text,width=42){return plain(text).slice(0,width);}
export function makeReceipt(sale){
  if(!sale || !Array.isArray(sale.items)||!Number.isSafeInteger(sale.total_cents))throw new Error('Venda inválida para comprovante.');
  const text=['PDV BETTER','COMPROVANTE NAO FISCAL','------------------------------------------','Venda: '+line(sale.id,34),'Data: '+new Date(sale.created_at).toLocaleString('pt-BR'),'------------------------------------------'];
  for(const item of sale.items){
    text.push(line(item.name));
    text.push('  '+line((item.quantity_milli/1000).toLocaleString('pt-BR',{maximumFractionDigits:3})+' '+item.unit,14)+'  '+money(item.line_total_cents));
  }
  text.push('------------------------------------------','TOTAL: '+money(sale.total_cents),'TROCO: '+money(sale.change_cents||0));
  for(const p of sale.payments||[])text.push(line(p.method.toUpperCase()+' '+money(p.amount_cents)));
  text.push('NAO SUBSTITUI NFC-e, SAT OU DOCUMENTO FISCAL','','','');
  const esc=Buffer.from([0x1b,0x40]);
  const cut=Buffer.from([0x1d,0x56,0x00]);
  return Buffer.concat([esc,Buffer.from(text.map(x=>line(x)).join('\n')+'\n','ascii'),cut]);
}
export function drawerPulse(){return Buffer.from([0x1b,0x70,0x00,0x19,0xfa]);}
export function parseScaleWeight(text){
  const raw=String(text??'').trim();
  if(/(^|[,;\s])US(?:[,;\s]|$)|unstable/i.test(raw))throw new Error('Leitura instável da balança.');
  // Formatos comuns ASCII: ST,GS, 0.750kg; ST,GS,+001.250kg. Rejeita peso negativo.
  const match=raw.match(/(?:ST[,;\s]+GS[,;\s]+)?\+?(-?\d+(?:[.,]\d{1,3})?)\s*kg\b/i);
  if(!match)throw new Error('Resposta da balança não reconhecida.');
  const qty=Number(match[1].replace(',','.'));
  if(!Number.isFinite(qty)||qty<=0||qty>100000)throw new Error('Peso inválido.');
  return Math.round(qty*1000);
}
