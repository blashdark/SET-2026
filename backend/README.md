# Auth + Task REST API

REST API xác thực người dùng bằng **email** (access token + xác thực email) và quản lý task. Lưu trữ bằng **file CSV tự đọc/ghi** (không dùng database engine), gửi email qua **nodemailer** (Gmail SMTP).

## Yêu cầu

- Node.js >= 18 (đã test trên Node 22)

## Cài đặt & chạy

```bash
cd backend
npm install
node src/index.js
# hoặc
npm start          # chạy server
npm run dev        # tự reload khi sửa file
npm test           # smoke test toàn bộ endpoint
npm run seed       # tạo 1.000.000 user mẫu
npm run bench      # đo chi phí sign-up (hash + insert)
```

Mặc định server chạy ở `http://localhost:3000`.

### Giao diện (frontend)

Server phục vụ luôn frontend tại `/frontend/` (cùng origin với API). Mở:

**http://localhost:3000/frontend/html/login.html**

- `frontend/html/login.html` — Đăng nhập / Đăng ký
- `frontend/html/index.html` — Danh sách công việc
- `frontend/css/` — `base.css` (tokens dùng chung), `auth.css`, `app.css`
- `frontend/js/` — `auth.js`, `app.js`

(Trang kết quả `GET /verify?token=...` do server render.)

### Biến môi trường

Chép `.env.example` thành `.env` rồi chạy `node --env-file=.env src/index.js`.

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `PORT` | `3000` | Cổng server |
| `BASE_URL` | `http://localhost:3000` | Gốc URL, dùng để dựng link xác thực |
| `DATA_DIR` | `backend/data` | Thư mục chứa file CSV |
| `JWT_SECRET` | `dev-secret-change-me` | Khóa ký access token (**nên đổi**) |
| `ACCESS_TOKEN_TTL` | `3600` | Hạn access token (giây) |
| `SCRYPT_N` | `16384` | Cost scrypt; giảm để sign-up nhanh hơn |
| `VERIFY_TTL_SECONDS` | `86400` | Hạn link xác thực email (giây) |
| `SMTP_HOST/PORT/USER/PASS` | — | Cấu hình Gmail SMTP (xem dưới) |

## Lưu trữ

**Không dùng database engine.** Dữ liệu nằm trong 2 file CSV do chính code đọc/ghi, dạng **snapshot** — **đúng 1 dòng cho mỗi user/task**:

```
data/
  users.csv
  tasks.csv
```

Khi khởi động, server nạp file theo chunk 1MB vào các `Map` trong RAM (`usersByEmail`, `usersById`, `tasksById`…) → mọi truy vấn O(1), **check email trùng là 1 phép tra Map**. Ghi thì sửa RAM và bật cờ dirty; **flush định kỳ** (write-behind) ghi lại **cả file dạng snapshot** (ra `.tmp` rồi `rename` — atomic), nên request path không đụng đĩa.

- `users.csv`: `id,email,password_hash,salt,status,verify_token,verify_expires,created_at`
- `tasks.csv`: `id,title,done,user_id,created_by,created_at`

> Không còn cột `op`: mỗi thao tác **không** ghi thêm dòng, mà làm file “bẩn” rồi flush ghi đè snapshot → file luôn đúng 1 dòng/user, không phình theo số thao tác. File cũ dạng log vẫn đọc được và tự nén lại ở lần flush đầu. Đánh đổi: mỗi lần flush ghi lại toàn file (với 1M user ~90MB), nên writes gom theo `FLUSH_MS` và chạy nền.

## Xác thực

- `POST /sign-up` tạo user với `status = pending`, sinh `verify_token`, gửi email chứa link `GET /verify?token=...`.
- Bấm link → `status = active`. **Chỉ user `active` mới đăng nhập được** (ngược lại `403`).
- `POST /login` trả `accessToken` (HMAC-SHA256). Các endpoint cần auth gửi header:

```
Authorization: Bearer <accessToken>
```

### Chạy không có SMTP (dev)

Nếu chưa cấu hình `SMTP_*`, server **ghi link xác thực ra console** và trả thêm `verifyUrl` trong response `POST /sign-up` để bạn tự bấm.

### Cấu hình Gmail SMTP

