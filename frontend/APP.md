# Hướng dẫn đọc `js/app.js`

Tài liệu này giải thích `app.js` — script của trang quản lý công việc
(`html/index.html`). Trang gồm: danh sách task, form thêm task, modal sửa task, và
dropdown chọn người dùng dùng chung.

## 1. Bối cảnh & chốt đăng nhập (dòng 1–6)

```js
const API_BASE = 'http://localhost:3000';
let token = localStorage.getItem('accessToken');
if (!token) location.replace('login.html');
```

Không có token thì đá về trang login ngay. `token` giữ để gắn vào mỗi request.

## 2. State toàn cục (dòng 8–19)

```js
const USERS_PAGE = 50;
let users = [];        // user đã tải (dùng chung cho mọi picker)
let usersTotal = 0;    // tổng user server báo
let usersLoading = false;
let tasks = [];
let editingTaskId = null;
let editOwnerId = null;
let currentUserId = null; // id người đang đăng nhập (từ GET /me)
const $ = (id) => document.getElementById(id);
```

- `users` tải **lazy theo trang** (cuộn để tải thêm), phục vụ các dropdown chọn
  người và nhãn chủ sở hữu — không có panel user riêng trên trang.
- `currentUserId` cần để biết ai là **author** và ai là **assignee** (phân quyền UI).
- `$` là helper viết tắt `document.getElementById`.

## 3. Đăng xuất & toast (dòng 21–34)

```js
function logout() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('userEmail');
  location.replace('login.html');
}
function toast(text, isError) {
  const el = $('toast');
  el.textContent = text;
  el.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 2500);
}
```

`toast` hiện thông báo nhỏ rồi tự ẩn sau 2.5s. `clearTimeout` để thông báo mới thay
thế cái đang chờ (tránh ẩn sớm).

## 4. `api()` — lớp gọi HTTP (dòng 36–50)

```js
async function api(method, path, body) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(API_BASE + path, {
    method, headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if (res.status === 401) { logout(); return null; }
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  return { ok: res.ok, status: res.status, data };
}
```

Mọi call đi qua đây:
- Tự gắn `Authorization: Bearer`.
- Chỉ gắn `Content-Type` khi có body.
- **401 → logout ngay** (token hết hạn/không hợp lệ).
- Đọc `res.text()` rồi thử `JSON.parse` (an toàn khi body rỗng hoặc là text) →
  trả `{ ok, status, data }`.

```js
const emailOf = (id) => (users.find((u) => u.id === id) || {}).email || '';
```

Tra email từ id **trong danh sách đã tải**; không có thì trả chuỗi rỗng.

## 5. Icon (dòng 54–66)

```js
const ICONS = { person: '<svg .../>', pencil: '<svg .../>', x: '<svg .../>' };
function iconSvg(name) { const span = document.createElement('span'); span.className = 'icon'; span.innerHTML = ICONS[name]; return span; }
```

Icon là **SVG nội tuyến**, dùng `stroke="currentColor"` nên tự ăn màu theo CSS. Tạo
bằng `createElement` + `innerHTML` (markup tĩnh, không phải dữ liệu người dùng).

## 6. Tải user theo trang (dòng 68–94)

```js
async function loadUsersPage(offset) {
  const res = await api('GET', `/users?limit=${USERS_PAGE}&offset=${offset}`);
  if (!res || !res.ok) return false;
  const items = (res.data && res.data.items) || [];
  usersTotal = (res.data && res.data.total) || users.length + items.length;
  users = users.concat(items);
  return true;
}
async function loadUsers() { users = []; usersTotal = 0; await loadUsersPage(0); renderTasks(); }
async function ensureUser(id) {
  if (id == null || users.some((u) => u.id === id)) return;
  const res = await api('GET', '/user/' + id);
  if (res && res.ok && res.data) users = [res.data, ...users];
}
```

- `loadUsersPage`: nạp 1 trang, cộng dồn vào `users`, cập nhật `usersTotal`.
- `loadUsers`: reset rồi nạp trang đầu (dùng khi vào trang / sau login).
- `ensureUser`: đảm bảo một user cụ thể (ví dụ assignee không nằm trong trang đầu)
  có mặt trong `users` để hiển thị nhãn. Chèn lên đầu mảng.

## 7. Dropdown chọn user (dòng 96–191)

Đây là "user picker" dùng chung cho **cả task list lẫn modal sửa**. Điểm cốt lõi:
**chỉ một menu mở tại một thời điểm**.

