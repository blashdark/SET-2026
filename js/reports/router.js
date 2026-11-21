const controller = require('./controller');

const routes = [
  { method: 'GET', pattern: /^\/reports\/revenue-by-customer\/?$/, handler: controller.revenueByCustomer },
  { method: 'GET', pattern: /^\/reports\/top-products\/?$/, handler: controller.topSellingProducts },
];

async function route(req, res) {
  const path = req.url.split('?')[0];

  for (const r of routes) {
    if (r.method !== req.method) {
      continue;
    }
    const match = path.match(r.pattern);
    if (!match) {
      continue;
    }

    await r.handler(req, res);
    return true;
  }

  return false;
}

module.exports = route;
