'use strict';

const crypto = require('crypto');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL || 3600);

// Hash a password with a random salt using scrypt.
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

// Check a plain password against the stored salt + hash.
function checkPassword(password, salt, hash) {
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  return actual === hash;
}

// Build an access token: "base64(payload).signature".
function createToken(userId) {
  const payload = { sub: userId, exp: Date.now() + TTL_SECONDS * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + signature;
}

// Return the user id inside a valid token, or null.
function readToken(token) {
  if (!token || !token.includes('.')) return null;

  const [body, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (signature !== expected) return null;

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (payload.exp < Date.now()) return null;
  return payload.sub;
}

module.exports = { TTL_SECONDS, hashPassword, checkPassword, createToken, readToken };
