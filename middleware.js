// Vercel Routing Middleware: a browser check at the door for visitors from outside India.
// PakkaBill is for Indian sellers; most traffic from other countries is bots (crawlers,
// scanners, scripts). Visitors in India never see this. Others get a "Checking your browser"
// page for under a second: a real browser runs it, gets a signed cookie for 30 days and goes
// on. Scripts that do not run JavaScript, automated browsers and known scanners stop here.
// Search engines and link previews (Google, Bing, WhatsApp...) are let through so the site
// stays findable. The app's API, the APK download and app links are not matched at all.

export const config = {
  matcher: ['/', '/index.html', '/pnl.html', '/admin', '/admin.html', '/about', '/about.html', '/terms', '/terms.html',
    '/privacy', '/privacy.html', '/refund', '/refund.html', '/contact', '/contact.html', '/delete-account', '/delete-account.html'],
};

const COOKIE = 'pb_ok';
const DAYS = 30;
const GOOD_BOTS = /googlebot|google-inspectiontool|storebot-google|adsbot-google|bingbot|duckduckbot|applebot|yandexbot|baiduspider|whatsapp|facebookexternalhit|twitterbot|linkedinbot|telegrambot|slackbot|discordbot/i;
const BAD = /python|curl|wget|go-http|java\/|okhttp|axios|node-fetch|undici|libwww|httpclient|scrapy|headless|phantom|selenium|puppeteer|playwright|zgrab|masscan|nmap|censys|nuclei|sqlmap|nikto|semrush|ahrefs|mj12|dotbot|petalbot|bytespider|dataforseo|gptbot|ccbot|claudebot|perplexity|amazonbot|spider|crawl/i;

// Same as next() from @vercel/functions: let the request through unchanged.
const pass = () => new Response(null, { headers: { 'x-middleware-next': '1' } });

const enc = new TextEncoder();
let keyP = null;
function key() {
  const secret = process.env.PB_GATE_SECRET || process.env.ADMIN_PASSWORD || 'pakkabill-gate';
  return keyP || (keyP = crypto.subtle.importKey('raw', enc.encode('gate:' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']));
}
async function sign(text) {
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await key(), enc.encode(text)));
  let s = '';
  for (let i = 0; i < 16; i++) s += mac[i].toString(16).padStart(2, '0');
  return s;
}
const uaTag = (ua) => String(ua.length) + ua.slice(0, 40).replace(/[^A-Za-z0-9]/g, '');
async function valid(cookie, ua) {
  const m = /^(\d{10})\.([0-9a-f]{32})$/.exec(cookie || '');
  if (!m) return false;
  const age = Date.now() / 1000 - Number(m[1]);
  return age >= 0 && age < DAYS * 86400 && (await sign(m[1] + '|' + uaTag(ua))) === m[2];
}
function readCookie(req, name) {
  const m = new RegExp('(?:^|;\\s*)' + name + '=([^;]+)').exec(req.headers.get('cookie') || '');
  return m ? decodeURIComponent(m[1]) : '';
}

// Counts checks in the database (shown on the admin Visitors tab); never slows the response.
function count(field, country, ctx) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  const d = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
  const job = fetch(url + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify([['HINCRBY', 'v:gate:' + d, field, 1], ['HINCRBY', 'v:gatec:' + d, field + ':' + (country || '??'), 1]]),
  }).catch(() => {});
  if (ctx && ctx.waitUntil) ctx.waitUntil(job);
}

function page(token, retry) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>PakkaBill</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f6f7fb;color:#1b1f3b}main{text-align:center;padding:24px;max-width:420px}.s{width:34px;height:34px;margin:0 auto 14px;border:3px solid #dcd6ff;border-top-color:#5b3fe6;border-radius:50%;animation:r .8s linear infinite}@keyframes r{to{transform:rotate(360deg)}}b{display:block;font-size:1.15rem}p{color:#5c5776;margin:6px 0 0}</style></head>
<body><main><div class="s" id="s"></div><b id="t">Checking your browser…</b><p id="p">This takes a second. PakkaBill is made for Indian GST sellers.</p>
<noscript><p>Please turn on JavaScript to open PakkaBill.</p></noscript></main>
<script>(function(){var t=document.getElementById('t'),p=document.getElementById('p');
if(navigator.webdriver){t.textContent='Automated browsers cannot open PakkaBill.';p.textContent='';document.getElementById('s').remove();return;}
${retry ? "t.textContent='Please allow cookies';p.textContent='Your browser blocked the check. Allow cookies for this site and reload.';document.getElementById('s').remove();return;" : ''}
setTimeout(function(){document.cookie='${COOKIE}=${token}; Max-Age=${DAYS * 86400}; Path=/; Secure; SameSite=Lax';
var u=new URL(location.href);u.searchParams.set('pbc','1');location.replace(u.toString());},700);})();</script></body></html>`;
}

export default async function middleware(req, ctx) {
  if (req.method !== 'GET') return pass();
  const country = (req.headers.get('x-vercel-ip-country') || '').toUpperCase();
  if (!country || country === 'IN') return pass();
  const ua = req.headers.get('user-agent') || '';
  if (GOOD_BOTS.test(ua)) return pass();
  if (!ua || ua.length < 25 || BAD.test(ua)) {
    count('blocked', country, ctx);
    return new Response('Automated access is not allowed.', { status: 403, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } });
  }
  const url = new URL(req.url);
  if (await valid(readCookie(req, COOKIE), ua)) {
    if (url.searchParams.get('pbc') === '1') {
      // just passed the check: count it and drop the marker from the address
      count('passed', country, ctx);
      url.searchParams.delete('pbc');
      return new Response(null, { status: 302, headers: { location: url.pathname + url.search + url.hash, 'cache-control': 'no-store' } });
    }
    return pass();
  }
  if (url.searchParams.get('pbc') !== '1') count('checked', country, ctx);
  const ts = String(Math.floor(Date.now() / 1000));
  const token = ts + '.' + (await sign(ts + '|' + uaTag(ua)));
  return new Response(page(token, url.searchParams.get('pbc') === '1'), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });
}
