// OTP by SMS for sign-up, log in, a new password, verifying a number and deleting an account.
// Off until an SMS company is set up, in one of two places:
//   1. Admin panel > Settings > OTP by SMS (settings.otp: { on, provider, apiKey, templateId }).
//      Once a company is chosen there, the admin panel decides (its on/off switch included).
//   2. Otherwise Vercel's environment variables (the older way):
//      OTP_PROVIDER = fast2sms | msg91 | 2factor
//      fast2sms: FAST2SMS_API_KEY
//      msg91:    MSG91_AUTH_KEY and MSG91_TEMPLATE_ID (an OTP template with the variable ##OTP##)
//      2factor:  TWOFACTOR_API_KEY (and optionally TWOFACTOR_TEMPLATE, the name of an approved template)
//      gupshup:  OTP on WhatsApp. GUPSHUP_API_KEY, GUPSHUP_SOURCE (the WhatsApp business number,
//                with 91), GUPSHUP_APP_NAME and GUPSHUP_TEMPLATE_ID (an approved authentication
//                template whose one variable {{1}} is the code)
// PakkaBill makes the 6-digit code itself and keeps only a hash of it for 10 minutes; the provider
// only delivers the SMS. Locally (npm run dev, in-memory database) OTP_PROVIDER=test shows the code
// in the server log instead of sending it.
const crypto = require('crypto');
const core = require('./core');
const db = require('./db');

const TTL = 600; // seconds a code is valid
const TRIES = 5; // wrong codes before it is used up
// What a code is for. A code sent for one purpose never works for another.
//   signup: make an account   login: log in without the password   reset: set a new password
//   verify: mark an older account's number as checked   delete: delete the account without the password
const PURPOSES = ['signup', 'login', 'reset', 'verify', 'delete'];
const IST = 5.5 * 3600e3;
const today = () => new Date(Date.now() + IST).toISOString().slice(0, 10);

const PROVIDERS = ['fast2sms', 'msg91', '2factor', 'gupshup'];
// how the code reaches the customer: Gupshup sends it on WhatsApp, the others by SMS
const via = (provider) => (provider === 'gupshup' ? 'whatsapp' : 'sms');

// The WhatsApp business number with the country code, digits only (a 10-digit number gets 91)
const waNumber = (s) => { const d = String(s || '').replace(/\D/g, ''); return d.length === 10 ? '91' + d : d; };

// { provider, apiKey, templateId, source, appName } when it has what that company needs, otherwise null
function valid(provider, apiKey, templateId, extra = {}) {
  const p = String(provider || '').trim().toLowerCase(), key = String(apiKey || '').trim(), tpl = String(templateId || '').trim();
  if (p === 'test') return process.env.PB_DEV_MEMORY_DB === '1' ? { provider: p, apiKey: '', templateId: '' } : null; // never on the live site
  if (!PROVIDERS.includes(p) || !key || (p === 'msg91' && !tpl)) return null;
  if (p === 'gupshup') {
    const source = waNumber(extra.source), appName = String(extra.appName || '').trim();
    if (!tpl || source.length < 11 || !appName) return null;
    // button: the template's Copy code button also takes the code (sent as a second parameter)
    return { provider: p, apiKey: key, templateId: tpl, source, appName, button: !!extra.button };
  }
  return { provider: p, apiKey: key, templateId: tpl };
}

// The SMS company from Vercel's environment variables, or null
function fromEnv() {
  const e = process.env, p = String(e.OTP_PROVIDER || '').trim().toLowerCase();
  if (p === 'fast2sms') return valid(p, e.FAST2SMS_API_KEY);
  if (p === 'msg91') return valid(p, e.MSG91_AUTH_KEY, e.MSG91_TEMPLATE_ID);
  if (p === '2factor') return valid(p, e.TWOFACTOR_API_KEY, e.TWOFACTOR_TEMPLATE);
  if (p === 'gupshup') return valid(p, e.GUPSHUP_API_KEY, e.GUPSHUP_TEMPLATE_ID, { source: e.GUPSHUP_SOURCE, appName: e.GUPSHUP_APP_NAME, button: e.GUPSHUP_BUTTON_CODE === '1' });
  if (p === 'test') return valid(p);
  return null;
}

