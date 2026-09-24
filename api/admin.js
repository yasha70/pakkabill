// POST /api/admin  { action, ... }  Admin panel API. Every action except 'login' needs
// the admin session token from 'login' in the Authorization header.
const core = require('./_lib/core');
const db = require('./_lib/db');
const orders = require('./_lib/orders');
const promos = require('./_lib/promos');

const OWNER = 'owner';
const IST = 5.5 * 3600e3;
// Calendar month in Indian time, e.g. "2026-8" for September 2026.
const MONTH = (t) => {
  const d = new Date(t + IST);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
};
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function lastMonths(n) {
  const d = new Date(Date.now() + IST);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push({ key: `${m.getUTCFullYear()}-${m.getUTCMonth()}`, label: MONTH_NAMES[m.getUTCMonth()] });
  }
  return out;
}

async function requireAdmin(req) {
  const t = core.bearer(req);
  const ok = t && (await db.cmd(['GET', `asess:${core.sha256(t)}`]));
  if (!ok) throw new core.HttpError(401, 'Please log in to the admin panel again.');
}

async function allUsers() {
  const phones = await db.cmd(['ZREVRANGE', 'users', 0, -1]);
  return (await db.mgetJSON(phones.map((p) => `user:${p}`))).filter(Boolean);
}
async function allOrders() {
  const ids = await db.cmd(['ZREVRANGE', 'orders', 0, -1]);
  return (await db.mgetJSON(ids.map((id) => `order:${id}`))).filter(Boolean);
}

