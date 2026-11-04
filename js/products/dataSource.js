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

function toProduct(doc) {
  if (!doc) return null;
  return { id: doc._id, name: doc.name, price: doc.price };
}

async function all() {
  return (await products.find({}).sort({ _id: 1 }).toArray()).map(toProduct);
}

async function findById(id) {
  return toProduct(await products.findOne({ _id: id }));
}

async function create({ name, price }) {
  const counter = await counters.findOneAndUpdate(
    { _id: 'products' }, { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', includeResultMetadata: false },
  );
  const doc = { _id: counter.seq, name, price };
  await products.insertOne(doc);
  return toProduct(doc);
}

async function replace(id, { name, price }) {
  return toProduct(await products.findOneAndReplace(
    { _id: id }, { _id: id, name, price },
    { returnDocument: 'after', includeResultMetadata: false },
  ));
}

async function update(id, patch) {
  if (Object.keys(patch).length === 0) return findById(id);
  return toProduct(await products.findOneAndUpdate(
    { _id: id }, { $set: patch },
    { returnDocument: 'after', includeResultMetadata: false },
  ));
}

async function remove(id) {
  return toProduct(await products.findOneAndDelete(
    { _id: id }, { includeResultMetadata: false },
  ));
}

async function close() {
  await client.close();
}

module.exports = { all, findById, create, replace, update, remove, close };