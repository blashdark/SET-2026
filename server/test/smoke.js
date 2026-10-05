'use strict';

// Smoke test: start the server on its own port + a temp data dir, run all 8 endpoints.
// Run: node test/smoke.js

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 4310;
const BASE = `http://127.0.0.1:${PORT}`;
// temp data dir -> tests don't touch real data
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-task-api-'));

let failures = 0;

function check(name, condition, detail) {
  const status = condition ? 'PASS' : 'FAIL';
  if (!condition) failures += 1;
  console.log(`[${status}] ${name}${condition ? '' : ` -> ${JSON.stringify(detail)}`}`);
}

async function request(method, urlPath, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + urlPath, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: res.status, data };
}

function waitForServer() {
  // poll GET /me every 100ms until the server is ready or 5s elapse
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const tick = async () => {
      try {
        await fetch(BASE + '/me');
        resolve();
      } catch {
        if (Date.now() > deadline) return reject(new Error('Server khong khoi dong kip'));
        setTimeout(tick, 100);
      }
    };
    tick();
  });
}

async function main() {
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR, JWT_SECRET: 'test-secret' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));

  try {
    await waitForServer();

    const signUp = await request('POST', '/sign-up', { body: { username: 'alice', password: 'secret123' } });
    check('POST /sign-up -> 201', signUp.status === 201 && signUp.data.username === 'alice', signUp);

    const dup = await request('POST', '/sign-up', { body: { username: 'alice', password: 'secret123' } });
    check('POST /sign-up (trung) -> 409', dup.status === 409, dup);

    const login = await request('POST', '/login', { body: { username: 'alice', password: 'secret123' } });
    const token = login.data && login.data.accessToken;
    check('POST /login -> 200 + accessToken', login.status === 200 && !!token, login);

    const badLogin = await request('POST', '/login', { body: { username: 'alice', password: 'wrong' } });
    check('POST /login (sai pass) -> 401', badLogin.status === 401, badLogin);

    const noAuth = await request('GET', '/me');
    check('GET /me (khong token) -> 401', noAuth.status === 401, noAuth);

    const me = await request('GET', '/me', { token });
    check('GET /me -> 200', me.status === 200 && me.data.username === 'alice', me);

    const created = await request('POST', '/task', { token, body: { title: 'Task A', description: 'mo ta' } });
    check('POST /task -> 201', created.status === 201 && created.data.user_id === 1, created);

    await request('POST', '/task', { token, body: { title: 'Task B' } });

    const list = await request('GET', '/tasks', { token });
    check('GET /tasks -> 200 (2 task)', list.status === 200 && Array.isArray(list.data) && list.data.length === 2, list);

    const delUserBlocked = await request('DELETE', '/user/1', { token });
    check('DELETE /user/1 (con task) -> 409', delUserBlocked.status === 409, delUserBlocked);

    const assigned = await request('PATCH', '/assign-task/1', { token });
    check('PATCH /assign-task/1 -> 200', assigned.status === 200 && assigned.data.user_id === 1, assigned);

    const delMissing = await request('DELETE', '/task/999', { token });
    check('DELETE /task/999 -> 404', delMissing.status === 404, delMissing);

    const delTask = await request('DELETE', '/task/1', { token });
    check('DELETE /task/1 -> 204', delTask.status === 204, delTask);

    const bob = await request('POST', '/sign-up', { body: { username: 'bob', password: 'secret123' } });
    const bobLogin = await request('POST', '/login', { body: { username: 'bob', password: 'secret123' } });
    const bobTask = await request('POST', '/task', {
      token: bobLogin.data.accessToken,
      body: { title: 'Bob task' }
    });
    const aliceDeleteBobTask = await request('DELETE', `/task/${bobTask.data.id}`, { token });
    check('DELETE /task (khong so huu) -> 403', aliceDeleteBobTask.status === 403, aliceDeleteBobTask);

    await request('DELETE', `/task/${bobTask.data.id}`, { token: bobLogin.data.accessToken });
    const bobDeleteUser = await request('DELETE', `/user/${bob.data.id}`, { token: bobLogin.data.accessToken });
    check('DELETE /user (het task) -> 204', bobDeleteUser.status === 204, bobDeleteUser);

    const wrongMethod = await request('PUT', '/tasks', { token });
    check('PUT /tasks -> 405', wrongMethod.status === 405, wrongMethod);

    const notFound = await request('GET', '/nope', { token });
    check('GET /nope -> 404', notFound.status === 404, notFound);
  } finally {
    server.kill();
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }

  console.log(failures === 0 ? '\nTat ca check PASS' : `\n${failures} check FAIL`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
