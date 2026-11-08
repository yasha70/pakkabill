// Flipkart and Amazon in the P&L engine (pnl.html): their payment reports are read into the same
// payment rows as Meesho's, every row adds up to the marketplace's settlement, and money ties.
// Run: node test/marketplace-audit.js   (exits 1 on any failure)
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'pnl.html'), 'utf8');
const start = html.indexOf('/* Hisaab engine');
const mod = { exports: {} };
new Function('module', 'self', html.slice(start, html.indexOf('</script>', start)))(mod, undefined);
const E = mod.exports;

let fails = 0, checks = 0;
function ok(cond, what, detail) { checks++; if (!cond) { fails++; console.log('FAIL  ' + what + (detail ? '  ' + detail : '')); } }
function eq(a, b, what) { ok(a === b, what, `expected ${b}, got ${a}`); }
const P = (n) => Math.round(n * 100);
const r2 = (n) => Math.round(n * 100) / 100;
const cfgOf = (o) => Object.assign({}, E.DEFAULTS, o || {});
function run(books, opt) {
  opt = opt || {};
  const cfg = cfgOf(opt.cfg);
  const files = books.map((b, i) => E.ingest(b.name || 'file' + i + '.xlsx', 0, b.sheets, cfg));
  const M = E.merge(files, { pl: opt.pl });
  const IX = E.index(M, cfg, opt.costs || {}, {});
  const per = E.periodFor({ mode: 'all', basis: 'pay' }, M, IX);
  const R = E.compute(M, IX, cfg, [], per);
  return { files, M, IX, R };
}

/* ---------------------------------------------------------------- Flipkart */
const FK_HEAD = ['NEFT ID', 'NEFT Type', 'Date', 'Settlement Value (Rs.)', 'Order ID', 'Order item ID', 'Sale Amount (Rs.)', 'Total Offer Amount (Rs.)',
  'My share (Rs.)', 'Customer Add-ons Amount (Rs.)', 'Marketplace Fee (Rs.)', 'Taxes (Rs.)', 'Offer Adjustments (Rs.)', 'Protection Fund (Rs.)', 'Refund (Rs.)',
  'Tier', 'Commission Rate (%)', 'Commission (Rs.)', 'Fixed Fee  (Rs.)', 'Collection Fee (Rs.)', 'Pick And Pack Fee (Rs.)', 'Shipping Fee (Rs.)',
  'Reverse Shipping Fee (Rs.)', 'TCS (Rs.)', 'TDS (Rs.)', 'GST on MP Fees (Rs.)', 'Item GST Rate (%)', 'Dead Weight (kgs)', 'Chargeable Wt. Slab (In Kgs)',
  'Shipping Zone', 'Order Date', 'Dispatch Date', 'Seller SKU', 'Quantity', 'Return Type'];
