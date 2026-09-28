// Cloud backup and sync. The phone compresses each shop's data (bills, parties, items and
// settings) and uploads it in parts; we keep it under the customer's account so any device
// they log in on gets the same shops. Each shop has a version number: an upload names the
// version it started from, so two devices never silently overwrite each other (the second
// one gets a conflict, merges on the device, and uploads again).
//
// Redis keys:
//   sync:<phone>                       { shops: { <shopId>: { version, slot, parts, bytes, ... } } }
//   sync:<phone>:<shopId>:<a|b>:<n>    the parts; uploads alternate between two slots, so the
//                                      last complete copy stays readable while a new one arrives
//   synclock:<phone>:<shopId>          one upload at a time per shop
const db = require('./db');
const core = require('./core');

const PART_MAX = 600000; // characters of base64 in one part (well under Redis/Vercel limits)
const MAX_PARTS = 80;
const QUOTA_PRO = 30 * 1024 * 1024;
const QUOTA_FREE = 3 * 1024 * 1024;
const SHOP_ID = /^(main|s_[a-z0-9]{4,20})$/;
const B64 = /^[A-Za-z0-9+/=]*$/;

const idxKey = (phone) => `sync:${phone}`;
const partKey = (phone, shop, slot, i) => `sync:${phone}:${shop}:${slot}:${i}`;
const lockKey = (phone, shop) => `synclock:${phone}:${shop}`;
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

// Who may upload: Pro (or everyone while Pro is not switched on), and free users only when the
// admin allows it (first shop, small quota). Reading your own backup is always allowed.
async function access(user) {
  const s = await core.getSettings();
  const pro = (user.paidUntil || 0) > Date.now() || !core.paymentsReady(s) || !s.enforce;
  if (pro) return { allowed: true, pro: true, quota: QUOTA_PRO };
  if (s.syncFree) return { allowed: true, pro: false, quota: QUOTA_FREE };
  return { allowed: false, pro: false, quota: 0 };
}

async function getIndex(phone) {
  const ix = await db.getJSON(idxKey(phone));
  return ix && ix.shops ? ix : { shops: {} };
}

async function status(user) {
  const acc = await access(user);
  const ix = await getIndex(user.phone);
  const shops = Object.entries(ix.shops).map(([id, x]) => ({
    id, version: x.version, parts: x.parts, bytes: x.bytes, enc: x.enc, name: x.name || '', gstin: x.gstin || '', state: x.state || '',
    counts: x.counts || {}, updatedAt: x.updatedAt, device: x.device || '',
  }));
  return { ...acc, used: shops.reduce((n, x) => n + (x.bytes || 0), 0), shops };
}

