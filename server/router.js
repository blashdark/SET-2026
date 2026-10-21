const productController = require('./controllers/product-controller');
const logRequest = require('./middlewares/log-request');
const requireToken = require('./middlewares/require-token');
const { sendJson } = require('./http-utils');

const routes = [
  { method: 'GET', path: '/products', middlewares: [], handler: productController.list },
  { method: 'GET', path: '/products/:id', middlewares: [], handler: productController.getById },
  { method: 'POST', path: '/products', middlewares: [requireToken], handler: productController.create },
  { method: 'PUT', path: '/products/:id', middlewares: [requireToken], handler: productController.replace },
  { method: 'PATCH', path: '/products/:id', middlewares: [requireToken], handler: productController.update },
  { method: 'DELETE', path: '/products/:id', middlewares: [], handler: productController.remove },
];

function matchPath(routePath, pathname) {
  const routeParts = routePath.split('/');
  const parts = pathname.split('/');
  if (routeParts.length !== parts.length) return null;

  const params = {};
  for (let i = 0; i < routeParts.length; i++) {
    if (routeParts[i].startsWith(':')) {
      params[routeParts[i].slice(1)] = parts[i];
    } else if (routeParts[i] !== parts[i]) {
      return null;
    }
  }
  return params;
}

async function handleRequest(req, res) {
  if (!logRequest(req, res)) return;

  const url = new URL(req.url, 'http://localhost');
  for (const route of routes) {
    if (route.method !== req.method) continue;
    const params = matchPath(route.path, url.pathname);
    if (!params) continue;

    try {
      for (const middleware of route.middlewares) {
        if (!middleware(req, res)) return;
      }
      await route.handler(req, res, params, url);
    } catch (err) {
      console.error(err);
      sendJson(res, 500, { message: 'Lỗi server' });
    }
    return;
  }

  sendJson(res, 404, { message: 'Không tìm thấy route' });
}

module.exports = { handleRequest };