```js
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
  if (wasOpen) return;      // bấm lại chính nó → đóng
  menu.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  openMenu = { menu, btn };
}
document.addEventListener('click', closeMenu);   // bấm ra ngoài → đóng
window.addEventListener('resize', closeMenu);     // resize → đóng
```

- `openMenu` lưu menu nào đang mở (kèm nút) để đóng đúng chỗ.
- `toggleMenu`: nếu menu đang mở đúng là nó → chỉ đóng; ngược lại đóng cái cũ rồi mở
  cái mới.
- Click bất kỳ đâu (do event bubble) hoặc resize → đóng. Các nút bên trong menu phải
  `stopPropagation` để không bị listener toàn cục đóng mất trước khi xử lý.

```js
function renderUserItems(menu) {   // chỉ vẽ THÊM phần chưa render
  const opts = menu._opts;
  for (let i = menu._rendered; i < users.length; i++) {
    const u = users[i];
    const b = menuItem(u.email, u.id === opts.selectedId);
    b.addEventListener('click', (e) => { e.stopPropagation(); pick(menu, u.id); });
    menu.insertBefore(b, menu._status);   // chèn trước dòng trạng thái
  }
  menu._rendered = users.length;
}
function updateMenuStatus(menu) {   // "Đang tải..." / "Chưa có người dùng" / "— hết —" / "Cuộn để tải thêm"
  ...
}
async function loadMoreUsers(menu) {  // cuộn gần đáy → nạp thêm 1 trang
  if (usersLoading || users.length >= usersTotal) return;
  usersLoading = true; updateMenuStatus(menu);
  const ok = await loadUsersPage(users.length);
  usersLoading = false;
  if (ok) renderUserItems(menu);
  updateMenuStatus(menu);
}
```

- `renderUserItems` tăng dần (chỉ vẽ user mới) nhờ `menu._rendered` — không vẽ lại
  toàn bộ.
- `menu._status` là dòng trạng thái ở cuối; item mới chèn **trước** nó.
- `loadMoreUsers` chống gọi trùng bằng `usersLoading`, và dừng khi đã đủ.

```js
function buildUserMenu(menu, opts) {
  closeMenu();
  menu.textContent = ''; menu._opts = opts; menu._rendered = 0;
  // head (tiêu đề), item "Bỏ gán" nếu allowNone, status, rồi renderUserItems
  menu.addEventListener('scroll', () => {
    if (menu.scrollTop + menu.clientHeight >= menu.scrollHeight - 32) loadMoreUsers(menu);
  });
}
function pick(menu, id) { const opts = menu._opts; closeMenu(); if (opts && opts.onPick) opts.onPick(id); }
```

`buildUserMenu` dựng menu với `opts = { selectedId, allowNone, heading, onPick }`.
Cuộn gần đáy (còn 32px) → tải thêm. `pick` gọi callback `onPick` do người gọi cung
cấp — nhờ vậy cùng một menu phục vụ nhiều ngữ cảnh khác nhau.

## 8. Task: đọc & vẽ (dòng 193–299)

```js
async function loadTasks() {
  const res = await api('GET', '/tasks');
  if (!res) return;
  tasks = res.data || [];
  renderTasks();
}
```

`renderTasks` dựng lại danh sách mỗi lần. Với mỗi task tạo một `<li>`:

```js
const isAuthor = task.created_by === currentUserId;
const isAssignee = task.user_id === currentUserId;
```

Hai cờ này quyết định UI được phép hiện gì (khớp phân quyền server):
- **checkbox** (đầu dòng): chỉ bật nếu `isAuthor || isAssignee` → đổi `done`.
- **task name**: tiêu đề.
- **owner**: email người được giao, hoặc "Chưa gán".
- **assign (icon person)** + **edit (icon bút chì)**: chỉ hiện khi `isAuthor`.
  - assign mở dropdown chọn user (`buildUserMenu`, `onPick` → gán/bỏ gán).
  - edit mở modal sửa (`openEdit`).
- **delete (icon x)**: chỉ hiện khi `canDelete = isAuthor && (task.done || task.user_id === null)`
  — tức tác giả, và task đã xong hoặc chưa gán (khớp luật server).

Các nút bên trong dùng `e.stopPropagation()` để không kích hoạt listener đóng menu
toàn cục.

## 9. Hành động trên task (dòng 301–342)

