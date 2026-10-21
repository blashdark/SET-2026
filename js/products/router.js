const controller = require('./controller');
const { parseJsonBody } = require('./middleware');

// Nhìn method + path để chọn hàm xử lý. Không đọc body,
// không biết product là gì, chỉ chuyển id (nếu có) xuống controller.

const routes = [
  { method: 'GET', pattern: /^\/products\/?$/, middlewares: [], handler: controller.list },
  { method: 'POST', pattern: /^\/products\/?$/, middlewares: [parseJsonBody], handler: controller.create },
  { method: 'GET', pattern: /^\/products\/([0-9]+)\/?$/, middlewares: [], handler: controller.getOne },
  { method: 'PUT', pattern: /^\/products\/([0-9]+)\/?$/, middlewares: [parseJsonBody], handler: controller.replace },
  { method: 'PATCH', pattern: /^\/products\/([0-9]+)\/?$/, middlewares: [parseJsonBody], handler: controller.update },
  { method: 'DELETE', pattern: /^\/products\/([0-9]+)\/?$/, middlewares: [], handler: controller.remove },
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

    const params = { id: match[1] };
    const middlewares = r.middlewares || [];

    let index = 0;

    const next = async () => {
      if (res.writableEnded || res.headersSent) {
        return;
      }
      if (index < middlewares.length) {
        const mw = middlewares[index++];
        let called = false;
        await mw(req, res, async () => {
          if (called) return;
          called = true;
          await next();
        });
      } else {
        await r.handler(req, res, params);
      }
    };

    await next();
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Không tìm thấy route' }));
}

module.exports = route;
