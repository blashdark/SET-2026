const controller = require('./controller');

// Nhìn method + path để chọn hàm xử lý. Không đọc body,
// không biết product là gì, chỉ chuyển id (nếu có) xuống controller.

const routes = [
  { method: 'GET', pattern: /^\/products\/?$/, handler: controller.list },
  { method: 'POST', pattern: /^\/products\/?$/, handler: controller.create },
  { method: 'GET', pattern: /^\/products\/([^/]+)\/?$/, handler: controller.getOne },
  { method: 'PUT', pattern: /^\/products\/([^/]+)\/?$/, handler: controller.replace },
  { method: 'PATCH', pattern: /^\/products\/([^/]+)\/?$/, handler: controller.update },
  { method: 'DELETE', pattern: /^\/products\/([^/]+)\/?$/, handler: controller.remove },
];

function route(req, res) {
  const path = req.url.split('?')[0];

  for (const r of routes) {
    if (r.method !== req.method) {
      continue;
    }
    const match = path.match(r.pattern);

    if (!match) {
      continue;
    }
    return r.handler(req, res, { id: match[1] });
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Không tìm thấy route' }));
}

module.exports = route;
