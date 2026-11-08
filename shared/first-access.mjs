// Primeiro acesso offline: o checklist reflete o estado operacional canônico.
export const FIRST_ACCESS_VERSION=1;
export function firstAccessStorageKey(userId){
  return 'pdv-super:first-access-dismissed:v'+FIRST_ACCESS_VERSION+':'+String(userId);
}
export function isStoreProfileReady(value){
  if(!value||typeof value!=='object')return false;
  const name=typeof value.name==='string'?value.name.trim():'';
  const document=typeof value.document==='string'?value.document.replace(/\D/g,''):'';
  const address=typeof value.address==='string'?value.address.trim():'';
  return name.length>=2&&[11,14].includes(document.length)&&address.length>=5;
}
export function normalizeStoreProfile(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Dados do estabelecimento inválidos.');
  for(const field of ['name','document','address'])
    if(typeof input[field]!=='string')throw new Error('Informe nome, documento e endereço do estabelecimento.');
  const profile={name:input.name.trim(),document:input.document.replace(/\D/g,''),address:input.address.trim()};
  if(profile.name.length>120||profile.address.length>300||input.document.length>24)
    throw new Error('Dados do estabelecimento excedem o limite permitido.');
  if(!isStoreProfileReady(profile))
    throw new Error('Informe nome (2 ou mais caracteres), CPF/CNPJ (11 ou 14 dígitos) e endereço (5 ou mais caracteres).');
  return profile;
}
export function evaluateFirstAccess({databaseReady=false,profile=null,productsCount=0,cashOpen=false}={}){
  const companyReady=isStoreProfileReady(profile);
  const productsReady=Number.isSafeInteger(productsCount)&&productsCount>0;
  const cashReady=cashOpen===true;
  const steps=[
    {id:'system',title:'Sistema instalado',detail:databaseReady?'Banco local pronto para operar':'Verifique a conexão com o banco local',
      state:databaseReady?'done':'pending',action:null},
    {id:'company',title:'Dados do estabelecimento',detail:companyReady?'Cadastro concluído':'Informe nome, CPF/CNPJ e endereço',
      state:companyReady?'done':'pending',action:'company'},
    {id:'products',title:'Primeiros produtos',detail:productsReady?'Catálogo iniciado':'Pode cadastrar depois',
      state:productsReady?'done':'optional',action:'products'},
    {id:'cash',title:'Abertura do caixa',detail:cashReady?'Caixa aberto neste terminal':'Pode abrir antes da primeira venda',
      state:cashReady?'done':'optional',action:'cash'}
  ];
  const completed=steps.filter(step=>step.state==='done').length;
  return {steps,completed,total:steps.length,percentage:Math.round(100*completed/steps.length),
    operationReady:databaseReady&&companyReady,companyReady,productsReady,cashReady};
}
