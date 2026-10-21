// Chạy: node kiem-tra-crud.js            (server ở http://localhost:3000)
//       node kiem-tra-crud.js http://localhost:4000
const BASE_URL = process.argv[2] || 'http://localhost:3000';

let passCount = 0;
let failCount = 0;
let stepNo = 0;

async function send(method, path, body) {
  const options = { method, signal: AbortSignal.timeout(3000) };
  if (body !== undefined) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(BASE_URL + path, options);
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch (err) {}
  return { status: res.status, data, text };
}

function pickProduct(data) {
  if (data && typeof data === 'object' && 'id' in data) return data;
  if (data && typeof data === 'object') {
    return Object.values(data).find((v) => v && typeof v === 'object' && 'id' in v);
  }
}

function pickList(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return Object.values(data).find(Array.isArray);
}

async function step(title, method, path, body, check) {
  stepNo++;
  const label = `${stepNo}. ${method} ${path}`;
  let res;
  try {
    res = await send(method, path, body);
  } catch (err) {
    failCount++;
    const code = err.cause?.code;
    let reason = code || err.message;
    if (err.name === 'TimeoutError') reason = 'không có response sau 3 giây';
    if (code === 'UND_ERR_SOCKET' || code === 'ECONNRESET') reason = 'server đóng kết nối: server vừa crash ở request này hoặc request ngay trước, xem terminal của server';
    console.log(`FAIL  ${label}  (${title})\n      lỗi: ${reason}`);
    if (code === 'ECONNREFUSED') {
      if (stepNo === 1) {
        console.log(`\nKhông kết nối được ${BASE_URL}. Server đang tắt hoặc sai port.`);
      } else {
        console.log('\nServer không còn chạy. Xem lỗi trong terminal của server: stack trace ghi file và dòng gây crash.');
        summary();
      }
      process.exit(1);
    }
    return undefined;
  }
  const problem = check(res);
  if (problem) {
    failCount++;
    console.log(`FAIL  ${label}  (${title})\n      ${problem}\n      nhận: ${res.status} ${res.text.slice(0, 200)}`);
  } else {
    passCount++;
    console.log(`PASS  ${label}  (${title})  -> ${res.status}`);
  }
  return res;
}

function idProblem(p, expectedId) {
  if (!p) return 'mong đợi body là product';
  if (typeof p.id === 'string') return `id đang là string "${p.id}", mong đợi number ${expectedId}`;
  if (p.id !== expectedId) return `mong đợi id ${expectedId}, nhận id ${p.id}`;
}

function expectStatus(res, allowed) {
  const list = Array.isArray(allowed) ? allowed : [allowed];
  if (!list.includes(res.status)) return `mong đợi status ${list.join(' hoặc ')}`;
}

