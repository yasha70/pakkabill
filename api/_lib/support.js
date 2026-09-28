// Support tickets: customers (logged in or not) report a problem or ask a question, and the
// admin replies from the admin panel. Each ticket is one JSON document with its conversation;
// screenshots are stored separately so the ticket stays small.
//
// The PakkaBill assistant (assist.js) investigates each new ticket and answers it when it can.
// t.ai.state: 'pending' (the assistant should look at it), 'done' (it answered and may answer
// a follow-up), 'human' (a person is handling it; the assistant stays quiet) or 'off'.
const crypto = require('crypto');
const db = require('./db');
const core = require('./core');
const assist = require('./assist');
const push = require('./push');

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
  for (const [k, n] of [['app', 40], ['latest', 40], ['page', 80], ['ua', 220], ['screen', 30], ['lang', 20], ['theme', 10], ['online', 5], ['installed', 5], ['plan', 20]]) {
    if (d[k] != null && String(d[k]).trim()) out[k] = clip(d[k], n);
  }
  return out;
}

// What a customer sees: no guest key hash, no findings or internal notes.
function forCustomer(t) {
  const ai = t.ai || {};
  return {
    id: t.id, no: t.no, category: t.category, subject: t.subject, status: t.status,
    createdAt: t.createdAt, updatedAt: t.updatedAt, unread: !!t.unreadUser,
    // 'pending': the assistant is checking; 'done': it answered; 'human': with the support team
    ai: ai.state || 'off', feedback: ai.feedback || '',
    messages: t.messages.map((m) => ({ by: m.by, text: m.text, at: m.at, img: m.img || 0, actions: m.actions && m.actions.length ? m.actions : undefined })),
  };
}
function summary(t) {
  const last = t.messages[t.messages.length - 1] || {};
  return {
    problem: t.problem || '', tried: !!t.tried,
    id: t.id, no: t.no, category: t.category, subject: t.subject, status: t.status, priority: t.priority,
    phone: t.phone, name: t.name, guest: !!t.gk, createdAt: t.createdAt, updatedAt: t.updatedAt,
    unreadAdmin: !!t.unreadAdmin, unreadUser: !!t.unreadUser, count: t.messages.length,
    last: { by: last.by, text: clip(last.text, 140), at: last.at },
    ai: t.ai ? { state: t.ai.state, outcome: t.ai.outcome || '', source: t.ai.source || '', feedback: t.ai.feedback || '' } : null,
  };
}

async function save(t) {
  await db.setJSON(key(t.id), t);
  await db.cmd(['ZADD', 'tickets', t.updatedAt, t.id]);
}

async function addMessage(t, by, text, img, actions) {
  if (t.messages.length >= MAX_MESSAGES) throw new core.HttpError(400, 'This ticket is very long. Please raise a new ticket.');
  const m = { by, text: clip(text, MAX_TEXT), at: Date.now() };
  const acts = (Array.isArray(actions) ? actions : []).filter((a) => assist.ACTIONS.includes(a)).slice(0, 3);
  if (acts.length) m.actions = acts;
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
    status: 'open', priority: input.urgent ? 'urgent' : category === 'payment' ? 'high' : 'normal',
    createdAt: now, updatedAt: now, unreadAdmin: true, unreadUser: false,
    diag: cleanDiag(input.diag), messages: [], imgs: 0,
  };
  // from the guided Help page: the problem picked, and whether its quick fix was already tried
  if (assist.PROBLEM_KB.hasOwnProperty(String(input.problem || ''))) t.problem = String(input.problem);
  if (input.tried) t.tried = true;
  if (guestKey) t.gk = core.sha256(guestKey);
  const auto = (await assist.getSettings()).auto;
  t.ai = { state: auto ? 'pending' : 'off', replies: 0 };
  await addMessage(t, 'customer', text, img);
  await save(t);
  await db.cmd(['ZADD', `tickets:u:${phone}`, now, t.id]);
  if (!auto) await notifyAdmin(t, `New ticket ${t.no}`, t.subject);
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

