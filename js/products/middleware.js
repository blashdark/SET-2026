// Middleware dùng chung cho nhiều route. Được tự trả response và dừng
// request (không gọi next). Không chọn route, không đụng dữ liệu.

function logger(req, res, next) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
}

function checkToken(req, res, next, token) {
  const header = req.headers['authorization'] || '';
  if (header !== `Bearer ${token}`) {
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Bearer',
    });
    res.end(JSON.stringify({ message: 'Thiếu token hoặc token sai' }));
    return;
  }
  next();
}

// Middleware kiểm token: tự trả 401 (kèm WWW-Authenticate) và dừng nếu sai.
function requireToken(tokenOrReq, res, next) {
  if (typeof tokenOrReq === 'string') {
    const token = tokenOrReq;
    return function (req, res, next) {
      checkToken(req, res, next, token);
    };
  }
  const token = process.env.API_TOKEN || 'demo-token';
  checkToken(tokenOrReq, res, next, token);
}

// Middleware đọc và parse JSON body. Tự trả 400 và dừng nếu không hợp lệ.
async function parseJsonBody(req, res, next) {
  return new Promise((resolve, reject) => {
    let raw = '';

    req.on('data', (chunk) => {
      raw += chunk;
    });

    req.on('end', async () => {
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Body không phải JSON hợp lệ' }));
        resolve();
        return;
      }

      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Body phải là một object' }));
        resolve();
        return;
      }

      req.body = parsed;
      try {
        await next();
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    req.on('error', () => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Body không phải JSON hợp lệ' }));
      resolve();
    });
  });
}

module.exports = { logger, requireToken, parseJsonBody };
