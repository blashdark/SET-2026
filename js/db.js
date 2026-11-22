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

const products = db.collection('products');
const counters = db.collection('counters');
const customers = db.collection('customers');
const orders = db.collection('orders');

async function close() {
  await client.close();
}

module.exports = {
  client,
  db,
  products,
  counters,
  customers,
  orders,
  close,
};
