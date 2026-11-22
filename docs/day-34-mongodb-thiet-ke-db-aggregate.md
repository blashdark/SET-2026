# Thiết Kế Cơ Sở Dữ Liệu & Aggregation Pipeline Với MongoDB (Day 34)

Tài liệu này phân tích chi tiết giải pháp thiết kế mô hình dữ liệu, chiến lược nhúng và tách (embedding vs referencing), tính toàn vẹn dữ liệu, kiểm soát đồng thời (concurrency), transaction, schema validation và kiến trúc Aggregation Pipeline trong ứng dụng bán hàng trên nền tảng MongoDB & Node.js.

---

## 1. Ba Collection Của Shop

Hệ thống quản lý dữ liệu bán hàng được tổ chức thành 3 collection chính:

### a. `products`
Quản lý danh mục hàng hoá và tồn kho hiện tại:
- `_id`: Định danh duy nhất (trong hệ thống có thể là số tăng tự động qua bộ đếm atomic `counters` hoặc BSON `ObjectId`).
- `name`: Tên sản phẩm (String, bắt buộc).
- `price`: Giá niêm yết hiện tại (Number/Decimal, bắt buộc, không âm).
- `stock`: Số lượng tồn kho sẵn sàng bán (Number/Int, bắt buộc, $\ge 0$).

### b. `customers`
Quản lý thông tin định danh và liên lạc của khách hàng:
- `_id`: BSON `ObjectId` tự sinh.
- `name`: Họ và tên khách hàng (String, bắt buộc).
- `email`: Địa chỉ email (String, định dạng regex email chuẩn RFC 5322, bắt buộc).

### c. `orders`
Lưu trữ thông tin các giao dịch mua hàng đã phát sinh:
- `_id`: BSON `ObjectId` duy nhất của đơn hàng.
- `code`: Mã đơn hàng kinh doanh (Business order code, String, duy nhất, ví dụ `ORD-202611-0001`).
- `customerId`: Tham chiếu đến `customers._id` (ObjectId).
- `items`: Mảng các mặt hàng được chọn mua tại thời điểm đặt hàng.
- `total`: Tổng giá trị tiền tệ của toàn bộ đơn hàng (Number/Decimal).
- `status`: Trạng thái xử lý của đơn hàng (`pending`, `paid`, `cancelled`).
- `createdAt`: Dấu thời gian tạo đơn hàng (`ISODate`).

---

## 2. Nhúng Hay Tách (Embedding vs Referencing) & Giới Hạn 16MB Document

Trong cơ sở dữ liệu phi quan hệ (NoSQL/MongoDB), việc lựa chọn giữa **Embedding (Nhúng)** và **Referencing (Tham chiếu)** quyết định trực tiếp đến hiệu năng đọc/ghi, kích thước dữ liệu và tính toàn vẹn.

| Yếu tố phân tích | Nhúng (Embedding) | Tham chiếu (Referencing) | Quyết định trong hệ thống |
| :--- | :--- | :--- | :--- |
| **Bản chất** | Chứa trực tiếp document con bên trong document cha | Chỉ lưu `_id` trỏ sang document ở collection khác | Kết hợp Hybrid (lai): Tham chiếu khách hàng, nhúng snapshot giỏ hàng |
| **Tần suất đọc** | Tối ưu tuyệt đối cho 1 lần đọc duy nhất (Atomic Read) | Cần `$lookup` hoặc query thứ hai | Đơn hàng cần load tức thì danh sách sản phẩm lúc mua |
| **Giới hạn 16MB** | Dễ vi phạm nếu danh sách con phát triển không giới hạn (Unbounded Array) | Tránh hoàn toàn lỗi tràn 16MB của document BSON | Giỏ hàng/đơn hàng có số lượng mặt hàng hữu hạn ($< 100$ items) $\to$ Nhúng an toàn |
| **Độc lập dữ liệu** | Dữ liệu con bị ràng buộc theo vòng đời của cha | Dữ liệu tồn tại độc lập | Khách hàng và Sản phẩm tồn tại độc lập $\to$ Tách riêng collection |

