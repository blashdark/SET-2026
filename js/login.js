const API = 'https://dummyjson.com';
const logEl = document.getElementById('log');
let accessToken = '';
let refreshToken = '';

function log(title, data) {
  logEl.textContent += `=== ${title} ===\n${JSON.stringify(data, null, 2)}\n\n`;
}

async function callApi(title, url, options) {
  try {
    const res = await fetch(url, options);
    const data = await res.json();
    log(`${title} (HTTP ${res.status})`, data);
    return { res, data };
  } catch (err) {
    log(title + ' ERROR', { message: err.message });
    return null;
  }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const { data } = await callApi('POST /auth/login', `${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, expiresInMins: 30 })
  });
  if (data && data.accessToken) {
    accessToken = data.accessToken;
    refreshToken = data.refreshToken;
    log('Tokens saved', { accessToken, refreshToken });
  }
});

document.getElementById('btnMe').addEventListener('click', async () => {
  if (!accessToken) { log('GET /auth/me', { error: 'Chưa login' }); return; }
  await callApi('GET /auth/me', `${API}/auth/me`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
});

document.getElementById('btnRefresh').addEventListener('click', async () => {
  if (!refreshToken) { log('POST /auth/refresh', { error: 'Chưa login' }); return; }
  const { data } = await callApi('POST /auth/refresh', `${API}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken, expiresInMins: 30 })
  });
  if (data && data.accessToken) {
    accessToken = data.accessToken;
    refreshToken = data.refreshToken;
    log('Tokens updated', { accessToken, refreshToken });
  }
});

document.getElementById('btnClear').addEventListener('click', () => {
  logEl.textContent = '';
});
