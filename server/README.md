# Auth + Task REST API

REST API xac thuc nguoi dung (access token) va quan ly task, viet bang **Node.js core** (`node:http`), **khong dung dependency ben ngoai**. Du lieu luu trong file CSV.

## Yeu cau

- Node.js >= 18 (da test tren Node 22)

## Chay server

```bash
cd server
node src/index.js
# hoac
npm start
# dev (tu dong reload khi sua file)
npm run dev
```

Mac dinh server chay o `http://localhost:3000`.

### Bien moi truong

Chep `.env.example` thanh `.env` roi chinh sua, sau do chay:

```bash
node --env-file=.env src/index.js
```

| Bien | Mac dinh | Mo ta |
|------|----------|-------|
| `PORT` | `3000` | Cong server |
| `JWT_SECRET` | `dev-secret-change-me` | Khoa bi mat de ky access token (**nen doi**) |
| `ACCESS_TOKEN_TTL` | `3600` | Thoi han access token (giay) |

## Database

Luu trong `server/data/` (tu dong tao khi chay, bi `.gitignore` bo qua):

`users.csv`

| Cot | Kieu |
|-----|------|
| id | number |
| username | string |
| password_hash | string (scrypt) |
| salt | string |
| created_at | ISO string |

`tasks.csv`

| Cot | Kieu |
|-----|------|
| id | number |
| title | string |
| description | string |
| user_id | number |
| created_at | ISO string |

> Luu y: CSV phu hop cho bai tap, khong an toan khi ghi dong thoi (concurrent writes).

## Xac thuc

- `POST /login` tra ve `accessToken` (chuoi ky HMAC-SHA256, khong co refresh token).
- Cac endpoint can xac thuc gui kem header:

```
Authorization: Bearer <accessToken>
```

## Danh sach endpoint

| # | Method | Path | Auth | Mo ta |
|---|--------|------|------|-------|
| 1 | POST | `/sign-up` | Khong | Dang ky tai khoan |
| 2 | POST | `/login` | Khong | Dang nhap, nhan access token |
| 3 | GET | `/me` | Co | Thong tin user dang dang nhap |
| 4 | DELETE | `/user/:id` | Co | Xoa user theo id |
| 5 | POST | `/task` | Co | Tao task |
| 6 | GET | `/tasks` | Co | Lay task cua chinh minh |
| 7 | PATCH | `/assign-task/:id` | Co | Gan task (theo id) cho chinh minh |
| 8 | DELETE | `/task/:id` | Co | Xoa task cua chinh minh |

### Quy tac nghiep vu

- `GET /tasks` chi tra ve task thuoc user dang dang nhap.
- `PATCH /assign-task/:id` khong phan quyen (theo yeu cau bai tap), luon gan task cho chinh nguoi dang dang nhap.
- `DELETE /task/:id` chi xoa duoc task minh so huu (neu khong -> `403`).
- `DELETE /user/:id` bi chan (`409`) neu user con task; audit khong phan quyen (bat ky user da dang nhap deu xoa duoc user khac).

### Ma loi

| Status | Y nghia |
|--------|---------|
| 400 | Du lieu khong hop le |
| 401 | Chua xac thuc / sai dang nhap / token het han |
| 403 | Khong so huu tai nguyen |
| 404 | Khong tim thay |
| 405 | Sai method cho path |
| 409 | Xung dot (username trung, user con task) |

## Vi du voi cURL

```bash
# 1. Dang ky
curl -X POST http://localhost:3000/sign-up \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"secret123"}'

# 2. Dang nhap -> lay accessToken
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"secret123"}'

# 3. Thong tin ca nhan
curl http://localhost:3000/me -H "Authorization: Bearer $TOKEN"

# 4. Tao task
curl -X POST http://localhost:3000/task \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Hoc Node.js","description":"Lam bai tap REST API"}'

# 5. Lay task cua minh
curl http://localhost:3000/tasks -H "Authorization: Bearer $TOKEN"

# 6. Gan task id=1 cho chinh minh
curl -X PATCH http://localhost:3000/assign-task/1 -H "Authorization: Bearer $TOKEN"

# 7. Xoa task id=1 (neu minh so huu)
curl -X DELETE http://localhost:3000/task/1 -H "Authorization: Bearer $TOKEN"

# 8. Xoa user id=1 (that bai 409 neu con task)
curl -X DELETE http://localhost:3000/user/1 -H "Authorization: Bearer $TOKEN"
```

## Cau truc

```
server/
  src/
    index.js         # entry: tao http server, dispatch, xac thuc
    router.js        # router nho ho tro /:id
    http.js          # helper JSON / doc body
    auth.js          # hash password (scrypt) + ky/verify access token (HMAC)
    csv.js           # parse / ghi CSV
    store.js         # doc ghi users.csv, tasks.csv
    routes/
      auth.js        # POST /sign-up, POST /login
      user.js        # GET /me, DELETE /user/:id
      task.js        # POST /task, GET /tasks, PATCH /assign-task/:id, DELETE /task/:id
  data/              # CSV (tu dong tao, khong commit)
```
