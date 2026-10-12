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

/* 10. Meesho's Supplier Manifest: picklist pages and courier pages, laid out as in the real PDF */
{
  const hdr = (y) => [it('Supplier Name : KAVYA_COLLECTION7', 36, 791, 12), it('Date : 12 Oct, 2026', 36, 773, 12)];
  const pickPage = [it('Picklist', 36, 812, 18)].concat(hdr(), [it('SKU', 133, 748), it('Color', 291, 748), it('Size', 403, 748), it('Total Quantity', 484, 748)],
    [['PGWM(GREY)0005', 'Green', '32', 4, 722], ['PBYW(GREY)', 'White', 'Free-Size: 30-34', 1, 689], ['All color 8', 'Black', 'XXL', 1, 656], ['PGRBW005', 'Pink', '38 Alterable', 2, 623]]
      .flatMap(([sku, col, sz, q, y]) => [it(sku, 141 - W(sku, 10) / 2, y, 10), it(col, 301 - W(col, 10) / 2, y, 10), it(sz, 411 - W(sz, 10) / 2, y, 10), it(String(q), 511 - W(String(q), 10) / 2, y, 10)]), [it('(1)', 410, 40, 8)]);
  // a row: serial, first half of the sub order number, SKU, qty and size on one line; AWB below; the rest of the order number (and a long size) below that
  const crow = ([n, o1, awb, o2, sku, sz, sz2], y) => [it(String(n), 54, y, 10), it(o1, 82, y, 10), it(sku, 321 - W(sku, 10) / 2, y, 10), it('1', 400, y, 10), it(sz, 459 - W(sz, 10) / 2, y, 10),
    it(awb, 159, y - 8, 10), it(o2, 87, y - 15, 10)].concat(sz2 ? [it(sz2, 446, y - 15, 10)] : []);
  const courPage = (courier, rows) => [it('Courier : ' + courier, 36, 812, 18)].concat(hdr(), [it('S. No.', 45, 748), it('Sub Order No.', 85, 748), it('AWB', 194, 748), it('SKU', 313, 748), it('Qty.', 395, 748), it('Size', 451, 748), it('Packed', 513, 748)],
    rows.flatMap((r, i) => crow(r, 722 - i * 48)), [it('(17)', 410, 40, 8)]);
  const p1 = L.lines(L.words(pickPage));
  const p2 = L.lines(L.words(courPage('Delhivery', [[1, '34091807010', '1490842450481893', '8403712_1', 'PGWM(GREY)0005', '32'], [2, '34079173127', '1490842446612783', '4056832_1', 'PBYW(GREY)', 'Free-Size:', '30-34']])));
  const p3 = L.lines(L.words(courPage('Valmo', [[1, '34083848694', 'VL0085719638487', '7906240_1', 'PGWM(GREY)0005', '32'], [2, '34073169876', 'VL0085719638490', '2220416_1', 'PGWM(GREY)0005', '32'],
    [3, '34045846179', 'VL0085719638491', '0716608_1', 'PGWM(GREY)0005', '32'], [4, '34088015734', 'VL0085719638492', '9757632_1', 'All color 8', 'XXL'], [5, '34089698847', 'VL0085719638494', '7965568_1', 'PGRBW005', '38 Alterable'], [6, '34089698848', 'VL0085719638495', '7965569_1', 'PGRBW005', '38 Alterable']])));
  eq([L.pageKind(p1), L.pageKind(p2), L.pageKind(p3)], ['pick', 'courier', 'courier'], 'manifest pages are told apart from labels');
  ok(!read(pickPage).ok || L.pageKind(p1), 'picklist page is not taken for a label');
  const pg = L.manifestPage(p2);
  eq(pg.rows.map((r) => [r.n, r.order, r.awb, r.sku, r.size, r.qty, r.courier]), [[1, '340918070108403712_1', '1490842450481893', 'PGWM(GREY)0005', '32', 1, 'Delhivery'],
    [2, '340791731274056832_1', '1490842446612783', 'PBYW(GREY)', 'Free-Size: 30-34', 1, 'Delhivery']], 'courier page: order number joined over two lines, AWB, size over two lines');
  const man = L.parseManifest([p1, p2, p3]);
  eq([man.rows.length, man.pick.length, man.supplier, man.date, man.couriers], [8, 4, 'KAVYA_COLLECTION7', '12 Oct, 2026', ['Delhivery', 'Valmo']], 'manifest: rows, picklist, supplier, date, couriers');
  eq(L.pickCheck(man), { same: true, diffs: [], pieces: 8, pickPieces: 8 }, 'courier rows add up to the picklist');
  const short = L.parseManifest([p1, p2]);
  eq(L.pickCheck(short).diffs.map((d) => [d.sku, d.rows, d.pick]), [['PGWM(GREY)0005', 1, 4], ['ALL COLOR 8', 0, 1], ['PGRBW005', 0, 2]], 'missing courier rows show as differences from the picklist');
  // labels matched by the full order number or the AWB
  const labs = [{ i: 0, lab: { courier: 'Delhivery', rows: [{ sku: 'PGWM(GREY)0005', size: '32', qty: 1 }], orders: ['340918070108403712_1'], ids: [] } },
    { i: 1, lab: { courier: 'Valmo', rows: [{ sku: 'X', size: '32', qty: 1 }], orders: [], ids: ['VL0085719638490'] } }, { i: 2, lab: { courier: 'Valmo', rows: [{ sku: 'Y', size: 'M', qty: 1 }], orders: ['999999999999999999_1'], ids: [] } }];
  const c = L.checkManifest(labs, man);
  eq([ids(c.on), ids(c.off), c.extra.length, c.extra[0].sku], [[0, 1], [2], 6, 'PBYW(GREY)'], 'labels against the manifest: found, missing, and parcels with no label');
}

