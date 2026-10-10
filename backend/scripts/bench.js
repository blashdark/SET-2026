'use strict';

// Measure where sign-up time goes with the CSV engine: the unique check is a
// Map lookup (must stay tiny); scrypt is deferred to the background.
//
// Usage: node scripts/bench.js [iterations]     (default 1000)

const fs = require('fs');
const os = require('os');
const path = require('path');

// Use a throwaway data dir so the bench never touches real data.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-store-'));

const store = require('../src/store');
const auth = require('../src/auth');

const N = Number(process.argv[2] || 1000);

function bench(label, fn) {
  fn(0); // warm-up
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i += 1) fn(i);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`${label.padEnd(32)} ${(ms / N).toFixed(4)} ms/op   (${ms.toFixed(1)} ms cho ${N})`);
}

console.log(`Node ${process.version} | ${N} iterations\n`);

bench('1. hash only (scrypt)', () => auth.hashPassword('Str0ng!pass'));
bench('2. unique check (getUserByEmail)', (i) => store.getUserByEmail(`bench${i}@example.com`));
bench('3. createUser (index + 1 row write)', (i) => store.createUser({
  email: `bench${i}@example.com`, passwordHash: 'h', salt: 's'
}));

store.flush();
store.close();
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });

console.log('\nGhi chú: register giữ ĐỒNG BỘ mục 1-3 (validate + unique + 1 dòng).');
console.log('scrypt (dòng 1) chạy nền, không nằm trên request path.');
