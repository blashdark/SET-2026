'use strict';

// Measure the FULL HTTP round-trip latency of POST /sign-up (the real thing the
// frontend feels), not just the inner hash/insert. Also reports a cheap
// baseline endpoint so you can see the network/HTTP floor.
//
// Usage: node scripts/bench-api.js [iterations]     (default 300)

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 4399;
const BASE = `http://127.0.0.1:${PORT}`;
const N = Number(process.argv[2] || 300);
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-api-'));

function waitForServer() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const tick = async () => {
      try { await fetch(BASE + '/me'); resolve(); }
      catch { if (Date.now() > deadline) return reject(new Error('server did not start')); setTimeout(tick, 50); }
    };
    tick();
  });
}

function stats(label, times) {
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const p = (q) => times[Math.min(times.length - 1, Math.floor(times.length * q))];
  console.log(`${label.padEnd(26)} avg ${avg.toFixed(3)} ms | p50 ${p(0.5).toFixed(3)} | p95 ${p(0.95).toFixed(3)} | max ${times[times.length - 1].toFixed(3)}`);
}

async function timeCall(fn) {
  const t0 = process.hrtime.bigint();
  const res = await fn();
  await res.text(); // include reading the response body
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

async function main() {
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR,
      JWT_SECRET: 'bench-secret',
      SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '' // dev mode: no real SMTP
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stderr.on('data', (c) => process.stderr.write(c));

  try {
    await waitForServer();

    // baseline: a trivial endpoint (401) -> pure HTTP overhead
    const base = [];
    for (let i = 0; i < N; i += 1) base.push(await timeCall(() => fetch(BASE + '/me')));
    stats('baseline GET /me (401)', base);

    // warm-up
    await timeCall(() => fetch(BASE + '/sign-up', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'warmup@x.com', password: 'Str0ng!pass' })
    }));

    const signups = [];
    for (let i = 0; i < N; i += 1) {
      signups.push(await timeCall(() => fetch(BASE + '/sign-up', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `bench${i}@x.com`, password: 'Str0ng!pass' })
      })));
    }
    stats('POST /sign-up (HTTP)', signups);
  } finally {
    await new Promise((resolve) => { server.once('exit', resolve); server.kill(); });
    fs.rmSync(DATA_DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  // Background scrypt tasks can keep the loop alive; exit explicitly once done.
  .finally(() => process.exit());
