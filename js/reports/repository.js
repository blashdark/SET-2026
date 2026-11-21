const dataSource = require('./dataSource');

async function revenueByCustomer() {
  return dataSource.revenueByCustomer();
}

async function topSellingProducts() {
  return dataSource.topSellingProducts();
}

module.exports = {
  revenueByCustomer,
  topSellingProducts,
};
