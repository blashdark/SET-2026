'use strict';

const path = require('path'); // node:path built-in: resolve static paths

// Load backend/.env (if present) before store/auth/mailer read process.env.
// Resolved from THIS file's location, so `node backend/src/index.js` works no
// matter the current working directory. Values already set in the real
// environment are NOT overridden, so tests can still force dev mode.
if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch { /* no .env -> dev mode */ }
}

const http = require('http'); // node:http built-in: create the server
const db = require('./store');
const auth = require('./auth');
const mailer = require('./mailer');

console.log(mailer.isConfigured()
  ? '[mailer] Gmail SMTP configured -> sending real email'
  : '[mailer] dev mode (no SMTP) -> printing the link to the console');

const PORT = Number(process.env.PORT || 3000); // read PORT from the environment
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const VERIFY_TTL_MS = Number(process.env.VERIFY_TTL_SECONDS || 86400) * 1000; // 24h

// ---------- HTTP helpers ----------

function send(res, status, data) {
  const body = JSON.stringify(data); // serialize the object to JSON
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) }); // writeHead: status + headers; Buffer.byteLength: exact byte size
  res.end(body); // end: send the response
}

function fail(res, status, message) {
  send(res, status, { error: message });
}

function noContent(res) {
  res.writeHead(204); // 204: success with no body
  res.end();
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function verifyPage(title, message) {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      background: radial-gradient(circle at top, #1e293b, #0f172a 70%); color: #1e293b; padding: 24px; }
    .card { background: #fff; border-radius: 16px; padding: 36px 28px; max-width: 400px; width: 100%;
      text-align: center; box-shadow: 0 20px 45px rgba(0,0,0,.35); }
    .icon { width: 52px; height: 52px; border-radius: 14px; background: #2563eb; color: #fff;
      display: grid; place-items: center; font-size: 26px; margin: 0 auto 16px; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    p { color: #64748b; margin: 0 0 22px; }
    a { display: inline-block; padding: 12px 20px; min-height: 44px; box-sizing: border-box;
      background: #2563eb; color: #fff; text-decoration: none; border-radius: 10px; font-weight: 600; }
    a:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
  </style>
</head>
<body>
  <main class="card">
    <div class="icon">✓</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <p>Mở <code>frontend/html/login.html</code> trên máy để đăng nhập.</p>
  </main>
</body>
</html>`;
}

const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || (1 << 20)); // cap request size (1 MiB)

// Collect the JSON request body (returns {} when there is none).
// Rejects with 413 once the body exceeds MAX_BODY_BYTES so a huge POST can't exhaust memory.
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    let settled = false;
    req.on('data', (chunk) => { // 'data': body arrives in chunks
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        settled = true;
        const err = new Error('Nội dung yêu cầu quá lớn');
        err.status = 413;
        reject(err);
        return;
      }
      raw += chunk;
    });
    req.on('end', () => { // 'end': the whole body has arrived
      if (settled) return;
      settled = true;
      if (!raw) return resolve({}); // no body -> {}
      try {
        resolve(JSON.parse(raw)); // JSON.parse: parse the raw body
      } catch {
        const err = new Error('Nội dung không phải JSON hợp lệ');
        err.status = 400;
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// Read the user from the "Authorization: Bearer <token>" header, or null.
function currentUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''; // strip the 'Bearer ' prefix
  const userId = auth.readToken(token); // returns the user id, or null
  return userId ? db.getUserById(userId) : null; // load the user (null if it was deleted)
}

function publicUser(user) {
  return { id: user.id, email: user.email, status: user.status, created_at: user.created_at };
}

// Extract a numeric id from a path like '/task/12' with prefix '/task/'.
function idFrom(path, prefix) {
  return Number(path.slice(prefix.length)); // cut the prefix, convert the rest to a number
}

// ---------- validation ----------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmail(value) {
  return EMAIL_RE.test(String(value ?? ''));
}

// Interpret a boolean-ish body field. Unlike Boolean(), the string "false" is false.
function parseBool(value) {
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return Boolean(value);
}

// Password policy: >= 8 chars, 1 upper, 1 lower, 1 special. Returns an error or null.
function passwordError(password) {
  const pw = String(password ?? '');
  if (pw.length < 8) return 'Mật khẩu phải có ít nhất 8 ký tự';
  if (!/[A-Z]/.test(pw)) return 'Mật khẩu phải có ít nhất một chữ hoa';
  if (!/[a-z]/.test(pw)) return 'Mật khẩu phải có ít nhất một chữ thường';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Mật khẩu phải có ít nhất một ký tự đặc biệt';
  return null;
}

// Value must fit the store's fixed cell (width in BYTES, UTF-8). Returns error or null.
function emailError(email) {
  if (!isEmail(email)) return 'Email không hợp lệ';
  if (Buffer.byteLength(email, 'utf8') > db.MAX_EMAIL_BYTES) {
    return `Email quá dài (tối đa ${db.MAX_EMAIL_BYTES} byte)`;
  }
  return null;
}

// title: non-empty, single-line (no CR/LF), and fits its fixed cell.
function titleError(title) {
  if (!title) return 'Tiêu đề không được để trống';
  if (/[\r\n]/.test(title)) return 'Tiêu đề không được chứa ký tự xuống dòng';
  if (Buffer.byteLength(title, 'utf8') > db.MAX_TITLE_BYTES) {
    return `Tiêu đề quá dài (tối đa ${db.MAX_TITLE_BYTES} byte)`;
  }
  return null;
}

// ---------- handlers ----------

// Ids whose scrypt hash is still running in the background. Lets us tell a
// just-created account apart from a stale row left by a crash between the
// snapshot flush and the hash (see signUp).
const pendingHashes = new Set();

async function signUp(res, body) {
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');

  const emErr = emailError(email);
  if (emErr) return fail(res, 400, emErr);
  const pwErr = passwordError(password);
  if (pwErr) return fail(res, 400, pwErr);

  const existing = db.getUserByEmail(email);
  if (existing) {
    // Allow re-registration over a half-created row ONLY when it is a stale
    // orphan (empty hash and no hash currently running). This heals an account
    // that would otherwise answer 409 forever and could never register again.
    const hashing = !existing.password_hash && pendingHashes.has(existing.id);
    if (existing.password_hash || hashing) return fail(res, 409, 'Email đã tồn tại');
    db.deleteUser(existing.id);
  }

  const token = auth.randomToken();
  // Insert with an empty hash first; the KDF runs off the request path (below).
  const user = db.createUser({
    email,
    passwordHash: '',
    salt: '',
    verifyToken: token,
    verifyExpires: Date.now() + VERIFY_TTL_MS
  });

  const payload = publicUser(user); // status = 'pending' until verified
  payload.message = 'Đăng ký thành công. Vui lòng kiểm tra email để xác thực.';
  // In dev (no SMTP) return the link so the flow can be exercised without a mailbox.
  if (!mailer.isConfigured()) payload.verifyUrl = mailer.verifyLink(token);

  // Respond immediately: keep the request path to validate + 1 indexed insert,
  // so the round-trip stays near the HTTP floor.
  send(res, 201, payload);

  // Background (off the request path): hash the password on the threadpool,
  // then send the verification email. scrypt is async so the event loop stays free.
  pendingHashes.add(user.id);
  auth.hashPasswordAsync(password)
    .then(({ salt, hash }) => db.setPasswordHash(user.id, hash, salt))
    .catch((err) => console.error('[sign-up] hash failed:', err.message))
    .finally(() => pendingHashes.delete(user.id));
  mailer.sendVerificationEmail(email, token)
    .catch((err) => console.error('[sign-up] send email failed:', err.message));
}

function login(res, body) {
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');

  const user = db.getUserByEmail(email);
  // Empty hash is only normal for the few ms the background scrypt is running.
  if (user && !user.password_hash && pendingHashes.has(user.id)) {
    return fail(res, 409, 'Tài khoản đang được khởi tạo, thử lại sau ít giây');
  }
  if (!user || !auth.checkPassword(password, user.salt, user.password_hash)) {
    return fail(res, 401, 'Email hoặc mật khẩu không đúng');
  }
  if (user.status !== 'active') return fail(res, 403, 'Email chưa được xác thực');

  const accessToken = auth.createToken(user.id);
  return send(res, 200, { accessToken, tokenType: 'Bearer', expiresIn: auth.TTL_SECONDS, user: publicUser(user) });
}

// GET /verify?token=...
function verifyEmail(res, token) {
  if (!token) return sendHtml(res, 400, verifyPage('Thiếu token', 'Link xác thực không hợp lệ.'));

  const user = db.getUserByVerifyToken(token);
  if (!user) return sendHtml(res, 404, verifyPage('Không hợp lệ', 'Link sai hoặc đã được sử dụng.'));
  if (user.verify_expires && user.verify_expires < Date.now()) {
    return sendHtml(res, 410, verifyPage('Hết hạn', 'Link xác thực đã hết hạn. Hãy đăng ký lại.'));
  }

  db.activateUser(user.id); // status: pending -> active
  return sendHtml(res, 200, verifyPage('Xác thực thành công', 'Tài khoản của bạn đã được kích hoạt. Bạn có thể đăng nhập.'));
}

async function resendVerification(res, body) {
  const email = String(body.email ?? '').trim().toLowerCase();
  const user = db.getUserByEmail(email);

  // Don't leak whether the email exists.
  if (!user || user.status === 'active') {
    return send(res, 200, { message: 'Nếu email tồn tại và chưa xác thực, chúng tôi đã gửi lại link.' });
  }

  const token = auth.randomToken();
  db.setVerifyToken(user.id, token, Date.now() + VERIFY_TTL_MS);

  const payload = { message: 'Đã gửi lại email xác thực.' };
  const mail = await mailer.sendVerificationEmail(email, token);
  if (!mail.delivered) payload.verifyUrl = mail.link;
  return send(res, 200, payload);
}

function deleteUser(res, id) {
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, 'Id người dùng không hợp lệ');
  if (!db.getUserById(id)) return fail(res, 404, 'Không tìm thấy người dùng');
  if (db.countUserTasks(id) > 0) return fail(res, 409, 'Người dùng còn công việc, không thể xoá'); // block while tasks remain

  db.deleteUser(id);
  return noContent(res);
}

function createTask(res, body, user) {
  const title = String(body.title ?? '').trim();
  const tErr = titleError(title);
  if (tErr) return fail(res, 400, tErr);

  // A new task starts UNASSIGNED: user_id = null. created_by records the author;
  // a user is attached later via assign-task (or an update that sets user_id).
  return send(res, 201, db.createTask({ title, userId: null, createdBy: user.id }));
}

function updateTask(res, id, body, user) {
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, 'Id công việc không hợp lệ');
  const task = db.findTaskById(id);
  if (!task) return fail(res, 404, 'Không tìm thấy công việc');
  // Shared board: any authenticated user may edit any task (see GET /tasks).

  const nextTitle = body.title !== undefined ? String(body.title).trim() : undefined;
  if (nextTitle !== undefined) {
    const tErr = titleError(nextTitle);
    if (tErr) return fail(res, 400, tErr);
  }

  // Optional reassignment: user_id may be a positive integer, or null to unassign.
  let userId;
  if (body.user_id !== undefined) {
    if (body.user_id === null) {
      userId = null;
    } else {
      const target = Number(body.user_id);
      if (!Number.isInteger(target) || target <= 0) return fail(res, 400, 'Trường user_id phải là số nguyên dương hoặc null');
      if (!db.getUserById(target)) return fail(res, 404, 'Không tìm thấy người dùng đích');
      userId = target;
    }
  }

  const updated = db.updateTask(id, {
    title: nextTitle,
    done: body.done !== undefined ? parseBool(body.done) : undefined,
    userId
  });
  return send(res, 200, updated);
}

function assignTask(res, id, body) {
  const userId = Number(body.user_id); // target owner comes from the body
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, 'Id công việc không hợp lệ');
  if (!Number.isInteger(userId) || userId <= 0) return fail(res, 400, 'Trường user_id phải là số nguyên dương');
  if (!db.findTaskById(id)) return fail(res, 404, 'Không tìm thấy công việc');
  if (!db.getUserById(userId)) return fail(res, 404, 'Không tìm thấy người dùng đích');

  return send(res, 200, db.assignTask(id, userId));
}

function deleteTask(res, id, user) {
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, 'Id công việc không hợp lệ');

  const task = db.findTaskById(id);
  if (!task) return fail(res, 404, 'Không tìm thấy công việc');
  // Shared board: any authenticated user may delete any task.

  db.deleteTask(id);
  return noContent(res);
}

// ---------- server ----------

const server = http.createServer(async (req, res) => { // called for every request
  const { method } = req;
  const path = req.url.split('?')[0]; // drop the query string

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    // Public routes.
    if (method === 'POST' && path === '/sign-up') return await signUp(res, await readBody(req));
    if (method === 'POST' && path === '/login') return login(res, await readBody(req));
    if (method === 'GET' && path === '/verify') {
      return verifyEmail(res, new URL(req.url, BASE_URL).searchParams.get('token'));
    }
    if (method === 'POST' && path === '/resend-verification') return await resendVerification(res, await readBody(req));

    // Everything below needs a valid token.
    const user = currentUser(req);
    if (!user) return fail(res, 401, 'Chưa đăng nhập hoặc token không hợp lệ');

    if (method === 'GET' && path === '/me') return send(res, 200, publicUser(user));
    if (method === 'GET' && path === '/users') {
      // Paged list: ?limit=50&offset=0 -> { total, limit, offset, items }
      const q = new URL(req.url, BASE_URL).searchParams;
      const limit = Math.min(Math.max(Number.parseInt(q.get('limit'), 10) || 50, 1), 200);
      const offset = Math.max(Number.parseInt(q.get('offset'), 10) || 0, 0);
      return send(res, 200, { total: db.countUsers(), limit, offset, items: db.listUsers(limit, offset) });
    }
    if (method === 'POST' && path === '/task') return createTask(res, await readBody(req), user);
    if (method === 'GET' && path === '/tasks') return send(res, 200, db.listTasks()); // shared board: all tasks
    if (method === 'PATCH' && path.startsWith('/task/')) return updateTask(res, idFrom(path, '/task/'), await readBody(req), user);
    if (method === 'DELETE' && path.startsWith('/task/')) return deleteTask(res, idFrom(path, '/task/'), user);
    if (method === 'PATCH' && path.startsWith('/assign-task/')) return assignTask(res, idFrom(path, '/assign-task/'), await readBody(req));
    if (method === 'GET' && path.startsWith('/user/')) {
      const u = db.getUserById(idFrom(path, '/user/'));
      if (!u) return fail(res, 404, 'Không tìm thấy người dùng');
      return send(res, 200, publicUser(u));
    }
    if (method === 'DELETE' && path.startsWith('/user/')) return deleteUser(res, idFrom(path, '/user/'));

    return fail(res, 404, `Không tìm thấy: ${path}`);
  } catch (err) {
    return fail(res, err.status || 500, err.message || 'Lỗi máy chủ');
  }
});

server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`)); // start listening
