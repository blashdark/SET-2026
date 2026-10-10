'use strict';

// Self-built datastore: NO database engine. Rows are FIXED-LENGTH CSV records:
// every row is the SAME number of bytes, so row N starts at offset N * ROW and
// can be located by arithmetic and rewritten IN PLACE (no garbage, no compaction).
//
// Only small indexes live in RAM (email -> id, verify-token -> id, tasks per user);
// the row data itself stays on disk and is read on demand. id = slot + 1, and a
// deleted row is marked free (its slot is never reused, so ids never collide).

const fs = require('fs'); // node:fs built-in
const path = require('path'); // node:path built-in

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.csv');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.csv');

// [field name, width in BYTES]. Cells are space-padded; ',' separates fields; the
// row ends with '\n'. Row length = sum(widths) + one separator byte per field.
const USERS_LAYOUT = [
  ['email', 64],
  ['password_hash', 128],
  ['salt', 32],
  ['status', 8],
  ['verify_token', 64],
  ['verify_expires', 13],
  ['created_at', 24]
];
const TASKS_LAYOUT = [
  ['title', 128],
  ['alive', 1],
  ['done', 1],
  ['user_id', 10],
  ['created_by', 10],
  ['created_at', 24]
];

const rowSize = (layout) => layout.reduce((n, [, width]) => n + width + 1, 0);
const USERS_ROW = rowSize(USERS_LAYOUT); // 340
const TASKS_ROW = rowSize(TASKS_LAYOUT); // 180

// User input must fit its cell; index.js rejects longer values with a 400.
const MAX_EMAIL_BYTES = USERS_LAYOUT[0][1]; // 64
const MAX_TITLE_BYTES = TASKS_LAYOUT[0][1]; // 128

// ---------- row codec (fixed-length, byte-based) ----------

function encodeRow(layout, data) {
  const parts = [];
  layout.forEach(([name, width], i) => {
    const bytes = Buffer.from(String(data[name] ?? ''), 'utf8');
    if (bytes.length > width) throw new Error(`field '${name}' exceeds ${width} bytes`);
    const cell = Buffer.alloc(width, 0x20); // pad with spaces
    bytes.copy(cell);
    parts.push(cell, Buffer.from(i === layout.length - 1 ? '\n' : ','));
  });
  return Buffer.concat(parts);
}

// Slice by BYTE position (never split on ','), so a value may safely contain a comma.
function decodeRow(layout, buf) {
  const data = {};
  let pos = 0;
  for (const [name, width] of layout) {
    data[name] = buf.toString('utf8', pos, pos + width).replace(/ +$/, ''); // trim padding
    pos += width + 1; // skip the 1-byte separator
  }
  return data;
}

// ---------- files ----------

function openFile(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, ''); // create empty
  return fs.openSync(file, 'r+'); // read + in-place write
}

const usersFd = openFile(USERS_FILE);
const tasksFd = openFile(TASKS_FILE);

function readRow(fd, layout, size, index) {
  const buf = Buffer.alloc(size);
  const n = fs.readSync(fd, buf, 0, size, index * size);
  return n === size ? decodeRow(layout, buf) : null; // short read -> past EOF
}

function writeRow(fd, layout, size, index, data) {
  fs.writeSync(fd, encodeRow(layout, data), 0, size, index * size); // in place, or append past EOF
}

// ---------- in-RAM indexes (no row data) ----------

const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();
const toBool = (v) => v === true || v === '1';
const toNumOrNull = (v) => (v === '' || v == null ? null : Number(v));

const emailToId = new Map(); // email -> user id
const tokenToId = new Map(); // verify token -> user id
const tasksByUser = new Map(); // user id -> Set(task id)
let userCount = 0;
let taskCount = 0;
let usersSlots = 0; // rows present in users.csv (including free)
let tasksSlots = 0;
let nextUserId = 1;
let nextTaskId = 1;

// ---------- load: build indexes by scanning the file (rows stay on disk) ----------

function loadUsers() {
  const CHUNK = 512; // rows per read
  const buf = Buffer.alloc(USERS_ROW * CHUNK);
  let base = 0;
  for (;;) {
    const bytes = fs.readSync(usersFd, buf, 0, buf.length, base * USERS_ROW);
    const rows = Math.floor(bytes / USERS_ROW);
    for (let r = 0; r < rows; r += 1) {
      const off = r * USERS_ROW;
      const row = decodeRow(USERS_LAYOUT, buf.subarray(off, off + USERS_ROW));
      if (row.status === 'free') continue;
      emailToId.set(normalizeEmail(row.email), base + r + 1);
      if (row.verify_token) tokenToId.set(row.verify_token, base + r + 1);
      userCount += 1;
    }
    base += rows;
    if (bytes < buf.length) break;
  }
  usersSlots = base;
  nextUserId = base + 1;
}

