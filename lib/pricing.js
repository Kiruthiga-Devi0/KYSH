/*
 * Shared pricing logic. Loaded in the browser (window.KyshPricing) AND required by the
 * serverless API (api/create-order.js), so the cart total shown to the customer and the
 * amount actually charged are always computed by the same code.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KyshPricing = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function priceCart(items, products, coupons, code) {
    const byId = new Map(products.map(p => [p.id, p]));
    const lines = [];
    const errors = [];

    for (const [i, it] of (items || []).entries()) {
      const p = byId.get(Number(it && it.id));
      const qty = Math.floor(Number(it && it.qty));
      if (!p) { errors.push('Unknown product'); continue; }
      if (!(qty >= 1)) { errors.push('Invalid quantity for ' + p.name); continue; }
      if (!it.size || !p.sizes.includes(it.size)) { errors.push('Choose a size for ' + p.name); continue; }
      if (qty > p.stock) { errors.push('Only ' + p.stock + ' of ' + p.name + ' in stock'); continue; }
      lines.push({
        i, id: p.id, name: p.name, brand: p.brand, img: p.img, size: it.size, qty,
        unit: p.price, mrp: p.oldPrice, total: p.price * qty
      });
    }

    const subtotal = lines.reduce((s, l) => s + l.total, 0);
    const mrpTotal = lines.reduce((s, l) => s + l.mrp * l.qty, 0);

    let discount = 0, appliedCode = null, couponError = null;
    if (code) {
      const c = (coupons || []).find(c => c.code === String(code).trim().toUpperCase());
      if (!c) couponError = 'Invalid coupon code';
      else if (subtotal < (c.min || 0)) couponError = 'Add ₹' + (c.min - subtotal) + ' more to use ' + c.code;
      else {
        discount = c.type === 'percent' ? Math.floor(subtotal * c.value / 100) : c.value;
        if (c.max) discount = Math.min(discount, c.max);
        discount = Math.min(discount, subtotal);
        appliedCode = c.code;
      }
    }

    const total = subtotal - discount;
    const savings = (mrpTotal - subtotal) + discount;
    return { lines, errors, subtotal, mrpTotal, discount, total, savings, appliedCode, couponError };
  }

  // One address check shared by the checkout page and the server, so they can never disagree.
  function validateAddress(a) {
    a = a || {};
    const v = {
      name: String(a.name || '').trim(),
      mobile: String(a.mobile || '').replace(/[\s-]/g, '').replace(/^(\+91|0)/, ''),
      address: String(a.address || '').trim(),
      city: String(a.city || '').trim(),
      pincode: String(a.pincode || '').trim()
    };
    const bad = [];
    if (v.name.length < 2 || v.name.length > 80) bad.push('name');
    if (!/^[6-9]\d{9}$/.test(v.mobile)) bad.push('mobile');
    if (v.address.length < 5 || v.address.length > 200) bad.push('address');
    if (v.city.length < 2 || v.city.length > 60) bad.push('city');
    if (!/^[1-9]\d{5}$/.test(v.pincode)) bad.push('pincode');
    return { address: v, bad };
  }

  return { priceCart, validateAddress };
});
