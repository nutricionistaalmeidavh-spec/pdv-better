// Executa somente em VM Windows descartável. Dois instaladores NSIS reais,
// electron-updater real, diálogo nativo e HTTP local (sem publicação de versões de QA).
import assert from 'node:assert/strict';
import {spawn,spawnSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:http';
import {appendFileSync,createReadStream,existsSync,mkdirSync,readdirSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import {join,resolve,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {DatabaseSync} from 'node:sqlite';
import {openCatalog} from '../electron/db.mjs';

assert.equal(process.platform,'win32');
assert.equal(process.env.GITHUB_ACTIONS,'true','Use somente runner descartável');
const [baselineArg,feedArg,targetVersion]=process.argv.slice(2);
assert.match(targetVersion||'',/^\d+\.\d+\.\d+$/);
const baseline=resolve(baselineArg),feed=resolve(feedArg);
const artifact=join(feed,'PDV-Plus-Setup-'+targetVersion+'.exe');
assert.ok(existsSync(baseline)&&existsSync(artifact)&&existsSync(join(feed,'latest.yml')));
const out=resolve('qa-artifacts','updater-real');
mkdirSync(out,{recursive:true});
const evidence={targetVersion,baseline:basename(baseline),steps:[],requests:[]};
const record=(step,details={})=>{evidence.steps.push({step,...details});writeFileSync(join(out,'result.json'),JSON.stringify(evidence,null,2));console.log(step,details);};
const psArgs=script=>['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from("$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.Encoding]::UTF8;"+script,'utf16le').toString('base64')];
const execAsync=promisify(execFile);
async function psAsync(script){const {stdout}=await execAsync('powershell.exe',psArgs(script),{encoding:'utf8',timeout:30000,windowsHide:true});return stdout.trim();}
function ps(script){
 const r=spawnSync('powershell.exe',psArgs(script),{encoding:'utf8',timeout:30000});
 if(r.status!==0)throw Error((r.stderr||r.error?.message||'PowerShell falhou').trim());
 return r.stdout.trim();
}
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const appData=ps("[Environment]::GetFolderPath('ApplicationData')");
const dir=join(appData,'PDV SUPER'),dbFile=join(dir,'pdv-better.sqlite');
assert.ok(!existsSync(dir),'Runner não está limpo; não tocar em dados existentes');
mkdirSync(dir,{recursive:true});
const terminal=randomUUID();
writeFileSync(join(dir,'terminal-id.txt'),terminal);
const catalog=openCatalog(dbFile,{terminalId:terminal});
let product,sale;
try{
 product=catalog.save('products',{name:'Produto QA Atualização',code:'QA-UPDATE-001',unit:'UN',sale_price_cents:1250,stock_milli:10000});
 catalog.openSession({openingCashCents:0});
 sale=catalog.checkout({key:'qa-update-sale',items:[{id:product.id,quantityMilli:1000}],payments:[{method:'cash',amountCents:1250}]});
 catalog.closeSession({countedCashCents:1250});
}finally{catalog.close();}
function verifyDb(file){
 const db=new DatabaseSync(file,{readOnly:true});
 try{
  assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
  assert.equal(db.prepare('SELECT stock_milli FROM products WHERE id=?').get(product.id).stock_milli,9000);
  assert.equal(db.prepare('SELECT total_cents FROM sales WHERE id=?').get(sale.id).total_cents,1250);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sales').get().n,1);
  assert.equal(db.prepare('SELECT SUM(delta_milli) n FROM stock_movements WHERE product_id=?').get(product.id).n,9000);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM cash_sessions WHERE status='open'").get().n,0);
 }finally{db.close();}
}
verifyDb(dbFile);
const destination=join(process.env.RUNNER_TEMP,'PDV-Update-Real');
const exe=join(destination,'PDV Plus.exe');
const installer=spawnSync(baseline,['/S','/D='+destination],{stdio:'inherit',timeout:180000});
assert.equal(installer.status,0,'Instalador inicial falhou');
assert.ok(existsSync(exe));
const version=()=>ps('(Get-Item -LiteralPath '+quote(exe)+').VersionInfo.ProductVersion');
const oldVersion=version();
assert.notEqual(oldVersion,targetVersion);
record('NSIS inicial instalado',{oldVersion});
const files=new Map(readdirSync(feed).filter(n=>n==='latest.yml'||n===basename(artifact)||n.endsWith('.blockmap')).map(n=>['/'+n,join(feed,n)]));
const server=createServer((req,res)=>{
 const name=new URL(req.url,'http://127.0.0.1').pathname;
 const file=files.get(name);
 evidence.requests.push({method:req.method,path:name,range:req.headers.range||null});
 console.log('HTTP update:',req.method,name,req.headers.range||'');
 if(!file){res.writeHead(404).end();return;}
 const size=statSync(file).size,match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
 let start=0,end=size-1;
 if(match){start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;}
 if(start>end||start>=size){res.writeHead(416,{'Content-Range':'bytes */'+size}).end();return;}
 const headers={'Content-Length':end-start+1,'Accept-Ranges':'bytes','Content-Type':'application/octet-stream'};
 if(match)headers['Content-Range']='bytes '+start+'-'+end+'/'+size;
 res.writeHead(match?206:200,headers);
 if(req.method==='HEAD'){res.end();return;}
 createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
const url='http://127.0.0.1:'+server.address().port+'/';
const config=join(destination,'resources','app-update.yml');
assert.ok(existsSync(config),'Configuração real de update ausente');
// Troca apenas o endereço do provedor no binário de QA instalado.
// Não altera Electron, NSIS, verificação de hash ou o código de atualização.
writeFileSync(config,'provider: generic\nurl: '+url+'\nuseMultipleRangeRequest: false\nupdaterCacheDirName: pdv-updater-real-'+randomUUID()+'\n');
const childEnv={...process.env};
delete childEnv.PDV_TEST_SMOKE;delete childEnv.PDV_TEST_USER_DATA;delete childEnv.PDV_DEV_URL;
const launch=()=>{
 const p=spawn(exe,['--enable-logging=stderr','--no-proxy-server'],{env:childEnv,stdio:['ignore','pipe','pipe'],windowsHide:false});
 for(const stream of [p.stdout,p.stderr])stream.on('data',data=>appendFileSync(join(out,'electron.log'),data));
 p.on('error',e=>console.error('Falha ao iniciar:',e));
 p.on('exit',(code,signal)=>console.log('Electron saiu:',p.pid,code,signal));
 return p;
};
async function clickDialog(label,processId,timeout=120000){
 const cmd=String.raw`Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
$root=[System.Windows.Automation.AutomationElement]::RootElement
$tree=[System.Windows.Automation.TreeScope]::Descendants
$children=[System.Windows.Automation.TreeScope]::Children
$pidProperty=[System.Windows.Automation.AutomationElement]::ProcessIdProperty
$processCondition=[System.Windows.Automation.PropertyCondition]::new($pidProperty,[int]${processId})
$wanted=${quote(label)}
$buttonType=[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button)
foreach($top in $root.FindAll($children,$processCondition)){
 try {
  'WINDOW '+$top.Current.Name+' | '+$top.Current.ClassName
  foreach($control in $top.FindAll($tree,$buttonType)){
   try{
    $name=$control.Current.Name
    'BUTTON '+$name
    if(($name -replace '&','').Trim() -eq $wanted){
     $control.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
     'CLICKED';exit 0
    }
   }catch{'UIA button: '+$_.Exception.Message}
  }
 }catch{'UIA window: '+$_.Exception.Message}
}
'NOT_FOUND'`;
 const deadline=Date.now()+timeout;
 let last='';
 while(Date.now()<deadline){
  last=await psAsync(cmd);
  if(last.includes('CLICKED'))return;
  await sleep(750);
 }
 console.error('UIA:',last);
 console.error('Consultas:',JSON.stringify(evidence.requests));
 if(existsSync(join(out,'electron.log')))console.error(readFileSync(join(out,'electron.log'),'utf8').slice(-12000));
 throw Error('Diálogo nativo não apresentou botão: '+label);
}
const mainPid=()=>{
 const s=ps("$p=Get-Process -Name 'PDV Plus' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq "+quote(exe)+" -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1; if($p){$p.Id}");
 return Number(s)||0;
};
async function until(fn,timeout,description){
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){const result=fn();if(result)return result;await sleep(1000);}
 throw Error(description);
}
function closeProcess(pid){
 ps("$p=Get-Process -Id "+pid+" -ErrorAction SilentlyContinue; if($p){[void]$p.CloseMainWindow()}");
}
let first,second;
try{
 first=launch();
 await clickDialog('Agora não',first.pid);
 await sleep(1500);
 assert.equal(version(),oldVersion);
 assert.ok(evidence.requests.some(r=>r.path==='/latest.yml'),'Feed não consultado');
 assert.ok(!evidence.requests.some(r=>r.path==='/'+basename(artifact)),'Download sem consentimento');
 assert.equal(readdirSync(dir).filter(n=>n.startsWith('pre-update-')).length,0);
 record('Recusa mantém binário e dados, sem download');
 const pid1=await until(mainPid,20000,'Janela inicial não encontrada');
 closeProcess(pid1);
 await until(()=>first.exitCode!==null&&!mainPid(),30000,'Primeira janela não fechou');
 second=launch();
 await clickDialog('Baixar e instalar',second.pid);
 record('Consentimento no diálogo nativo');
 const originalPid=second.pid;
 await until(()=>{
  try{const pid=mainPid();return pid&&pid!==originalPid&&version().startsWith(targetVersion)?pid:0;}catch{return 0;}
 },300000,'Instalador não atualizou e reiniciou automaticamente');
 assert.ok(evidence.requests.some(r=>r.path==='/'+basename(artifact)),'Nenhuma transferência real do instalador');
 verifyDb(dbFile);
 const backups=readdirSync(dir).filter(n=>n.startsWith('pre-update-')&&n.endsWith('.sqlite'));
 assert.ok(backups.length>0,'Backup anterior à instalação não encontrado');
 for(const name of backups)verifyDb(join(dir,name));
 assert.equal(readFileSync(join(dir,'terminal-id.txt'),'utf8'),terminal);
 record('Atualização real, reinício e SQLite íntegro',{installedVersion:version(),backups});
}finally{
 try{const pid=mainPid();if(pid)closeProcess(pid);}catch{}
 try{first?.kill();second?.kill();}catch{}
 server.closeAllConnections();
 await new Promise(ok=>server.close(ok));
 writeFileSync(join(out,'result.json'),JSON.stringify(evidence,null,2));
}
