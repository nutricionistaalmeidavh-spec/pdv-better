export function filterCheckoutProducts(products, categoryId = 'all', query = '', limit = 60) {
  const needle = String(query).trim().toLocaleLowerCase('pt-BR');
  return products.filter(product =>
    (categoryId === 'all' || product.category_id === categoryId) &&
    (!needle || (String(product.name || '') + ' ' + String(product.code || '')).toLocaleLowerCase('pt-BR').includes(needle))
  ).slice(0, limit);
}
