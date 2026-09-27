// Support tickets: customers (logged in or not) report a problem or ask a question, and the
// admin replies from the admin panel. Each ticket is one JSON document with its conversation;
// screenshots are stored separately so the ticket stays small.
const crypto = require('crypto');
const db = require('./db');
const core = require('./core');

const CATEGORIES = {
  bug: 'Something is not working',
  payment: 'Payment or Pro plan',
  bills: 'Bills, PDF or printing',
  gst: 'GST summary or GSTR-1',
  meesho: 'Meesho tools',
  account: 'Login or account',
  idea: 'Suggestion',
  other: 'Something else',
};
const STATUSES = ['open', 'progress', 'waiting', 'resolved', 'closed'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const OPEN = ['open', 'progress', 'waiting'];
const MAX_TEXT = 2000;
const MAX_MESSAGES = 80;
const MAX_IMAGE = 600000; // characters of the data: URL (~450 KB picture)

const key = (id) => `ticket:${id}`;
const imgKey = (id, n) => `ticketimg:${id}:${n}`;
const clip = (v, n) => String(v == null ? '' : v).replace(/\r\n/g, '\n').trim().slice(0, n);

function cleanImage(img) {
  if (!img) return '';
  const s = String(img);
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) throw new core.HttpError(400, 'The screenshot must be a JPEG, PNG or WebP picture.');
  if (s.length > MAX_IMAGE) throw new core.HttpError(400, 'The screenshot is too large. Please attach a smaller picture.');
  return s;
}

function cleanDiag(d) {
  d = d && typeof d === 'object' ? d : {};
  const out = {};
  for (const [k, n] of [['app', 40], ['page', 80], ['ua', 220], ['screen', 30], ['lang', 20], ['theme', 10], ['online', 5], ['installed', 5], ['plan', 20]]) {
    if (d[k] != null && String(d[k]).trim()) out[k] = clip(d[k], n);
  }
  return out;
}

// What a customer sees: no guest key hash, no internal notes.
function forCustomer(t) {
  return {
    id: t.id, no: t.no, category: t.category, subject: t.subject, status: t.status,
    createdAt: t.createdAt, updatedAt: t.updatedAt, unread: !!t.unreadUser,
    messages: t.messages.map((m) => ({ by: m.by, text: m.text, at: m.at, img: m.img || 0 })),
  };
}
function summary(t) {
  const last = t.messages[t.messages.length - 1] || {};
  return {
    id: t.id, no: t.no, category: t.category, subject: t.subject, status: t.status, priority: t.priority,
    phone: t.phone, name: t.name, guest: !!t.gk, createdAt: t.createdAt, updatedAt: t.updatedAt,
    unreadAdmin: !!t.unreadAdmin, unreadUser: !!t.unreadUser, count: t.messages.length,
    last: { by: last.by, text: clip(last.text, 140), at: last.at },
  };
}

async function save(t) {
  await db.setJSON(key(t.id), t);
  await db.cmd(['ZADD', 'tickets', t.updatedAt, t.id]);
}

async function addMessage(t, by, text, img) {
  if (t.messages.length >= MAX_MESSAGES) throw new core.HttpError(400, 'This ticket is very long. Please raise a new ticket.');
  const m = { by, text: clip(text, MAX_TEXT), at: Date.now() };
  if (img) {
    t.imgs = (t.imgs || 0) + 1;
    await db.cmd(['SET', imgKey(t.id, t.imgs), img]);
    m.img = t.imgs;
  }
  t.messages.push(m);
  t.updatedAt = m.at;
  return m;
}

