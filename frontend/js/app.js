'use strict';

// Frontend is opened from disk; the API always runs at :3000.
const API_BASE = 'http://localhost:3000';
let token = localStorage.getItem('accessToken');
if (!token) location.replace('login.html');

// Users are loaded lazily (scroll to load more) to fill the user pickers
// (task assign dropdown + edit form) and owner labels. No user panel on this page.
const USERS_PAGE = 50;
let users = [];        // users loaded so far (shared across pickers)
let usersTotal = 0;    // total reported by the server
let usersLoading = false;
let tasks = [];
let editingTaskId = null;
let editOwnerId = null;

const $ = (id) => document.getElementById(id);

function logout() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('userEmail');
  location.replace('login.html');
}

let toastTimer = null;
function toast(text, isError) {
  const el = $('toast');
  el.textContent = text;
  el.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 2500);
}

async function api(method, path, body) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if (res.status === 401) { logout(); return null; }
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  return { ok: res.ok, status: res.status, data };
}

const emailOf = (id) => (users.find((u) => u.id === id) || {}).email || '';

// ---------- icons (inline SVG, currentColor) ----------
const ICONS = {
  person: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 19a6.5 6.5 0 0 1 13 0"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L18.5 9.5a2.83 2.83 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};

function iconSvg(name) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.innerHTML = ICONS[name]; // static markup only
  return span;
}

// ---------- users (paged, for the pickers) ----------

// Append one page of users at the given offset. Returns true on success.
async function loadUsersPage(offset) {
  const res = await api('GET', `/users?limit=${USERS_PAGE}&offset=${offset}`);
  if (!res || !res.ok) return false;
  const items = (res.data && res.data.items) || [];
  usersTotal = (res.data && res.data.total) || users.length + items.length;
  users = users.concat(items);
  return true;
}

// Initial load: reset and fetch the first page.
async function loadUsers() {
  users = [];
  usersTotal = 0;
  await loadUsersPage(0);
  renderTasks();
}

// Make sure a single user (e.g. the current assignee, which may not be on the
// first page) is in the shared list so labels/menus can show its email.
async function ensureUser(id) {
  if (id == null || users.some((u) => u.id === id)) return;
  const res = await api('GET', '/user/' + id);
  if (res && res.ok && res.data) users = [res.data, ...users];
}

// ---------- user picker (shared by task list + edit form) ----------
let openMenu = null;

function closeMenu() {
  if (!openMenu) return;
  openMenu.menu.hidden = true;
  openMenu.btn.setAttribute('aria-expanded', 'false');
  openMenu = null;
}

function toggleMenu(menu, btn) {
  const wasOpen = openMenu && openMenu.menu === menu;
  closeMenu();
  if (wasOpen) return;
  menu.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  openMenu = { menu, btn };
}

document.addEventListener('click', closeMenu);
window.addEventListener('resize', closeMenu);

function menuItem(text, active, disabled) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'assign-item' + (active ? ' active' : '');
  b.textContent = text;
  if (disabled) b.disabled = true;
  return b;
}

function renderUserItems(menu) {
  const opts = menu._opts;
  for (let i = menu._rendered; i < users.length; i++) {
    const u = users[i];
    const b = menuItem(u.email, u.id === opts.selectedId);
    b.addEventListener('click', (e) => { e.stopPropagation(); pick(menu, u.id); });
    menu.insertBefore(b, menu._status);
  }
  menu._rendered = users.length;
}

function updateMenuStatus(menu) {
  const s = menu._status;
  if (usersLoading) { s.textContent = 'Đang tải...'; return; }
  if (!usersTotal) { s.textContent = 'Chưa có người dùng'; return; }
  if (users.length >= usersTotal) { s.textContent = '— hết —'; return; }
  s.textContent = 'Cuộn để tải thêm';
}

async function loadMoreUsers(menu) {
  if (usersLoading || users.length >= usersTotal) return;
  usersLoading = true;
  updateMenuStatus(menu);
  const ok = await loadUsersPage(users.length);
  usersLoading = false;
  if (ok) renderUserItems(menu);
  updateMenuStatus(menu);
}

