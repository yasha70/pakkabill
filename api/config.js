// GET /api/config  -> prices, free bill limit, the shop's UPI ID and whether paid features are on
const core = require('./_lib/core');

module.exports = core.handler(async (req, res) => {
  const s = await core.getSettings();
  core.send(res, 200, {
    enabled: core.paymentsReady(s),
    enforce: !!s.enforce,
    monthly: s.monthly,
    yearly: s.yearly,
    freeBills: s.freeBills,
    upiId: s.upiId,
    payeeName: s.payeeName,
  });
});
