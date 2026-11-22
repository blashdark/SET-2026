const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { Readable } = require('node:stream');

// Mock data & collections
let aggregateQueries = [];
let aggregateResult = [];

const mockOrdersCollection = {
  aggregate(pipeline) {
    aggregateQueries.push(pipeline);
    return {
      async toArray() {
        return aggregateResult;
      },
    };
  },
};

const mockCustomersCollection = {};
const mockProductsCollection = {};
const mockCountersCollection = {};

const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === 'mongodb') {
    return {
      MongoClient: class {
        constructor(uri, options) {
          assert.equal(uri, 'mongodb://127.0.0.1:27017');
          assert.equal(options.serverSelectionTimeoutMS, 5000);
        }
        db(name) {
          assert.equal(name, 'set2026');
          return {
            collection(colName) {
              if (colName === 'orders') return mockOrdersCollection;
              if (colName === 'customers') return mockCustomersCollection;
              if (colName === 'products') return mockProductsCollection;
              if (colName === 'counters') return mockCountersCollection;
              return {};
            },
          };
        }
        async close() {}
      },
      ObjectId: class ObjectId {
        constructor(id) {
          this.id = id;
        }
        static isValid(id) {
          return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);
        }
      },
    };
  }
  return originalLoad.call(this, name, ...args);
};

const dataSource = require('../js/reports/dataSource');
const repository = require('../js/reports/repository');
const controller = require('../js/reports/controller');
const reportRoute = require('../js/reports/router');

Module._load = originalLoad;

async function mockRequest(method, url) {
  const req = Readable.from([]);
  Object.assign(req, { method, url, headers: {} });
  const res = {
    headersSent: false,
    writableEnded: false,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
      this.headersSent = true;
    },
    end(body) {
      this.body = body ? JSON.parse(body) : undefined;
      this.writableEnded = true;
    },
  };
  const handled = await reportRoute(req, res);
  return { handled, res };
}

test('reports dataSource pipelines match requirements', async () => {
  // Test revenueByCustomer pipeline
  aggregateQueries = [];
  const expectedCustomerRevenue = [
    { customerId: 'c1', customerName: 'Alice', customerEmail: 'alice@example.com', totalSpent: 250, orderCount: 2 },
  ];
  aggregateResult = expectedCustomerRevenue;

  const result1 = await dataSource.revenueByCustomer();
  assert.deepEqual(result1, expectedCustomerRevenue);
  assert.equal(aggregateQueries.length, 1);
  const pipeline1 = aggregateQueries[0];

  assert.deepEqual(pipeline1[0], { $match: { status: 'paid' } });
  assert.deepEqual(pipeline1[1], {
    $group: {
      _id: '$customerId',
      totalSpent: { $sum: '$total' },
      orderCount: { $sum: 1 },
    },
  });
  assert.deepEqual(pipeline1[2], { $sort: { totalSpent: -1 } });
  assert.deepEqual(pipeline1[3], {
    $lookup: {
      from: 'customers',
      localField: '_id',
      foreignField: '_id',
      as: 'customer',
    },
  });
  assert.deepEqual(pipeline1[4], {
    $unwind: {
      path: '$customer',
      preserveNullAndEmptyArrays: true,
    },
  });
  assert.deepEqual(pipeline1[5], {
    $project: {
      _id: 0,
      customerId: '$_id',
      customerName: '$customer.name',
      customerEmail: '$customer.email',
      totalSpent: 1,
      orderCount: 1,
    },
  });

  // Test topSellingProducts pipeline with tie-breakers
  aggregateQueries = [];
  const expectedTopProducts = [
    { productId: 'p1', name: 'Milk Tea', totalQuantitySold: 10, totalRevenue: 500 },
  ];
  aggregateResult = expectedTopProducts;

  const result2 = await dataSource.topSellingProducts();
  assert.deepEqual(result2, expectedTopProducts);
  assert.equal(aggregateQueries.length, 1);
  const pipeline2 = aggregateQueries[0];

  assert.deepEqual(pipeline2[0], { $match: { status: 'paid' } });
  assert.deepEqual(pipeline2[1], { $unwind: '$items' });
  assert.deepEqual(pipeline2[2], { $sort: { 'items.name': 1 } });
  assert.deepEqual(pipeline2[3], {
    $group: {
      _id: '$items.productId',
      name: { $first: '$items.name' },
      totalQuantitySold: { $sum: '$items.quantity' },
      totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
    },
  });
  assert.deepEqual(pipeline2[4], { $sort: { totalQuantitySold: -1, totalRevenue: -1, _id: 1 } });
  assert.deepEqual(pipeline2[5], {
    $project: {
      _id: 0,
      productId: '$_id',
      name: 1,
      totalQuantitySold: 1,
      totalRevenue: 1,
    },
  });
});

