// Gửi 1 request rồi in status và body. Không đặt timeout, nên dùng được khi server đang dừng lâu ở breakpoint.
// Chạy: node gui-request.js <tên ví dụ>          vd: node gui-request.js lay-1
//       node gui-request.js METHOD PATH [body] [--token | --token-sai]
//       body viết dạng field=giá-trị, vd: node gui-request.js PATCH /products/2 price=100 --token
const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TOKENS = { dung: 'demo-token', sai: 'token-sai' };

const examples = {
  'lay-1': ['GET', '/products/1', undefined, null],
  'token-sai': ['POST', '/products', '{"name": "Thước kẻ", "price": 7000}', 'sai'],
  'tao-moi': ['POST', '/products', '{"name": "Thước kẻ", "price": 7000}', 'dung'],
  'xoa-2-khong-token': ['DELETE', '/products/2', undefined, null],
  'xoa-2': ['DELETE', '/products/2', undefined, 'dung'],
  'sua-3': ['PATCH', '/products/3', '{"price": 9000}', 'dung'],
  'json-hong': ['PATCH', '/products/3', '{price: 50}', 'dung'],
};

function toBody(args) {
  if (args.length === 0) return undefined;
  if (args.length === 1 && !/^\w+=/.test(args[0])) return args[0];
  const body = {};
  for (const pair of args) {
    const [key, ...rest] = pair.split('=');
    const value = rest.join('=');
    body[key] = value !== '' && !Number.isNaN(Number(value)) ? Number(value) : value;
  }
  return JSON.stringify(body);
}

function main() {
  const args = process.argv.slice(2);
  const tokenFlag = args.includes('--token-sai') ? 'sai' : args.includes('--token') ? 'dung' : null;
  const rest = args.filter((a) => a !== '--token' && a !== '--token-sai');

  let method, path, body, token;
  if (examples[rest[0]]) {
    [method, path, body, token] = examples[rest[0]];
  } else if (rest.length >= 2) {
    [method, path] = rest;
    body = toBody(rest.slice(2));
    token = tokenFlag;
  } else {
    console.log('Cách dùng: node gui-request.js <' + Object.keys(examples).join(' | ') + '>');
    console.log('      hoặc: node gui-request.js METHOD PATH [field=giá-trị ...] [--token | --token-sai]');
    process.exit(1);
  }

  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${TOKENS[token]}`;

  console.log(`> ${method} ${path}${token ? `  (token ${token === 'dung' ? 'đúng' : 'sai'})` : '  (không token)'}${body !== undefined ? '\n> body: ' + body : ''}`);
  const req = http.request(BASE_URL + path, { method, headers }, (res) => {
    let text = '';
    res.on('data', (chunk) => {
      text += chunk;
    });
    res.on('end', () => {
      console.log(`< ${res.statusCode}`);
      if (res.headers['www-authenticate']) console.log(`< WWW-Authenticate: ${res.headers['www-authenticate']}`);
      if (text) console.log(`< ${text}`);
    });
  });
  req.on('error', (err) => {
    console.log('Không gửi được request:', err.code || err.message);
    process.exit(1);
  });
  if (body !== undefined) req.write(body);
  req.end();
}

main();
