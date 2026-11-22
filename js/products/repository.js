const dataSource = require('./dataSource');

// Chỉ gọi datasource, không biết req/res/status hay MongoDB driver.
async function all() { return dataSource.all(); }
async function findById(id) { return dataSource.findById(id); }
async function create(data) { return dataSource.create(data); }
async function replace(id, data) { return dataSource.replace(id, data); }
async function update(id, patch) { return dataSource.update(id, patch); }
async function remove(id) { return dataSource.remove(id); }

module.exports = { all, findById, create, replace, update, remove };