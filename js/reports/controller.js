const repository = require('./repository');

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function parseQueryParams(url) {
  const parts = (url || '').split('?');
  if (parts.length < 2) return {};
  const searchParams = new URLSearchParams(parts[1]);
  const result = {};
  for (const [key, val] of searchParams.entries()) {
    result[key] = val;
  }
  return result;
}

async function revenueByCustomer(req, res) {
  const params = parseQueryParams(req.url);
  const options = {};
  if (params.limit) options.limit = params.limit;
  if (params.customerId) options.customerId = params.customerId;
  const data = await repository.revenueByCustomer(options);
  send(res, 200, data);
}

async function topSellingProducts(req, res) {
  const params = parseQueryParams(req.url);
  const options = {};
  if (params.limit) options.limit = params.limit;
  const data = await repository.topSellingProducts(options);
  send(res, 200, data);
}

module.exports = {
  revenueByCustomer,
  topSellingProducts,
};