async function create(input, user) {
  const category = CATEGORIES[input.category] ? input.category : 'other';
  const subject = clip(input.subject, 120);
  const text = clip(input.message, MAX_TEXT);
  if (subject.length < 3) throw new core.HttpError(400, 'Add a short subject, for example "PDF does not download".');
  if (text.length < 5) throw new core.HttpError(400, 'Tell us a little more about the problem.');
  const img = cleanImage(input.image);
  let phone, name, guestKey = '';
  if (user) {
    phone = user.phone;
    name = clip(input.name, 60) || user.shopName || '';
  } else {
    phone = core.normPhone(input.phone);
    if (!phone) throw new core.HttpError(400, 'Enter your 10-digit mobile number so we can reply.');
    name = clip(input.name, 60);
    guestKey = core.token();
  }
  const n = await db.cmd(['INCR', 'ticket:seq']);
  const now = Date.now();
  const t = {
    id: `T${now.toString(36).toUpperCase()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    no: `PB-${1000 + Number(n)}`,
    phone, name, account: !!user, category, subject,
    status: 'open', priority: category === 'payment' ? 'high' : 'normal',
    createdAt: now, updatedAt: now, unreadAdmin: true, unreadUser: false,
    diag: cleanDiag(input.diag), messages: [], imgs: 0,
  };
  if (guestKey) t.gk = core.sha256(guestKey);
  await addMessage(t, 'customer', text, img);
  await save(t);
  await db.cmd(['ZADD', `tickets:u:${phone}`, now, t.id]);
  return { ticket: forCustomer(t), key: guestKey };
}

// A customer may open a ticket raised from their account, or one raised as a guest on this device.
async function ownTicket(id, user, guestKey) {
  const t = /^T[0-9A-Z]{6,20}$/.test(String(id || '')) ? await db.getJSON(key(id)) : null;
  if (!t) throw new core.HttpError(404, 'Ticket not found.');
  const mine = (user && t.phone === user.phone && t.account) || (guestKey && t.gk && core.safeEqual(core.sha256(String(guestKey)), t.gk));
  if (!mine) throw new core.HttpError(404, 'Ticket not found.');
  return t;
}

async function listForCustomer(user, guests) {
  const ids = new Set();
  if (user) (await db.cmd(['ZREVRANGE', `tickets:u:${user.phone}`, 0, 49])).forEach((id) => ids.add(id));
  const keys = {};
  (Array.isArray(guests) ? guests.slice(0, 30) : []).forEach((g) => { if (g && g.id && g.key) { ids.add(String(g.id)); keys[g.id] = String(g.key); } });
  const list = (await db.mgetJSON([...ids].map(key))).filter(Boolean).filter((t) =>
    (user && t.account && t.phone === user.phone) || (keys[t.id] && t.gk && core.safeEqual(core.sha256(keys[t.id]), t.gk)));
  return list.sort((a, b) => b.updatedAt - a.updatedAt).map((t) => { const c = forCustomer(t); delete c.messages; c.last = summary(t).last; return c; });
}

async function customerReply(t, text, img) {
  if (clip(text, MAX_TEXT).length < 1 && !img) throw new core.HttpError(400, 'Write a message first.');
  await addMessage(t, 'customer', text, cleanImage(img));
  if (t.status === 'resolved' || t.status === 'closed' || t.status === 'waiting') t.status = 'open';
  t.unreadAdmin = true;
  t.unreadUser = false;
  await save(t);
  return forCustomer(t);
}

async function image(t, n) {
  const i = Number(n);
  if (!(i >= 1 && i <= (t.imgs || 0))) throw new core.HttpError(404, 'Picture not found.');
  return db.cmd(['GET', imgKey(t.id, i)]);
}

// ---------- admin ----------
async function all() {
  const ids = await db.cmd(['ZREVRANGE', 'tickets', 0, 999]);
  return (await db.mgetJSON(ids.map(key))).filter(Boolean);
}
async function adminList({ status = 'active', q = '' } = {}) {
  const needle = String(q).trim().toLowerCase();
  const list = (await all()).filter((t) => {
    if (status === 'active' && !OPEN.includes(t.status)) return false;
    if (STATUSES.includes(status) && t.status !== status) return false;
    if (!needle) return true;
    return [t.no, t.phone, t.name, t.subject].some((v) => String(v || '').toLowerCase().includes(needle));
  });
  return list.map(summary);
}
async function counts() {
  const list = await all();
  return {
    active: list.filter((t) => OPEN.includes(t.status)).length,
    needsReply: list.filter((t) => t.unreadAdmin && OPEN.includes(t.status)).length,
    total: list.length,
  };
}
async function adminGet(id) {
  const t = await db.getJSON(key(String(id)));
  if (!t) throw new core.HttpError(404, 'Ticket not found.');
  if (t.unreadAdmin) { t.unreadAdmin = false; await db.setJSON(key(t.id), t); }
  const out = { ...t, guest: !!t.gk };
  delete out.gk;
  return out;
}
async function adminReply(id, text, status, img) {
  const t = await db.getJSON(key(String(id)));
  if (!t) throw new core.HttpError(404, 'Ticket not found.');
  if (clip(text, MAX_TEXT).length < 1) throw new core.HttpError(400, 'Write a reply first.');
  await addMessage(t, 'support', text, cleanImage(img));
  t.status = STATUSES.includes(status) ? status : t.status === 'open' ? 'progress' : t.status;
  t.unreadUser = true;
  t.unreadAdmin = false;
  await save(t);
  return summary(t);
}
async function adminSet(id, { status, priority }) {
  const t = await db.getJSON(key(String(id)));
  if (!t) throw new core.HttpError(404, 'Ticket not found.');
  if (STATUSES.includes(status) && status !== t.status) {
    t.status = status;
    t.messages.push({ by: 'system', text: `Status changed to ${status}.`, at: Date.now() });
    if (status === 'resolved' || status === 'closed') t.unreadUser = true;
  }
  if (PRIORITIES.includes(priority)) t.priority = priority;
  t.updatedAt = Date.now();
  await save(t);
  return summary(t);
}

module.exports = {
  CATEGORIES, STATUSES, PRIORITIES, create, ownTicket, listForCustomer, customerReply, image, forCustomer,
  adminList, adminGet, adminReply, adminSet, counts, save,
};
