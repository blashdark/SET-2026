'use strict';

const fs = require('fs'); // node:fs built-in: read/write files
const path = require('path'); // node:path built-in: build file paths

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data'); // path.join: data dir beside this file
const USERS_FILE = path.join(DATA_DIR, 'users.csv');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.csv');

const USER_HEADER = ['id', 'username', 'password_hash', 'salt', 'created_at'];
const TASK_HEADER = ['id', 'title', 'description', 'user_id', 'created_at'];

// ---------- CSV helpers ----------

// Wrap a value in quotes if it contains a comma, quote or newline.
function escapeValue(value) {
  const text = String(value ?? '');
  // regex tests for " , or newline; if present, wrap and double every quote
  return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

// Split one CSV line into fields, honoring "quoted" fields.
function splitLine(line) {
  const fields = [];
  let value = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { value += '"'; i += 1; } // "" -> one escaped quote
      else if (ch === '"') quoted = false; // closing quote
      else value += ch; // commas here are part of the field
    } else if (ch === '"') {
      quoted = true; // opening quote
    } else if (ch === ',') {
      fields.push(value); // comma outside quotes ends a field
      value = '';
    } else {
      value += ch;
    }
  }

  fields.push(value); // last field
  return fields;
}

// Read a CSV file into objects (empty array if the file does not exist).
function readRows(file, header) {
  if (!fs.existsSync(file)) return []; // fs.existsSync: missing file -> no rows
  // fs.readFileSync: read whole file, split into lines, drop empty ones
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter((line) => line !== '');
  return lines.slice(1).map((line) => { // slice(1): skip the header line
    const cells = splitLine(line);
    const row = {};
    header.forEach((key, index) => { row[key] = cells[index] ?? ''; }); // map cells to column names
    return row;
  });
}

// Overwrite a CSV file with the given objects (creates the data dir first).
function writeRows(file, header, rows) {
  fs.mkdirSync(DATA_DIR, { recursive: true }); // fs.mkdirSync recursive: create the dir and parents
  const lines = [header.join(','), ...rows.map((row) => header.map((key) => escapeValue(row[key])).join(','))];
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8'); // fs.writeFileSync: overwrite the whole file
}

function nextId(rows) {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1; // current max id + 1
}

// ---------- users ----------

function getUsers() {
  // spread the CSV row, then force id to a number
  return readRows(USERS_FILE, USER_HEADER).map((user) => ({ ...user, id: Number(user.id) }));
}

function findUserById(id) {
  return getUsers().find((user) => user.id === Number(id)) || null;
}

function findUserByUsername(username) {
  return getUsers().find((user) => user.username === username) || null;
}

function createUser(username, passwordHash, salt) {
  const users = getUsers();
  const user = { id: nextId(users), username, password_hash: passwordHash, salt, created_at: new Date().toISOString() };
  users.push(user);
  writeRows(USERS_FILE, USER_HEADER, users); // rewrite users.csv
  return user;
}

function deleteUser(id) {
  const users = getUsers().filter((user) => user.id !== Number(id));
  writeRows(USERS_FILE, USER_HEADER, users);
}

function countUserTasks(userId) {
  return getTasks().filter((task) => task.user_id === Number(userId)).length;
}

// ---------- tasks ----------

function getTasks() {
  return readRows(TASKS_FILE, TASK_HEADER).map((task) => ({
    ...task,
    id: Number(task.id),
    user_id: task.user_id === '' ? null : Number(task.user_id) // empty -> null (not assigned)
  }));
}

function listUserTasks(userId) {
  return getTasks().filter((task) => task.user_id === Number(userId));
}

function findTaskById(id) {
  return getTasks().find((task) => task.id === Number(id)) || null;
}

function createTask(title, description, userId) {
  const tasks = getTasks();
  const task = { id: nextId(tasks), title, description, user_id: Number(userId), created_at: new Date().toISOString() };
  tasks.push(task);
  writeRows(TASKS_FILE, TASK_HEADER, tasks);
  return task;
}

function assignTask(taskId, userId) {
  const tasks = getTasks();
  const task = tasks.find((item) => item.id === Number(taskId));
  task.user_id = Number(userId); // change the owner
  writeRows(TASKS_FILE, TASK_HEADER, tasks);
  return task;
}

function deleteTask(id) {
  const tasks = getTasks().filter((task) => task.id !== Number(id));
  writeRows(TASKS_FILE, TASK_HEADER, tasks);
}

module.exports = {
  findUserById,
  findUserByUsername,
  createUser,
  deleteUser,
  countUserTasks,
  listUserTasks,
  findTaskById,
  createTask,
  assignTask,
  deleteTask
};
