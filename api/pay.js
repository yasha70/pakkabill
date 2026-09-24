// POST /api/pay  { plan: 'monthly' | 'yearly' }      -> { redirectUrl } to PhonePe checkout
// GET  /api/pay?order=ID                             -> verifies with PhonePe and returns the plan
const core = require('./_lib/core');
const orders = require('./_lib/orders');

function origin(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

module.exports = core.handler(async (req, res) => {
  const user = await core.requireUser(req);
  if (!core.paymentsReady()) throw new core.HttpError(503, 'Payments are not set up yet.');

  if (req.method === 'POST') {
    await core.rateLimit(`pay:${user.phone}`, 20, 3600);
    const { plan } = core.body(req);
    return core.send(res, 200, await orders.createOrder(user, plan, origin(req)));
  }
  if (req.method === 'GET') {
    const id = String(req.query.order || '');
    const existing = await orders.getOrder(id);
    if (!existing || existing.phone !== user.phone) throw new core.HttpError(404, 'Payment not found.');
    const order = await orders.verifyOrder(id);
    const fresh = await core.getUser(user.phone);
    return core.send(res, 200, { state: order.state, plan: order.plan, user: core.publicUser(fresh) });
  }
  throw new core.HttpError(405, 'Use GET or POST');
});
