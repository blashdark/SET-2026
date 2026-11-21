const repository = require('./repository');

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

async function revenueByCustomer(req, res) {
  const data = await repository.revenueByCustomer();
  send(res, 200, data);
}

async function topSellingProducts(req, res) {
  const data = await repository.topSellingProducts();
  send(res, 200, data);
}

module.exports = {
  revenueByCustomer,
  topSellingProducts,
};
