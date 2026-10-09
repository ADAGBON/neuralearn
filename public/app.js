(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
  const fmt = (n) => naira.format(n);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const STORAGE_KEY = 'neuralearn-cart';
  const state = {
    courses: [],
    allCourses: new Map(),
    filters: { q: '', category: '', level: '', format: '', sort: 'popular' },
    cart: loadCart(),
    quote: null
  };

  /* ---------------- Storage ---------------- */
  function loadCart() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.items)) return { items: saved.items, coupon: saved.coupon || '' };
    } catch { /* storage unavailable */ }
    return { items: [], coupon: '' };
  }
  function saveCart() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cart)); } catch { /* ignore */ }
  }

  /* ---------------- API ---------------- */
  async function api(path, options = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { data });
    return data;
  }

  /* ---------------- Generative cover art ---------------- */
  // A seeded "neural network" pattern so every course gets a distinct cover.
  function seeded(str) {
    let h = 2166136261;
    for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 10000) / 10000;
  }
  function coverSvg(course) {
    const rand = seeded(course.id);
    const layers = 3 + Math.floor(rand() * 2);
    const nodes = [];
    for (let l = 0; l < layers; l++) {
      const count = 2 + Math.floor(rand() * 3);
      for (let i = 0; i < count; i++) {
        nodes.push({ l, x: 60 + (l * 280) / (layers - 1) + 120, y: ((i + 1) * 160) / (count + 1) });
      }
    }
    let edges = '';
    for (const a of nodes) for (const b of nodes) {
      if (b.l === a.l + 1 && rand() > 0.25) {
        edges += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#fff" stroke-opacity="${(0.15 + rand() * 0.35).toFixed(2)}" stroke-width="1.2"/>`;
      }
    }
    const dots = nodes.map((n, i) =>
      `<circle cx="${n.x}" cy="${n.y}" r="${i % 5 === 0 ? 7 : 5}" fill="${i % 5 === 0 ? '#ffb547' : '#fff'}"/>`
    ).join('');
    return `<svg viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs><linearGradient id="g-${course.id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${course.color}"/><stop offset="1" stop-color="#17143a"/></linearGradient></defs>
      <rect width="400" height="160" fill="url(#g-${course.id})"/>
      <circle cx="40" cy="150" r="90" fill="#fff" fill-opacity=".06"/>
      ${edges}${dots}</svg>`;
  }

  /* ---------------- Catalogue ---------------- */
  let filterTimer;
  async function loadCourses() {
    const params = new URLSearchParams(Object.entries(state.filters).filter(([, v]) => v));
    const data = await api('/api/courses?' + params);
    state.courses = data.courses;
    return data;
  }

  function renderFilters(filters) {
    const chips = $('#categoryChips');
    const cats = ['', ...filters.categories];
    chips.innerHTML = cats.map((c) =>
      `<button class="chip" data-cat="${esc(c)}" aria-pressed="${state.filters.category === c}">${c ? esc(c) : 'All'}</button>`
    ).join('');
    $('#levelFilter').insertAdjacentHTML('beforeend', filters.levels.map((l) => `<option>${esc(l)}</option>`).join(''));
    $('#formatFilter').insertAdjacentHTML('beforeend', filters.formats.map((f) => `<option>${esc(f)}</option>`).join(''));
  }

  function renderGrid() {
    const grid = $('#grid');
    $('#empty').hidden = state.courses.length > 0;
    $('#resultCount').textContent = `${state.courses.length} course${state.courses.length === 1 ? '' : 's'}`;
    grid.innerHTML = state.courses.map((c) => {
      const inCart = state.cart.items.includes(c.id);
      return `<article class="card">
        <div class="cover">${coverSvg(c)}<span class="tag">${esc(c.level)}</span><span class="tag fmt">${esc(c.format)}</span></div>
        <div class="card-body">
          <div class="meta"><span>${esc(c.category)}</span><span>${c.hours} hrs · ${c.lessons} lessons</span></div>
          <h3><button data-view="${c.id}">${esc(c.title)}</button></h3>
          <p>${esc(c.summary)}</p>
          <div class="meta"><span class="star">★ ${c.rating}</span><span>${c.students.toLocaleString()} learners</span><span>${esc(c.instructor)}</span></div>
          <div class="card-foot">
            <span class="price">${fmt(c.price)}</span>
            ${addButton(c.id, inCart)}
          </div>
        </div>
      </article>`;
    }).join('');
  }

  function addButton(id, inCart) {
    return inCart
      ? `<button class="btn btn-primary btn-added" data-open-cart>In cart ✓</button>`
      : `<button class="btn btn-primary" data-add="${id}">Add to cart</button>`;
  }

  async function refreshCatalog() {
    try {
      await loadCourses();
      renderGrid();
    } catch {
      $('#grid').innerHTML = '';
      $('#empty').hidden = false;
      $('#empty').textContent = 'Could not load courses. Please refresh the page.';
    }
  }

  /* ---------------- Course detail ---------------- */
  function openCourse(id) {
    const c = state.allCourses.get(id);
    if (!c) return;
    state.openCourseId = id;
    const inCart = state.cart.items.includes(c.id);
    $('#courseDetail').innerHTML = `
      <div class="detail-cover">${coverSvg(c)}<button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="detail">
        <div class="meta"><span>${esc(c.category)}</span><span class="star">★ ${c.rating}</span><span>${c.students.toLocaleString()} learners</span></div>
        <h2>${esc(c.title)}</h2>
        <p class="muted">Taught by <strong>${esc(c.instructor)}</strong></p>
        <p>${esc(c.summary)}</p>
        <dl class="facts">
          <div><dt>Level</dt><dd>${esc(c.level)}</dd></div>
          <div><dt>Format</dt><dd>${esc(c.format)}</dd></div>
          <div><dt>Length</dt><dd>${c.hours} hours</dd></div>
          <div><dt>Lessons</dt><dd>${c.lessons}</dd></div>
        </dl>
        <h3>What you'll be able to do</h3>
        <ul class="outcomes">${c.outcomes.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
        <div class="detail-foot">
          <span class="price">${fmt(c.price)}</span>
          ${addButton(c.id, inCart)}
        </div>
      </div>`;
    const dlg = $('#courseDialog');
    if (!dlg.open) dlg.showModal();
  }

  /* ---------------- Cart ---------------- */
  function addToCart(id) {
    if (!state.cart.items.includes(id)) state.cart.items.push(id);
    saveCart();
    const c = state.allCourses.get(id);
    toast(`Added “${c ? c.title : 'course'}” to your cart`);
    updateCartUI(true);
  }

  function removeFromCart(id) {
    state.cart.items = state.cart.items.filter((x) => x !== id);
    saveCart();
    updateCartUI();
  }

  async function updateCartUI(bump = false) {
    // Drop anything no longer in the catalogue.
    state.cart.items = state.cart.items.filter((id) => state.allCourses.has(id));
    const count = state.cart.items.length;
    const badge = $('#cartCount');
    badge.textContent = count;
    if (bump) { badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump'); }

    renderGrid();
    if ($('#courseDialog').open && state.openCourseId) {
      const btn = $('#courseDetail .detail-foot .btn');
      if (btn) btn.outerHTML = addButton(state.openCourseId, state.cart.items.includes(state.openCourseId));
    }

    const body = $('#cartItems');
    if (!count) {
      body.innerHTML = `<div class="cart-empty"><p>Your cart is empty.</p><button class="btn btn-ghost" data-close-cart>Browse courses</button></div>`;
      $('#cartFoot').hidden = true;
      state.quote = null;
      return;
    }
    $('#cartFoot').hidden = false;
    body.innerHTML = state.cart.items.map((id) => {
      const c = state.allCourses.get(id);
      return `<div class="line">
        <div class="swatch" style="background:linear-gradient(135deg, ${c.color}, #17143a)"></div>
        <div class="info"><strong>${esc(c.title)}</strong><span>${esc(c.format)} · ${fmt(c.price)}</span></div>
        <button class="remove" data-remove="${c.id}" aria-label="Remove ${esc(c.title)}">Remove</button>
      </div>`;
    }).join('');

    await refreshQuote();
  }

  async function refreshQuote() {
    const couponMsg = $('#couponMsg');
    try {
      const quote = await api('/api/cart/quote', { method: 'POST', body: state.cart });
      if (quote.errors.length && state.cart.coupon) {
        couponMsg.textContent = quote.errors[0];
        couponMsg.className = 'coupon-msg bad';
        state.cart.coupon = '';
        saveCart();
      } else if (quote.coupon) {
        couponMsg.textContent = `Coupon ${quote.coupon} applied`;
        couponMsg.className = 'coupon-msg ok';
      }
      state.quote = quote;
      const left = 3 - quote.items.length;
      $('#totals').innerHTML = `
        <dt>Subtotal (${quote.items.length} course${quote.items.length === 1 ? '' : 's'})</dt><dd>${fmt(quote.subtotal)}</dd>
        ${quote.discounts.map((d) => `<dt class="disc">${esc(d.label)}</dt><dd class="disc">−${fmt(d.amount)}</dd>`).join('')}
        ${left > 0 ? `<dt class="muted small" style="grid-column:1/-1">Add ${left} more course${left === 1 ? '' : 's'} to unlock the 15% bundle discount.</dt>` : ''}
        <dt class="grand">Total</dt><dd class="grand">${fmt(quote.total)}</dd>`;
      $('#payBtn').textContent = `Pay ${fmt(quote.total)}`;
    } catch {
      $('#totals').innerHTML = '<dt>Could not calculate totals.</dt><dd></dd>';
    }
  }

  let lastFocus = null;
  function openCart() {
    lastFocus = document.activeElement;
    $('#cartDrawer').classList.add('open');
    $('#cartDrawer').setAttribute('aria-hidden', 'false');
    $('#scrim').hidden = false;
    $('#closeCart').focus();
  }
  function closeCart() {
    $('#cartDrawer').classList.remove('open');
    $('#cartDrawer').setAttribute('aria-hidden', 'true');
    $('#scrim').hidden = true;
    if (lastFocus) lastFocus.focus();
  }

  /* ---------------- Checkout ---------------- */
  async function placeOrder(form) {
    const errorsBox = $('#checkoutErrors');
    errorsBox.textContent = '';
    const fd = new FormData(form);
    const payBtn = $('#payBtn');
    payBtn.disabled = true;
    payBtn.textContent = 'Processing…';
    try {
      const order = await api('/api/orders', {
        method: 'POST',
        body: {
          items: state.cart.items,
          coupon: state.cart.coupon,
          customer: { name: fd.get('name'), email: fd.get('email') }
        }
      });
      $('#checkoutDialog').close();
      closeCart();
      state.cart = { items: [], coupon: '' };
      saveCart();
      $('#couponInput').value = '';
      $('#couponMsg').textContent = '';
      form.reset();
      showConfirmation(order);
      updateCartUI();
    } catch (err) {
      const list = (err.data && err.data.errors) || [err.message];
      errorsBox.innerHTML = list.map(esc).join('<br>');
    } finally {
      payBtn.disabled = false;
      if (state.quote) payBtn.textContent = `Pay ${fmt(state.quote.total)}`;
    }
  }

  function showConfirmation(order) {
    $('#confirmBody').innerHTML = `<div class="confirm">
      <div class="tick">✓</div>
      <h2>You're enrolled, ${esc(order.customer.name.split(' ')[0])}!</h2>
      <p class="muted">Access details are on their way to ${esc(order.customer.email)}.</p>
      <span class="order-id">Order ${esc(order.id)}</span>
      <ul>${order.items.map((i) => `<li>${esc(i.title)}</li>`).join('')}</ul>
      <p><strong>Total paid: ${fmt(order.total)}</strong></p>
      <button class="btn btn-primary btn-block" data-close>Keep learning</button>
    </div>`;
    $('#confirmDialog').showModal();
  }

  /* ---------------- Toast ---------------- */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ---------------- Events ---------------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-close]');
    if (!t) return;
    if (t.dataset.add) addToCart(t.dataset.add);
    else if (t.dataset.view) openCourse(t.dataset.view);
    else if (t.dataset.remove) removeFromCart(t.dataset.remove);
    else if (t.hasAttribute('data-open-cart')) { $('#courseDialog').open && $('#courseDialog').close(); openCart(); }
    else if (t.hasAttribute('data-close-cart')) closeCart();
    else if (t.hasAttribute('data-close')) t.closest('dialog').close();
    else if (t.dataset.cat !== undefined) {
      state.filters.category = t.dataset.cat;
      document.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', c === t));
      refreshCatalog();
    }
  });

  // Close a dialog by clicking its backdrop.
  document.querySelectorAll('dialog').forEach((d) =>
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); })
  );

  $('#openCart').addEventListener('click', openCart);
  $('#closeCart').addEventListener('click', closeCart);
  $('#scrim').addEventListener('click', closeCart);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#cartDrawer').classList.contains('open') && !document.querySelector('dialog[open]')) closeCart();
  });

  $('#search').addEventListener('input', (e) => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      state.filters.q = e.target.value.trim();
      refreshCatalog();
    }, 200);
  });
  $('#levelFilter').addEventListener('change', (e) => { state.filters.level = e.target.value; refreshCatalog(); });
  $('#formatFilter').addEventListener('change', (e) => { state.filters.format = e.target.value; refreshCatalog(); });
  $('#sortFilter').addEventListener('change', (e) => { state.filters.sort = e.target.value; refreshCatalog(); });

  $('#couponForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = $('#couponInput').value.trim().toUpperCase();
    const msg = $('#couponMsg');
    if (!code) { msg.textContent = 'Enter a coupon code'; msg.className = 'coupon-msg bad'; return; }
    state.cart.coupon = code;
    saveCart();
    refreshQuote();
  });

  $('#checkoutBtn').addEventListener('click', () => {
    $('#checkoutErrors').textContent = '';
    $('#checkoutDialog').showModal();
  });
  $('#checkoutForm').addEventListener('submit', (e) => {
    e.preventDefault();
    placeOrder(e.target);
  });

  /* ---------------- Boot ---------------- */
  async function init() {
    $('#year').textContent = new Date().getFullYear();
    $('#grid').innerHTML = '<div class="skeleton"></div>'.repeat(6);
    try {
      const data = await loadCourses();
      data.courses.forEach((c) => state.allCourses.set(c.id, c));
      $('#statCourses').textContent = data.courses.length;
      const learners = data.courses.reduce((s, c) => s + c.students, 0);
      $('#statStudents').textContent = Math.floor(learners / 1000) + 'k+';
      renderFilters(data.filters);
      if (state.cart.coupon) $('#couponInput').value = state.cart.coupon;
      updateCartUI();
    } catch {
      $('#grid').innerHTML = '';
      $('#empty').hidden = false;
      $('#empty').textContent = 'Could not load courses. Please refresh the page.';
    }
  }
  init();
})();