// Build a scroll-to-load user menu. opts: { selectedId, allowNone, heading, onPick }.
function buildUserMenu(menu, opts) {
  closeMenu();
  menu.textContent = '';
  menu._opts = opts;
  menu._rendered = 0;

  const head = document.createElement('div');
  head.className = 'assign-menu-head';
  head.textContent = opts.heading || 'Gán cho';
  menu.append(head);

  if (opts.allowNone) {
    const b = menuItem('Bỏ gán', opts.selectedId == null);
    b.addEventListener('click', (e) => { e.stopPropagation(); pick(menu, null); });
    menu.append(b);
  }

  const status = document.createElement('div');
  status.className = 'assign-menu-status';
  menu.append(status);
  menu._status = status;

  renderUserItems(menu);
  updateMenuStatus(menu);

  menu.addEventListener('scroll', () => {
    if (menu.scrollTop + menu.clientHeight >= menu.scrollHeight - 32) loadMoreUsers(menu);
  });
}

function pick(menu, id) {
  const opts = menu._opts;
  closeMenu();
  if (opts && opts.onPick) opts.onPick(id);
}

// ---------- tasks ----------

async function loadTasks() {
  const res = await api('GET', '/tasks');
  if (!res) return;
  tasks = res.data || [];
  renderTasks();
}

function renderTasks() {
  const list = $('task-list');
  list.textContent = '';
  if (!tasks.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Chưa có công việc nào. Thêm ở trên.';
    list.append(li);
    return;
  }

  for (const task of tasks) {
    const li = document.createElement('li');
    li.className = 'task' + (task.done ? ' done' : '');

    // checkbox at the start -> toggle done
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'task-check';
    cb.checked = task.done;
    cb.setAttribute('aria-label', 'Đánh dấu hoàn thành: ' + task.title);
    cb.addEventListener('change', () => toggleDone(task.id, cb.checked));
    li.append(cb);

    // task name
    const name = document.createElement('span');
    name.className = 'task-name';
    name.textContent = task.title;
    li.append(name);

    // who it is assigned to
    const owner = document.createElement('span');
    owner.className = 'task-owner' + (task.user_id ? '' : ' unassigned');
    owner.textContent = task.user_id ? (emailOf(task.user_id) || '#' + task.user_id) : 'Chưa gán';
    li.append(owner);

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    // assign (person icon) -> dropdown of users (scroll to load more)
    const wrap = document.createElement('div');
    wrap.className = 'assign-wrap';
    const assignBtn = document.createElement('button');
    assignBtn.type = 'button';
    assignBtn.className = 'icon-btn';
    assignBtn.title = 'Gán người phụ trách';
    assignBtn.setAttribute('aria-label', 'Gán người phụ trách cho: ' + task.title);
    assignBtn.setAttribute('aria-haspopup', 'true');
    assignBtn.setAttribute('aria-expanded', 'false');
    assignBtn.append(iconSvg('person'));

    const menu = document.createElement('div');
    menu.className = 'assign-menu';
    menu.hidden = true;
    buildUserMenu(menu, {
      heading: 'Gán cho',
      selectedId: task.user_id,
      allowNone: !!task.user_id,
      onPick: (uid) => { if (uid == null) unassignTask(task.id); else assignTask(task.id, uid); }
    });

    assignBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(menu, assignBtn); });
    wrap.append(assignBtn, menu);
    actions.append(wrap);

    // edit (pencil icon) -> edit form
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'icon-btn';
    editBtn.title = 'Sửa';
    editBtn.setAttribute('aria-label', 'Sửa công việc: ' + task.title);
    editBtn.append(iconSvg('pencil'));
    editBtn.addEventListener('click', () => openEdit(task.id));
    actions.append(editBtn);

    // delete (x icon)
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'icon-btn danger';
    delBtn.title = 'Xóa';
    delBtn.setAttribute('aria-label', 'Xóa công việc: ' + task.title);
    delBtn.append(iconSvg('x'));
    delBtn.addEventListener('click', () => deleteTask(task.id));
    actions.append(delBtn);

    li.append(actions);
    list.append(li);
  }
}

