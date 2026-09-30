// Account lists for the admin panel and reminders, read page by page from the indexes that
// core.saveUser keeps (paid, seen, names), so they stay fast with any number of accounts.
const core = require('./core');
const db = require('./db');

const INDEX_FLAG = 'idx:users:v1';

// Builds the indexes once for accounts made before they existed (one full read, then never again).
async function ensureIndex() {
  if (await db.cmd(['GET', INDEX_FLAG])) return;
  const phones = await db.cmd(['ZREVRANGE', 'users', 0, -1]);
  for (let i = 0; i < phones.length; i += 100) {
    const list = (await db.mgetJSON(phones.slice(i, i + 100).map((p) => `user:${p}`))).filter(Boolean);
    const cmds = list.flatMap(core.indexCmds);
    if (cmds.length) await db.pipe(cmds);
  }
  await db.cmd(['SET', INDEX_FLAG, String(Date.now())]);
}

async function load(phones) {
  return (await db.mgetJSON(phones.map((p) => `user:${p}`))).filter(Boolean);
}

const DAY = core.DAY;
// Each filter: how to count it and how to read one page of it.
function filters(now) {
  return {
    all: { count: ['ZCARD', 'users'], page: (o, n) => ['ZREVRANGE', 'users', o, o + n - 1] },
    new: { count: ['ZCOUNT', 'users', now - 7 * DAY, '+inf'], page: (o, n) => ['ZREVRANGEBYSCORE', 'users', '+inf', now - 7 * DAY, 'LIMIT', o, n] },
    pro: { count: ['ZCOUNT', 'paid', `(${now}`, '+inf'], page: (o, n) => ['ZRANGEBYSCORE', 'paid', `(${now}`, '+inf', 'LIMIT', o, n] },
    expiring: { count: ['ZCOUNT', 'paid', `(${now}`, now + 7 * DAY], page: (o, n) => ['ZRANGEBYSCORE', 'paid', `(${now}`, now + 7 * DAY, 'LIMIT', o, n] },
    lapsed: { count: ['ZCOUNT', 'paid', now - 30 * DAY, now], page: (o, n) => ['ZREVRANGEBYSCORE', 'paid', now, now - 30 * DAY, 'LIMIT', o, n] },
    free: { count: ['ZCOUNT', 'paid', '-inf', now], page: (o, n) => ['ZREVRANGEBYSCORE', 'paid', now, '-inf', 'LIMIT', o, n] },
    active: { count: ['ZCOUNT', 'seen', now - 7 * DAY, '+inf'], page: (o, n) => ['ZREVRANGEBYSCORE', 'seen', '+inf', now - 7 * DAY, 'LIMIT', o, n] },
    inactive: { count: ['ZCOUNT', 'seen', '-inf', now - 30 * DAY], page: (o, n) => ['ZREVRANGEBYSCORE', 'seen', now - 30 * DAY, '-inf', 'LIMIT', o, n] },
  };
}

// One page of accounts: { users, total, page, pages }.
async function page({ filter = 'all', q = '', page: pg = 0, size = 50 }) {
  await ensureIndex();
  const n = Math.max(1, Math.min(200, Number(size) || 50));
  const needle = String(q || '').trim().toLowerCase();
  if (needle) {
    const flat = (await db.cmd(['HGETALL', 'names'])) || [];
    const hits = [];
    for (let i = 0; i < flat.length; i += 2) if (flat[i].includes(needle) || flat[i + 1].includes(needle)) hits.push(flat[i]);
    const users = (await load(hits.slice(0, 200))).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const off = Math.max(0, Number(pg) || 0) * n;
    return { users: users.slice(off, off + n), total: users.length, page: Number(pg) || 0, pages: Math.ceil(users.length / n), capped: hits.length > 200 };
  }
  const f = filters(Date.now())[filter] || filters(Date.now()).all;
  const p = Math.max(0, Number(pg) || 0);
  const [total, phones] = await db.pipe([f.count, f.page(p * n, n)]);
  return { users: await load(phones), total, page: p, pages: Math.ceil(total / n) };
}

// Calls fn(chunkOfUsers) for every account in a filter, 100 at a time.
async function each(filter, fn) {
  await ensureIndex();
  const now = Date.now(), f = filters(now)[filter] || filters(now).all;
  const phones = await db.cmd(f.page(0, 1e9));
  for (let i = 0; i < phones.length; i += 100) await fn(await load(phones.slice(i, i + 100)));
  return phones.length;
}

// Headline numbers from the indexes: a few counts, no full read.
async function counts() {
  await ensureIndex();
  const now = Date.now(), F = filters(now);
  const [users, pro, activeWeek, newWeek, expiring, activeToday] = await db.pipe([F.all.count, F.pro.count, F.active.count, F.new.count, F.expiring.count, ['ZCOUNT', 'seen', now - DAY, '+inf']]);
  return { users, pro, activeWeek, newWeek, expiring, activeToday };
}

// Sign-ups per day for the last `days` days (Indian time).
async function signupSeries(days = 14) {
  const IST = 5.5 * 3600e3, d = new Date(Date.now() + IST);
  const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - IST;
  const starts = [];
  for (let i = days - 1; i >= 0; i--) starts.push(today - i * DAY);
  const cmds = starts.flatMap((t) => [['ZCOUNT', 'users', t, `(${t + DAY}`], ['ZCOUNT', 'seen', t, `(${t + DAY}`]]);
  const out = await db.pipe(cmds);
  return starts.map((t, i) => ({ day: new Date(t + IST).getUTCDate(), month: new Date(t + IST).getUTCMonth(), signups: out[i * 2], lastSeen: out[i * 2 + 1] }));
}

// Accounts whose Pro ends between from and to (for reminders and the overview).
async function paidBetween(from, to, limit = 100) {
  await ensureIndex();
  return load(await db.cmd(['ZRANGEBYSCORE', 'paid', from, to, 'LIMIT', 0, limit]));
}

module.exports = { ensureIndex, page, each, counts, signupSeries, paidBetween, load };
