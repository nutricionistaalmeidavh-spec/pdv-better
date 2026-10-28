import {scryptSync,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {allowed,roleNames} from '../shared/access.mjs';
const now=()=>new Date().toISOString();
const sessionTime=12*60*60*1000;
const safeName=x=>{const s=String(x??'').trim();if(!s||s.length>100)throw new Error('Nome do operador inválido.');return s;};
const strongPass=x=>{
 if(typeof x!=='string'||x.length<8||x.length>128)throw new Error('Senha deve ter entre 8 e 128 caracteres.');
 return x;
};
const tokenId=x=>{if(typeof x!=='string'||x.length<1||x.length>100||!/^[a-zA-Z0-9_-]+$/.test(x))throw new Error('Terminal inválido.');return x;};
export function migrateAccess(db,terminalId='legacy'){
 const v=db.prepare('PRAGMA user_version').get().user_version;
 if(v>=4)return;
 if(v!==3)throw new Error('Migração de acesso requer banco v3.');
 db.exec('BEGIN IMMEDIATE');
 try{
   db.exec("DROP INDEX IF EXISTS only_one_open_cash_session");
   db.exec("ALTER TABLE cash_sessions ADD COLUMN terminal_id TEXT NOT NULL DEFAULT 'legacy'");
   db.exec('ALTER TABLE cash_sessions ADD COLUMN operator_id TEXT');
   db.prepare("UPDATE cash_sessions SET terminal_id=? WHERE status='open' AND terminal_id='legacy'").run(tokenId(terminalId));
   db.exec("CREATE UNIQUE INDEX IF NOT EXISTS one_open_session_per_terminal ON cash_sessions(terminal_id) WHERE status='open'");
   db.exec("CREATE TABLE operator_credentials(operator_id TEXT PRIMARY KEY REFERENCES operators(id),salt TEXT NOT NULL,hash TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)");
   db.exec("PRAGMA user_version=4");
   db.exec('COMMIT');
 }catch(err){db.exec('ROLLBACK');throw err;}
}
export function createAccess(db){
 const sessions=new Map(),failures=new Map();
 const operators=()=>db.prepare("SELECT id,name,role FROM operators WHERE active=1 ORDER BY name COLLATE NOCASE").all();
 const status=()=>({setupRequired:db.prepare('SELECT COUNT(*) AS n FROM operator_credentials').get().n===0,operators:operators()});
 const credential=(id)=>db.prepare('SELECT * FROM operator_credentials WHERE operator_id=?').get(id);
 const makeSession=(user,terminalId)=>{
   const token=randomBytes(32).toString('hex');
   sessions.set(token,{userId:user.id,terminalId:tokenId(terminalId),expires:Date.now()+sessionTime});
   return {token,user:{id:user.id,name:user.name,role:user.role}};
 };
 const setHash=(operatorId,password)=>{
   strongPass(password);const salt=randomBytes(16).toString('hex');
   const hash=scryptSync(password,Buffer.from(salt,'hex'),64).toString('hex');
   db.prepare("INSERT INTO operator_credentials(operator_id,salt,hash,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(operator_id) DO UPDATE SET salt=excluded.salt,hash=excluded.hash,updated_at=excluded.updated_at")
     .run(operatorId,salt,hash,now(),now());
   for(const [k,v] of sessions)if(v.userId===operatorId)sessions.delete(k);
 };
 function bootstrap(input,terminalId='legacy'){
   db.exec('BEGIN IMMEDIATE');
   try{
     if(!status().setupRequired)throw new Error('Administrador já configurado; utilize login.');
     const name=safeName(input?.name),password=strongPass(input?.password),id=randomUUID(),time=now();
     db.prepare("INSERT INTO operators(id,active,created_at,updated_at,name,role) VALUES(?,1,?,?,?,'Administrador')").run(id,time,time,name);
     setHash(id,password);
     db.exec('COMMIT');
     return makeSession({id,name,role:'Administrador'},terminalId);
   }catch(e){db.exec('ROLLBACK');throw e;}
 }
 function login(input,terminalId='legacy'){
   const id=String(input?.operatorId||'');
   const key=tokenId(terminalId)+':'+id;
   const blocked=failures.get(key);
   if(blocked?.until>Date.now())throw new Error('Excesso de tentativas. Tente novamente em 1 minuto.');
   const user=db.prepare('SELECT id,name,role FROM operators WHERE id=? AND active=1').get(id);
   const pw=typeof input?.password==='string'?input.password:'';
   const stored=credential(id);
   // Executa mesmo quando usuário não existe para dificultar distinção entre IDs.
   const salt=Buffer.from(stored?.salt||'00'.repeat(16),'hex');
   const hashed=scryptSync(pw,salt,64);
   const expected=Buffer.from(stored?.hash||'00'.repeat(64),'hex');
   if(!user||!stored||!timingSafeEqual(hashed,expected)){
     const count=(blocked?.count||0)+1;
     failures.set(key,{count,until:count>=5?Date.now()+60000:0});
     throw new Error('Credenciais inválidas.');
   }
   failures.delete(key);
   return makeSession(user,terminalId);
 }
 function current(token,terminalId){
   const entry=sessions.get(token);
   if(!entry||entry.expires<Date.now()||entry.terminalId!==tokenId(terminalId))throw new Error('Sessão não autenticada ou expirada.');
   const user=db.prepare('SELECT id,name,role FROM operators WHERE id=? AND active=1').get(entry.userId);
   if(!user){sessions.delete(token);throw new Error('Sessão não autenticada: operador inativo.');}
   return user;
 }
 function authorize(token,terminalId,method,args=[]){
   const user=current(token,terminalId);
   if(!allowed(user.role,method,args))throw new Error('Permissão insuficiente para esta operação.');
   return user;
 }
 function setPassword(input){
   const id=String(input?.operatorId||'');
   const user=db.prepare('SELECT id,role FROM operators WHERE id=? AND active=1').get(id);
   if(!user)throw new Error('Operador inexistente ou inativo.');
   setHash(id,input?.password);
   return {operatorId:id,passwordUpdated:true};
 }
 const logout=token=>{sessions.delete(token);return {loggedOut:true};};
 const ensureLastAdmin=(method,args)=>{
   if(method!=='archive'&&method!=='save')return;
   if(args[0]!=='operators')return;
   const id=method==='archive'?args[1]:args[1]?.id;
   if(!id)return;
   const previous=db.prepare("SELECT role FROM operators WHERE id=? AND active=1").get(id);
   if(previous?.role!=='Administrador')return;
   const count=db.prepare("SELECT COUNT(*) AS n FROM operators WHERE role='Administrador' AND active=1").get().n;
   if(count<=1 && (method==='archive'||args[1]?.role!=='Administrador'))throw new Error('Não é permitido remover o último administrador.');
 };
 return {status,bootstrap,login,logout,current,authorize,setPassword,ensureLastAdmin};
}
