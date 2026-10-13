// Checks of Razorpay payments (api/_lib/razorpay.js, answered by api/pay.js) against a pretend Razorpay:
// keys, the order and its price, the checkout signature, capture, wrong amounts or orders, Pro added once,
// the webhook, catching up on payments the app never heard back about, and the admin key settings.
// Run: node test/razorpay-audit.js   (exits 1 on any failure)
'use strict';
process.env.PB_DEV_MEMORY_DB = '1';
['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'].forEach((k) => delete process.env[k]);
const crypto = require('crypto');
const db = require('../api/_lib/db');
const core = require('../api/_lib/core');
const rzp = require('../api/_lib/razorpay');

let fails = 0, checks = 0;
function ok(cond, what, detail) { checks++; if (!cond) { fails++; console.log('FAIL  ' + what + (detail ? '  ' + detail : '')); } }
function eq(a, b, what) { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, what, `expected ${B}, got ${A}`); }
async function throws(p, what, test) { let e = null; try { await p; } catch (x) { e = x; } ok(e && test(e), what, e ? `${e.status} ${e.message}` : 'did not throw'); return e; }

const KEY = 'rzp_test_AbC123xyZ9', SECRET = 'sEcReT_0123456789';
const sign = (oid, pid, secret = SECRET) => crypto.createHmac('sha256', secret).update(`${oid}|${pid}`).digest('hex');

