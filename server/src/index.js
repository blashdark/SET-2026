'use strict';

const http = require('http');
const { Router } = require('./router');
const { sendError, readBody } = require('./http');
const { verifyToken } = require('./auth');
const store = require('./store');

const router = new Router();
require('./routes/auth').register(router);
require('./routes/user').register(router);
require('./routes/task').register(router);

const PORT = Number(process.env.PORT || 3000);
const METHODS_WITH_BODY = ['POST', 'PUT', 'PATCH']; // only these methods carry a body

// extract token from 'Authorization: Bearer <token>'
function extractBearer(header) {
  if (typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const route = router.match(req.method, url.pathname);

    if (!route) {
      if (router.pathExists(url.pathname)) {
        return sendError(res, 405, `Phuong thuc ${req.method} khong duoc ho tro cho ${url.pathname}`); // path exists but method is wrong
      }
      return sendError(res, 404, `Khong tim thay ${url.pathname}`); // path does not exist
    }

    let body = {};
    if (METHODS_WITH_BODY.includes(req.method)) {
      body = await readBody(req);
    }

    let user = null;
    if (!route.public) {
      // verify signature + expiry, then load the user (also blocks tokens of deleted users)
      const token = extractBearer(req.headers.authorization);
      const payload = token ? verifyToken(token) : null;
      user = payload ? store.users.byId(payload.sub) : null;
      if (!user) return sendError(res, 401, 'Chua xac thuc hoac token khong hop le');
    }

    const ctx = { req, res, url, params: route.params, body, user };
    await route.handler(ctx);
  } catch (error) {
    if (res.headersSent) return res.end(); // response already started -> cannot write error headers
    return sendError(res, error.status || 500, error.message || 'Loi he thong');
  }
});

server.listen(PORT, () => {
  console.log(`Auth + Task REST API dang chay tai http://localhost:${PORT}`);
});
