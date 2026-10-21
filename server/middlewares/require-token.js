const { sendJson } = require('../http-utils');

const DEMO_TOKEN = 'demo-token';

function requireToken(req, res) {
  if (!req.headers.authorization) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    sendJson(res, 401, { message: 'Thiếu token hoặc token sai' });
    return false;
  }
  return true;
}

module.exports = requireToken;
