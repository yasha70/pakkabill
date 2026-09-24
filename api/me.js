// GET /api/me  -> the logged-in account and its plan
const core = require('./_lib/core');

module.exports = core.handler(async (req, res) => {
  const user = await core.requireUser(req);
  // Remember when each customer last opened the app (at most once an hour).
  if (Date.now() - (user.lastSeen || 0) > 3600e3) {
    user.lastSeen = Date.now();
    await core.saveUser(user);
  }
  core.send(res, 200, { user: core.publicUser(user) });
});
