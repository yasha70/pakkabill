// Fills test/autolist-form.html (drop-downs built several ways, like Meesho's) with lens/list.js in
// Chromium, and checks every field and the time taken. Needs Playwright.
// Run: node test/autolist-browser.js   (exits 1 on any failure)
'use strict';
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addInitScript(() => {
    const store = {};
    window.chrome = { storage: { local: { get: (k, cb) => cb({}), set: (o, cb) => { Object.assign(store, o); cb && cb(); } }, onChanged: { addListener() {} } } };
  });
  await page.goto('file://' + path.join(__dirname, 'autolist-form.html'));
  await page.addScriptTag({ path: path.join(__dirname, '../lens/listcore.js') });
  await page.addScriptTag({ path: path.join(__dirname, '../lens/list.js') });
  const tpl = {
    id: 't1', title: '{color} {fabric} Kurti', desc: 'Pure {fabric} kurti in {color}.',
    fields: [{ label: 'Fabric', value: 'Cotton' }, { label: 'Pattern', value: 'Woven Design' }, { label: 'Occasion', value: 'Festive, Wedding' }, { label: 'GST', value: '5' }, { label: 'Brand', value: 'Generic' }],
    sizes: [{ size: 'M', price: 299, mrp: 999, stock: 10 }, { size: 'L', price: 299, mrp: 999, stock: 10 }],
  };
  const prod = { name: 'Kurti', color: 'Navy Blue', sku: 'KT01' };
  const t0 = Date.now();
  const r = await page.evaluate(async ([tpl, prod]) => {
    const r = await window.PBListPage.fill(tpl, prod);
    return { ...r, missing: r.missing.map(m => m.label + (m.row ? ' (' + m.row + ')' : '') + ': ' + m.value) };
  }, [tpl, prod]);
  const ms = Date.now() - t0;
  const got = await page.evaluate(() => ({
    name: document.querySelector('#pn').value,
    fabric: document.querySelector('#fab .v').textContent,
    pattern: document.querySelector('#pat').value,
    occasion: document.querySelector('#occ .v').textContent,
    size: document.querySelector('#size .v').textContent,
    gst: document.querySelector('#gst').value,
    color: document.querySelector('#col').value,
    brand: document.querySelector('#br').value,
    desc: document.querySelector('#desc').value,
    rows: [...document.querySelectorAll('#sizes tbody tr')].map(tr => [...tr.querySelectorAll('input')].map(i => i.value)),
    popups: document.querySelectorAll('.pop').length,
    submitted: !!window.SUBMITTED,
  }));
  await browser.close();

  let fails = 0;
  const eq = (a, b, what) => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) { fails++; console.log(`FAIL  ${what}  expected ${B}, got ${A}`); } };
  eq(got.name, 'Navy Blue Cotton Kurti', 'text box');
  eq(got.fabric, 'Cotton', 'drop-down that opens on pointerdown only');
  eq(got.pattern, 'Woven Design', 'read-only box with a search box in its list');
  eq(got.occasion, 'Festive, Wedding', 'list that toggles on click, two choices');
  eq(got.size, 'M, L', 'size picker with tick boxes and Apply');
  eq(got.gst, '5', 'native select');
  eq(got.color, 'Navy Blue', 'search list');
  eq(got.brand, 'Generic', 'text box that only looks like a search');
  eq(got.desc, 'Pure Cotton kurti in Navy Blue.', 'description');
  eq(got.rows, [['299', '299', '999', '10', 'KT01-M'], ['299', '299', '999', '10', 'KT01-L']], 'size rows that appear after Apply');
  eq(got.popups, 0, 'every list closed');
  eq(got.submitted, false, 'never submits');
  eq(r.missing, [], 'nothing left');
  if (ms > 8000) { fails++; console.log(`FAIL  too slow: ${ms} ms`); }
  console.log(`${fails ? 'FAILED' : 'OK'}: filled ${r.filled} of ${r.total} in ${ms} ms`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
