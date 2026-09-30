// Mobile number verification through the OTP Verify service (missed call or SMS OTP, sent from
// the owner's own gateway phone). Switched on only when all three settings are present:
//   OTP_API_URL     e.g. https://otp-verify-yash-agarwal-s-projects.vercel.app
//   OTP_WIDGET_KEY  wk_... (public, shown in the page)
//   OTP_SECRET_KEY  sk_... (server only)
// Without them, or while no gateway phone is online, sign-up and log-in work as before.
const core = require('./core');

const URL_ = (process.env.OTP_API_URL || '').replace(/\/$/, '');
const WIDGET = process.env.OTP_WIDGET_KEY || '';
const SECRET = process.env.OTP_SECRET_KEY || '';

function configured() {
  return !!(URL_ && WIDGET && SECRET);
}

// Verification is only asked for while the gateway phone is online, so a phone that is switched
// off or has no signal never stops new customers from signing up. Checked at most once a minute.
let health = { at: 0, online: false };
async function online() {
  if (!configured()) return false;
  if (Date.now() - health.at < 60000) return health.online;
  try {
    const res = await fetch(URL_ + '/health', { signal: AbortSignal.timeout(4000) });
    const h = await res.json();
    health = { at: Date.now(), online: !!(res.ok && (h.missed_call_online || h.sms_online)) };
  } catch (e) {
    console.error('otp health check failed:', e.message);
    health = { at: Date.now(), online: false };
  }
  return health.online;
}

// What the page needs to show the verification widget, or null when verification is off.
async function publicConfig() {
  return (await online()) ? { url: URL_, widgetKey: WIDGET } : null;
}

// Checks a verification token from the widget and that it is for `phone` (10 digits).
// Tokens are single use, so each one creates or resets at most one account.
async function confirm(tokenValue, phone) {
  if (!tokenValue) throw new core.HttpError(400, 'Verify your mobile number first.');
  let res, data;
  try {
    res = await fetch(URL_ + '/api/v1/token/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + SECRET },
      body: JSON.stringify({ token: String(tokenValue) }),
      signal: AbortSignal.timeout(10000),
    });
    data = await res.json().catch(() => ({}));
  } catch (e) {
    console.error('otp verify unreachable:', e.message);
    throw new core.HttpError(503, 'Could not check the mobile verification. Please try again.');
  }
  if (!res.ok || !data.verified) {
    throw new core.HttpError(400, 'The mobile verification expired or was already used. Please verify again.');
  }
  if (core.normPhone(data.mobile) !== phone) {
    throw new core.HttpError(400, 'The verified number is different from the number you typed. Please verify this number.');
  }
}

module.exports = { configured, online, publicConfig, confirm };
