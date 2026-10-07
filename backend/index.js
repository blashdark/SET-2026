'use strict';

const http = require('http'); // node:http built-in: create the server
const db = require('./store');
const auth = require('./auth');

const PORT = Number(process.env.PORT || 3000); // read PORT from the environment

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

// Collect the JSON request body (returns {} when there is none).
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; }); // 'data': body arrives in chunks
    req.on('end', () => { // 'end': the whole body has arrived
      if (!raw) return resolve({}); // no body -> {}
      try {
        resolve(JSON.parse(raw)); // JSON.parse: parse the raw body
      } catch {
        const err = new Error('Body is not valid JSON');
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
  return userId ? db.findUserById(userId) : null; // load the user (null if it was deleted)
}

function publicUser(user) {
  return { id: user.id, username: user.username, created_at: user.created_at };
}

// Extract a numeric id from a path like '/task/12' with prefix '/task/'.
function idFrom(path, prefix) {
  return Number(path.slice(prefix.length)); // cut the prefix, convert the rest to a number
}

// ---------- handlers ----------

function signUp(res, body) {
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');

  if (!username || !password) return fail(res, 400, 'username and password are required');
  if (username.length < 3) return fail(res, 400, 'username must be at least 3 characters');
  if (password.length < 6) return fail(res, 400, 'password must be at least 6 characters');
  if (db.findUserByUsername(username)) return fail(res, 409, 'username already exists'); // usernames must be unique

  const { salt, hash } = auth.hashPassword(password);
  const user = db.createUser(username, hash, salt);
  return send(res, 201, publicUser(user));
}

function login(res, body) {
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');

  const user = db.findUserByUsername(username);
  if (!user || !auth.checkPassword(password, user.salt, user.password_hash)) {
    return fail(res, 401, 'Invalid username or password');
  }

  const accessToken = auth.createToken(user.id);
  return send(res, 200, { accessToken, tokenType: 'Bearer', expiresIn: auth.TTL_SECONDS });
}

function deleteUser(res, id) {
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, 'Invalid user id');
  if (!db.findUserById(id)) return fail(res, 404, 'User not found');
  if (db.countUserTasks(id) > 0) return fail(res, 409, 'User still has tasks and cannot be deleted'); // block while tasks remain

  db.deleteUser(id);
  return noContent(res);
}

function createTask(res, body, user) {
  const title = String(body.title ?? '').trim();
  const description = String(body.description ?? '');
  if (!title) return fail(res, 400, 'title is required');

  return send(res, 201, db.createTask(title, description, user.id)); // owner comes from the token, not the client
}

function assignTask(res, id, body) {
  const userId = Number(body.user_id); // target owner comes from the body
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, 'Invalid task id');
  if (!Number.isInteger(userId) || userId <= 0) return fail(res, 400, 'user_id must be a positive integer');
  if (!db.findTaskById(id)) return fail(res, 404, 'Task not found');
  if (!db.findUserById(userId)) return fail(res, 404, 'Target user not found');

  return send(res, 200, db.assignTask(id, userId));
}

function deleteTask(res, id, user) {
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, 'Invalid task id');

  const task = db.findTaskById(id);
  if (!task) return fail(res, 404, 'Task not found');
  if (task.user_id !== user.id) return fail(res, 403, 'You do not own this task'); // only the owner can delete

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
    if (method === 'POST' && path === '/sign-up') return signUp(res, await readBody(req));
    if (method === 'POST' && path === '/login') return login(res, await readBody(req));

    // Everything below needs a valid token.
    const user = currentUser(req);
    if (!user) return fail(res, 401, 'Unauthenticated or invalid token');

    if (method === 'GET' && path === '/me') return send(res, 200, publicUser(user));
    if (method === 'POST' && path === '/task') return createTask(res, await readBody(req), user);
    if (method === 'GET' && path === '/tasks') return send(res, 200, db.listUserTasks(user.id));
    if (method === 'PATCH' && path.startsWith('/assign-task/')) return assignTask(res, idFrom(path, '/assign-task/'), await readBody(req));
    if (method === 'DELETE' && path.startsWith('/user/')) return deleteUser(res, idFrom(path, '/user/'));
    if (method === 'DELETE' && path.startsWith('/task/')) return deleteTask(res, idFrom(path, '/task/'), user);

    return fail(res, 404, `Not found: ${path}`);
  } catch (err) {
    return fail(res, err.status || 500, err.message || 'Internal server error');
  }
});

server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`)); // start listening
