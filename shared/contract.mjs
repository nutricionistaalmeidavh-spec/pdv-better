// Modelo canônico de entidades: formulário, validação, SQLite e lista usam este arquivo.
export const CONTRACT_VERSION = 7;
export const roleNames = Object.freeze(['Caixa','Gerente','Administrador']);
export const entityOrder = ['products', 'categories', 'customers', 'suppliers', 'operators'];
export const entities = {
  products: {
    label: 'Produtos', singular: 'Produto', description: 'Itens disponíveis para venda e consulta.',
    fields: [
      { key: 'name', label: 'Nome do produto', type: 'text', required: true },
      { key: 'code', label: 'Código de barras / SKU', type: 'text' },
      { key: 'category_id', label: 'Categoria', type: 'reference', entity: 'categories' },
      { key: 'unit', label: 'Unidade', type: 'select', values: ['UN', 'KG'], required: true, default: 'UN' },
      { key: 'sale_price_cents', label: 'Preço de venda (R$)', type: 'money', required: true, default: 0 },
      { key: 'cost_price_cents', label: 'Preço de custo (R$)', type: 'money', default: 0 },
      { key: 'stock_milli', label: 'Saldo em estoque', type: 'quantity', default: 0, readOnlyOnEdit: true }
    ]
  },
  categories: {
    label: 'Categorias', singular: 'Categoria', description: 'Organize os produtos por tipo.',
    fields: [{ key: 'name', label: 'Nome da categoria', type: 'text', required: true }]
  },
  customers: {
    label: 'Clientes', singular: 'Cliente', description: 'Cadastro de clientes do estabelecimento.',
    fields: [
      { key: 'name', label: 'Nome', type: 'text', required: true },
      { key: 'document', label: 'CPF / CNPJ', type: 'text' },
      { key: 'phone', label: 'Telefone', type: 'text' },
      { key: 'email', label: 'E-mail', type: 'text' }
    ]
  },
  suppliers: {
    label: 'Fornecedores', singular: 'Fornecedor', description: 'Empresas responsáveis pelo fornecimento.',
    fields: [
      { key: 'name', label: 'Razão social / Nome', type: 'text', required: true },
      { key: 'document', label: 'CNPJ / CPF', type: 'text' },
      { key: 'phone', label: 'Telefone', type: 'text' },
      { key: 'email', label: 'E-mail', type: 'text' }
    ]
  },
  operators: {
    label: 'Operadores', singular: 'Operador', description: 'Cadastro de colaboradores; autenticação prevista para outra fase.',
    fields: [
      { key: 'name', label: 'Nome', type: 'text', required: true },
      { key: 'role', label: 'Função', type: 'select', values: roleNames, required: true, default: 'Caixa' }
    ]
  }
};
export function assertEntity(kind) {
  if (!Object.prototype.hasOwnProperty.call(entities, kind)) throw new Error('Entidade não reconhecida.');
  return entities[kind];
}
export const paymentMethods = Object.freeze([{id:'cash',label:'Dinheiro'}, {id:'pix',label:'Pix (confirmação manual)'}, {id:'card',label:'Cartão (maquininha externa)'}, {id:'credit',label:'Fiado / a receber'}]);
export const inventoryKinds = Object.freeze(['receipt','adjustment']);
export const cashMovementKinds = Object.freeze(['reinforcement','withdrawal']);
export const financeTypes = Object.freeze(['payable','receivable']);
export const commerceLabels = Object.freeze({
  cash: {withdrawal:'Sangria (retirar)',reinforcement:'Reforço (adicionar)'},
  inventory: {receipt:'Entrada',adjustment:'Ajuste'},
  finance: {payable:'Conta a pagar',receivable:'Conta a receber'},
  status: {completed:'Concluída',cancelled:'Cancelada',open:'Em aberto',closed:'Fechado',settled:'Liquidada'}
});
export const reportFields = Object.freeze([
  {key:'sales_count',label:'Vendas concluídas',type:'count'},
  {key:'sales_total_cents',label:'Faturamento de vendas',type:'money'},
  {key:'discounts_cents',label:'Descontos concedidos',type:'money'},
  {key:'cash_cents',label:'Dinheiro em vendas',type:'money'},
  {key:'pix_cents',label:'Pix informado',type:'money'},
  {key:'card_cents',label:'Cartão informado',type:'money'},
  {key:'credit_cents',label:'Fiado registrado',type:'money'},
  {key:'receivables_open_cents',label:'Contas a receber em aberto',type:'money'},
  {key:'payables_open_cents',label:'Contas a pagar em aberto',type:'money'},
  {key:'payables_paid_cents',label:'Contas pagas',type:'money'},
  {key:'inventory_value_cents',label:'Valor de custo do estoque',type:'money'},
  {key:'cancelled_count',label:'Vendas canceladas',type:'count'}
]);
export const apiChannels = Object.freeze({
  list: 'pdv:catalog:list', save: 'pdv:catalog:save', archive: 'pdv:catalog:archive',
  overview: 'pdv:overview',
  sessionCurrent: 'pdv:session:current', sessionOpen: 'pdv:session:open', sessionClose: 'pdv:session:close', cashMove: 'pdv:cash:move',
  checkout: 'pdv:checkout:commit', quoteSale: 'pdv:checkout:quote', salesList: 'pdv:sales:list', saleGet: 'pdv:sales:get', salesCancel: 'pdv:sales:cancel',
  stockMove: 'pdv:stock:move', batchReceive: 'pdv:stock:batch-receive', batchesList: 'pdv:stock:batches',
  promotionSet: 'pdv:products:promotion-set', promotionsList: 'pdv:products:promotions',
  bundleSet: 'pdv:products:bundle-set', bundleList: 'pdv:products:bundles', bundleArchive: 'pdv:products:bundle-archive', stockHistory: 'pdv:stock:history',
  financeCreate: 'pdv:finance:create', financeList: 'pdv:finance:list', financeSettle: 'pdv:finance:settle',
  report: 'pdv:report:summary', reportItems: 'pdv:report:items', reportItemsExport: 'pdv:report:items-export', reportExport: 'pdv:report:export',
  lanStatus: 'pdv:lan:status', lanHost: 'pdv:lan:host', lanJoin: 'pdv:lan:join', lanLocal: 'pdv:lan:local',
  deviceGet: 'pdv:device:get', deviceSet: 'pdv:device:set', devicePrinters: 'pdv:device:printers',
  devicePrint: 'pdv:device:print', drawerOpen: 'pdv:drawer:open', scaleRead: 'pdv:scale:read',
  backupCreate: 'pdv:backup:create', backupRestore: 'pdv:backup:restore',
  authStatus: 'pdv:auth:status', authBootstrap: 'pdv:auth:bootstrap', authLogin: 'pdv:auth:login', authLogout: 'pdv:auth:logout', authSetPassword: 'pdv:auth:set-password',
  sessionsList: 'pdv:sessions:list'
});
