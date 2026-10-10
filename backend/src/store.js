'use strict';

// Self-built datastore: NO database engine — just CSV files we read/write
// ourselves. Reads come from in-memory indexes (Maps). Writes mutate memory and
// mark the file dirty; flush() rewrites the file as a SNAPSHOT, so the CSV holds
// exactly ONE line per user/task (no append log, no duplicate rows).

const fs = require('fs'); // node:fs built-in
const fsp = require('fs').promises;
const path = require('path'); // node:path built-in
const { StringDecoder } = require('string_decoder'); // keeps partial multibyte chars across chunks

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.csv');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.csv');

// Snapshot header: one row = current state of one entity.
const USERS_HEADER = ['id', 'email', 'password_hash', 'salt', 'status', 'verify_token', 'verify_expires', 'created_at'];
const TASKS_HEADER = ['id', 'title', 'done', 'user_id', 'created_by', 'created_at'];

const FLUSH_MS = Number(process.env.FLUSH_MS || 200); // write-behind interval

// ---------- CSV helpers ----------

// Quote a value when it holds a delimiter, a quote or a line break.
function escapeValue(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

// Parse a single CSV line (no embedded newlines). Kept as a standalone helper.
function splitLine(line) {
  const fields = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { value += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { fields.push(value); value = ''; }
    else value += ch;
  }
  fields.push(value);
  return fields;
}

function toCsvLine(header, obj) {
  return header.map((key) => escapeValue(obj[key])).join(',');
}

// ---------- in-memory indexes ----------

const usersById = new Map();
const usersByEmail = new Map();
const usersByToken = new Map();
let nextUserId = 1;

const tasksById = new Map();
const tasksByUser = new Map(); // userId -> Set(taskId)
let nextTaskId = 1;

const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();
const toBool = (v) => v === true || v === 'true' || v === 1 || v === '1';
const toNumOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

// ---------- load ----------
// Understands both formats:
//   * snapshot (current): header + one row per entity
//   * legacy append-log:  first column "op" (add | patch | del)
// so an old users.csv is read correctly, then rewritten as a snapshot on flush.
//
// The parser is a stateful CSV reader: it tracks quote state ACROSS newlines (so
// a quoted value containing \n is kept whole) and decodes chunks with a
// StringDecoder (so a UTF-8 char split at a 1 MiB boundary is not corrupted).

function loadCsv(file, apply) {
  if (!fs.existsSync(file)) return { log: false, rows: 0 };

  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(1 << 20); // 1MB chunks -> don't load a huge file at once
  const decoder = new StringDecoder('utf8');

  let headerKeys = null;
  let isLog = false;
  let rows = 0;
  let fields = [];
  let field = '';
  let quoted = false;

  const endRow = () => {
    // skip blank lines (a line that yields a single empty field)
    if (fields.length === 1 && fields[0] === '') { fields = []; field = ''; return; }
    if (!headerKeys) {
      headerKeys = fields;
      isLog = fields[0] === 'op';
    } else {
      const row = {};
      headerKeys.forEach((key, i) => { row[key] = fields[i] ?? ''; });
      rows += 1;
      apply(row, isLog);
    }
    fields = [];
    field = '';
  };

  const feed = (text) => {
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 1; } // escaped quote
          else quoted = false; // closing quote
        } else {
          field += ch; // ',' and '\n' are literal while inside quotes
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ',') {
        fields.push(field); field = '';
      } else if (ch === '\n') {
        fields.push(field); field = '';
        endRow();
      } else if (ch !== '\r') { // drop stray CR (CRLF and lone CR both tolerated)
        field += ch;
      }
    }
  };

  for (;;) {
    const bytes = fs.readSync(fd, buf, 0, buf.length, null);
    if (bytes === 0) break;
    feed(decoder.write(buf.subarray(0, bytes)));
  }
  feed(decoder.end());
  if (field !== '' || fields.length) { fields.push(field); field = ''; endRow(); } // last line without trailing newline
  fs.closeSync(fd);
  return { log: isLog, rows };
}

function removeUserFromIndex(id) {
  const existing = usersById.get(id);
  if (!existing) return;
  usersById.delete(id);
  if (usersByEmail.get(existing.email) === existing) usersByEmail.delete(existing.email);
  if (existing.verify_token && usersByToken.get(existing.verify_token) === existing) usersByToken.delete(existing.verify_token);
}

function applyUserRow(row, isLog) {
  const id = Number(row.id);
  if (isLog && row.op === 'del') { removeUserFromIndex(id); return; }

  const user = {
    id,
    email: normalizeEmail(row.email), // normalize on load so the email index keys agree
    password_hash: row.password_hash,
    salt: row.salt,
    status: row.status,
    verify_token: row.verify_token === '' ? null : row.verify_token,
    verify_expires: row.verify_expires === '' ? null : Number(row.verify_expires),
    created_at: row.created_at
  };
  removeUserFromIndex(id); // handle re-add / email change
  usersById.set(id, user);
  usersByEmail.set(user.email, user);
  if (user.verify_token) usersByToken.set(user.verify_token, user);
  if (id >= nextUserId) nextUserId = id + 1;
}