### Chiến lược Hybrid cho `orders`:
1. **Tham chiếu `customerId`**: Khách hàng có thể có hàng nghìn đơn hàng trong suốt vòng đời. Nếu nhúng lịch sử đơn hàng vào document khách hàng, document khách hàng sẽ phình to không giới hạn, nhanh chóng chạm ngưỡng trần **16MB BSON Document Limit** và làm suy giảm hiệu năng bộ nhớ cache RAM (WiredTiger cache). Do đó, `orders` tham chiếu `customerId`.
2. **Nhúng `items` vào `orders`**: Một đơn hàng trong thực tế bán lẻ chỉ có từ vài món đến vài chục món hàng (Bounded growth). Việc nhúng mảng `items` đảm bảo toàn bộ chi tiết giỏ hàng được truy xuất trong một thao tác đọc (Single Document Read IOPS).

---

## 3. Snapshot Giá Lúc Mua (Price Snapshotting & Historical Accuracy)

### Vấn đề:
Nếu đơn hàng chỉ lưu `productId` và số lượng, sau đó khi hiển thị hóa đơn lại dùng `$lookup` sang collection `products` để lấy giá, hệ thống sẽ gặp sai phạm kế toán nghiêm trọng: Khi sản phẩm tăng giá từ 35.000đ lên 45.000đ, tất cả các đơn hàng cũ đã thanh toán trong quá khứ sẽ bị hiển thị sai lệch thành giá mới, làm sai lệch báo cáo tài chính và vi phạm nguyên tắc bất biến (immutability) của sổ cái hóa đơn.

### Giải pháp Snapshotting:
Mỗi phần tử trong mảng `orders.items` snapshot lại toàn bộ trạng thái của sản phẩm tại thời khắc bấm nút "Đặt hàng":
```json
{
  "productId": 1,
  "name": "Trà Sữa Oolong Nướng",
  "price": 35000,
  "quantity": 2
}
```
- Khi sản phẩm gốc thay đổi giá, đổi tên hoặc thậm chí bị xóa khỏi danh mục bán, đơn hàng lịch sử vẫn phản ánh chính xác số tiền khách đã cam kết và thanh toán.
- Báo cáo doanh thu chỉ cần tính toán trực tiếp trên trường `orders.items.price * orders.items.quantity` hoặc `orders.total` mà không bị ảnh hưởng bởi biến động giá của danh mục hàng hiện tại.

---

## 4. Xử Lý Khoá Ngoại & Toàn Vẹn Dữ Liệu Ở Tầng Ứng Dụng

MongoDB không áp đặt ràng buộc khóa ngoại (Foreign Key Constraints / Cascading Triggers) ở cấp độ engine lưu trữ như RDBMS (MySQL, PostgreSQL). Do đó, trách nhiệm đảm bảo toàn vẹn dữ liệu thuộc về **Tầng Dịch Vụ Ứng Dụng (Application Layer / Business Logic)**:

1. **Kiểm tra tồn tại trước khi tạo**: Trước khi insert đơn hàng, ứng dụng thực hiện truy vấn kiểm tra sự tồn tại của `customerId` trong collection `customers` và các `productId` trong `products`.
2. **Chính sách Soft Delete (Đề xuất kiến trúc cho tương lai)**:
   - *Hiện trạng bài tập*: Để đáp ứng bài test và chuẩn CRUD cơ bản, endpoint `DELETE /products/:id` hiện đang thực hiện xoá vật lý trực tiếp (`findOneAndDelete`).
   - *Đề xuất kiến trúc cho production*: Tuyệt đối không bao giờ thực hiện xoá cứng (`deleteOne()` / `findOneAndDelete()`) trên các thực thể `products` hay `customers` đã từng phát sinh đơn hàng lịch sử. Thay vào đó, thiết kế cột cờ `isArchived: true` hoặc `deletedAt: ISODate`. Khi truy vấn danh mục bán hàng thường ngày, thêm điều kiện `{ isArchived: { $ne: true } }` hoặc `{ deletedAt: null }`. Nhờ đó, tính toàn vẹn tham chiếu của đơn hàng cũ vẫn được bảo lưu vĩnh viễn cho mục đích kế toán, kiểm toán và báo cáo doanh thu.
