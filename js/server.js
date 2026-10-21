const http = require('http');
const { logger } = require('./products/middleware');
const route = require('./products/router');

// server.js chỉ là composition root: wire middleware -> router.

const middlewares = [logger];

function sendServerError(res) {
  if (res.headersSent) {
    return;
  }
  res.writeHead(500, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Lỗi server' }));
}

function run(req, res, index) {
  const middleware = middlewares[index];

  if (middleware) {
    middleware(req, res, () => run(req, res, index + 1));
    return;
  }

  try {
    const result = route(req, res);
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