const fkTruth = { F: 0, S: 0, DS: 0, R: 0, T: 0, D: 0, fees: 0, gstFees: 0, rows: 0 };
function fkRow(o) {
  const v = Object.assign({ sale: 0, offer: 0, share: 0, comm: 0, fixed: 0, coll: 0, pnp: 0, ship: 0, rev: 0, refund: 0, prot: 0, gst: 5, ret: '' }, o);
  const mp = r2(v.comm + v.fixed + v.coll + v.pnp + v.ship + v.rev);
  const gstOn = r2(mp * 0.18);
  const taxable = r2((v.sale + v.offer + v.share + v.refund) * 100 / (100 + v.gst));
  const tcs = r2(-taxable * 0.005), tds = r2(-(v.sale + v.offer + v.share + v.refund) * 0.001);
  const taxes = r2(gstOn + tcs + tds);
  const settle = r2(v.sale + v.offer + v.share + mp + taxes + v.prot + v.refund);
  fkTruth.F += P(settle); fkTruth.S += P(v.sale); fkTruth.DS += P(v.offer) + P(v.share); fkTruth.R += P(v.refund);
  fkTruth.T += P(tcs); fkTruth.D += P(tds); fkTruth.fees += P(mp); fkTruth.gstFees += P(gstOn); fkTruth.rows++;
  const row = {};
  Object.assign(row, {
    'NEFT ID': v.neft || 'CITIN2501234', 'NEFT Type': 'NEFT', 'Date': v.date, 'Settlement Value (Rs.)': settle, 'Order ID': v.oid, 'Order item ID': v.item,
    'Sale Amount (Rs.)': v.sale, 'Total Offer Amount (Rs.)': v.offer, 'My share (Rs.)': v.share, 'Customer Add-ons Amount (Rs.)': 0, 'Marketplace Fee (Rs.)': mp,
    'Taxes (Rs.)': taxes, 'Offer Adjustments (Rs.)': 0, 'Protection Fund (Rs.)': v.prot, 'Refund (Rs.)': v.refund, 'Tier': 'Silver', 'Commission Rate (%)': 8,
    'Commission (Rs.)': v.comm, 'Fixed Fee  (Rs.)': v.fixed, 'Collection Fee (Rs.)': v.coll, 'Pick And Pack Fee (Rs.)': v.pnp, 'Shipping Fee (Rs.)': v.ship,
    'Reverse Shipping Fee (Rs.)': v.rev, 'TCS (Rs.)': tcs, 'TDS (Rs.)': tds, 'GST on MP Fees (Rs.)': gstOn, 'Item GST Rate (%)': v.gst, 'Dead Weight (kgs)': 0.4,
    'Chargeable Wt. Slab (In Kgs)': '0.0-0.5', 'Shipping Zone': 'national', 'Order Date': v.od, 'Dispatch Date': v.od, 'Seller SKU': v.sku, 'Quantity': 1, 'Return Type': v.ret
  });
  return FK_HEAD.map((hd) => row[hd]);
}
const fkRows = [
  ['Bank Settlement', '', '', '', 'Order Details'], FK_HEAD,
  fkRow({ date: '2025-08-05', oid: 'OD330011223344556600', item: '330011223344556601', sku: 'KURTI-RED-M', od: '2025-07-28', sale: 499, offer: -50, share: 20, comm: -36, fixed: -12, coll: -9, ship: -58 }),
  fkRow({ date: '2025-08-05', oid: 'OD330011223344556700', item: '330011223344556701', sku: 'KURTI-BLU-L', od: '2025-07-29', sale: 649, comm: -52, fixed: -12, coll: -12, ship: -58 }),
  fkRow({ date: '2025-08-12', oid: 'OD330011223344556800', item: '330011223344556801', sku: 'KURTI-RED-M', od: '2025-08-02', sale: 499, comm: -40, fixed: -12, coll: -9, ship: -58, gst: 12 }),
  // the first order comes back: sale reversed, reverse shipping charged, commission given back
  fkRow({ date: '2025-08-19', oid: 'OD330011223344556600', item: '330011223344556601', sku: 'KURTI-RED-M', od: '2025-07-28', refund: -469, comm: 36, rev: -65, ret: 'customer_return' }),
  // a courier return (RTO) on the second order
  fkRow({ date: '2025-08-19', oid: 'OD330011223344556700', item: '330011223344556701', sku: 'KURTI-BLU-L', od: '2025-07-29', refund: -649, comm: 52, rev: -40, ret: 'courier_return' }),
  // a protection fund (SPF) claim paid on a damaged return
  fkRow({ date: '2025-08-26', oid: 'OD330011223344556600', item: '330011223344556601', sku: 'KURTI-RED-M', od: '2025-07-28', prot: 150 }),
  ['', '', 'Total', 999999]
];
const fkAds = [['Date', 'Campaign ID', 'Settlement Value (Rs.)', 'Description'], ['2025-08-05', 'C1', -236, 'Ads wallet top-up'], ['2025-08-19', 'C1', -118, 'Ads wallet top-up']];
const fkStorage = [['NEFT ID', 'Date', 'Settlement Value (Rs.)', 'Service Type'], ['N1', '2025-08-12', -59, 'Storage fee'], ['', 'Total', -59, '']];
const fkBook = { name: 'flipkart-settlement.xlsx', sheets: [{ name: 'Orders', rows: fkRows }, { name: 'Ads', rows: fkAds }, { name: 'Storage_Recall', rows: fkStorage }] };

