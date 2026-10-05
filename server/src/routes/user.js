'use strict';

const store = require('../store');
const { sendJson, sendError, sendNoContent } = require('../http');

async function me(ctx) {
  return sendJson(ctx.res, 200, store.publicUser(ctx.user));
}

// note: no ownership check on the caller (per the exercise spec)
async function removeUser(ctx) {
  const { res, params } = ctx;
  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) return sendError(res, 400, 'Invalid user id');

  const target = store.users.byId(id);
  if (!target) return sendError(res, 404, 'User not found');

  if (store.tasks.countByUser(id) > 0) {
    return sendError(res, 409, 'User still has tasks and cannot be deleted'); // block deletion while tasks remain
  }

  store.users.remove(id);
  return sendNoContent(res);
}

function register(router) {
  router.get('/me', me);
  router.delete('/user/:id', removeUser);
}

module.exports = { register };