function removeTaskFromIndex(id) {
  const existing = tasksById.get(id);
  if (!existing) return;
  tasksById.delete(id);
  const set = existing.user_id !== null ? tasksByUser.get(existing.user_id) : null;
  if (set) { set.delete(id); if (!set.size) tasksByUser.delete(existing.user_id); }
}

function applyTaskRow(row, isLog) {
  const id = Number(row.id);
  if (isLog && row.op === 'del') { removeTaskFromIndex(id); return; }

  const task = {
    id,
    title: row.title,
    done: toBool(row.done),
    user_id: toNumOrNull(row.user_id),
    created_by: toNumOrNull(row.created_by),
    created_at: row.created_at
  };
  removeTaskFromIndex(id);
  tasksById.set(id, task);
  if (task.user_id !== null) {
    if (!tasksByUser.has(task.user_id)) tasksByUser.set(task.user_id, new Set());
    tasksByUser.get(task.user_id).add(id);
  }
  if (id >= nextTaskId) nextTaskId = id + 1;
}

const usersLoad = loadCsv(USERS_FILE, applyUserRow);
const tasksLoad = loadCsv(TASKS_FILE, applyTaskRow);

// ---------- persistence: rewrite a snapshot (one line per entity) ----------

let usersDirty = false;
let tasksDirty = false;
let flushTimer = null;
let flushing = false;
let flushBackoff = 0; // grows on repeated failures so a broken disk doesn't spin

function rowForUser(user) {
  return toCsvLine(USERS_HEADER, {
    id: user.id,
    email: user.email,
    password_hash: user.password_hash,
    salt: user.salt,
    status: user.status,
    verify_token: user.verify_token ?? '',
    verify_expires: user.verify_expires ?? '',
    created_at: user.created_at
  });
}

function rowForTask(task) {
  return toCsvLine(TASKS_HEADER, {
    id: task.id,
    title: task.title,
    done: task.done ? 1 : 0,
    user_id: task.user_id ?? '',
    created_by: task.created_by ?? '',
    created_at: task.created_at
  });
}

function snapshot(header, items, rowFn) {
  const parts = [header.join(',')];
  for (const item of items) parts.push(rowFn(item));
  return parts.join('\n') + '\n';
}

function scheduleFlush(delay = FLUSH_MS) {
  if (flushTimer) return;
  flushTimer = setTimeout(flush, delay);
  if (flushTimer.unref) flushTimer.unref();
}

function markUsersDirty() { usersDirty = true; scheduleFlush(); }
function markTasksDirty() { tasksDirty = true; scheduleFlush(); }

// Write one file atomically (tmp + rename). Dirty is cleared by the caller on success.
async function writeSnapshot(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, file); // atomic replace -> readers never see a half file
}

// Async flush (used by the timer): does not block the event loop on disk I/O.
// Dirty flags are cleared only AFTER a successful write, so a failed flush is
// retried (with backoff) instead of silently dropping the pending snapshot.
async function flush() {
  flushTimer = null;
  if (flushing) return; // the running flush will pick up the dirty flags again
  if (!usersDirty && !tasksDirty) return;

  flushing = true;
  let failed = false;
  try {
    if (usersDirty) { await writeSnapshot(USERS_FILE, snapshot(USERS_HEADER, usersById.values(), rowForUser)); usersDirty = false; }
    if (tasksDirty) { await writeSnapshot(TASKS_FILE, snapshot(TASKS_HEADER, tasksById.values(), rowForTask)); tasksDirty = false; }
  } catch (err) {
    failed = true;
    console.error('[store] flush failed:', err.message);
  }
  flushing = false;

  if (failed) {
    flushBackoff = flushBackoff ? Math.min(flushBackoff * 2, 30000) : FLUSH_MS * 2;
    scheduleFlush(flushBackoff); // retry, still holding the dirty data
  } else {
    flushBackoff = 0;
    if (usersDirty || tasksDirty) scheduleFlush(); // mutations that landed mid-write
  }
}

// Synchronous flush for process exit (async I/O can't run during 'exit').
function flushSync() {
  try {
    if (usersDirty) {
      fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
      fs.writeFileSync(USERS_FILE, snapshot(USERS_HEADER, usersById.values(), rowForUser));
      usersDirty = false;
    }
    if (tasksDirty) {
      fs.mkdirSync(path.dirname(TASKS_FILE), { recursive: true });
      fs.writeFileSync(TASKS_FILE, snapshot(TASKS_HEADER, tasksById.values(), rowForTask));
      tasksDirty = false;
    }
  } catch (err) {
    console.error('[store] flushSync failed:', err.message);
  }
}

process.on('exit', flushSync);
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { flushSync(); process.exit(0); });
}

// A legacy append-log (or extra rows) on disk -> compact to a snapshot now.
if (usersLoad.log || usersLoad.rows !== usersById.size) markUsersDirty();
if (tasksLoad.log || tasksLoad.rows !== tasksById.size) markTasksDirty();

// ---------- users ----------

function getUserById(id) {
  return usersById.get(Number(id)) || null;
}

function getUserByEmail(email) {
  return usersByEmail.get(normalizeEmail(email)) || null;
}

