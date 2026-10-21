// Gửi 12 request vào server ở folder server/ (phải đang chạy ở port 3000), in PASS hoặc FAIL từng bước.
// Chạy: node kiem-tra-5-bug.js
// Trước mỗi bước, bộ kiểm tra ghi lại data/products.json về 3 product ban đầu, nên bước sau không bị bước trước làm hỏng.
const fs = require('fs');
const path = require('path');

const SERVER_DIR = process.env.SERVER_DIR || path.join(__dirname, 'server');
const DATA_FILE = path.join(SERVER_DIR, 'data', 'products.json');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TOKEN = { Authorization: 'Bearer demo-token' };
const WRONG_TOKEN = { Authorization: 'Bearer token-sai' };
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

function readIdsInFile() {
  const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const list = Array.isArray(saved) ? saved : saved.products;
  return list.map((p) => p.id);
}

async function send(method, urlPath, body, headers = {}) {
  const options = { method, headers: { ...headers }, signal: AbortSignal.timeout(3000) };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(BASE_URL + urlPath, options);
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch (err) {}
  return { status: res.status, data, text };
}

function report(label, problem, res) {
  if (problem) {
    failCount++;
    console.log(`FAIL  ${label}\n      ${problem}${res ? `\n      nhận: ${res.status} ${res.text.slice(0, 160) || '(body rỗng)'}` : ''}`);
  } else {
    passCount++;
    console.log(`PASS  ${label}${res ? `  -> ${res.status}` : ''}`);
  }
}

async function call(method, urlPath, body, headers) {
  try {
    return await send(method, urlPath, body, headers);
  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED') {
      console.log(`\nKhông kết nối được ${BASE_URL}. Chạy server trong folder server/ trước (node server.js).`);
      writeSeed();
      process.exit(1);
    }
    const reason = err.name === 'TimeoutError' ? 'không có response sau 3 giây (đang dừng ở breakpoint?)' : err.message;
    return { status: 0, data: undefined, text: `lỗi: ${reason}` };
  }
}

function expect(res, status, message) {
  if (res.status !== status) return `mong đợi status ${status}`;
  if (message && res.data?.message !== message) return `mong đợi message "${message}"`;
}

async function step(title, run) {
  stepNo++;
  writeSeed();
  const { res, problem } = await run();
  report(`${stepNo}. ${title}`, problem, res);
}

async function main() {
  console.log(`Kiểm tra server ở ${BASE_URL}\n`);

  await step('GET /products trả 3 product', async () => {
    const res = await call('GET', '/products');
    return { res, problem: expect(res, 200) || (Array.isArray(res.data) && res.data.length === 3 ? null : 'mong đợi mảng 3 product') };
  });

  await step('GET /products/1 trả product "Bút bi"', async () => {
    const res = await call('GET', '/products/1');
    return { res, problem: expect(res, 200) || (res.data?.name === 'Bút bi' ? null : 'mong đợi name "Bút bi"') };
  });

  await step('GET /products/99 trả 404', async () => {
    const res = await call('GET', '/products/99');
    return { res, problem: expect(res, 404, 'Không có product này') };
  });

  await step('POST /products không có token thì 401', async () => {
    const res = await call('POST', '/products', { name: 'Thước kẻ', price: 7000 });
    return { res, problem: expect(res, 401, 'Thiếu token hoặc token sai') };
  });

  await step('POST /products với token sai thì 401', async () => {
    const res = await call('POST', '/products', { name: 'Thước kẻ', price: 7000 }, WRONG_TOKEN);
    return { res, problem: expect(res, 401, 'Thiếu token hoặc token sai') };
  });

  await step('POST /products với token đúng thì 201, product mới có id 4', async () => {
    const res = await call('POST', '/products', { name: 'Thước kẻ', price: 7000 }, TOKEN);
    return { res, problem: expect(res, 201) || (res.data?.id === 4 ? null : 'mong đợi id 4') };
  });

  await step('tạo "Thước kẻ" xong thì GET /products có 4 product', async () => {
    const created = await call('POST', '/products', { name: 'Thước kẻ', price: 7000 }, TOKEN);
    if (created.status !== 201) return { res: created, problem: 'POST với token đúng chưa trả 201, sửa bước 6 trước' };
    const res = await call('GET', '/products');
    const ok = Array.isArray(res.data) && res.data.length === 4 && res.data.some((p) => p.name === 'Thước kẻ');
    return { res, problem: expect(res, 200) || (ok ? null : 'mong đợi mảng 4 product, có "Thước kẻ"') };
  });

  await step('PATCH /products/3 price -5 thì 400', async () => {
    const res = await call('PATCH', '/products/3', { price: -5 }, TOKEN);
    return { res, problem: expect(res, 400, 'price phải là số >= 0') };
  });

  await step('PATCH /products/3 price 9000 thì 200', async () => {
    const res = await call('PATCH', '/products/3', { price: 9000 }, TOKEN);
    const ok = res.data?.id === 3 && res.data?.name === 'Bìa hồ sơ' && res.data?.price === 9000;
    return { res, problem: expect(res, 200) || (ok ? null : 'mong đợi id 3, name giữ nguyên, price 9000') };
  });

  await step('DELETE /products/2 không có token thì 401', async () => {
    const res = await call('DELETE', '/products/2');
    return { res, problem: expect(res, 401, 'Thiếu token hoặc token sai') };
  });

  await step('DELETE /products/2 với token đúng thì 204, file chỉ mất đúng product 2', async () => {
    const res = await call('DELETE', '/products/2', undefined, TOKEN);
    const problem = expect(res, 204);
    if (problem) return { res, problem };
    const ids = readIdsInFile();
    return { res, problem: ids.join(',') === '1,3' ? null : `mong đợi file còn id 1,3, thấy id [${ids.join(',')}]` };
  });

  await step('sai route PATCH /product/3 thì 404', async () => {
    const res = await call('PATCH', '/product/3', { price: 50 }, TOKEN);
    return { res, problem: expect(res, 404, 'Không tìm thấy route') };
  });

  writeSeed();
  console.log(`\nPASS ${passCount}, FAIL ${failCount}.`);
  process.exitCode = failCount > 0 ? 1 : 0;
}

main();
