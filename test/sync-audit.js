// Cloud backup limits (api/_lib/sync.js) on the in-memory database: unfinished uploads expire,
// an upload over the quota is not kept, and one account holds at most 10 shops.
// Run: node test/sync-audit.js   (exits 1 on any failure)
'use strict';
process.env.PB_DEV_MEMORY_DB = '1';
const db = require('../api/_lib/db');
const sync = require('../api/_lib/sync');

let fails = 0, checks = 0;
function ok(cond, what, detail) { checks++; if (!cond) { fails++; console.log('FAIL  ' + what + (detail ? '  ' + detail : '')); } }
const user = { phone: '9876543210', paidUntil: Date.now() + 864e5 * 30 }; // Pro
const part = 'A'.repeat(1000);
const up = (shop, b) => sync.put(user, Object.assign({ shop, base: 0, token: 'tok-123456789', parts: 1, part: 0, data: part }, b));

(async () => {
  // a part that is never committed expires
  await up('s_half', { parts: 2, part: 0 });
  const ttl = await db.cmd(['TTL', 'sync:9876543210:s_half:a:0']);
  ok(ttl > 0 && ttl <= 3600, 'unfinished upload part expires within an hour', 'ttl ' + ttl);
  ok(!(await sync.status(user)).shops.some((s) => s.id === 's_half'), 'unfinished upload is not a shop');
  await db.cmd(['DEL', 'synclock:9876543210:s_half']);

  // a finished upload is kept for good
  const r = await up('main');
  ok(r.ok && r.version === 1, 'upload commits', JSON.stringify(r));
  ok((await db.cmd(['TTL', 'sync:9876543210:main:a:0'])) === -1, 'committed part does not expire');
  const g = await sync.get(user, { shop: 'main', part: 0 });
  ok(g.data === part, 'committed upload reads back');

  // at most 10 shops
  for (let i = 1; i < 10; i++) await up('s_shop' + i);
  ok((await sync.status(user)).shops.length === 10, 'ten shops fit');
  let err = null;
  try { await up('s_shop11'); } catch (e) { err = e; }
  ok(err && err.status === 413, 'an eleventh shop is refused');
  const again = await up('s_shop1', { base: 1 }).catch((e) => e);
  ok(again && again.ok, 'an existing shop still saves when ten are full');

  // an upload over the quota is not kept
  const free = { phone: '9123456780', paidUntil: 0 };
  const s = require('../api/_lib/core');
  const settings = await s.getSettings(true);
  await db.setJSON('settings', Object.assign({}, settings, { upiId: 'shop@upi', enforce: true, syncFree: true }));
  s.forgetSettings();
  const big = 'B'.repeat(600000);
  let e2 = null;
  for (let i = 0; i < 6; i++) {
    try { await sync.put(free, { shop: 'main', base: 0, token: 'tok-abcdefghij', parts: 6, part: i, data: big }); } catch (e) { e2 = e; }
  }
  ok(e2 && e2.status === 413, 'upload over the free quota is refused', e2 && e2.message);
  ok((await db.cmd(['GET', 'sync:9123456780:main:a:0'])) == null, 'refused upload parts are deleted');

  console.log(fails ? `${fails} of ${checks} sync checks FAILED` : `${checks}/${checks} sync checks passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
