const repository = require('./repository');

// Lấy id/query/body từ request, kiểm input, gọi repository,
// chọn status và body. Không biết dữ liệu nằm ở mảng hay file.

const PRODUCT_FIELDS = ['name', 'price'];

function send(res, status, body) {
  if (status === 204) {
    res.writeHead(204);
    res.end();
    return;
  }
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

function isValidName(name) {
  return typeof name === 'string' && name.trim() !== '';
}

function isValidPrice(price) {
  return typeof price === 'number' && Number.isFinite(price) && price >= 0;
}

function isValidProduct(body) {
  return isValidName(body.name) && isValidPrice(body.price);
}

// Chỉ giữ các field hợp lệ (name, price) để field lạ không lọt vào file.
function pickFields(body) {
  const result = {};
  for (const field of PRODUCT_FIELDS) {
    if (Object.hasOwn(body, field)) {
      result[field] = body[field];
    }
  }
  return result;
}

function list(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const products = repository.all();

  if (url.searchParams.has('limit')) {
    const limit = Number.parseInt(url.searchParams.get('limit'), 10);
    if (!Number.isInteger(limit) || limit < 0) {
      send(res, 400, { message: 'limit không hợp lệ' });
      return;
    }
    send(res, 200, products.slice(0, limit));
    return;
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
  if (!isValidProduct(parsed.value)) {
    send(res, 400, { message: 'Thiếu hoặc sai name/price' });
    return;
  }

  const product = repository.create(pickFields(parsed.value));
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
  if (!isValidProduct(parsed.value)) {
    send(res, 400, { message: 'Thiếu hoặc sai name/price' });
    return;
  }

  const product = repository.replace(productId, pickFields(parsed.value));
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

  // PATCH: chỉ validate field nào thực sự có mặt.
  const patch = pickFields(parsed.value);
  if (Object.hasOwn(patch, 'name') && !isValidName(patch.name)) {
    send(res, 400, { message: 'Thiếu hoặc sai name/price' });
    return;
  }
  if (Object.hasOwn(patch, 'price') && !isValidPrice(patch.price)) {
    send(res, 400, { message: 'Thiếu hoặc sai name/price' });
    return;
  }

  const product = repository.update(productId, patch);
  send(res, 200, product);
}

function remove(req, res, { id }) {
  const product = repository.remove(Number.parseInt(id, 10));
  if (!product) {
    send(res, 404, { message: 'Không tìm thấy sản phẩm' });
    return;
  }
  send(res, 204);
}

module.exports = { list, getOne, create, replace, update, remove };