3. **Phòng chống Orphaned References**: Trong các pipeline tổng hợp báo cáo (ví dụ `$lookup` từ `orders` sang `customers`), sử dụng `preserveNullAndEmptyArrays: true` ở stage `$unwind`. Kỹ thuật này giúp hệ thống không làm mất doanh thu trong trường hợp một khách hàng hi hữu bị xoá hoặc chưa kịp đồng bộ thông tin định danh.

---

## 5. Schema Validation Với $jsonSchema & BSON Types

Hệ thống kích hoạt tính năng Schema Validation tích hợp sẵn trong MongoDB engine qua cơ chế `$jsonSchema` (tiêu chuẩn IETF JSON Schema Draft 4).

### Ưu điểm:
- Chặn đứng dữ liệu rác, thiếu trường bắt buộc, hoặc sai kiểu dữ liệu ngay tại cổng lưu trữ.
- Đảm bảo tính nhất quán dữ liệu giữa nhiều microservices hoặc worker script cùng truy cập DB.

### Chi tiết các BSON Types và Ràng buộc:
```javascript
orders: {
  $jsonSchema: {
    bsonType: 'object',
    required: ['code', 'customerId', 'items', 'total', 'status', 'createdAt'],
    properties: {
      _id: { bsonType: 'objectId' },
      code: { bsonType: 'string' },
      customerId: { bsonType: 'objectId' },
      items: {
        bsonType: 'array',
        minItems: 1,
        items: {
          bsonType: 'object',
          required: ['productId', 'name', 'price', 'quantity'],
          properties: {
            productId: { bsonType: ['int', 'long', 'double', 'objectId'] },
            name: { bsonType: 'string' },
            price: { bsonType: ['int', 'long', 'double', 'decimal'], minimum: 0 },
            quantity: { bsonType: ['int', 'long', 'double'], minimum: 1 }
          }
        }
      },
      total: { bsonType: ['int', 'long', 'double', 'decimal'], minimum: 0 },
      status: { enum: ['pending', 'paid', 'cancelled'] },
      createdAt: { bsonType: 'date' }
    }
  }
}
```
- Cấp độ xác thực (`validationLevel: 'moderate'` hoặc `'strict'`) và hành vi xác thực (`validationAction: 'error'`) giúp từ chối ghi và trả lỗi khi văn bản không tuân thủ quy chuẩn.

---

## 6. Idempotency & Unique Index Trên Mã Đơn Hàng (E11000 $\to$ 409 Conflict)

### Rủi ro mạng (Network Glitch) & Double Submit:
Khi người dùng ấn nút thanh toán trên ứng dụng di động hoặc web, gói tin HTTP POST gửi đi có thể bị timeout mạng hoặc do người dùng sốt ruột click đúp liên tiếp. Nếu không có cơ chế chặn trùng lặp, hai đơn hàng giống hệt nhau sẽ được tạo và tài khoản người dùng bị trừ tiền hai lần.

### Idempotency Key & Các Indexes Đã Được Cấu Hình Trong Schema:
1. **Mã đơn hàng nghiệp vụ (`code`)**: Được sinh ra ở phía client hoặc API Gateway đóng vai trò khóa Idempotency Key (ví dụ `ORD-<timestamp>-<hash>`).
2. **Chỉ mục Unique Index trên `code`**: Tạo chỉ mục độc nhất trên trường `code` của collection `orders`:
   ```javascript
   await orders.createIndex({ code: 1 }, { unique: true, name: 'uniq_order_code' });
   ```