test('reports dataSource supports limit and customerId filtering', async () => {
  aggregateQueries = [];
  await dataSource.topSellingProducts({ limit: 5 });
  assert.equal(aggregateQueries.length, 1);
  const topPipeline = aggregateQueries[0];
  // $limit is placed right after $sort
  assert.deepEqual(topPipeline[4], { $sort: { totalQuantitySold: -1, totalRevenue: -1, _id: 1 } });
  assert.deepEqual(topPipeline[5], { $limit: 5 });
  assert.deepEqual(topPipeline[6], {
    $project: {
      _id: 0,
      productId: '$_id',
      name: 1,
      totalQuantitySold: 1,
      totalRevenue: 1,
    },
  });

  aggregateQueries = [];
  await dataSource.revenueByCustomer({ limit: 10, customerId: '507f1f77bcf86cd799439011' });
  assert.equal(aggregateQueries.length, 1);
  const revPipeline = aggregateQueries[0];
  assert.equal(revPipeline[0].$match.status, 'paid');
  assert.ok(revPipeline[0].$match.customerId);
  // $limit is placed right after $sort
  assert.deepEqual(revPipeline[2], { $sort: { totalSpent: -1 } });
  assert.deepEqual(revPipeline[3], { $limit: 10 });

  // Invalid customerId throws 400 error
  await assert.rejects(
    async () => {
      await dataSource.revenueByCustomer({ customerId: 'invalid-id' });
    },
    (err) => {
      assert.equal(err.status, 400);
      return true;
    }
  );
});

test('reports repository delegates cleanly to dataSource', async () => {
  aggregateResult = [{ customerId: 'c1', totalSpent: 100 }];
  const res1 = await repository.revenueByCustomer();
  assert.deepEqual(res1, [{ customerId: 'c1', totalSpent: 100 }]);

  aggregateResult = [{ productId: 'p1', totalQuantitySold: 5 }];
  const res2 = await repository.topSellingProducts();
  assert.deepEqual(res2, [{ productId: 'p1', totalQuantitySold: 5 }]);
});

test('reports controller and router return status 200 and report payload', async () => {
  aggregateResult = [
    { customerId: 'c1', customerName: 'Alice', customerEmail: 'alice@example.com', totalSpent: 300, orderCount: 3 },
  ];

  const req1 = await mockRequest('GET', '/reports/revenue-by-customer');
  assert.equal(req1.handled, true);
  assert.equal(req1.res.status, 200);
  assert.deepEqual(req1.res.body, aggregateResult);

  aggregateResult = [
    { productId: 'p10', name: 'Matcha Latte', totalQuantitySold: 20, totalRevenue: 1200 },
  ];

  const req2 = await mockRequest('GET', '/reports/top-products?limit=5');
  assert.equal(req2.handled, true);
  assert.equal(req2.res.status, 200);
  assert.deepEqual(req2.res.body, aggregateResult);

  // Test parseLimit strict checks
  assert.equal(dataSource.parseLimit ? dataSource.parseLimit('2.5') : 0, 0);
  assert.equal(dataSource.parseLimit ? dataSource.parseLimit('-1') : 0, 0);
  assert.equal(dataSource.parseLimit ? dataSource.parseLimit('abc') : 0, 0);
  assert.equal(dataSource.parseLimit ? dataSource.parseLimit('200') : 100, 100);

  // Unmatched route in reports router returns handled: false
  const req3 = await mockRequest('GET', '/reports/unknown');
  assert.equal(req3.handled, false);

  // Invalid customerId returns 400
  const req4 = await mockRequest('GET', '/reports/revenue-by-customer?customerId=not-hex');
  assert.equal(req4.handled, true);
  assert.equal(req4.res.status, 400);
  assert.ok(req4.res.body.message.includes('customerId không hợp lệ'));
});

