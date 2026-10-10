'use strict';

const crypto = require('crypto'); // node:crypto built-in: hashing + HMAC

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL || 3600);

// scrypt cost: N is the CPU/memory work factor. Lower N = faster sign-up but
// weaker brute-force resistance. Tunable so the performance target can be met.
const SCRYPT_N = Number(process.env.SCRYPT_N || 16384);
const SCRYPT_OPTS = { N: SCRYPT_N, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

// Hash a password with a random salt using scrypt.
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex'); // crypto.randomBytes: 16 random bytes -> hex string
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT_OPTS).toString('hex'); // scryptSync: derive a 64-byte key, as hex
  return { salt, hash };
}

// Check a plain password against the stored salt + hash.
function checkPassword(password, salt, hash) {
  const actual = crypto.scryptSync(password, salt, 64, SCRYPT_OPTS).toString('hex'); // re-derive with the stored salt
  return actual === hash;
}

// Async variant: runs scrypt on the libuv threadpool instead of blocking the
// event loop. Used to move the KDF cost off the sign-up request path.
function hashPasswordAsync(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, SCRYPT_OPTS, (err, key) => {
      if (err) return reject(err);
      resolve({ salt, hash: key.toString('hex') });
    });
  });
}

// Random opaque token for email verification links.
function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Build an access token: "base64url(payload).signature".
function createToken(userId) {
  const payload = { sub: userId, exp: Date.now() + TTL_SECONDS * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url'); // Buffer: encode JSON as base64url text
  const signature = crypto.createHmac('sha256', SECRET).update(body).digest('base64url'); // createHmac: HMAC-SHA256 over the body
  return body + '.' + signature;
}

// Return the user id inside a valid token, or null.
function readToken(token) {
  if (!token || !token.includes('.')) return null; // must look like "body.signature"

  const [body, signature] = token.split('.'); // split into the two parts
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url'); // recompute the signature
  if (signature !== expected) return null; // mismatch -> token was tampered with

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString()); // decode base64url back to JSON
  if (payload.exp < Date.now()) return null; // expired
  return payload.sub;
}

module.exports = { TTL_SECONDS, SCRYPT_N, hashPassword, hashPasswordAsync, checkPassword, randomToken, createToken, readToken };
