# Đáp án bài 2 - đoạn code này đặt ở đâu

Chỉ mở sau khi cặp em đã đối chiếu xong với cặp bạn. Đoạn 11 nhận hai đáp án, miễn lý do đúng.

| Đoạn | Phần | Vì sao |
|---|---|---|
| 1 `formatVnd` | Helper / utils | Format dữ liệu, dùng lại nhiều chỗ, không đụng `req`, `res` |
| 2 `requireJson` | Middleware | Kiểm header cho mọi route nhận body, không phải business logic, tự trả 415 và dừng request |
| 3 `limitRequest` | Middleware | Giới hạn số request theo IP, áp cho cả app, tự trả 429 và dừng request |
| 4 kiểm `stock` | Controller | Luật "không đủ hàng thì không cho đặt" là business logic của API đặt hàng; nó gọi repository rồi chọn status |
| 5 `getUsdToVndRate` | Service | Gọi API của bên thứ ba (open.er-api.com) |
| 6 `findCheaperThan` | Repository | Thao tác tìm trên dữ liệu, nhận số trả mảng, không biết `req`, `res` |
| 7 `load` đọc file orders | DataSource | Biết dữ liệu nằm ở file nào và đọc nó lên |
| 8 `{ method: 'GET', path: '/orders/:id', ... }` | Router | Ghép method + URL với middleware và controller |
| 9 `isPositiveInteger` | Helper / utils | Kiểm một giá trị, dùng lại nhiều chỗ, không đụng `req`, `res` |
| 10 `sendOrderEmail` | Service | Gửi email qua hệ thống bên ngoài |
| 11 tính `total` có giảm 10% | Controller hoặc Helper / utils | Luật "trên 500000 thì giảm 10%" là business logic nên nằm ở controller là đúng. Tách thành hàm `calcTotal(order)` không đụng `req`, `res` để nhiều controller dùng lại thì là helper, cũng đúng |
| 12 `logRequest` | Middleware | Ghi log mọi request, không phải business logic |
| 13 `readBody` | Middleware | Đọc body là việc chung của mọi route ghi, không phải business logic, và hàm này đọc thẳng từ `req` nên không phải helper. Trong `buoc-3` hàm này nằm ở `http-utils.js` và controller tự gọi; bài 4 chuyển việc gọi nó sang một middleware |

Đoạn em xếp sai: ghi lại vì sao lúc đầu xếp vậy. Hay nhầm nhất là đoạn 2, 3 (xếp vào controller vì thấy `sendJson`), đoạn 12 (xếp vào helper vì chỉ có một dòng `console.log`), đoạn 13 (xếp vào controller vì `buoc-3` để controller gọi nó) và đoạn 5, 10 (xếp vào helper vì là một hàm nhỏ). Câu hỏi để tự kiểm: đoạn này có phải luật riêng của một API không (controller), có gọi ra ngoài hệ thống không (service), có đụng `req`, `res` không (helper thì không).
