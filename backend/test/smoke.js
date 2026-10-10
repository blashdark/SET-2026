'use strict';

// Smoke test: start the server on its own port + a temp data dir, run through the endpoints.
// Run: node test/smoke.js

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 4310;
const BASE = `http://127.0.0.1:${PORT}`;
// temp data dir -> tests don't touch real data
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-task-api-')); // fs.mkdtempSync + os.tmpdir: unique temp dir

const VALID_PW = 'Str0ng!pass';
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Hashed in the background -> login may briefly return 409 until it is ready.
async function loginWithRetry(email) {
  let res = await request('POST', '/login', { body: { email, password: VALID_PW } });
  for (let i = 0; i < 60 && res.status === 409; i += 1) {
    await sleep(25);
    res = await request('POST', '/login', { body: { email, password: VALID_PW } });
  }
  return res;
}

// Sign up, then click the verification link (returned because SMTP is off in tests).
async function signUpAndVerify(email) {
  const signUp = await request('POST', '/sign-up', { body: { email, password: VALID_PW } });
  const token = signUp.data && signUp.data.verifyUrl
    ? new URL(signUp.data.verifyUrl).searchParams.get('token')
    : null;
  const verified = token ? await request('GET', `/verify?token=${token}`) : { status: 0 };
  const login = await loginWithRetry(email);
  return {
    signUp,
    verified,
    login,
    accessToken: login.data && login.data.accessToken,
    id: signUp.data && signUp.data.id
  };
}