3. **Chỉ mục trên `status` (`idx_order_status`)**: Tạo chỉ mục đơn trên trường `status` của collection `orders`:
   ```javascript
   await orders.createIndex({ status: 1 }, { name: 'idx_order_status' });
   ```
   Chỉ mục này đóng vai trò tối quan trọng đối với các Aggregation Pipeline báo cáo doanh thu và top sản phẩm bán chạy, giúp stage `{ $match: { status: 'paid' } }` quét chỉ mục (Index Scan - IXSCAN) cực nhanh thay vì phải quét toàn bộ collection (Collection Scan - COLLSCAN).
4. **Bắt mã lỗi E11000**:
   - Khi request thứ hai cố tình chèn mã đơn hàng đã tồn tại, MongoDB Storage Engine quăng lỗi duplicate key:
     `MongoServerError: E11000 duplicate key error collection: set2026.orders index: uniq_order_code`.
   - Tầng điều khiển (Controller / Error Middleware) bắt mã lỗi này và chuyển hóa thành mã trạng thái HTTP chuẩn `409 Conflict` (thay vì 500 Internal Server Error):
     ```javascript
     if (err.code === 11000) {
       res.writeHead(409, { 'Content-Type': 'application/json' });
       return res.end(JSON.stringify({ message: 'Đơn hàng với mã này đã tồn tại' }));
     }
     ```

---

## 7. Quy Trình Tạo Đơn, Concurrency & Transaction Với Replica Set

### Kịch bản Race Condition khi trừ tồn kho:
Giả sử sản phẩm chỉ còn tồn kho $stock = 1$. Hai khách hàng A và B cùng bấm mua đồng thời:
- Nếu đọc tồn kho ra bộ nhớ ứng dụng kiểm tra rồi mới trừ (`stock = stock - 1`), cả hai luồng đều đọc được $stock = 1$, cùng thực hiện trừ và ghi nhận 2 đơn hàng $\to$ Bán vượt tồn kho (Overselling / Race Condition).

### Giải pháp 1: Thao tác nguyên tử (Atomic Conditional Update)
MongoDB hỗ trợ cập nhật atomic trên từng document đơn lẻ mà không cần mở transaction phân tán nặng nề:
```javascript
const updatedProduct = await products.findOneAndUpdate(
  { _id: item.productId, stock: { $gte: item.quantity } },
  { $inc: { stock: -item.quantity } },
  { returnDocument: 'after' }
);
if (!updatedProduct) {
  throw new Error('Hết hàng hoặc số lượng tồn kho không đủ');
}
```
Biểu thức `{ stock: { $gte: item.quantity } }` đóng vai trò là khóa lạc quan (Optimistic Check) loại trừ hoàn toàn race condition.

### Giải pháp 2: Multi-Document ACID Transaction (Đề xuất kiến trúc chi tiết cho endpoint `POST /orders` trong môi trường Replica Set)
Đối với đơn hàng mua nhiều mặt hàng cùng lúc, nếu mặt hàng thứ nhất trừ kho thành công nhưng mặt hàng thứ hai bị lỗi hoặc việc tạo order thất bại, hệ thống cần rollback lại toàn bộ trạng thái tồn kho của mặt hàng thứ nhất.
- Khi hoạt động trong môi trường MongoDB Replica Set (bao gồm MongoDB Atlas), ta sử dụng `client.startSession()` và `session.withTransaction()`:

