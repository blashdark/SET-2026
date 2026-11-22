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

---

## Reports API (Day 34 Aggregation Pipelines)

Cung cấp các báo cáo thống kê doanh thu và sản phẩm bán chạy sử dụng MongoDB Aggregation Pipeline:

### 1. GET `/reports/revenue-by-customer`
Tổng hợp doanh thu theo từng khách hàng từ các đơn hàng có trạng thái `paid`.
- **Query parameters (tuỳ chọn)**:
  - `limit`: Giới hạn số lượng bản ghi trả về (ví dụ: `?limit=10`).
  - `customerId`: Lọc theo ID khách hàng cụ thể (hỗ trợ cả ObjectId hex string).
- **Phản hồi mẫu (`200 OK`)**:
```json
[
  {
    "customerId": "673000000000000000000001",
    "customerName": "Nguyễn Văn Thịnh",
    "customerEmail": "thinh.nguyen@example.com",
    "totalSpent": 110000,
    "orderCount": 1
  }
]
```

### 2. GET `/reports/top-products`
Xếp hạng sản phẩm bán chạy nhất dựa trên tổng số lượng bán ra (`totalQuantitySold`) từ các đơn hàng `paid`. Có sắp xếp tie-breaker theo `totalRevenue` giảm dần và `_id` tăng dần.
- **Query parameters (tuỳ chọn)**:
  - `limit`: Giới hạn số lượng sản phẩm đứng đầu (ví dụ: `?limit=5`).
- **Phản hồi mẫu (`200 OK`)**:
```json
[
  {
    "productId": 1,
    "name": "Trà Sữa Oolong Nướng",
    "totalQuantitySold": 3,
    "totalRevenue": 105000
  }
]
```

---

## Seed & Database Setup

Để khởi tạo cấu trúc MongoDB:

1. **Khởi tạo Validator và Indexes**: Cần chạy lệnh này trước để thiết lập schema validation ($jsonSchema) và các unique/filtering index:
```sh
npm run setup-db
```

2. **Seed dữ liệu mẫu (Dev / Test)**:
```sh
node --env-file-if-exists=.env js/db/seed.js
```
> ⚠️ **Lưu ý**: Lệnh seed (`node js/db/seed.js`) sẽ **xoá sạch dữ liệu cũ** và chèn bộ dữ liệu mẫu ban đầu. Lệnh này **chỉ dùng cho môi trường dev/test**, không được chạy trên môi trường production.

---

## Kiểm thử

```sh
npm test
```

Tests mock driver, kiểm tra toàn bộ CRUD qua router/controller/repository/datasource,
ID số, tạo đồng thời, 400/404/204, pipelines aggregation report và truyền lỗi async; không ghi MongoDB thật.

Tài liệu driver:
- https://www.mongodb.com/docs/drivers/node/v6.x/connect/mongoclient/
- https://mongodb.github.io/node-mongodb-native/6.21/classes/Collection.html
