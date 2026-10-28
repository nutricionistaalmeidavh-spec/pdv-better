// Modelo canônico de entidades: formulário, validação, SQLite e lista usam este arquivo.
export const CONTRACT_VERSION = 2;
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
      { key: 'stock_milli', label: 'Saldo inicial', type: 'quantity', default: 0 }
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
      { key: 'role', label: 'Função', type: 'select', values: ['Caixa', 'Gerente', 'Administrador'], required: true, default: 'Caixa' }
    ]
  }
};
export function assertEntity(kind) {
  if (!Object.prototype.hasOwnProperty.call(entities, kind)) throw new Error('Entidade não reconhecida.');
  return entities[kind];
}
export const apiChannels = Object.freeze({
  list: 'pdv:catalog:list', save: 'pdv:catalog:save', archive: 'pdv:catalog:archive',
  overview: 'pdv:overview', saleComplete: 'pdv:sale:complete', salesList: 'pdv:sale:list', saleDetail: 'pdv:sale:detail'
});
