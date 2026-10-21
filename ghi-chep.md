# GHI CHÉP BÀI TẬP TỐI 21/10 - TÁCH TẦNG

- **Học viên:** Mai Phước Thịnh
- **Lớp:** SET 2026 - UDT | BE Node.js thuần | Mentor: Duy
- **Người cùng cặp (peer):** Lê Nguyễn Minh Thắng

---

## BÀI 2 - ĐOẠN CODE NÀY Ở TẦNG NÀO?

### Quy tắc 7 câu hỏi tự vấn loại trừ (theo đúng thứ tự):
1. **Nó gọi ra hệ thống bên ngoài?** $\rightarrow$ **Service**
2. **Nó biết dữ liệu nằm ở file/database nào?** $\rightarrow$ **DataSource**
3. **Nó tìm, tạo, sửa, xoá dữ liệu mà không đụng `req`, `res`?** $\rightarrow$ **Repository**
4. **Nó là luật riêng của một API?** $\rightarrow$ **Controller**
5. **Nó đụng `req`, `res` và dùng chung cho nhiều route?** $\rightarrow$ **Middleware**
6. **Nó ghép method + URL với hàm xử lý?** $\rightarrow$ **Router**
7. **Nó là hàm nhỏ, không đụng `req`, `res`?** $\rightarrow$ **Helper / utils**

---

### Bảng phân loại 13 đoạn code

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

---

### Chi tiết phân tích từng đoạn & Các bẫy hay nhầm lẫn

#### Đoạn 1: `formatVnd`
```javascript
function formatVnd(price) {
  return price.toLocaleString('vi-VN') + ' đ';
}
```
- **Tầng:** `Helper / utils`
- **Lý do:** Format dữ liệu đầu ra, hàm thuần túy nhận vào số trả ra chuỗi, tái sử dụng ở nhiều nơi và không chạm vào `req`, `res`.

#### Đoạn 2: `requireJson`
```javascript
function requireJson(req, res) {
  if (req.headers['content-type'] !== 'application/json') {
    sendJson(res, 415, { message: 'Chỉ nhận JSON' });
    return false;
  }
  return true;
}
```
- **Tầng:** `Middleware`
- **Lý do:** Kiểm tra header cho mọi route nhận dữ liệu gửi lên. Nó tự trả status code 415 Unsupported Media Type và ngắt request nếu vi phạm.
- **Bẫy hay nhầm:** Dễ nhầm sang *Controller* vì nhìn thấy có lệnh `sendJson(res, 415, ...)`. Nhưng đây là kiểm tra kỹ thuật dùng chung cho nhiều route, không phải nghiệp vụ riêng của một API cụ thể.

#### Đoạn 3: `limitRequest`
```javascript
const requestCount = {};
function limitRequest(req, res) {
  const ip = req.socket.remoteAddress;
  requestCount[ip] = (requestCount[ip] || 0) + 1;
  if (requestCount[ip] > 100) {
    sendJson(res, 429, { message: 'Gửi quá nhiều request' });
    return false;
  }
  return true;
}
```
- **Tầng:** `Middleware`
- **Lý do:** Giới hạn request theo IP (Rate Limiter), áp dụng chung cho toàn bộ ứng dụng để bảo vệ server, tự kết thúc request với status 429.
- **Bẫy hay nhầm:** Nhầm sang *Controller* vì có `sendJson`. Tuy nhiên rate limit là việc hạ tầng/cross-cutting concern.

#### Đoạn 4: Kiểm tra `stock`
```javascript
const product = productRepository.findById(req.body.productId);
if (product.stock < req.body.quantity) {
  sendJson(res, 400, { message: 'Không đủ hàng' });
  return;
}
```
- **Tầng:** `Controller`
- **Lý do:** Quy tắc "không đủ hàng thì không cho đặt" là business logic cốt lõi của tính năng đặt hàng. Controller đọc input, gọi Repository kiểm tra tồn kho và quyết định trả status 400 hay tiếp tục luồng.

#### Đoạn 5: `getUsdToVndRate`
```javascript
async function getUsdToVndRate() {
  const response = await fetch('https://open.er-api.com/v6/latest/USD');
  const data = await response.json();
  return data.rates.VND;
}
```
- **Tầng:** `Service`
- **Lý do:** Giao tiếp qua mạng để gọi API từ hệ thống bên thứ ba (`open.er-api.com`).
- **Bẫy hay nhầm:** Nhầm sang *Helper* vì hàm chỉ có vài dòng ngắn gọn. Bất kỳ đoạn code nào gọi ra hệ thống bên ngoài máy chủ (third-party API, payment gateway, mail server) đều thuộc tầng **Service**.

