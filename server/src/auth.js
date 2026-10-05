'use strict';

const crypto = require('crypto');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ACCESS_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL || 3600);

// random salt each time -> same password yields different hashes
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) { // crypto.randomBytes: 16 random bytes -> hex salt
  const hash = crypto.scryptSync(password, salt, 64).toString('hex'); // crypto.scryptSync: derive a 64-byte key from password + salt
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const actual = Buffer.from(crypto.scryptSync(password, salt, 64).toString('hex'), 'hex'); // Buffer.from(hex): decode hex back to raw bytes
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length) return false; // timingSafeEqual throws on length mismatch
  return crypto.timingSafeEqual(actual, expected); // constant-time compare, resists timing attacks
}

// Access token format 'payload.signature': payload is base64url-encoded JSON { sub, exp },
// signature is HMAC-SHA256 over the payload -> no external JWT library needed.
function signToken(userId, ttlSeconds = ACCESS_TTL_SECONDS) {
  const payload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds // Date.now() is ms -> Unix seconds
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url'); // Buffer: encode JSON as base64url
  const signature = crypto.createHmac('sha256', SECRET).update(body).digest('base64url'); // crypto.createHmac: HMAC-SHA256 signature over the payload
  return `${body}.${signature}`;
}

function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;

  const [body, signature] = token.split('.');
  const expected = Buffer.from(crypto.createHmac('sha256', SECRET).update(body).digest('base64url')); // recompute the expected signature
  const actual = Buffer.from(signature || '');
  // signature mismatch -> token was tampered with
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); // decode base64url back to JSON
  } catch {
    return null;
  }

  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null; // expired
  if (payload.sub === undefined) return null; // missing subject
  return payload;
}

module.exports = {
  ACCESS_TTL_SECONDS,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken
};
