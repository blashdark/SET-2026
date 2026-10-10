'use strict';

// Unit tests for the fixed-length CSV store (src/store.js).
// Run: node test/store.test.js
// Covers: values round-trip through the fixed-length file, updates happen IN
// PLACE (file does not grow), deletes mark the slot free (file does not shrink),
// and a multibyte + comma-containing title survives.

const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'store-test-'));
process.env.DATA_DIR = DIR;

const STORE = require.resolve('../src/store');
const file = (name) => path.join(DIR, name);
const sizeOf = (name) => fs.statSync(file(name)).size;
// Fresh module instance (re-reads the files from disk + rebuilds the indexes).
function reload() {
  delete require.cache[STORE];
  return require('../src/store');
}

let failures = 0;
function ok(name, cond, detail) {
  if (!cond) failures += 1;
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${cond ? '' : ` -> ${JSON.stringify(detail)}`}`);
}

// 1. create + reload: values survive, email normalized, one row per entity.
{
  const store = reload();
  const u = store.createUser({ email: 'Tricky@Example.com', passwordHash: 'h', salt: 's', verifyToken: 'tok', verifyExpires: 123 });
  const t1 = store.createTask({ title: 'Họp nhóm Q4, 2026', userId: null, createdBy: u.id }); // multibyte + comma
  store.createTask({ title: 'Task B', userId: null, createdBy: u.id });
  store.flush();

  const store2 = reload();
  ok('email normalized on load', store2.getUserByEmail('tricky@example.com') !== null);
  ok('title kept (multibyte + comma)', store2.findTaskById(t1.id).title === 'Họp nhóm Q4, 2026', store2.findTaskById(t1.id));
  ok('still one row per task', store2.listTasks().length === 2, store2.listTasks().length);
  ok('tasks.csv is fixed-width', sizeOf('tasks.csv') === 2 * store2.TASKS_ROW, sizeOf('tasks.csv'));
  ok('users.csv is fixed-width', sizeOf('users.csv') === 1 * store2.USERS_ROW, sizeOf('users.csv'));
}

// 2. update is in place: the file does not grow and the change persists.
{
  const before = sizeOf('tasks.csv');
  const store = reload();
  const updated = store.updateTask(1, { title: 'renamed', done: true });
  ok('update returns the new state', updated.title === 'renamed' && updated.done === true, updated);
  ok('update keeps file size (in place)', sizeOf('tasks.csv') === before, sizeOf('tasks.csv'));
  ok('update persisted', reload().findTaskById(1).title === 'renamed');
}

// 3. delete a task: slot marked dead, not returned, file does not shrink.
{
  const before = sizeOf('tasks.csv');
  const store = reload();
  store.deleteTask(2);
  ok('delete keeps file size', sizeOf('tasks.csv') === before, sizeOf('tasks.csv'));
  const again = reload();
  ok('deleted task gone', again.findTaskById(2) === null);
  ok('listTasks excludes deleted', again.listTasks().length === 1, again.listTasks().length);
}

// 4. delete a user: freed, not returned, file does not shrink.
{
  const before = sizeOf('users.csv');
  const store = reload();
  store.deleteUser(1);
  ok('deleteUser keeps file size', sizeOf('users.csv') === before, sizeOf('users.csv'));
  const again = reload();
  ok('deleted user gone', again.getUserById(1) === null);
  ok('user count drops', again.countUsers() === 0, again.countUsers());
}

try { fs.rmSync(DIR, { recursive: true, force: true }); } catch { /* file handles held open on Windows */ }
console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
