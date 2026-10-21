# Review bài của Lê Nguyễn Minh Thắng - người chấm: Mai Phước Thịnh

## 1. Kết quả kiểm tra tự động (kiem-tra-crud.js)
**PASS 20/20 (bản một file: 20/20)**
- Toàn bộ 20/20 test cases đều đạt (PASS), không có lỗi nào.
- Các route kiểm tra authentication (`src/middlewares/auth.js`) không bị trả 401 khi chạy test thông thường do hệ thống chỉ kiểm tra token khi có biến môi trường `AUTH_TOKEN`. Nếu bật `AUTH_TOKEN`, router đã tích hợp middleware `auth` đầy đủ cho mọi route.

---

## 2. Mô tả mỗi file bằng 1 câu & File cần 2 câu

- `server.js`: Khởi tạo HTTP server bằng module `http`, lắng nghe tại cổng 3000 và ủy quyền xử lý request cho Router `handleRequest`.
- `src/router/product.js`: Phân tích method và URL pathname, áp dụng chuỗi middleware tương ứng và điều hướng request tới đúng hàm của Controller hoặc trả về 404.
- `src/middlewares/auth.js`: Xác thực header `Authorization` theo chuẩn Bearer token nếu biến môi trường `AUTH_TOKEN` được thiết lập.
- `src/middlewares/parseBody.js`: Thu thập stream payload của request, parse JSON và gán vào `req.body`, tự động trả về lỗi 400 nếu JSON sai định dạng.
- `src/repository/product.js`: Đọc toàn bộ dữ liệu từ file `products.txt` thành mảng JavaScript và lưu mảng JSON trở lại file.
- `src/utils/sendJson.js`: Thiết lập status code, header `Content-Type: application/json` và kết thúc response bằng chuỗi JSON.
- `src/utils/getNextId.js`: Tính ID tiếp theo bằng cách lấy ID lớn nhất hiện tại trong mảng sản phẩm cộng thêm 1.

**File cần 2 câu: `src/controllers/product.js`**
- **Câu 1**: Đóng vai trò tầng HTTP: tiếp nhận params, query, body từ request, điều phối các HTTP status code (200, 201, 400, 404) và gửi dữ liệu phản hồi cho client qua `sendJson`.
- **Câu 2**: Đồng thời đóng vai trò tầng xử lý dữ liệu: trực tiếp tìm kiếm (`find`, `findIndex`), tính toán sinh ID (`getNextId`) và trực tiếp đột biến cấu trúc mảng (`push`, `splice`, gán đè chỉ mục index) thay vì để Repository đảm nhiệm.

---

## 3. Controller đụng dữ liệu:
**Có**. Controller tự thao tác và đột biến mảng `products` trực tiếp tại các dòng sau:
- `src/controllers/product.js:16`: `products.slice(0, numberLimit)` - Tự cắt mảng để phân trang limit.
- `src/controllers/product.js:25`: `products.find(product => product.id === id)` - Tự tìm kiếm sản phẩm theo ID.
- `src/controllers/product.js:38`: `getNextId(products)` - Controller tự gọi hàm sinh ID cho sản phẩm.
- `src/controllers/product.js:44`: `products.push(newProduct)` - Tự push bản ghi mới vào mảng dữ liệu.
- `src/controllers/product.js:53`: `products.findIndex(product => product.id === id)` - Tự tìm chỉ mục để update.
- `src/controllers/product.js:59-64`: `products[productIndex] = { ... }` - Gán đè trực tiếp vào phần tử của mảng.
- `src/controllers/product.js:73`: `products.findIndex(product => product.id === id)` - Tự tìm chỉ mục để patch.
- `src/controllers/product.js:82-86`: `products[productIndex] = { ...products[productIndex], ...body, id: id }` - Gán đè trực tiếp sau khi merge.
- `src/controllers/product.js:95`: `products.findIndex(product => product.id === id)` - Tự tìm chỉ mục để delete.
- `src/controllers/product.js:101`: `products.splice(productIndex, 1)[0]` - Trực tiếp splice để xóa phần tử trong mảng.

---

## 4. Repository biết req/res/status:
**không có**
- File `src/repository/product.js` hoàn toàn độc lập với giao thức HTTP (không chứa `req`, `res`, `sendJson`, hay mã status 200, 404, 500). Tầng Repository thực hiện đúng nguyên tắc Protocol Independence.

---

## 5. Dừng:
**`src/router/product.js:37` -> `src/controllers/product.js:22` -> `src/repository/product.js:6`**
- Có dừng ở Router trước rồi mới tới Repository không: **Có, nhưng qua tầng trung gian Controller chứ Router không gọi thẳng Repository**:
  1. Breakpoint 1 dừng tại Router: `src/router/product.js:37` (khớp route `GET /products/:id`).
  2. Router chuyển tiếp sang Controller: `src/controllers/product.js:22` (hàm `getById`).
  3. Tại dòng 24 của Controller gọi `readProducts()`, luồng tiếp tục dừng tại Repository: `src/repository/product.js:6` (hàm `readProducts`).

---

## Nếu là bài của em, em sửa chỗ:
1. **Đưa toàn bộ logic thao tác dữ liệu từ Controller vào Repository**:
   - Hiện tại `repository/product.js` chỉ là wrapper đọc/ghi file (`readProducts`, `writeProducts`). Cần chuyển thành các hàm nghiệp vụ dữ liệu hoàn chỉnh:
     - `findAll({ limit })`: Lấy danh sách, tự xử lý slice theo limit.
     - `findById(id)`: Chuyển `products.find(...)` vào trong Repository.
     - `create(data)`: Repository tự import `getNextId`, tự tạo ID, tự push và ghi file.
     - `update(id, data)` / `patch(id, data)`: Tìm vị trí, cập nhật và ghi file.
     - `remove(id)`: Tìm vị trí, splice và ghi file, trả về sản phẩm đã xóa hoặc `null`.
2. **Làm sạch Controller để làm đúng duy nhất nhiệm vụ HTTP**:
   - Controller chỉ đọc `req.params`, `req.query`, `req.body`, gọi hàm tương ứng của Repository, và dùng `sendJson` trả về kết quả kèm HTTP status phù hợp. Không import `getNextId`, không có `find`, `push`, `splice` trong controller.
3. **Tách hàm `apply` ra khỏi Router**:
   - Hàm `apply` thực thi middleware tại `src/router/product.js:6-20` nên tách ra `src/utils/pipeline.js` hoặc `src/middlewares/compose.js` để file Router chỉ làm đúng một việc là mapping URL + Method -> Handler.
4. **Chuyển sang File I/O bất đồng bộ (Async)**:
   - Trong `src/repository/product.js`, thay `fs.readFileSync` / `fs.writeFileSync` bằng `fs.promises.readFile` / `fs.promises.writeFile` để không block Node.js Event Loop khi có nhiều request đồng thời.