function loadTasks() {
  const CHUNK = 512;
  const buf = Buffer.alloc(TASKS_ROW * CHUNK);
  let base = 0;
  for (;;) {
    const bytes = fs.readSync(tasksFd, buf, 0, buf.length, base * TASKS_ROW);
    const rows = Math.floor(bytes / TASKS_ROW);
    for (let r = 0; r < rows; r += 1) {
      const off = r * TASKS_ROW;
      const row = decodeRow(TASKS_LAYOUT, buf.subarray(off, off + TASKS_ROW));
      if (row.alive !== '1') continue;
      taskCount += 1;
      const id = base + r + 1;
      const userId = toNumOrNull(row.user_id);
      if (userId !== null) {
        if (!tasksByUser.has(userId)) tasksByUser.set(userId, new Set());
        tasksByUser.get(userId).add(id);
      }
    }
    base += rows;
    if (bytes < buf.length) break;
  }
  tasksSlots = base;
  nextTaskId = base + 1;
}

loadUsers();
loadTasks();

// ---------- users ----------

function toUser(id, row) {
  return {
    id,
    email: row.email,
    password_hash: row.password_hash,
    salt: row.salt,
    status: row.status,
    verify_token: row.verify_token || null,
    verify_expires: row.verify_expires ? Number(row.verify_expires) : null,
    created_at: row.created_at
  };
}

function userRow(u) {
  return {
    email: u.email,
    password_hash: u.password_hash,
    salt: u.salt,
    status: u.status,
    verify_token: u.verify_token ?? '',
    verify_expires: u.verify_expires ?? '',
    created_at: u.created_at
  };
}

function getUserById(id) {
  const index = Number(id) - 1;
  if (!(index >= 0) || index >= usersSlots) return null;
  const row = readRow(usersFd, USERS_LAYOUT, USERS_ROW, index);
  if (!row || row.status === 'free') return null;
  return toUser(index + 1, row);
}

function getUserByEmail(email) {
  const id = emailToId.get(normalizeEmail(email));
  return id ? getUserById(id) : null;
}

function getUserByVerifyToken(token) {
  const id = token ? tokenToId.get(String(token)) : null;
  return id ? getUserById(id) : null;
}

function putUser(id, row) {
  writeRow(usersFd, USERS_LAYOUT, USERS_ROW, id - 1, row);
  if (id > usersSlots) usersSlots = id;
}

function createUser({ email, passwordHash, salt, verifyToken = null, verifyExpires = null }) {
  const id = nextUserId++;
  const row = {
    email: normalizeEmail(email),
    password_hash: passwordHash,
    salt,
    status: 'pending',
    verify_token: verifyToken ?? '',
    verify_expires: verifyExpires ?? '',
    created_at: new Date().toISOString()
  };
  putUser(id, row);
  emailToId.set(row.email, id);
  if (row.verify_token) tokenToId.set(row.verify_token, id);
  userCount += 1;
  return toUser(id, row);
}

function activateUser(id) {
  const user = getUserById(id);
  if (!user) return null;
  if (user.verify_token) tokenToId.delete(user.verify_token);
  user.status = 'active';
  user.verify_token = null;
  user.verify_expires = null;
  putUser(user.id, userRow(user));
  return user;
}

function setVerifyToken(id, token, expiresAt) {
  const user = getUserById(id);
  if (!user) return null;
  if (user.verify_token) tokenToId.delete(user.verify_token);
  user.verify_token = token;
  user.verify_expires = expiresAt;
  if (token) tokenToId.set(token, user.id);
  putUser(user.id, userRow(user));
  return user;
}

function setPasswordHash(id, passwordHash, salt) {
  const user = getUserById(id);
  if (!user) return null;
  user.password_hash = passwordHash;
  user.salt = salt;
  putUser(user.id, userRow(user));
  return user;
}

function deleteUser(id) {
  const user = getUserById(id);
  if (!user) return;
  if (user.verify_token) tokenToId.delete(user.verify_token);
  emailToId.delete(user.email);
  const row = userRow(user);
  row.status = 'free';
  putUser(user.id, row);
  userCount -= 1;
}

// Users are stored in id order, so skip/take is cheap (reads only what it returns).
function listUsers(limit = 50, offset = 0) {
  const lim = Number(limit);
  let skip = Number(offset);
  const out = [];
  for (let index = 0; index < usersSlots; index += 1) {
    const row = readRow(usersFd, USERS_LAYOUT, USERS_ROW, index);
    if (!row || row.status === 'free') continue;
    if (skip > 0) { skip -= 1; continue; }
    out.push({ id: index + 1, email: row.email, status: row.status, created_at: row.created_at });
    if (out.length >= lim) break;
  }
  return out;
}

function countUsers() {
  return userCount;
}

function countUserTasks(userId) {
  const set = tasksByUser.get(Number(userId));
  return set ? set.size : 0;
}

