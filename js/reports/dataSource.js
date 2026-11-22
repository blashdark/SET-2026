let sharedDb;
try {
  sharedDb = require('../db');
} catch {
  // Graceful fallback for isolated test environments
}

const { MongoClient, ObjectId } = require('mongodb');

let client, db, orders, customers;

if (sharedDb && sharedDb.orders && sharedDb.customers) {
  client = sharedDb.client;
  db = sharedDb.db;
  orders = sharedDb.orders;
  customers = sharedDb.customers;
} else {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
  client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    ...(process.env.MONGODB_USER ? {
      auth: { username: process.env.MONGODB_USER, password: process.env.MONGODB_PASSWORD },
      ...(/[?&]authSource=/i.test(uri) ? {} : { authSource: 'admin' }),
    } : {}),
  });
  db = client.db(process.env.MONGODB_DB || 'set2026');
  orders = db.collection('orders');
  customers = db.collection('customers');
}

function parseLimit(limit, defaultVal = 0) {
  if (limit === undefined || limit === null) return defaultVal;
  const parsed = parseInt(limit, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultVal;
}

async function revenueByCustomer(options = {}) {
  const matchStage = { status: 'paid' };
  if (options.customerId) {
    if (typeof options.customerId === 'string' && ObjectId.isValid(options.customerId)) {
      matchStage.customerId = new ObjectId(options.customerId);
    } else {
      matchStage.customerId = options.customerId;
    }
  }

  const pipeline = [
    { $match: matchStage },
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

  const limit = parseLimit(options.limit);
  if (limit > 0) {
    pipeline.push({ $limit: limit });
  }

  return orders.aggregate(pipeline).toArray();
}

async function topSellingProducts(options = {}) {
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
    { $sort: { totalQuantitySold: -1, totalRevenue: -1, _id: 1 } },
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

  const limit = parseLimit(options.limit);
  if (limit > 0) {
    pipeline.push({ $limit: limit });
  }

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
