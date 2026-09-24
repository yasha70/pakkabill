// GET  /api/news                    -> messages and offers for this viewer (logged in or not)
// POST /api/news { action: 'claim', id } -> claim a free-Pro-days offer
const core = require('./_lib/core');
const db = require('./_lib/db');
const promos = require('./_lib/promos');

module.exports = core.handler(async (req, res) => {
  if (!db.configured()) return core.send(res, 200, { news: [] });
  if (req.method === 'GET') {
    const user = await core.sessionUser(req);
    return core.send(res, 200, { news: await promos.forViewer(user) });
  }
  core.requireMethod(req, 'POST');
  const user = await core.requireUser(req);
  const { action, id } = core.body(req);
  if (action !== 'claim') throw new core.HttpError(400, 'Unknown action.');
  await core.rateLimit(`claim:${user.phone}`, 20, 3600);
  const updated = await promos.claimTrial(user, String(id || ''));
  core.send(res, 200, { user: core.publicUser(updated) });
});
