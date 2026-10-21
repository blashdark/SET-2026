const repository = require('./repository');

// Lấy id/query/body từ request, kiểm input, gọi repository,
// chọn status và body. Không biết dữ liệu nằm ở mảng hay file.

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try {
        resolve({ ok: true, value: JSON.parse(raw) });
      } catch (err) {
        resolve({ ok: false });
      }
    });
    req.on('error', () => resolve({ ok: false }));
  });
}

function isJsonObject(parsed) {
  return parsed.ok && typeof parsed.value === 'object' && parsed.value !== null && !Array.isArray(parsed.value);
}

function list(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const products = repository.all();

  if (url.searchParams.has('limit')) {
    const limit = Number.parseInt(url.searchParams.get('limit'), 10);
    if (Number.isNaN(limit)) {
      send(res, 400, { message: 'limit không hợp lệ' });
      return;
    }
    if (limit > 0) {
      send(res, 200, products.slice(0, limit));
      return;
    }
  }

  send(res, 200, products);
}

function getOne(req, res, { id }) {
  const product = repository.findById(Number.parseInt(id, 10));
  if (!product) {
    send(res, 404, { message: 'Không tìm thấy sản phẩm' });
    return;
  }
  send(res, 200, product);
}

async function create(req, res) {
  const parsed = await readJsonBody(req);
  if (!isJsonObject(parsed)) {
    send(res, 400, { message: 'Body không phải JSON hợp lệ' });
    return;
  }

  const body = parsed.value;
  const product = repository.create({ name: body.name, price: body.price });
  send(res, 201, product);
}

async function replace(req, res, { id }) {
  const productId = Number.parseInt(id, 10);
  if (!repository.findById(productId)) {
    send(res, 404, { message: 'Không tìm thấy sản phẩm' });
    return;
  }

  const parsed = await readJsonBody(req);
  if (!isJsonObject(parsed)) {
    send(res, 400, { message: 'Body không phải JSON hợp lệ' });
    return;
  }

  const body = parsed.value;
  const product = repository.replace(productId, { name: body.name, price: body.price });
  send(res, 200, product);
}

async function update(req, res, { id }) {
  const productId = Number.parseInt(id, 10);
  if (!repository.findById(productId)) {
    send(res, 404, { message: 'Không tìm thấy sản phẩm' });
    return;
  }

  const parsed = await readJsonBody(req);
  if (!isJsonObject(parsed)) {
    send(res, 400, { message: 'Body không phải JSON hợp lệ' });
    return;
  }

  const product = repository.update(productId, parsed.value);
  send(res, 200, product);
}

function remove(req, res, { id }) {
  const product = repository.remove(Number.parseInt(id, 10));
  if (!product) {
    send(res, 404, { message: 'Không tìm thấy sản phẩm' });
    return;
  }
  send(res, 200, { message: 'Đã xoá sản phẩm' });
}

module.exports = { list, getOne, create, replace, update, remove };