{
  const { files, M, IX, R } = run([fkBook]);
  const f = files[0];
  eq(f.pl, 'flipkart', 'Flipkart: file is recognised as Flipkart');
  eq(f.pay.length, fkTruth.rows, 'Flipkart: every order row read, the totals row is not');
  eq(f.sheets.find((s) => s.name === 'Orders').matched, fkTruth.rows, 'Flipkart: every row adds up to Settlement Value');
  ok(f.pay.every((x) => x.pl === 'flipkart'), 'Flipkart: rows carry the platform');
  eq(R.K.F, fkTruth.F, 'Flipkart: settlement total');
  eq(R.K.S, fkTruth.S, 'Flipkart: gross sales');
  eq(R.K.DS, fkTruth.DS, 'Flipkart: offers you funded, after Flipkart\'s share');
  eq(R.K.R, fkTruth.R, 'Flipkart: refunds are returns');
  eq(R.K.T, fkTruth.T, 'Flipkart: TCS');
  eq(R.K.D, fkTruth.D, 'Flipkart: TDS');
  eq(R.K.O, 0, 'Flipkart: nothing unexplained');
  eq(R.K.CL, P(150), 'Flipkart: protection fund is a claim');
  eq(R.CH.fees.g, fkTruth.gstFees, 'Flipkart: GST on marketplace fees is input credit');
  eq(R.K.AD, P(-354), 'Flipkart: ads sheet is ads');
  eq(R.K.ADJ, P(-59), 'Flipkart: storage sheet is an account-level charge, without its totals row');
  eq(R.payout, fkTruth.F + P(-354) + P(-59), 'Flipkart: money received');
  ok(R.checks.bridge && R.checks.sku, 'Flipkart: profit ties to the money and to the SKUs');
  eq(IX.O['330011223344556601'].st, 'RETURN', 'Flipkart: customer return');
  eq(IX.O['330011223344556701'].st, 'RTO', 'Flipkart: courier return is RTO');
  eq(IX.O['330011223344556801'].st, '', 'Flipkart: a settled order has no return');
  eq(M.pay.find((x) => x.id === '330011223344556801').g, 12, 'Flipkart: GST rate from Item GST Rate');
  eq(E.brand('Money received from Meesho', M.pls), 'Money received from Flipkart', 'Flipkart: text says Flipkart');
  eq(E.brand('Paste it in the Meesho Supplier Panel support section.', M.pls), 'Paste it in the Flipkart Seller Hub support section.', 'Flipkart: seller panel name');
}

/* ---------------------------------------------------------------- Amazon */
const AZ_HEAD = ['date/time', 'settlement id', 'type', 'order id', 'sku', 'description', 'quantity', 'marketplace', 'account type', 'fulfillment', 'order city',
  'order state', 'order postal', 'product sales', 'shipping credits', 'gift wrap credits', 'promotional rebates', 'Total sales tax liable(GST before adjusting TCS)',
  'TCS-CGST', 'TCS-SGST', 'TCS-IGST', 'TDS (Section 194-O)', 'selling fees', 'fba fees', 'other transaction fees', 'other', 'total'];
