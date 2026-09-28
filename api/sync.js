// POST /api/sync { action, ... }  Cloud backup and sync of the customer's shops (login needed).
//   status {}                                            -> { allowed, pro, quota, used, shops }
//   put    { shop, base, part, parts, data, enc, token, info, device } -> { ok, version } | { conflict, version }
//   get    { shop, part, version? }                      -> { version, parts, enc, data } | { conflict, version }
//   delete { shop }                                      -> { ok }
const core = require('./_lib/core');
const sync = require('./_lib/sync');

module.exports = core.handler(async (req, res) => {
  core.requireMethod(req, 'POST');
  const user = await core.requireUser(req);
  const b = core.body(req);
  switch (b.action) {
    case 'status':
      await core.rateLimit(`sync:st:${user.phone}`, 900, 3600);
      return core.send(res, 200, await sync.status(user));
    case 'put':
      await core.rateLimit(`sync:put:${user.phone}`, 3000, 3600);
      return core.send(res, 200, await sync.put(user, b));
    case 'get':
      await core.rateLimit(`sync:get:${user.phone}`, 3000, 3600);
      return core.send(res, 200, await sync.get(user, b));
    case 'delete':
      await core.rateLimit(`sync:del:${user.phone}`, 60, 3600);
      return core.send(res, 200, await sync.remove(user, b.shop));
    default:
      throw new core.HttpError(400, 'Unknown action.');
  }
});
