const dataSource = require('../data-sources/file-data-source');

function findAll(limit) {
  const { products } = dataSource.load();
  return limit ? products.slice(0, limit) : products;
}

function findById(id) {
  const { products } = dataSource.load();
  return products.find((p) => p.id === id);
}

function create({ name, price }) {
  const data = dataSource.load();
  const product = { id: data.nextId++, name, price };
  data.products.push(product);
  dataSource.save(data);
  return product;
}

function replace(id, { name, price }) {
  const data = dataSource.load();
  const index = data.products.findIndex((p) => p.id === id);
  if (index === -1) return null;
  data.products[index] = { id, name, price };
  dataSource.save(data);
  return data.products[index];
}

function update(id, changes) {
  const data = dataSource.load();
  const product = data.products.find((p) => p.id === id);
  if (!product) return null;
  Object.assign(product, changes, { id });
  dataSource.save(data);
  return product;
}

function remove(id) {
  const data = dataSource.load();
  const index = data.products.findIndex((p) => p.id === id);
  if (index === -1) return false;
  data.products.splice(index);
  dataSource.save(data);
  return true;
}

module.exports = { findAll, findById, create, replace, update, remove };
