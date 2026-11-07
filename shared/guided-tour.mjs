// Tour offline do PDV SUPER. Sem serviço externo, telemetria ou dados de terceiros.
export const TOUR_VERSION = 1;
const ALL_STEPS = Object.freeze([
  {id:'welcome',view:'dashboard',selector:'[data-tour="brand"]',
    title:'Bem-vindo ao PDV SUPER',
    description:'Este é seu espaço de trabalho. Em poucos passos você vai conhecer o caixa, os cadastros e os controles da loja.'},
  {id:'navigation',view:'dashboard',selector:'[data-tour="navigation"]',
    title:'Tudo ao seu alcance',
    description:'O menu agrupa as tarefas por operação, gestão, cadastros e sistema. Só aparecem funções liberadas para seu perfil.'},
  {id:'products',view:'products',selector:'[data-tour-nav="products"]',
    title:'Cadastre seus produtos',
    description:'Inclua nome, código de barras, preço, estoque e foto. Depois, os produtos ficam disponíveis para venda.'},
  {id:'cash',view:'cash',selector:'[data-tour-nav="cash"]',
    title:'Abra e confira o caixa',
    description:'Antes de vender, informe o troco inicial. Acompanhe sangrias, reforços e o fechamento do turno.'},
  {id:'checkout',view:'checkout',selector:'[data-tour-nav="checkout"]',
    title:'Faça uma venda',
    description:'Busque o produto ou use o leitor de código de barras. Monte o carrinho e escolha a forma de pagamento.'},
  {id:'sales',view:'sales',selector:'[data-tour-nav="sales"]',
    title:'Consulte as vendas',
    description:'Veja o histórico de operações e encontre comprovantes não fiscais para conferência e reimpressão.'},
  {id:'inventory',view:'inventory',selector:'[data-tour-nav="inventory"]',
    title:'Controle seu estoque',
    description:'Registre entradas, saídas, ajustes e acompanhe alertas de saldo e validade dos lotes.'},
  {id:'purchases',view:'purchases',selector:'[data-tour-nav="purchases"]',
    title:'Organize as compras',
    description:'Crie pedidos, receba mercadorias e acompanhe os custos de reposição do catálogo.'},
  {id:'finance',view:'finance',selector:'[data-tour-nav="finance"]',
    title:'Acompanhe as contas',
    description:'Consulte contas a pagar e receber, baixas e a previsão do fluxo de caixa da loja.'},
  {id:'reports',view:'reports',selector:'[data-tour-nav="reports"]',
    title:'Analise seus resultados',
    description:'Consulte vendas e indicadores por período e exporte os relatórios disponíveis.'},
  {id:'settings',view:'settings',selector:'[data-tour-nav="settings"]',
    title:'Configure sua operação',
    description:'Ajuste dispositivos e rede local, além de consultar as opções de backup e restauração.'},
  {id:'finish',view:'dashboard',selector:'[data-tour="brand"]',
    title:'Pronto para começar!',
    description:'Você conhece os principais módulos. Pode refazer este tour quando quiser pelo botão Tour guiado no topo.'}
]);
export function getTourSteps(role){
  const allowedViews=role==='Administrador'
    ? null
    : role==='Gerente'
      ? new Set(['dashboard','products','cash','checkout','sales','inventory','purchases','finance','reports'])
      : new Set(['dashboard','products','cash','checkout','sales']);
  return ALL_STEPS.filter(step=>allowedViews===null||allowedViews.has(step.view));
}
export function tourStorageKey(userId){return 'pdv-super:guided-tour:v'+TOUR_VERSION+':'+userId;}
export function hasCompletedTour(value){return value==='completed'||value==='dismissed';}
export function nextTourStepIndex(index,total){return Math.min(Math.max(0,total-1),Math.max(0,index+1));}
export function previousTourStepIndex(index){return Math.max(0,index-1);}