// The SMS company to use now, or null when OTP is off
async function config() {
  const o = (await core.getSettings()).otp || {};
  if (o.provider) return o.on ? valid(o.provider, o.apiKey, o.templateId, o) : null; // the admin panel decides
  return fromEnv();
}
const enabled = async () => !!(await config());

// Sends the code. Returns { id, reply }: Gupshup's message ID (for its delivery reports) and the reply.
async function deliver(cfg, phone, code) {
  const p = cfg.provider, key = cfg.apiKey, tpl = cfg.templateId;
  // no answer (timeout, network) counts as a failed send, with a clear message
  let netErr = '';
  const go = (url, opts) => fetch(url, { ...opts, signal: AbortSignal.timeout(10000) }).catch((e) => { netErr = e.message || 'no answer'; return null; });
  let res;
  if (p === 'test') { console.log(`[OTP test] ${phone}: ${code}`); return { id: '', reply: '' }; }
  if (p === 'fast2sms') {
    res = await go(`https://www.fast2sms.com/dev/bulkV2?route=otp&variables_values=${code}&numbers=${phone}`, { headers: { authorization: key } });
  } else if (p === 'msg91') {
    res = await go(`https://control.msg91.com/api/v5/otp?template_id=${encodeURIComponent(tpl)}&mobile=91${phone}&otp=${code}`, { method: 'POST', headers: { authkey: key, 'Content-Type': 'application/json' }, body: '{}' });
  } else if (p === '2factor') {
    const t = tpl ? '/' + encodeURIComponent(tpl) : '';
    res = await go(`https://2factor.in/API/V1/${encodeURIComponent(key)}/SMS/${phone}/${code}${t}`, {});
  } else if (p === 'gupshup') {
    // WhatsApp template message; the approved authentication template's {{1}} is the code
    const params = cfg.button ? [code, code] : [code];
    const body = new URLSearchParams({ channel: 'whatsapp', source: cfg.source, destination: '91' + phone, 'src.name': cfg.appName, template: JSON.stringify({ id: tpl, params }) });
    res = await go('https://api.gupshup.io/wa/api/v1/template/msg', { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' }, body: body.toString() });
  }
  const text = res ? await res.text().catch(() => '') : '';
  // each provider says "ok" differently; a failure status or an error word means the SMS did not go
  if (!res || !res.ok || /"(return|status)"\s*:\s*(false|"error"|"failed")|"type"\s*:\s*"error"/i.test(text)) {
    console.error('OTP send failed', p, res && res.status, text.slice(0, 300));
    const e = new core.HttpError(502, via(p) === 'whatsapp' ? 'Could not send the OTP on WhatsApp right now. Check that this number has WhatsApp, try again in a minute, or use your password.' : 'Could not send the OTP right now. Try again in a minute, or use your password.');
    e.reply = res ? `HTTP ${res.status} ${text.slice(0, 400)}` : `no answer (${netErr})`; // shown in the admin test
    throw e;
  }
  let id = '';
  if (p === 'gupshup') {
    try { id = String(JSON.parse(text).messageId || ''); } catch { id = ''; }
    if (id) await track(id, phone);
  }
  return { id, reply: text.slice(0, 400) };
}

// ----- Gupshup delivery reports -----
// Gupshup answers "submitted" at once; whether WhatsApp delivered the message, or why it failed,
// comes later to the callback URL (/api/config?gupshup=<token>, set in the Gupshup app). Each OTP
// message is kept 3 days with its latest status, and the last 30 are listed in the admin panel.
const WA = (id) => `otpwa:${id}`;
const masked = (phone) => phone.slice(0, 2) + '••••' + phone.slice(-4);
async function track(id, phone) {
  await db.pipe([['SET', WA(id), JSON.stringify({ id, to: masked(phone), at: Date.now(), status: 'submitted' }), 'EX', 3 * 86400], ['LPUSH', 'otpwa', id], ['LTRIM', 'otpwa', 0, 29]]).catch(() => {});
}
const hookToken = (apiKey) => core.sha256('gupshup-hook|' + apiKey).slice(0, 24);
// the token in the callback URL, from the saved Gupshup key (admin panel, or Vercel variables)
async function gupshupKey() {
  const o = (await core.getSettings()).otp || {};
  if (o.provider === 'gupshup' && o.apiKey) return o.apiKey;
  const e = fromEnv();
  return e && e.provider === 'gupshup' ? e.apiKey : '';
}
async function hookPath() {
  const k = await gupshupKey();
  return k ? `/api/config?gupshup=${hookToken(k)}` : '';
}
// Reads Gupshup's event (its own format v2, or Meta's format) into [{ id, status, code, reason }]
function events(b) {
  const out = [];
  if (b && b.type === 'message-event' && b.payload) {
    const p = b.payload, d = p.payload || {};
    out.push({ ids: [p.gsId, p.id].filter(Boolean), status: p.type, code: d.code, reason: d.reason || d.description || '' });
  }
  for (const en of (b && b.entry) || []) for (const ch of en.changes || []) for (const st of (ch.value && ch.value.statuses) || []) {
    const er = (st.errors || [])[0] || {};
    out.push({ ids: [st.gs_id, st.id, st.meta_msg_id].filter(Boolean), status: st.status, code: er.code, reason: [er.title, er.message, er.error_data && er.error_data.details].filter(Boolean).join(': ') });
  }
  return out;
}
const RANK = { submitted: 0, enqueued: 1, sent: 2, delivered: 3, read: 4, failed: 5 };
async function webhook(req, res, token) {
  const k = await gupshupKey();
  if (!k || !core.safeEqual(String(token), hookToken(k))) return core.send(res, 404, { error: 'Not found' });
  if (req.method !== 'POST') return core.send(res, 200, { ok: true }); // Gupshup checks the URL first
  for (const ev of events(core.body(req))) {
    for (const id of ev.ids) {
      const raw = await db.cmd(['GET', WA(id)]).catch(() => null);
      if (!raw) continue;
      let o;
      try { o = JSON.parse(raw); } catch { continue; }
      // reports can come out of order: never go back from delivered to sent
      if ((RANK[ev.status] ?? 0) < (RANK[o.status] ?? 0) && ev.status !== 'failed') break;
      Object.assign(o, { status: ev.status || o.status, code: ev.code || o.code || '', reason: ev.reason || o.reason || '', upd: Date.now() });
      await db.cmd(['SET', WA(id), JSON.stringify(o), 'EX', 3 * 86400]).catch(() => {});
      break;
    }
  }
  await db.cmd(['SET', 'otpwa:hookseen', String(Date.now()), 'EX', 30 * 86400]).catch(() => {});
  return core.send(res, 200, { ok: true });
}
async function waStatus(id) {
  const raw = await db.cmd(['GET', WA(String(id))]).catch(() => null);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}
async function waRecent() {
  const ids = await db.cmd(['LRANGE', 'otpwa', 0, 29]).catch(() => []);
  const list = ids.length ? await db.mgetJSON(ids.map(WA)).catch(() => []) : [];
  return { list: list.filter(Boolean), hookSeen: Number(await db.cmd(['GET', 'otpwa:hookseen']).catch(() => 0)) || 0 };
}

const key = (phone) => `otp:${phone}`;
const hash = (phone, code) => core.sha256(`otp|${phone}|${code}`);

// Sends a new code to the number for one of PURPOSES, so a code is only good for that.
async function send(phone, purpose, ip) {
  const cfg = await config();
  if (!cfg) throw new core.HttpError(400, 'OTP is not set up yet. Use your password.');
  if (!PURPOSES.includes(purpose)) throw new core.HttpError(400, 'Unknown OTP purpose.');
  await core.rateLimit(`otp:ip:${ip}`, 20, 3600);
  await core.rateLimit(`otp:ph:${phone}`, 3, 600);
  await core.rateLimit(`otp:day:${phone}`, 10, 86400);
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  await db.cmd(['SET', key(phone), JSON.stringify({ h: hash(phone, code), p: purpose, n: 0 }), 'EX', TTL]);
  await deliver(cfg, phone, code);
  await countSms();
  return { sent: true, seconds: TTL };
}

// SMS sent per day (Indian time), so the admin can see what OTP costs; kept 40 days
async function countSms() {
  const k = `otpsms:${today()}`;
  await db.pipe([['INCR', k], ['EXPIRE', k, 40 * 86400]]).catch(() => {});
}

// Admin panel "Send test SMS": sends a code with settings that may not be saved yet.
async function test(phone, o) {
  const cfg = valid(o && o.provider, o && o.apiKey, o && o.templateId, o || {});
  if (!cfg) {
    const why = { msg91: 'Paste the MSG91 Auth Key and the Template ID.', gupshup: 'Fill all four Gupshup boxes: API key, WhatsApp number (with 91), app name and template ID.' };
    throw new core.HttpError(400, why[o && o.provider] || 'Choose the OTP company and paste its API key.');
  }
  await core.rateLimit('otp:admintest', 10, 3600);
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  let r;
  try { r = await deliver(cfg, phone, code); } catch (e) {
    // the admin sees what the company answered
    throw new core.HttpError(e.status || 502, `${cfg.provider} said no. Its answer: ${e.reply || e.message}`);
  }
  await countSms();
  return { sent: true, code, via: via(cfg.provider), id: r.id, reply: r.reply };
}

// 'whatsapp' or 'sms' for the company in use now, or '' when OTP is off
async function channel() {
  const cfg = await config();
  return cfg ? via(cfg.provider) : '';
}

// SMS sent on each of the last `days` days, oldest first: [{ day: '2026-11-09', sms: 12 }, ...]
async function smsSeries(days = 14) {
  const list = [];
  for (let i = days - 1; i >= 0; i--) list.push(new Date(Date.now() + IST - i * 86400e3).toISOString().slice(0, 10));
  const counts = await db.pipe(list.map((d) => ['GET', `otpsms:${d}`])).catch(() => []);
  return list.map((day, i) => ({ day, sms: Number(counts[i]) || 0 }));
}

// Checks a code; it works once. Throws with a clear message when it is wrong or old.
async function check(phone, purpose, code) {
  const raw = await db.cmd(['GET', key(phone)]);
  let o = null;
  try { o = raw ? JSON.parse(raw) : null; } catch { o = null; }
  if (!o || o.p !== purpose) throw new core.HttpError(400, 'This code is old or was not sent to this number. Ask for a new code.');
  if (o.n >= TRIES) { await db.cmd(['DEL', key(phone)]); throw new core.HttpError(400, 'Too many wrong tries. Ask for a new code.'); }
  if (!core.safeEqual(hash(phone, String(code || '').replace(/\D/g, '')), o.h)) {
    o.n++;
    await db.cmd(['SET', key(phone), JSON.stringify(o), 'EX', TTL]);
    throw new core.HttpError(401, `The code is wrong. ${TRIES - o.n} ${TRIES - o.n === 1 ? 'try' : 'tries'} left.`);
  }
  await db.cmd(['DEL', key(phone)]);
}

module.exports = { enabled, channel, webhook, waStatus, waRecent, hookPath, send, check, smsSeries, test, fromEnv, PROVIDERS, PURPOSES };
