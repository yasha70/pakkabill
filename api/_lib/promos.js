// Offers and banners shown inside the app, free-Pro-days offers, and coupon codes.
// Both lists are small, so each is stored as one JSON document.
const crypto = require('crypto');
const db = require('./db');
const core = require('./core');

const AUDIENCES = ['all', 'free', 'pro', 'guests', 'phones'];
const TONES = ['info', 'offer', 'warn'];
const CTAS = ['none', 'upgrade', 'link'];

const listPromos = async () => (await db.getJSON('promos')) || [];
const listCoupons = async () => (await db.getJSON('coupons')) || [];

function isPro(user) {
  return !!user && (user.paidUntil || 0) > Date.now();
}

function inAudience(p, user) {
  switch (p.audience) {
    case 'all':
      return true;
    case 'free':
      return !isPro(user);
    case 'pro':
      return isPro(user);
    case 'guests':
      return !user;
    case 'phones':
      return !!user && (p.phones || []).includes(user.phone);
    default:
      return false;
  }
}

function running(item, now = Date.now()) {
  return item.active && (!item.startAt || item.startAt <= now) && (!item.endAt || item.endAt >= now);
}

// Dates from the admin form (YYYY-MM-DD) are Indian dates.
const dateOrZero = (v) => {
  if (!v) return 0;
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00+05:30` : v);
  return Number.isFinite(t) ? t : 0;
};

function cleanPromo(input, existing) {
  const p = {
    id: existing ? existing.id : `N${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`,
    title: String(input.title || '').trim().slice(0, 80),
    message: String(input.message || '').trim().slice(0, 400),
    tone: TONES.includes(input.tone) ? input.tone : 'info',
    audience: AUDIENCES.includes(input.audience) ? input.audience : 'all',
    phones: [],
    trialDays: Math.max(0, Math.min(365, Math.round(Number(input.trialDays) || 0))),
    cta: CTAS.includes(input.cta) ? input.cta : 'none',
    ctaLabel: String(input.ctaLabel || '').trim().slice(0, 30),
    link: String(input.link || '').trim().slice(0, 500),
    startAt: dateOrZero(input.startAt),
    // An end date means "until the end of that day".
    endAt: input.endAt ? dateOrZero(input.endAt) + (/^\d{4}-\d{2}-\d{2}$/.test(input.endAt) ? core.DAY - 1 : 0) : 0,
    active: input.active !== false,
    createdAt: existing ? existing.createdAt : Date.now(),
  };
  if (!p.title) throw new core.HttpError(400, 'Give the message a title.');
  if (p.audience === 'phones') {
    p.phones = [...new Set(String(input.phones || '').split(/[,;\n]+/).map(core.normPhone).filter(Boolean))];
    if (!p.phones.length) throw new core.HttpError(400, 'Add at least one 10-digit mobile number.');
  }
  if (p.trialDays && p.audience === 'guests') throw new core.HttpError(400, 'Free Pro days need a logged-in customer. Pick another audience.');
  if (p.cta === 'link' && !/^https:\/\/\S+$/i.test(p.link)) throw new core.HttpError(400, 'The button link must start with https://');
  if (p.endAt && p.startAt && p.endAt < p.startAt) throw new core.HttpError(400, 'The end date is before the start date.');
  return p;
}

async function savePromo(input) {
  const list = await listPromos();
  const i = input.id ? list.findIndex((p) => p.id === input.id) : -1;
  const p = cleanPromo(input, i >= 0 ? list[i] : null);
  if (i >= 0) list[i] = p;
  else list.unshift(p);
  if (list.length > 100) throw new core.HttpError(400, 'Delete some old messages first (100 at most).');
  await db.setJSON('promos', list);
  return p;
}

async function deletePromo(id) {
  await db.setJSON('promos', (await listPromos()).filter((p) => p.id !== id));
}

// Messages this viewer should see right now, without other customers' numbers.
async function forViewer(user) {
  const shown = (await listPromos()).filter((p) => running(p) && inAudience(p, user));
  const claimed = user && shown.length ? await db.cmd(['MGET', ...shown.map((p) => `claim:${p.id}:${user.phone}`)]) : [];
  return shown.map((p, i) => ({
    id: p.id,
    title: p.title,
    message: p.message,
    tone: p.tone,
    trialDays: p.trialDays,
    cta: p.cta,
    ctaLabel: p.ctaLabel,
    link: p.cta === 'link' ? p.link : '',
    endAt: p.endAt,
    claimed: !!claimed[i],
  }));
}

async function claimTrial(user, id) {
  const p = (await listPromos()).find((x) => x.id === id);
  if (!p || !running(p) || !p.trialDays) throw new core.HttpError(404, 'This offer has ended.');
  const key = `claim:${p.id}:${user.phone}`;
  if (await db.cmd(['GET', key])) throw new core.HttpError(409, 'You have already claimed this offer.');
  if (!inAudience(p, user)) throw new core.HttpError(403, 'This offer is not available on your account.');
  const first = await db.cmd(['SET', key, String(Date.now()), 'NX']);
  if (!first) throw new core.HttpError(409, 'You have already claimed this offer.');
  core.extend(user, p.trialDays);
  await core.saveUser(user);
  await db.cmd(['INCR', `promo:claims:${p.id}`]);
  return user;
}

async function promoStats(list) {
  if (!list.length) return list;
  const counts = await db.cmd(['MGET', ...list.map((p) => `promo:claims:${p.id}`)]);
  return list.map((p, i) => ({ ...p, claims: Number(counts[i] || 0) }));
}

// ---------- Coupons ----------
const normCode = (c) => String(c || '').trim().toUpperCase();

async function saveCoupon(input) {
  const c = {
    code: normCode(input.code),
    kind: input.kind === 'flat' ? 'flat' : 'percent',
    value: Math.round(Number(input.value)),
    plans: ['monthly', 'yearly', 'both'].includes(input.plans) ? input.plans : 'both',
    maxUses: Math.max(0, Math.round(Number(input.maxUses) || 0)),
    endAt: input.endAt ? dateOrZero(input.endAt) + (/^\d{4}-\d{2}-\d{2}$/.test(input.endAt) ? core.DAY - 1 : 0) : 0,
    active: input.active !== false,
    createdAt: Date.now(),
  };
  if (!/^[A-Z0-9]{3,20}$/.test(c.code)) throw new core.HttpError(400, 'Coupon codes are 3 to 20 letters or numbers.');
  if (c.kind === 'percent' && !(c.value >= 1 && c.value <= 90)) throw new core.HttpError(400, 'Percent off must be 1 to 90.');
  if (c.kind === 'flat' && !(c.value >= 1)) throw new core.HttpError(400, 'Rupees off must be at least ₹1.');
  const list = await listCoupons();
  const i = list.findIndex((x) => x.code === c.code);
  if (i >= 0) {
    c.createdAt = list[i].createdAt;
    list[i] = c;
  } else list.unshift(c);
  await db.setJSON('coupons', list.slice(0, 200));
  return c;
}

async function deleteCoupon(code) {
  await db.setJSON('coupons', (await listCoupons()).filter((c) => c.code !== normCode(code)));
}

async function couponStats(list) {
  if (!list.length) return list;
  const used = await db.cmd(['MGET', ...list.map((c) => `coupon:used:${c.code}`)]);
  return list.map((c, i) => ({ ...c, used: Number(used[i] || 0) }));
}

// Price of a plan after an optional coupon. Throws a friendly error for a bad code.
async function price(plan, code) {
  const settings = await core.getSettings();
  const list = Number(settings[plan]);
  if (!core.PLAN_DAYS[plan] || !(list > 0)) throw new core.HttpError(400, 'Pick the monthly or yearly plan.');
  const c = normCode(code);
  if (!c) return { list, amount: list, coupon: '' };
  const coupon = (await listCoupons()).find((x) => x.code === c);
  if (!coupon || !running(coupon)) throw new core.HttpError(400, 'This coupon code is not valid.');
  if (coupon.plans !== 'both' && coupon.plans !== plan) throw new core.HttpError(400, `This coupon is only for the ${coupon.plans} plan.`);
  if (coupon.maxUses) {
    const used = Number((await db.cmd(['GET', `coupon:used:${c}`])) || 0);
    if (used >= coupon.maxUses) throw new core.HttpError(400, 'This coupon has been fully used.');
  }
  const off = coupon.kind === 'flat' ? coupon.value : Math.round((list * coupon.value) / 100);
  return { list, amount: Math.max(1, list - off), coupon: c, maxUses: coupon.maxUses };
}

// Reserves one use of a coupon; returns false when it ran out in the meantime.
async function useCoupon(code, maxUses) {
  const n = await db.cmd(['INCR', `coupon:used:${code}`]);
  if (maxUses && n > maxUses) {
    await releaseCoupon(code);
    return false;
  }
  return true;
}
async function releaseCoupon(code) {
  await db.cmd(['DECR', `coupon:used:${code}`]);
}

module.exports = {
  AUDIENCES,
  inAudience,
  isPro,
  listPromos,
  savePromo,
  deletePromo,
  forViewer,
  claimTrial,
  promoStats,
  listCoupons,
  saveCoupon,
  deleteCoupon,
  couponStats,
  price,
  useCoupon,
  releaseCoupon,
};