```javascript
// Đề xuất quy trình xử lý tại controller/service cho POST /orders
async function createOrder(req, res) {
  const { code, customerId, items } = req.body;
  const session = client.startSession();

  try {
    let createdOrder = null;
    await session.withTransaction(async () => {
      // 1. Kiểm tra khách hàng hợp lệ
      const customer = await customers.findOne({ _id: new ObjectId(customerId) }, { session });
      if (!customer) throw { status: 404, message: 'Khách hàng không tồn tại' };

      // 2. Trừ tồn kho từng sản phẩm với điều kiện atomic stock >= quantity và snapshot giá
      let total = 0;
      const snapshottedItems = [];

      for (const item of items) {
        const product = await products.findOneAndUpdate(
          { _id: item.productId, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { returnDocument: 'after', session }
        );

        if (!product) {
          throw { status: 400, message: `Sản phẩm ID ${item.productId} không đủ tồn kho hoặc không tồn tại` };
        }

        const itemTotal = product.price * item.quantity;
        total += itemTotal;
        snapshottedItems.push({
          productId: product._id,
          name: product.name,
          price: product.price,
          quantity: item.quantity,
        });
      }

      // 3. Tạo order document
      const orderDoc = {
        code,
        customerId: customer._id,
        items: snapshottedItems,
        total,
        status: 'paid', // hoặc 'pending' tùy luồng thanh toán
        createdAt: new Date(),
      };

      const insertResult = await orders.insertOne(orderDoc, { session });
      createdOrder = { _id: insertResult.insertedId, ...orderDoc };
    });

    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(createdOrder));
  } catch (err) {
    if (err.code === 11000) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ message: 'Mã đơn hàng đã tồn tại (Idempotency duplicate)' }));
    }
    if (err.status) {
      res.writeHead(err.status, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ message: err.message }));
    }
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Lỗi xử lý tạo đơn hàng' }));
  } finally {
    await session.endSession();
  }
}
```
Quy trình này đảm bảo toàn bộ các thao tác ghi đều tuân thủ nguyên tắc ACID (Atomicity, Consistency, Isolation, Durability), bảo vệ số liệu tồn kho chính xác tuyệt đối ngay cả khi chịu tải cao.

---

## 8. Phân Tích Kiến Trúc Aggregation Pipeline

MongoDB Aggregation Pipeline hoạt động theo nguyên lý băng chuyền dữ liệu (Data Processing Assembly Line): Dữ liệu từ collection đi qua tuần tự các giai đoạn (stages), output của stage phía trước là input của stage phía sau.

Dưới đây là phân tích chi tiết của 2 pipeline báo cáo thực tế trong hệ thống:

```
[ orders collection ]
         │
         ▼
 ┌───────────────┐
 │    $match     │  Lọc các đơn hàng đã thanh toán (status: 'paid')
 └───────┬───────┘
         │
         ├─────────────────────────────────────────┐
         │ Pipeline: Doanh thu theo khách hàng     │ Pipeline: Top sản phẩm bán chạy
         ▼                                         ▼
 ┌───────────────┐                         ┌───────────────┐
 │    $group     │                         │    $unwind    │ Phẳng hóa mảng items
 └───────┬───────┘                         └───────┬───────┘
         │                                         │
 ┌───────────────┐                         ┌───────────────┐
 │     $sort     │                         │    $group     │
 └───────┬───────┘                         └───────┬───────┘
         │                                         │
 ┌───────────────┐                         ┌───────────────┐
 │    $lookup    │                         │     $sort     │
 └───────┬───────┘                         └───────┬───────┘
         │                                         │
 ┌───────────────┐                         ┌───────────────┐
 │    $unwind    │                         │   $project    │
 └───────┬───────┘                         └───────┬───────┘
         │                                         │
 ┌───────────────┐                         ┌───────────────┐
 │   $project    │                         │    $limit     │ (Tuỳ chọn)
 └───────┬───────┘                         └───────────────┘
         │
 ┌───────────────┐
 │    $limit     │ (Tuỳ chọn)
 └───────────────┘
```

### Pipeline 1: Báo cáo Doanh thu theo Khách hàng (`revenueByCustomer`)
1. **`$match`**: `{ status: 'paid' }`
   - *Mục đích*: Loại bỏ sớm các đơn hàng `pending` hoặc `cancelled` ngay từ đầu pipeline. Tận dụng tối đa chỉ mục `{ status: 1 }` để giảm số document cần quét vào RAM (Early Filtering).
