// GET /api/config  -> prices, free bill limit, the shop's UPI ID and whether paid features are on
const core = require('./_lib/core');

module.exports = core.handler(async (req, res) => {
  // Browsers always check again; only Vercel's CDN keeps a copy (for a minute).
  res.setHeader('CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  const s = await core.getSettings();
  core.send(res, 200, {
    enabled: core.paymentsReady(s),
    enforce: !!s.enforce,
    monthly: s.monthly,
    yearly: s.yearly,
    freeBills: s.freeBills,
    upiId: s.upiId,
    payeeName: s.payeeName,
    trialDays: core.paymentsReady(s) && s.enforce ? Number(s.trialDays) || 0 : 0,
    biz: { name: s.bizName, email: s.bizEmail, phone: s.bizPhone, address: s.bizAddress, grievance: s.grievanceName },
  }, 'public, max-age=0, must-revalidate');
});
