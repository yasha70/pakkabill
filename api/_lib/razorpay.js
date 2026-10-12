// Razorpay: customers pay for Pro with UPI, cards, net banking or wallets in Razorpay's checkout,
// and Pro turns on by itself once Razorpay confirms the money.
//
// Keys come from admin (Settings > Razorpay) or the environment: RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET.
// The flow, all through /api/pay (the Hobby plan allows no more server functions):
//   1. { action: 'rzpOrder' }  makes a Razorpay order for the plan's price (coupon applied here, on the server).
//   2. The app opens Razorpay's checkout for that order.
//   3. { action: 'rzpDone' }   checks Razorpay's signature, then asks Razorpay for the payment itself:
//      same order, same amount, captured (an authorised payment is captured here). Then Pro is added.
//   4. Backups if the app closed before step 3: Razorpay's webhook (POST /api/pay?razorpay=webhook) and,
//      whenever the customer opens their plan, a check of their unpaid orders from the last two days.
// Each order adds Pro once, however many of these arrive.
const crypto = require('crypto');
const db = require('./db');
const core = require('./core');
const orders = require('./orders');
const promos = require('./promos');

const API = 'https://api.razorpay.com/v1';
const KEY_ID = /^rzp_(live|test)_[A-Za-z0-9]{6,40}$/;
const OPEN_DAYS = 2; // unpaid orders are checked again for this long
const KEEP = 7 * 86400; // an unpaid order is forgotten after a week

const orderKey = (id) => `order:${id}`;

// The keys to use, admin settings first. null when Razorpay is not set up.
function config(settings) {
  const r = (settings && settings.razorpay) || {};
  const env = process.env;
  const keyId = String((r.keyId ? r.keyId : env.RAZORPAY_KEY_ID) || '').trim();
  const keySecret = String((r.keyId ? r.keySecret : env.RAZORPAY_KEY_SECRET) || '').trim();
  if (!KEY_ID.test(keyId) || keySecret.length < 8) return null;
  return { keyId, keySecret, live: keyId.startsWith('rzp_live_') };
}

