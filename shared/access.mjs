// Única fonte de verdade das permissões (UI, IPC, LAN e testes).
import {roleNames} from './contract.mjs';
const cashActions=['list','overview','getCurrentSession','openSession','closeSession','checkout','quoteSale','listBatches','listSales','getSale','devicePrint','devicePrinters','scaleRead','drawerOpen'];
const managerActions=['save','archive','moveCash','cancelSale','moveStock','listStockMovements','receiveBatch','listBatches','setPromotion','listPromotions','setBundlePromotion','listBundlePromotions','archiveBundlePromotion','reportItems','createFinance','listFinance','settleFinance','report','reportExport','listOpenSessions','deviceGet','deviceSet','backupCreate'];
const adminActions=['setPassword','lanStatus','lanHost','lanJoin','lanLocal','backupRestore'];
export const permissions=Object.freeze({
 Caixa:Object.freeze([...cashActions,'saveCustomer','listCustomer']),
 Gerente:Object.freeze([...cashActions,...managerActions,'saveCustomer','listCustomer']),
 Administrador:Object.freeze([...cashActions,...managerActions,...adminActions,'saveCustomer','listCustomer','manageOperators'])
});
export function allowed(role,method,args=[]){
 if(!roleNames.includes(role))return false;
 if(method==='list' && role==='Caixa')return ['products','categories','customers'].includes(args[0]);
 if(method==='list' && args[0]==='operators')return role==='Administrador';
 if(method==='save' && args[0]==='operators')return role==='Administrador';
 if(method==='archive' && args[0]==='operators')return role==='Administrador';
 if(method==='save' && args[0]==='customers')return true;
 if(method==='list' && args[0]==='customers')return true;
 if(method==='archive' && args[0]==='customers')return role!=='Caixa';
 return permissions[role].includes(method);
}
