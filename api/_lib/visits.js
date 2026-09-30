// Visit counter: our own, first-party and simple. No cookies from others, no IP addresses kept.
// Per day (Indian time) it keeps:  v:{day} (hash: visits, pv, new, ret, in, dev:*)  v:u:{day} (unique
// visitors, HyperLogLog)  v:page:{day}  v:src:{day}  v:city:{day} (hashes)  and v:recent (latest 500).
const db = require('./db');

const DAY = 86400e3, IST = 5.5 * 3600e3, KEEP_DAYS = 90;
const dayKey = (t) => new Date(t + IST).toISOString().slice(0, 10).replace(/-/g, '');
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|preview|headless|lighthouse|pingdom|uptime/i;
const clip = (s, n) => String(s || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);

function device(ua, standalone) {
  if (/PakkaBillApp\//.test(ua)) return 'Android app';
  if (standalone) return 'Installed web app';
  if (/iPad|Tablet/i.test(ua)) return 'Tablet';
  if (/Mobi|Android|iPhone/i.test(ua)) return 'Phone browser';
  return 'Computer';
}
function source(ref, utm) {
  if (utm) return clip(utm, 40).toLowerCase();
  let h = '';
  try { h = new URL(ref).hostname.replace(/^www\./, ''); } catch { /* none */ }
  if (!h) return 'Direct';
  if (/google\./.test(h)) return 'Google';
  if (/whatsapp|wa\.me/.test(h)) return 'WhatsApp';
  if (/facebook|fb\.|instagram/.test(h)) return h.includes('insta') ? 'Instagram' : 'Facebook';
  if (/youtube|youtu\.be/.test(h)) return 'YouTube';
  if (/t\.co$|twitter|x\.com/.test(h)) return 'X (Twitter)';
  return clip(h, 40);
}
// Pages look like "/#/pnl", "/terms"; anything else is folded into "other".
function cleanPath(p) {
  const s = clip(p, 60);
  return /^\/(#\/[a-z0-9-]{0,30})?$/i.test(s) || /^\/[a-z0-9-]{1,30}(\.html)?$/i.test(s) ? s.replace(/\.html$/, '') : 'other';
}

// kind 'visit' starts a visit (new session); 'pv' is another page in the same visit.
async function record(req, b, phone) {
  const ua = String(req.headers['user-agent'] || '');
  if (BOT.test(ua)) return false;
  const now = Date.now(), d = dayKey(now), path = cleanPath(b.path);
  if (b.kind !== 'visit') {
    await db.pipe([['HINCRBY', `v:${d}`, 'pv', 1], ['HINCRBY', `v:page:${d}`, path, 1]]);
    return true;
  }
  const vid = clip(b.vid, 40) || 'anon';
  const dev = device(ua, !!b.standalone), src = source(b.ref, b.utm);
  const city = clip(decodeURIComponent(String(req.headers['x-vercel-ip-city'] || '')), 40);
  const region = clip(req.headers['x-vercel-ip-country-region'], 10);
  const country = clip(req.headers['x-vercel-ip-country'], 4);
  const place = city ? `${city}${region ? ', ' + region : ''}` : country || 'Unknown';
  const cmds = [
    ['HINCRBY', `v:${d}`, 'visits', 1], ['HINCRBY', `v:${d}`, 'pv', 1], ['HINCRBY', `v:${d}`, b.isNew ? 'new' : 'ret', 1],
    ['HINCRBY', `v:${d}`, 'dev:' + dev, 1], ['PFADD', `v:u:${d}`, vid],
    ['HINCRBY', `v:page:${d}`, path, 1], ['HINCRBY', `v:src:${d}`, src, 1], ['HINCRBY', `v:city:${d}`, place, 1],
    ['LPUSH', 'v:recent', JSON.stringify({ t: now, vid: vid.slice(0, 8), path, src, dev, place, isNew: !!b.isNew, phone: phone || '' })], ['LTRIM', 'v:recent', 0, 499],
  ];
  if (phone) cmds.push(['HINCRBY', `v:${d}`, 'in', 1]);
  await db.pipe(cmds);
  return true;
}

function toObj(flat) {
  const o = {};
  for (let i = 0; i < (flat || []).length; i += 2) o[flat[i]] = Number(flat[i + 1]) || 0;
  return o;
}
function add(into, o) { for (const k in o) into[k] = (into[k] || 0) + o[k]; return into; }
const top = (o, n = 10) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));

// Numbers for the admin Visitors tab: last `days` days per day, and totals over `range` days.
async function report(days = 30, range = 7) {
  const now = Date.now(), list = [];
  for (let i = days - 1; i >= 0; i--) list.push(dayKey(now - i * DAY));
  const perDay = await db.pipe(list.flatMap((d) => [['HGETALL', `v:${d}`], ['PFCOUNT', `v:u:${d}`]]));
  const series = list.map((d, i) => { const h = toObj(perDay[i * 2]); return { day: d, visits: h.visits || 0, pv: h.pv || 0, visitors: perDay[i * 2 + 1] || 0, h }; });
  const recentDays = list.slice(-range);
  const [u7, u30, ...hs] = await db.pipe([
    ['PFCOUNT', ...recentDays.map((d) => `v:u:${d}`)], ['PFCOUNT', ...list.map((d) => `v:u:${d}`)],
    ...recentDays.flatMap((d) => [['HGETALL', `v:page:${d}`], ['HGETALL', `v:src:${d}`], ['HGETALL', `v:city:${d}`]]),
  ]);
  const pages = {}, srcs = {}, cities = {}, sum = {};
  recentDays.forEach((d, i) => { add(pages, toObj(hs[i * 3])); add(srcs, toObj(hs[i * 3 + 1])); add(cities, toObj(hs[i * 3 + 2])); });
  series.slice(-range).forEach((x) => add(sum, x.h));
  const devices = {};
  Object.keys(sum).filter((k) => k.startsWith('dev:')).forEach((k) => { devices[k.slice(4)] = sum[k]; });
  const recent = ((await db.cmd(['LRANGE', 'v:recent', 0, 99])) || []).map((r) => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
  const today = series[series.length - 1];
  return {
    today: { visits: today.visits, pv: today.pv, visitors: today.visitors },
    week: { visits: sum.visits || 0, pv: sum.pv || 0, visitors: u7, newVisitors: sum.new || 0, returning: sum.ret || 0, loggedIn: sum.in || 0 },
    month: { visitors: u30, visits: series.reduce((n, x) => n + x.visits, 0) },
    now: recent.filter((r) => now - r.t < 5 * 60e3).length,
    series: series.map(({ day, visits, pv, visitors }) => ({ day, visits, pv, visitors })),
    pages: top(pages), sources: top(srcs), cities: top(cities), devices: top(devices),
    recent,
  };
}

// Daily clean-up: removes the per-day keys older than KEEP_DAYS.
async function cleanup() {
  const keys = [];
  for (let i = KEEP_DAYS; i < KEEP_DAYS + 7; i++) { const d = dayKey(Date.now() - i * DAY); keys.push(`v:${d}`, `v:u:${d}`, `v:page:${d}`, `v:src:${d}`, `v:city:${d}`); }
  return db.cmd(['DEL', ...keys]);
}

module.exports = { record, report, cleanup, dayKey };
