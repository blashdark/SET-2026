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

  if (!title) return sendError(res, 400, 'title la bat buoc');

  // owner comes from the token, not the client body -> prevents spoofing
  const task = store.tasks.create({ title, description, userId: user.id });
  return sendJson(res, 201, task);
}

async function listTasks(ctx) {
  return sendJson(ctx.res, 200, store.tasks.byUser(ctx.user.id));
}

async function assignTask(ctx) {
  const { res, params, user } = ctx;
  const id = parseId(params.id);

  if (!id) return sendError(res, 400, 'id khong hop le');

  const task = store.tasks.byId(id);
  if (!task) return sendError(res, 404, 'Khong tim thay task');

  const updated = store.tasks.assign(id, user.id);
  return sendJson(res, 200, updated);
}

async function deleteTask(ctx) {
  const { res, params, user } = ctx;
  const id = parseId(params.id);

  if (!id) return sendError(res, 400, 'id khong hop le');

  const task = store.tasks.byId(id);
  if (!task) return sendError(res, 404, 'Khong tim thay task');
  if (task.user_id !== user.id) return sendError(res, 403, 'Ban khong so huu task nay'); // only delete tasks you own

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
