const { test, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');

process.env.ORDERS_FILE = path.join(os.tmpdir(), `neuralearn-orders-${Date.now()}.json`);
const { createApp, priceCart } = require('../src/app');

let server;
let base;

before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const post = (p, body) =>
  fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('lists all courses', async () => {
  const res = await fetch(base + '/api/courses');
  const data = await res.json();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.count, 12);
});

test('filters and searches courses', async () => {
  const data = await (await fetch(base + '/api/courses?level=Advanced&q=agents')).json();
  assert.deepStrictEqual(data.courses.map((c) => c.id), ['ai-agents']);
});

test('returns 404 for unknown course', async () => {
  const res = await fetch(base + '/api/courses/nope');
  assert.strictEqual(res.status, 404);
});

test('applies bundle discount for 3+ courses and coupon on top', () => {
  const q = priceCart(['ai-ethics', 'prompt-engineering', 'python-for-ai'], 'learnai10');
  assert.strictEqual(q.subtotal, 45000);
  assert.strictEqual(q.discounts[0].amount, 6750); // 15% bundle
  assert.strictEqual(q.discounts[1].amount, 3825); // 10% of 38,250
  assert.strictEqual(q.total, 34425);
});

test('ignores duplicate cart items and rejects bad coupons', () => {
  const q = priceCart(['ai-ethics', 'ai-ethics'], 'FAKE');
  assert.strictEqual(q.items.length, 1);
  assert.strictEqual(q.total, 10000);
  assert.match(q.errors[0], /not valid/);
});

test('creates and fetches an order with server-side totals', async () => {
  const res = await post('/api/orders', {
    items: ['llm-apps'],
    customer: { name: 'Ada Lovelace', email: 'ada@example.com' }
  });
  assert.strictEqual(res.status, 201);
  const order = await res.json();
  assert.strictEqual(order.total, 60000);
  const fetched = await (await fetch(base + '/api/orders/' + order.id)).json();
  assert.strictEqual(fetched.id, order.id);
});

test('rejects invalid orders', async () => {
  const res = await post('/api/orders', { items: [], customer: { name: '', email: 'bad' } });
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.strictEqual(body.errors.length, 3);
});
