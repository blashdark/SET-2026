# Hướng dẫn đọc `js/auth.js`

Tài liệu này giải thích `auth.js` — script của trang đăng nhập/đăng ký
(`html/login.html`). Trang này là một form duy nhất, chuyển đổi giữa 2 chế độ
**login** và **signup** bằng 2 tab.

## 1. Bối cảnh

Frontend mở trực tiếp từ đĩa (không qua server tĩnh), nên script luôn gọi API tại
`http://localhost:3000`:

```js
const API_BASE = 'http://localhost:3000';
```

Trang chỉ có 1 form; "tab" không phải là tab trình duyệt mà là 2 nút chuyển chế
độ. Điểm đặc biệt (theo yêu cầu layout): **tab đang hoạt động chính là nút submit**.

## 2. Lấy các phần tử DOM (dòng 6–15)

```js
const form = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const emailError = document.getElementById('email-error');
const passwordError = document.getElementById('password-error');
const policy = document.getElementById('password-policy');
const message = document.getElementById('message');
const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const subtitle = document.getElementById('subtitle');
```

Mỗi biến là một phần tử trong `login.html`, giữ sẵn để khỏi tra DOM nhiều lần.

```js
let mode = 'login'; // 'login' | 'signup'
```

Biến trạng thái quyết định form đang ở chế độ nào.

## 3. Chuyển hướng nếu đã đăng nhập (dòng 20–21)

```js
if (localStorage.getItem('accessToken')) location.replace('index.html');
```

Nếu đã có token (đã đăng nhập) thì vào thẳng trang app, không ở lại trang login.
`location.replace` để không giữ lại trang login trong lịch sử.

## 4. `setMode(next)` — trái tim của trang (dòng 23–44)

```js
function setMode(next) {
  mode = next;
  const isLogin = mode === 'login';
  // Tab ĐANG hoạt động là nút submit; tab kia chỉ để chuyển mode.
  tabLogin.type = isLogin ? 'submit' : 'button';
  tabSignup.type = isLogin ? 'button' : 'submit';
  ...
}
```

Ý chính: **đổi `type` của nút**.

- Tab đang hoạt động có `type="submit"` → bấm nó đăng nhập/đăng ký luôn.
- Tab còn lại có `type="button"` → bấm chỉ để chuyển mode, không submit.

Các phần còn lại của `setMode`:

- `classList.toggle('active', ...)`: tô sáng tab đang chọn (CSS lo phần hiển thị).
- `aria-pressed`: cập nhật trạng thái cho trình đọc màn hình (accessibility).
- `textContent`: đặt lại nhãn nút ("Đăng nhập"/"Đăng ký").
- `disabled = false`: bật lại nút (phòng trường hợp đang ở trạng thái loading).
- `subtitle.textContent`: đổi dòng phụ đề theo mode.
- `passwordInput.autocomplete`: `current-password` khi login, `new-password` khi
  signup → trình duyệt/manager gợi ý đúng.
- `policy.classList.toggle('open', !isLogin)`: hiện khối "quy tắc mật khẩu" chỉ khi
  signup.
- `clearErrors()` + `hideMessage()`: dọn lỗi/thông báo cũ khi đổi mode.

## 5. Hiển thị lỗi & thông báo (dòng 46–76)

```js
function markInvalid(input, errorEl, msg) {
  errorEl.textContent = msg;
  input.classList.add('invalid');
  input.setAttribute('aria-invalid', 'true');
}
function clearErrors() { /* xoá text + class invalid + aria-invalid */ }
```

- `markInvalid`: gắn thông báo lỗi cho 1 field + đánh dấu đỏ + `aria-invalid`.
- `clearErrors`: dọn sạch cả email lẫn password.

```js
function showMessage(text, type, link) {
  message.className = 'message ' + type;   // type = 'error' | 'success'
  message.innerHTML = '';
  message.append(text);
  if (link) {                              // chỉ có ở signup dev mode
    const a = document.createElement('a');
    a.href = link;
    a.textContent = ' Mở link xác thực';
    message.append(a);
  }
}
function hideMessage() { message.className = 'message'; message.textContent = ''; }
```

