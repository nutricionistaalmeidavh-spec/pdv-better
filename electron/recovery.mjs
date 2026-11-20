import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {verifyDatabase} from './backup.mjs';

// Recuperação de último recurso: a sessão LOCAL do Windows é o fator de posse.
// Esta função não é exposta à API LAN e não recebe caminhos escolhidos pelo cliente.
export async function recoverLocalAdministrator({store,folder,mode,input}){
 if(!['local','host'].includes(mode))throw new Error('Recuperação disponível somente no computador onde os dados estão armazenados, nunca pela LAN.');
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Solicitação de recuperação inválida.');
 if(input.confirmation!=='REDEFINIR')throw new Error('Confirme a redefinição digitando REDEFINIR.');
 const password=input.password;
 if(typeof password!=='string'||password.length<8||password.length>128)throw new Error('A nova senha deve ter entre 8 e 128 caracteres.');
 if(password!==input.repeatPassword)throw new Error('As senhas não coincidem.');
 const operatorId=String(input.operatorId||'');
 const operator=store.authStatus().operators.find(user=>user.id===operatorId&&user.role==='Administrador');
 if(!operator)throw new Error('Selecione um administrador ativo para recuperar o acesso.');
 if(typeof folder!=='string'||!folder)throw new Error('Pasta local de dados indisponível.');
 // Nunca substituir o banco; backup SQLite consistente em arquivo novo.
 const timestamp=new Date().toISOString().replace(/[:.]/g,'-');
 const backupFile=join(folder,'PDV-Plus-Antes-Recuperacao-'+timestamp+'-'+randomUUID()+'.sqlite');
 await store.backupTo(backupFile);
 verifyDatabase(backupFile);
 // Não alterar usuários, produtos, vendas, tabelas nem sessões de caixa.
 store.authRecoverLocal({operatorId,password});
 return {recovered:true,operatorId,backupFile};
}
