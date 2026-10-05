'use strict';

const store = require('../store');
const auth = require('../auth');
const { sendJson, sendError } = require('../http');

// sign-up: no token returned; the client calls /login separately
async function signUp(ctx) {
  const { res, body } = ctx;
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!username || !password) return sendError(res, 400, 'username and password are required');
  if (username.length < 3) return sendError(res, 400, 'username must be at least 3 characters');
  if (password.length < 6) return sendError(res, 400, 'password must be at least 6 characters');
  if (store.users.byUsername(username)) return sendError(res, 409, 'username already exists');

  const { salt, hash } = auth.hashPassword(password);
  const user = store.users.create({ username, passwordHash: hash, salt });
  return sendJson(res, 201, store.publicUser(user));
}

async function login(ctx) {
  const { res, body } = ctx;
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!username || !password) return sendError(res, 400, 'username and password are required');

  const user = store.users.byUsername(username);
  // merge wrong user/pass into one error -> don't reveal whether a username exists
  if (!user || !auth.verifyPassword(password, user.salt, user.password_hash)) {
    return sendError(res, 401, 'Invalid username or password');
  }

  const accessToken = auth.signToken(user.id);
  return sendJson(res, 200, {
    accessToken,
    tokenType: 'Bearer',
    expiresIn: auth.ACCESS_TTL_SECONDS
  });
}

function register(router) {
  router.post('/sign-up', signUp, { public: true });
  router.post('/login', login, { public: true });
}

module.exports = { register };