async function customerReply(t, text, img, diag) {
  if (clip(text, MAX_TEXT).length < 1 && !img) throw new core.HttpError(400, 'Write a message first.');
  await addMessage(t, 'customer', text, cleanImage(img));
  if (diag) t.diag = { ...(t.diag || {}), ...cleanDiag(diag) };
  if (t.status === 'resolved' || t.status === 'closed' || t.status === 'waiting') t.status = 'open';
  t.unreadUser = false;
  const ai = t.ai || { state: 'off' };
  // The assistant answers follow-ups only while no person has taken the ticket over.
  const botTurn = ai.state === 'done' && (ai.replies || 0) < assist.MAX_BOT_REPLIES && (await assist.getSettings()).auto;
  if (botTurn) t.ai = { ...ai, state: 'pending' };
  else {
    t.unreadAdmin = true;
    if (ai.state === 'done' || ai.state === 'pending') t.ai = { ...ai, state: 'human' };
  }
  await save(t);
  if (!botTurn) await notifyAdmin(t, `Reply on ${t.no}`, text || 'Sent a screenshot');
  return forCustomer(t);
}

// ---------- the assistant ----------
const HANDOFF = 'Thank you. I have passed this to our support team with everything I found, and a person will reply here, usually within a day. You will get a notification when they do.';

// Runs the assistant on a ticket waiting for it and posts its answer. Returns the ticket.
async function runAssistant(t, { force = false } = {}) {
  if (!force && (!t.ai || t.ai.state !== 'pending')) return t;
  const lock = await db.cmd(['SET', `tkai:${t.id}`, '1', 'NX', 'EX', 90]);
  if (!lock) return t;
  try {
    const prev = t.ai || {};
    const a = await assist.answer(t, { force });
    t = (await db.getJSON(key(t.id))) || t; // a person may have replied while it was thinking
    if (!force && (!t.ai || t.ai.state !== 'pending')) return t;
    if (!a) {
      t.ai = { ...prev, state: 'off' };
      t.unreadAdmin = true;
      await save(t);
      await notifyAdmin(t, `New ticket ${t.no}`, t.subject);
      return t;
    }
    let { text, actions, outcome, priority } = a;
    // A follow-up that lands on the same built-in answer again means it did not help: hand over.
    if ((prev.replies || 0) > 0 && a.source === 'rules' && a.kb && a.kb === prev.kb && outcome === 'answered') {
      text = HANDOFF; actions = []; outcome = 'escalate';
    }
    // The customer already tried this quick fix on the Help page: don't repeat it, go to the team.
    if (!prev.replies && t.tried && a.source === 'rules' && !a.hard) {
      text = `Thank you. Our support team has your ticket with everything you told me and your app details, so there is no need to explain again. They will reply here, ${a.teamText || 'usually within a few hours'}, and you will get a notification.`;
      actions = []; outcome = 'escalate';
      if (priority === 'low' || priority === 'normal') priority = t.priority === 'urgent' ? 'urgent' : 'high';
    }
    await addMessage(t, 'assistant', text, '', actions);
    // Its first answer sets the priority; later ones can only raise it.
    // (a customer's "urgent" is never lowered)
    const urgent = t.priority === 'urgent';
    if (!urgent && (!prev.replies || PRIORITIES.indexOf(priority) > PRIORITIES.indexOf(t.priority))) t.priority = PRIORITIES.includes(priority) ? priority : t.priority;
    if (outcome === 'answered') { t.status = 'waiting'; t.unreadAdmin = urgent; }
    else { t.status = 'open'; t.unreadAdmin = true; }
    t.unreadUser = true;
    t.ai = {
      state: outcome === 'answered' ? 'done' : 'human',
      replies: (prev.replies || 0) + 1,
      outcome, kb: a.kb || '', source: a.source, model: a.model || '', summary: a.summary || '',
      aiError: a.aiError || '', findings: a.findings || [], at: Date.now(),
    };
    await save(t);
    if (outcome !== 'answered' || urgent) await notifyAdmin(t, outcome === 'ack' ? `Suggestion ${t.no}` : `${t.priority === 'urgent' ? 'URGENT: ' : ''}${t.no} needs you`, a.summary || t.subject);
    return t;
  } finally {
    await db.cmd(['DEL', `tkai:${t.id}`]);
  }
}

