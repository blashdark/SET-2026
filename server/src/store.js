'use strict';

const fs = require('fs');
const path = require('path');
const csv = require('./csv');

// allow overriding the data dir via env (for isolated tests)
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR) // path.resolve: make the env path absolute
  : path.join(__dirname, '..', 'data'); // path.join: build a path relative to this file
const USERS_FILE = path.join(DATA_DIR, 'users.csv');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.csv');

const USER_COLUMNS = ['id', 'username', 'password_hash', 'salt', 'created_at'];
const TASK_COLUMNS = ['id', 'title', 'description', 'user_id', 'created_at'];

function ensureFile(file, columns) {
  fs.mkdirSync(DATA_DIR, { recursive: true }); // fs.mkdirSync recursive: create the dir and its parents
  if (!fs.existsSync(file)) { // fs.existsSync: check the file is present
    fs.writeFileSync(file, columns.join(',') + '\n', 'utf8'); // write the header row
  }
}

function readRecords(file, columns) {
  ensureFile(file, columns);
  const rows = csv.parse(fs.readFileSync(file, 'utf8')); // fs.readFileSync: read the whole file as utf8
  const body = rows.length > 0 ? rows.slice(1) : []; // drop the header row
  return body
    .filter((row) => row.some((cell) => cell !== '')) // drop empty rows
    .map((row) => {
      const record = {};
      columns.forEach((column, index) => {
        record[column] = row[index] !== undefined ? row[index] : '';
      });
      return record;
    });
}

// rewrite the whole file (header + records)
function writeRecords(file, columns, records) {
  const rows = [columns, ...records.map((record) => columns.map((column) => record[column] ?? ''))];
  fs.writeFileSync(file, csv.stringify(rows), 'utf8'); // fs.writeFileSync: overwrite the file
}

function nextId(records) {
  return records.reduce((max, record) => Math.max(max, Number(record.id) || 0), 0) + 1; // id = current max + 1
}

function readUsers() {
  return readRecords(USERS_FILE, USER_COLUMNS).map((record) => ({
    id: Number(record.id),
    username: record.username,
    password_hash: record.password_hash,
    salt: record.salt,
    created_at: record.created_at
  }));
}

function readTasks() {
  return readRecords(TASKS_FILE, TASK_COLUMNS).map((record) => ({
    id: Number(record.id),
    title: record.title,
    description: record.description,
    user_id: record.user_id === '' ? null : Number(record.user_id), // '' -> null (not assigned)
    created_at: record.created_at
  }));
}

// hide password_hash and salt before exposing
function publicUser(user) {
  return { id: user.id, username: user.username, created_at: user.created_at };
}

const users = {
  all: readUsers,
  byId: (id) => readUsers().find((user) => user.id === Number(id)) || null,
  byUsername: (username) => readUsers().find((user) => user.username === username) || null,
  create({ username, passwordHash, salt }) {
    const list = readUsers();
    const user = {
      id: nextId(list),
      username,
      password_hash: passwordHash,
      salt,
      created_at: new Date().toISOString() // new Date().toISOString(): ISO-8601 timestamp
    };
    list.push(user);
    writeRecords(USERS_FILE, USER_COLUMNS, list);
    return user;
  },
  remove(id) {
    const list = readUsers();
    const remaining = list.filter((user) => user.id !== Number(id));
    if (remaining.length === list.length) return false; // id not found -> don't write the file
    writeRecords(USERS_FILE, USER_COLUMNS, remaining);
    return true;
  }
};

const tasks = {
  byUser: (userId) => readTasks().filter((task) => task.user_id === Number(userId)),
  byId: (id) => readTasks().find((task) => task.id === Number(id)) || null,
  countByUser: (userId) => readTasks().filter((task) => task.user_id === Number(userId)).length,
  create({ title, description, userId }) {
    const list = readTasks();
    const task = {
      id: nextId(list),
      title,
      description: description ?? '',
      user_id: Number(userId),
      created_at: new Date().toISOString() // new Date().toISOString(): ISO-8601 timestamp
    };
    list.push(task);
    writeRecords(TASKS_FILE, TASK_COLUMNS, list);
    return task;
  },
  assign(taskId, userId) {
    const list = readTasks();
    const task = list.find((item) => item.id === Number(taskId));
    if (!task) return null;
    task.user_id = Number(userId);
    writeRecords(TASKS_FILE, TASK_COLUMNS, list);
    return task;
  },
  remove(id) {
    const list = readTasks();
    const remaining = list.filter((task) => task.id !== Number(id));
    if (remaining.length === list.length) return false; // id not found -> don't write the file
    writeRecords(TASKS_FILE, TASK_COLUMNS, remaining);
    return true;
  }
};

module.exports = { users, tasks, publicUser };
