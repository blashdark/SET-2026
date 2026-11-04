'use strict';
// Opt in: LIVE_PRODUCTS=1 node --env-file=.env --test test/products.integration.test.js
// Writes only UUID-prefixed fixtures; leaves MongoDB counter increments untouched.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { once } = require('node:events');

test('opt-in real Atlas HTTP integration', { skip: process.env.LIVE_PRODUCTS !== '1', timeout: 180000 }, async () => {
  const { MongoClient } = require('mongodb');
  const prefix = `SET2026_API_TEST_${randomUUID()}_`;
  const evidencePath = process.env.PRODUCTS_EVIDENCE || path.join(process.env.TMPDIR || process.cwd(), 'products-integration-evidence.json');
  const report = { source: { branch: execFileSync('git', ['branch', '--show-current'], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }).trim(), sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }).trim() }, started: new Date().toISOString(), database: 'set2026', datasource: 'Atlas; direct MongoDB read-backs', fixturePrefix: prefix, cases: [], observations: [], cleanup: {}, totals: {} };
  report.commands = ['LIVE_PRODUCTS=1 PRODUCTS_EVIDENCE="C:/Users/phuoc/AppData/Local/hermes/cache/scratch/set2026-products-http-evidence.json" node --env-file=.env --test test/products.integration.test.js', 'npm test'];
  report.source.files = Object.fromEntries(['js/server.js', 'js/products/router.js', 'js/products/middleware.js', 'js/products/controller.js', 'js/products/repository.js', 'js/products/dataSource.js'].map(file => [file, createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '..', file))).digest('hex')]));
  const ids = new Set();
  let client, collection, child, baseline;
  const hash = docs => createHash('sha256').update(JSON.stringify(docs)).digest('hex');
  async function check(id, endpoint, fn) {
    const item = { id, endpoint, status: 'pass' };
    try { await fn(item); } catch (error) {
      item.status = 'fail';
      // Deliberately omit exception messages: driver errors may contain connection details.
      item.error = error.code || error.name || 'Error';
    }
    report.cases.push(item);
    return item.status === 'pass';
  }
  async function occupied() {
    return new Promise(resolve => {
      const socket = net.connect({ host: '127.0.0.1', port: 3000 });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
    });
  }
  async function stop() {
    if (!child) return;
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error('Own server stop timeout')), 5000).unref())]);
    }
    child = null;
  }
  async function start(token = '') {
    assert.equal(await occupied(), false, 'Port 3000 occupied; do not use/kill existing server');
    child = spawn(process.execPath, ['--env-file=.env', 'js/server.js'], {
      cwd: path.resolve(__dirname, '..'), env: { ...process.env, API_TOKEN: token }, stdio: 'ignore',
    });
    const errors = [];
    child.on('error', error => errors.push(error.code));
    for (let i = 0; i < 100; i++) {
      if (errors.length || child.exitCode !== null) throw new Error('Own server startup failed');
      if (await occupied()) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Own server startup timeout');
  }
  async function request(method, url, body, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    const response = await fetch(`http://127.0.0.1:3000${url}`, {
      method, headers, body: body === undefined ? undefined : options.raw ? body : JSON.stringify(body), signal: AbortSignal.timeout(12000),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, text, headers: response.headers };
  }
  async function expect(method, url, body, status, options) {
    const response = await request(method, url, body, options);
    assert.equal(response.status, status);
    if (status !== 204 && method !== 'HEAD') assert.match(response.headers.get('content-type') || '', /application\/json/);
    if (status >= 400 && method !== 'HEAD') assert.equal(typeof response.body.message, 'string');
    return response;
  }
  async function persisted(product) {
    assert.deepEqual(await collection.findOne({ _id: product.id }), { _id: product.id, name: product.name, price: product.price });
    assert.deepEqual((await expect('GET', `/products/${product.id}`, undefined, 200)).body, product);
  }
  async function unchanged(id, fn) {
    const before = await collection.findOne({ _id: id });
    await fn();
    assert.deepEqual(await collection.findOne({ _id: id }), before);
  }
  try {
    assert.equal(process.env.MONGODB_DB || 'set2026', 'set2026');
    assert.ok(/^mongodb\+srv:\/\//.test(process.env.MONGODB_URI || ''), 'Atlas SRV connection required');
    client = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      ...(process.env.MONGODB_USER ? {
        auth: { username: process.env.MONGODB_USER, password: process.env.MONGODB_PASSWORD },
        ...(/[?&]authSource=/i.test(process.env.MONGODB_URI) ? {} : { authSource: 'admin' }),
      } : {}),
    });
    await client.connect();
    await client.db('set2026').command({ ping: 1 });
    collection = client.db('set2026').collection('products');
    baseline = await collection.find({}).sort({ _id: 1 }).toArray();
    report.baselineCount = baseline.length;
    await start();
    await check('root-and-unknown', 'GET /; GET /missing', async () => {
      await expect('GET', '/', undefined, 404); await expect('GET', '/missing', undefined, 404);
    });
    await check('list', 'GET /products; GET /products/', async () => {
      const all = baseline.map(d => ({ id: d._id, name: d.name, price: d.price }));
      assert.deepEqual((await expect('GET', '/products', undefined, 200)).body, all);
      assert.deepEqual((await expect('GET', '/products/', undefined, 200)).body, all);
    });
    for (const limit of ['0', '1', '999999', '-1', 'abc', '']) await check(`limit-${limit || 'empty'}`, `GET /products?limit=${limit}`, async () => {
      const invalid = ['-1', 'abc', ''].includes(limit);
      const r = await expect('GET', `/products?limit=${limit}`, undefined, invalid ? 400 : 200);
      if (!invalid) assert.deepEqual(r.body, baseline.slice(0, Number(limit)).map(d => ({ id: d._id, name: d.name, price: d.price })));
    });
    for (const limit of ['1.9', '1abc', '1e2']) await check(`limit-coercion-${limit}`, `GET /products?limit=${limit}`, async () => {
      assert.deepEqual((await expect('GET', `/products?limit=${limit}`, undefined, 200)).body, baseline.slice(0, 1).map(d => ({ id: d._id, name: d.name, price: d.price })));
    });
    report.observations.push('limit uses parseInt: 1.9, 1abc, 1e2 accepted as 1; source-conformant, potentially surprising. Root absent; unsupported methods return 404, not 405.');
    let product;
    const created = await check('create-zero-unknown-fields', 'POST /products/', async item => {
      const r = await expect('POST', '/products/', { name: prefix + 'initial', price: 0, id: -1, extra: true, $set: { price: 999 } }, 201);
      product = r.body; ids.add(product.id); item.createdId = product.id;
      assert.ok(Number.isSafeInteger(product.id));
      assert.deepEqual(product, { id: product.id, name: prefix + 'initial', price: 0 });
      await persisted(product);
    });
    if (!created || !product) throw new Error('Create prerequisite failed');
    await check('list-persisted-fixture', 'GET /products; GET /products?limit=1', async () => {
      const expected = (await collection.find({}).sort({ _id: 1 }).toArray()).map(d => ({ id: d._id, name: d.name, price: d.price }));
      assert.deepEqual((await expect('GET', '/products', undefined, 200)).body, expected);
      assert.ok(expected.some(p => p.id === product.id));
      assert.deepEqual((await expect('GET', '/products?limit=1', undefined, 200)).body, expected.slice(0, 1));
    });
    await check('get-trailing-query-leading-zero', 'GET /products/:id', async () => {
      assert.deepEqual((await expect('GET', `/products/0${product.id}/?ignored=1`, undefined, 200)).body, product);
    });
    await check('put-replacement', 'PUT /products/:id/', async () => {
      product = (await expect('PUT', `/products/${product.id}/`, { name: prefix + 'replace', price: 12.5, id: -1, extra: 'ignored' }, 200)).body;
      assert.equal(product.name, prefix + 'replace'); assert.equal(product.price, 12.5); await persisted(product);
    });
    for (const patch of [{ price: 0 }, { name: prefix + 'patch' }, {}, { extra: true, id: -1 }]) await check(`patch-${JSON.stringify(patch)}`, 'PATCH /products/:id', async () => {
      const expected = { ...product, ...Object.fromEntries(Object.entries(patch).filter(([k]) => ['name', 'price'].includes(k))) };
      product = (await expect('PATCH', `/products/${product.id}`, patch, 200)).body;
      assert.deepEqual(product, expected); await persisted(product);
    });
    const invalidProducts = [{}, { name: ' ', price: 0 }, { name: 3, price: 1 }, { name: prefix + 'invalid', price: -0.01 }, { name: prefix + 'invalid', price: '1' }, { name: prefix + 'invalid', price: null }, { name: prefix + 'invalid' }, { price: 1 }];
    for (const method of ['POST', 'PUT']) for (let i = 0; i < invalidProducts.length; i++) await check(`${method}-invalid-${i}`, `${method} /products${method === 'PUT' ? '/:id' : ''}`, async () => {
      const count = await collection.countDocuments({});
      await unchanged(product.id, () => expect(method, method === 'PUT' ? `/products/${product.id}` : '/products', invalidProducts[i], 400));
      assert.equal(await collection.countDocuments({}), count);
    });
    for (const patch of [{ name: '' }, { name: null }, { name: 1 }, { price: -1 }, { price: '1' }, { price: null }, { price: {} }]) await check(`patch-invalid-${JSON.stringify(patch)}`, 'PATCH /products/:id', () => unchanged(product.id, () => expect('PATCH', `/products/${product.id}`, patch, 400)));
    for (const method of ['POST', 'PUT', 'PATCH']) for (const raw of ['{', '', 'null', '[]', '1', '"text"', 'true']) await check(`${method}-body-${raw || 'empty'}`, `${method} JSON parsing`, () => unchanged(product.id, () => expect(method, method === 'POST' ? '/products' : `/products/${product.id}`, raw, 400, { raw: true })));
    const missing = Number.MAX_SAFE_INTEGER;
    assert.equal(await collection.findOne({ _id: missing }), null);
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) await check(`${method}-missing`, `${method} /products/:missing`, async () => {
      await expect(method, `/products/${missing}`, ['PUT', 'PATCH'].includes(method) ? { name: prefix + 'missing', price: 1 } : undefined, 404);
      assert.equal(await collection.findOne({ _id: missing }), null);
    });
    for (const id of ['abc', '-1', '1.5', 'NaN']) for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) await check(`${method}-id-${id}`, `${method} /products/${id}`, async () => {
      await expect(method, `/products/${id}`, ['PUT', 'PATCH'].includes(method) ? { name: prefix + 'invalid-id', price: 1 } : undefined, 404);
    });
    for (const [method, url] of [['PUT', '/products'], ['PATCH', '/products'], ['DELETE', '/products'], ['POST', `/products/${product.id}`], ['OPTIONS', '/products'], ['HEAD', '/products']]) await check(`unsupported-${method}-${url}`, `${method} ${url}`, () => unchanged(product.id, () => expect(method, url, undefined, 404)));
    await check('concurrent-create', 'POST /products concurrent x5', async item => {
      const results = await Promise.all(Array.from({ length: 5 }, async (_, i) => {
        const r = await expect('POST', '/products', { name: prefix + 'parallel-' + i, price: i }, 201);
        ids.add(r.body.id); await persisted(r.body); return r.body.id;
      }));
      assert.equal(new Set(results).size, 5); item.createdIds = results;
    });
    await check('delete-and-repeat', 'DELETE /products/:id', async () => {
      const r = await expect('DELETE', `/products/${product.id}`, undefined, 204);
      assert.equal(r.text, ''); assert.equal(await collection.findOne({ _id: product.id }), null);
      await expect('GET', `/products/${product.id}`, undefined, 404); await expect('DELETE', `/products/${product.id}`, undefined, 404);
    });
    await stop();
    const token = randomUUID();
    await start(token);
    for (const [label, authorization] of [['missing', undefined], ['wrong', 'Bearer incorrect'], ['scheme', `bearer ${token}`], ['correct', `Bearer ${token}`]]) await check(`auth-${label}`, 'GET /products token middleware', async () => {
      const r = await expect('GET', '/products?limit=0', undefined, label === 'correct' ? 200 : 401, { headers: authorization ? { Authorization: authorization } : {} });
      if (label === 'correct') assert.deepEqual(r.body, []); else assert.equal(r.headers.get('www-authenticate'), 'Bearer');
    });
    await check('auth-write-authorized', 'POST /products with valid token', async item => {
      const r = await expect('POST', '/products', { name: prefix + 'authorized', price: 1 }, 201, { headers: { Authorization: `Bearer ${token}` } });
      ids.add(r.body.id); item.createdId = r.body.id;
      assert.deepEqual(await collection.findOne({ _id: r.body.id }), { _id: r.body.id, name: prefix + 'authorized', price: 1 });
      assert.deepEqual((await expect('GET', `/products/${r.body.id}`, undefined, 200, { headers: { Authorization: `Bearer ${token}` } })).body, r.body);
    });
    await check('auth-write-denied', 'POST /products without token', async () => {
      const count = await collection.countDocuments({});
      await expect('POST', '/products', { name: prefix + 'unauthorized', price: 1 }, 401);
      assert.equal(await collection.countDocuments({}), count);
    });
  } catch (error) {
    report.cases.push({ id: 'prerequisite-or-runner', status: 'blocked', error: error.code || error.name || 'Error' });
  } finally {
    try { await stop(); report.cleanup.ownServersStopped = true; } catch { report.cleanup.ownServersStopped = false; }
    if (collection) {
      // Recover own uniquely marked fixtures even if a response/assertion failed before recording its ID.
      const remaining = await collection.find({ name: { $regex: '^' + prefix } }).toArray();
      remaining.forEach(doc => ids.add(doc._id));
      const cleanupPass = await check('cleanup-and-preservation', 'MongoDB exact created IDs; direct read-back', async () => {
        for (const id of ids) {
          const doc = await collection.findOne({ _id: id });
          if (doc) {
            assert.ok(doc.name.startsWith(prefix), 'Stop: fixture ownership conflict');
            await collection.deleteOne({ _id: id, name: doc.name });
          }
          assert.equal(await collection.findOne({ _id: id }), null);
        }
        assert.equal(await collection.countDocuments({ name: { $regex: '^' + prefix } }), 0);
        const after = await collection.find({}).sort({ _id: 1 }).toArray();
        assert.equal(hash(after), hash(baseline));
      });
      report.cleanup.fixturesRemovedAndBaselinePreserved = cleanupPass;
      report.cleanup.createdIds = [...ids];
      report.cleanup.counters = 'Untouched; natural sequence increments retained';
    }
    if (client) await client.close();
    report.matrix = Object.values(report.cases.reduce((matrix, item) => {
      const key = item.endpoint || 'prerequisite';
      const row = matrix[key] ||= { endpoint: key, pass: 0, fail: 0, blocked: 0 };
      row[item.status] = (row[item.status] || 0) + 1;
      return matrix;
    }, {}));
    report.finished = new Date().toISOString();
    for (const status of ['pass', 'fail', 'blocked', 'not_run']) report.totals[status] = report.cases.filter(item => item.status === status).length;
    report.totals.total = report.cases.length;
    report.not_run = ['Real database outage/500 fault injection: not authorized to disrupt Atlas; existing mock regression covers 500 boundary.', 'HTTP body-size/slow-client abuse: no explicit limits in source; excluded from safe functional test.'];
    report.totals.not_run = report.not_run.length;
    report.totals.total += report.not_run.length;
    fs.writeFileSync(evidencePath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ evidencePath, totals: report.totals, cleanup: report.cleanup }));
  }
  assert.equal(report.totals.fail + report.totals.blocked, 0, 'See sanitized evidence for failing/blocked cases');
  assert.equal(report.cleanup.ownServersStopped, true);
});
