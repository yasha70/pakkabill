// POST /api/auth  { action: 'signup' | 'login' | 'logout' | 'delete', phone, password, shopName }
// POST /api/auth  { action: 'password', password, newPassword } (logged in) -> new token; other devices are logged out
// POST /api/auth  { action: 'profile', name, sells, where, orders, city } or { action: 'profile', skip: true } (logged in):
// the optional "about your shop" step after sign-up. Every field may be left empty.
// 'delete' (logged in, with the password) removes the account and its cloud backups for good,
// as Google Play requires for apps with sign-up.
const core = require('./_lib/core');
const db = require('./_lib/db');
const sync = require('./_lib/sync');
const push = require('./_lib/push');

// The choices offered in the app's "About your shop" step. Anything else is dropped.
const PROFILE = {
  sells: ['Sarees', 'Kurtis & suits', 'Blouses', 'Lehengas', 'Jewellery', "Men's clothing", 'Kids', 'Home & kitchen', 'Beauty', 'Other'],
  where: ['Meesho', 'Amazon', 'Flipkart', 'Own shop', 'Instagram / WhatsApp', 'Other'],
  orders: ['Up to 10', '10 to 50', '50 to 200', 'More than 200'],
};

module.exports = core.handler(async (req, res) => {
  core.requireMethod(req, 'POST');
  core.requireDb();
  const { action, phone: rawPhone, password = '', shopName = '' } = core.body(req);

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

  if (action === 'profile') {
    const user = await core.requireUser(req);
    await core.rateLimit(`prof:${user.phone}`, 20, 3600);
    const b = core.body(req);
    if (!b.skip) {
      const text = (v, n) => String(v || '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
      const pick = (v, list) => (Array.isArray(v) ? v : []).map(String).filter((x, i, a) => list.includes(x) && a.indexOf(x) === i);
      const p = {
        name: text(b.name, 60),
        sells: pick(b.sells, PROFILE.sells),
        where: pick(b.where, PROFILE.where),
        orders: PROFILE.orders.includes(String(b.orders)) ? String(b.orders) : '',
        city: text(b.city, 40),
      };
      user.profile = { ...(user.profile || {}), ...Object.fromEntries(Object.entries(p).filter(([k]) => k in b)) };
      if (b.shopName != null && user.phone !== 'owner') user.shopName = text(b.shopName, 80) || user.shopName;
    }
    user.profileAt = Date.now();
    await core.saveUser(user);
    return core.send(res, 200, { user: core.publicUser(user) });
  }

  const phone = core.normPhone(rawPhone);
  if (!phone) throw new core.HttpError(400, 'Enter a 10-digit mobile number.');
  await core.rateLimit(`auth:${core.clientIp(req)}`, 30, 900);

  if (action === 'signup') {
    if (String(password).length < 6) throw new core.HttpError(400, 'Use a password of at least 6 characters.');
    const user = {
      phone,
      shopName: String(shopName).trim().slice(0, 80),
      pass: await core.hashPassword(String(password)),
      createdAt: Date.now(),
      lastSeen: Date.now(),
      paidUntil: 0,
    };
    // which button or tool the account was made from (for the admin; never shown to the customer)
    const from = String(core.body(req).from || '').toLowerCase();
    if (/^[a-z0-9-]{1,20}$/.test(from)) user.from = from;
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

  if (action === 'login') {
    await core.rateLimit(`login:${phone}`, 10, 900);
    const user = await core.getUser(phone);
    const pw = String(password);
    // a space added by the phone keyboard or by copy-paste should not make the password wrong
    const ok = user && ((await core.checkPassword(pw, user.pass)) || (pw.trim() !== pw && (await core.checkPassword(pw.trim(), user.pass))));
    if (!ok) {
      throw new core.HttpError(401, user ? 'The password is wrong. Check capital letters, or tap Show to see what you typed. Forgot it? Ask PakkaBill support to reset it.' : 'No account with this mobile number. Check the number, or create an account.');
    }
    if (user.blocked) throw new core.HttpError(403, 'This account has been stopped. Please contact PakkaBill support.');
    user.lastSeen = Date.now();
    await core.saveUser(user);
    return core.send(res, 200, { token: await core.createSession(phone), user: core.publicUser(user) });
  }

  throw new core.HttpError(400, 'Unknown action.');
});
