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
function save(products) {
  fs.writeFileSync(filePath, JSON.stringify(products, null, 2), 'utf8');
}

module.exports = { load, save };