```js
async function addTask() { /* POST /task { title } */ }
async function toggleDone(id, done) { /* PATCH /task/:id { done } */ }
async function deleteTask(id) { /* confirm() rồi DELETE /task/:id */ }
async function assignTask(id, userId) { /* PATCH /assign-task/:id { user_id } */ }
async function unassignTask(id) { /* PATCH /task/:id { user_id: null } */ }
```

Mẫu chung: gọi API → nếu lỗi thì `toast(...)` → thành công thì `loadTasks()` để vẽ
lại (đơn giản, không cập nhật DOM thủ công). `deleteTask` hỏi xác nhận bằng
`confirm()`; `assignTask` báo "Đã gán cho ..." bằng email tra từ `users`.

## 10. Modal sửa task (dòng 344–400)

```js
function openEdit(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  editingTaskId = id;
  $('edit-title').value = task.title;
  editOwnerId = task.user_id == null ? null : task.user_id;
  updateOwnerLabel();
  buildUserMenu($('edit-owner-menu'), { heading: 'Gán cho', selectedId: editOwnerId, allowNone: true,
    onPick: (uid) => { editOwnerId = uid; updateOwnerLabel(); } });
  if (editOwnerId != null && !users.some((u) => u.id === editOwnerId)) ensureUser(editOwnerId).then(updateOwnerLabel);
  const modal = $('edit-modal');
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => modal.classList.add('open'));   // cho CSS transition chạy
  $('edit-title').focus(); $('edit-title').select();
}
```

- Đổ dữ liệu task vào form; `editOwnerId` là lựa chọn chủ sở hữu **tạm** (chỉ ghi khi
  bấm Lưu).
- `updateOwnerLabel` hiển thị email/"Chưa gán"; `ensureUser` lo trường hợp assignee
  chưa có trong danh sách đã tải.
- `requestAnimationFrame(... add('open'))`: bỏ `hidden` trước rồi mới thêm class
  `open` ở frame sau → CSS transition (opacity/transform) mới chạy được.

```js
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
  ...
  closeEdit();
  await loadTasks();
}
```

- `closeEdit`: gỡ class `open` (CSS chạy animation đóng) rồi `setTimeout 200ms` mới
  `hidden = true`; kiểm tra lại `open` để tránh ẩn nhầm nếu người dùng mở lại nhanh.
- `saveTask` gửi cả `title` lẫn `user_id` (đổi tiêu đề + đổi người phụ trách trong
  cùng một PATCH).

## 11. Gắn sự kiện (dòng 402–413)

```js
$('add-btn').addEventListener('click', addTask);
$('new-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTask(); });
$('logout').addEventListener('click', logout);
$('edit-save').addEventListener('click', saveTask);
$('edit-cancel').addEventListener('click', closeEdit);
$('edit-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveTask(); });
$('edit-owner-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(...); });
document.querySelector('#edit-modal .modal-backdrop').addEventListener('click', closeEdit);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); closeEdit(); } });
```

Enter để thêm/lưu, click backdrop hoặc phím Escape để đóng. `stopPropagation` ở nút
mở menu để không bị listener toàn cục đóng ngay.

## 12. Khởi tạo (dòng 415–424)

```js
(async function init() {
  const me = await api('GET', '/me');
  if (!me) return;             // 401 đã được api() xử lý (logout)
  if (!me.ok) { logout(); return; }
  $('me').textContent = me.data.email;
  currentUserId = me.data.id;
  localStorage.setItem('userEmail', me.data.email);
  await loadUsers();
  await loadTasks();
})();
```

- Lấy danh tính hiện tại (`GET /me`) → điền `currentUserId` (dùng cho phân quyền UI).
- Nạp trang user đầu tiên rồi nạp task. Đây là thứ tự bắt buộc: cần `users` để hiển
  thị email chủ sở hữu, và cần `currentUserId` để tính `isAuthor`/`isAssignee`.

## 13. Tóm gọn

- `api()` là cửa duy nhất ra server; 401 tự logout.
- `users` tải lazy theo trang, dùng chung cho mọi dropdown; `ensureUser` bù user lẻ.
- Dropdown chỉ một cái mở một lúc, cuộn đáy để tải thêm, `onPick` tái sử dụng cho
  nhiều ngữ cảnh.
- UI phân quyền theo `isAuthor`/`isAssignee`/`canDelete`, khớp luật server.
- `renderTasks` vẽ lại toàn bộ sau mỗi thao tác (đơn giản, chấp nhận được ở quy mô này).
