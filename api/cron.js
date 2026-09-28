// GET /api/cron  Runs once a day (Vercel Cron, see vercel.json): phone reminders before and when
// Pro (or the free trial) ends, so customers can renew in time. Each reminder goes out once per
// plan end date. If CRON_SECRET is set in Vercel, only Vercel's scheduler can call this.
const core = require('./_lib/core');
const db = require('./_lib/db');
const push = require('./_lib/push');

module.exports = core.handler(async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) throw new core.HttpError(401, 'Not allowed.');
  if (!db.configured()) return core.send(res, 200, { ok: true, sent: 0 });
  const phones = await db.cmd(['ZREVRANGE', 'users', 0, -1]);
  const users = (await db.mgetJSON(phones.map((p) => `user:${p}`))).filter(Boolean);
  const now = Date.now();
  let sent = 0;
  for (const u of users) {
    const left = (u.paidUntil || 0) - now;
    const kind = left > 0 && left <= 3 * core.DAY ? 'soon' : left <= 0 && left > -core.DAY ? 'ended' : '';
    if (!kind) continue;
    const once = await db.cmd(['SET', `remind:${kind}:${u.phone}:${u.paidUntil}`, '1', 'NX', 'EX', 10 * 86400]);
    if (!once) continue;
    const date = new Date(u.paidUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
    const what = u.lastPlan === 'trial' ? 'free Pro trial' : 'PakkaBill Pro';
    sent += await push.toUser(u.phone, kind === 'soon'
      ? { title: `Your ${what} ends on ${date}`, body: 'Renew now to keep unlimited bills, all your shops and cloud backup. The new time adds on top of what is left.', url: '/#/plan', tag: 'renew' }
      : { title: `Your ${what} has ended`, body: 'Your bills and shops are safe. Renew to get unlimited bills, PDF, WhatsApp and cloud backup back.', url: '/#/plan', tag: 'renew' });
  }
  core.send(res, 200, { ok: true, checked: users.length, sent });
});
