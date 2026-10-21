// Kiểm tra bài 4: đọc body đã chuyển sang middleware mà client vẫn thấy y như cũ.
// Server trong folder server/ phải đang chạy ở port 3000. Chạy: node kiem-tra-bai-4.js
const fs = require('fs');
const path = require('path');

const SERVER_DIR = process.env.SERVER_DIR || path.join(__dirname, 'server');
const DATA_FILE = path.join(SERVER_DIR, 'data', 'products.json');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TOKEN = { Authorization: 'Bearer demo-token' };
const SEED = {
  products: [
    { id: 1, name: 'Bút bi', price: 5000 },
    { id: 2, name: 'Vở kẻ ngang', price: 12000 },
    { id: 3, name: 'Bìa hồ sơ', price: 8000 },
  ],
  nextId: 4,
};

let passCount = 0;
let failCount = 0;
let stepNo = 0;

function writeSeed() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(SEED, null, 2));
}

async function call(method, urlPath, body, headers = {}) {
  const options = { method, headers: { ...headers }, signal: AbortSignal.timeout(3000) };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  try {
    const res = await fetch(BASE_URL + urlPath, options);
    const text = await res.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch (err) {}
    return { status: res.status, data, text };
  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED') {
      console.log(`\nKhông kết nối được ${BASE_URL}. Server tắt rồi hoặc chưa chạy. Xem terminal của server: nếu có stack trace thì server vừa crash, đọc file và dòng trong đó.`);
      writeSeed();
      process.exit(1);
    }
    const reason = err.name === 'TimeoutError' ? 'không có response sau 3 giây (đang dừng ở breakpoint?)' : err.message;
    return { status: 0, data: undefined, text: `lỗi: ${reason}` };
  }
}

function report(title, problem, res) {
  stepNo++;
  const label = `${stepNo}. ${title}`;
  if (problem) {
    failCount++;
    console.log(`FAIL  ${label}\n      ${problem}${res ? `\n      nhận: ${res.status} ${res.text.slice(0, 160) || '(body rỗng)'}` : ''}`);
  } else {
    passCount++;
    console.log(`PASS  ${label}${res ? `  -> ${res.status}` : ''}`);
  }
}

function withoutComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function expect(res, status, message) {
  if (res.status !== status) return `mong đợi status ${status}`;
  if (message && res.data?.message !== message) return `mong đợi message "${message}"`;
}

async function check(title, method, urlPath, body, headers, verify) {
  writeSeed();
  const res = await call(method, urlPath, body, headers);
  report(title, verify(res), res);
}

async function main() {
  console.log(`Kiểm tra bài 4 ở ${BASE_URL}\n`);

  await check('POST JSON hỏng, có token: 400', 'POST', '/products', '{name: "Sai"}', TOKEN, (res) =>
    expect(res, 400, 'Body không phải JSON hợp lệ'));
  await check('PATCH JSON hỏng, có token: 400', 'PATCH', '/products/3', '{price: 50}', TOKEN, (res) =>
    expect(res, 400, 'Body không phải JSON hợp lệ'));
  await check('PUT body là mảng: 400', 'PUT', '/products/3', [1, 2], TOKEN, (res) =>
    expect(res, 400, 'Body phải là một object'));
  await check('POST JSON hỏng, không token: 401, kiểm token trước khi đọc body', 'POST', '/products', '{name: "Sai"}', {}, (res) =>
    expect(res, 401, 'Thiếu token hoặc token sai'));
  await check('POST hợp lệ: 201', 'POST', '/products', { name: 'Thước kẻ', price: 7000 }, TOKEN, (res) =>
    expect(res, 201) || (res.data?.id === 4 && res.data?.name === 'Thước kẻ' ? null : 'mong đợi id 4, name "Thước kẻ"'));
  await check('PATCH hợp lệ: 200', 'PATCH', '/products/3', { price: 9000 }, TOKEN, (res) =>
    expect(res, 200) || (res.data?.price === 9000 && res.data?.name === 'Bìa hồ sơ' ? null : 'mong đợi name giữ nguyên, price 9000'));
  await check('PUT hợp lệ: 200', 'PUT', '/products/2', { name: 'Vở ô li', price: 15000 }, TOKEN, (res) =>
    expect(res, 200) || (res.data?.name === 'Vở ô li' && res.data?.price === 15000 ? null : 'mong đợi name "Vở ô li", price 15000'));

  const controller = withoutComments(fs.readFileSync(path.join(SERVER_DIR, 'controllers', 'product-controller.js'), 'utf8'));
  report('controllers/product-controller.js không còn gọi readBody',
    /readBody/.test(controller) ? 'controller vẫn còn readBody (không tính dòng comment)' : null);

  const middlewareDir = path.join(SERVER_DIR, 'middlewares');
  const setsBody = fs.readdirSync(middlewareDir).filter((f) => /req\.body\s*=/.test(withoutComments(fs.readFileSync(path.join(middlewareDir, f), 'utf8'))));
  report('có một file trong middlewares/ gán req.body',
    setsBody.length ? null : 'chưa thấy file nào trong middlewares/ có dòng req.body = ...');

  writeSeed();
  console.log(`\nPASS ${passCount}, FAIL ${failCount}.`);
  process.exitCode = failCount > 0 ? 1 : 0;
}

main();