function azBook(taxOnTop) {
  const T = { F: 0, S: 0, R: 0, T: 0, D: 0, fees: 0, ads: 0, adj: 0, orders: 0 };
  function row(o) {
    const v = Object.assign({ qty: 1, ps: 0, ship: 0, promo: 0, tax: 0, tcs: 0, tds: 0, sell: 0, fba: 0, oth: 0, other: 0 }, o);
    const sales = taxOnTop ? r2(v.ps - v.tax) : v.ps; // excl. GST when the tax is added on top
    const total = r2(sales + v.ship + v.promo + (taxOnTop ? v.tax : 0) + v.tcs + v.tds + v.sell + v.fba + v.oth + v.other);
    if (v.oid) {
      T.F += P(total); T.T += P(v.tcs); T.D += P(v.tds); T.fees += P(v.sell) + P(v.fba) + P(v.oth); T.orders++;
      const gross = P(sales) + P(v.ship) + (taxOnTop ? P(v.tax) : 0);
      if (gross > 0) T.S += gross; else T.R += gross;
    }
    const r = { 'date/time': v.dt, 'settlement id': '12345678901', 'type': v.type, 'order id': v.oid || '', 'sku': v.sku || '', 'description': v.desc || '', 'quantity': v.oid ? v.qty : '',
      'marketplace': 'amazon.in', 'account type': 'Standard Orders', 'fulfillment': 'Seller', 'order city': 'PUNE', 'order state': 'MAHARASHTRA', 'order postal': 411001,
      'product sales': sales, 'shipping credits': v.ship, 'gift wrap credits': 0, 'promotional rebates': v.promo, 'Total sales tax liable(GST before adjusting TCS)': v.tax,
      'TCS-CGST': 0, 'TCS-SGST': 0, 'TCS-IGST': v.tcs, 'TDS (Section 194-O)': v.tds, 'selling fees': v.sell, 'fba fees': v.fba, 'other transaction fees': v.oth, 'other': v.other, 'total': total };
    return AZ_HEAD.map((hd) => r[hd]);
  }
  const rows = [
    ['Includes Amazon Marketplace, Fulfillment by Amazon (FBA), and Amazon Webservices transactions'],
    ['All amounts in INR, unless specified'],
    AZ_HEAD,
    row({ dt: '1 Aug 2025 10:15:32 am UTC', type: 'Order', oid: '403-1234567-1234567', sku: 'MUG-01', desc: 'Coffee Mug', ps: 1050, tax: 50, tcs: -5, tds: -1, sell: -118, oth: -59 }),
    row({ dt: '2 Aug 2025 11:00:00 am UTC', type: 'Order', oid: '403-7654321-7654321', sku: 'MUG-02', desc: 'Tea Mug', qty: 2, ps: 1180, tax: 180, tcs: -5, tds: -1.18, sell: -141.6, oth: -59 }),
    row({ dt: '9 Aug 2025 9:00:00 am UTC', type: 'Refund', oid: '403-1234567-1234567', sku: 'MUG-01', desc: 'Coffee Mug', ps: -1050, tax: -50, tcs: 5, tds: 1, sell: 100 }),
    row({ dt: '10 Aug 2025 9:00:00 am UTC', type: 'Service Fees', desc: 'Cost of Advertising', other: -590 }),
    row({ dt: '11 Aug 2025 9:00:00 am UTC', type: 'Service Fees', desc: 'Subscription Fee', other: -499 }),
    row({ dt: '14 Aug 2025 9:00:00 am UTC', type: 'Transfer', desc: 'To account ending with: 123', other: -1500 })
  ];
  T.ads = P(-590); T.adj = P(-499);
  return { book: { name: 'amazon-transactions.csv', sheets: [{ name: 'Sheet1', rows }] }, T };
}
[false, true].forEach((onTop) => {
  const tag = 'Amazon (' + (onTop ? 'GST added to product sales' : 'product sales with GST') + '): ';
  const { book, T } = azBook(onTop);
  const { files, M, IX, R } = run([book]);
  eq(files[0].pl, 'amazon', tag + 'file is recognised as Amazon');
  eq(files[0].pay.length, T.orders, tag + 'order rows read; transfers and service fees are not orders');
  eq(files[0].sheets[0].matched, T.orders, tag + 'every row adds up to total');
  eq(R.K.F, T.F, tag + 'settlement total');
  eq(R.K.S, T.S, tag + 'gross sales');
  eq(R.K.R, T.R, tag + 'refund is a return');
  eq(R.K.T, T.T, tag + 'TCS');
  eq(R.K.D, T.D, tag + 'TDS');
  eq(R.K.O, 0, tag + 'nothing unexplained');
  eq(R.K.AD, T.ads, tag + 'advertising is ads');
  eq(R.K.ADJ, T.adj, tag + 'subscription is an account-level charge');
  ok(!M.adj.some((a) => /transfer/i.test(a.typ || '')), tag + 'bank transfer is not counted');
  eq(M.pay.find((x) => x.sku === 'MUG-01').g, 5, tag + 'GST 5% worked out from the tax');
  eq(M.pay.find((x) => x.sku === 'MUG-02').g, 18, tag + 'GST 18% worked out from the tax');
  eq(M.pay.find((x) => x.sku === 'MUG-02').pd, '2025-08-02', tag + 'date read from date/time');
  eq(IX.O['403-1234567-1234567 / MUG-01'].st, 'RETURN', tag + 'refunded order is a return');
  ok(R.checks.bridge && R.checks.sku, tag + 'profit ties to the money and to the SKUs');
  eq(E.brand('Total Meesho charges', M.pls), 'Total Amazon charges', tag + 'text says Amazon');
});

