// POST /api/pay  { plan: 'monthly' | 'yearly', utr, coupon }  -> records a UPI payment for the admin to approve
// POST /api/pay  { action: 'quote', plan, coupon }            -> price after the coupon
// GET  /api/pay                                     -> this customer's latest payments
const core = require('./_lib/core');
const orders = require('./_lib/orders');
const promos = require('./_lib/promos');

module.exports = core.handler(async (req, res) => {
  const user = await core.requireUser(req);
  if (!core.paymentsReady(await core.getSettings())) throw new core.HttpError(503, 'Payments are not set up yet.');

  if (req.method === 'POST') {
    const { action, plan, utr, coupon } = core.body(req);
    if (action === 'quote') {
      await core.rateLimit(`quote:${user.phone}`, 30, 3600);
      const q = await promos.price(plan, coupon);
      return core.send(res, 200, { list: q.list, amount: q.amount, coupon: q.coupon });
    }
    await core.rateLimit(`pay:${user.phone}`, 10, 3600);
    const order = await orders.claim(user, plan, utr, coupon);
    return core.send(res, 200, { order });
  }
  if (req.method === 'GET') return core.send(res, 200, { orders: await orders.mine(user.phone) });
  throw new core.HttpError(405, 'Use GET or POST');
});
