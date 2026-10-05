'use strict';

const store = require('../store');
const { sendJson, sendError, sendNoContent } = require('../http');

// normalize :id (a string from the URL) into a positive integer
function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function createTask(ctx) {
  const { res, body, user } = ctx;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description : '';

  if (!title) return sendError(res, 400, 'title is required');

  // owner comes from the token, not the client body -> prevents spoofing
  const task = store.tasks.create({ title, description, userId: user.id });
  return sendJson(res, 201, task);
}

async function listTasks(ctx) {
  return sendJson(ctx.res, 200, store.tasks.byUser(ctx.user.id));
}

async function assignTask(ctx) {
  const { res, params, body } = ctx;
  const id = parseId(params.id);
  if (!id) return sendError(res, 400, 'Invalid task id');

  // target owner comes from the request body (assign to another user)
  const userId = parseId(body.user_id);
  if (!userId) return sendError(res, 400, 'user_id must be a positive integer');

  const task = store.tasks.byId(id);
  if (!task) return sendError(res, 404, 'Task not found');

  if (!store.users.byId(userId)) return sendError(res, 404, 'Target user not found');

  const updated = store.tasks.assign(id, userId);
  return sendJson(res, 200, updated);
}

async function deleteTask(ctx) {
  const { res, params, user } = ctx;
  const id = parseId(params.id);

  if (!id) return sendError(res, 400, 'Invalid task id');

  const task = store.tasks.byId(id);
  if (!task) return sendError(res, 404, 'Task not found');
  if (task.user_id !== user.id) return sendError(res, 403, 'You do not own this task'); // only delete tasks you own

  store.tasks.remove(id);
  return sendNoContent(res);
}

function register(router) {
  router.post('/task', createTask);
  router.get('/tasks', listTasks);
  router.patch('/assign-task/:id', assignTask);
  router.delete('/task/:id', deleteTask);
}

module.exports = { register };
