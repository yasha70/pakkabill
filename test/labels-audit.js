// Checks of the label sorter engine (read from labels.html): reading the Product Details table on a
// Meesho label in different layouts, sizes, sorting, the pick list and the manifest check.
// Run: node test/labels-audit.js   (exits 1 on any failure)
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'labels.html'), 'utf8');
const start = html.indexOf('/* PakkaBill label engine');
const root = {};
new Function('window', html.slice(start, html.indexOf('</script>', start)))(root);
const L = root.PBL;

let fails = 0, checks = 0;
function ok(cond, what, detail) {
  checks++;
  if (!cond) { fails++; console.log('FAIL  ' + what + (detail ? '  ' + detail : '')); }
}
function eq(a, b, what) { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, what, `expected ${B}, got ${A}`); }

// A pdf.js-like text item at (x, y), font size z. Width from rough Helvetica metrics.
const W = (s, z) => [...s].reduce((t, c) => t + (c === ' ' ? 0.28 : /[A-Z]/.test(c) ? 0.68 : /\d/.test(c) ? 0.56 : 0.5), 0) * z;
const it = (str, x, y, z = 8) => ({ str, transform: [z, 0, 0, z, x, y], width: W(str, z) });
const read = (items) => L.parseLabel(L.lines(L.words(items)));

// the top half of a Meesho label: address, courier, AWB
function top(courier, awb, pay) {
  return [it('Customer Address', 28, 805, 9), it(pay || 'COD: Check the payable amount on the app', 230, 805), it('Ramesh Kumar', 28, 792), it('12 MG Road, Jaipur, Rajasthan, 302001', 28, 781),
    it('If undelivered, return to:', 28, 752), it('Kavya Fashions, Surat 395003', 28, 741), it(courier, 260, 760, 14), it('Pickup', 360, 760), it(awb, 270, 678, 10), it('Product Details', 28, 650, 9)];
}
const HEAD = [it('SKU', 28, 636), it('Size', 160, 636), it('Qty', 220, 636), it('Color', 255, 636), it('Order No.', 310, 636)];
const row = (y, sku, size, q, col, on) => [it(sku, 28, y), it(size, 160, y), it(String(q), 224, y), it(col, 255, y), it(on, 310, y)];
const INV = [it('TAX INVOICE', 250, 435, 11), it('Original For Recipient', 470, 435, 7), it('BILL TO / SHIP TO', 28, 415), it('Sold by : Kavya Fashions GSTIN - 24ABCDE1234F1Z5', 300, 415),
  it('Description', 28, 350), it('HSN', 79, 350), it('Qty', 102, 350), it('Total', 315, 350), it('KURTI-RED-01 - Women Kurti', 28, 338), it('6204', 143, 338), it('1', 168, 338)];

