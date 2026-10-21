const productRepository = require('../repositories/product-repository');
const { sendJson, readBody } = require('../http-utils');

function bodyError(body) {
  if (body === undefined) return 'Body không phải JSON hợp lệ';
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return 'Body phải là một object';
  if ('price' in body && (typeof body.price !== 'number' || body.price < 0)) return 'price phải là số >= 0';
}

function list(req, res, params, url) {
  const limit = Number(url.searchParams.get('limit'));
  sendJson(res, 200, productRepository.findAll(limit > 0 ? limit : undefined));
}

function getById(req, res, params) {
  const product = productRepository.findById(Number(params.id));
  if (!product) {
    sendJson(res, 404, { message: 'Không có product này' });
    return;
  }
  sendJson(res, 200, product);
}

async function create(req, res) {
  const body = await readBody(req);
  const error = bodyError(body);
  if (error) {
    sendJson(res, 400, { message: error });
    return;
  }
  const product = productRepository.create({ name: body.name, price: body.price });
  sendJson(res, 201, product);
}

async function replace(req, res, params) {
  const body = await readBody(req);
  const error = bodyError(body);
  if (error) {
    sendJson(res, 400, { message: error });
    return;
  }
  const product = productRepository.replace(Number(params.id), { name: body.name, price: body.price });
  if (!product) {
    sendJson(res, 404, { message: 'Không có product này' });
    return;
  }
  sendJson(res, 200, product);
}

async function update(req, res, params) {
  const body = await readBody(req);
  const error = bodyError(body);
  if (error) {
    sendJson(res, 400, { message: error });
    return;
  }
  const product = productRepository.update(Number(params.id), body);
  if (!product) {
    sendJson(res, 404, { message: 'Không có product này' });
    return;
  }
  sendJson(res, 200, product);
}

function remove(req, res, params) {
  const removed = productRepository.remove(Number(params.id));
  if (!removed) {
    sendJson(res, 404, { message: 'Không có product này' });
    return;
  }
  res.writeHead(204);
  res.end();
}

module.exports = { list, getById, create, replace, update, remove };
