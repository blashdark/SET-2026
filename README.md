# SET-2026

## Products API: MongoDB

Yêu cầu Node.js >= 22.9, MongoDB đang chạy (tự chuẩn bị riêng).

```sh
npm ci
npm start
```

Server: `http://localhost:3000/products`. Các route GET/POST/PUT/PATCH/DELETE,
validation, status và JSON `{ id, name, price }` giữ nguyên.

`npm start` tự đọc `.env` ở root bằng native Node `--env-file-if-exists`.
Tạo `.env` cục bộ với `MONGODB_URI` chỉ chứa host/options, không chứa user/password;
đặt riêng `MONGODB_USER`, `MONGODB_PASSWORD` (giá trị gốc, không URI-encode),
`MONGODB_DB=set2026`. File được Git ignore; không có `.env` vẫn dùng mặc định.
Đặt giá trị có ký tự đặc biệt trong dấu nháy phù hợp với native Node `.env`.
Tách biến chỉ tránh lộ mật khẩu khi xem URI, không mã hóa: `.env` vẫn chứa bí mật.
Biến môi trường có sẵn được ưu tiên hơn `.env`.

Biến môi trường:

| Biến | Mặc định |
| --- | --- |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` |
| `MONGODB_DB` | `set2026` |
| `MONGODB_USER` | Không đặt (không gửi auth riêng) |
| `MONGODB_PASSWORD` | Không đặt |

Khi đặt `MONGODB_USER`, driver nhận `auth.username/password` từ hai biến riêng;
`authSource` mặc định `admin`, hoặc dùng `authSource` đã chỉ định trong URI.

Ví dụ Git Bash:

```sh
MONGODB_URI=mongodb://127.0.0.1:27017 MONGODB_DB=set2026 npm start
```

Không đưa URI chứa mật khẩu vào Git/log. `API_TOKEN` vẫn hoạt động như trước.
Driver `mongodb@6.21.0` dùng chung một connection pool, kết nối khi có request;
lỗi kết nối/thao tác truyền lên server, trả 500 `{"message":"Lỗi server"}`.
Thời gian chọn server tối đa 5 giây.
Nếu GET `/products` trả 500, kiểm tra cluster đang chạy, quyền `readWrite`
trên đúng DB, Network Access và `MONGODB_USER`/`MONGODB_PASSWORD` trong `.env`;
không in URI để chẩn đoán. Nếu Node không nhận flag `.env`, nâng Node >= 22.9.
Tài liệu native `.env`: https://nodejs.org/docs/v22.23.4/api/cli.html#--env-file-if-existsfile

Datasource dùng collection `products` (`_id` số, trả ra API thành `id`),
`counters` (bộ đếm atomic cho ID khi tạo đồng thời). ID không tái sử dụng sau
khi xóa; thao tác tạo lỗi có thể để lại khoảng trống ID. Không sửa/reset bộ đếm
riêng lẻ. Database mới bắt đầu rỗng; `js/products/products.json` giữ nguyên,
không còn được đọc/ghi, không tự migration/seed. PUT/PATCH không upsert.

```sh
npm test
```

Tests mock driver, kiểm tra toàn bộ CRUD qua router/controller/repository/datasource,
ID số, tạo đồng thời, 400/404/204 và truyền lỗi async; không ghi MongoDB thật.

Tài liệu driver:
- https://www.mongodb.com/docs/drivers/node/v6.x/connect/mongoclient/
- https://mongodb.github.io/node-mongodb-native/6.21/classes/Collection.html
