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
  set({}); ok(!otp.enabled(), 'off with nothing set');
  set({ OTP_PROVIDER: 'fast2sms' }); ok(!otp.enabled(), 'off when the key is missing');
  set({ OTP_PROVIDER: 'msg91', MSG91_AUTH_KEY: 'k' }); ok(!otp.enabled(), 'msg91 needs the template id too');
  const PD = process.env.PB_DEV_MEMORY_DB; delete process.env.PB_DEV_MEMORY_DB;
  set({ OTP_PROVIDER: 'test' }); ok(!otp.enabled(), 'the test provider never works on the live site');
  process.env.PB_DEV_MEMORY_DB = PD;

  let n = 0;
  for (const [cfg, check] of [
    [{ OTP_PROVIDER: 'fast2sms', FAST2SMS_API_KEY: 'F2S' }, (r) => r.url.startsWith('https://www.fast2sms.com/dev/bulkV2?route=otp&variables_values=') && /numbers=98\d{8}$/.test(r.url) && r.opts.headers.authorization === 'F2S'],
    [{ OTP_PROVIDER: 'msg91', MSG91_AUTH_KEY: 'M91', MSG91_TEMPLATE_ID: 'tpl1' }, (r) => r.url.startsWith('https://control.msg91.com/api/v5/otp?template_id=tpl1&mobile=9198') && r.opts.method === 'POST' && r.opts.headers.authkey === 'M91'],
    [{ OTP_PROVIDER: '2factor', TWOFACTOR_API_KEY: 'TF', TWOFACTOR_TEMPLATE: 'PakkaBill' }, (r) => /^https:\/\/2factor\.in\/API\/V1\/TF\/SMS\/98\d{8}\/\d{6}\/PakkaBill$/.test(r.url)],
  ]) {
    set(cfg); sent = [];
    const phone = '98765432' + String(10 + n++);
    ok(otp.enabled(), cfg.OTP_PROVIDER + ': on');
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
  console.log(`${pass}/${pass + fail} OTP checks passed`);
  if (fail) process.exit(1);
})();
