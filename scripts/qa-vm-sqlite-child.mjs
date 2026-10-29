// Processo filho real no runner Windows: a VM o encerra depois de sinalizar o ponto de falha.
import {DatabaseSync} from 'node:sqlite';
import {openCatalog} from '../electron/db.mjs';
const [mode,database,productId]=process.argv.slice(2);
try{
 if(mode==='uncommitted'){
  const sqlite=new DatabaseSync(database);
  sqlite.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
  sqlite.prepare('UPDATE products SET stock_milli=stock_milli-1000 WHERE id=?').run(productId);
  process.stdout.write('VM-READY:UNCOMMITTED\n');
 }else if(mode==='committed'){
  const store=openCatalog(database);
  const sale=store.checkout({key:'VM-CRASH-COMMITTED',items:[{id:productId,quantityMilli:1000}],
   payments:[{method:'pix',amountCents:500}]});
  if(sale.total_cents!==500)throw new Error('Venda virtual divergente.');
  process.stdout.write('VM-READY:COMMITTED\n');
 }else throw new Error('Modo de falha desconhecido.');
 setInterval(()=>{},1000);
}catch(error){console.error(error);process.exitCode=1;}
