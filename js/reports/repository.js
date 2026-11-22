const dataSource = require('./dataSource');

async function revenueByCustomer(options) {
  return dataSource.revenueByCustomer(options);
}

async function topSellingProducts(options) {
  return dataSource.topSellingProducts(options);
}

module.exports = {
  revenueByCustomer,
  topSellingProducts,
};
