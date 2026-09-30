// POST /api/admin  { action, ... }  Admin panel API. Every action except 'login' needs
// the admin session token from 'login' in the Authorization header.
const core = require('./_lib/core');
const db = require('./_lib/db');
const orders = require('./_lib/orders');
const promos = require('./_lib/promos');
const support = require('./_lib/support');
const assist = require('./_lib/assist');
const chat = require('./_lib/chat');
const push = require('./_lib/push');
const users = require('./_lib/users');
const visits = require('./_lib/visits');

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

async function allOrders() {
  const ids = await db.cmd(['ZREVRANGE', 'orders', 0, -1]);
  return (await db.mgetJSON(ids.map((id) => `order:${id}`))).filter(Boolean);
}

function adminUser(u) {
  return { ...core.publicUser(u), note: u.note || '', blocked: !!u.blocked };
}
function cloudOf(raw) {
  try {
    const ix = raw ? JSON.parse(raw) : null;
    if (ix && ix.shops) { const sh = Object.values(ix.shops); return { shops: sh.length, bytes: sh.reduce((n, x) => n + (x.bytes || 0), 0) }; }
  } catch { /* ignore */ }
  return null;
}

// Admin actions that change something are written to a short activity log (latest 300).
const LOGGED = { grant: 'Gave Pro', revoke: 'Removed Pro', resetPassword: 'Reset password', approve: 'Approved payment', reject: 'Rejected payment', saveSettings: 'Changed settings', gift: 'Gifted Pro', block: 'Blocked or unblocked', notify: 'Sent a notification', saveNote: 'Saved a note', savePromo: 'Saved an offer', deletePromo: 'Deleted an offer', saveCoupon: 'Saved a coupon', deleteCoupon: 'Deleted a coupon' };
async function logAction(action, b, result) {
  if (!LOGGED[action]) return;
  const who = b.phone || (result && result.order && result.order.phone) || '';
  let what = LOGGED[action];
  if (action === 'grant') what += `: ${b.days} days`;
  if (action === 'gift') what += `: ${b.days} days to ${b.audience === 'phones' ? 'chosen numbers' : b.audience} (${result.count} accounts)`;
  if (action === 'block') what = b.blocked ? 'Blocked account' : 'Unblocked account';
  if (action === 'notify') what += `: "${String(b.title || '').slice(0, 60)}" (${result.sent} devices)`;
  if ((action === 'approve' || action === 'reject') && result.order) what += ` ₹${(result.order.amount / 100).toLocaleString('en-IN')} UTR ${result.order.utr}`;
  await db.pipe([['LPUSH', 'alog', JSON.stringify({ t: Date.now(), action, what, phone: who })], ['LTRIM', 'alog', 0, 299]]).catch(() => {});
}

