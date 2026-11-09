// OTP by SMS (api/_lib/otp.js): off until a provider is set, the request each provider gets, and the
// code checks (wrong code, tries, used once, purpose). Run: node test/otp-audit.js
process.env.PB_DEV_MEMORY_DB = '1';
const otp = require('../api/_lib/otp');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const ENV = ['OTP_PROVIDER', 'FAST2SMS_API_KEY', 'MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID', 'TWOFACTOR_API_KEY', 'TWOFACTOR_TEMPLATE'];
const set = (o) => { ENV.forEach((k) => delete process.env[k]); Object.assign(process.env, o); };
let sent = [];
global.fetch = async (url, opts = {}) => { sent.push({ url: String(url), opts }); return { ok: true, status: 200, text: async () => '{"return":true,"type":"success","Status":"Success"}' }; };
const lastCode = () => { const u = sent[sent.length - 1].url; return (/variables_values=(\d{6})/.exec(u) || /otp=(\d{6})/.exec(u) || /\/SMS\/\d{10}\/(\d{6})/.exec(u) || [])[1]; };

(async () => {
  set({}); ok(!(await otp.enabled()), 'off with nothing set');
  set({ OTP_PROVIDER: 'fast2sms' }); ok(!(await otp.enabled()), 'off when the key is missing');
  set({ OTP_PROVIDER: 'msg91', MSG91_AUTH_KEY: 'k' }); ok(!(await otp.enabled()), 'msg91 needs the template id too');
  const PD = process.env.PB_DEV_MEMORY_DB; delete process.env.PB_DEV_MEMORY_DB;
  set({ OTP_PROVIDER: 'test' }); ok(!(await otp.enabled()), 'the test provider never works on the live site');
  process.env.PB_DEV_MEMORY_DB = PD;

  let n = 0;
  for (const [cfg, check] of [
    [{ OTP_PROVIDER: 'fast2sms', FAST2SMS_API_KEY: 'F2S' }, (r) => r.url.startsWith('https://www.fast2sms.com/dev/bulkV2?route=otp&variables_values=') && /numbers=98\d{8}$/.test(r.url) && r.opts.headers.authorization === 'F2S'],
    [{ OTP_PROVIDER: 'msg91', MSG91_AUTH_KEY: 'M91', MSG91_TEMPLATE_ID: 'tpl1' }, (r) => r.url.startsWith('https://control.msg91.com/api/v5/otp?template_id=tpl1&mobile=9198') && r.opts.method === 'POST' && r.opts.headers.authkey === 'M91'],
    [{ OTP_PROVIDER: '2factor', TWOFACTOR_API_KEY: 'TF', TWOFACTOR_TEMPLATE: 'PakkaBill' }, (r) => /^https:\/\/2factor\.in\/API\/V1\/TF\/SMS\/98\d{8}\/\d{6}\/PakkaBill$/.test(r.url)],
  ]) {
    set(cfg); sent = [];
    const phone = '98765432' + String(10 + n++);
    ok(await otp.enabled(), cfg.OTP_PROVIDER + ': on');
    await otp.send(phone, 'signup', '1.1.1.' + n);
    ok(sent.length === 1 && check(sent[0]), cfg.OTP_PROVIDER + ': request ' + (sent[0] && sent[0].url));
    const code = lastCode();
    ok(/^\d{6}$/.test(code), cfg.OTP_PROVIDER + ': a 6-digit code');
    await otp.check(phone, 'login', code).then(() => ok(false, 'a sign-up code must not log in'), () => ok(true, ''));
    await otp.send(phone, 'signup', '1.1.1.' + n);
    const c2 = lastCode();
    const wrong = c2 === '000000' ? '111111' : '000000';
    await otp.check(phone, 'signup', wrong).then(() => ok(false, 'wrong code accepted'), (e) => ok(/4 tries left/.test(e.message), 'wrong code: ' + e.message));
    await otp.check(phone, 'signup', c2).then(() => ok(true, ''), (e) => ok(false, 'right code refused: ' + e.message));
    await otp.check(phone, 'signup', c2).then(() => ok(false, 'a code works only once'), () => ok(true, ''));
  }
  // five wrong tries use the code up, and sending is limited (3 in 10 minutes for a number)
  set({ OTP_PROVIDER: 'fast2sms', FAST2SMS_API_KEY: 'F2S' }); sent = [];
  await otp.send('9123456789', 'login', '2.2.2.2'); const c = lastCode();
  for (let i = 0; i < 5; i++) await otp.check('9123456789', 'login', c === '000000' ? '111111' : '000000').catch(() => {});
  await otp.check('9123456789', 'login', c).then(() => ok(false, 'code still works after 5 wrong tries'), () => ok(true, ''));
  await otp.send('9123456789', 'login', '2.2.2.2'); await otp.send('9123456789', 'login', '2.2.2.2');
  await otp.send('9123456789', 'login', '2.2.2.2').then(() => ok(false, 'a 4th SMS in 10 minutes was sent'), (e) => ok(e.status === 429, 'SMS limit per number'));
  // a provider that says no
  global.fetch = async () => ({ ok: true, status: 200, text: async () => '{"return":false,"message":"Invalid key"}' });
  await otp.send('9234567890', 'login', '3.3.3.3').then(() => ok(false, 'failed SMS reported as sent'), (e) => ok(e.status === 502, 'a failed SMS is reported'));

  // ---- the whole flow through /api/auth: sign-up, forgot password, verify an older account, delete ----
  global.fetch = async (url, opts = {}) => { sent.push({ url: String(url), opts }); return { ok: true, status: 200, text: async () => '{"return":true}' }; };
  set({ OTP_PROVIDER: 'fast2sms', FAST2SMS_API_KEY: 'F2S' });
  const auth = require('../api/auth');
  let ipN = 0;
  const call = (body, token) => new Promise((resolve) => {
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(t) { resolve({ status: this.statusCode, ...JSON.parse(t) }); } };
    auth({ method: 'POST', body, headers: { 'x-forwarded-for': '10.0.' + (ipN++ % 250) + '.1', ...(token ? { authorization: 'Bearer ' + token } : {}) } }, res);
  });
  const P = '9000000001';
  let r = await call({ action: 'signup', phone: P, password: 'secret1' });
  ok(r.status === 400 && /OTP/.test(r.error), 'sign-up without an OTP is refused: ' + r.error);
  r = await call({ action: 'otpSend', phone: P, purpose: 'signup' }); ok(r.sent, 'sign-up OTP sent');
  r = await call({ action: 'signup', phone: P, password: 'secret1', otp: lastCode(), shopName: 'Test' });
  ok(r.token && r.user.verified, 'sign-up with OTP makes a verified account');
  const t1 = r.token;
  r = await call({ action: 'otpSend', phone: P, purpose: 'signup' }); ok(r.status === 409, 'no sign-up OTP for a number that has an account');
  // website only for now: the Android app signs up with number and password, no OTP
  const appSignup = (body) => new Promise((resolve) => {
    const res = { statusCode: 0, setHeader() {}, end(t) { resolve({ status: this.statusCode, ...JSON.parse(t) }); } };
    auth({ method: 'POST', body, headers: { 'x-forwarded-for': '10.9.9.9', 'user-agent': 'PakkaBillApp/3.4 (Android; store=play)' } }, res);
  });
  r = await appSignup({ action: 'signup', phone: '9000000077', password: 'apppass1' });
  ok(r.token && !r.user.verified, 'Android app sign-up works without OTP: ' + r.error);
  r = await call({ action: 'signup', phone: '9000000078', password: 'webpass1' });
  ok(r.status === 400, 'a website sign-up still needs the OTP');
  // forgot password
  r = await call({ action: 'otpSend', phone: '9000000099', purpose: 'reset' }); ok(r.status === 404, 'no reset OTP for an unknown number');
  r = await call({ action: 'otpSend', phone: P, purpose: 'reset' }); ok(r.sent, 'reset OTP sent');
  const rc = lastCode();
  r = await call({ action: 'otpReset', phone: P, otp: rc, newPassword: '123' }); ok(r.status === 400 && /6 characters/.test(r.error), 'short new password refused');
  r = await call({ action: 'otpLogin', phone: P, otp: rc }); ok(r.status === 400, 'a reset code does not log in');
  r = await call({ action: 'otpSend', phone: P, purpose: 'reset' }); const rc2 = lastCode();
  r = await call({ action: 'otpReset', phone: P, otp: rc2, newPassword: 'newpass1' }); ok(r.token && r.user.verified, 'password reset with OTP logs in: ' + r.error);
  const t2 = r.token;
  r = await call({ action: 'login', phone: P, password: 'newpass1' }); ok(!!r.token, 'the new password works');
  r = await call({ action: 'login', phone: P, password: 'secret1' }); ok(r.status === 401, 'the old password does not');
  r = await call({ action: 'profile', skip: true }, t1); ok(r.status === 401, 'other devices are logged out after a reset');
  // an older account (made with OTP off) verifies its number from My account
  const core = require('../api/_lib/core');
  const Q = '9000000002';
  await core.saveUser({ phone: Q, pass: await core.hashPassword('oldpass1'), createdAt: Date.now(), paidUntil: 0 });
  r = await call({ action: 'login', phone: Q, password: 'oldpass1' }); ok(r.token && !r.user.verified, 'older account is not verified');
  const tq = r.token;
  r = await call({ action: 'otpSend', purpose: 'verify' }); ok(r.status === 401, 'verify OTP needs a login');
  r = await call({ action: 'otpSend', phone: P, purpose: 'verify' }, tq); ok(r.sent && sent[sent.length - 1].url.includes(Q), 'verify OTP goes to the account\'s own number, not the one sent');
  r = await call({ action: 'verify', otp: '00000' + (lastCode() === '000000' ? '1' : '0') }, tq); ok(r.status === 401, 'wrong verify OTP refused');
  r = await call({ action: 'otpSend', purpose: 'verify' }, tq);
  r = await call({ action: 'verify', otp: lastCode() }, tq); ok(r.user && r.user.verified, 'older account verified: ' + r.error);
  r = await call({ action: 'otpSend', purpose: 'verify' }, tq); ok(r.status === 400, 'no second verify for a verified number');
  // delete the account with an OTP instead of the password
  await require('../api/_lib/db').cmd(['DEL', `rl:otp:ph:${P}`]); // 3 SMS per number in 10 minutes were used above
  r = await call({ action: 'delete', otp: '123456' }, t2); ok(r.status >= 400, 'delete with an OTP that was never sent is refused');
  r = await call({ action: 'otpSend', purpose: 'delete' }, t2);
  r = await call({ action: 'delete', otp: lastCode() }, t2); ok(r.deleted, 'account deleted with OTP: ' + r.error);
  r = await call({ action: 'login', phone: P, password: 'newpass1' }); ok(r.status === 401, 'deleted account cannot log in');
  // ---- the admin panel switch (Settings > OTP by SMS) ----
  const db = require('../api/_lib/db');
  const setAdmin = async (o) => { await db.setJSON('settings', { ...(await core.getSettings(true)), otp: o }); core.forgetSettings(); };
  set({});
  await setAdmin({ on: true, provider: 'msg91', apiKey: 'AK' }); ok(!(await otp.enabled()), 'admin: MSG91 without a template stays off');
  await setAdmin({ on: true, provider: '2factor', apiKey: 'TFK', templateId: 'PB' }); ok(await otp.enabled(), 'admin: on with a company and key');
  sent = [];
  await require('../api/_lib/db').cmd(['DEL', 'rl:otp:ph:9000000003']);
  await otp.send('9000000003', 'signup', '4.4.4.4');
  ok(/^https:\/\/2factor\.in\/API\/V1\/TFK\/SMS\/9000000003\/\d{6}\/PB$/.test(sent[0] && sent[0].url), 'admin: SMS goes through the admin\'s company and key');
  set({ OTP_PROVIDER: 'fast2sms', FAST2SMS_API_KEY: 'F2S' });
  await setAdmin({ on: false, provider: '2factor', apiKey: 'TFK' }); ok(!(await otp.enabled()), 'admin: switched off wins over Vercel variables');
  await setAdmin({}); ok(await otp.enabled(), 'no company in admin: Vercel variables still work');
  set({});
  ok(!(await otp.enabled()), 'nothing anywhere: off');
  // the admin's test SMS checks the typed settings before saving
  await otp.test('9000000004', { provider: 'msg91', apiKey: 'AK' }).then(() => ok(false, 'test SMS without template'), (e) => ok(/Template ID/.test(e.message), 'test SMS asks for the MSG91 template'));
  sent = [];
  const tr = await otp.test('9000000004', { provider: 'fast2sms', apiKey: 'K2' });
  ok(tr.sent && sent[0].url.includes('variables_values=' + tr.code) && sent[0].opts.headers.authorization === 'K2', 'test SMS sent with the typed key');

  // the admin's daily SMS count
  const days = await otp.smsSeries(14);
  ok(days.length === 14 && days[13].sms >= 10, 'SMS counted per day: ' + days[13].sms);

  console.log(`${pass}/${pass + fail} OTP checks passed`);
  if (fail) process.exit(1);
})();
