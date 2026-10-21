const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'products.json');

// Đọc dữ liệu từ nơi lưu trữ (hiện tại là file JSON).
function load() {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return [];
  }
}

// Ghi đè toàn bộ dữ liệu xuống nơi lưu trữ.
// Ghi ra file tạm rồi rename để tránh file bị hỏng dở dang.
function save(products) {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(products, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

module.exports = { load, save };