/* 11. blouse sizes and the packing chart */
eq(['26', '28', '30', '31', '32', '34', '35', '36', '38', '40', 'L', '2XL', 'Free-Size: 26-30', 'Free-Size: 30-34', 'Free-Size: 36-40', '38 Alterable', '36 inch', '24', '42', 'M', 'Free Size', '5-6 Years'].map(L.blouseSize),
  ['L', 'L', 'L', 'XL', 'XL', 'XL', 'XXL', 'XXL', 'XXL', 'XXL', 'L', 'XXL', 'L', 'XL', 'XXL', 'XXL', 'XXL', null, null, null, null, null], 'blouse sizes: 26-30 L, 32-34 XL, 36-40 XXL, ranges by their middle');
{
  const items = [['PGRBW005', '30', 2], ['PGRBW005', '32', 1], ['PGRBW005', '38 Alterable', 1], ['RBGYP0005', 'XXL', 3], ['RBGYP0005', 'Free-Size: 30-34', 1], ['pgrbw005', '40', 1], ['ZETA', '42', 1], ['ABC', '26', 1]]
    .map(([sku, size, qty]) => ({ sku, size, qty }));
  ok(L.looksBlouse(items), 'inch sizes: looks like blouses');
  ok(!L.looksBlouse([{ sku: 'K', size: 'M', qty: 3 }, { sku: 'K', size: '32', qty: 1 }]), 'letter sizes: not blouses');
  const ch = L.packChart(items, { blouse: true });
  eq(ch.cols, ['L', 'XL', 'XXL', '42'], 'blouse chart: L, XL, XXL, then sizes outside 26-40 as they are');
  eq(ch.rows.map((r) => [r.sku, r.cells.L || 0, r.cells.XL || 0, r.cells.XXL || 0, r.total]), [['PGRBW005', 2, 1, 2, 5], ['RBGYP0005', 0, 1, 3, 4], ['ABC', 1, 0, 0, 1], ['ZETA', 0, 0, 0, 1]], 'blouse chart: rows, most pieces first, one spelling per SKU');
  eq([ch.totals.L, ch.totals.XL, ch.totals.XXL, ch.totals['42'], ch.grand], [3, 2, 5, 1, 11], 'blouse chart: totals add up');
  eq(ch.mapped.map((m) => m.from + '>' + m.to), ['26>L', '30>L', 'Free-Size: 30-34>XL', '32>XL', '38 Alterable>XXL', '40>XXL'], 'blouse chart: how each size was counted');
  eq(L.packChart(items, { blouse: true, sort: 'az' }).rows.map((r) => r.sku), ['ABC', 'PGRBW005', 'RBGYP0005', 'ZETA'], 'chart A to Z');
  eq(L.packChart([{ sku: 'K', size: 'M', qty: 2 }, { sku: 'K', size: '2XL', qty: 1 }], { blouse: true }).cols, ['M', 'L', 'XL', 'XXL'], 'L, XL and XXL columns are always there for blouses');
  eq(L.packChart(items, { blouse: false }).cols, ['XXL', '26', '30', 'FREE-SIZE: 30-34', '32', '38 ALTERABLE', '40', '42'], 'without blouse sizes every size is its own column');
}

console.log(`${checks - fails}/${checks} label checks passed`);
if (fails) process.exit(1);