// "Yes, it's solved" / "I still need help" under the assistant's answer.
async function feedback(t, solved) {
  const ai = t.ai || {};
  if (solved) {
    t.status = 'resolved';
    t.unreadAdmin = false;
    t.ai = { ...ai, state: ai.state === 'human' ? 'human' : 'done', feedback: 'solved' };
    t.messages.push({ by: 'system', text: 'Marked as solved by the customer.', at: Date.now() });
  } else {
    t.status = 'open';
    t.unreadAdmin = true;
    t.priority = t.priority === 'low' || t.priority === 'normal' ? 'high' : t.priority;
    t.ai = { ...ai, state: 'human', feedback: 'help' };
    t.messages.push({ by: 'system', text: 'The customer asked for a person from our team.', at: Date.now() });
  }
  t.unreadUser = false;
  t.updatedAt = Date.now();
  await save(t);
  if (!solved) await notifyAdmin(t, `${t.no} wants a person`, t.subject);
  return forCustomer(t);
}

// When the admin approves or rejects a payment, answer the customer's open payment tickets
// and tell them on their phone.
async function onPaymentDecision(order, approved) {
  const user = await core.getUser(order.phone);
  const amount = assist.rupees(order.amount);
  const text = approved
    ? `Good news: your payment of ${amount} (UTR ${assist.tail(order.utr)}) is approved and PakkaBill Pro is active${user && user.paidUntil ? ` until ${assist.dateStr(user.paidUntil)}` : ''}. If the app still shows the free plan, tap "Refresh my plan" below. Thank you for choosing Pro!`
    : `We checked your payment with UTR ${assist.tail(order.utr)} but could not find it in our bank statement, so it was not approved. Please check the 12-digit UTR in your payment app and submit it again on the Plan page. If money was debited, reply here with a screenshot of the payment.`;
  const ids = await db.cmd(['ZREVRANGE', `tickets:u:${order.phone}`, 0, 19]);
  const list = (await db.mgetJSON(ids.map(key))).filter((t) => t && t.account && OPEN.includes(t.status)
    && (t.category === 'payment' || t.messages.some((m) => String(m.text).includes(order.utr))));
  for (const t of list) {
    await addMessage(t, 'assistant', text, '', approved ? ['refresh_plan'] : ['plan']);
    t.status = approved ? 'resolved' : 'waiting';
    t.unreadUser = true;
    t.unreadAdmin = false;
    t.ai = { ...(t.ai || {}), state: approved ? 'done' : (t.ai && t.ai.state) || 'human' };
    await save(t);
  }
  await push.toUser(order.phone, approved
    ? { title: 'PakkaBill Pro is active', body: `Your payment of ${amount} is approved.${user && user.paidUntil ? ` Pro is on until ${assist.dateStr(user.paidUntil)}.` : ''} Open PakkaBill to start using it.`, url: '/#/plan', tag: `pay-${order.id}` }
    : { title: 'Payment not approved', body: `We could not find the payment with UTR ${assist.tail(order.utr)}. Please check the UTR and submit it again.`, url: '/#/plan', tag: `pay-${order.id}` });
  return list.length;
}

// ---------- guided help (before a ticket is raised) ----------
// The quick fix for a picked problem: the built-in answer for this customer, nothing is stored.
async function preview(input, user) {
  const category = CATEGORIES[input.category] ? input.category : 'other';
  const problem = assist.PROBLEM_KB.hasOwnProperty(String(input.problem || '')) ? String(input.problem) : '';
  const t = {
    id: 'preview', account: !!user, phone: user ? user.phone : '', category, problem,
    subject: clip(input.subject, 120) || 'Help', diag: cleanDiag(input.diag),
    messages: [{ by: 'customer', text: clip(input.message, MAX_TEXT), at: Date.now() }],
  };
  const a = await assist.answer(t, { force: true, rulesOnly: true });
  if (problem) await assist.quickFixStat(problem, 'shown');
  return { text: a.text, actions: a.actions, outcome: a.outcome, kb: a.kb };
}
// What the Help page shows before anything is asked: reply times and how to reach the team.
async function info() {
  const s = await assist.getSettings();
  const min = await assist.teamReplyMinutes();
  return { auto: s.auto, whatsapp: s.whatsapp || '', teamMinutes: min, teamText: assist.replyText(min) };
}

// ---------- notifications ----------
const notifyAdmin = (t, title, body) => push.toAdmin({ title, body: `${t.name || t.phone}: ${clip(body, 140)}`, url: `/admin#support/${t.id}`, tag: `tk-${t.id}` });
const notifyCustomer = (t, body) => push.toTicket(t, { title: 'Reply from PakkaBill support', body: clip(body, 160), url: `/#/support?t=${t.id}`, tag: `tk-${t.id}` });

