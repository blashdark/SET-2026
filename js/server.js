const http = require('http');
const { logger, requireToken } = require('./products/middleware');
const productRoute = require('./products/router');
let reportRoute;
try {
  reportRoute = require('./reports/router');
} catch (err) {
  // Graceful fallback if reports module isn't loaded or in isolated mock vm
  if (err && err.code && err.code !== 'MODULE_NOT_FOUND' && !err.message.includes('Unexpected module')) {
    throw err;
  }
}

// server.js chỉ là composition root: wire middleware -> router.

const middlewares = [logger];

// Bật kiểm token bằng biến môi trường, ví dụ: API_TOKEN=secret node js/server.js
if (process.env.API_TOKEN) {
  middlewares.push(requireToken(process.env.API_TOKEN));
}

function sendServerError(res) {
  if (res.headersSent) {
    return;
  }
  res.writeHead(500, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Lỗi server' }));
}

async function dispatch(req, res) {
  const path = req.url ? req.url.split('?')[0] : '';
  if ((path === '/reports' || path.startsWith('/reports/')) && reportRoute) {
    const handled = await reportRoute(req, res);
    if (handled) return;
  }
  await productRoute(req, res);
}

function run(req, res, index) {
  const middleware = middlewares[index];

  if (middleware) {
    middleware(req, res, () => run(req, res, index + 1));
    return;
  }

  try {
    const result = dispatch(req, res);
    if (result && typeof result.catch === 'function') {
      result.catch(() => sendServerError(res));
    }
  } catch (err) {
    sendServerError(res);
  }
}

const server = http.createServer((req, res) => {
  run(req, res, 0);
});

server.listen(3000, () => {
  console.log('Server đang chạy ở http://localhost:3000');
});
