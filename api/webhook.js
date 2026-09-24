// POST /api/webhook  PhonePe server-to-server callback.
// PhonePe sends Authorization: SHA256(username:password) using the credentials set on its dashboard.
// The body is only used to find the order; its state is always re-read from PhonePe's status API.
const core = require('./_lib/core');
const orders = require('./_lib/orders');

module.exports = core.handler(async (req, res) => {
  core.requireMethod(req, 'POST');
  core.requireDb();
  const user = process.env.PHONEPE_WEBHOOK_USER || '';
  const pass = process.env.PHONEPE_WEBHOOK_PASS || '';
  if (!user || !pass) throw new core.HttpError(503, 'Webhook not configured.');
  const got = String(req.headers.authorization || '').replace(/^SHA256\s*/i, '').trim().toLowerCase();
  if (!core.safeEqual(got, core.sha256(`${user}:${pass}`))) throw new core.HttpError(401, 'Bad signature.');

  const b = core.body(req);
  const p = b.payload || {};
  const id = String(p.merchantOrderId || p.originalMerchantOrderId || '');
  if (!id || !(await orders.getOrder(id))) return core.send(res, 200, { ok: true, ignored: true });
  const order = await orders.verifyOrder(id);
  core.send(res, 200, { ok: true, state: order.state });
});