function getUserByVerifyToken(token) {
  return token ? usersByToken.get(String(token)) || null : null;
}

function createUser({ email, passwordHash, salt, verifyToken = null, verifyExpires = null }) {
  const user = {
    id: nextUserId++,
    email: normalizeEmail(email),
    password_hash: passwordHash,
    salt,
    status: 'pending',
    verify_token: verifyToken,
    verify_expires: verifyExpires,
    created_at: new Date().toISOString()
  };
  usersById.set(user.id, user);
  usersByEmail.set(user.email, user);
  if (user.verify_token) usersByToken.set(user.verify_token, user);
  markUsersDirty();
  return user;
}

function activateUser(id) {
  const user = usersById.get(Number(id));
  if (!user) return null;
  if (user.verify_token) usersByToken.delete(user.verify_token);
  user.status = 'active';
  user.verify_token = null;
  user.verify_expires = null;
  markUsersDirty();
  return user;
}

function setVerifyToken(id, token, expiresAt) {
  const user = usersById.get(Number(id));
  if (!user) return null;
  if (user.verify_token) usersByToken.delete(user.verify_token);
  user.verify_token = token;
  user.verify_expires = expiresAt;
  if (token) usersByToken.set(token, user);
  markUsersDirty();
  return user;
}

function setPasswordHash(id, passwordHash, salt) {
  const user = usersById.get(Number(id));
  if (!user) return null;
  user.password_hash = passwordHash;
  user.salt = salt;
  markUsersDirty();
  return user;
}

function deleteUser(id) {
  const numericId = Number(id);
  if (!usersById.has(numericId)) return;
  removeUserFromIndex(numericId);
  markUsersDirty();
}

// Users are stored in insertion (≈ id) order, so skip/take is cheap.
function listUsers(limit = 50, offset = 0) {
  const lim = Number(limit);
  let skip = Number(offset);
  const out = [];
  for (const user of usersById.values()) {
    if (skip > 0) { skip -= 1; continue; }
    out.push({ id: user.id, email: user.email, status: user.status, created_at: user.created_at });
    if (out.length >= lim) break;
  }
  return out;
}

function countUsers() {
  return usersById.size;
}

function countUserTasks(userId) {
  const set = tasksByUser.get(Number(userId));
  return set ? set.size : 0;
}

// ---------- tasks ----------

function findTaskById(id) {
  return tasksById.get(Number(id)) || null;
}

function listUserTasks(userId) {
  const ids = tasksByUser.get(Number(userId));
  if (!ids) return [];
  return [...ids].sort((a, b) => a - b).map((id) => tasksById.get(id));
}

// All tasks regardless of owner (the task board is shared).
function listTasks() {
  return [...tasksById.values()].sort((a, b) => a.id - b.id);
}

function createTask({ title, userId, createdBy }) {
  const task = {
    id: nextTaskId++,
    title,
    done: false,
    user_id: userId ?? null,
    created_by: createdBy ?? null,
    created_at: new Date().toISOString()
  };
  tasksById.set(task.id, task);
  if (task.user_id !== null) {
    if (!tasksByUser.has(task.user_id)) tasksByUser.set(task.user_id, new Set());
    tasksByUser.get(task.user_id).add(task.id);
  }
  markTasksDirty();
  return task;
}

function updateTask(id, { title, done, userId }) {
  const task = tasksById.get(Number(id));
  if (!task) return null;
  if (title !== undefined) task.title = title;
  if (done !== undefined) task.done = toBool(done);
  // Optional reassignment: move the task between the per-user index buckets.
  if (userId !== undefined && userId !== task.user_id) {
    if (task.user_id !== null) {
      const set = tasksByUser.get(task.user_id);
      if (set) { set.delete(task.id); if (!set.size) tasksByUser.delete(task.user_id); }
    }
    task.user_id = userId ?? null;
    if (task.user_id !== null) {
      if (!tasksByUser.has(task.user_id)) tasksByUser.set(task.user_id, new Set());
      tasksByUser.get(task.user_id).add(task.id);
    }
  }
  markTasksDirty();
  return task;
}

function assignTask(taskId, userId) {
  const task = tasksById.get(Number(taskId));
  if (!task) return null;
  if (task.user_id !== null) {
    const set = tasksByUser.get(task.user_id);
    if (set) { set.delete(task.id); if (!set.size) tasksByUser.delete(task.user_id); }
  }
  task.user_id = userId ?? null;
  if (task.user_id !== null) {
    if (!tasksByUser.has(task.user_id)) tasksByUser.set(task.user_id, new Set());
    tasksByUser.get(task.user_id).add(task.id);
  }
  markTasksDirty();
  return task;
}

function deleteTask(id) {
  const numericId = Number(id);
  if (!tasksById.has(numericId)) return;
  removeTaskFromIndex(numericId);
  markTasksDirty();
}

module.exports = {
  DATA_DIR,
  USERS_FILE,
  TASKS_FILE,
  USERS_HEADER,
  TASKS_HEADER,
  escapeValue,
  splitLine,
  toCsvLine,
  flush,
  flushSync,
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