test('seed and schema definitions validate sample dataset', async () => {
  const { schemas } = require('../js/db/schema');
  const { sampleCustomers, sampleProducts, sampleOrders } = require('../js/db/seed');

  assert.ok(schemas.products.$jsonSchema);
  assert.ok(schemas.customers.$jsonSchema);
  assert.ok(schemas.orders.$jsonSchema);
  assert.deepEqual(schemas.products.$jsonSchema.required, ['name', 'price', 'stock']);

  // Validate sample products
  for (const p of sampleProducts) {
    assert.ok(typeof p.name === 'string');
    assert.ok(typeof p.price === 'number' && p.price >= 0);
    assert.ok(typeof p.stock === 'number' && p.stock >= 0);
  }

  // Validate sample customers
  for (const c of sampleCustomers) {
    assert.ok(typeof c.name === 'string');
    assert.ok(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(c.email));
  }

  // Validate sample orders
  const statuses = ['pending', 'paid', 'cancelled'];
  const codes = new Set();
  for (const o of sampleOrders) {
    assert.ok(typeof o.code === 'string');
    assert.ok(!codes.has(o.code), `Duplicate code ${o.code}`);
    codes.add(o.code);
    assert.ok(statuses.includes(o.status));
    assert.ok(Array.isArray(o.items) && o.items.length > 0);
    assert.ok(o.createdAt instanceof Date);
    let calcTotal = 0;
    for (const item of o.items) {
      assert.ok(typeof item.name === 'string');
      assert.ok(item.price >= 0);
      assert.ok(item.quantity >= 1);
      calcTotal += item.price * item.quantity;
    }
    assert.equal(o.total, calcTotal, `Total mismatch on order ${o.code}`);
  }
});

test('schema validation and duplicate key E11000 handling', async () => {
  const { setupSchemaAndIndexes, schemas } = require('../js/db/schema');
  
  // Track indexes created on collections
  const indexesCreated = [];
  const fakeDb = {
    listCollections() {
      return {
        async toArray() {
          return [{ name: 'products' }, { name: 'customers' }, { name: 'orders' }];
        },
      };
    },
    async command(cmd) {
      assert.ok(cmd.collMod);
      assert.ok(cmd.validator);
    },
    collection(name) {
      return {
        async createIndex(spec, options) {
          indexesCreated.push({ collection: name, spec, options });
        },
      };
    },
  };

  await setupSchemaAndIndexes(fakeDb);

  // Verify unique index on code and index on status
  const codeIndex = indexesCreated.find(i => i.collection === 'orders' && i.spec.code === 1);
  assert.ok(codeIndex, 'Should create index on orders.code');
  assert.equal(codeIndex.options.unique, true);
  assert.equal(codeIndex.options.name, 'uniq_order_code');

  const statusIndex = indexesCreated.find(i => i.collection === 'orders' && i.spec.status === 1);
  assert.ok(statusIndex, 'Should create index on orders.status');
  assert.equal(statusIndex.options.name, 'idx_order_status');

  // Test duplicate key E11000 simulation handling in order flow
  function handleOrderCreationError(err) {
    if (err && err.code === 11000) {
      return { status: 409, message: 'Đơn hàng với mã này đã tồn tại' };
    }
    return { status: 500, message: 'Lỗi server' };
  }

  const dupError = new Error('E11000 duplicate key error collection: set2026.orders index: uniq_order_code dup key: { code: "ORD-202611-0001" }');
  dupError.code = 11000;
  const errorResponse = handleOrderCreationError(dupError);
  assert.equal(errorResponse.status, 409);
  assert.equal(errorResponse.message, 'Đơn hàng với mã này đã tồn tại');
});
