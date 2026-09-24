// GET /api/config  -> prices, free bill limit and whether paid features are switched on
const core = require('./_lib/core');

module.exports = core.handler(async (req, res) => {
  const s = await core.getSettings();
  core.send(res, 200, {
    enabled: core.paymentsReady(),
    enforce: !!s.enforce,
    monthly: s.monthly,
    yearly: s.yearly,
    freeBills: s.freeBills,
  });
});
