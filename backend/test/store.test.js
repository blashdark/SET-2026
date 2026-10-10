'use strict';

// Unit tests for the self-built CSV store (src/store.js).
// Run: node test/store.test.js
// Covers the two data-integrity bugs fixed in the review:
//   * a value containing a newline round-trips through the snapshot file
//   * a multibyte char split at the 1 MiB read boundary is not corrupted

const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'store-test-'));
process.env.DATA_DIR = DIR;

const STORE = require.resolve('../src/store');
const storePath = () => path.join(DIR, 'tasks.csv');

let failures = 0;
function ok(name, cond, detail) {
  if (!cond) failures += 1;
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${cond ? '' : ` -> ${JSON.stringify(detail)}`}`);
}

// Load a fresh module instance (re-reads the CSV files from disk).
function reload() {
  delete require.cache[STORE];
  return require('../src/store');
}

// 1. Tricky values survive a real flush + reload.
{
  const store = reload();
  const u = store.createUser({ email: 'Tricky@Example.com', passwordHash: 'h', salt: 's', verifyToken: 'tok', verifyExpires: 123 });
  const t1 = store.createTask({ title: 'line1\nline2', userId: null, createdBy: u.id });
  const t2 = store.createTask({ title: 'a,b "quoted" c', userId: null, createdBy: u.id });
  store.flushSync();

  const store2 = reload();
  ok('email normalized on load', store2.getUserByEmail('tricky@example.com') !== null);
  ok('newline inside a value kept', store2.findTaskById(t1.id).title === 'line1\nline2', store2.findTaskById(t1.id));
  ok('comma + quotes kept', store2.findTaskById(t2.id).title === 'a,b "quoted" c', store2.findTaskById(t2.id));
  ok('still one row per task', store2.listTasks().length === 2, store2.listTasks().length);
}

// 2. A 3-byte UTF-8 char straddling the 1 MiB chunk boundary must survive.
{
  const header = 'id,title,done,user_id,created_by,created_at\n';
  const K = 1048575 - Buffer.byteLength(header) - Buffer.byteLength('1,'); // put "ệ"'s first byte at offset 1048575
  const title = 'a'.repeat(K) + 'ệ' + 'tail';
  fs.writeFileSync(storePath(), header + `1,${title},0,,,\n`);

  const store3 = reload();
  const got = store3.findTaskById(1).title;
  ok('multibyte char across 1 MiB boundary kept', got === title, { len: got && got.length, expected: title.length });
}

fs.rmSync(DIR, { recursive: true, force: true });
console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
