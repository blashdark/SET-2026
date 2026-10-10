'use strict';

// One-off migration: convert the OLD variable-length CSV (with a header, one row
// per entity) into the NEW fixed-length rows. Each old id maps to slot id-1; a
// missing id becomes a free/dead row so ids are preserved exactly. Writes to
// .tmp then renames, so it can be re-run safely.
//
// Usage: node scripts/migrate-to-fixed.js

const fs = require('fs');
const os = require('os');
const path = require('path');

// Point the store at a throwaway dir so requiring it does not touch the real
// files (its file handles would otherwise lock them on Windows).
const REAL_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-'));

const store = require('../src/store');
const { USERS_LAYOUT, TASKS_LAYOUT, encodeRow } = store;

const USERS_FILE = path.join(REAL_DIR, 'users.csv');
const TASKS_FILE = path.join(REAL_DIR, 'tasks.csv');

// Minimal stateful CSV reader (tracks quotes across newlines).
function parseCsv(text) {
  const rows = [];
  let fields = [];
  let field = '';
  let quoted = false;
  const endRow = () => {
    if (fields.length === 1 && fields[0] === '') { fields = []; field = ''; return; }
    rows.push(fields);
    fields = [];
    field = '';
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false; }
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { fields.push(field); field = ''; }
    else if (ch === '\n') { fields.push(field); field = ''; endRow(); }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || fields.length) { fields.push(field); endRow(); }
  return rows;
}

// header row -> array of objects
function toObjects(rows) {
  const header = rows.shift() || [];
  return rows.map((r) => { const o = {}; header.forEach((k, i) => { o[k] = r[i] ?? ''; }); return o; });
}

function byIdMap(objs) {
  const map = new Map();
  let maxId = 0;
  for (const o of objs) {
    const id = Number(o.id);
    if (id > 0) { map.set(id, o); if (id > maxId) maxId = id; }
  }
  return { map, maxId };
}

function migrateUsers() {
  if (!fs.existsSync(USERS_FILE)) { console.log('users: (no file, skipped)'); return; }
  const { map, maxId } = byIdMap(toObjects(parseCsv(fs.readFileSync(USERS_FILE, 'utf8'))));
  const free = encodeRow(USERS_LAYOUT, { email: '', password_hash: '', salt: '', status: 'free', verify_token: '', verify_expires: '', created_at: '' });
  const tmp = USERS_FILE + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  for (let id = 1; id <= maxId; id += 1) {
    const o = map.get(id);
    if (!o) { fs.writeSync(fd, free); continue; }
    fs.writeSync(fd, encodeRow(USERS_LAYOUT, {
      email: String(o.email).trim().toLowerCase(),
      password_hash: o.password_hash,
      salt: o.salt,
      status: o.status,
      verify_token: o.verify_token,
      verify_expires: o.verify_expires,
      created_at: o.created_at
    }));
  }
  fs.closeSync(fd);
  fs.renameSync(tmp, USERS_FILE);
  console.log(`users: ${map.size} rows -> ${maxId} slots`);
}

function migrateTasks() {
  if (!fs.existsSync(TASKS_FILE)) { console.log('tasks: (no file, skipped)'); return; }
  const { map, maxId } = byIdMap(toObjects(parseCsv(fs.readFileSync(TASKS_FILE, 'utf8'))));
  const dead = encodeRow(TASKS_LAYOUT, { title: '', alive: '0', done: '0', user_id: '', created_by: '', created_at: '' });
  const tmp = TASKS_FILE + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  for (let id = 1; id <= maxId; id += 1) {
    const o = map.get(id);
    if (!o) { fs.writeSync(fd, dead); continue; }
    fs.writeSync(fd, encodeRow(TASKS_LAYOUT, {
      title: o.title,
      alive: '1',
      done: o.done === '1' || o.done === 'true' ? '1' : '0',
      user_id: o.user_id,
      created_by: o.created_by,
      created_at: o.created_at
    }));
  }
  fs.closeSync(fd);
  fs.renameSync(tmp, TASKS_FILE);
  console.log(`tasks: ${map.size} rows -> ${maxId} slots`);
}

migrateUsers();
migrateTasks();
console.log('Migration xong.');
