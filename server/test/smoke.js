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
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-task-api-')); // fs.mkdtempSync + os.tmpdir: unique temp dir

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
  const res = await fetch(BASE + urlPath, { // global fetch (Node 18+): built-in HTTP client
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let data = null;
  const text = await res.text(); // read the response body as text
  if (text) {
    try {
      data = JSON.parse(text); // parse JSON responses
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
        if (Date.now() > deadline) return reject(new Error('Server did not start in time'));
        setTimeout(tick, 100); // setTimeout: retry after 100ms
      }
    };
    tick();
  });
}

async function main() {
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], { // child_process.spawn: launch the server process
    env: { ...process.env, PORT: String(PORT), DATA_DIR, JWT_SECRET: 'test-secret' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stderr.on('data', (chunk) => process.stderr.write(chunk)); // forward the child's stderr

  try {
    await waitForServer();

    // 1. sign up + duplicate
    const signUp = await request('POST', '/sign-up', { body: { username: 'alice', password: 'secret123' } });
    check('POST /sign-up -> 201', signUp.status === 201 && signUp.data.username === 'alice', signUp);

    const dup = await request('POST', '/sign-up', { body: { username: 'alice', password: 'secret123' } });
    check('POST /sign-up (duplicate) -> 409', dup.status === 409, dup);

    // 2. login
    const login = await request('POST', '/login', { body: { username: 'alice', password: 'secret123' } });
    const token = login.data && login.data.accessToken;
    check('POST /login -> 200 + accessToken', login.status === 200 && !!token, login);

    const badLogin = await request('POST', '/login', { body: { username: 'alice', password: 'wrong' } });
    check('POST /login (wrong password) -> 401', badLogin.status === 401, badLogin);

    // 3. /me
    const noAuth = await request('GET', '/me');
    check('GET /me (no token) -> 401', noAuth.status === 401, noAuth);

    const me = await request('GET', '/me', { token });
    check('GET /me -> 200', me.status === 200 && me.data.username === 'alice', me);

    // 4. tasks
    const created = await request('POST', '/task', { token, body: { title: 'Task A', description: 'desc' } });
    check('POST /task -> 201', created.status === 201 && created.data.user_id === 1, created);

    await request('POST', '/task', { token, body: { title: 'Task B' } });

    const list = await request('GET', '/tasks', { token });
    check('GET /tasks -> 200 (2 tasks)', list.status === 200 && Array.isArray(list.data) && list.data.length === 2, list);

    const delUserBlocked = await request('DELETE', '/user/1', { token });
    check('DELETE /user/1 (has tasks) -> 409', delUserBlocked.status === 409, delUserBlocked);

    // 5. second user
    const bob = await request('POST', '/sign-up', { body: { username: 'bob', password: 'secret123' } });
    const bobLogin = await request('POST', '/login', { body: { username: 'bob', password: 'secret123' } });
    const bobToken = bobLogin.data.accessToken;
    check('POST /sign-up bob -> 201', bob.status === 201, bob);

    // 6. assign task 1 to another user (bob)
    const assigned = await request('PATCH', '/assign-task/1', { token, body: { user_id: bob.data.id } });
    check('PATCH /assign-task/1 (to bob) -> 200', assigned.status === 200 && assigned.data.user_id === bob.data.id, assigned);

    const assignNoBody = await request('PATCH', '/assign-task/1', { token, body: {} });
    check('PATCH /assign-task/1 (missing user_id) -> 400', assignNoBody.status === 400, assignNoBody);

    const assignMissingTask = await request('PATCH', '/assign-task/999', { token, body: { user_id: bob.data.id } });
    check('PATCH /assign-task/999 -> 404', assignMissingTask.status === 404, assignMissingTask);

    const assignMissingUser = await request('PATCH', '/assign-task/2', { token, body: { user_id: 999 } });
    check('PATCH /assign-task/2 (unknown user) -> 404', assignMissingUser.status === 404, assignMissingUser);

    // 7. ownership after reassignment
    const aliceDeleteBobTask = await request('DELETE', '/task/1', { token });
    check('DELETE /task/1 (not owner) -> 403', aliceDeleteBobTask.status === 403, aliceDeleteBobTask);

    const bobDeleteTask = await request('DELETE', '/task/1', { token: bobToken });
    check('DELETE /task/1 (owner) -> 204', bobDeleteTask.status === 204, bobDeleteTask);

    const delMissing = await request('DELETE', '/task/999', { token });
    check('DELETE /task/999 -> 404', delMissing.status === 404, delMissing);

    const aliceDeleteOwn = await request('DELETE', '/task/2', { token });
    check('DELETE /task/2 (own) -> 204', aliceDeleteOwn.status === 204, aliceDeleteOwn);

    // 8. delete user with no tasks
    const bobDeleteUser = await request('DELETE', `/user/${bob.data.id}`, { token: bobToken });
    check('DELETE /user (no tasks) -> 204', bobDeleteUser.status === 204, bobDeleteUser);

    // 9. routing errors
    const wrongMethod = await request('PUT', '/tasks', { token });
    check('PUT /tasks -> 405', wrongMethod.status === 405, wrongMethod);

    const notFound = await request('GET', '/nope', { token });
    check('GET /nope -> 404', notFound.status === 404, notFound);
  } finally {
    server.kill(); // stop the child process
    fs.rmSync(DATA_DIR, { recursive: true, force: true }); // fs.rmSync: delete the temp dir
  }

  console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
