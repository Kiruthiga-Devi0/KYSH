// POST /api/create-order — start an online (Razorpay) payment.
// The total is recomputed on the server from product ids. When the database is configured the order is
// saved right away as "Awaiting payment" and is only marked Paid by /api/verify-payment.
const pricing = require('../lib/pricing.js');
const S = require('../lib/server.js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }

  const keyId = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !secret) return res.status(501).json({ error: 'Online payments are not configured' });

  const db = S.supabaseOn();
  let user = null;
  if (db) {
    user = await S.userFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Please log in again' });
  }

  const body = S.readBody(req);
  const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
  let address = null;
  if (db) {
    const v = pricing.validateAddress(body.address);
    if (v.bad.length) return res.status(400).json({ error: 'Please check your address details', fields: v.bad });
    address = v.address;
  }

  let catalog;
  try { catalog = await S.loadCatalog(); } catch (e) { return res.status(502).json({ error: 'Could not load products' }); }
  const t = pricing.priceCart(items, catalog.products, catalog.coupons, body.coupon);
  if (!t.lines.length) return res.status(400).json({ error: 'Your bag is empty' });
  if (t.errors.length) return res.status(400).json({ error: t.errors[0] });
  if (t.couponError) return res.status(400).json({ error: t.couponError });
  if (t.total < 1) return res.status(400).json({ error: 'Invalid order total' });

  const orderId = S.newOrderId();
  let rz;
  try {
    const r = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(keyId + ':' + secret).toString('base64') },
      body: JSON.stringify({ amount: t.total * 100, currency: 'INR', receipt: orderId, notes: { coupon: t.appliedCode || '', items: String(t.lines.length) } })
    });
    rz = await r.json();
    if (!r.ok) return res.status(502).json({ error: (rz.error && rz.error.description) || 'Payment provider error' });
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach payment provider' });
  }

  if (db) {
    try {
      await S.rest('orders', { method: 'POST', body: {
        id: orderId, user_id: user.id,
        items: t.lines.map(l => ({ id: l.id, name: l.name, img: l.img, size: l.size, qty: l.qty, unit: l.unit, total: l.total })),
        address, payment: 'online', razorpay_order_id: rz.id, subtotal: t.subtotal, discount: t.discount,
        coupon: t.appliedCode, total: t.total, status: 'Awaiting payment'
      } });
    } catch (e) { return res.status(502).json({ error: 'Could not save your order. Please try again.' }); }
  }
  return res.status(200).json({ orderId: rz.id, amount: rz.amount, keyId, total: t.total });
};