/* 1. the usual label */
{
  const r = read(top('Valmo', 'VL0081234567').concat(HEAD, row(622, 'KURTI-RED-01', 'XL', 1, 'Red', '260000000000000_1'), INV));
  ok(r.ok, 'plain label is read');
  eq(r.rows, [{ sku: 'KURTI-RED-01', size: 'XL', qty: 1, color: 'Red', order: '260000000000000_1' }], 'plain label: row');
  eq(r.courier, 'Valmo', 'plain label: courier'); eq(r.pay, 'COD', 'plain label: COD');
  eq(r.orders, ['260000000000000_1'], 'plain label: order number');
  eq(r.ids, ['VL0081234567'], 'plain label: AWB (not the GSTIN, PIN code or order number)');
  ok(r.cutY > 435 && r.cutY < 450, 'plain label: invoice starts at the TAX INVOICE line', String(r.cutY));
}
/* 1b. SKUs that start with the word SKU are values, not headings */
{
  const r = read(top('Valmo', 'VL0081234568').concat(HEAD, row(622, 'SKU-7', '2XL', 1, 'Red', '260000000000009_1'), row(608, 'SKU123', 'Size-M', 1, 'Red', '260000000000009_1'), INV));
  eq(r.rows.map((x) => [x.sku, x.size]), [['SKU-7', '2XL'], ['SKU123', 'Size-M']], 'SKU-7 and SKU123 are read as SKUs');
}
/* 2. headings centred over their columns, cells on the left (how HTML tables print) */
{
  const C = (s, l, r) => it(s, (l + r) / 2 - W(s, 8) / 2, 636);
  const head = [C('SKU', 28, 155), C('Size', 155, 215), C('Qty', 215, 250), C('Color', 250, 305), C('Order No.', 305, 400)];
  const r = read(top('Delhivery', '1490000000001', 'Prepaid: Do not collect cash').concat(head, row(622, 'SAREE-12', 'Free Size', 2, 'Blue', '260000000007919_1'), INV));
  eq(r.rows, [{ sku: 'SAREE-12', size: 'Free Size', qty: 2, color: 'Blue', order: '260000000007919_1' }], 'centred headings: row');
  eq([r.courier, r.pay], ['Delhivery', 'Prepaid'], 'centred headings: courier and prepaid');
}
/* 3. a long SKU that wraps onto a second line, and an order with two products */
{
  const items = top('Xpress Bees', '14900000000099').concat(HEAD, row(622, 'KURTI-COTTON-', 'M', 1, 'Red', '260000000000001_1'), [it('PRINTED-02', 28, 612)],
    row(598, 'BLOUSE-7', '34', 1, 'Gold', '260000000000001_1'), INV);
  const r = read(items);
  eq(r.rows.map((x) => x.sku), ['KURTI-COTTON-PRINTED-02', 'BLOUSE-7'], 'wrapped SKU is joined, second product is its own row');
  ok(L.isMixed(r), 'two products: marked as mixed');
  eq(r.courier, 'Xpress Bees', 'courier with a space in the name');
}
/* 4. header and cells in one run of text each */
{
  const r = read(top('Shadowfax', 'SF123456789XB').concat([it('SKU                Size     Qty   Color    Order No.', 28, 636)], [it('KURTI-RED-2        M        1     Red      260000000008019_1', 28, 622)], INV));
  ok(r.ok, 'one-run table is read');
  eq(r.rows.length && [r.rows[0].sku, r.rows[0].size, r.rows[0].qty], ['KURTI-RED-2', 'M', 1], 'one-run table: SKU, size, qty');
}
/* 5. pages that are not labels */
{
  eq(read([]).why, 'image', 'page without text: picture');
  const r = read(top('Valmo', 'VL0081234567').concat(INV));
  eq([r.ok, r.why], [false, 'table'], 'page with text but no SKU table');
  const inv = read(INV.concat([it('Purchase Order No.', 28, 390), it('260000000000000', 28, 378)]));
  ok(!inv.ok, 'invoice table (Description, HSN, Qty) is not taken for the label table');
  const kv = read([it('SKU: TSHIRT-9', 28, 600), it('Size: XXL', 28, 588), it('Qty: 3', 28, 576), it('Order No: 270000000000005_1', 28, 564)]);
  eq(kv.ok && [kv.rows[0].sku, kv.rows[0].size, kv.rows[0].qty, kv.rows[0].order], ['TSHIRT-9', 'XXL', 3, '270000000000005_1'], 'labels written as "SKU: ..." lines');
}

/* 6. sizes */
eq(['2XL', '3xl', 'xxxxl', 'Free size', 'free', 'FS', 'Small', 'medium', 'NA', ' xl ', '1XL', '34', '5-6 Years'].map(L.canonSize),
  ['XXL', 'XXXL', '4XL', 'FREE SIZE', 'FREE SIZE', 'FREE SIZE', 'S', 'M', '', 'XL', 'XL', '34', '5-6 YEARS'], 'sizes are written one way');
eq(['XL', 'S', 'Free Size', 'M', '2XL', 'XS', '34', '28', '30', 'L', '', '4XL', '3XL'].sort(L.sizeCmp),
  ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '28', '30', '34', 'Free Size', ''], 'sizes in wearing order, numbers by value, free size and blank last');