/* ---------------------------------------------------------------- Meesho + Flipkart + Amazon together */
{
  const D = E.demo();
  const books = [D.payBook, fkBook, azBook(false).book];
  const all = run(books);
  eq(all.M.pls.join(','), 'meesho,flipkart,amazon', 'Together: all three platforms found');
  ok(all.R.checks.bridge && all.R.checks.sku, 'Together: profit ties');
  const parts = ['meesho', 'flipkart', 'amazon'].map((pl) => run(books, { pl }));
  eq(parts[1].M.pls.join(','), 'flipkart', 'Together: Flipkart view has only Flipkart');
  eq(parts[1].M.allPls.length, 3, 'Together: the view still knows every platform');
  eq(parts.reduce((t, x) => t + x.R.payout, 0), all.R.payout, 'Together: the three views add up to all');
  eq(parts.reduce((t, x) => t + x.R.NS, 0), all.R.NS, 'Together: net sales add up');
  eq(parts[0].R.payout, run([D.payBook]).R.payout, 'Together: Meesho view equals Meesho alone');
  eq(E.brand('Money received from Meesho', all.M.pls), 'Money received from Meesho + Flipkart + Amazon', 'Together: text names all three');
  eq(E.brand('Money received from Meesho', ['meesho']), 'Money received from Meesho', 'Meesho alone: text unchanged');
}

/* ---------------------------------------------------------------- edge cases */
{
  // Amazon: an Easy Ship charge row without a SKU stays with the order; a refund that also reverses a promotion is a return
  const H = AZ_HEAD, mk = (o) => H.map((h) => (h in o ? o[h] : (/sales|credits|rebates|tax|tcs|tds|fees|other|total/i.test(h) ? 0 : '')));
  const rows = [H,
    mk({ 'date/time': '1 Aug 2025', type: 'Order', 'order id': '404-1111111-1111111', sku: 'A1', quantity: 1, 'product sales': 500, 'promotional rebates': -50, 'selling fees': -59, total: 391 }),
    mk({ 'date/time': '2 Aug 2025', type: 'Amazon Easy Ship Charges', 'order id': '404-1111111-1111111', 'other transaction fees': -70.8, total: -70.8 }),
    mk({ 'date/time': '1 Aug 2025', type: 'Order', 'order id': '404-2222222-2222222', sku: 'B1', quantity: 1, 'product sales': 300, total: 300 }),
    // only the refund of an order whose sale is in an older file
    mk({ 'date/time': '9 Aug 2025', type: 'Refund', 'order id': '404-3333333-3333333', sku: 'C1', quantity: 1, 'product sales': -500, 'promotional rebates': 50, 'selling fees': 40, total: -410 })];
  const { M, IX, R } = run([{ name: 'az.csv', sheets: [{ name: 'S', rows }] }]);
  const legs = M.pay.filter((x) => x.id.startsWith('404-1111111'));
  ok(legs.length === 2 && legs.every((x) => x.id === '404-1111111-1111111 / A1'), 'Amazon: Easy Ship charge joins its order and SKU');
  const c1 = IX.O['404-3333333-3333333 / C1'];
  ok(c1 && c1.sale < 0 && c1.ret >= 0, 'Amazon: refund with a promotion reversed is a return, not a sale');
  ok(R.checks.bridge && R.checks.sku, 'Amazon edge cases: profit ties');
  // accuracy counts only the marketplace on view
  const D = E.demo(), cfg = cfgOf();
  const files = [D.payBook, fkBook].map((b, i) => E.ingest('f' + i, 0, b.sheets, cfg));
  const Mf = E.merge(files, { pl: 'flipkart' }), IXf = E.index(Mf, cfg, {}, {}), per = E.periodFor({ mode: 'all', basis: 'pay' }, Mf, IXf);
  const Rf = E.compute(Mf, IXf, cfg, [], per), Hf = E.health(Mf);
  const acc = E.accuracy(files, Mf, IXf, Rf, Hf, cfg, '2025-09-01');
  const rowsCheck = (acc.list || acc.items || Object.values(acc).find(Array.isArray) || []).find((x) => x.k === 'rows');
  ok(rowsCheck && /6 of 6/.test(rowsCheck.d), 'Flipkart view: rows check counts only Flipkart rows', rowsCheck && rowsCheck.d);
}

console.log(fails ? `${fails} of ${checks} marketplace checks FAILED` : `${checks}/${checks} marketplace checks passed`);
process.exit(fails ? 1 : 0);
