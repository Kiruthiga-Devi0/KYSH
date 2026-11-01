// POST /api/verify-payment — confirms Razorpay's signature, then (with a database) marks the order Paid.
const crypto = require('crypto');
const S = require('../lib/server.js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false }); }
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return res.status(501).json({ ok: false, error: 'Online payments are not configured' });

  const { razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sig } = S.readBody(req);
  if (!oid || !pid || !sig) return res.status(400).json({ ok: false });

  const expected = crypto.createHmac('sha256', secret).update(oid + '|' + pid).digest('hex');
  const a = Buffer.from(expected), c = Buffer.from(String(sig));
  if (!(a.length === c.length && crypto.timingSafeEqual(a, c))) return res.status(400).json({ ok: false });

  if (!S.supabaseOn()) return res.status(200).json({ ok: true });

  const user = await S.userFromRequest(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Please log in again' });
  try {
    const rows = await S.rest(
      'orders?razorpay_order_id=eq.' + encodeURIComponent(oid) + '&user_id=eq.' + encodeURIComponent(user.id),
      { method: 'PATCH', body: { status: 'Paid', payment_id: String(pid) }, prefer: 'return=representation' });
    if (!rows || !rows.length) return res.status(404).json({ ok: false, error: 'Order not found' });
    return res.status(200).json({ ok: true, order: S.orderRowToClient(rows[0]) });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'Payment received but the order could not be updated. Please contact support.' });
  }
};