async function image(t, n) {
  const i = Number(n);
  if (!(i >= 1 && i <= (t.imgs || 0))) throw new core.HttpError(404, 'Picture not found.');
  return db.cmd(['GET', imgKey(t.id, i)]);
}

// ---------- admin ----------
async function all() {
  const ids = await db.cmd(['ZREVRANGE', 'tickets', 0, 999]);
  const list = (await db.mgetJSON(ids.map(key))).filter(Boolean);
  // An answered ticket the customer never came back to is resolved after 3 days.
  for (const t of list) {
    if (t.status === 'waiting' && t.ai && t.ai.state === 'done' && Date.now() - t.updatedAt > 3 * core.DAY) {
      const last = t.messages[t.messages.length - 1];
      if (last && last.by === 'assistant') {
        t.status = 'resolved';
        t.messages.push({ by: 'system', text: 'Resolved automatically: no reply for 3 days after the answer.', at: Date.now() });
        t.updatedAt = Date.now();
        await save(t);
      }
    }
  }
  return list;
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
    autoAnswered: list.filter((t) => t.ai && t.ai.replies > 0).length,
    autoSolved: list.filter((t) => t.ai && t.ai.replies > 0 && t.status === 'resolved' && !t.messages.some((m) => m.by === 'support')).length,
    quickFix: await assist.quickFixStats(),
    teamMinutes: await assist.teamReplyMinutes(),
  };
}
async function adminGet(id, { peek = false } = {}) {
  const t = await db.getJSON(key(String(id)));
  if (!t) throw new core.HttpError(404, 'Ticket not found.');
  if (t.unreadAdmin && !peek) { t.unreadAdmin = false; await db.setJSON(key(t.id), t); }
  const out = { ...t, guest: !!t.gk };
  delete out.gk;
  return out;
}
async function adminReply(id, text, status, img, actions) {
  const t = await db.getJSON(key(String(id)));
  if (!t) throw new core.HttpError(404, 'Ticket not found.');
  if (clip(text, MAX_TEXT).length < 1) throw new core.HttpError(400, 'Write a reply first.');
  const firstReply = !t.messages.some((m) => m.by === 'support');
  await addMessage(t, 'support', text, cleanImage(img), actions);
  if (firstReply) await assist.recordReplyTime(Date.now() - t.createdAt);
  t.status = STATUSES.includes(status) ? status : t.status === 'open' ? 'progress' : t.status;
  t.unreadUser = true;
  t.unreadAdmin = false;
  t.ai = { ...(t.ai || {}), state: 'human' };
  await save(t);
  const sent = await notifyCustomer(t, text);
  return { ...summary(t), pushed: sent };
}
// The assistant's findings and a suggested reply for the admin; nothing is sent to the customer.
async function adminDraft(id) {
  const t = await db.getJSON(key(String(id)));
  if (!t) throw new core.HttpError(404, 'Ticket not found.');
  const a = await assist.answer(t, { force: true });
  t.ai = { ...(t.ai || { state: 'off' }), findings: a.findings, checkedAt: Date.now() };
  await db.setJSON(key(t.id), t);
  return { findings: a.findings, draft: { text: a.text, actions: a.actions, outcome: a.outcome, source: a.source, summary: a.summary || '', aiError: a.aiError || '' } };
}
async function adminSet(id, { status, priority }) {
  const t = await db.getJSON(key(String(id)));
  if (!t) throw new core.HttpError(404, 'Ticket not found.');
  if (STATUSES.includes(status) && status !== t.status) {
    t.status = status;
    t.messages.push({ by: 'system', text: `Status changed to ${status}.`, at: Date.now() });
    if (status === 'resolved' || status === 'closed') t.unreadUser = true;
    if (status === 'resolved') await notifyCustomer(t, `Ticket ${t.no} "${t.subject}" is marked resolved. Reply in PakkaBill if you still need help.`);
  }
  if (PRIORITIES.includes(priority)) t.priority = priority;
  t.updatedAt = Date.now();
  await save(t);
  return summary(t);
}

module.exports = {
  CATEGORIES, STATUSES, PRIORITIES, create, ownTicket, listForCustomer, customerReply, image, forCustomer,
  runAssistant, feedback, onPaymentDecision, preview, info,
  adminList, adminGet, adminReply, adminDraft, adminSet, counts, save,
};
