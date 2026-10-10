# Hướng dẫn đặt breakpoint & debug

Hướng dẫn debug server trong `backend/` (Node.js core). Có 2 tiến trình liên quan:

- `backend/src/index.js` — bản thân server.
- `backend/test/smoke.js` — chạy server dưới dạng **tiến trình con** (`child_process.spawn`).

> Điểm quan trọng: breakpoint trong `index.js` sẽ **không dừng** khi bạn chạy `test/smoke.js` bằng debugger, vì code chạy ở tiến trình con. Xem mục 4.

## 1. Debug trong Zed

### 1.1 Cấu hình

Zed dùng giao thức DAP. Cấu hình nằm ở `.zed/debug.json` (gốc project, đã tạo sẵn) với 2 session:

- **Debug server (index.js)** — chạy server dưới debugger.
- **Attach to Node (port 9229)** — gắn vào tiến trình đang chạy `node --inspect`.

```json
[
  {
    "label": "Debug server (index.js)",
    "adapter": "JavaScript",
    "type": "pwa-node",
    "request": "launch",
    "program": "$ZED_WORKTREE_ROOT/backend/src/index.js",
    "cwd": "$ZED_WORKTREE_ROOT/backend",
    "console": "integratedTerminal",
    "env": { "PORT": "3000", "JWT_SECRET": "dev-secret-change-me" }
  }
]
```

> **Quan trọng:** phải có `"type": "pwa-node"`. Thiếu `type` → js-debug báo `Error: Unknown config: {...}` ngay khi start. `"type": "node"` cũng thường chấp nhận được.

**Cách khác (không cần tự viết config):** JavaScript có tính năng *automatic scenario creation*, nên có thể bấm **F4** (`debugger: start`) → chọn entry point `backend/src/index.js` → Zed tự sinh cấu hình đúng. Khi đó có thể xoá `.zed/debug.json` để Zed không ưu tiên file này (Zed ưu tiên `.zed/debug.json` hơn `.vscode/launch.json`).

Nếu adapter `JavaScript` không có sẵn, cài extension **JavaScript Debugger** (Zed dùng `vscode-js-debug` bên dưới).

### 1.2 Đặt breakpoint

Mở file cần xem (`index.js`, `store.js`, `auth.js`), click vào **lề trái (gutter)** cạnh số dòng → hiện **chấm đỏ**. Click lại để bỏ.

Gợi ý vị trí:

| Muốn xem | Đặt breakpoint ở |
|----------|------------------|
| Request vào, routing | `index.js` — dòng `const path = req.url.split('?')[0];` |
| Token hợp lệ không, ai gọi | `index.js` — trong `currentUser(req)` |
| Body parse | `index.js` — trong `readBody` ở `resolve(JSON.parse(raw))` |
| Logic từng endpoint | `signUp`, `login`, `deleteUser`, `createTask`, `assignTask`, `deleteTask` |
| Truy vấn store | `store.js` — trong các hàm `getUser*` / `createTask` |
| Tạo/kiểm token, hash | `auth.js` — `createToken` / `readToken` / `hashPassword` |

### 1.3 Chạy

Debug panel → chọn **Debug server (index.js)** → **Start (▶)**. Server chạy ở port 3000 và tạm dừng tại breakpoint khi có request.

### 1.4 Kích hoạt request

Server chỉ dừng khi có request. Từ terminal khác:

```bash
curl -X POST http://localhost:3000/sign-up \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"secret123"}'
```

Khi dừng, panel cho bạn: **Variables** (biến local), **Call Stack**, **Watch**, và **Step Over / Step Into / Step Out / Continue**.

## 2. Mẹo hữu ích

- **Conditional breakpoint**: thêm điều kiện, vd `id === 1` → chỉ dừng khi đúng.
- **Logpoint**: log giá trị rồi chạy tiếp, không cần `console.log`.
- **`debugger;`** — chèn thẳng vào code, dừng khi chạy dưới debugger:

  ```js
  function login(res, body) {
    debugger; // dừng ngay tại đây
    // ...
  }
  ```

- **Step Into** (`F11`) để nhảy vào `store.js`/`auth.js`; **Step Over** (`F10`) để chạy qua.

## 3. Không dùng Zed: `--inspect` + Chrome DevTools

```bash
cd backend
node --inspect src/index.js        # mở cổng inspector
node --inspect-brk src/index.js    # dừng ngay dòng đầu
node --watch --inspect src/index.js  # vừa code vừa reload
```

Mở Chrome → `chrome://inspect` → **Open dedicated DevTools for Node** → tab **Sources** → đặt breakpoint. `debugger;` cũng dừng.

## 4. Debug khi chạy smoke test

`test/smoke.js` spawn tiến trình con `node src/index.js`, nên breakpoint trong `index.js` không dừng.

- **Cách A (khuyên dùng)**: debug server trực tiếp (mục 1–3) rồi tự gọi `curl`.
- **Cách B**: cho tiến trình con mở inspector. Sửa tạm trong `smoke.js`:

  ```js
  const server = spawn(process.execPath, ['--inspect-brk=9229', path.join(__dirname, '..', 'src', 'index.js')], { ... });
  ```

  rồi dùng cấu hình **Attach to Node (port 9229)**.

## 5. VS Code (nếu dùng)

`.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug server",
      "program": "${workspaceFolder}/backend/src/index.js",
      "cwd": "${workspaceFolder}/backend",
      "env": { "PORT": "3000" }
    }
  ]
}
```

## 6. Lưu ý riêng của server này

- **Token stateless + ghi file CSV**: debugger chạy code thật nên request sẽ **ghi vào `data/users.csv` / `data/tasks.csv`**. Muốn dữ liệu sạch, đặt `DATA_DIR` trong `env` trỏ tới thư mục tạm, hoặc xoá `backend/data/*.csv`.
- **Port bị chiếm**: đổi `PORT` trong `env` cấu hình debug khi chạy song song bản thường.
- **Sửa code xong**: `node --watch` (hoặc `npm run dev`) tự reload, nhưng **không** giữ breakpoint như debugger — muốn debug thì dùng cấu hình launch.
