const { ObjectId } = require('mongodb');
const { products, customers, orders, counters } = require('../db');
const { setupSchemaAndIndexes } = require('./schema');

const sampleCustomers = [
  {
    _id: new ObjectId('673000000000000000000001'),
    name: 'Nguyễn Văn Thịnh',
    email: 'thinh.nguyen@example.com',
  },
  {
    _id: new ObjectId('673000000000000000000002'),
    name: 'Trần Thị Mai',
    email: 'mai.tran@example.com',
  },
  {
    _id: new ObjectId('673000000000000000000003'),
    name: 'Lê Hoàng Long',
    email: 'long.le@example.com',
  },
];

const sampleProducts = [
  { _id: 1, name: 'Trà Sữa Oolong Nướng', price: 35000, stock: 120 },
  { _id: 2, name: 'Trà Sữa Trân Châu Hoàng Kim', price: 40000, stock: 85 },
  { _id: 3, name: 'Cà Phê Muối Huế', price: 29000, stock: 200 },
  { _id: 4, name: 'Matcha Latte Nhật Bản', price: 45000, stock: 50 },
  { _id: 5, name: 'Trà Đào Cam Sả', price: 32000, stock: 95 },
];

const sampleOrders = [
  {
    _id: new ObjectId('673100000000000000000001'),
    code: 'ORD-202611-0001',
    customerId: sampleCustomers[0]._id,
    items: [
      { productId: 1, name: 'Trà Sữa Oolong Nướng', price: 35000, quantity: 2 },
      { productId: 2, name: 'Trà Sữa Trân Châu Hoàng Kim', price: 40000, quantity: 1 },
    ],
    total: 110000,
    status: 'paid',
    createdAt: new Date('2026-11-20T08:30:00Z'),
  },
  {
    _id: new ObjectId('673100000000000000000002'),
    code: 'ORD-202611-0002',
    customerId: sampleCustomers[1]._id,
    items: [
      { productId: 3, name: 'Cà Phê Muối Huế', price: 29000, quantity: 3 },
      { productId: 5, name: 'Trà Đào Cam Sả', price: 32000, quantity: 1 },
    ],
    total: 119000,
    status: 'paid',
    createdAt: new Date('2026-11-20T09:15:00Z'),
  },
  {
    _id: new ObjectId('673100000000000000000003'),
    code: 'ORD-202611-0003',
    customerId: sampleCustomers[0]._id,
    items: [
      { productId: 4, name: 'Matcha Latte Nhật Bản', price: 45000, quantity: 1 },
    ],
    total: 45000,
    status: 'pending',
    createdAt: new Date('2026-11-21T10:00:00Z'),
  },
  {
    _id: new ObjectId('673100000000000000000004'),
    code: 'ORD-202611-0004',
    customerId: sampleCustomers[2]._id,
    items: [
      { productId: 1, name: 'Trà Sữa Oolong Nướng', price: 35000, quantity: 4 },
    ],
    total: 140000,
    status: 'cancelled',
    createdAt: new Date('2026-11-21T14:20:00Z'),
  },
  {
    _id: new ObjectId('673100000000000000000005'),
    code: 'ORD-202611-0005',
    customerId: sampleCustomers[1]._id,
    items: [
      { productId: 1, name: 'Trà Sữa Oolong Nướng', price: 35000, quantity: 1 },
      { productId: 4, name: 'Matcha Latte Nhật Bản', price: 45000, quantity: 2 },
    ],
    total: 125000,
    status: 'paid',
    createdAt: new Date('2026-11-22T08:00:00Z'),
  },
];

async function seedData(collections = { products, customers, orders, counters }) {
  await collections.products.deleteMany({});
  await collections.customers.deleteMany({});
  await collections.orders.deleteMany({});
  await collections.counters.deleteMany({});

  if (sampleProducts.length > 0) {
    await collections.products.insertMany(sampleProducts);
    const maxId = Math.max(...sampleProducts.map(p => typeof p._id === 'number' ? p._id : 0), 0);
    await collections.counters.insertOne({ _id: 'products', seq: maxId });
  }

  if (sampleCustomers.length > 0) {
    await collections.customers.insertMany(sampleCustomers);
  }

  if (sampleOrders.length > 0) {
    await collections.orders.insertMany(sampleOrders);
  }
}

async function runSeed() {
  await setupSchemaAndIndexes();
  await seedData();
  console.log('Seed sample data completed successfully.');
}

if (require.main === module) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}

module.exports = {
  sampleCustomers,
  sampleProducts,
  sampleOrders,
  seedData,
  runSeed,
};
