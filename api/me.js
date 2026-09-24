// GET /api/me  -> the logged-in account and its plan
const core = require('./_lib/core');

module.exports = core.handler(async (req, res) => {
  const user = await core.requireUser(req);
  core.send(res, 200, { user: core.publicUser(user) });
});