Gmail yêu cầu **App Password** (bật 2FA trước, tạo tại https://myaccount.google.com/apppasswords):

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=you@gmail.com
SMTP_PASS=your-16-char-app-password
MAIL_FROM=you@gmail.com
```

## Quy tắc mật khẩu

Tối thiểu 8 ký tự, có **≥1 chữ hoa, ≥1 chữ thường, ≥1 ký tự đặc biệt**. Email phải hợp lệ và **không trùng**.

## Danh sách endpoint

| # | Method | Path | Auth | Mô tả |
|---|--------|------|------|-------|
| 1 | POST | `/sign-up` | Không | Đăng ký (email + password), gửi mail xác thực |
| 2 | POST | `/login` | Không | Đăng nhập (chỉ user đã xác thực), nhận access token |
| 3 | GET | `/verify?token=` | Không | Bấm link trong email để kích hoạt tài khoản |
| 4 | POST | `/resend-verification` | Không | Gửi lại email xác thực |
| 5 | GET | `/me` | Có | Thông tin user đang đăng nhập |
| 6 | GET | `/users` | Có | Danh sách user, phân trang `?limit=50&offset=0` → `{ total, limit, offset, items }` |
| 7 | GET | `/user/:id` | Có | Lấy 1 user theo id |
| 8 | DELETE | `/user/:id` | Có | Xóa user (chặn nếu còn task) |
| 9 | POST | `/task` | Có | Tạo task |
| 10 | GET | `/tasks` | Có | Lấy tất cả task (board dùng chung) |
| 11 | PATCH | `/task/:id` | Có | Sửa task (title/done, tùy chọn `user_id`) |
| 12 | DELETE | `/task/:id` | Có | Xóa task |
| 13 | PATCH | `/assign-task/:id` | Có | Gán task (theo id) cho user khác |

### Quy tắc nghiệp vụ

- Board dùng chung: `GET /tasks` trả **tất cả** task; `PATCH/DELETE /task/:id` áp dụng cho **mọi** task (mọi user đã đăng nhập đều sửa/xóa được). Không còn kiểm tra chủ sở hữu.
- `PATCH /assign-task/:id` không phân quyền (theo yêu cầu bài tập); body `{ "user_id": <id> }` đổi chủ sở hữu (`400` nếu thiếu/sai `user_id`, `404` nếu task hoặc user đích không tồn tại).
- `DELETE /user/:id` bị chặn (`409`) nếu user còn task. Không còn endpoint `PATCH /user/:id`.

### Mã lỗi

| Status | Ý nghĩa |
|--------|---------|
| 400 | Dữ liệu không hợp lệ |
| 401 | Chưa xác thực / sai đăng nhập / token hết hạn |
| 403 | Email chưa xác thực (hoặc path tĩnh ngoài `frontend/`) |
| 404 | Không tìm thấy (hoặc sai method cho path) |
| 409 | Xung đột (email trùng, user còn task) |
| 410 | Link xác thực hết hạn |

## Hiệu năng (mục tiêu sign-up < 0.5ms)

Hai script đo:

- `npm run bench` — chi phí từng phần (scrypt / unique check / createUser) trong tiến trình.
- `npm run bench:api` — **độ trễ HTTP thật** của `POST /sign-up` (kèm baseline `GET /me`).

Chi phí từng phần (`npm run bench`, engine CSV):

| Phép đo | ms/op |
|---------|-------|
| scrypt hash | ~43ms |
| **unique check (Map)** | **~0.0005ms (0.5µs)** |
| **createUser (Map + buffer)** | **~0.003ms (3µs)** |

Độ trễ HTTP thật (`npm run bench:api`):

| Phép đo | avg | p50 |
|---------|-----|-----|
| baseline `GET /me` (sàn HTTP) | ~0.47ms | ~0.40ms |
| `POST /sign-up` (HTTP) | ~0.69ms | ~0.63ms |

Kết luận:
- **Phần đồng bộ của register chỉ là validate + check unique (Map) + tạo user + buffer** → **vài µs**, dư sức < 0.5ms.
- **scrypt + ghi file + gửi mail đều chạy nền** (băm bất đồng bộ trên threadpool; CSV write-behind; mail fire-and-forget) → không nằm trên request path.
- Nhưng **sàn HTTP của localhost đã ~0.4–0.5ms**, nên **latency một API call** thực tế ~0.6–0.7ms. Muốn số "< 0.5ms" thì tính **thời gian server xử lý** (đạt rõ ràng), hoặc báo p50 ~0.5ms + giải thích sàn HTTP.
- Đánh đổi: vài chục ms đầu sau signup, login có thể nhận `409 "đang khởi tạo"` (chưa kịp có hash). Nếu crash đúng lúc đó, email vẫn đăng ký lại được (bản ghi hash rỗng bị coi là rác và bị ghi đè). Flush lỗi sẽ tự thử lại thay vì mất dữ liệu.

## Ví dụ với cURL

```bash
# 1. Đăng ký (dev: response có verifyUrl)
curl -X POST http://localhost:3000/sign-up \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"Str0ng!pass"}'

# 2. Bấm link xác thực (lấy token từ verifyUrl ở bước 1)
curl "http://localhost:3000/verify?token=<TOKEN>"

# 3. Đăng nhập -> lấy accessToken
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"Str0ng!pass"}'

# 4. Thông tin cá nhân
curl http://localhost:3000/me -H "Authorization: Bearer $TOKEN"

# 5. Tạo task
curl -X POST http://localhost:3000/task \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Học Node.js"}'

# 6. Lấy tất cả task (board dùng chung)
curl http://localhost:3000/tasks -H "Authorization: Bearer $TOKEN"

# 7. Đánh dấu done + đổi tên task id=1
curl -X PATCH http://localhost:3000/task/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"done":true,"title":"Đã học xong"}'

# 8. Danh sách user
curl http://localhost:3000/users -H "Authorization: Bearer $TOKEN"

# 9. Gán task id=1 cho user id=2
curl -X PATCH http://localhost:3000/assign-task/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"user_id":2}'

# 10. Xóa task id=1
curl -X DELETE http://localhost:3000/task/1 -H "Authorization: Bearer $TOKEN"
```

## Cấu trúc

```
backend/
  src/
    index.js      # entry: http server + routing + handlers + static /frontend/*
    store.js        # engine CSV tự dựng: index RAM, ghi snapshot (write-behind)
    auth.js         # hash password (scrypt) + ký/verify access token (HMAC)
    mailer.js     # gửi email xác thực qua nodemailer (Gmail SMTP)
  scripts/
    seed.js       # seed N user vào users.csv
    bench.js      # đo chi phí sign-up
    bench-api.js  # đo độ trễ HTTP của POST /sign-up
  test/
    smoke.js      # smoke test toàn bộ endpoint
  data/           # users.csv, tasks.csv (tự tạo, đã gitignore)

frontend/
  html/           # login.html (auth), index.html (task + user)
  css/            # base.css, auth.css, app.css
  js/             # auth.js, app.js
```

> Routing vẫn dùng `if/else` theo method + path cho dễ đọc; `store.js` là lớp lưu trữ duy nhất.