2. **`$group`**:
   - `_id: '$customerId'`
   - `totalSpent: { $sum: '$total' }`
   - `orderCount: { $sum: 1 }`
   - *Mục đích*: Gom nhóm tất cả các đơn hàng thuộc cùng một khách hàng để tính tổng số tiền đã chi tiêu và tổng số đơn thành công.
3. **`$sort`**: `{ totalSpent: -1 }`
   - *Mục đích*: Xếp hạng khách hàng chi tiêu nhiều nhất lên đầu bảng.
4. **`$lookup`**:
   - `from: 'customers'`, `localField: '_id'`, `foreignField: '_id'`, `as: 'customer'`
   - *Mục đích*: Thực hiện Left Outer Join sang collection `customers` để làm giàu thông tin (lấy tên, email). Thực hiện `$lookup` *sau* khi đã `$group` giúp giảm số lượng join operations chỉ bằng đúng số lượng khách hàng duy nhất thay vì join trên toàn bộ mọi đơn hàng.
5. **`$unwind`**:
   - `path: '$customer'`, `preserveNullAndEmptyArrays: true`
   - *Mục đích*: Chuyển đổi mảng một phần tử `customer: [...]` thành object phẳng `customer: {...}` để thuận tiện cho việc định hình dữ liệu, đồng thời không loại trừ những đơn hàng có khách hàng thiếu thông tin.
6. **`$project`**:
   - `_id: 0, customerId: '$_id', customerName: '$customer.name', customerEmail: '$customer.email', totalSpent: 1, orderCount: 1`
   - *Mục đích*: Chọn lọc các trường cần thiết trả về cho phía frontend / client, ẩn đi cấu trúc nội bộ không cần thiết.

---

### Pipeline 2: Báo cáo Top Sản phẩm Bán chạy (`topSellingProducts`)
1. **`$match`**: `{ status: 'paid' }`
   - *Mục đích*: Chỉ xét các mặt hàng nằm trong các đơn đã hoàn tất thanh toán.
2. **`$unwind`**: `'$items'`
   - *Mục đích*: Tách rời mảng mảng giỏ hàng. Nếu một đơn hàng có 3 món trong mảng `items`, stage này sẽ nhân bản document đơn hàng thành 3 document độc lập, mỗi document chứa một phần tử của item để chuẩn bị gom nhóm.
3. **`$group`**:
   - `_id: '$items.productId'`
   - `name: { $first: '$items.name' }`
   - `totalQuantitySold: { $sum: '$items.quantity' }`
   - `totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }`
   - *Mục đích*: Gom nhóm theo mã sản phẩm `productId`. Sử dụng toán tử lũy kế `$sum` để cộng dồn số lượng bán ra và doanh thu của từng sản phẩm. Toán tử `$first` lấy tên sản phẩm đại diện đã được snapshot.
4. **`$sort`**: `{ totalQuantitySold: -1, totalRevenue: -1, _id: 1 }`
   - *Mục đích*: Sắp xếp số lượng bán giảm dần. Đặc biệt bổ sung **tie-breakers**: khi hai sản phẩm có cùng số lượng bán, sản phẩm mang lại doanh thu cao hơn (`totalRevenue: -1`) sẽ xếp trước; nếu cả hai tiêu chí trùng nhau thì dùng `_id: 1` để đảm bảo thứ tự phân trang ổn định (deterministic sorting).
5. **`$project`**:
   - `_id: 0, productId: '$_id', name: 1, totalQuantitySold: 1, totalRevenue: 1`
   - *Mục đích*: Trả về dữ liệu sạch sẽ, rõ ràng chuẩn REST API.
6. **`$limit`**:
   - *Mục đích*: Giới hạn số lượng top sản phẩm theo tham số truy vấn của người dùng (ví dụ top 5 hoặc top 10).
