# KYSH Clothing — v3 (real accounts + database ready)

The site runs in two modes, chosen by **`product/config.js`**:

| Mode | When | What you get |
|---|---|---|
| **Local mode** | Both Supabase values empty (the default in this zip) | Works exactly like v2: everything stays in the visitor's browser. Good for trying the site. |
| **Supabase mode** | You paste your Supabase URL + public key | Real sign-up / login / password reset, products + coupons from the database (edit them in a dashboard), orders saved by the server. |

## Run locally
Open through a web server (not by double-clicking): VS Code → **Live Server**, or `python3 -m http.server 5501`.
(Online payment and database orders need the `api/` folder, which only runs on Vercel — use `npx vercel dev` to try them locally.)

## Switch on Supabase — about 15 minutes
1. **Create a project** at supabase.com (pick the Mumbai region). Save the database password somewhere.
2. **Create the tables:** Dashboard → **SQL Editor** → paste all of `supabase/schema.sql` → **Run**. Then paste `supabase/seed.sql` → **Run** (loads your 50 products and 2 coupons). Both are safe to run again.
3. **Auth settings:** Dashboard → Authentication →
   - *URL Configuration*: set **Site URL** to your Vercel address and add these **Redirect URLs**: `https://YOUR-SITE.vercel.app/pg3.html` and `https://YOUR-SITE.vercel.app/pg7.html` (the confirmation and password-reset emails send people there).
   - *Providers → Email*: while testing you can switch **Confirm email** off so sign-up logs people straight in. Turn it back on for real launch.
4. **Public key into the site:** Dashboard → Project Settings → **API**. Copy the **Project URL** and the **anon public** key into `product/config.js`. (These two are safe to be public.)
5. **Secret key into Vercel:** Vercel → your project → Settings → Environment Variables, add
   - `SUPABASE_URL` = the same Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = the **service_role** key from the same API page — ⚠️ **secret**: never put it in `config.js`, in GitHub, or in any page.
   - (when ready for payments) `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`

   then **Redeploy**.
6. **Check it works:** sign up → log in → add something to the bag → place a Cash-on-Delivery order → see it in *My Orders* and in Supabase → Table Editor → `orders`.

### Day-to-day
- **Change a price, add a product, hide one (`active` = false), change stock:** Supabase → Table Editor → `products`. The shop updates immediately — no redeploy.
- **Coupons:** Table Editor → `coupons` (codes must be UPPERCASE).
- **See orders:** Table Editor → `orders` (change `status` yourself as you ship, e.g. "Shipped").

## How orders stay safe
- The browser sends only *product id, size, quantity, coupon, address*. **Price, discount and total are always recomputed on the server** from the database (`lib/pricing.js` is the one shared piece of maths).
- Orders are written **only by the server** (`api/place-order.js`, `api/create-order.js`). The database has no "insert" rule for customers, so nobody can create or edit an order from the browser — checked on a real Postgres.
- Customers can read **only their own** orders (row-level security).
- Online payments: the Razorpay signature is verified on the server before an order is marked **Paid**, and only the customer who started that payment can confirm it. A checkout that was opened but never paid stays hidden as "Awaiting payment".
- Card / UPI details are entered only in Razorpay's own window.

## Where things live
| What | Where |
|---|---|
| Settings (Supabase URL/key) | `product/config.js` |
| Bag, wishlist, accounts, orders, header | `product/store.js` |
| Shared styling | `product/kysh.css` |
| Price / coupon / address rules (browser **and** server) | `lib/pricing.js` |
| Server helpers | `lib/server.js` |
| Order + payment endpoints | `api/place-order.js`, `api/create-order.js`, `api/verify-payment.js` |
| Database tables + security rules | `supabase/schema.sql`, `supabase/seed.sql` |
| Local-mode product / coupon data | `data/products.json`, `data/coupons.json` |

## Known limits (honest list)
- **Bag and wishlist stay in each browser** (they don't follow a customer to another phone yet).
- **Stock isn't reduced when an order is placed** (it's only used as a per-order limit). Easy next step: a database function that subtracts stock inside the order insert.
- **Paid-but-tab-closed:** if a customer pays and closes the tab before the confirmation call, the order stays "Awaiting payment" even though Razorpay has the money. The proper fix is a Razorpay webhook; until then check the Razorpay dashboard against `orders`.
- **Emails:** Supabase's built-in mailer is heavily rate-limited (a few emails per hour). Before launch, add custom SMTP (Supabase → Authentication → SMTP, e.g. Resend or SendGrid).
- No admin screen yet — the Supabase Table Editor is the admin panel.
- "Sign in with Google/Facebook" buttons are still plain links, not real social login.
- Product images are hot-linked from Pexels; the large PNGs in the root folder (~15 MB) should be compressed.
