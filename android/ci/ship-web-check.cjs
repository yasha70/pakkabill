// Checks the script the app puts in Meesho's supplier panel for the shipping check (ShipWeb.bundle(),
// written by the core test when SHIP_WEB_OUT is set), in Chromium, the engine of Android's WebView.
// A stand-in for Meesho's Add Single Catalog page is served at supplier.meesho.com with a stand-in
// for Meesho's server: a photo upload, then a shipping request for that photo and category, whose
// answer depends on the photo and the category, shown on the page. The app's side (PBLensHost, the
// versions at their addresses) is played here. The seller uploads their own photo once; the
// website's bookmark code then learns from it, checks it gets the same number back, and prices every
// version in the category the app asked for; the prices come back to the app.
// Run: node android/ci/ship-web-check.cjs <bundle.js>   (exits 1 on any failure)
'use strict';
const fs = require('fs');
const { chromium } = require('playwright');

const bundle = fs.readFileSync(process.argv[2], 'utf8');
const FORM = 'https://supplier.meesho.com/panel/v3/new/cataloging/add-single-catalog';
const SHIP = 'https://supplier.meesho.com/__pakkabill__/ship/';

// The stand-in for Meesho's form: the category tree when the seller opens the category picker; on a
// photo, an upload and then the shipping for that photo in the category picked (Kurtis), shown.
const page0 = `<!doctype html><html><head><meta charset="utf-8"><title>Add Single Catalog</title></head><body>
<h1>Add Single Catalog</h1><p>Women Ethnic &gt; Kurtis</p><button id="pick" type="button">Change category</button>
<div><label for="img">Product Images *</label><input type="file" id="img" accept="image/*"></div>
<div id="ship">Shipping charges <span id="sv">-</span></div>
<script>
const SUP = 556677;
document.getElementById('pick').addEventListener('click', function () { fetch('/api/v1/categories/tree').then(function (r) { return r.json(); }); });
document.getElementById('img').addEventListener('change', async function (e) {
  const f = e.target.files[0]; if (!f) return;
  const fd = new FormData(); fd.append('file', f, f.name); fd.append('supplier_id', String(SUP));
  const up = await (await fetch('/catalogingapi/api/image/upload', { method: 'POST', body: fd })).json();
  const res = await (await fetch('/catalogingapi/api/pricing/shipping', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sscat_id: 1250, supplier_id: SUP, images: [{ url: up.data.image_url, id: up.data.image_id }], price: 349, weight: 0.4 }) })).json();
  document.getElementById('sv').textContent = '₹' + res.data.shipping_charges;
});
</script></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  // photos of different sizes: the seller's own, and two versions
  const jpeg = async (w, h, color) => { await page.setContent(`<div style="width:${w}px;height:${h}px;background:${color}"></div>`); return page.screenshot({ type: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: w, height: h } }); };
  const own = await jpeg(240, 300, 'linear-gradient(#7a1c34,#d6a848)'), v1 = await jpeg(200, 200, '#7a1c34'), v2 = await jpeg(260, 320, 'repeating-linear-gradient(45deg,#7a1c34 0 6px,#fff 6px 12px)');
  const files = { t0: own, t1: v1, t2: v2 };

  // Meesho's server, stood in for: what it charges depends on the photo's bytes and the category
  const images = new Map();
  let n = 0;
  const priceOf = (bytes, cat) => 60 + (bytes % 37) + (Number(cat) === 1234 ? 5 : 0);
  const fileSize = (buf, type) => {
    const b = (/boundary=([^;]+)/.exec(type) || [])[1];
    if (!b) return 0;
    const parts = buf.toString('latin1').split('--' + b);
    const p = parts.find((x) => /filename=/.test(x));
    if (!p) return 0;
    const start = p.indexOf('\r\n\r\n') + 4;
    return p.length - start - 2; // up to the line break before the next boundary
  };
  const calls = [];
  await page.route('https://supplier.meesho.com/**', async (route) => {
    const req = route.request(), u = new URL(req.url());
    if (req.url().startsWith(SHIP)) {
      const t = (/\/(t\d)\.jpg$/.exec(u.pathname) || [])[1];
      return files[t] ? route.fulfill({ status: 200, contentType: 'image/jpeg', body: files[t] }) : route.fulfill({ status: 404, body: '' });
    }
    if (u.pathname === '/api/v1/categories/tree') return route.fulfill({ json: { data: { categories: [{ id: 10, name: 'Women Ethnic', children: [{ id: 1234, name: 'Blouses' }, { id: 1250, name: 'Kurtis' }, { id: 1240, name: 'Sarees' }] }] } } });
    if (u.pathname === '/catalogingapi/api/image/upload') {
      const size = fileSize(req.postDataBuffer() || Buffer.alloc(0), req.headers()['content-type'] || '');
      n++; images.set(9000 + n, size); calls.push('upload ' + size);
      return route.fulfill({ json: { data: { image_url: 'https://images.meesho.com/images/catalog/img' + n + '.jpg', image_id: 9000 + n } } });
    }
    if (u.pathname === '/catalogingapi/api/pricing/shipping') {
      const b = JSON.parse(req.postData() || '{}'), id = b.images && b.images[0] && b.images[0].id, size = images.get(id);
      calls.push('shipping ' + id + ' ' + b.sscat_id);
      if (size == null) return route.fulfill({ status: 400, json: { error: 'unknown image' } });
      return route.fulfill({ json: { data: { shipping_charges: priceOf(size, b.sscat_id), transfer_price: 300, free_shipping: false, delivery_tat_days: 5, gst_percent: 5, weight_slab: '0.5' } } });
    }
    return route.fulfill({ status: 200, contentType: 'text/html', body: page0 });
  });

  // the app: PBLensHost (only for supplier.meesho.com), and what it keeps of the check's messages
  const got = { results: {}, cats: {}, lens: null, types: [] };
  await page.exposeBinding('__pbApp', (src, text) => {
    const o = JSON.parse(text);
    if (o.op !== 'ship' || !o.m || o.m.pbsb !== 1) return;
    got.types.push(o.m.type);
    if (o.m.type === 'results') { got.results = o.m.results || {}; got.cats = o.m.cats || {}; }
    if (o.m.lens) got.lens = o.m.lens;
  });
  await page.addInitScript(() => {
    if (location.origin !== 'https://supplier.meesho.com') return;
    window.PBLensHost = { onmessage: null, postMessage(s) { window.__pbApp(s); } };
  });
  page.on('pageerror', (e) => console.log('page error:', e.message));
  page.on('dialog', (d) => { console.log('dialog:', d.message()); d.dismiss(); });

  await page.goto(FORM);
  // the app runs the script once the page has loaded, then sends the versions
  await page.addScriptTag({ content: bundle });
  await page.addScriptTag({ content: bundle });
  await page.evaluate((q) => window.__pbShipApp.queue(q), {
    cats: [{ name: 'Blouses', id: null }],
    items: [
      { id: 'p1|orig', label: 'kurti · Your photo', name: 'kurti-meesho-orig.jpg', url: SHIP + 't0.jpg' },
      { id: 'p1|frame', label: 'kurti · White frame', name: 'kurti-meesho-frame.jpg', url: SHIP + 't1.jpg' },
      { id: 'p1|zoom', label: 'kurti · Zoom 92%', name: 'kurti-meesho-zoom.jpg', url: SHIP + 't2.jpg' },
    ],
  });
  // the panel says the versions came from PakkaBill
  await page.locator('#pakkabill-shipbm').getByText('3 versions from PakkaBill').waitFor({ timeout: 10000 });

  // the seller opens Meesho's category picker (Meesho reads its category list), then uploads their
  // own photo once, as in Meesho
  await page.click('#pick');
  await page.waitForTimeout(800);
  await page.setInputFiles('#img', { name: 'kurti.jpg', mimeType: 'image/jpeg', buffer: own });
  const shown = await page.locator('#sv').filter({ hasText: '₹' }).textContent({ timeout: 10000 });
  // the check learns from it, checks the number, and prices every version by itself
  const t0 = Date.now();
  while (Date.now() - t0 < 60000 && Object.keys(got.results).filter((k) => Object.keys(got.results[k]).length).length < 3) await page.waitForTimeout(300);
  await page.locator('#pakkabill-shipbm').getByText('Cheapest').waitFor({ timeout: 15000 }).catch(() => {});
  const panel = await page.locator('#pakkabill-shipbm .card').innerText().catch(() => ''); // inside its shadow root
  const after = await page.evaluate(() => ({ chrome: typeof window.chrome, opener: window.opener, frames: document.querySelectorAll('iframe').length }));
  await browser.close();

  const expect = (buf, cat) => priceOf(buf.length, cat);
  let fails = 0;
  const eq = (a, b, what) => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) { fails++; console.log(`FAIL  ${what}  expected ${B}, got ${A}`); } else console.log(`ok    ${what}`); };
  eq(shown, '₹' + expect(own, 1250), 'Meesho\'s page shows the seller\'s own photo\'s shipping');
  eq(got.lens && [got.lens.learned, got.lens.confirmed, got.lens.verified], [true, true, true], 'the check learned Meesho\'s requests and got the same number back');
  eq(Object.values(got.cats), ['Blouses'], 'priced in the category the app asked for, found in Meesho\'s list');
  const key = Object.keys(got.cats)[0];
  eq(key, '1234', 'Meesho\'s id of that category');
  eq({ orig: (got.results['p1|orig'] || {})[key], frame: (got.results['p1|frame'] || {})[key], zoom: (got.results['p1|zoom'] || {})[key] },
    { orig: expect(own, 1234), frame: expect(v1, 1234), zoom: expect(v2, 1234) }, 'every version priced by Meesho\'s own answer, for its own bytes');
  eq(calls.filter((c) => c.startsWith('shipping') && / 1234$/.test(c)).length >= 3, true, 'the shipping asked again in the chosen category: ' + calls.join(', '));
  if (!/Cheapest/.test(panel)) console.log('panel text:', JSON.stringify(panel.slice(0, 900)));
  eq(/Cheapest/.test(panel), true, 'the panel in Meesho\'s page shows the cheapest');
  eq([after.chrome, after.opener], ['undefined', null], 'no extension names or opener added to Meesho\'s page');
  eq(got.types.includes('results') && got.types.includes('state'), true, 'messages went to the app through PBLensHost: ' + [...new Set(got.types)].join(', '));
  console.log(`${fails ? 'FAILED' : 'OK'}: in-app shipping check`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
