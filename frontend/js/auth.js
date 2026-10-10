'use strict';

// Frontend is opened from disk; the API always runs at :3000.
const API_BASE = 'http://localhost:3000';

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

// modes: 'login' | 'signup'
let mode = 'login';

// Already logged in? go straight to the app.
if (localStorage.getItem('accessToken')) location.replace('index.html');

function setMode(next) {
  mode = next;
  const isLogin = mode === 'login';
  // The ACTIVE tab is the submit button; the other tab only switches mode.
  tabLogin.type = isLogin ? 'submit' : 'button';
  tabSignup.type = isLogin ? 'button' : 'submit';
  tabLogin.classList.toggle('active', isLogin);
  tabSignup.classList.toggle('active', !isLogin);
  tabLogin.setAttribute('aria-pressed', String(isLogin));
  tabSignup.setAttribute('aria-pressed', String(!isLogin));
  tabLogin.textContent = 'Đăng nhập';
  tabSignup.textContent = 'Đăng ký';
  tabLogin.disabled = false;
  tabSignup.disabled = false;
  subtitle.textContent = isLogin
    ? 'Đăng nhập để quản lý công việc của bạn'
    : 'Tạo tài khoản mới để bắt đầu';
  passwordInput.autocomplete = isLogin ? 'current-password' : 'new-password';
  policy.classList.toggle('open', !isLogin);
  clearErrors();
  hideMessage();
}

function markInvalid(input, errorEl, msg) {
  errorEl.textContent = msg;
  input.classList.add('invalid');
  input.setAttribute('aria-invalid', 'true');
}

function clearErrors() {
  emailError.textContent = '';
  passwordError.textContent = '';
  emailInput.classList.remove('invalid');
  passwordInput.classList.remove('invalid');
  emailInput.removeAttribute('aria-invalid');
  passwordInput.removeAttribute('aria-invalid');
}

function showMessage(text, type, link) {
  message.className = 'message ' + type;
  message.innerHTML = '';
  message.append(text);
  if (link) {
    const a = document.createElement('a');
    a.href = link;
    a.textContent = ' Mở link xác thực';
    message.append(a);
  }
}

function hideMessage() {
  message.className = 'message';
  message.textContent = '';
}

// Switching tabs must NOT submit the form: preventDefault stops the default action
// even though setMode() flips the clicked button to type=submit.
tabLogin.addEventListener('click', (event) => { if (mode !== 'login') { event.preventDefault(); setMode('login'); } });
tabSignup.addEventListener('click', (event) => { if (mode !== 'signup') { event.preventDefault(); setMode('signup'); } });

// Client-side validation mirrors the server rules.
function validate() {
  let ok = true;
  clearErrors();

  const email = emailInput.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    markInvalid(emailInput, emailError, 'Email không hợp lệ');
    ok = false;
  }

  const pw = passwordInput.value;
  if (mode === 'signup') {
    if (pw.length < 8) { markInvalid(passwordInput, passwordError, 'Mật khẩu phải có ít nhất 8 ký tự'); ok = false; }
    else if (!/[A-Z]/.test(pw)) { markInvalid(passwordInput, passwordError, 'Mật khẩu phải có ít nhất một chữ hoa'); ok = false; }
    else if (!/[a-z]/.test(pw)) { markInvalid(passwordInput, passwordError, 'Mật khẩu phải có ít nhất một chữ thường'); ok = false; }
    else if (!/[^A-Za-z0-9]/.test(pw)) { markInvalid(passwordInput, passwordError, 'Mật khẩu phải có ít nhất một ký tự đặc biệt'); ok = false; }
  } else if (!pw) {
    markInvalid(passwordInput, passwordError, 'Vui lòng nhập mật khẩu');
    ok = false;
  }

  return ok;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage();
  if (!validate()) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const endpoint = mode === 'login' ? '/login' : '/sign-up';

  const btn = mode === 'login' ? tabLogin : tabSignup;
  const idleLabel = mode === 'login' ? 'Đăng nhập' : 'Đăng ký';
  btn.disabled = true;
  btn.textContent = mode === 'login' ? 'Đang đăng nhập...' : 'Đang đăng ký...';

  try {
    const res = await fetch(API_BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showMessage(data.error || 'Có lỗi xảy ra, thử lại sau.', 'error');
      return;
    }

    if (mode === 'login') {
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('userEmail', email);
      location.href = 'index.html';
    } else {
      // dev: server returns verifyUrl when SMTP is not configured
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

setMode('login');
