// Middleware dùng chung cho nhiều route. Được tự trả response và dừng
// request (không gọi next). Không chọn route, không đụng dữ liệu.

function logger(req, res, next) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
}

// Middleware kiểm token: tự trả 401 (kèm WWW-Authenticate) và dừng nếu sai.
function requireToken(token) {
  return function (req, res, next) {
    const header = req.headers['authorization'] || '';
    if (header !== `Bearer ${token}`) {
      res.writeHead(401, {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer',
      });
      res.end(JSON.stringify({ message: 'Thiếu hoặc sai token' }));
      return;
    }
    next();
  };
}

module.exports = { logger, requireToken };