// ---------- tasks ----------

function toTask(id, row) {
  return {
    id,
    title: row.title,
    done: toBool(row.done),
    user_id: toNumOrNull(row.user_id),
    created_by: toNumOrNull(row.created_by),
    created_at: row.created_at
  };
}

function taskRow(t) {
  return {
    title: t.title,
    alive: '1',
    done: t.done ? '1' : '0',
    user_id: t.user_id ?? '',
    created_by: t.created_by ?? '',
    created_at: t.created_at
  };
}

function putTask(id, row) {
  writeRow(tasksFd, TASKS_LAYOUT, TASKS_ROW, id - 1, row);
  if (id > tasksSlots) tasksSlots = id;
}

function indexTask(id, userId) {
  if (userId == null) return;
  if (!tasksByUser.has(userId)) tasksByUser.set(userId, new Set());
  tasksByUser.get(userId).add(id);
}

function unindexTask(id, userId) {
  if (userId == null) return;
  const set = tasksByUser.get(userId);
  if (set) { set.delete(id); if (!set.size) tasksByUser.delete(userId); }
}

function findTaskById(id) {
  const index = Number(id) - 1;
  if (!(index >= 0) || index >= tasksSlots) return null;
  const row = readRow(tasksFd, TASKS_LAYOUT, TASKS_ROW, index);
  if (!row || row.alive !== '1') return null;
  return toTask(index + 1, row);
}

function listUserTasks(userId) {
  const ids = tasksByUser.get(Number(userId));
  if (!ids) return [];
  return [...ids].sort((a, b) => a - b).map((id) => findTaskById(id));
}

// All tasks regardless of owner (the task board is shared).
function listTasks() {
  const out = [];
  for (let index = 0; index < tasksSlots; index += 1) {
    const row = readRow(tasksFd, TASKS_LAYOUT, TASKS_ROW, index);
    if (row && row.alive === '1') out.push(toTask(index + 1, row));
  }
  return out;
}

function createTask({ title, userId, createdBy }) {
  const id = nextTaskId++;
  const row = {
    title,
    alive: '1',
    done: '0',
    user_id: userId ?? '',
    created_by: createdBy ?? '',
    created_at: new Date().toISOString()
  };
  putTask(id, row);
  indexTask(id, toNumOrNull(row.user_id));
  taskCount += 1;
  return toTask(id, row);
}

function updateTask(id, { title, done, userId }) {
  const task = findTaskById(id);
  if (!task) return null;
  if (title !== undefined) task.title = title;
  if (done !== undefined) task.done = toBool(done);
  if (userId !== undefined && userId !== task.user_id) {
    unindexTask(task.id, task.user_id);
    task.user_id = userId ?? null;
    indexTask(task.id, task.user_id);
  }
  putTask(task.id, taskRow(task));
  return task;
}

function assignTask(taskId, userId) {
  const task = findTaskById(taskId);
  if (!task) return null;
  unindexTask(task.id, task.user_id);
  task.user_id = userId ?? null;
  indexTask(task.id, task.user_id);
  putTask(task.id, taskRow(task));
  return task;
}

function deleteTask(id) {
  const task = findTaskById(id);
  if (!task) return;
  unindexTask(task.id, task.user_id);
  const row = taskRow(task);
  row.alive = '0';
  putTask(task.id, row);
  taskCount -= 1;
}

// ---------- durability ----------
// Mutations are written synchronously (one small row per change). flush() fsyncs
// them so the data survives once we return control.

function flush() {
  if (closed) return;
  try {
    fs.fsyncSync(usersFd);
    fs.fsyncSync(tasksFd);
  } catch (err) {
    console.error('[store] flush failed:', err.message);
  }
}
const flushSync = flush;

let closed = false;
// Close the file handles (used by scripts/tests that delete the data dir on Windows).
function close() {
  if (closed) return;
  closed = true;
  try { fs.closeSync(usersFd); } catch { /* already closed */ }
  try { fs.closeSync(tasksFd); } catch { /* already closed */ }
}

process.on('exit', flush);
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { flush(); process.exit(0); });
}

module.exports = {
  DATA_DIR,
  USERS_FILE,
  TASKS_FILE,
  USERS_LAYOUT,
  TASKS_LAYOUT,
  USERS_ROW,
  TASKS_ROW,
  MAX_EMAIL_BYTES,
  MAX_TITLE_BYTES,
  encodeRow,
  flush,
  flushSync,
  close,
  getUserById,
  getUserByEmail,
  getUserByVerifyToken,
  createUser,
  activateUser,
  setVerifyToken,
  setPasswordHash,
  deleteUser,
  listUsers,
  countUsers,
  countUserTasks,
  findTaskById,
  listUserTasks,
  listTasks,
  createTask,
  updateTask,
  assignTask,
  deleteTask
};
