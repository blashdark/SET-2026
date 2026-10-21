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
  const productId = Number.parseInt(id, 10);
  const product = repository.findById(productId);
  if (!product) {
    send(res, 404, { message: 'Không tìm thấy sản phẩm' });
    return;
  }
  send(res, 200, product);
}

async function create(req, res) {
  const body = req.body;
  if (!isValidProduct(body)) {
    send(res, 400, { message: 'Thiếu hoặc sai name/price' });
    return;
  }

  const product = repository.create(pickFields(body));
  send(res, 201, product);
}

async function replace(req, res, { id }) {
  const productId = Number.parseInt(id, 10);
  if (!repository.findById(productId)) {
    send(res, 404, { message: 'Không tìm thấy sản phẩm' });
    return;
  }

  const body = req.body;
  if (!isValidProduct(body)) {
    send(res, 400, { message: 'Thiếu hoặc sai name/price' });
    return;
  }

  const product = repository.replace(productId, pickFields(body));
  send(res, 200, product);
}

async function update(req, res, { id }) {
  const productId = Number.parseInt(id, 10);
  if (!repository.findById(productId)) {
    send(res, 404, { message: 'Không tìm thấy sản phẩm' });
    return;
  }

  const body = req.body;
  // PATCH: chỉ validate field nào thực sự có mặt.
  const patch = pickFields(body);
  if (Object.hasOwn(patch, 'name') && !isValidName(patch.name)) {
    send(res, 400, { message: 'Thiếu hoặc sai name/price' });
    return;
  }
  if (Object.hasOwn(patch, 'price') && !isValidPrice(patch.price)) {
    send(res, 400, { message: 'price phải là số >= 0' });
    return;
  }

  const product = repository.update(productId, patch);
  send(res, 200, product);
}

function remove(req, res, { id }) {
  const productId = Number.parseInt(id, 10);
  const product = repository.remove(productId);
  if (!product) {
    send(res, 404, { message: 'Không tìm thấy sản phẩm' });
    return;
  }
  send(res, 204);
}

module.exports = { list, getOne, create, replace, update, remove };