async function put(user, b) {
  const acc = await access(user);
  if (!acc.allowed) throw new core.HttpError(402, 'Cloud backup is part of PakkaBill Pro.');
  const shop = String(b.shop || '');
  if (!SHOP_ID.test(shop)) throw new core.HttpError(400, 'Unknown shop.');
  if (!acc.pro && shop !== 'main') throw new core.HttpError(402, 'On the free plan, cloud backup covers your first shop. Pro backs up every shop.');
  const parts = Number(b.parts);
  const part = Number(b.part);
  if (!(Number.isInteger(parts) && parts >= 1 && parts <= MAX_PARTS && Number.isInteger(part) && part >= 0 && part < parts)) throw new core.HttpError(400, 'Bad upload.');
  const data = String(b.data || '');
  if (data.length > PART_MAX || !B64.test(data)) throw new core.HttpError(400, 'Bad upload part.');
  const token = clip(b.token, 40);
  if (token.length < 12) throw new core.HttpError(400, 'Bad upload.');
  if (parts * PART_MAX > acc.quota + PART_MAX) throw new core.HttpError(413, `This shop is larger than your cloud space (${Math.round(acc.quota / 1048576)} MB).`);

  const phone = user.phone;
  const lock = lockKey(phone, shop);
  const ix = await getIndex(phone);
  const cur = ix.shops[shop] || { version: 0, slot: 'b', slots: {} };
  const conflict = () => ({ conflict: true, version: cur.version });

  if (part === 0) {
    if (Number(b.base) !== cur.version) return conflict();
    const got = await db.cmd(['SET', lock, token, 'NX', 'EX', 120]);
    if (!got && (await db.cmd(['GET', lock])) !== token) throw new core.HttpError(423, 'Another device is saving this shop. Trying again shortly.');
  } else if ((await db.cmd(['GET', lock])) !== token) {
    throw new core.HttpError(409, 'The upload took too long. Trying again.');
  }
  const slot = cur.slot === 'a' ? 'b' : 'a';
  await db.cmd(['SET', partKey(phone, shop, slot, part), data]);
  if (part < parts - 1) return { ok: true, part };

  // last part: commit if nobody else saved this shop meanwhile
  try {
    const fresh = (await getIndex(phone)).shops[shop] || { version: 0 };
    if (Number(b.base) !== fresh.version) return { conflict: true, version: fresh.version };
    const keys = Array.from({ length: parts }, (_, i) => partKey(phone, shop, slot, i));
    const vals = await db.cmd(['MGET', ...keys]);
    if (vals.some((v) => v == null)) throw new core.HttpError(409, 'Some of the upload went missing. Trying again.');
    const bytes = vals.reduce((n, v) => n + v.length, 0);
    const others = Object.entries(ix.shops).filter(([id]) => id !== shop).reduce((n, [, x]) => n + (x.bytes || 0), 0);
    if (others + bytes > acc.quota) throw new core.HttpError(413, `Your cloud space is full (${Math.round(acc.quota / 1048576)} MB). Delete shops you no longer need, or keep a downloaded backup instead.`);
    const info = b.info && typeof b.info === 'object' ? b.info : {};
    const counts = info.counts && typeof info.counts === 'object' ? info.counts : {};
    const slots = { ...(cur.slots || {}) };
    const leftover = slots[slot] || 0; // parts of an older, bigger upload in this slot
    slots[slot] = parts;
    const next = {
      version: fresh.version + 1, slot, parts, slots, bytes, enc: b.enc === 'gz' ? 'gz' : 'raw',
      name: clip(info.name, 80), gstin: clip(info.gstin, 15), state: clip(info.state, 2),
      counts: { invoices: Number(counts.invoices) || 0, parties: Number(counts.parties) || 0, products: Number(counts.products) || 0 },
      updatedAt: Date.now(), device: clip(b.device, 40),
    };
    const latest = await getIndex(phone);
    latest.shops[shop] = next;
    await db.setJSON(idxKey(phone), latest);
    const stale = [];
    for (let i = parts; i < leftover; i++) stale.push(partKey(phone, shop, slot, i));
    if (stale.length) await db.cmd(['DEL', ...stale]);
    return { ok: true, version: next.version, bytes };
  } finally {
    await db.cmd(['DEL', lock]);
  }
}

async function get(user, b) {
  const shop = String(b.shop || '');
  if (!SHOP_ID.test(shop)) throw new core.HttpError(400, 'Unknown shop.');
  const cur = (await getIndex(user.phone)).shops[shop];
  if (!cur) throw new core.HttpError(404, 'This shop is not in your cloud backup.');
  if (b.version != null && Number(b.version) !== cur.version) return { conflict: true, version: cur.version };
  const part = Number(b.part);
  if (!(Number.isInteger(part) && part >= 0 && part < cur.parts)) throw new core.HttpError(400, 'Bad part.');
  const data = await db.cmd(['GET', partKey(user.phone, shop, cur.slot, part)]);
  if (data == null) throw new core.HttpError(409, 'The backup is being updated. Trying again.');
  return { version: cur.version, parts: cur.parts, enc: cur.enc, data };
}

async function remove(user, shopId) {
  const shop = String(shopId || '');
  if (!SHOP_ID.test(shop)) throw new core.HttpError(400, 'Unknown shop.');
  const ix = await getIndex(user.phone);
  const cur = ix.shops[shop];
  if (!cur) return { ok: true };
  delete ix.shops[shop];
  await db.setJSON(idxKey(user.phone), ix);
  const keys = [];
  for (const [slot, n] of Object.entries(cur.slots || { [cur.slot]: cur.parts })) for (let i = 0; i < n; i++) keys.push(partKey(user.phone, shop, slot, i));
  if (keys.length) await db.cmd(['DEL', ...keys]);
  return { ok: true };
}

// For the admin: how much cloud space an account uses.
async function usage(phone) {
  const ix = await getIndex(phone);
  const list = Object.values(ix.shops);
  return { shops: list.length, bytes: list.reduce((n, x) => n + (x.bytes || 0), 0), updatedAt: Math.max(0, ...list.map((x) => x.updatedAt || 0)) };
}

module.exports = { access, status, put, get, remove, usage, PART_MAX, QUOTA_PRO, QUOTA_FREE };