const actions = {
  async stats() {
    const [users, list] = [await allUsers(), await allOrders()];
    const now = Date.now();
    const paid = list.filter((o) => o.state === 'COMPLETED' && o.appliedAt);
    const thisMonth = MONTH(now);
    return {
      users: users.length,
      pro: users.filter((u) => (u.paidUntil || 0) > now).length,
      revenue: paid.reduce((s, o) => s + o.amount, 0) / 100,
      revenueMonth: paid.filter((o) => MONTH(o.paidAt || o.createdAt) === thisMonth).reduce((s, o) => s + o.amount, 0) / 100,
      payments: paid.length,
      waiting: list.filter((o) => o.state === 'PENDING').length,
      paymentsReady: core.paymentsReady(await core.getSettings()),
      activeWeek: users.filter((u) => now - (u.lastSeen || 0) < 7 * core.DAY).length,
      series: lastMonths(6).map(({ key, label }) => ({
        label,
        amount: paid.filter((o) => MONTH(o.paidAt || o.createdAt) === key).reduce((s, o) => s + o.amount, 0) / 100,
      })),
      // Pro ending in the next 7 days, and Pro that ended in the last 14 days.
      expiring: users
        .filter((u) => u.paidUntil > now && u.paidUntil < now + 7 * core.DAY)
        .sort((a, b) => a.paidUntil - b.paidUntil)
        .map(core.publicUser),
      lapsed: users
        .filter((u) => u.paidUntil && u.paidUntil <= now && u.paidUntil > now - 14 * core.DAY)
        .sort((a, b) => b.paidUntil - a.paidUntil)
        .map(core.publicUser),
    };
  },

  async promos() {
    return { promos: await promos.promoStats(await promos.listPromos()), coupons: await promos.couponStats(await promos.listCoupons()) };
  },
  async savePromo({ promo }) {
    return { promo: await promos.savePromo(promo || {}) };
  },
  async deletePromo({ id }) {
    await promos.deletePromo(String(id));
    return { ok: true };
  },
  async saveCoupon({ coupon }) {
    return { coupon: await promos.saveCoupon(coupon || {}) };
  },
  async deleteCoupon({ code }) {
    await promos.deleteCoupon(code);
    return { ok: true };
  },

  // Adds Pro days to every account in an audience (or a list of numbers).
  async gift({ audience, phones, days }) {
    const n = Math.round(Number(days));
    if (!(n > 0 && n <= 365)) throw new core.HttpError(400, 'Days must be between 1 and 365.');
    if (!['all', 'free', 'pro', 'phones'].includes(audience)) throw new core.HttpError(400, 'Pick who gets the gift.');
    const wanted = audience === 'phones' ? new Set(String(phones || '').split(/[,;\n]+/).map(core.normPhone).filter(Boolean)) : null;
    if (wanted && !wanted.size) throw new core.HttpError(400, 'Add at least one 10-digit mobile number.');
    const users = (await allUsers()).filter((u) =>
      wanted ? wanted.has(u.phone) : promos.inAudience({ audience }, u),
    );
    for (const u of users) {
      core.extend(u, n);
      await core.saveUser(u);
    }
    return { count: users.length };
  },

  async users({ q = '' }) {
    const needle = String(q).trim().toLowerCase();
    const users = (await allUsers()).filter(
      (u) => !needle || u.phone.includes(needle) || (u.shopName || '').toLowerCase().includes(needle),
    );
    return { users: users.slice(0, 500).map(core.publicUser) };
  },

  async payments() {
    return { payments: (await allOrders()).slice(0, 500) };
  },

  async grant({ phone, days }) {
    const user = await core.getUser(String(phone));
    const n = Math.round(Number(days));
    if (!user) throw new core.HttpError(404, 'No such account.');
    if (!(n > 0 && n <= 3650)) throw new core.HttpError(400, 'Days must be between 1 and 3650.');
    core.extend(user, n);
    await core.saveUser(user);
    return { user: core.publicUser(user) };
  },

  async revoke({ phone }) {
    const user = await core.getUser(String(phone));
    if (!user) throw new core.HttpError(404, 'No such account.');
    user.paidUntil = 0;
    await core.saveUser(user);
    return { user: core.publicUser(user) };
  },

  async resetPassword({ phone }) {
    const user = await core.getUser(String(phone));
    if (!user) throw new core.HttpError(404, 'No such account.');
    const temp = core.token().replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    user.pass = core.hashPassword(temp);
    await core.saveUser(user);
    return { password: temp };
  },

  async approve({ id }) {
    return { order: await orders.approve(String(id)) };
  },

  async reject({ id }) {
    return { order: await orders.reject(String(id)) };
  },

  async getSettings() {
    return { settings: await core.getSettings() };
  },

  async saveSettings({ monthly, yearly, freeBills, enforce, upiId, payeeName }) {
    const s = {
      monthly: Math.round(Number(monthly)),
      yearly: Math.round(Number(yearly)),
      freeBills: Math.round(Number(freeBills)),
      enforce: !!enforce,
      upiId: String(upiId || '').trim(),
      payeeName: String(payeeName || '').trim().slice(0, 50),
    };
    if (s.upiId && !core.UPI_ID.test(s.upiId)) throw new core.HttpError(400, 'That does not look like a UPI ID (name@bank).');
    if (!(s.monthly >= 1 && s.yearly >= 1)) throw new core.HttpError(400, 'Prices must be at least ₹1.');
    if (!(s.freeBills >= 0 && s.freeBills <= 1000)) throw new core.HttpError(400, 'Free bills must be 0 to 1000.');
    await db.setJSON('settings', s);
    return { settings: s };
  },

  // Signs this browser into a built-in owner account that never expires.
  async ownerSession() {
    let owner = await core.getUser(OWNER);
    if (!owner) {
      owner = { phone: OWNER, shopName: 'Owner', pass: '', createdAt: Date.now(), paidUntil: 0 };
    }
    owner.paidUntil = Date.UTC(2099, 0, 1);
    await core.saveUser(owner);
    return { token: await core.createSession(OWNER), user: core.publicUser(owner) };
  },
};

module.exports = core.handler(async (req, res) => {
  core.requireMethod(req, 'POST');
  const b = core.body(req);

  if (b.action === 'login') {
    const pw = process.env.ADMIN_PASSWORD || '';
    if (pw.length < 8) throw new core.HttpError(503, 'Set ADMIN_PASSWORD (8+ characters) in Vercel first.');
    core.requireDb();
    await core.rateLimit(`admin:${core.clientIp(req)}`, 10, 900);
    if (!core.safeEqual(String(b.password || ''), pw)) throw new core.HttpError(401, 'Wrong admin password.');
    const t = core.token();
    await db.cmd(['SET', `asess:${core.sha256(t)}`, '1', 'EX', 12 * 3600]);
    return core.send(res, 200, { token: t });
  }

  core.requireDb();
  await requireAdmin(req);
  const fn = actions[b.action];
  if (!fn) throw new core.HttpError(400, 'Unknown action.');
  core.send(res, 200, await fn(b));
});
