/*
 * KYSH shared layer: products, bag, wishlist, accounts, orders, header, toast.
 *
 * Two modes, chosen by product/config.js:
 *   • Local mode  (no Supabase keys): everything lives in this browser — good for trying things out.
 *   • Supabase mode (keys filled in): real accounts, products/coupons from the database, orders saved
 *     by the server. Pages never know the difference; they only talk to KYSH.*
 */
(function () {
  const SRC = document.currentScript.src;
  const url = p => new URL(p, SRC).href;
  const CFG = window.KYSH_CONFIG || {};
  const useDb = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
  const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';

  /* ---------- tiny helpers ---------- */
  const ls = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = n => '₹' + Number(n).toLocaleString('en-IN');
  const img = (u, w) => u + (u.includes('?') ? '&' : '?') + 'auto=compress&cs=tinysrgb&w=' + (w || 400);
  const loadScript = src => new Promise((ok, fail) => {
    const s = document.createElement('script'); s.src = src; s.onload = ok;
    s.onerror = () => fail(new Error('Could not load ' + src)); document.head.appendChild(s);
  });

  /* ---------- Supabase client (only in Supabase mode) ---------- */
  let sb = null, _user = null, _ready = null;
  function ready() {
    if (!useDb) return Promise.resolve();
    return _ready || (_ready = (async () => {
      if (!window.supabase) await loadScript(SUPABASE_CDN);
      sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    })());
  }
  const mapUser = u => u ? { id: u.id, email: u.email, name: (u.user_metadata && u.user_metadata.name) || (u.email || '').split('@')[0] } : null;
  const accessToken = async () => { if (!useDb) return null; await ready(); const { data } = await sb.auth.getSession(); return data.session ? data.session.access_token : null; };

  /* ---------- products & coupons ---------- */
  let _products, _coupons;
  const rowToProduct = r => ({
    id: r.id, name: r.name, brand: r.brand, category: r.category, img: r.img, price: r.price, oldPrice: r.old_price,
    discount: r.discount, description: r.description, fabric: r.fabric, fit: r.fit, care: r.care, sizes: r.sizes, stock: r.stock
  });
  const cached = (get, set) => {
    const p = get();
    if (p) return p;
    const np = Promise.resolve().then(set.load).catch(e => { set.clear(); throw e; });
    set.store(np); return np;
  };
  const products = () => cached(() => _products, {
    store: p => (_products = p), clear: () => (_products = null),
    load: async () => {
      if (!useDb) return fetch(url('../data/products.json')).then(r => r.json());
      await ready();
      const { data, error } = await sb.from('products').select('*').eq('active', true).order('id');
      if (error) throw error;
      return data.map(rowToProduct);
    }
  });
  const coupons = () => cached(() => _coupons, {
    store: p => (_coupons = p), clear: () => (_coupons = null),
    load: async () => {
      if (!useDb) return fetch(url('../data/coupons.json')).then(r => r.json());
      await ready();
      const { data, error } = await sb.from('coupons').select('*').eq('active', true);
      if (error) throw error;
      return data;
    }
  });

  /* ---------- bag (browser) ---------- */
  // Stored as [{id, size, qty}] only. Prices are always looked up fresh, never trusted from storage.
  const cleanLines = list => (Array.isArray(list) ? list : [])
    .filter(x => x && x.size && Number(x.qty) > 0 && Number.isInteger(Number(x.id)))
    .map(x => ({ id: Number(x.id), size: String(x.size), qty: Math.floor(Number(x.qty)) }));
  const getCart = () => cleanLines(ls.get('bag', []));
  const saveCart = c => { ls.set('bag', c); refreshCounts(); };
  function addToCart(id, size, qty) {
    const c = getCart();
    const hit = c.find(x => x.id === id && x.size === size);
    if (hit) hit.qty += qty; else c.push({ id, size, qty });
    saveCart(c);
  }
  function setQty(index, qty) {
    const c = getCart();
    if (!c[index]) return;
    if (qty < 1) c.splice(index, 1); else c[index].qty = qty;
    saveCart(c);
  }
  const removeLine = i => setQty(i, 0);
  const clearCart = () => saveCart([]);
  const cartCount = () => getCart().reduce((n, x) => n + x.qty, 0);

  // "Buy now" gets its own slot so it never wipes what is already in the bag
  const getBuyNow = () => cleanLines(ls.get('kysh_buynow', []));
  const setBuyNow = line => ls.set('kysh_buynow', [line]);
  const clearBuyNow = () => ls.del('kysh_buynow');

  const getCoupon = () => ls.get('kysh_coupon', '');
  const setCoupon = c => (c ? ls.set('kysh_coupon', c) : ls.del('kysh_coupon'));

  /* ---------- wishlist (product ids) ---------- */
  const getWishlist = () => [...new Set(ls.get('wishlist', []).map(x => (x && typeof x === 'object' ? x.id : x)).map(Number).filter(Number.isInteger))];
  function toggleWishlist(id) {
    const w = getWishlist(), i = w.indexOf(id);
    if (i >= 0) w.splice(i, 1); else w.push(id);
    ls.set('wishlist', w); refreshCounts();
    return i < 0;
  }
  const inWishlist = id => getWishlist().includes(id);

  /* ---------- accounts ---------- */
  // Local mode only: accounts live in this browser (plain text — demo use only).
  const localUsers = () => {
    let u = ls.get('users', null);
    if (!u) { u = [{ email: 'test@example.com', password: '123456' }, { email: 'user@example.com', password: 'password' }]; ls.set('users', u); }
    return u;
  };
  const localUser = () => (localStorage.getItem('isLoggedIn') === 'true' ? ls.get('currentUser', {}) : null);
  const user = () => (useDb ? _user : localUser());

  async function requireLogin() {
    if (useDb) {
      await ready();
      const { data } = await sb.auth.getSession();
      _user = data.session ? mapUser(data.session.user) : null;
    }
    if (!user()) {
      try { sessionStorage.setItem('kysh_next', location.href); } catch (e) {}   // so login can bring them back here
      location.replace(url('../pg3.html')); return false;
    }
    return true;
  }
  // Who is signed in right now? Never redirects — used by the public pages to show Log in vs. Logout.
  async function currentUser() {
    if (useDb) {
      await ready();
      const { data } = await sb.auth.getSession();
      _user = data.session ? mapUser(data.session.user) : null;
    }
    return user();
  }
  // After login: the page they were trying to open (same site only), or null.
  function consumeNext() {
    let n = null;
    try { n = sessionStorage.getItem('kysh_next'); sessionStorage.removeItem('kysh_next'); } catch (e) {}
    try { return n && new URL(n).origin === location.origin ? n : null; } catch (e) { return null; }
  }
  async function sendContact(m) {
    if (useDb) {
      await ready();
      const { error } = await sb.from('contact_messages').insert({ name: m.name, email: m.email, subject: m.subject, message: m.message });
      return error ? { error: 'Could not send your message. Please try again.' } : { ok: true };
    }
    const all = ls.get('kysh_messages', []); all.push({ ...m, date: new Date().toISOString() }); ls.set('kysh_messages', all);
    return { ok: true, local: true };
  }
  async function signUp({ name, email, password }) {
    if (useDb) {
      await ready();
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: url('../pg3.html') } });
      if (error) return { error: error.message };
      // With email confirmation on, an already-registered address comes back as a user with no identities
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return { error: 'This email is already registered. Please log in.' };
      return { ok: true, needsConfirm: !data.session };
    }
    const users = localUsers();
    if (users.some(u => u.email === email)) return { error: 'This email is already registered. Please log in.' };
    users.push({ name, email, password }); ls.set('users', users);
    return { ok: true };
  }
  async function signIn(identifier, password) {
    if (useDb) {
      await ready();
      const { data, error } = await sb.auth.signInWithPassword({ email: identifier, password });
      if (error) return { error: /confirm/i.test(error.message) ? 'Please confirm your email first — check your inbox.' : 'Invalid email or password' };
      _user = mapUser(data.user);
      return { ok: true };
    }
    const m = localUsers().find(u => (u.name === identifier || u.email === identifier) && u.password === password);
    if (!m) return { error: 'Invalid username or password' };
    localStorage.setItem('isLoggedIn', 'true'); localStorage.setItem('currentUser', JSON.stringify(m));
    return { ok: true };
  }
  async function resetPassword(email) {
    if (useDb) {
      await ready();
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: url('../pg7.html') });
      return error ? { error: error.message } : { ok: true };
    }
    return localUsers().some(u => u.email === email) ? { ok: true } : { error: 'Email not registered!' };
  }
  async function updatePassword(password) {
    if (!useDb) return { error: 'Password change needs Supabase mode' };
    await ready();
    const { error } = await sb.auth.updateUser({ password });
    return error ? { error: error.message } : { ok: true };
  }
  async function onPasswordRecovery(cb) {
    if (!useDb) return;
    let fired = false;
    const once = () => { if (!fired) { fired = true; cb(); } };
    // The reset email link lands here with #...type=recovery; check the URL too so we can't miss the event
    if (/type=recovery/.test(location.hash)) once();
    await ready();
    sb.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') once(); });
  }
  async function logout() {
    if (useDb) { await ready(); await sb.auth.signOut(); _user = null; }
    ls.del('isLoggedIn'); ls.del('currentUser');
    location.href = url('../pg3.html');
  }

  /* ---------- server calls ---------- */
  // POST to our own /api with the customer's login token attached (Supabase mode).
  async function api(path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const tok = await accessToken();
    if (tok) headers.Authorization = 'Bearer ' + tok;
    const r = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && useDb) { toast('Your session expired — please log in again.'); setTimeout(() => location.href = url('../pg3.html'), 1500); }
    return { ok: r.ok, status: r.status, data };
  }

  /* ---------- orders ---------- */
  const rowToOrder = r => ({
    id: r.id, date: r.created_at, items: r.items, address: r.address, payment: r.payment, paymentId: r.payment_id,
    subtotal: r.subtotal, discount: r.discount, coupon: r.coupon, total: r.total, status: r.status
  });
  async function getOrders() {
    if (!useDb) return ls.get('kysh_orders', []);
    await ready();
    // "Awaiting payment" rows are checkouts that were opened but never paid — not real orders
    const { data, error } = await sb.from('orders').select('*').neq('status', 'Awaiting payment').order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(rowToOrder);
  }
  // Called once an order exists. Local mode has to store it itself; Supabase mode already has it server-side.
  function recordOrder(o) {
    if (!useDb) { const all = ls.get('kysh_orders', []); all.unshift(o); ls.set('kysh_orders', all); }
    ls.set('kysh_last_order', o.id);
  }
  async function lastOrder() {
    const id = ls.get('kysh_last_order', '');
    return (await getOrders()).find(o => o.id === id) || null;
  }

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }
  window.addEventListener('unhandledrejection', e => {
    console.error(e.reason);
    toast('Something went wrong. Please refresh the page.');
  });

  /* ---------- header ---------- */
  const ICON = {
    bag: '<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z"/></svg>',
    orders: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    out: '<svg viewBox="0 0 24 24"><path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/></svg>'
  };
  function refreshCounts() {
    const set = (sel, n) => document.querySelectorAll(sel).forEach(el => { el.textContent = n || ''; el.dataset.n = n; });
    set('[data-count="bag"]', cartCount());
    set('[data-count="wish"]', getWishlist().length);
  }
  /**
   * header({ search: true, q: '', onSearch: fn }) — call AFTER `await KYSH.requireLogin()`.
   * With onSearch the page filters live; without it the search box sends people to the shop page.
   */
  function header(opts) {
    opts = opts || {};
    const host = document.getElementById('site-header');
    if (!host) return;
    const u = user();
    host.innerHTML = `
      <header class="site-header"><div class="header-inner">
        <a class="logo-container" href="${url('productlist.html')}">
          <img class="logo" src="${url('kyyy.png')}" alt="KYSH logo"><span class="brand">KYSH</span>
        </a>
        ${opts.search ? `<form class="search-form" role="search">
          <input type="search" name="q" placeholder="Search dresses, kurtis, sarees…" value="${esc(opts.q || '')}" aria-label="Search products">
          <button type="submit">Search</button></form>` : ''}
        <nav class="nav">
          <a class="nav-item" href="${url('orders.html')}">${ICON.orders}Orders</a>
          <a class="nav-item" href="${url('wishlist.html')}">${ICON.heart}Wishlist<span class="count" data-count="wish"></span></a>
          <a class="nav-item" href="${url('bag.html')}">${ICON.bag}Bag<span class="count" data-count="bag"></span></a>
          ${u ? `<button class="nav-item" id="logoutBtn" title="Signed in as ${esc(u.name || u.email || 'you')}">${ICON.out}Logout</button>` : ''}
        </nav>
      </div></header>`;
    const form = host.querySelector('.search-form');
    if (form) {
      form.addEventListener('submit', e => {
        e.preventDefault();
        const q = form.q.value.trim();
        if (opts.onSearch) opts.onSearch(q);
        else location.href = url('productlist.html') + (q ? '?q=' + encodeURIComponent(q) : '');
      });
      if (opts.onSearch) form.q.addEventListener('input', () => opts.onSearch(form.q.value.trim()));
    }
    const lo = host.querySelector('#logoutBtn'); if (lo) lo.addEventListener('click', logout);
    refreshCounts();
  }
  window.addEventListener('storage', refreshCounts);

  window.KYSH = {
    useDb, esc, inr, img, ls, url, products, coupons,
    getCart, addToCart, setQty, removeLine, clearCart, cartCount,
    getBuyNow, setBuyNow, clearBuyNow, getCoupon, setCoupon,
    getWishlist, toggleWishlist, inWishlist,
    user, requireLogin, currentUser, consumeNext, sendContact, signUp, signIn, resetPassword, updatePassword, onPasswordRecovery, logout,
    api, getOrders, recordOrder, lastOrder,
    toast, header, refreshCounts
  };
})();