// A pretend Razorpay with orders and payments.
const R = { orders: {}, payments: {}, calls: [], n: 0, down: false };
function json(status, body) { return Promise.resolve({ status, ok: status < 400, json: () => Promise.resolve(body) }); }
function rzpFetch(url, opt = {}) {
  if (!url.startsWith('https://api.razorpay.com/v1')) return json(404, {});
  R.calls.push({ url, method: opt.method, body: opt.body ? JSON.parse(opt.body) : null, auth: opt.headers && opt.headers.Authorization });
  if (R.down) return Promise.reject(new Error('net'));
  const [user, pass] = Buffer.from(String((opt.headers || {}).Authorization || '').replace('Basic ', ''), 'base64').toString().split(':');
  if (user !== KEY || pass !== SECRET) return json(401, { error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed' } });
  const path = url.slice('https://api.razorpay.com/v1'.length);
  let m;
  if (opt.method === 'POST' && path === '/orders') {
    const b = JSON.parse(opt.body);
    const o = { id: 'order_T' + ++R.n, entity: 'order', amount: b.amount, currency: b.currency, receipt: b.receipt, notes: b.notes, status: 'created' };
    R.orders[o.id] = o;
    return json(200, o);
  }
  if (opt.method === 'GET' && path.startsWith('/orders?')) return json(200, { entity: 'collection', count: 0, items: [] });
  if (opt.method === 'GET' && (m = /^\/orders\/(order_\w+)\/payments$/.exec(path))) return json(200, { entity: 'collection', items: Object.values(R.payments).filter((p) => p.order_id === m[1]) });
  if (opt.method === 'GET' && (m = /^\/payments\/(pay_\w+)$/.exec(path))) return R.payments[m[1]] ? json(200, { ...R.payments[m[1]] }) : json(400, { error: { description: 'The id provided does not exist' } });
  if (opt.method === 'POST' && (m = /^\/payments\/(pay_\w+)\/capture$/.exec(path))) {
    const p = R.payments[m[1]];
    if (!p || p.status !== 'authorized') return json(400, { error: { description: 'This payment has already been captured' } });
    if (JSON.parse(opt.body).amount !== p.amount) return json(400, { error: { description: 'Capture amount must be equal to the amount authorized' } });
    p.status = 'captured';
    return json(200, { ...p });
  }
  return json(400, { error: { description: 'unknown ' + path } });
}
const pay = (order, extra = {}) => { const id = 'pay_P' + ++R.n; R.payments[id] = { id, entity: 'payment', order_id: order.rzpOrderId, amount: order.amount, currency: 'INR', status: 'captured', method: 'upi', ...extra }; return id; };
const userNow = (phone) => core.getUser(phone);

(async () => {
  await db.setJSON('settings', { monthly: 99, yearly: 999, freeBills: 15, enforce: true, upiId: '', trialDays: 0 });
  core.forgetSettings();
  for (const phone of ['9876543210', '9123456789']) await core.saveUser({ phone, shopName: 'Shop ' + phone.slice(-2), pass: 'x', createdAt: Date.now(), paidUntil: 0 });
  const A = await userNow('9876543210'), B = await userNow('9123456789');

  /* 1. keys */
  eq(rzp.config({}), null, 'no keys: Razorpay off');
  eq(rzp.config({ razorpay: { keyId: 'rzp_live_ABCdef123456', keySecret: 'abcdefghijkl' } }), { keyId: 'rzp_live_ABCdef123456', keySecret: 'abcdefghijkl', live: true }, 'live keys from admin');
  eq(rzp.config({ razorpay: { keyId: 'pk_live_123', keySecret: 'abcdefghijkl' } }), null, 'a key that is not Razorpay\'s is refused');
  eq(rzp.config({ razorpay: { keyId: KEY, keySecret: '' } }), null, 'Key ID without the secret: off');
  process.env.RAZORPAY_KEY_ID = KEY; process.env.RAZORPAY_KEY_SECRET = SECRET;
  eq(rzp.config({}), { keyId: KEY, keySecret: SECRET, live: false }, 'environment keys when admin has none');
  delete process.env.RAZORPAY_KEY_ID; delete process.env.RAZORPAY_KEY_SECRET;
  ok(!core.paymentsReady(await core.getSettings()), 'no UPI ID and no Razorpay: payments off');
  const s = await core.getSettings(true);
  await db.setJSON('settings', { ...s, razorpay: { keyId: KEY, keySecret: SECRET } });
  core.forgetSettings();
  const cfg = rzp.config(await core.getSettings());
  ok(core.paymentsReady(await core.getSettings()), 'Razorpay keys alone switch payments on');
  await throws(rzp.test({ keyId: KEY, keySecret: 'wrong-secret-1' }, rzpFetch), 'wrong secret: Razorpay refused the keys', (e) => /refused the keys/.test(e.message));
  eq(await rzp.test(cfg, rzpFetch), { ok: true, live: false }, 'right keys: test passes and says test mode');

  /* 2. the order */
  const o1 = await rzp.createOrder(cfg, A, 'monthly', '', rzpFetch);
  const c1 = R.calls[R.calls.length - 1];
  eq([c1.method, c1.url, c1.body.amount, c1.body.currency, c1.body.receipt, c1.body.notes.phone], ['POST', 'https://api.razorpay.com/v1/orders', 9900, 'INR', o1.id, A.phone], 'order made at the server price in paise, with our receipt');
  eq([o1.state, o1.amount, o1.method, /^order_/.test(o1.rzpOrderId)], ['CREATED', 9900, 'razorpay', true], 'order saved as created');
  eq(await db.cmd(['ZREVRANGE', `orders:${A.phone}`, 0, -1]), [], 'an unpaid order is not in the payments list');
  await throws(rzp.createOrder(cfg, A, 'weekly', '', rzpFetch), 'unknown plan refused', (e) => e.status === 400);

  /* 3. back from checkout */
  const p1 = pay(o1);
  await throws(rzp.fromCheckout(cfg, A, { razorpay_order_id: o1.rzpOrderId, razorpay_payment_id: p1 }, rzpFetch), 'signature missing: 400, nothing paid', (e) => e.status === 400);
  await throws(rzp.fromCheckout(cfg, A, { razorpay_order_id: o1.rzpOrderId, razorpay_payment_id: p1, razorpay_signature: sign(o1.rzpOrderId, p1, 'other') }, rzpFetch), 'made-up signature refused', (e) => e.status === 400);
  await throws(rzp.fromCheckout(cfg, B, { razorpay_order_id: o1.rzpOrderId, razorpay_payment_id: p1, razorpay_signature: sign(o1.rzpOrderId, p1) }, rzpFetch), 'someone else\'s order refused', (e) => e.status === 404);
  ok(!((await userNow(A.phone)).paidUntil > Date.now()), 'no Pro before a good confirmation');
  const before = Date.now();
  let r = await rzp.fromCheckout(cfg, A, { razorpay_order_id: o1.rzpOrderId, razorpay_payment_id: p1, razorpay_signature: sign(o1.rzpOrderId, p1) }, rzpFetch);
  let u = await userNow(A.phone);
  eq([r.first, r.order.state, r.order.paymentId, r.order.payMethod, u.lastPlan], [true, 'COMPLETED', p1, 'upi', 'monthly'], 'good payment: order completed');
  ok(Math.abs(u.paidUntil - (before + 30 * core.DAY)) < 5000, 'monthly plan adds 30 days of Pro');
  eq(await db.cmd(['ZREVRANGE', `orders:${A.phone}`, 0, -1]), [o1.id], 'paid order shows in the payments list');
  eq(await db.cmd(['ZREVRANGE', `rzpopen:${A.phone}`, 0, -1]), [], 'paid order no longer open');
  // the same payment again (webhook, second tap, reconcile): Pro is not added twice
  const until1 = u.paidUntil;
  r = await rzp.webhook(cfg, { event: 'payment.captured', payload: { payment: { entity: { ...R.payments[p1] } } } }, rzpFetch);
  r = await rzp.fromCheckout(cfg, A, { razorpay_order_id: o1.rzpOrderId, razorpay_payment_id: p1, razorpay_signature: sign(o1.rzpOrderId, p1) }, rzpFetch);
  eq([r.first, (await userNow(A.phone)).paidUntil], [false, until1], 'same payment twice: Pro added once');

  /* 4. what Razorpay says about the payment decides */
  const o2 = await rzp.createOrder(cfg, A, 'yearly', '', rzpFetch);
  const p2 = pay(o2, { amount: 100 }); // paid ₹1 instead of ₹999
  await throws(rzp.settle(cfg, o2, p2, rzpFetch), 'amount does not match: refused', (e) => /does not match/.test(e.message));
  const p2b = pay(o1); // a payment of another order
  await throws(rzp.settle(cfg, o2, p2b, rzpFetch), 'payment of a different order: refused', (e) => /different order/.test(e.message));
  const p2c = pay(o2, { status: 'failed' });
  await throws(rzp.settle(cfg, o2, p2c, rzpFetch), 'failed payment: says no money was taken', (e) => e.status === 402 && /no money was taken/.test(e.message));
  ok((await userNow(A.phone)).paidUntil === until1, 'none of those added Pro');
  const p2d = pay(o2, { status: 'authorized' });
  const callsBefore = R.calls.length;
  r = await rzp.settle(cfg, o2, p2d, rzpFetch);
  const cap = R.calls.slice(callsBefore).find((c) => /capture$/.test(c.url));
  eq([!!cap, cap && cap.body, R.payments[p2d].status, r.order.state], [true, { amount: 99900, currency: 'INR' }, 'captured', 'COMPLETED'], 'authorised payment is captured for the full amount, then Pro');
  ok(Math.abs((await userNow(A.phone)).paidUntil - (until1 + 365 * core.DAY)) < 5000, 'yearly adds 365 days on top of what was left');

  // captured by Razorpay's auto-capture at the same moment: still fine
  const o3 = await rzp.createOrder(cfg, B, 'monthly', '', rzpFetch);
  const p3 = pay(o3, { status: 'authorized' });
  const realFetch = rzpFetch;
  let raced = false;
  const racing = (url, opt) => { if (/capture$/.test(url) && !raced) { raced = true; R.payments[p3].status = 'captured'; } return realFetch(url, opt); };
  r = await rzp.settle(cfg, o3, p3, racing);
  eq([r.first, r.order.state], [true, 'COMPLETED'], 'captured meanwhile by Razorpay: no error, Pro on');

  /* 5. webhook */
  eq(await rzp.webhook(cfg, { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_X1', order_id: 'order_NotOurs', status: 'captured', amount: 100 } } } }, rzpFetch), { ignored: true }, 'webhook for an order that is not PakkaBill\'s: ignored');
  eq(await rzp.webhook(cfg, { event: 'payment.failed', payload: { payment: { entity: { id: 'pay_X2', order_id: 'order_T1', status: 'failed' } } } }, rzpFetch), { ignored: true }, 'failed-payment webhook: ignored');
  const o4 = await rzp.createOrder(cfg, B, 'monthly', '', rzpFetch);
  const fake = { event: 'payment.captured', payload: { payment: { entity: { id: p1, order_id: o4.rzpOrderId, status: 'captured', amount: o4.amount } } } };
  await throws(rzp.webhook(cfg, fake, rzpFetch), 'made-up webhook (real payment of another order) cannot turn Pro on', (e) => /different order/.test(e.message));
  const p4 = pay(o4);
  const bUntil = (await userNow(B.phone)).paidUntil;
  r = await rzp.webhook(cfg, { event: 'order.paid', payload: { payment: { entity: { ...R.payments[p4] } }, order: { entity: R.orders[o4.rzpOrderId] } } }, rzpFetch);
  ok(r.first && (await userNow(B.phone)).paidUntil - bUntil > 29 * core.DAY, 'webhook alone turns Pro on (app closed after paying)');

  /* 5b. refunds */
  const refundHook = (paymentId, amount) => ({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_' + paymentId, payment_id: paymentId, amount } } } });
  eq(await rzp.webhook(cfg, refundHook('pay_unknown1', 100), rzpFetch), { ignored: true }, 'refund of a payment that is not PakkaBill\'s: ignored');
  // a forged refund call: Razorpay says nothing was refunded, so Pro stays
  const bPaid = (await userNow(B.phone)).paidUntil;
  r = await rzp.webhook(cfg, refundHook(p4, o4.amount), rzpFetch);
  ok(r.ignored && (await userNow(B.phone)).paidUntil === bPaid, 'refund webhook without a refund at Razorpay changes nothing', JSON.stringify(r));
  // a part refund keeps Pro
  R.payments[p4].amount_refunded = Math.round(o4.amount / 2); R.payments[p4].refund_status = 'partial';
  r = await rzp.webhook(cfg, refundHook(p4, Math.round(o4.amount / 2)), rzpFetch);
  ok(r.partial && (await userNow(B.phone)).paidUntil === bPaid, 'part refund: Pro stays', JSON.stringify(r));
  // a full refund takes back the 30 days, once
  R.payments[p4].amount_refunded = o4.amount; R.payments[p4].refund_status = 'full';
  r = await rzp.webhook(cfg, refundHook(p4, o4.amount), rzpFetch);
  eq([r.first, r.refunded && r.refunded.state, bPaid - (await userNow(B.phone)).paidUntil], [true, 'REFUNDED', 30 * core.DAY], 'full refund: order refunded, the 30 days it bought taken back');
  r = await rzp.webhook(cfg, refundHook(p4, o4.amount), rzpFetch);
  ok(r.ignored && bPaid - (await userNow(B.phone)).paidUntil === 30 * core.DAY, 'the same refund again takes nothing more');
  r = await rzp.settle(cfg, await db.getJSON(`order:${o4.id}`), p4, rzpFetch);
  ok(!r.first && (await db.getJSON(`order:${o4.id}`)).state === 'REFUNDED' && bPaid - (await userNow(B.phone)).paidUntil === 30 * core.DAY, 'a refunded payment checked again stays refunded and adds nothing');
  await throws(require('../api/_lib/orders').approve(o4.id), 'admin approve on a refunded payment is refused', (e) => e.status === 400 && /refunded/.test(e.message));
  // give B the month back for the checks below
  await core.saveUser({ ...(await userNow(B.phone)), paidUntil: bPaid });

  /* 6. catching up when the customer opens their plan */
  const o5 = await rzp.createOrder(cfg, B, 'monthly', '', rzpFetch);
  const o6 = await rzp.createOrder(cfg, B, 'monthly', '', rzpFetch);
  const old = { ...(await db.getJSON(`order:${o6.id}`)), createdAt: Date.now() - 3 * core.DAY };
  await db.setJSON(`order:${o6.id}`, old);
  pay(o5, { status: 'authorized' });
  const b2 = (await userNow(B.phone)).paidUntil;
  let done = await rzp.reconcile(cfg, B.phone, rzpFetch);
  eq([done.length, done[0] && done[0].order.id, R.payments[Object.keys(R.payments).pop()].status], [1, o5.id, 'captured'], 'open order paid in Razorpay: found, captured and Pro added');
  ok((await userNow(B.phone)).paidUntil - b2 > 29 * core.DAY, 'Pro added by the catch-up');
  eq(await db.cmd(['ZREVRANGE', `rzpopen:${B.phone}`, 0, -1]), [], 'paid and old orders leave the open list');
  const o7 = await rzp.createOrder(cfg, B, 'monthly', '', rzpFetch);
  let n0 = R.calls.length; await rzp.reconcile(cfg, B.phone, rzpFetch); const n1 = R.calls.length; await rzp.reconcile(cfg, B.phone, rzpFetch);
  eq([n1 - n0, R.calls.length - n1], [1, 0], 'an unpaid order is asked about at most once a minute');
  R.down = true; await db.cmd(['DEL', `rzpchk:${o7.id}`]);
  const quiet = console.error; console.error = () => {}; // the expected 'could not reach' log
  eq(await rzp.reconcile(cfg, B.phone, rzpFetch), [], 'Razorpay unreachable: the plan page still opens');
  console.error = quiet; R.down = false;

  /* 7. coupons: counted once, when paid */
  await db.setJSON('coupons', [{ code: 'HALF', kind: 'percent', value: 50, plans: 'both', maxUses: 5, endAt: 0, active: true, createdAt: Date.now() }]);
  const o8 = await rzp.createOrder(cfg, A, 'yearly', 'half', rzpFetch);
  eq([o8.amount, o8.listAmount, o8.coupon, R.calls[R.calls.length - 1].body.amount], [49900, 99900, 'HALF', 49900], 'coupon price is what Razorpay is asked for');
  eq(await db.cmd(['GET', 'coupon:used:HALF']), null, 'an unpaid order does not use up the coupon');
  const p8 = pay(o8);
  await rzp.settle(cfg, o8, p8, rzpFetch); await rzp.settle(cfg, { ...o8 }, p8, rzpFetch);
  eq(await db.cmd(['GET', 'coupon:used:HALF']), '1', 'paid with a coupon: counted once');

  /* 8. the endpoint */
  global.fetch = rzpFetch;
  const handler = require('../api/pay');
  const call = (method, url, body, token) => new Promise((resolve) => {
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve({ status: this.statusCode, body: JSON.parse(b) }); } };
    handler({ method, url, body, headers: { authorization: token ? 'Bearer ' + token : '', 'x-forwarded-for': '1.2.3.4' }, socket: {} }, res);
  });
  let a = await call('POST', '/api/pay', { action: 'rzpOrder', plan: 'monthly' });
  eq(a.status, 401, 'endpoint: must be logged in to pay');
  const tA = await core.createSession(A.phone);
  a = await call('POST', '/api/pay', { action: 'rzpOrder', plan: 'monthly' }, tA);
  eq([a.status, a.body.key, /^order_/.test(a.body.orderId), a.body.amount, a.body.currency], [200, KEY, true, 9900, 'INR'], 'endpoint: order for checkout, with the public Key ID only');
  ok(!JSON.stringify(a.body).includes(SECRET), 'endpoint: the key secret is never sent');
  const oid = a.body.orderId, pid = pay({ rzpOrderId: oid, amount: 9900 });
  const aUntil = (await userNow(A.phone)).paidUntil;
  a = await call('POST', '/api/pay', { action: 'rzpDone', razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sign(oid, pid + 'x') }, tA);
  eq([a.status, (await userNow(A.phone)).paidUntil], [400, aUntil], 'endpoint: signature mismatch is 400 and Pro is not added');
  a = await call('POST', '/api/pay', { action: 'rzpDone', razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sign(oid, pid) }, tA);
  eq([a.status, a.body.order.state, a.body.user.pro, a.body.user.paidUntil - aUntil > 29 * core.DAY], [200, 'COMPLETED', true, true], 'endpoint: confirmed, Pro on, new plan date sent back');
  a = await call('POST', '/api/pay', { plan: 'monthly', utr: '123456789012' }, tA);
  eq([a.status, /Razorpay/.test(a.body.error)], [400, true], 'endpoint: no UPI ID set, so no UTR payments');
  a = await call('POST', '/api/pay?razorpay=webhook', { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_none', order_id: 'order_none', status: 'captured' } } } });
  eq([a.status, a.body.ignored === undefined], [200, true], 'endpoint: webhook needs no login and answers 200');
  const ow = await rzp.createOrder(cfg, B, 'monthly', '', rzpFetch); const pw = pay(ow, { amount: 100 });
  a = await call('POST', '/api/pay?razorpay=webhook', { event: 'payment.captured', payload: { payment: { entity: { ...R.payments[pw] } } } });
  eq([a.status, a.body.ignored, /does not match/.test(a.body.reason)], [200, true, true], 'endpoint: a payment that can never count answers 200 so Razorpay keeps the webhook on');
  R.down = true;
  const ow2 = await rzp.createOrder(cfg, B, 'monthly', '', (u, o) => { R.down = false; const x = rzpFetch(u, o); R.down = true; return x; }); pay(ow2);
  const quiet2 = console.error; console.error = () => {};
  a = await call('POST', '/api/pay?razorpay=webhook', { event: 'payment.captured', payload: { payment: { entity: { ...R.payments[Object.keys(R.payments).pop()] } } } });
  console.error = quiet2; R.down = false;
  eq(a.status >= 500, true, 'endpoint: Razorpay unreachable, so the webhook asks to be sent again');
  // the app closed right after paying: the plan page catches up and sends the new plan
  const oc = await rzp.createOrder(cfg, A, 'monthly', '', rzpFetch); pay(oc);
  a = await call('GET', '/api/pay', null, tA);
  eq([a.status, a.body.orders[0].id, !!a.body.user], [200, oc.id, true], 'endpoint: plan page finds the payment and sends the new plan');

  // the owner account and Pro for years ahead: nothing to buy
  await core.saveUser({ phone: 'owner', shopName: 'Owner', pass: '', createdAt: Date.now(), paidUntil: Date.UTC(2099, 0, 1) });
  const tO = await core.createSession('owner');
  a = await call('POST', '/api/pay', { action: 'rzpOrder', plan: 'monthly' }, tO);
  eq([a.status, /owner account/.test(a.body.error)], [400, true], 'owner account: no Razorpay order');
  a = await call('POST', '/api/pay', { plan: 'monthly', utr: '987654321098' }, tO);
  eq([a.status, /owner account/.test(a.body.error)], [400, true], 'owner account: no UPI payment either');
  await core.saveUser({ ...(await userNow(B.phone)), paidUntil: Date.now() + 5 * 365 * core.DAY });
  a = await call('POST', '/api/pay', { action: 'rzpOrder', plan: 'yearly' }, await core.createSession(B.phone));
  eq([a.status, /runs for years/.test(a.body.error)], [400, true], 'Pro for years ahead: nothing to buy');

  /* 9. config and admin */
  const cfgHandler = require('../api/config');
  const conf = await new Promise((resolve) => cfgHandler({ method: 'GET', url: '/api/config', headers: {}, socket: {} }, { statusCode: 0, setHeader() {}, end(b) { resolve(JSON.parse(b)); } }));
  eq([conf.enabled, conf.razorpay, JSON.stringify(conf).includes(SECRET)], [true, KEY, false], 'public config: Razorpay on, Key ID only');
  const admin = require('../api/admin');
  const at = core.token(); await db.cmd(['SET', `asess:${core.sha256(at)}`, '1']);
  const adm = (b) => new Promise((resolve) => admin({ method: 'POST', body: b, headers: { authorization: 'Bearer ' + at }, socket: {} }, { statusCode: 0, setHeader() {}, end(x) { resolve({ status: this.statusCode, body: JSON.parse(x) }); } }));
  const base = { monthly: 99, yearly: 999, freeBills: 15, enforce: true, upiId: '', payeeName: '', trialDays: 0 };
  a = await adm({ action: 'saveSettings', ...base, razorpay: { keyId: 'rzp_live_ABCdef123456', keySecret: '' } });
  eq([a.status, /Key Secret/.test(a.body.error)], [400, true], 'admin: Key ID without the secret refused');
  a = await adm({ action: 'saveSettings', ...base, razorpay: { keyId: 'live_123', keySecret: 'abcdefghij' } });
  eq([a.status, /rzp_live_/.test(a.body.error)], [400, true], 'admin: wrong Key ID refused');
  a = await adm({ action: 'rzpTest', keyId: KEY, keySecret: 'nope-nope-nope' });
  eq([a.status, /refused the keys/.test(a.body.error)], [502, true], 'admin: Test keys says when they are wrong');
  a = await adm({ action: 'rzpTest', keyId: KEY, keySecret: SECRET });
  eq([a.status, a.body.ok], [200, true], 'admin: Test keys passes with the right keys');
  a = await adm({ action: 'saveSettings', ...base, razorpay: { keyId: KEY, keySecret: SECRET } });
  eq([a.status, a.body.settings.razorpay.keyId], [200, KEY], 'admin: keys saved');
  a = await adm({ action: 'payments', q: pid });
  eq([a.status, a.body.payments.length, a.body.payments[0] && a.body.payments[0].paymentId], [200, 1, pid], 'admin: payments searchable by Razorpay payment ID');

  console.log(`${checks - fails}/${checks} Razorpay checks passed`);
  if (fails) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
