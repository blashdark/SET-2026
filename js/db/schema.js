const { db } = require('../db');

const schemas = {
  products: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'price', 'stock'],
      properties: {
        _id: {
          bsonType: ['int', 'long', 'double', 'objectId'],
          description: 'Unique product identifier (numeric or ObjectId)',
        },
        name: {
          bsonType: 'string',
          description: 'Product name must be a string and is required',
        },
        price: {
          bsonType: ['int', 'long', 'double', 'decimal'],
          minimum: 0,
          description: 'Price must be a non-negative number and is required',
        },
        stock: {
          bsonType: ['int', 'long', 'double'],
          minimum: 0,
          description: 'Available stock quantity must be a non-negative integer/number',
        },
      },
    },
  },

  customers: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'email'],
      properties: {
        _id: {
          bsonType: 'objectId',
          description: 'Unique customer identifier',
        },
        name: {
          bsonType: 'string',
          description: 'Customer full name is required',
        },
        email: {
          bsonType: 'string',
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
          description: 'Valid customer email is required',
        },
      },
    },
  },

  orders: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['code', 'customerId', 'items', 'total', 'status', 'createdAt'],
      properties: {
        _id: {
          bsonType: 'objectId',
          description: 'Unique order identifier',
        },
        code: {
          bsonType: 'string',
          description: 'Unique business order code (e.g. ORD-202611-0001)',
        },
        customerId: {
          bsonType: 'objectId',
          description: 'Reference to customers._id',
        },
        items: {
          bsonType: 'array',
          minItems: 1,
          description: 'List of purchased items snapshotted at order creation',
          items: {
            bsonType: 'object',
            required: ['productId', 'name', 'price', 'quantity'],
            properties: {
              productId: {
                bsonType: ['int', 'long', 'double', 'objectId'],
                description: 'Product ID at time of order',
              },
              name: {
                bsonType: 'string',
                description: 'Snapshotted product name',
              },
              price: {
                bsonType: ['int', 'long', 'double', 'decimal'],
                minimum: 0,
                description: 'Snapshotted unit price at time of purchase',
              },
              quantity: {
                bsonType: ['int', 'long', 'double'],
                minimum: 1,
                description: 'Purchased quantity, must be >= 1',
              },
            },
          },
        },
        total: {
          bsonType: ['int', 'long', 'double', 'decimal'],
          minimum: 0,
          description: 'Calculated order total',
        },
        status: {
          enum: ['pending', 'paid', 'cancelled'],
          description: 'Order status: pending, paid, or cancelled',
        },
        createdAt: {
          bsonType: 'date',
          description: 'Order creation timestamp',
        },
      },
    },
  },
};

async function setupSchemaAndIndexes(targetDb = db) {
  const existingCollections = (await targetDb.listCollections().toArray()).map(c => c.name);

  for (const [colName, schemaRule] of Object.entries(schemas)) {
    if (!existingCollections.includes(colName)) {
      await targetDb.createCollection(colName, {
        validator: schemaRule,
        validationAction: 'error',
        validationLevel: 'moderate',
      });
    } else {
      await targetDb.command({
        collMod: colName,
        validator: schemaRule,
        validationAction: 'error',
        validationLevel: 'moderate',
      });
    }
  }

  // Ensure unique index on orders.code
  const ordersCol = targetDb.collection('orders');
  await ordersCol.createIndex({ code: 1 }, { unique: true, name: 'uniq_order_code' });
  await ordersCol.createIndex({ status: 1 }, { name: 'idx_order_status' });
}

if (require.main === module) {
  setupSchemaAndIndexes()
    .then(async () => {
      console.log('Schema validation and indexes set up successfully.');
      const { close } = require('../db');
      if (close) await close();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Failed to setup schema and indexes:', err);
      process.exit(1);
    });
}

module.exports = {
  schemas,
  setupSchemaAndIndexes,
};
