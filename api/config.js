// GET /api/config  -> prices, free bill limit, the shop's UPI ID and whether paid features are on
// GET /api/config?gstin=...  -> name and address of a GST number (see _lib/gst.js)
// GET /api/config?ifsc=...   -> bank and branch of an IFSC code (Razorpay's free IFSC directory)
const core = require('./_lib/core');
const gst = require('./_lib/gst');
const rzp = require('./_lib/razorpay');
const otp = require('./_lib/otp');

module.exports = core.handler(async (req, res) => {
  const gstin = new URL(req.url, 'http://x').searchParams.get('gstin');
  if (gstin !== null) return gst.handle(req, res, gstin);
  const ifsc = new URL(req.url, 'http://x').searchParams.get('ifsc');
  if (ifsc !== null) return gst.ifsc(req, res, ifsc);
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
    razorpay: (rzp.config(s) || {}).keyId || '', // the Key ID is public by design; the secret never leaves the server
    payeeName: s.payeeName,
    otp: await otp.enabled(), // sign-up checks the number with an OTP; log in with OTP is offered
    otpVia: await otp.channel(), // 'whatsapp' (Gupshup) or 'sms': where the customer gets the OTP
    trialDays: core.paymentsReady(s) && s.enforce ? Number(s.trialDays) || 0 : 0,
    biz: { name: s.bizName, email: s.bizEmail, phone: s.bizPhone, address: s.bizAddress, grievance: s.grievanceName },
  }, 'public, max-age=0, must-revalidate');
});