async function main() {
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], { // child_process.spawn: launch the server process
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR,
      JWT_SECRET: 'test-secret',
      // force the dev path: no SMTP -> sign-up returns verifyUrl
      SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stderr.on('data', (chunk) => process.stderr.write(chunk)); // forward the child's stderr

  try {
    await waitForServer();

    // 1. sign-up validation
    const badEmail = await request('POST', '/sign-up', { body: { email: 'nope', password: VALID_PW } });
    check('POST /sign-up (bad email) -> 400', badEmail.status === 400, badEmail);

    const weakPw = await request('POST', '/sign-up', { body: { email: 'weak@test.com', password: 'abc' } });
    check('POST /sign-up (weak password) -> 400', weakPw.status === 400, weakPw);

    // 2. sign-up + pending login blocked
    const alice = await signUpAndVerify('alice@test.com');
    check('POST /sign-up -> 201 pending', alice.signUp.status === 201 && alice.signUp.data.status === 'pending', alice.signUp);
    check('GET /verify -> 200', alice.verified.status === 200, alice.verified);
    check('POST /login (after verify) -> 200 + token', alice.login.status === 200 && !!alice.accessToken, alice.login);

    const dup = await request('POST', '/sign-up', { body: { email: 'alice@test.com', password: VALID_PW } });
    check('POST /sign-up (duplicate email) -> 409', dup.status === 409, dup);

    // Two registrations for the SAME email fired concurrently -> one wins, one 409.
    const [raceA, raceB] = await Promise.all([
      request('POST', '/sign-up', { body: { email: 'race@test.com', password: VALID_PW } }),
      request('POST', '/sign-up', { body: { email: 'race@test.com', password: VALID_PW } })
    ]);
    const raceCodes = [raceA.status, raceB.status].sort((a, b) => a - b);
    check('concurrent /sign-up same email -> [201,409]', raceCodes[0] === 201 && raceCodes[1] === 409, raceCodes);

    // Two DIFFERENT emails concurrently -> both succeed with distinct ids.
    const [regA, regB] = await Promise.all([
      request('POST', '/sign-up', { body: { email: 'pair1@test.com', password: VALID_PW } }),
      request('POST', '/sign-up', { body: { email: 'pair2@test.com', password: VALID_PW } })
    ]);
    check('concurrent /sign-up different emails -> both 201, unique ids',
      regA.status === 201 && regB.status === 201 && regA.data.id !== regB.data.id,
      [regA.status, regB.status, regA.data && regA.data.id, regB.data && regB.data.id]);

    // a fresh (unverified) account cannot log in
    await request('POST', '/sign-up', { body: { email: 'pending@test.com', password: VALID_PW } });
    const pendingLogin = await loginWithRetry('pending@test.com');
    check('POST /login (unverified) -> 403', pendingLogin.status === 403, pendingLogin);

    const badLogin = await request('POST', '/login', { body: { email: 'alice@test.com', password: 'WrongPw!1' } });
    check('POST /login (wrong password) -> 401', badLogin.status === 401, badLogin);

    const token = alice.accessToken;

    // 3. /me + auth guard
    const noAuth = await request('GET', '/me');
    check('GET /me (no token) -> 401', noAuth.status === 401, noAuth);

    const me = await request('GET', '/me', { token });
    check('GET /me -> 200', me.status === 200 && me.data.email === 'alice@test.com', me);

    // 4. tasks
    const created = await request('POST', '/task', { token, body: { title: 'Task A' } });
    check('POST /task -> 201 (unassigned)', created.status === 201 && created.data.user_id === null && created.data.created_by === alice.id && created.data.done === false, created);

    await request('POST', '/task', { token, body: { title: 'Task B' } });

    const list = await request('GET', '/tasks', { token });
    check('GET /tasks -> 200 (2 tasks)', list.status === 200 && Array.isArray(list.data) && list.data.length === 2, list);

    // 5. patch task (toggle done / rename)
    const patched = await request('PATCH', '/task/1', { token, body: { done: true, title: 'Task A done' } });
    check('PATCH /task/1 (done+title) -> 200', patched.status === 200 && patched.data.done === true && patched.data.title === 'Task A done', patched);

    // The string "false" must NOT be treated as true.
    const patchedFalse = await request('PATCH', '/task/1', { token, body: { done: 'false' } });
    check('PATCH /task/1 (done:"false") -> done=false', patchedFalse.status === 200 && patchedFalse.data.done === false, patchedFalse);

    // guard: a user still assigned a task cannot be deleted
    await request('PATCH', '/assign-task/1', { token, body: { user_id: alice.id } });
    const delBlockedUser = await request('DELETE', `/user/${alice.id}`, { token });
    check('DELETE /user/:id (has task) -> 409', delBlockedUser.status === 409, delBlockedUser);

    // 6. second user
    const bob = await signUpAndVerify('bob@test.com');
    check('POST /sign-up bob -> 201', bob.signUp.status === 201, bob.signUp);

    const users = await request('GET', '/users', { token });
    check('GET /users -> 200 (paged)', users.status === 200 && Array.isArray(users.data.items) && users.data.total >= 2, users);

    const usersPage = await request('GET', '/users?limit=1&offset=0', { token });
    check('GET /users?limit=1 -> 1 item', usersPage.status === 200 && usersPage.data.items.length === 1 && usersPage.data.limit === 1, usersPage);

    // 7. assign task 1 to bob, then ownership rules
    const assigned = await request('PATCH', '/assign-task/1', { token, body: { user_id: bob.id } });
    check('PATCH /assign-task/1 (to bob) -> 200', assigned.status === 200 && assigned.data.user_id === bob.id, assigned);

    const assignNoBody = await request('PATCH', '/assign-task/1', { token, body: {} });
    check('PATCH /assign-task/1 (missing user_id) -> 400', assignNoBody.status === 400, assignNoBody);

    const assignMissingTask = await request('PATCH', '/assign-task/999', { token, body: { user_id: bob.id } });
    check('PATCH /assign-task/999 -> 404', assignMissingTask.status === 404, assignMissingTask);

    // PATCH /task/:id can also assign via user_id in the body.
    const patchAssign = await request('PATCH', '/task/2', { token, body: { user_id: bob.id } });
    check('PATCH /task/2 (user_id) -> 200 assigned', patchAssign.status === 200 && patchAssign.data.user_id === bob.id, patchAssign);

    const patchUnassign = await request('PATCH', '/task/2', { token, body: { user_id: null } });
    check('PATCH /task/2 (user_id null) -> 200 unassigned', patchUnassign.status === 200 && patchUnassign.data.user_id === null, patchUnassign);

    const patchAssignBad = await request('PATCH', '/task/2', { token, body: { user_id: 999 } });
    check('PATCH /task/2 (unknown user_id) -> 404', patchAssignBad.status === 404, patchAssignBad);

    const aliceEditShared = await request('PATCH', '/task/1', { token, body: { title: 'edited by alice' } });
    check('PATCH /task/1 (shared board, any user) -> 200', aliceEditShared.status === 200 && aliceEditShared.data.title === 'edited by alice', aliceEditShared);

    const bobDeleteTask = await request('DELETE', '/task/1', { token: bob.accessToken });
    check('DELETE /task/1 (assigned to bob) -> 204', bobDeleteTask.status === 204, bobDeleteTask);

    const aliceDeleteOwn = await request('DELETE', '/task/2', { token });
    check('DELETE /task/2 (shared board) -> 204', aliceDeleteOwn.status === 204, aliceDeleteOwn);

    // 8. user lookup + delete (the email-editing PATCH endpoint was removed)
    const userById = await request('GET', `/user/${bob.id}`, { token });
    check('GET /user/:id -> 200', userById.status === 200 && userById.data.id === bob.id, userById);

    const missingUser = await request('GET', '/user/999', { token });
    check('GET /user/999 -> 404', missingUser.status === 404, missingUser);

    const patchUser = await request('PATCH', `/user/${bob.id}`, { token, body: { email: 'bob2@test.com' } });
    check('PATCH /user/:id (removed) -> 404', patchUser.status === 404, patchUser);

    const bobDeleteUser = await request('DELETE', `/user/${bob.id}`, { token: bob.accessToken });
    check('DELETE /user (no tasks) -> 204', bobDeleteUser.status === 204, bobDeleteUser);

    // 9. static frontend + verify page
    const page = await request('GET', '/frontend/html/index.html');
    check('GET /frontend/html/index.html -> 200', page.status === 200 && String(page.data).includes('<title>'), { status: page.status });

    const loginPage = await request('GET', '/frontend/html/login.html');
    const loginHtml = String(loginPage.data);
    check('GET /frontend/html/login.html -> 200 (tabs at bottom, no submit-btn)',
      loginPage.status === 200 && loginHtml.includes('id="tab-login"') && loginHtml.includes('type="submit" id="tab-login"') && !loginHtml.includes('submit-btn'),
      { status: loginPage.status });

    const noTokenVerify = await request('GET', '/verify');
    check('GET /verify (no token) -> 400', noTokenVerify.status === 400, noTokenVerify);

    // 10. routing errors
    const wrongMethod = await request('PUT', '/tasks', { token });
    check('PUT /tasks (unsupported method) -> 404', wrongMethod.status === 404, wrongMethod);

    const notFound = await request('GET', '/nope', { token });
    check('GET /nope -> 404', notFound.status === 404, notFound);
  } finally {
    // Stop the child and wait for it to exit so its file handles are released.
    await new Promise((resolve) => {
      server.once('exit', resolve);
      server.kill();
    });
    // On Windows the .db file can stay locked briefly; retry the delete.
    fs.rmSync(DATA_DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }

  console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