`showMessage` dùng `append(text)` (text thuần, an toàn) và tạo link xác thực bằng
DOM API thay vì nối HTML (tránh XSS). `link` chỉ được truyền khi server trả
`verifyUrl` (SMTP chưa cấu hình).

## 6. Bắt click trên tab (dòng 78–81)

```js
tabLogin.addEventListener('click', (event) => {
  if (mode !== 'login') { event.preventDefault(); setMode('login'); }
});
tabSignup.addEventListener('click', (event) => {
  if (mode !== 'signup') { event.preventDefault(); setMode('signup'); }
});
```

Tình huống cần hiểu: khi đang ở login, nút login có `type="submit"`. Nếu bấm nút
**signup** (đang là `type="button"`) để chuyển mode — không sao. Nhưng nếu bấm lại
chính nút đang submit mà không ngăn mặc định thì form sẽ submit. Nên khi cần **đổi
mode**, ta gọi `event.preventDefault()` để chặn submit mặc định; nếu đã đúng mode
rồi thì để mặc định chạy (tức là submit).

## 7. `validate()` — kiểm tra phía client (dòng 83–106)

```js
function validate() {
  let ok = true;
  clearErrors();
  const email = emailInput.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { markInvalid(...); ok = false; }

  const pw = passwordInput.value;
  if (mode === 'signup') {
    if (pw.length < 8) ...
    else if (!/[A-Z]/.test(pw)) ...      // chữ hoa
    else if (!/[a-z]/.test(pw)) ...      // chữ thường
    else if (!/[^A-Za-z0-9]/.test(pw)) ... // ký tự đặc biệt
  } else if (!pw) { ... }                // login: chỉ cần không rỗng
  return ok;
}
```

Quy tắc ở đây **phản chiếu server** (chính sách mật khẩu), để báo lỗi ngay không
cần gọi mạng. Lưu ý: signup yêu cầu ≥ 8 ký tự, có hoa, thường, ký tự đặc biệt;
login chỉ cần nhập mật khẩu.

## 8. Xử lý submit (dòng 108–150)

```js
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage();
  if (!validate()) return;

  const endpoint = mode === 'login' ? '/login' : '/sign-up';
  const btn = mode === 'login' ? tabLogin : tabSignup;
  btn.disabled = true;
  btn.textContent = mode === 'login' ? 'Đang đăng nhập...' : 'Đang đăng ký...';
```

- `preventDefault`: chặn submit truyền thống (reload trang) — ta tự gọi API.
- Chọn endpoint theo mode, và **nút nào là nút submit hiện tại** thì hiển thị trạng
  thái "Đang ...".

```js
  try {
    const res = await fetch(API_BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) { showMessage(data.error || 'Có lỗi xảy ra, thử lại sau.', 'error'); return; }

    if (mode === 'login') {
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('userEmail', email);
      location.href = 'index.html';
    } else {
      showMessage(data.message || 'Đăng ký thành công. Kiểm tra email để xác thực.', 'success', data.verifyUrl);
      form.reset();
    }
  } catch {
    showMessage('Không kết nối được tới server. Kiểm tra backend đang chạy.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = idleLabel;
  }
});
```

- `res.json().catch(() => ({}))`: server luôn trả JSON, nhưng phòng khi body rỗng
  thì tránh văng lỗi parse.
- **login thành công**: lưu `accessToken` + `userEmail` vào `localStorage`, sang
  `index.html`.
- **signup thành công**: hiện thông báo xác thực, kèm link `verifyUrl` nếu có (dev),
  rồi `form.reset()`.
- `catch`: lỗi mạng (backend chưa chạy) → báo rõ.
- `finally`: **luôn** trả nút về trạng thái bình thường, dù thành công hay thất bại.

## 9. Khởi tạo (dòng 152)

```js
setMode('login');
```

Đặt mặc định là chế độ đăng nhập khi mới mở trang.

## 10. Tóm gọn

- Trang 1 form, 2 tab; **tab đang chọn chính là nút submit** (đổi qua thuộc tính `type`).
- `setMode` điều khiển cả hiển thị, accessibility, autocomplete, subtitle, và dọn lỗi.
- `validate` soi gương luật của server; submit gọi `/login` hoặc `/sign-up`.
- Token lưu ở `localStorage`; lỗi/thông báo hiển thị qua DOM API an toàn.
