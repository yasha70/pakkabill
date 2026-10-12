// GET /api/gstin?g=27AAPFU0939F1ZV -> registered name, address, status and type of a GST number.
// Without a lookup service set up it still answers with what the number itself says (state, PAN, kind of
// business) and offline: true. Answers are kept for 30 days, so a number is paid for once.
const core = require('./_lib/core');
const db = require('./_lib/db');
const gst = require('./_lib/gst');

module.exports = core.handler(async (req, res) => {
  core.requireMethod(req, 'GET');
  const q = new URL(req.url, 'http://x').searchParams;
  const v = gst.check(q.get('g'));
  if (!v.ok) throw new core.HttpError(400, v.message);
  const g = v.gstin;
  // paid lookups need the database: for the saved answers and the limits that protect the credits
  const cfg = db.configured() ? gst.config(await core.getSettings()) : null;
  if (!cfg) return core.send(res, 200, Object.assign(gst.fromNumber(g), { offline: true }));
  const hit = await db.getJSON(`gst:${g}`);
  if (hit) return core.send(res, 200, Object.assign(hit, { cached: true }));
  // every lookup costs the shop owner money: a fair limit per visitor and per day
  await core.rateLimit(`gst:${core.clientIp(req) || 'anon'}`, 30, 3600);
  await core.rateLimit('gst:day', 2000, 86400);
  const data = await gst.lookup(cfg, g);
  await db.setJSON(`gst:${g}`, data, 30 * 86400);
  core.send(res, 200, data);
});