#### Đoạn 6: `findCheaperThan`
```javascript
function findCheaperThan(maxPrice) {
  const { products } = dataSource.load();
  return products.filter((p) => p.price <= maxPrice);
}
```
- **Tầng:** `Repository`
- **Lý do:** Thực hiện truy vấn nghiệp vụ dữ liệu (tìm các sản phẩm có giá nhỏ hơn hoặc bằng `maxPrice`) từ nguồn dữ liệu `dataSource`. Nhận số và trả về mảng Javascript Object, không biết `req`, `res`.

#### Đoạn 7: `load`
```javascript
function load() {
  return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
}
```
- **Tầng:** `DataSource`
- **Lý do:** Tầng duy nhất biết dữ liệu được lưu trữ ở đâu vật lý (`ORDERS_FILE`) và dùng thư viện gì (`fs`) để đọc lên. Chỉ làm nhiệm vụ I/O thô, không chứa nghiệp vụ.

#### Đoạn 8: Route mapping
```javascript
{ method: 'GET', path: '/orders/:id', middlewares: [requireToken], handler: orderController.getById }
```
- **Tầng:** `Router`
- **Lý do:** Định nghĩa routing table: ghép method HTTP + đường dẫn URL với danh sách middleware và controller xử lý tương ứng.

#### Đoạn 9: `isPositiveInteger`
```javascript
function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}
```
- **Tầng:** `Helper / utils`
- **Lý do:** Hàm tiện ích kiểm tra tính hợp lệ của một biến đơn lẻ, không phụ thuộc môi trường HTTP, không đụng `req`, `res`.

#### Đoạn 10: `sendOrderEmail`
```javascript
async function sendOrderEmail(to, orderId) {
  await fetch('https://email.example.com/send', {
    method: 'POST',
    body: JSON.stringify({ to, subject: `Đơn hàng ${orderId} đã được tạo` }),
  });
}
```
- **Tầng:** `Service`
- **Lý do:** Tương tác với dịch vụ bên ngoài (hệ thống gửi email bên ngoài qua HTTP fetch).

#### Đoạn 11: Tính `total` có giảm 10%
```javascript
let total = 0;
for (const item of order.items) {
  total += item.price * item.quantity;
}
if (total > 500000) total = total * 0.9;
```
- **Tầng:** `Controller` *(hoặc `Helper / utils`)*
- **Lý do:**
  - Nếu nằm trực tiếp trong API checkout: Đây là **Business Logic** (chính sách giảm giá cho đơn hàng trên 500k) nên thuộc **Controller**.
  - Nếu được tách thành một hàm riêng `calcTotal(order)` nhận order trả về số tiền mà không đụng `req`, `res` để nhiều controller dùng chung thì xếp vào **Helper / utils** cũng hoàn toàn đúng.

#### Đoạn 12: `logRequest`
```javascript
function logRequest(req, res) {
  console.log(new Date().toISOString(), req.method, req.url);
  return true;
}
```
- **Tầng:** `Middleware`
- **Lý do:** Ghi log cho mọi request đến server. Việc này áp dụng xuyên suốt ứng dụng, không phải business logic của API cụ thể nào.
- **Bẫy hay nhầm:** Nhầm sang *Helper* vì chỉ có một dòng `console.log`. Nhưng vì nó nhận `req`, `res` và can thiệp vào vòng đời request nên nó là Middleware.

#### Đoạn 13: `readBody`
```javascript
function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); } catch (err) { resolve(undefined); }
    });
  });
}
```
- **Tầng:** `Middleware`
- **Lý do:** Đọc dữ liệu payload từ request stream là công việc kỹ thuật chung của mọi route ghi (POST/PUT/PATCH), không phải nghiệp vụ riêng của sản phẩm hay đơn hàng. Hàm này đọc trực tiếp từ `req` nên trong kiến trúc chuẩn (Bài 4), nó được bọc thành một middleware để gán kết quả vào `req.body`.
- **Bẫy hay nhầm:** Nhầm sang *Controller* vì ở các bước khởi đầu người học thường để controller tự gọi nó.

---

## GHI CHÚ BÀI 4 (BỔ SUNG VÀO BÁO CÁO CUỐI BUỔI)

- **Vì sao phải kiểm tra token trước rồi mới đọc body?**
  - **Lý do an ninh và hiệu năng (Security & Resource Protection):** Đọc stream body từ client tốn tài nguyên bộ nhớ (RAM), CPU và thời gian I/O của server. Bằng cách kiểm tra token trước, nếu request không có quyền (401 Unauthorized), server sẽ từ chối và ngắt kết nối ngay lập tức, ngăn chặn kẻ tấn công làm cạn kiệt tài nguyên server bằng cách gửi các payload dung lượng lớn (DoS/DDoS qua body).
- **Vị trí breakpoint kiểm chứng Bài 4:**
  - Middleware mới chặn JSON hỏng: `js/products/middleware.js:46` (trả về status 400).
  - Controller không bao giờ bị gọi tới khi body hỏng: `js/products/controller.js:68` (breakpoint tại Controller hoàn toàn không dừng).
