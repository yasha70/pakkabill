// Checks the script the app puts in Meesho's supplier panel for Auto listing (AutoListWeb.bundle(),
// written by the core test when AUTOLIST_WEB_OUT is set), in Chromium, the engine of Android's
// WebView. The website's stand-in for Meesho's form (test/autolist-form.html) is served at
// supplier.meesho.com and the app's side of PBLensHost is played here, as the app answers it.
// The extension's own panel then fills the form and puts the product's photos in, saves a template
// from the form and marks the product submitted, all through the app's storage.
// Run: node android/ci/autolist-web-check.cjs <bundle.js>   (exits 1 on any failure)
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const bundle = fs.readFileSync(process.argv[2], 'utf8');
const formHtml = fs.readFileSync(path.join(root, 'test', 'autolist-form.html'), 'utf8');
const FORM = 'https://supplier.meesho.com/panel/v3/new/cataloging/add-single-catalog';
const PHOTO = 'https://supplier.meesho.com/__pakkabill__/photo/';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const shot = await page.screenshot({ type: 'jpeg', clip: { x: 0, y: 0, width: 24, height: 24 } }); // a real JPEG for the photos

  // the app's storage (chrome.storage.local of the extension), with one product waiting
  const tpl = {
    id: 't1', name: 'Kurti', category: 'Women Fashion > Ethnic Wear > Kurtis', title: '{color} {fabric} Kurti', desc: 'Pure {fabric} kurti in {color}.', updatedAt: 1,
    fields: [{ label: 'Fabric', value: 'Cotton' }, { label: 'Pattern', value: 'Woven Design' }, { label: 'Occasion', value: 'Festive, Wedding' }, { label: 'GST', value: '5' }, { label: 'Brand', value: 'Generic' }, { label: 'Sleeves', value: 'Long Sleeves' }, { label: 'Neck Type', value: 'Neck 33' }],
    sizes: [{ size: 'M', price: '299', mrp: '999', stock: '10' }, { size: 'L', price: '299', mrp: '999', stock: '10' }],
  };
  const photos = [{ name: 'front.jpg', data: PHOTO + 'ph1.jpg', id: 'ph1' }, { name: 'back.jpg', data: PHOTO + 'ph2.jpg', id: 'ph2' }];
  const store = { listtpl: [tpl], liststat: {}, listq: { at: 1, items: [{ id: 'p1', tpl, prod: { name: 'Kurti', color: 'Navy Blue', sku: 'KT01', price: '', mrp: '', stock: '', photos } }] } };
  const asked = [];
  // what the app does with each message (AutoListController.onHostMessage)
  await page.exposeBinding('__pbApp', (src, text) => {
    const m = JSON.parse(text);
    asked.push(m.op);
    let v = null;
    if (m.op === 'get') { v = {}; (m.arg || Object.keys(store)).forEach((k) => { if (store[k] !== undefined && store[k] !== null) v[k] = store[k]; }); }
    else if (m.op === 'set') Object.assign(store, m.arg);
    else if (m.op === 'remove') (m.arg || []).forEach((k) => { delete store[k]; });
    return JSON.stringify({ id: m.id, v });
  });
  // PBLensHost, as androidx.webkit's addWebMessageListener gives it to supplier.meesho.com
  await page.addInitScript(() => {
    if (location.origin !== 'https://supplier.meesho.com') return;
    window.PBLensHost = { onmessage: null, postMessage(s) { window.__pbApp(s).then((r) => { if (this.onmessage) this.onmessage({ data: r }); }); } };
  });
  await page.route('https://supplier.meesho.com/**', (route) => {
    const u = route.request().url();
    if (u.startsWith(PHOTO)) return /\/ph[12]\.jpg$/.test(u) ? route.fulfill({ status: 200, contentType: 'image/jpeg', body: shot }) : route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'text/html', body: formHtml });
  });
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Kurti from Meesho' : undefined));
  page.on('pageerror', (e) => console.log('page error:', e.message));

  await page.goto(FORM);
  // Meesho's photo box (the stand-in form has none)
  await page.evaluate(() => {
    const d = document.createElement('div'); d.className = 'form-group'; d.innerHTML = '<span>Product Images *</span>';
    const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = 'image/*'; i.id = 'photos';
    d.appendChild(i); document.querySelector('#f').prepend(d);
  });
  const before = await page.evaluate(() => ({ fetch: String(window.fetch), keys: Object.keys(window).length }));
  // the app runs the script once the page has loaded (evaluateJavascript); twice does nothing more
  await page.addScriptTag({ content: bundle });
  await page.addScriptTag({ content: bundle });

  const panel = page.locator('#pakkabill-list');
  await panel.locator('button[data-fill]').click({ timeout: 10000 });
  await panel.locator('.note', { hasText: 'Filled' }).waitFor({ timeout: 15000 });
  const note1 = await panel.locator('.note').textContent();
  const got = await page.evaluate(() => ({
    name: document.querySelector('#pn').value,
    fabric: document.querySelector('#fab .v').textContent,
    size: document.querySelector('#size .v').textContent,
    gst: document.querySelector('#gst').value,
    color: document.querySelector('#col').value,
    desc: document.querySelector('#desc').value,
    rows: [...document.querySelectorAll('#sizes tbody tr')].map((tr) => [...tr.querySelectorAll('input')].map((i) => i.value)),
    photos: [...document.querySelector('#photos').files].map((f) => [f.name, f.type, f.size > 100]),
    submitted: !!window.SUBMITTED,
  }));
  const stat1 = JSON.parse(JSON.stringify(store.liststat.p1 || null));

  // "Save this form as a template": named in a prompt, read with all drop-downs, kept by the app
  await panel.locator('button[data-learn]').click();
  await panel.locator('.note', { hasText: 'saved' }).waitFor({ timeout: 20000 });
  const learned = store.listtpl.find((t) => t.source === 'meesho');

  // "Submitted, next"
  await panel.locator('button[data-done]').click();
  await page.waitForFunction(() => true);
  await new Promise((r) => setTimeout(r, 300));
  const after = await page.evaluate(() => ({ fetch: String(window.fetch), keys: Object.keys(window), core: typeof window.PBListCore, chrome: !!(window.chrome && window.chrome.storage) }));
  await browser.close();

  let fails = 0;
  const eq = (a, b, what) => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) { fails++; console.log(`FAIL  ${what}  expected ${B}, got ${A}`); } else console.log(`ok    ${what}`); };
  eq(got.name, 'Navy Blue Cotton Kurti', 'product name from the template pattern');
  eq([got.fabric, got.size, got.gst, got.color], ['Cotton', 'M, L', '5', 'Navy Blue'], 'drop-downs, sizes, select and search list');
  eq(got.desc, 'Pure Cotton kurti in Navy Blue.', 'description');
  eq(got.rows, [['299', '299', '999', '10', 'KT01-M'], ['299', '299', '999', '10', 'KT01-L']], 'size rows: price, returns price, MRP, stock, SKU');
  eq(got.photos, [['front.jpg', 'image/jpeg', true], ['back.jpg', 'image/jpeg', true]], 'photos from the app, put in Meesho\'s photo box');
  eq(got.submitted, false, 'never submits');
  eq(/^Filled \d+ of \d+/.test(note1) && /2 photos/.test(note1), true, 'the panel says what it filled: ' + note1);
  eq(stat1 && stat1.state, 'filled', 'status kept by the app');
  eq(!!learned && learned.name === 'Kurti from Meesho' && learned.fields.length >= 5 && learned.sizes.length === 2, true, 'template saved from the form, kept by the app');
  eq(store.liststat.p1 && store.liststat.p1.state, 'done', 'Submitted, next: kept by the app');
  eq(after.fetch === before.fetch && /\[native code\]/.test(after.fetch), true, 'Meesho\'s page keeps its own fetch');
  eq([after.core, after.chrome], ['undefined', false], 'the filler\'s names stay out of Meesho\'s page');
  eq(after.keys.filter((k) => !['PBLensHost', '__pbApp', '__pbAutoListing', 'PBListPage'].includes(k)).length <= before.keys, true, 'no other names added to the page');
  eq(asked.includes('get') && asked.includes('set'), true, 'storage went through PBLensHost');
  console.log(`${fails ? 'FAILED' : 'OK'}: in-app Auto listing script`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