// One call to Razorpay's API with the key as Basic auth.
async function call(cfg, method, path, body, fetchFn = fetch) {
  let res, json;
  try {
    res = await fetchFn(API + path, {
      method,
      headers: { Authorization: 'Basic ' + Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64'), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new core.HttpError(504, 'Could not reach Razorpay. Check your internet and try again.');
  }
  try { json = await res.json(); } catch { json = null; }
  if (res.ok && json) return json;
  const said = (json && json.error && json.error.description) || '';
  if (res.status === 401) throw new core.HttpError(502, 'Razorpay refused the keys. Check the Key ID and Key Secret in admin settings.');
  if (res.status === 429) throw new core.HttpError(429, 'Razorpay is busy. Try again in a minute.');
  if (res.status >= 400 && res.status < 500) throw Object.assign(new core.HttpError(400, said || 'Razorpay did not accept this request.'), { rzp: true });
  throw new core.HttpError(502, 'Razorpay is not answering. Try again in a few minutes.');
}

// Checkout's proof that it took the payment for this order: HMAC-SHA256(order|payment) with the key secret.
function signatureOk(cfg, orderId, paymentId, signature) {
  const want = crypto.createHmac('sha256', cfg.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return core.safeEqual(want, String(signature || ''));
}

// 1. A Razorpay order for this customer's plan. The price comes from the server, never the app.
async function createOrder(cfg, user, plan, coupon, fetchFn) {
  const quote = await promos.price(plan, coupon);
  const amount = Math.round(quote.amount * 100);
  if (!(amount >= 100)) throw new core.HttpError(400, 'Razorpay needs at least ₹1. Use a smaller coupon.');
  const id = `PB${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const rzp = await call(cfg, 'POST', '/orders', {
    amount, currency: 'INR', receipt: id,
    notes: { app: 'PakkaBill', phone: user.phone, plan, coupon: quote.coupon || '' },
  }, fetchFn);
  if (!rzp || !/^order_/.test(rzp.id || '')) throw new core.HttpError(502, 'Razorpay did not make the order. Try again.');
  const order = {
    id, phone: user.phone, plan, amount, listAmount: Math.round(quote.list * 100), coupon: quote.coupon,
    utr: '', method: 'razorpay', rzpOrderId: rzp.id, state: 'CREATED', createdAt: Date.now(),
  };
  await db.pipe([
    ['SET', orderKey(id), JSON.stringify(order), 'EX', KEEP],
    ['SET', `rzp:${rzp.id}`, id, 'EX', KEEP],
    ['ZADD', `rzpopen:${user.phone}`, order.createdAt, id],
  ]);
  return order;
}

// Pro for a paid order, once. Asks Razorpay about the payment, so nothing the app or a webhook says
// is trusted on its own: it must be this order's payment, for the full amount, and captured.
// Returns { order, first } where first is true only for the call that turned Pro on.
async function settle(cfg, order, paymentId, fetchFn) {
  if (order.state === 'COMPLETED') return { order, first: false };
  if (!/^pay_[A-Za-z0-9]+$/.test(String(paymentId || ''))) throw new core.HttpError(400, 'That is not a Razorpay payment.');
  let p = await call(cfg, 'GET', `/payments/${paymentId}`, null, fetchFn);
  if (p.order_id !== order.rzpOrderId) throw new core.HttpError(400, 'This payment is for a different order.');
  if (Number(p.amount) !== order.amount || String(p.currency || '').toUpperCase() !== 'INR') throw new core.HttpError(400, 'The amount paid does not match the plan price. Contact PakkaBill support.');
  if (p.status === 'authorized') {
    // Razorpay refunds payments that are never captured, so capture it now.
    try {
      p = await call(cfg, 'POST', `/payments/${paymentId}/capture`, { amount: order.amount, currency: 'INR' }, fetchFn);
    } catch (e) {
      if (!e.rzp) throw e;
      p = await call(cfg, 'GET', `/payments/${paymentId}`, null, fetchFn); // captured meanwhile (auto-capture)
    }
  }
  if (p.status !== 'captured') {
    throw new core.HttpError(402, p.status === 'failed' ? 'The payment did not go through, so no money was taken. Please try again.' : 'Razorpay has not confirmed this payment yet. If money was taken, Pro turns on by itself within a few minutes.');
  }
  const paid = { ...order, paymentId: p.id, payMethod: String(p.method || ''), paidAt: order.paidAt || Date.now() };
  await db.pipe([
    ['SET', orderKey(order.id), JSON.stringify(paid)],
    ['ZADD', 'orders', order.createdAt, order.id],
    ['ZADD', `orders:${order.phone}`, order.createdAt, order.id],
    ['ZREM', `rzpopen:${order.phone}`, order.id],
    ['SET', `rzppay:${p.id}`, order.id],
  ]);
  const first = !!(await db.cmd(['SET', `rzpdone:${order.id}`, '1', 'NX']));
  if (first && paid.coupon) await promos.useCoupon(paid.coupon, 0); // paid at the coupon price: always honoured
  return { order: await orders.approve(order.id), first };
}

async function orderFor(rzpOrderId) {
  const id = /^order_[A-Za-z0-9]+$/.test(String(rzpOrderId || '')) && (await db.cmd(['GET', `rzp:${rzpOrderId}`]));
  return id ? orders.getOrder(id) : null;
}

// 3. Back from checkout with Razorpay's three values.
async function fromCheckout(cfg, user, b, fetchFn) {
  const { razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sig } = b || {};
  const order = await orderFor(oid);
  if (!order || order.phone !== user.phone) throw new core.HttpError(404, 'Payment order not found. If money was taken, Pro turns on by itself within a few minutes.');
  if (!signatureOk(cfg, oid, pid, sig)) throw new core.HttpError(400, 'Razorpay could not confirm this payment. If money was taken, Pro turns on by itself within a few minutes.');
  return settle(cfg, order, pid, fetchFn);
}

// 4a. Razorpay's webhook (payment.captured, payment.authorized, order.paid). Only the order and payment IDs
// are read from it; settle() then asks Razorpay itself, so a made-up webhook cannot turn Pro on.
async function webhook(cfg, body, fetchFn) {
  const pay = body && body.payload && body.payload.payment && body.payload.payment.entity;
  if (!pay || !pay.id || !pay.order_id || !['captured', 'authorized'].includes(pay.status)) return { ignored: true };
  const order = await orderFor(pay.order_id);
  if (!order) return { ignored: true }; // not a PakkaBill order (another app on the same account)
  return settle(cfg, order, pay.id, fetchFn);
}

// 4b. When a customer opens their plan: their unpaid orders from the last two days, checked with Razorpay
// at most once a minute each.
async function reconcile(cfg, phone, fetchFn) {
  const ids = await db.cmd(['ZREVRANGE', `rzpopen:${phone}`, 0, 9]);
  if (!ids.length) return [];
  const list = await db.mgetJSON(ids.map(orderKey));
  const done = [];
  let asked = 0;
  for (let i = 0; i < ids.length; i++) {
    const o = list[i];
    if (!o || o.state === 'COMPLETED' || Date.now() - o.createdAt > OPEN_DAYS * core.DAY) {
      await db.cmd(['ZREM', `rzpopen:${phone}`, ids[i]]);
      continue;
    }
    if (asked >= 2 || !(await db.cmd(['SET', `rzpchk:${o.id}`, '1', 'EX', 60, 'NX']))) continue;
    asked++;
    try {
      const r = await call(cfg, 'GET', `/orders/${o.rzpOrderId}/payments`, null, fetchFn);
      const items = (r && r.items) || [];
      const p = items.find((x) => x.status === 'captured') || items.find((x) => x.status === 'authorized');
      if (p) done.push(await settle(cfg, o, p.id, fetchFn));
    } catch (e) {
      console.error('razorpay check', o.id, e.message);
    }
  }
  return done;
}

// Admin "Test keys": a harmless read that fails with 401 on wrong keys.
async function test(cfg, fetchFn) {
  await call(cfg, 'GET', '/orders?count=1', null, fetchFn);
  return { ok: true, live: cfg.live };
}

module.exports = { KEY_ID, config, call, signatureOk, createOrder, settle, fromCheckout, webhook, reconcile, test };
