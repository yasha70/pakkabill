// POST /api/pay  { plan: 'monthly' | 'yearly', utr }  -> records a UPI payment for the admin to approve
// GET  /api/pay                                     -> this customer's latest payments
const core = require('./_lib/core');
const orders = require('./_lib/orders');

module.exports = core.handler(async (req, res) => {
  const user = await core.requireUser(req);
  if (!core.paymentsReady(await core.getSettings())) throw new core.HttpError(503, 'Payments are not set up yet.');

  if (req.method === 'POST') {
    await core.rateLimit(`pay:${user.phone}`, 10, 3600);
    const { plan, utr } = core.body(req);
    const order = await orders.claim(user, plan, utr);
    return core.send(res, 200, { order });
  }
  if (req.method === 'GET') return core.send(res, 200, { orders: await orders.mine(user.phone) });
  throw new core.HttpError(405, 'Use GET or POST');
});
