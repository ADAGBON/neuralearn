const express = require('express');
const path = require('path');
const crypto = require('crypto');
const courses = require('./data/courses.json');
const orderStore = require('./orderStore');

// Coupon codes the store accepts. Percentages are applied to the subtotal.
const COUPONS = {
  LEARNAI10: { percent: 10, label: '10% off your order' },
  STUDENT20: { percent: 20, label: '20% student discount' }
};

// Buying 3 or more courses at once earns an automatic bundle discount.
const BUNDLE_MIN_ITEMS = 3;
const BUNDLE_PERCENT = 15;

const findCourse = (id) => courses.find((c) => c.id === id);

/**
 * Price a cart on the server so totals can never be tampered with in the browser.
 * Each course is a digital product, so duplicates are collapsed to one seat.
 */
function priceCart(itemIds, couponCode) {
  const errors = [];
  const uniqueIds = [...new Set((itemIds || []).map(String))];
  const items = [];

  for (const id of uniqueIds) {
    const course = findCourse(id);
    if (!course) errors.push(`Unknown course: ${id}`);
    else items.push({ id: course.id, title: course.title, price: course.price });
  }

  const subtotal = items.reduce((sum, i) => sum + i.price, 0);
  const discounts = [];

  if (items.length >= BUNDLE_MIN_ITEMS) {
    discounts.push({
      label: `Bundle discount (${BUNDLE_PERCENT}% for ${BUNDLE_MIN_ITEMS}+ courses)`,
      amount: Math.round((subtotal * BUNDLE_PERCENT) / 100)
    });
  }

  let coupon = null;
  if (couponCode) {
    const code = String(couponCode).trim().toUpperCase();
    if (COUPONS[code]) {
      coupon = code;
      const afterBundle = subtotal - discounts.reduce((s, d) => s + d.amount, 0);
      discounts.push({
        label: `${code} — ${COUPONS[code].label}`,
        amount: Math.round((afterBundle * COUPONS[code].percent) / 100)
      });
    } else {
      errors.push(`Coupon "${code}" is not valid`);
    }
  }

  const discountTotal = discounts.reduce((s, d) => s + d.amount, 0);
  return { items, subtotal, discounts, discountTotal, total: subtotal - discountTotal, coupon, errors };
}

function createApp() {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  // Catalogue with optional search & filters: ?q=&category=&level=&format=&sort=
  app.get('/api/courses', (req, res) => {
    const { q, category, level, format, sort } = req.query;
    let list = [...courses];

    if (q) {
      const needle = String(q).toLowerCase();
      list = list.filter((c) =>
        [c.title, c.summary, c.instructor, c.category].join(' ').toLowerCase().includes(needle)
      );
    }
    if (category) list = list.filter((c) => c.category === category);
    if (level) list = list.filter((c) => c.level === level);
    if (format) list = list.filter((c) => c.format === format);

    const sorters = {
      'price-asc': (a, b) => a.price - b.price,
      'price-desc': (a, b) => b.price - a.price,
      rating: (a, b) => b.rating - a.rating,
      popular: (a, b) => b.students - a.students
    };
    if (sorters[sort]) list.sort(sorters[sort]);

    res.json({
      count: list.length,
      courses: list,
      filters: {
        categories: [...new Set(courses.map((c) => c.category))],
        levels: ['Beginner', 'Intermediate', 'Advanced'],
        formats: [...new Set(courses.map((c) => c.format))]
      }
    });
  });

  app.get('/api/courses/:id', (req, res) => {
    const course = findCourse(req.params.id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    res.json(course);
  });

  // Quote a cart (used by the cart drawer to show discounts before checkout).
  app.post('/api/cart/quote', (req, res) => {
    const quote = priceCart(req.body.items, req.body.coupon);
    res.json(quote);
  });

  // Place an order.
  app.post('/api/orders', (req, res) => {
    const { items, coupon, customer } = req.body || {};
    const errors = [];

    const name = customer && String(customer.name || '').trim();
    const email = customer && String(customer.email || '').trim();
    if (!name) errors.push('Name is required');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('A valid email is required');
    if (!Array.isArray(items) || items.length === 0) errors.push('Your cart is empty');

    const quote = priceCart(items, coupon);
    errors.push(...quote.errors);
    if (errors.length) return res.status(400).json({ errors });

    const order = {
      id: 'NL-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
      createdAt: new Date().toISOString(),
      customer: { name, email },
      items: quote.items,
      subtotal: quote.subtotal,
      discounts: quote.discounts,
      total: quote.total,
      status: 'paid'
    };
    orderStore.save(order);
    res.status(201).json(order);
  });

  app.get('/api/orders/:id', (req, res) => {
    const order = orderStore.get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  });

  // Unknown API routes return JSON; everything else falls back to the storefront.
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

  return app;
}

module.exports = { createApp, priceCart };
