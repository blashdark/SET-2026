const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 5000,
  ...(process.env.MONGODB_USER ? {
    auth: { username: process.env.MONGODB_USER, password: process.env.MONGODB_PASSWORD },
    ...(/[?&]authSource=/i.test(uri) ? {} : { authSource: 'admin' }),
  } : {}),
});
const db = client.db(process.env.MONGODB_DB || 'set2026');
const orders = db.collection('orders');
const customers = db.collection('customers');

async function revenueByCustomer() {
  const pipeline = [
    { $match: { status: 'paid' } },
    {
      $group: {
        _id: '$customerId',
        totalSpent: { $sum: '$total' },
        orderCount: { $sum: 1 },
      },
    },
    { $sort: { totalSpent: -1 } },
    {
      $lookup: {
        from: 'customers',
        localField: '_id',
        foreignField: '_id',
        as: 'customer',
      },
    },
    {
      $unwind: {
        path: '$customer',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        _id: 0,
        customerId: '$_id',
        customerName: '$customer.name',
        customerEmail: '$customer.email',
        totalSpent: 1,
        orderCount: 1,
      },
    },
  ];

  return orders.aggregate(pipeline).toArray();
}

async function topSellingProducts() {
  const pipeline = [
    { $match: { status: 'paid' } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.productId',
        name: { $first: '$items.name' },
        totalQuantitySold: { $sum: '$items.quantity' },
        totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
      },
    },
    { $sort: { totalQuantitySold: -1 } },
    {
      $project: {
        _id: 0,
        productId: '$_id',
        name: 1,
        totalQuantitySold: 1,
        totalRevenue: 1,
      },
    },
  ];

  return orders.aggregate(pipeline).toArray();
}

async function close() {
  await client.close();
}

module.exports = {
  revenueByCustomer,
  topSellingProducts,
  close,
};
