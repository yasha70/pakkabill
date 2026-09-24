// POST /api/auth  { action: 'signup' | 'login' | 'logout', phone, password, shopName }
const core = require('./_lib/core');
const db = require('./_lib/db');

module.exports = core.handler(async (req, res) => {
  core.requireMethod(req, 'POST');
  core.requireDb();
  const { action, phone: rawPhone, password = '', shopName = '' } = core.body(req);

  if (action === 'logout') {
    const t = core.bearer(req);
    if (t) await db.cmd(['DEL', `sess:${core.sha256(t)}`]);
    return core.send(res, 200, { ok: true });
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
      paidUntil: 0,
    };
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
    return core.send(res, 200, { token: await core.createSession(phone), user: core.publicUser(user) });
  }

  throw new core.HttpError(400, 'Unknown action.');
});
