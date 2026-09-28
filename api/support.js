// POST /api/support { action, ... }  Customer side of support tickets.
//   create  { category, subject, message, image?, phone?, name?, diag? } -> { ticket, key? }
//           Logged-in customers use their account; guests give a mobile number and get a private
//           key back, which this device keeps to open the ticket again.
//   list    { guests: [{ id, key }] }            -> { tickets }   (no conversation text)
//   get     { id, key? }                         -> { ticket }    (marks the replies as read)
//   reply   { id, key?, message, image? }        -> { ticket }
//   image   { id, key?, n }                      -> { image }     (a data: URL)
//   unread  { guests }                           -> { count }     (tickets with a reply not yet read)
//   assist  { id, key? }                         -> { ticket }    (the assistant investigates and answers)
//   feedback { id, key?, solved }                -> { ticket }    ("It's solved" / "I still need help")
//   pushKey {}                                   -> { key }       (public key for phone notifications)
//   push    { sub, guests }                      -> { ok }        (notify this device about replies)
//   unpush  { endpoint, guests }                 -> { ok }
//   info    {}                                   -> { whatsapp, teamText, ... } (for the Help page)
//   preview { category, problem, subject, message, diag } -> { answer }  (quick fix before a ticket)
//   quickfix { problem, solved }                 -> { ok }        (did the quick fix help?)
//   chat    { messages: [{ role, text }], diag } -> { reply }     (the chat assistant)
//   chatfb  { helpful }                          -> { ok }        (thumbs up / down on a reply)
const core = require('./_lib/core');
const db = require('./_lib/db');
const support = require('./_lib/support');
const push = require('./_lib/push');
const assist = require('./_lib/assist');
const chat = require('./_lib/chat');

// Only guest tickets this device can prove it owns.
async function ownedGuests(guests) {
  const out = [];
  for (const g of (Array.isArray(guests) ? guests : []).slice(0, 30)) {
    if (!g || !g.id || !g.key) continue;
    try { out.push(await support.ownTicket(g.id, null, g.key)); } catch { /* not theirs or gone */ }
  }
  return out;
}

module.exports = core.handler(async (req, res) => {
  core.requireMethod(req, 'POST');
  if (!db.configured()) throw new core.HttpError(503, 'Support is not set up yet. Please WhatsApp us instead.');
  const b = core.body(req);
  const user = await core.sessionUser(req);
  const ip = core.clientIp(req);

  switch (b.action) {
    case 'create': {
      await core.rateLimit(`tk:new:${ip}`, 8, 3600);
      if (user) await core.rateLimit(`tk:new:u:${user.phone}`, 15, 86400);
      const out = await support.create(b, user);
      return core.send(res, 200, out);
    }
    case 'list':
      await core.rateLimit(`tk:list:${ip}`, 120, 3600);
      return core.send(res, 200, { tickets: await support.listForCustomer(user, b.guests) });
    case 'unread': {
      await core.rateLimit(`tk:list:${ip}`, 120, 3600);
      const list = await support.listForCustomer(user, b.guests);
      return core.send(res, 200, { count: list.filter((t) => t.unread).length });
    }
    case 'get': {
      const t = await support.ownTicket(b.id, user, b.key);
      if (t.unreadUser) { t.unreadUser = false; await db.setJSON(`ticket:${t.id}`, t); }
      return core.send(res, 200, { ticket: support.forCustomer(t) });
    }
    case 'reply': {
      await core.rateLimit(`tk:reply:${ip}`, 40, 3600);
      const t = await support.ownTicket(b.id, user, b.key);
      return core.send(res, 200, { ticket: await support.customerReply(t, b.message, b.image, b.diag) });
    }
    case 'assist': {
      await core.rateLimit(`tk:ai:${ip}`, 40, 3600);
      let t = await support.ownTicket(b.id, user, b.key);
      t = await support.runAssistant(t);
      // The answer goes straight back to the customer who is looking at the ticket.
      if (t.unreadUser && t.ai && t.ai.state !== 'pending') { t.unreadUser = false; await db.setJSON(`ticket:${t.id}`, t); }
      return core.send(res, 200, { ticket: support.forCustomer(t) });
    }
    case 'feedback': {
      await core.rateLimit(`tk:reply:${ip}`, 40, 3600);
      const t = await support.ownTicket(b.id, user, b.key);
      return core.send(res, 200, { ticket: await support.feedback(t, !!b.solved) });
    }
    case 'info':
      return core.send(res, 200, await support.info());
    case 'preview': {
      await core.rateLimit(`tk:pv:${ip}`, 80, 3600);
      return core.send(res, 200, { answer: await support.preview(b, user) });
    }
    case 'quickfix': {
      await core.rateLimit(`tk:qf:${ip}`, 80, 3600);
      await assist.quickFixStat(String(b.problem || ''), b.solved ? 'solved' : 'help');
      return core.send(res, 200, { ok: true });
    }
    case 'chat': {
      await core.rateLimit(`tk:chat:${ip}`, 80, 3600);
      return core.send(res, 200, { reply: await chat.reply(b, user) });
    }
    case 'chatfb': {
      await core.rateLimit(`tk:qf:${ip}`, 80, 3600);
      await chat.feedback(!!b.helpful);
      return core.send(res, 200, { ok: true });
    }
    case 'pushKey':
      return core.send(res, 200, { key: await push.publicKey() });
    case 'push': {
      await core.rateLimit(`tk:push:${ip}`, 30, 3600);
      const tickets = await ownedGuests(b.guests);
      if (!user && !tickets.length) throw new core.HttpError(400, 'Log in or raise a ticket first.');
      if (user) await push.subscribe(push.userKey(user.phone), b.sub);
      for (const t of tickets) await push.subscribe(push.ticketKey(t.id), b.sub);
      return core.send(res, 200, { ok: true });
    }
    case 'unpush': {
      await core.rateLimit(`tk:push:${ip}`, 30, 3600);
      if (user) await push.unsubscribe(push.userKey(user.phone), b.endpoint);
      for (const t of await ownedGuests(b.guests)) await push.unsubscribe(push.ticketKey(t.id), b.endpoint);
      return core.send(res, 200, { ok: true });
    }
    case 'image': {
      const t = await support.ownTicket(b.id, user, b.key);
      return core.send(res, 200, { image: await support.image(t, b.n) });
    }
    default:
      throw new core.HttpError(400, 'Unknown action.');
  }
});
