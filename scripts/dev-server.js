// Local test server: the app and all /api functions in one process, with keys from .env.
// Run: npm run dev   then open http://localhost:3000
// Without Redis keys in .env it uses an in-memory database (PB_DEV_MEMORY_DB=1): sign up with any
// mobile number, nothing reaches the live site, and everything is gone when the server stops.
// Not deployed (.vercelignore).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;

// .env: KEY=VALUE lines, # comments; variables already set in the shell win.
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch {
  console.log('No .env file: copy .env.example to .env and add your Razorpay test keys.');
}
if (!process.env.KV_REST_API_URL && !process.env.UPSTASH_REDIS_REST_URL) process.env.PB_DEV_MEMORY_DB = '1';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.zip': 'application/zip', '.apk': 'application/vnd.android.package-archive' };
const REWRITES = Object.fromEntries((JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).rewrites || []).map((r) => [r.source, r.destination]));

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const api = /^\/api\/([a-z-]+)$/.exec(url.pathname);
  if (api) {
    const file = path.join(ROOT, 'api', api[1] + '.js');
    if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('{"error":"Not found"}'); }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      // like Vercel: a JSON body arrives parsed as req.body
      try { req.body = raw && /json/.test(req.headers['content-type'] || '') ? JSON.parse(raw) : raw; } catch { req.body = raw; }
      Promise.resolve(require(file)(req, res)).catch((e) => { console.error(e); if (!res.writableEnded) { res.statusCode = 500; res.end('{"error":"Server error"}'); } });
    });
    return;
  }
  let p = REWRITES[url.pathname] || url.pathname;
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT + path.sep) || /[\\/](\.|api[\\/]|scripts[\\/]|node_modules[\\/])/.test(file.slice(ROOT.length)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404;
    return res.end('Not found');
  }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
  const key = process.env.RAZORPAY_KEY_ID || '';
  console.log(`PakkaBill on http://localhost:${PORT}  (${process.env.PB_DEV_MEMORY_DB === '1' ? 'in-memory database' : 'Redis from .env'})`);
  console.log(key ? `Razorpay: ${key} (${key.startsWith('rzp_live_') ? 'LIVE keys: real money' : 'test mode'})` : 'Razorpay: no keys in .env');
});