eq(['SKU-10', 'sku-2', 'SKU-1', 'ABC'].sort(L.skuCmp), ['ABC', 'SKU-1', 'sku-2', 'SKU-10'], 'SKUs: numbers by value, capitals ignored');

/* 7. sorting */
const lab = (i, courier, rows) => ({ i, lab: { courier, rows: rows.map(([sku, size, qty]) => ({ sku, size, qty: qty || 1, color: '', order: '' })), orders: ['26000000000000' + i + '_1'], ids: ['AWB000000' + i] } });
const LABS = [lab(0, 'Valmo', [['K-1', 'XL']]), lab(1, 'Delhivery', [['S-12', 'Free Size']]), lab(2, 'Valmo', [['K-1', 'M']]), lab(3, 'Valmo', [['B-7', '34']]),
  lab(4, 'Delhivery', [['K-1', 'L', 2]]), lab(5, 'Valmo', [['K-1', 'M'], ['S-12', 'Free Size']]), lab(6, 'Valmo', [['k-1', 'S']]), lab(7, 'Valmo', [['K-1', 'M']]), lab(8, '', [['A-1', 'M']])];
const ids = (a) => a.map((x) => x.i);
eq(ids(L.sortLabels(LABS, { by: 'sku', courier: false, mixedLast: false })), [8, 3, 6, 2, 7, 5, 4, 0, 1], 'SKU then size; same SKU+size keeps file order, single product before two');
eq(ids(L.sortLabels(LABS, { by: 'sku', courier: false, mixedLast: true })), [8, 3, 6, 2, 7, 4, 0, 1, 5], 'orders with two products at the end');
eq(ids(L.sortLabels(LABS, { by: 'sku', courier: true, mixedLast: true })), [3, 6, 2, 7, 0, 5, 4, 1, 8], 'courier with most labels first, unknown courier last');
eq(ids(L.sortLabels(LABS, { by: 'size', courier: false, mixedLast: true })), [6, 8, 2, 7, 4, 0, 3, 1, 5], 'size then SKU');
eq(L.sortLabels(LABS, { by: 'sku', courier: true, mixedLast: true }).length, LABS.length, 'no label lost or doubled');

/* 8. pick list */
{
  const pl = L.pickList(LABS, 'sku');
  eq(pl.reduce((s, r) => s + r.pcs, 0), LABS.reduce((s, x) => s + x.lab.rows.reduce((t, r) => t + r.qty, 0), 0), 'pick list pieces = pieces on all labels');
  eq(pl.map((r) => [r.sku, r.size, r.pcs, r.orders]), [['A-1', 'M', 1, 1], ['B-7', '34', 1, 1], ['K-1', 'S', 1, 1], ['K-1', 'M', 3, 3], ['K-1', 'L', 2, 1], ['K-1', 'XL', 1, 1], ['S-12', 'Free Size', 2, 2]],
    'pick list: SKU x size, one spelling per SKU');
}

/* 9. manifest */
{
  const lines = (rows) => [L.lines(L.words([it('MANIFEST', 240, 800, 16), it('Total shipments: ' + rows.length, 40, 775, 9)].concat(rows.map((r, i) => it((i + 1) + '      ' + r.join('      '), 40, 735 - i * 16, 9)))))];
  const man = L.parseManifest(lines([['260000000000000_1', 'AWB0000000'], ['260000000000002_1', 'AWB0000002'], ['AWB0000003'], ['269999999999999_1', 'VL0099999999']]));
  eq([man.rows.length, man.total], [4, 4], 'manifest: rows and total');
  const c = L.checkManifest(LABS.slice(0, 5), man);
  eq([ids(c.on), ids(c.off), c.extra.map((r) => r.ids[0])], [[0, 2, 3], [1, 4], ['269999999999999_1']], 'manifest: found by order number or AWB, missing both ways');
  const base = L.parseManifest(lines([['260000000000001'], ['260000000000004']]));
  eq(ids(L.checkManifest(LABS.slice(0, 5), base).on), [1, 4], 'manifest with order numbers without the _1');
}

console.log(`${checks - fails}/${checks} label checks passed`);
if (fails) process.exit(1);