async function addTask() {
  const title = $('new-title').value.trim();
  if (!title) { toast('Nhập tên công việc trước', true); return; }

  const res = await api('POST', '/task', { title });
  if (!res) return;
  if (!res.ok) { toast(res.data.error || 'Không thêm được công việc', true); return; }
  $('new-title').value = '';
  await loadTasks();
}

async function toggleDone(id, done) {
  const res = await api('PATCH', '/task/' + id, { done });
  if (res && res.ok) await loadTasks();
}

async function deleteTask(id) {
  if (!confirm('Xóa công việc này?')) return;
  closeMenu();
  const res = await api('DELETE', '/task/' + id);
  if (!res) return;
  if (!res.ok && res.status !== 204) { toast(res.data.error || 'Không xóa được', true); return; }
  await loadTasks();
}

async function assignTask(id, userId) {
  if (!userId) return;
  closeMenu();
  const res = await api('PATCH', '/assign-task/' + id, { user_id: userId });
  if (!res) return;
  if (!res.ok) { toast(res.data.error || 'Không gán được', true); return; }
  toast('Đã gán cho ' + (emailOf(userId) || '#' + userId));
  await loadTasks();
}

async function unassignTask(id) {
  closeMenu();
  const res = await api('PATCH', '/task/' + id, { user_id: null });
  if (!res) return;
  if (!res.ok) { toast(res.data.error || 'Không bỏ gán được', true); return; }
  await loadTasks();
}

// ---------- edit form (modal) ----------

function updateOwnerLabel() {
  const label = $('edit-owner-label');
  label.textContent = editOwnerId == null ? 'Chưa gán' : (emailOf(editOwnerId) || '#' + editOwnerId);
  label.classList.toggle('muted', editOwnerId == null);
}

function openEdit(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  editingTaskId = id;
  $('edit-title').value = task.title;

  editOwnerId = task.user_id == null ? null : task.user_id;
  updateOwnerLabel();
  buildUserMenu($('edit-owner-menu'), {
    heading: 'Gán cho',
    selectedId: editOwnerId,
    allowNone: true,
    onPick: (uid) => { editOwnerId = uid; updateOwnerLabel(); }
  });

  // The assignee may not be among the loaded users -> fetch it so the label shows.
  if (editOwnerId != null && !users.some((u) => u.id === editOwnerId)) {
    ensureUser(editOwnerId).then(updateOwnerLabel);
  }

  const modal = $('edit-modal');
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => modal.classList.add('open'));
  $('edit-title').focus();
  $('edit-title').select();
}

function closeEdit() {
  const modal = $('edit-modal');
  if (modal.hidden) return;
  closeMenu();
  editingTaskId = null;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  setTimeout(() => { if (!modal.classList.contains('open')) modal.hidden = true; }, 200);
}

async function saveTask() {
  const id = editingTaskId;
  if (!id) return;
  const title = $('edit-title').value.trim();
  if (!title) { toast('Tên công việc không được rỗng', true); return; }
  const res = await api('PATCH', '/task/' + id, { title, user_id: editOwnerId });
  if (!res) return;
  if (!res.ok) { toast(res.data.error || 'Không lưu được', true); return; }
  closeEdit();
  await loadTasks();
}

// ---------- wire up ----------

$('add-btn').addEventListener('click', addTask);
$('new-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTask(); });
$('logout').addEventListener('click', logout);

$('edit-save').addEventListener('click', saveTask);
$('edit-cancel').addEventListener('click', closeEdit);
$('edit-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveTask(); });
$('edit-owner-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu($('edit-owner-menu'), $('edit-owner-btn')); });
document.querySelector('#edit-modal .modal-backdrop').addEventListener('click', closeEdit);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); closeEdit(); } });

(async function init() {
  const me = await api('GET', '/me');
  if (!me) return;
  if (!me.ok) { logout(); return; }
  $('me').textContent = me.data.email;
  localStorage.setItem('userEmail', me.data.email);
  await loadUsers();
  await loadTasks();
})();
