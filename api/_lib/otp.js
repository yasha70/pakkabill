// OTP by SMS for sign-up and log in. Off until an SMS provider is set in Vercel's environment
// variables (Project > Settings > Environment Variables), then on by itself:
//   OTP_PROVIDER = fast2sms | msg91 | 2factor
//   fast2sms: FAST2SMS_API_KEY
//   msg91:    MSG91_AUTH_KEY and MSG91_TEMPLATE_ID (an OTP template with the variable ##OTP##)
//   2factor:  TWOFACTOR_API_KEY (and optionally TWOFACTOR_TEMPLATE, the name of an approved template)
// PakkaBill makes the 6-digit code itself and keeps only a hash of it for 10 minutes; the provider
// only delivers the SMS. Locally (npm run dev, in-memory database) OTP_PROVIDER=test shows the code
// in the server log instead of sending it.
const crypto = require('crypto');
const core = require('./core');
const db = require('./db');

const TTL = 600; // seconds a code is valid
const TRIES = 5; // wrong codes before it is used up

function provider() {
  const p = String(process.env.OTP_PROVIDER || '').trim().toLowerCase();
  const e = process.env;
  if (p === 'fast2sms' && e.FAST2SMS_API_KEY) return p;
  if (p === 'msg91' && e.MSG91_AUTH_KEY && e.MSG91_TEMPLATE_ID) return p;
  if (p === '2factor' && e.TWOFACTOR_API_KEY) return p;
  if (p === 'test' && e.PB_DEV_MEMORY_DB === '1') return p; // never on the live site
  return '';
}
const enabled = () => !!provider();

async function deliver(phone, code) {
  const p = provider(), e = process.env;
  const go = (url, opts) => fetch(url, { ...opts, signal: AbortSignal.timeout(10000) });
  let res;
  if (p === 'test') { console.log(`[OTP test] ${phone}: ${code}`); return; }
  if (p === 'fast2sms') {
    res = await go(`https://www.fast2sms.com/dev/bulkV2?route=otp&variables_values=${code}&numbers=${phone}`, { headers: { authorization: e.FAST2SMS_API_KEY } });
  } else if (p === 'msg91') {
    res = await go(`https://control.msg91.com/api/v5/otp?template_id=${encodeURIComponent(e.MSG91_TEMPLATE_ID)}&mobile=91${phone}&otp=${code}`, { method: 'POST', headers: { authkey: e.MSG91_AUTH_KEY, 'Content-Type': 'application/json' }, body: '{}' });
  } else if (p === '2factor') {
    const tpl = e.TWOFACTOR_TEMPLATE ? '/' + encodeURIComponent(e.TWOFACTOR_TEMPLATE) : '';
    res = await go(`https://2factor.in/API/V1/${encodeURIComponent(e.TWOFACTOR_API_KEY)}/SMS/${phone}/${code}${tpl}`, {});
  }
  const text = res ? await res.text().catch(() => '') : '';
  // each provider says "ok" differently; a failure status or an error word means the SMS did not go
  if (!res || !res.ok || /"(return|status)"\s*:\s*(false|"error"|"failed")|"type"\s*:\s*"error"/i.test(text)) {
    console.error('OTP send failed', p, res && res.status, text.slice(0, 300));
    throw new core.HttpError(502, 'Could not send the OTP right now. Try again in a minute, or use your password.');
  }
}

const key = (phone) => `otp:${phone}`;
const hash = (phone, code) => core.sha256(`otp|${phone}|${code}`);

// Sends a new code to the number (purpose 'signup' or 'login', so a code is only good for that).
async function send(phone, purpose, ip) {
  if (!enabled()) throw new core.HttpError(400, 'OTP is not set up yet. Use your password.');
  await core.rateLimit(`otp:ip:${ip}`, 20, 3600);
  await core.rateLimit(`otp:ph:${phone}`, 3, 600);
  await core.rateLimit(`otp:day:${phone}`, 10, 86400);
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  await db.cmd(['SET', key(phone), JSON.stringify({ h: hash(phone, code), p: purpose, n: 0 }), 'EX', TTL]);
  await deliver(phone, code);
  return { sent: true, seconds: TTL };
}

// Checks a code; it works once. Throws with a clear message when it is wrong or old.
async function check(phone, purpose, code) {
  const raw = await db.cmd(['GET', key(phone)]);
  let o = null;
  try { o = raw ? JSON.parse(raw) : null; } catch { o = null; }
  if (!o || o.p !== purpose) throw new core.HttpError(400, 'This OTP is old. Tap Send OTP to get a new one.');
  if (o.n >= TRIES) { await db.cmd(['DEL', key(phone)]); throw new core.HttpError(400, 'Too many wrong tries. Tap Send OTP to get a new one.'); }
  if (!core.safeEqual(hash(phone, String(code || '').replace(/\D/g, '')), o.h)) {
    o.n++;
    await db.cmd(['SET', key(phone), JSON.stringify(o), 'EX', TTL]);
    throw new core.HttpError(401, `The OTP is wrong. ${TRIES - o.n} tries left.`);
  }
  await db.cmd(['DEL', key(phone)]);
}

module.exports = { enabled, send, check };
