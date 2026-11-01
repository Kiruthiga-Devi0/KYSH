// Server-only helpers (used by api/*.js — never loaded in the browser).
const localProducts = require('../data/products.json');
const localCoupons = require('../data/coupons.json');

const cfg = () => ({
  url: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
  key: process.env.SUPABASE_SERVICE_ROLE_KEY || ''
});
const supabaseOn = () => { const c = cfg(); return !!(c.url && c.key); };

async function rest(path, opts) {
  opts = opts || {};
  const c = cfg();
  const r = await fetch(c.url + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    headers: Object.assign({ apikey: c.key, Authorization: 'Bearer ' + c.key, 'Content-Type': 'application/json' },
      opts.prefer ? { Prefer: opts.prefer } : {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!r.ok) { const err = new Error('Database error'); err.status = r.status; err.detail = data; throw err; }
  return data;
}

// Who is calling? Ask Supabase to validate the access token the browser sent.
async function userFromRequest(req) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) return null;
  const c = cfg();
  try {
    const r = await fetch(c.url + '/auth/v1/user', { headers: { apikey: c.key, Authorization: 'Bearer ' + token } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? { id: u.id, email: u.email || '' } : null;
  } catch (e) { return null; }
}

// Prices always come from the catalog here, never from the browser.
async function loadCatalog() {
  if (!supabaseOn()) return { products: localProducts, coupons: localCoupons };
  const [p, c] = await Promise.all([
    rest('products?select=*&active=eq.true&order=id'),
    rest('coupons?select=*&active=eq.true')
  ]);
  return {
    products: p.map(r => ({
      id: r.id, name: r.name, brand: r.brand, category: r.category, img: r.img, price: r.price, oldPrice: r.old_price,
      discount: r.discount, description: r.description, fabric: r.fabric, fit: r.fit, care: r.care, sizes: r.sizes, stock: r.stock
    })),
    coupons: c.map(r => ({ code: r.code, type: r.type, value: r.value, max: r.max, min: r.min, label: r.label }))
  };
}

const newOrderId = () => 'KY' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();

const orderRowToClient = r => ({
  id: r.id, date: r.created_at || new Date().toISOString(), items: r.items, address: r.address, payment: r.payment,
  paymentId: r.payment_id || null, subtotal: r.subtotal, discount: r.discount, coupon: r.coupon, total: r.total, status: r.status
});

function readBody(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  return b || {};
}

module.exports = { supabaseOn, rest, userFromRequest, loadCatalog, newOrderId, orderRowToClient, readBody };
