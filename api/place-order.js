// POST /api/place-order  — Cash on Delivery orders.
// The browser sends only {items:[{id,size,qty}], coupon, address}. Price, discount and total are
// worked out HERE from the catalog, and the order is written with the server key.
const pricing = require('../lib/pricing.js');
const S = require('../lib/server.js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!S.supabaseOn()) return res.status(501).json({ error: 'Orders database is not configured' });

  const user = await S.userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Please log in again' });

  const body = S.readBody(req);
  const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
  const { address, bad } = pricing.validateAddress(body.address);
  if (bad.length) return res.status(400).json({ error: 'Please check your address details', fields: bad });

  try {
    const { products, coupons } = await S.loadCatalog();
    const t = pricing.priceCart(items, products, coupons, body.coupon);
    if (!t.lines.length) return res.status(400).json({ error: 'Your bag is empty' });
    if (t.errors.length) return res.status(400).json({ error: t.errors[0] });
    if (t.couponError) return res.status(400).json({ error: t.couponError });

    const row = {
      id: S.newOrderId(), user_id: user.id,
      items: t.lines.map(l => ({ id: l.id, name: l.name, img: l.img, size: l.size, qty: l.qty, unit: l.unit, total: l.total })),
      address, payment: 'cod', subtotal: t.subtotal, discount: t.discount, coupon: t.appliedCode, total: t.total,
      status: 'Placed · pay on delivery'
    };
    const saved = await S.rest('orders', { method: 'POST', body: row, prefer: 'return=representation' });
    return res.status(200).json({ order: S.orderRowToClient(saved[0] || row) });
  } catch (e) {
    return res.status(502).json({ error: 'Could not save your order. Please try again.' });
  }
};
