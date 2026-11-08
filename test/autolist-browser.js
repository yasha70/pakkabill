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
    fields: [{ label: 'Fabric', value: 'Cotton' }, { label: 'Pattern', value: 'Woven Design' }, { label: 'Occasion', value: 'Festive, Wedding' }, { label: 'GST', value: '5' }, { label: 'Brand', value: 'Generic' }, { label: 'Sleeves', value: 'Long Sleeves' }, { label: 'Neck Type', value: 'Neck 33' }],
    sizes: [{ size: 'M', price: 299, mrp: 999, stock: 10 }, { size: 'L', price: 299, mrp: 999, stock: 10 }],
  };
  const prod = { name: 'Kurti', color: 'Navy Blue', sku: 'KT01' };
  const t0 = Date.now();
  const r = await page.evaluate(async ([tpl, prod]) => {
    const r = await window.PBListPage.fill(tpl, prod);
    return { ...r, missing: r.missing.map(m => m.label + (m.row ? ' (' + m.row + ')' : '') + ': ' + m.value) };
  }, [tpl, prod]);
  const ms = Date.now() - t0;
  // Read all drop-downs: every choice of every list, the long one too
  const form = await page.evaluate(async () => (await window.PBListPage.readAll()).map(d => [d.label, d.options.length]));
  const after = await page.evaluate(() => [document.querySelector('#fab .v').textContent, document.querySelector('#neck .v').textContent, document.querySelectorAll('.pop').length]);
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
    sleeve: document.querySelector('#slv b').textContent,
    neck: document.querySelector('#neck .v').textContent,
    rows: [...document.querySelectorAll('#sizes tbody tr')].map(tr => [...tr.querySelectorAll('input')].map(i => i.value)),
    popups: document.querySelectorAll('.pop').length,
    submitted: !!window.SUBMITTED,
  }));

  // Form 2: size buttons, XXL for 2XL, a card per size, one Returns Price box for all sizes
  const page2 = await browser.newPage();
  await page2.addInitScript(() => { window.chrome = { storage: { local: { get: (k, cb) => cb({}), set: (o, cb) => cb && cb() }, onChanged: { addListener() {} } } }; });
  await page2.goto('file://' + path.join(__dirname, 'autolist-form2.html'));
  await page2.addScriptTag({ path: path.join(__dirname, '../lens/listcore.js') });
  await page2.addScriptTag({ path: path.join(__dirname, '../lens/list.js') });
  const t2 = Date.now();
  const r2 = await page2.evaluate(async () => {
    const r = await window.PBListPage.fill({ id: 't2', fields: [], sizes: [{ size: '2XL', price: 350, rprice: 300, mrp: 1200, stock: 5 }, { size: 'M', price: 320, rprice: 300, mrp: 1100, stock: 7 }] }, { name: 'Top', sku: 'TP9' });
    return { ...r, missing: r.missing.map(m => m.label + (m.row ? ' (' + m.row + ')' : '')) };
  });
  const ms2 = Date.now() - t2;
  const got2 = await page2.evaluate(() => ({
    chips: [...document.querySelectorAll('.chip.selected')].map(c => c.textContent),
    rp: document.querySelector('[name=rp]').value,
    cards: Object.fromEntries([...document.querySelectorAll('.card')].map(c => [c.querySelector('h4').textContent, [...c.querySelectorAll('input')].map(i => i.value)])),
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
  eq(got.sleeve, 'Long Sleeves', 'list of plain boxes, found by its choices (label differs)');
  eq(got.neck, 'Neck 33', 'long list that draws rows as it scrolls');
  eq(got.rows, [['299', '299', '999', '10', 'KT01-M'], ['299', '299', '999', '10', 'KT01-L']], 'size rows that appear after Apply');
  eq(got.popups, 0, 'every list closed');
  const n = Object.fromEntries(form);
  eq([n['Fabric'], n['Pattern'], n['Occasion'], n['GST'], n['Neck'], n['Sleeve Styling (choose one)']], [4, 5, 4, 3, 40, 4], 'read all drop-downs: every choice (Pattern shows 5 until searched)');
  eq(after, ['Cotton', 'Neck 33', 0], 'reading the lists keeps the values and closes them');
  eq(got.submitted, false, 'never submits');
  eq(r.missing, [], 'nothing left');
  if (ms > 8000) { fails++; console.log(`FAIL  too slow: ${ms} ms`); }
  eq(got2.chips, ['M', 'XXL'], 'form 2: size buttons pressed, XXL for 2XL');
  eq(got2.rp, '300', 'form 2: one Returns Price box for all sizes');
  eq(got2.cards, { 'Size: M': ['320', '1100', '7', 'TP9-M'], 'Size: XXL': ['350', '1200', '5', 'TP9-2XL'] }, 'form 2: each size\'s card gets its own price, MRP, stock and SKU');
  eq(r2.missing, [], 'form 2: nothing left');
  if (ms2 > 6000) { fails++; console.log(`FAIL  form 2 too slow: ${ms2} ms`); }
  console.log(`${fails ? 'FAILED' : 'OK'}: filled ${r.filled} of ${r.total} in ${ms} ms; form 2 ${r2.filled} of ${r2.total} in ${ms2} ms`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