async function main() {
  console.log(`Kiểm tra CRUD products ở ${BASE_URL}\n`);

  await step('lấy list', 'GET', '/products', undefined, (res) =>
    expectStatus(res, 200) || (pickList(res.data) ? null : 'mong đợi body là mảng product'));

  const resA = await step('tạo product A', 'POST', '/products', { name: 'Test A', price: 100 }, (res) => {
    const p = pickProduct(res.data);
    return expectStatus(res, 201) || (p && typeof p.id === 'number' && p.name === 'Test A' ? null : 'mong đợi body là product vừa tạo, có id kiểu number và name "Test A"');
  });
  const resB = await step('tạo product B', 'POST', '/products', { name: 'Test B', price: 200 }, (res) => {
    const p = pickProduct(res.data);
    return expectStatus(res, 201) || (p && p.name === 'Test B' ? null : 'mong đợi body là product vừa tạo, name "Test B"');
  });

  const A = resA && pickProduct(resA.data);
  const B = resB && pickProduct(resB.data);
  if (!A || !B || A.id === B.id) {
    console.log('\nPOST chưa trả về product có id riêng cho từng lần tạo. Sửa POST trước rồi chạy lại.');
    return summary();
  }

  await step('lấy A theo id', 'GET', `/products/${A.id}`, undefined, (res) =>
    expectStatus(res, 200) || (pickProduct(res.data)?.name === 'Test A' ? null : 'mong đợi body là product A'));

  await step('lấy A theo id, URL có thêm query', 'GET', `/products/${A.id}?x=1`, undefined, (res) =>
    expectStatus(res, 200) || (pickProduct(res.data)?.name === 'Test A' ? null : 'mong đợi body là product A'));

  await step('lấy list có limit', 'GET', '/products?limit=1', undefined, (res) =>
    expectStatus(res, 200) || (pickList(res.data)?.length === 1 ? null : 'mong đợi mảng đúng 1 phần tử'));

  await step('lấy list không truyền limit', 'GET', '/products', undefined, (res) => {
    const ids = (pickList(res.data) || []).map((p) => p.id);
    return expectStatus(res, 200) || (ids.includes(A.id) && ids.includes(B.id) ? null : `mong đợi list có cả A (id ${A.id}) và B (id ${B.id})`);
  });

  await step('tạo product với body JSON sai format', 'POST', '/products', '{name: "Sai"}', (res) =>
    expectStatus(res, 400));

  await step('PATCH giá của A', 'PATCH', `/products/${A.id}`, { price: 150 }, (res) => {
    const p = pickProduct(res.data);
    return expectStatus(res, 200) || (p?.price === 150 && p?.name === 'Test A' ? null : 'mong đợi price 150 và name vẫn là "Test A"');
  });

  const resPatchId = await step('PATCH A, body có gửi kèm id', 'PATCH', `/products/${A.id}`, { id: 999, price: 160 }, (res) =>
    expectStatus(res, [200, 400]) || (res.status === 400 || pickProduct(res.data)?.id === A.id ? null : `mong đợi id vẫn là ${A.id}: id do server cấp, body gửi id thì bỏ qua hoặc trả 400`));
  const expectedPrice = resPatchId?.status === 200 ? 160 : 150;

  await step('lấy lại A sau PATCH', 'GET', `/products/${A.id}`, undefined, (res) => {
    const p = pickProduct(res.data);
    if (res.status === 404) return `mong đợi status 200: A không còn ở id ${A.id} nữa`;
    return expectStatus(res, 200) || idProblem(p, A.id) || (p.price === expectedPrice ? null : `mong đợi price ${expectedPrice}`);
  });

  await step('PUT thay cả B', 'PUT', `/products/${B.id}`, { name: 'Test B2', price: 250 }, (res) => {
    const p = pickProduct(res.data);
    return expectStatus(res, 200) || idProblem(p, B.id) || (p.name === 'Test B2' && p.price === 250 ? null : 'mong đợi name "Test B2", price 250');
  });

  await step('lấy id không tồn tại', 'GET', '/products/999999', undefined, (res) => expectStatus(res, 404));

  await step('xoá id không tồn tại', 'DELETE', '/products/999999', undefined, (res) => expectStatus(res, 404));

  await step('B còn nguyên sau khi xoá id không tồn tại', 'GET', `/products/${B.id}`, undefined, (res) =>
    expectStatus(res, 200) || (pickProduct(res.data)?.name === 'Test B2' ? null : 'mong đợi body là product B'));

  await step('xoá A', 'DELETE', `/products/${A.id}`, undefined, (res) => expectStatus(res, [200, 204]));

  await step('lấy A sau khi xoá', 'GET', `/products/${A.id}`, undefined, (res) => expectStatus(res, 404));

  const resC = await step('tạo product C sau khi đã xoá A', 'POST', '/products', { name: 'Test C', price: 300 }, (res) => {
    const p = pickProduct(res.data);
    return expectStatus(res, 201) || (p?.name === 'Test C' ? null : 'mong đợi body là product C');
  });
  const C = resC && pickProduct(resC.data);
  if (C) {
    await step('lấy C theo id vừa nhận', 'GET', `/products/${C.id}`, undefined, (res) =>
      expectStatus(res, 200) || (pickProduct(res.data)?.name === 'Test C' ? null : `GET /products/${C.id} trả về product "${pickProduct(res.data)?.name}", không phải C`));
  }

  await step('route không tồn tại', 'GET', '/khong-co-route', undefined, (res) => expectStatus(res, 404));

  summary();
}

function summary() {
  console.log(`\nPASS ${passCount}, FAIL ${failCount}.`);
  if (failCount > 0) {
    console.log('Sửa FAIL đầu tiên trước, tắt bật lại server, rồi chạy lại cả bộ.');
  }
}

main();
