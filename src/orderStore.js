const fs = require('fs');
const path = require('path');

// Simple JSON-file order store. Swap for MongoDB/Postgres in production.
const FILE = process.env.ORDERS_FILE || path.join(__dirname, 'data', 'orders.json');
let orders = [];

try {
  orders = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch {
  orders = [];
}

function persist() {
  try {
    fs.writeFileSync(FILE, JSON.stringify(orders, null, 2));
  } catch (err) {
    console.warn('Could not write orders file:', err.message);
  }
}

module.exports = {
  save(order) {
    orders.push(order);
    persist();
    return order;
  },
  get(id) {
    return orders.find((o) => o.id === id) || null;
  }
};
