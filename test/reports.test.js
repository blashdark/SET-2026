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
              return {};
            },
          };
        }
        async close() {}
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

  // Test topSellingProducts pipeline
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
  assert.deepEqual(pipeline2[2], {
    $group: {
      _id: '$items.productId',
      name: { $first: '$items.name' },
      totalQuantitySold: { $sum: '$items.quantity' },
      totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
    },
  });
  assert.deepEqual(pipeline2[3], { $sort: { totalQuantitySold: -1 } });
  assert.deepEqual(pipeline2[4], {
    $project: {
      _id: 0,
      productId: '$_id',
      name: 1,
      totalQuantitySold: 1,
      totalRevenue: 1,
    },
  });
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

  const req2 = await mockRequest('GET', '/reports/top-products');
  assert.equal(req2.handled, true);
  assert.equal(req2.res.status, 200);
  assert.deepEqual(req2.res.body, aggregateResult);

  // Unmatched route in reports router returns handled: false
  const req3 = await mockRequest('GET', '/reports/unknown');
  assert.equal(req3.handled, false);
});
