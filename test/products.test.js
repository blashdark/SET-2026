const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { Readable } = require('node:stream');
const fs = require('node:fs');
const vm = require('node:vm');

const rows = new Map();
let sequence = 0;
let failure = null;
let clients = 0;
const clone = (value) => value ? { ...value } : null;
const products = {
  find() { return { sort() { return this; }, async toArray() { if (failure) throw failure; return [...rows.values()].map(clone); } }; },
  async findOne({ _id }) { if (failure) throw failure; return clone(rows.get(_id)); },
  async insertOne(doc) { if (failure) throw failure; assert.equal(rows.has(doc._id), false); rows.set(doc._id, clone(doc)); },
  async findOneAndReplace({ _id }, doc) { if (failure) throw failure; if (!rows.has(_id)) return null; rows.set(_id, clone(doc)); return clone(doc); },
  async findOneAndUpdate({ _id }, update) { if (failure) throw failure; if (!rows.has(_id)) return null; const doc = { ...rows.get(_id), ...update.$set }; rows.set(_id, doc); return clone(doc); },
  async findOneAndDelete({ _id }) { if (failure) throw failure; const doc = clone(rows.get(_id)); rows.delete(_id); return doc; },
};
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === 'mongodb') return { MongoClient: class {
    constructor(uri, options) { clients++; assert.equal(uri, 'mongodb://127.0.0.1:27017'); assert.equal(options.serverSelectionTimeoutMS, 5000); }
    db(name) { assert.equal(name, 'set2026'); return { collection(name) { return name === 'products' ? products : { async findOneAndUpdate(filter, update, options) { if (failure) throw failure; assert.equal(options.upsert, true); assert.equal(options.returnDocument, 'after'); return { seq: ++sequence }; } }; } }; }
    async close() {}
  } };
  return originalLoad.call(this, name, ...args);
};
const repository = require('../js/products/repository');
const route = require('../js/products/router');
Module._load = originalLoad;

test('datasource passes separate credentials unchanged and defaults authSource to admin', () => {
  const source = fs.readFileSync(require.resolve('../js/products/dataSource'), 'utf8');
  function optionsFor(env) {
    let captured;
    vm.runInNewContext(source, {
      process: { env }, module: { exports: {} },
      require() { return { MongoClient: class {
        constructor(uri, options) { captured = { uri, ...options }; }
        db() { return { collection() { return {}; } }; }
      } }; },
    });
    return JSON.parse(JSON.stringify(captured));
  }
  const env = { MONGODB_URI: 'mongodb+srv://example.invalid/?retryWrites=true', MONGODB_USER: 'app@example', MONGODB_PASSWORD: 'p@ss:#% \' " \\n' };
  assert.deepEqual(optionsFor(env), {
    uri: env.MONGODB_URI, serverSelectionTimeoutMS: 5000,
    auth: { username: env.MONGODB_USER, password: env.MONGODB_PASSWORD }, authSource: 'admin',
  });
  assert.equal(optionsFor({ ...env, MONGODB_URI: 'mongodb://example.invalid/app?authSource=custom' }).authSource, undefined);
  assert.deepEqual(optionsFor({}), { uri: 'mongodb://127.0.0.1:27017', serverSelectionTimeoutMS: 5000 });
});

async function request(method, url, body) {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  Object.assign(req, { method, url, headers: {} });
  const res = { headersSent: false, writableEnded: false,
    writeHead(status) { this.status = status; this.headersSent = true; },
    end(body) { this.body = body ? JSON.parse(body) : undefined; this.writableEnded = true; },
  };
  await route(req, res);
  return res;
}

test('MongoDB CRUD preserves numeric IDs, concurrent creates, HTTP contracts and failures', async () => {
  assert.deepEqual(await repository.all(), []);
  const created = await request('POST', '/products', { name: 'Tea', price: 10, stock: 50, id: 999, extra: true });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body, { id: 1, name: 'Tea', price: 10, stock: 50 });
  assert.equal(rows.size, 1, 'must persist in MongoDB collection, not JSON');
  assert.equal(clients, 1);
  assert.deepEqual((await request('GET', '/products?limit=1')).body, [created.body]);
  assert.deepEqual((await request('GET', '/products/1')).body, created.body);
  assert.deepEqual((await request('PUT', '/products/1', { name: 'Coffee', price: 20, stock: 15 })).body, { id: 1, name: 'Coffee', price: 20, stock: 15 });
  assert.deepEqual((await request('PATCH', '/products/1', { price: 25, stock: 30, id: 88 })).body, { id: 1, name: 'Coffee', price: 25, stock: 30 });
  assert.equal((await request('PATCH', '/products/1', {})).status, 200);
  assert.equal((await request('POST', '/products', { name: '', price: -1 })).status, 400);
  assert.equal((await request('POST', '/products', { name: 'Latte', price: 10, stock: -5 })).status, 400);
  assert.equal((await request('POST', '/products', { name: 'Latte', price: 10, stock: 'invalid' })).status, 400);
  assert.equal((await request('PATCH', '/products/1', { stock: -1 })).status, 400);
  assert.equal((await request('DELETE', '/products/1')).status, 204);
  for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) assert.equal((await request(method, '/products/999', {})).status, 404);
  assert.equal(await repository.replace(999, { name: 'Missing', price: 0 }), null);
  assert.equal(await repository.update(999, { price: 0 }), null);
  const batch = await Promise.all(Array.from({ length: 20 }, () => repository.create({ name: 'Concurrent', price: 1 })));
  assert.equal(new Set(batch.map(p => p.id)).size, 20);
  assert.ok(batch.every(p => Number.isInteger(p.id) && !Object.hasOwn(p, '_id')));
  failure = new Error('database unavailable');
  for (const [method, url, body] of [['GET','/products'], ['GET','/products/2'], ['POST','/products',{name:'X',price:1}], ['PUT','/products/2',{name:'X',price:1}], ['PATCH','/products/2',{price:1}], ['DELETE','/products/2']]) {
    await assert.rejects(request(method, url, body), /database unavailable/);
  }
});

test('server returns generic 500 for rejected route without leaking database error', async () => {
  let listener;
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/server'), 'utf8'), {
    process: { env: {} }, console: { log() {} },
    require(name) {
      if (name === 'http') return { createServer(fn) { listener = fn; return { listen() {} }; } };
      if (name === './products/middleware') return { logger(req, res, next) { next(); } };
      if (name === './products/router') return async () => { throw new Error('private database detail'); };
      throw new Error(`Unexpected module ${name}`);
    },
  });
  const res = { headersSent: false, writeHead(status) { this.status = status; }, end(body) { this.body = JSON.parse(body); } };
  listener({}, res);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { message: 'Lỗi server' });
});
