const dataSource = require('./dataSource');

// Các thao tác với product. Không thấy thì trả null.
// Tầng này chỉ nói chuyện với dataSource, không biết req/res/status.

function all() {
  return dataSource.load();
}

function findById(id) {
  const products = dataSource.load();
  return products.find((p) => p.id === id) || null;
}

function create({ name, price }) {
  const products = dataSource.load();
  const nextId = products.length ? Math.max(...products.map((p) => p.id)) + 1 : 1;
  const product = { id: nextId, name, price };
  products.push(product);
  dataSource.save(products);
  return product;
}

function replace(id, { name, price }) {
  const products = dataSource.load();
  const index = products.findIndex((p) => p.id === id);
  if (index === -1) {
    return null;
  }
  const product = { id, name, price };
  products[index] = product;
  dataSource.save(products);
  return product;
}

function update(id, patch) {
  const products = dataSource.load();
  const index = products.findIndex((p) => p.id === id);
  if (index === -1) {
    return null;
  }
  const product = { ...products[index], ...patch, id };
  products[index] = product;
  dataSource.save(products);
  return product;
}

function remove(id) {
  const products = dataSource.load();
  const index = products.findIndex((p) => p.id === id);
  if (index === -1) {
    return null;
  }
  const [product] = products.splice(index, 1);
  dataSource.save(products);
  return product;
}

module.exports = { all, findById, create, replace, update, remove };
