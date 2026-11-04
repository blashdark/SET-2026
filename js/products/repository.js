const dataSource = require('./dataSource');

// Chỉ gọi datasource, không biết req/res/status hay MongoDB driver.
async function all() { return dataSource.all(); }
async function findById(id) { return dataSource.findById(id); }
async function create({ name, price }) { return dataSource.create({ name, price }); }
async function replace(id, { name, price }) { return dataSource.replace(id, { name, price }); }
async function update(id, patch) { return dataSource.update(id, patch); }
async function remove(id) { return dataSource.remove(id); }

module.exports = { all, findById, create, replace, update, remove };