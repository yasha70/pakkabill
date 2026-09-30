// GET /api/health  -> { ok, db, ms }  For uptime monitors (e.g. UptimeRobot): 200 when the
// server and the database answer, 503 when the database does not.
const core = require('./_lib/core');
const db = require('./_lib/db');

module.exports = async (req, res) => {
  const t = Date.now();
  let ok = db.configured();
  try {
    if (ok) ok = (await db.cmd(['PING'])) === 'PONG';
  } catch {
    ok = false;
  }
  core.send(res, ok ? 200 : 503, { ok, db: ok ? 'up' : 'down', ms: Date.now() - t, at: new Date().toISOString() });
};
