// POST /api/support { action, ... }  Customer side of support tickets.
//   create  { category, subject, message, image?, phone?, name?, diag? } -> { ticket, key? }
//           Logged-in customers use their account; guests give a mobile number and get a private
//           key back, which this device keeps to open the ticket again.
//   list    { guests: [{ id, key }] }            -> { tickets }   (no conversation text)
//   get     { id, key? }                         -> { ticket }    (marks the replies as read)
//   reply   { id, key?, message, image? }        -> { ticket }
//   image   { id, key?, n }                      -> { image }     (a data: URL)
//   unread  { guests }                           -> { count }     (tickets with a reply not yet read)
const core = require('./_lib/core');
const db = require('./_lib/db');
const support = require('./_lib/support');

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
      return core.send(res, 200, { ticket: await support.customerReply(t, b.message, b.image) });
    }
    case 'image': {
      const t = await support.ownTicket(b.id, user, b.key);
      return core.send(res, 200, { image: await support.image(t, b.n) });
    }
    default:
      throw new core.HttpError(400, 'Unknown action.');
  }
});
