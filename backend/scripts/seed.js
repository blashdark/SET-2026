'use strict';

// Seed N fake, already-active users as CSV rows (snapshot: one line per user).
// Hashing 1M passwords with scrypt would take hours, so seeded rows carry a
// placeholder hash (they are for data volume / benchmarks, not for login).
//
// Usage: node scripts/seed.js [count]      (default 1000000)

const fs = require('fs');
const path = require('path');
const store = require('../src/store');

const { USERS_FILE, USERS_HEADER, escapeValue } = store;
const COUNT = Number(process.argv[2] || 1000000);

fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
const out = fs.createWriteStream(USERS_FILE); // truncates existing file

const startedAt = Date.now();
const now = new Date().toISOString();

// id,email,password_hash,salt,status,verify_token,verify_expires,created_at
function line(id) {
  return [ 
    id, `user${id - 1}@example.com`, 'seeded-no-login', 'seeded', 'active', '', '', now
  ].map(escapeValue).join(',') + '\n';
}

out.write(USERS_HEADER.join(',') + '\n');

let i = 0;
function writeMore() {
  while (i < COUNT) {
    const ok = out.write(line(i + 1));
    i += 1;
    if (!ok) { out.once('drain', writeMore); return; } // backpressure
  }
  out.end(() => {
    const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`Seed xong ${COUNT.toLocaleString()} user trong ${secs}s -> ${USERS_FILE}`);
  });
}

writeMore();
