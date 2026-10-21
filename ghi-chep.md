# Bài 2 – Đoạn code thuộc tầng nào

| Đoạn | Tên đoạn code | Tầng chọn | Vì sao (1 câu) | Cặp bạn chọn | Đáp án chính thức |
| :---: | :--- | :--- | :--- | :---: | :--- |
| **1** | `formatVnd(price)` | **Helper / utils** | Hàm nhỏ format dữ liệu hiển thị, tái sử dụng nhiều nơi, không đụng `req`, `res`. | Helper / utils | **Helper / utils** |
| **2** | `requireJson(req, res)` | **Middleware** | Kiểm tra header `content-type` dùng chung cho mọi route nhận body, tự trả 415 và dừng request. | Middleware | **Middleware** |
| **3** | `limitRequest(req, res)` | **Middleware** | Giới hạn tần suất request (rate limit) theo IP áp dụng toàn app, tự trả 429 và dừng request. | Middleware | **Middleware** |
| **4** | Kiểm tra `stock < quantity` | **Controller** | Luật "không đủ hàng thì không cho đặt" là business logic riêng của API đặt hàng; gọi repository rồi chọn HTTP status. | Controller | **Controller** |
| **5** | `getUsdToVndRate()` | **Service** | Gọi API của bên thứ ba bên ngoài (`open.er-api.com`) để lấy tỷ giá tiền tệ. | Service | **Service** |
| **6** | `findCheaperThan(maxPrice)` | **Repository** | Thao tác truy vấn lọc dữ liệu nhận số trả mảng, hoàn toàn không biết `req`, `res`. | Repository | **Repository** |
| **7** | `load()` đọc `ORDERS_FILE` | **DataSource** | Biết chính xác dữ liệu nằm ở file nào trên đĩa và trực tiếp đọc file thô lên. | DataSource | **DataSource** |
| **8** | Route config `{ method, path, ... }` | **Router** | Ghép cặp HTTP method + URL với middleware và controller xử lý tương ứng. | Router | **Router** |
| **9** | `isPositiveInteger(value)` | **Helper / utils** | Hàm nhỏ kiểm tra tính hợp lệ của một giá trị số, dùng lại nhiều chỗ, không đụng `req`, `res`. | Helper / utils | **Helper / utils** |
| **10** | `sendOrderEmail(to, orderId)` | **Service** | Gửi email thông báo qua hệ thống dịch vụ bên ngoài (`email.example.com`). | Service | **Service** |
| **11** | Tính `total` giảm 10% nếu > 500k | **Controller** *(hoặc Helper/utils)* | Luật "trên 500.000đ giảm 10%" là business logic của đơn hàng (nếu tách hàm thuần túy không đụng `req/res` thì là helper). | Controller | **Controller** hoặc **Helper / utils** |
| **12** | `logRequest(req, res)` | **Middleware** | Ghi log mọi request đi qua server, là việc dùng chung cho toàn hệ thống không phải business logic riêng. | Middleware | **Middleware** |
| **13** | `readBody(req)` | **Middleware** | Thu thập và đọc stream body từ `req` là việc chung của mọi route ghi (POST/PUT/PATCH), không thuộc business logic API. | Middleware | **Middleware** |
