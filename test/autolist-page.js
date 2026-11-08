// Drives PakkaBill's Auto listing page in Chromium: a template with a written name, the seller's
// details, "+ Colours", and what is sent to the extension. Needs Playwright.
// Run: node test/autolist-page.js   (exits 1 on any failure)
'use strict';
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const page = await b.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('https://pb.test/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
  await page.goto('https://pb.test/');
  await page.evaluate(() => { document.body.innerHTML = '<div id="m"></div>'; localStorage.clear(); });
  await page.addScriptTag({ path: path.join(__dirname, '../lens/listcore.js') });
  await page.addScriptTag({ path: path.join(__dirname, '../autolist.js') });
  // pretend the extension is there, and catch what is sent
  await page.evaluate(() => { window.SENT = []; window.addEventListener('message', e => { if (e.data.type === 'pb-list-hello') window.postMessage({ type: 'pb-list-state', version: '9.9.9', templates: [], status: {} }, '*'); if (e.data.type === 'pb-list-queue') window.SENT.push(e.data); }); window.pbAutoListMount(document.getElementById('m')); });
  await page.waitForTimeout(300);
  await page.selectOption('[data-start]', 'kurti');
  await page.click('[data-writecopy]');
  const title = await page.inputValue('[data-t=title]');
  await page.fill('[data-sz="0"][data-k=price]', '299'); await page.fill('[data-sz="0"][data-k=stock]', '5');
  await page.click('[data-samesz]');
  await page.click('[data-savetpl]');
  await page.fill('[data-sd=maker]', 'Rangrez, 14 Textile Market, Surat 395002');
  await page.fill('[data-sd=packer]', 'Rangrez, Surat');
  await page.click('h1');
  // a product with a photo
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.setInputFiles('[data-files]', { name: 'Kurti.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('[data-variants]');
  await page.fill('[data-pf=sku]', 'KT01');
  await page.press('[data-pf=sku]', 'Tab');
  await page.waitForTimeout(100);
  page.once('dialog', d => d.accept('Red, Navy Blue'));
  await page.click('[data-variants]');
  const prods = await page.$$eval('.pal-p__title', x => x.map(e => e.textContent.trim()));
  await page.click('[data-send]');
  await page.waitForTimeout(300);
  const sent = await page.evaluate(() => window.SENT[0].items.map(i => [i.prod.color, i.prod.sku, i.tpl.fields.find(f => /Manufacturer/.test(f.label)).value, i.tpl.title]));
  await b.close();
  const want = { title: '{color} Kurti', prods: ['Red Kurti', 'Navy Blue Kurti'], sent: [['Red', 'KT01-RED', 'Rangrez, 14 Textile Market, Surat 395002', '{color} Kurti'], ['Navy Blue', 'KT01-NAVYBLUE', 'Rangrez, 14 Textile Market, Surat 395002', '{color} Kurti']], errs: [] };
  const got = JSON.stringify({ title, prods, sent, errs }), ok = got === JSON.stringify(want);
  console.log(ok ? 'OK: Auto listing page' : 'FAILED: ' + got);
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
