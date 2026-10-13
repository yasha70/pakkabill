// POST /api/pay  { plan: 'monthly' | 'yearly', utr, coupon }  -> records a UPI payment for the admin to approve
// POST /api/pay  { action: 'quote', plan, coupon }            -> price after the coupon
// POST /api/pay  { action: 'rzpOrder', plan, coupon }         -> a Razorpay order to open checkout with
// POST /api/pay  { action: 'rzpDone', razorpay_order_id, razorpay_payment_id, razorpay_signature } -> checks it, turns Pro on
// POST /api/pay?razorpay=webhook                              -> Razorpay's webhook (see _lib/razorpay.js)
// GET  /api/pay                                     -> this customer's latest payments
const core = require('./_lib/core');
const orders = require('./_lib/orders');
const promos = require('./_lib/promos');
const push = require('./_lib/push');
const rzp = require('./_lib/razorpay');

const paidNote = (order, user) => push.toAdmin({ title: `₹${(order.amount / 100).toLocaleString('en-IN')} received on Razorpay`, body: `${(user && user.shopName) || order.phone}: ${order.plan} plan, Pro is on`, url: '/admin#payments', tag: `pay-${order.id}` }).catch(() => {});

module.exports = core.handler(async (req, res) => {
  if (req.method === 'POST' && new URL(req.url, 'http://x').searchParams.get('razorpay') === 'webhook') {
    core.requireDb();
    const cfg = rzp.config(await core.getSettings());
    if (!cfg) return core.send(res, 200, { ignored: true });
    let out;
    try {
      out = await rzp.webhook(cfg, core.body(req));
    } catch (e) {
      // A payment that can never count (wrong amount, another order): answer 200 so Razorpay stops
      // sending it; it switches off webhooks that keep failing. Razorpay or the database being
      // unreachable is a 5xx, which Razorpay sends again later.
      if (e instanceof core.HttpError && e.status < 500) return core.send(res, 200, { ignored: true, reason: e.message });
      throw e;
    }
    if (out.refunded) {
      if (out.first) await push.toAdmin({ title: `₹${(out.refunded.refundAmount / 100).toLocaleString('en-IN')} refunded on Razorpay`, body: `${out.refunded.phone}: the ${out.refunded.plan} plan time is taken back`, url: '/admin#payments', tag: `refund-${out.refunded.id}` }).catch(() => {});
    } else if (out.first) await paidNote(out.order);
    return core.send(res, 200, { ok: true });
  }

  const user = await core.requireUser(req);
  const settings = await core.getSettings();
  if (!core.paymentsReady(settings)) throw new core.HttpError(503, 'Payments are not set up yet.');
  const cfg = rzp.config(settings);

  if (req.method === 'POST') {
    const b = core.body(req);
    const { action, plan, utr, coupon } = b;
    if (action === 'quote') {
      await core.rateLimit(`quote:${user.phone}`, 30, 3600);
      const q = await promos.price(plan, coupon);
      return core.send(res, 200, { list: q.list, amount: q.amount, coupon: q.coupon });
    }
    // the owner account (and Pro for years ahead) has nothing to buy; payments already made still confirm
    const lifetime = user.phone === 'owner' || (user.paidUntil || 0) > Date.now() + 3 * 365 * core.DAY;
    if (lifetime && action !== 'rzpDone') {
      throw new core.HttpError(400, user.phone === 'owner' ? 'The owner account has Pro for good, nothing to pay. To try a payment, log in with a customer mobile number.' : 'Your PakkaBill Pro already runs for years. Nothing to pay.');
    }
    if (action === 'rzpOrder' || action === 'rzpDone') {
      if (!cfg) throw new core.HttpError(400, 'Razorpay is not set up. Pay by UPI QR instead.');
      if (action === 'rzpOrder') {
        await core.rateLimit(`rzp:${user.phone}`, 20, 3600);
        const order = await rzp.createOrder(cfg, user, plan, coupon);
        return core.send(res, 200, { key: cfg.keyId, orderId: order.rzpOrderId, amount: order.amount, currency: 'INR', id: order.id });
      }
      await core.rateLimit(`rzpdone:${user.phone}`, 30, 3600);
      const { order, first } = await rzp.fromCheckout(cfg, user, b);
      if (first) await paidNote(order, user);
      return core.send(res, 200, { order, user: core.publicUser(await core.getUser(user.phone)) });
    }
    if (!core.UPI_ID.test(settings.upiId || '')) throw new core.HttpError(400, 'Pay with the Pay button (Razorpay).');
    await core.rateLimit(`pay:${user.phone}`, 10, 3600);
    const order = await orders.claim(user, plan, utr, coupon);
    await push.toAdmin({ title: `New payment ₹${(order.amount / 100).toLocaleString('en-IN')} to check`, body: `${user.shopName || user.phone}: ${order.plan} plan, UTR ${order.utr}`, url: '/admin#payments', tag: `pay-${order.id}` });
    return core.send(res, 200, { order });
  }
  if (req.method === 'GET') {
    // money taken but the app closed before it heard back: catch up here
    const caught = cfg ? await rzp.reconcile(cfg, user.phone).catch(() => []) : [];
    for (const c of caught) if (c.first) await paidNote(c.order, user);
    const out = { orders: await orders.mine(user.phone) };
    if (caught.length) out.user = core.publicUser(await core.getUser(user.phone));
    return core.send(res, 200, out);
  }
  throw new core.HttpError(405, 'Use GET or POST');
});
