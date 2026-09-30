// POST /api/auth  { action: 'signup' | 'login' | 'logout' | 'delete', phone, password, shopName, otpToken }
// POST /api/auth  { action: 'reset', phone, password, otpToken } forgot password: a new password after
// verifying the mobile number again (only when mobile verification is set up, see _lib/otp.js)
// POST /api/auth  { action: 'password', password, newPassword } (logged in) -> new token; other devices are logged out
// 'delete' (logged in, with the password) removes the account and its cloud backups for good,
// as Google Play requires for apps with sign-up.
const core = require('./_lib/core');
const db = require('./_lib/db');
const sync = require('./_lib/sync');
const push = require('./_lib/push');
const otp = require('./_lib/otp');

module.exports = core.handler(async (req, res) => {
  core.requireMethod(req, 'POST');
  core.requireDb();
  const { action, phone: rawPhone, password = '', shopName = '', otpToken = '' } = core.body(req);

  if (action === 'logout') {
    const t = core.bearer(req);
    if (t) await db.cmd(['DEL', `sess:${core.sha256(t)}`]);
    return core.send(res, 200, { ok: true });
  }

  if (action === 'delete') {
    const user = await core.requireUser(req);
    await core.rateLimit(`del:${user.phone}`, 5, 3600);
    if (user.phone === 'owner') throw new core.HttpError(400, 'The owner account cannot be deleted here.');
    if (!(await core.checkPassword(String(password), user.pass))) throw new core.HttpError(401, 'The password is wrong.');
    const ix = await sync.status(user).catch(() => ({ shops: [] }));
    for (const s of ix.shops || []) await sync.remove(user, s.id).catch(() => {});
    // a one-way hash, so a new account on this number gets no second free trial
    await db.cmd(['SADD', 'trialused', core.sha256('trial:' + user.phone)]);
    await db.cmd(['DEL', `user:${user.phone}`, `sync:${user.phone}`, push.userKey(user.phone)]);
    await db.pipe([['ZREM', 'users', user.phone], ['ZREM', 'paid', user.phone], ['ZREM', 'seen', user.phone], ['HDEL', 'names', user.phone]]);
    const t = core.bearer(req);
    if (t) await db.cmd(['DEL', `sess:${core.sha256(t)}`]);
    return core.send(res, 200, { ok: true, deleted: true });
  }

  if (action === 'password') {
    const user = await core.requireUser(req);
    await core.rateLimit(`pw:${user.phone}`, 10, 3600);
    const next = String(core.body(req).newPassword || '');
    if (user.phone === 'owner') throw new core.HttpError(400, 'The owner account has no password.');
    if (!(await core.checkPassword(String(password), user.pass))) throw new core.HttpError(401, 'Your current password is wrong.');
    if (next.length < 6) throw new core.HttpError(400, 'Use a new password of at least 6 characters.');
    user.pass = await core.hashPassword(next);
    user.pwAt = Date.now();
    delete user.tempPw;
    await core.saveUser(user);
    const t = core.bearer(req);
    if (t) await db.cmd(['DEL', `sess:${core.sha256(t)}`]);
    return core.send(res, 200, { token: await core.createSession(user.phone), user: core.publicUser(user) });
  }

  const phone = core.normPhone(rawPhone);
  if (!phone) throw new core.HttpError(400, 'Enter a 10-digit mobile number.');
  await core.rateLimit(`auth:${core.clientIp(req)}`, 30, 900);

  if (action === 'signup') {
    if (String(password).length < 6) throw new core.HttpError(400, 'Use a password of at least 6 characters.');
    // A token sent by a page that showed the widget is always checked; without one, verification
    // is required only while the gateway phone is online (see _lib/otp.js).
    if (otp.configured() && (otpToken || (await otp.online()))) {
      // check the number is free before using up the verification
      if (await core.getUser(phone)) throw new core.HttpError(409, 'This number already has an account. Log in instead.');
      await otp.confirm(otpToken, phone);
    }
    const user = {
      phone,
      shopName: String(shopName).trim().slice(0, 80),
      pass: await core.hashPassword(String(password)),
      createdAt: Date.now(),
      lastSeen: Date.now(),
      paidUntil: 0,
    };
    // new accounts start with a free Pro trial (set in the admin panel; 0 turns it off)
    const s = await core.getSettings();
    const used = await db.cmd(['SISMEMBER', 'trialused', core.sha256('trial:' + phone)]);
    const trial = core.paymentsReady(s) && s.enforce && !used ? Math.max(0, Math.min(90, Number(s.trialDays) || 0)) : 0;
    if (trial) { user.paidUntil = Date.now() + trial * core.DAY; user.lastPlan = 'trial'; }
    const created = await db.cmd(['SET', `user:${phone}`, JSON.stringify(user), 'NX']);
    if (!created) throw new core.HttpError(409, 'This number already has an account. Log in instead.');
    await db.pipe([['ZADD', 'users', user.createdAt, phone], ...core.indexCmds(user)]);
    return core.send(res, 200, { token: await core.createSession(phone), user: core.publicUser(user) });
  }

  if (action === 'reset') {
    if (!otp.configured() || !(otpToken || (await otp.online()))) throw new core.HttpError(400, 'Mobile verification is offline right now. Ask PakkaBill support to reset your password.');
    await core.rateLimit(`reset:${phone}`, 10, 3600);
    if (String(password).length < 6) throw new core.HttpError(400, 'Use a new password of at least 6 characters.');
    const user = await core.getUser(phone);
    if (!user) throw new core.HttpError(404, 'No account with this mobile number. Check the number, or create an account.');
    if (user.blocked) throw new core.HttpError(403, 'This account has been stopped. Please contact PakkaBill support.');
    await otp.confirm(otpToken, phone);
    user.pass = await core.hashPassword(String(password));
    user.pwAt = Date.now(); // logs out every other device
    user.lastSeen = Date.now();
    delete user.tempPw;
    await core.saveUser(user);
    await db.cmd(['DEL', `rl:login:${phone}`]); // earlier wrong tries no longer lock them out
    return core.send(res, 200, { token: await core.createSession(phone), user: core.publicUser(user) });
  }

  if (action === 'login') {
    await core.rateLimit(`login:${phone}`, 10, 900);
    const user = await core.getUser(phone);
    const pw = String(password);
    // a space added by the phone keyboard or by copy-paste should not make the password wrong
    const ok = user && ((await core.checkPassword(pw, user.pass)) || (pw.trim() !== pw && (await core.checkPassword(pw.trim(), user.pass))));
    if (!ok) {
      throw new core.HttpError(401, user ? 'The password is wrong. Check capital letters, or tap Show to see what you typed. Forgot it? ' + ((await otp.online()) ? 'Tap Forgot password.' : 'Ask PakkaBill support to reset it.') : 'No account with this mobile number. Check the number, or create an account.');
    }
    if (user.blocked) throw new core.HttpError(403, 'This account has been stopped. Please contact PakkaBill support.');
    user.lastSeen = Date.now();
    await core.saveUser(user);
    return core.send(res, 200, { token: await core.createSession(phone), user: core.publicUser(user) });
  }

  throw new core.HttpError(400, 'Unknown action.');
});
