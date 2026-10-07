const gioHang = [
  { ten: "Áo thun", gia: 150000, soLuong: 2 },
  { ten: "Quần jean", gia: 350000, soLuong: 1 },
  { ten: "Nón lưỡi trai", gia: 90000, soLuong: 3 },
  { ten: "Giày sneaker", gia: 650000, soLuong: 1 },
  { ten: "Vớ cổ ngắn", gia: 25000, soLuong: 5 },
];

const inGioHang = (danhSach) => {
  for (let mon of danhSach) {
    const { ten, gia, soLuong } = mon;
    console.log(`${ten} x ${soLuong} = ${gia * soLuong} đồng`);
  }
}

const tinhTong = (danhSach) => {
  return danhSach.reduce(
    (tong, { gia, soLuong }) => tong + gia * soLuong, 0
  );
}

const locHangDat = (danhSach, moc = 200000) => {
  return danhSach.filter(({gia}) => gia > moc)
}

inGioHang(gioHang);
console.log(`Tổng: ${tinhTong(gioHang)} đồng`);
console.log(locHangDat(gioHang));

//Phần 2
const timTheoTen = (tenCanTim) => {
  return gioHang.find(({ten}) => ten === tenCanTim) ?? "Không có sản phẩm cần tìm"
}

const themVaoGio = (danhSach, sanPham) => {
  console.log(`Giỏ hàng cũ: `, danhSach);
  return [...danhSach, sanPham];
}

const apDungGiamGia = (sanPham, phanTramGiam) => {
  return { ...sanPham, gia: sanPham.gia * (1 - phanTramGiam / 100)}
}

const moTaDon = (danhSach) => {
  console.log(`Tên khách: Thịnh
Danh sách món: ${JSON.stringify(danhSach)}
Tổng tiền: ${tinhTong(danhSach)} đồng`)
}

console.log(timTheoTen("Áo thun"));
console.log(`Giỏ hàng mới: `, themVaoGio(gioHang, { ten: "Dép lào", gia: 20000, soLuong: 99 }));
console.log(apDungGiamGia(gioHang[0], 10));
moTaDon(gioHang);
