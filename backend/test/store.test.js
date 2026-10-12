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

// 5. listUsers pagination skips freed rows; countTasksCreatedBy tracks authors.
{
  const DIR2 = fs.mkdtempSync(path.join(os.tmpdir(), 'store-test2-'));
  process.env.DATA_DIR = DIR2;
  let store = reload();
  const ids = [];
  for (let i = 1; i <= 5; i += 1) ids.push(store.createUser({ email: `u${i}@x.com`, passwordHash: 'h', salt: 's' }).id);
  store.deleteUser(ids[1]); // free the 2nd user
  store.flush();

  store = reload();
  const page1 = store.listUsers(2, 0).map((u) => u.id);
  const page2 = store.listUsers(2, 2).map((u) => u.id);
  ok('listUsers page 1 skips freed row', page1.join(',') === `${ids[0]},${ids[2]}`, page1);
  ok('listUsers page 2 (offset 2)', page2.join(',') === `${ids[3]},${ids[4]}`, page2);
  ok('listUsers(10, 0) counts only live', store.listUsers(10, 0).length === 4, store.listUsers(10, 0).length);

  const owned = store.createTask({ title: 'owned', userId: null, createdBy: ids[0] });
  ok('countTasksCreatedBy counts author', store.countTasksCreatedBy(ids[0]) === 1, store.countTasksCreatedBy(ids[0]));
  store.deleteTask(owned.id);
  ok('countTasksCreatedBy drops after delete', store.countTasksCreatedBy(ids[0]) === 0, store.countTasksCreatedBy(ids[0]));

  store.close();
  try { fs.rmSync(DIR2, { recursive: true, force: true }); } catch { /* file handles held open on Windows */ }
}

try { fs.rmSync(DIR, { recursive: true, force: true }); } catch { /* file handles held open on Windows */ }
console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
