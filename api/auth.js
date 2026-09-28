// POST /api/auth  { action: 'signup' | 'login' | 'logout' | 'delete', phone, password, shopName }
// 'delete' (logged in, with the password) removes the account and its cloud backups for good,
// as Google Play requires for apps with sign-up.
const core = require('./_lib/core');
const db = require('./_lib/db');
const sync = require('./_lib/sync');
const push = require('./_lib/push');

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
    if (!core.checkPassword(String(password), user.pass)) throw new core.HttpError(401, 'The password is wrong.');
    const ix = await sync.status(user).catch(() => ({ shops: [] }));
    for (const s of ix.shops || []) await sync.remove(user, s.id).catch(() => {});
    // a one-way hash, so a new account on this number gets no second free trial
    await db.cmd(['SADD', 'trialused', core.sha256('trial:' + user.phone)]);
    await db.cmd(['DEL', `user:${user.phone}`, `sync:${user.phone}`, push.userKey(user.phone)]);
    await db.cmd(['ZREM', 'users', user.phone]);
    const t = core.bearer(req);
    if (t) await db.cmd(['DEL', `sess:${core.sha256(t)}`]);
    return core.send(res, 200, { ok: true, deleted: true });
  }

  const phone = core.normPhone(rawPhone);
  if (!phone) throw new core.HttpError(400, 'Enter a 10-digit mobile number.');
  await core.rateLimit(`auth:${core.clientIp(req)}`, 30, 900);

  if (action === 'signup') {
    if (String(password).length < 6) throw new core.HttpError(400, 'Use a password of at least 6 characters.');
    const user = {
      phone,
      shopName: String(shopName).trim().slice(0, 80),
      pass: core.hashPassword(String(password)),
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
    await db.cmd(['ZADD', 'users', user.createdAt, phone]);
    return core.send(res, 200, { token: await core.createSession(phone), user: core.publicUser(user) });
  }

  if (action === 'login') {
    await core.rateLimit(`login:${phone}`, 10, 900);
    const user = await core.getUser(phone);
    if (!user || !core.checkPassword(String(password), user.pass)) {
      throw new core.HttpError(401, 'Mobile number or password is wrong.');
    }
    user.lastSeen = Date.now();
    await core.saveUser(user);
    return core.send(res, 200, { token: await core.createSession(phone), user: core.publicUser(user) });
  }

  throw new core.HttpError(400, 'Unknown action.');
});