const actions = {
  async stats() {
    const now = Date.now();
    const [c, list] = await Promise.all([users.counts(), allOrders()]);
    const paid = list.filter((o) => o.state === 'COMPLETED' && o.appliedAt);
    const thisMonth = MONTH(now);
    const payers = new Set(paid.map((o) => o.phone)).size;
    return {
      ...c,
      revenue: paid.reduce((s, o) => s + o.amount, 0) / 100,
      revenueMonth: paid.filter((o) => MONTH(o.paidAt || o.createdAt) === thisMonth).reduce((s, o) => s + o.amount, 0) / 100,
      payments: paid.length,
      payers,
      waiting: list.filter((o) => o.state === 'PENDING').length,
      paymentsReady: core.paymentsReady(await core.getSettings()),
      tickets: await support.counts(),
      series: lastMonths(6).map(({ key, label }) => ({
        label,
        amount: paid.filter((o) => MONTH(o.paidAt || o.createdAt) === key).reduce((s, o) => s + o.amount, 0) / 100,
      })),
      signups: await users.signupSeries(14),
      // Pro ending in the next 7 days, and Pro that ended in the last 14 days.
      expiring: (await users.paidBetween(`(${now}`, now + 7 * core.DAY, 50)).map(core.publicUser),
      lapsed: (await users.paidBetween(now - 14 * core.DAY, now, 50)).sort((a, b) => b.paidUntil - a.paidUntil).map(core.publicUser),
    };
  },

  // ---------- support tickets ----------
  async tickets({ status = 'active', q = '' }) {
    return { tickets: await support.adminList({ status: String(status), q }), counts: await support.counts(), chat: await chat.stats(), custom: await chat.listCustom() };
  },
  async ticket({ id }) {
    return { ticket: await support.adminGet(id) };
  },
  async ticketReply({ id, message, status, image, actions }) {
    return { ticket: await support.adminReply(id, message, status, image, actions) };
  },
  // Findings and a suggested reply from the assistant (sent only if the admin sends it).
  async ticketDraft({ id }) {
    return await support.adminDraft(id);
  },
  // Lets the assistant answer this ticket now, even if a person had taken it over.
  async ticketAssist({ id }) {
    const t = await support.adminGet(id, { peek: true });
    await support.runAssistant(t, { force: true });
    return { ticket: await support.adminGet(id) };
  },
  // Answers the admin teaches the chat assistant (for questions it could not answer).
  async customAnswers() {
    return { answers: await chat.listCustom() };
  },
  async saveCustomAnswer({ answer }) {
    return { answer: await chat.saveCustom(answer) };
  },
  async deleteCustomAnswer({ id }) {
    await chat.deleteCustom(id);
    return { ok: true };
  },
  async assistSettings() {
    return { settings: await assist.getSettings() };
  },
  async saveAssistSettings({ auto, ai, whatsapp }) {
    return { settings: await assist.saveSettings({ auto, ai, whatsapp }) };
  },
  async pushKey() {
    return { key: await push.publicKey() };
  },
  async pushSub({ sub }) {
    await push.subscribe(push.ADMIN, sub);
    return { ok: true };
  },
  async pushUnsub({ endpoint }) {
    await push.unsubscribe(push.ADMIN, endpoint);
    return { ok: true };
  },
  async pushTest() {
    return { sent: await push.toAdmin({ title: 'PakkaBill admin alerts are on', body: 'You will get a notification here for new payments and tickets that need you.', url: '/admin', tag: 'admin-test' }) };
  },
  async ticketSet({ id, status, priority }) {
    return { ticket: await support.adminSet(id, { status, priority }) };
  },
  async ticketImage({ id, n }) {
    const t = await support.adminGet(id);
    return { image: await support.image(t, n) };
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

  // Adds Pro days to every account in an audience (or a list of numbers), 100 accounts per round trip.
  async gift({ audience, phones, days }) {
    const n = Math.round(Number(days));
    if (!(n > 0 && n <= 365)) throw new core.HttpError(400, 'Days must be between 1 and 365.');
    if (!['all', 'free', 'pro', 'phones'].includes(audience)) throw new core.HttpError(400, 'Pick who gets the gift.');
    const give = async (list) => {
      if (!list.length) return;
      list.forEach((u) => core.extend(u, n));
      await db.pipe(list.flatMap((u) => [['SET', `user:${u.phone}`, JSON.stringify(u)], ...core.indexCmds(u)]));
    };
    if (audience === 'phones') {
      const wanted = [...new Set(String(phones || '').split(/[,;\n]+/).map(core.normPhone).filter(Boolean))];
      if (!wanted.length) throw new core.HttpError(400, 'Add at least one 10-digit mobile number.');
      const list = await users.load(wanted);
      await give(list);
      return { count: list.length };
    }
    let count = 0;
    await users.each(audience, async (list) => { count += list.length; await give(list); });
    return { count };
  },

  // One page of customers. filter: all, new, pro, expiring, lapsed, free, active, inactive; or q to search.
  async users({ filter = 'all', q = '', page = 0, size = 50 }) {
    const r = await users.page({ filter, q, page, size });
    const cloud = r.users.length ? await db.cmd(['MGET', ...r.users.map((u) => `sync:${u.phone}`)]) : [];
    return { ...r, users: r.users.map((u, i) => ({ ...adminUser(u), cloud: cloudOf(cloud[i]) })) };
  },

  // Everything about one customer: account, cloud backup, payments and help requests.
  async customer({ phone }) {
    const u = await core.getUser(String(phone));
    if (!u) throw new core.HttpError(404, 'No such account.');
    const [cloud, orderIds, ticketIds, subs] = await db.pipe([
      ['GET', `sync:${u.phone}`], ['ZREVRANGE', `orders:${u.phone}`, 0, 19], ['ZREVRANGE', `tickets:u:${u.phone}`, 0, 9], ['GET', push.userKey(u.phone)],
    ]);
    const [ords, tks] = await Promise.all([db.mgetJSON(orderIds.map((id) => `order:${id}`)), db.mgetJSON(ticketIds.map((id) => `ticket:${id}`))]);
    let devices = 0;
    try { devices = (JSON.parse(subs || '[]') || []).length; } catch { /* ignore */ }
    return {
      user: { ...adminUser(u), cloud: cloudOf(cloud) },
      orders: ords.filter(Boolean),
      tickets: tks.filter(Boolean).map((t) => ({ id: t.id, no: t.no, subject: t.subject, status: t.status, updatedAt: t.updatedAt })),
      devices,
    };
  },

  async saveNote({ phone, note }) {
    const u = await core.getUser(String(phone));
    if (!u) throw new core.HttpError(404, 'No such account.');
    u.note = String(note || '').slice(0, 1000);
    await core.saveUser(u);
    return { user: adminUser(u) };
  },

  // Stops an account from logging in (for abuse or fraud); every session ends at once.
  async block({ phone, blocked }) {
    const u = await core.getUser(String(phone));
    if (!u) throw new core.HttpError(404, 'No such account.');
    if (u.phone === OWNER) throw new core.HttpError(400, 'The owner account cannot be blocked.');
    u.blocked = !!blocked;
    await core.saveUser(u);
    return { user: adminUser(u) };
  },

  // A phone notification to one customer (on the devices where they allowed notifications).
  async notify({ phone, title, body }) {
    const t = String(title || '').trim().slice(0, 80), m = String(body || '').trim().slice(0, 300);
    if (!t) throw new core.HttpError(400, 'Write a title.');
    return { sent: await push.toUser(String(phone), { title: t, body: m, url: '/', tag: `admin-${Date.now()}` }) };
  },

  async visitors({ range = 7 }) {
    return visits.report(30, [1, 7, 30].includes(Number(range)) ? Number(range) : 7);
  },

  async activity() {
    const rows = (await db.cmd(['LRANGE', 'alog', 0, 199])) || [];
    return { log: rows.map((r) => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean) };
  },

  // Payments, newest first, one page at a time. status: all, PENDING, COMPLETED, REJECTED; q: phone or UTR.
  async payments({ status = 'all', q = '', page = 0, size = 50 } = {}) {
    const all = await allOrders();
    const needle = String(q || '').trim();
    const list = all.filter((o) => (status === 'all' || o.state === status) && (!needle || String(o.phone).includes(needle) || String(o.utr || '').includes(needle)));
    const n = Math.max(1, Math.min(200, Number(size) || 50)), p = Math.max(0, Number(page) || 0);
    const counts = { all: all.length, PENDING: 0, COMPLETED: 0, REJECTED: 0 };
    all.forEach((o) => { counts[o.state] = (counts[o.state] || 0) + 1; });
    return { payments: list.slice(p * n, p * n + n), total: list.length, page: p, pages: Math.ceil(list.length / n), counts };
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
    user.pass = await core.hashPassword(temp);
    user.pwAt = Date.now(); // logs the account out on every device
    await core.saveUser(user);
    return { password: temp };
  },

  async approve({ id }) {
    const before = await orders.getOrder(String(id));
    const order = await orders.approve(String(id));
    if (before && before.state !== 'COMPLETED') await support.onPaymentDecision(order, true);
    return { order };
  },

  async reject({ id }) {
    const before = await orders.getOrder(String(id));
    const order = await orders.reject(String(id));
    if (before && before.state === 'PENDING') await support.onPaymentDecision(order, false);
    return { order };
  },

  async getSettings() {
    return { settings: await core.getSettings(true) };
  },

  async saveSettings({ monthly, yearly, freeBills, enforce, upiId, payeeName, trialDays, syncFree, biz }) {
    const prev = await core.getSettings(true);
    const s = {
      monthly: Math.round(Number(monthly)),
      yearly: Math.round(Number(yearly)),
      freeBills: Math.round(Number(freeBills)),
      enforce: !!enforce,
      upiId: String(upiId || '').trim(),
      payeeName: String(payeeName || '').trim().slice(0, 50),
      trialDays: trialDays === undefined ? prev.trialDays : Math.round(Number(trialDays)),
      syncFree: syncFree === undefined ? !!prev.syncFree : !!syncFree,
    };
    // Business details shown on the Contact, Terms and Refund pages.
    const B = biz && typeof biz === 'object' ? biz : prev;
    for (const [k, n] of [['bizName', 100], ['bizEmail', 100], ['bizPhone', 20], ['bizAddress', 300], ['grievanceName', 80]]) s[k] = String(B[k] || '').trim().slice(0, n);
    if (s.bizEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.bizEmail)) throw new core.HttpError(400, 'That email address does not look right.');
    if (!(s.trialDays >= 0 && s.trialDays <= 90)) throw new core.HttpError(400, 'Free trial days must be 0 to 90.');
    if (s.upiId && !core.UPI_ID.test(s.upiId)) throw new core.HttpError(400, 'That does not look like a UPI ID (name@bank).');
    if (!(s.monthly >= 1 && s.yearly >= 1)) throw new core.HttpError(400, 'Prices must be at least ₹1.');
    if (!(s.freeBills >= 0 && s.freeBills <= 1000)) throw new core.HttpError(400, 'Free bills must be 0 to 1000.');
    await db.setJSON('settings', s);
    core.forgetSettings();
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
  const out = await fn(b);
  await logAction(b.action, b, out);
  core.send(res, 200, out);
});
