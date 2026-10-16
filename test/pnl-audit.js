// Accuracy audit of the Meesho P&L engine (the same code the website and the app run, read from
// pnl.html). Run: node test/pnl-audit.js   (exits 1 on any failure)
//
// 1. Oracle: money worked out straight from the raw Meesho rows (Final Settlement, sale, return,
//    TCS, TDS, ads, referral, compensation) must equal the engine's numbers, however the file is
//    written: text numbers, ₹ and commas, brackets for minus, charges as positive numbers, other
//    date formats, columns moved, unknown numeric columns, title rows, a totals row, the same rows
//    in two overlapping files or uploaded twice.
// 2. Ledgers worked out by hand: cost of goods, returns back in stock, RTO and lost parcels,
//    exchanges, packaging, GST bill on purchases, marks, quantity, output GST.
// 3. Identities for every setting and period: profit ties to the money received, SKU profits add
//    up to the total, months add up to the whole, both date bases cover the same money,
//    reconcile covers every payment row.
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'pnl.html'), 'utf8');
const start = html.indexOf('/* Hisaab engine');
const mod = { exports: {} };
new Function('module', 'self', html.slice(start, html.indexOf('</script>', start)))(mod, undefined);
const E = mod.exports;

let fails = 0, checks = 0;
function ok(cond, what, detail) {
  checks++;
  if (!cond) { fails++; console.log('FAIL  ' + what + (detail ? '  ' + detail : '')); }
}
function eq(a, b, what) { ok(a === b, what, `expected ${b}, got ${a}`); }
const cfgOf = (o) => Object.assign({}, E.DEFAULTS, o || {});

/** The whole report for these sheets, like the website does it. */
function run(books, opt) {
  opt = opt || {};
  const cfg = cfgOf(opt.cfg);
  const files = books.map((b, i) => E.ingest(b.name || 'file' + i + '.xlsx', 0, b.sheets, cfg));
  const M = E.merge(files);
  const IX = E.index(M, cfg, opt.costs || {}, opt.marks || {});
  const per = E.periodFor(opt.sel || { mode: 'all', basis: 'pay' }, M, IX);
  const R = E.compute(M, IX, cfg, opt.expenses || [], per);
  return { files, M, IX, per, R, cfg };
}

/* ---------------------------------------------------------------- 1. oracle */

const D = E.demo();
const PAY = D.payBook.sheets.find((s) => s.name === 'Order Payments').rows;
const HEAD = PAY[0];
const col = (n) => HEAD.indexOf(n);
const num = (v) => (v === '' || v == null ? 0 : Math.round(parseFloat(v) * 100));

/** Money straight from Meesho's own columns (no costs, no packaging, no expenses). */
function oracle(cfg) {
  cfg = cfgOf(cfg);
  const REGD = !!cfg.gstReg, claim = cfg.taxCredits !== 'expense';
  const incl = HEAD.filter((h) => /incl|inc gst/i.test(h) && !/sale|listing/i.test(h));
  const gstOn = HEAD.filter((h) => /^gst on /i.test(h));
  let F = 0, S = 0, R = 0, T = 0, Dd = 0, CR = 0, CHG = 0, OUT = 0, legs = 0;
  for (const r of PAY.slice(2)) {
    legs++;
    const f = num(r[col('Final Settlement Amount')]), s = num(r[col('Total Sale Amount (Incl. Shipping & GST)')]), rt = num(r[col('Total Sale Return Amount (Incl. Shipping & GST)')]);
    F += f; S += s; R += rt;
    T += num(r[col('TCS')]); Dd += num(r[col('TDS')]);
    CR += num(r[col('Compensation')]) + num(r[col('Claims')]) + num(r[col('Recovery')]);
    if (REGD) {
      for (const h of incl) CHG += Math.round(num(r[col(h)]) * 18 / 118);
      for (const h of gstOn) CHG += num(r[col(h)]);
      const g = +r[col('Product GST %')] || cfg.defaultGst;
      OUT += Math.round((s + rt) * g / (100 + g));
    }
  }
  const ads = D.payBook.sheets.find((s) => s.name === 'Ads Cost').rows.slice(2);
  let AD = 0, ADG = 0;
  for (const a of ads) { AD += num(a[7]); if (REGD) ADG -= num(a[6]); }
  const REF = D.payBook.sheets.find((s) => s.name === 'Referral Payments').rows.slice(2).reduce((t, r) => t + num(r[2]), 0);
  const ADJ = D.payBook.sheets.find((s) => /compensation/i.test(s.name)).rows.slice(2).reduce((t, r) => t + num(r[3]), 0);
  // Meesho charges are what is left of Final Settlement after sales, returns, taxes and credits
  const MC = F - S - R - T - Dd - CR - CHG;
  const NS = S + R, NR = NS - OUT, ITC = -(CHG + ADG);
  let NP = NR + MC + (claim ? 0 : T + Dd) + CR + ADJ + REF + (AD - ADG);
  const UNU = REGD ? Math.max(0, ITC - OUT) : 0;
  const tcsLoss = !claim ? 0 : REGD ? Math.max(0, -T - Math.max(0, OUT - ITC)) : -T;
  NP -= UNU + tcsLoss;
  return { NP, NS, OUT, payout: F + AD + REF + ADJ, F, T, D: Dd, legs, MC };
}

/* ways the same Meesho data can arrive */
const clone = (rows) => rows.map((r) => r.slice());
const isMoney = (h) => /amount|charge|fee|premium|commission|tcs|tds|compensation|claims|recovery|gst on|waivers|settlement/i.test(h) && !/reason|percentage|rate|listing/i.test(h);
function book(payRows, name) {
  const sheets = D.payBook.sheets.map((s) => (s.name === 'Order Payments' ? { name: s.name, rows: payRows } : s));
  return { name: name || D.payBook.name, sheets };
}
function textNumbers(rows) {
  const out = clone(rows);
  for (const r of out.slice(2)) r.forEach((v, j) => {
    if (!isMoney(HEAD[j]) || v === '') return;
    const n = parseFloat(v);
    if (n === 0 && j % 3 === 0) { r[j] = ''; return; }
    const s = Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    r[j] = n < 0 ? (j % 2 ? '(' + s + ')' : '-₹' + s) : (j % 2 ? '₹' + s : s);
  });
  return out;
}
function positiveCharges(rows) {
  // some exports show deductions as positive numbers (the whole column turned round);
  // Final Settlement is still the same
  const out = clone(rows);
  const flip = HEAD.map((h, j) => isMoney(h) && !/final|^total sale amount|claims|compensation$/i.test(h));
  for (const r of out.slice(2)) r.forEach((v, j) => { if (flip[j] && v !== '' && parseFloat(v) !== 0) r[j] = String(-parseFloat(v)); });
  return out;
}
function dates(rows, fmt) {
  const out = clone(rows);
  const dc = HEAD.map((h, j) => (/date/i.test(h) ? j : -1)).filter((j) => j >= 0);
  for (const r of out.slice(2)) for (const j of dc) {
    const v = r[j]; if (!/^\d{4}-\d\d-\d\d$/.test(v)) continue;
    const [y, m, d] = v.split('-');
    r[j] = fmt === 'dmy' ? `${d}-${m}-${y}` : fmt === 'slash' ? `${d}/${m}/${y}` : fmt === 'serial' ? (Date.UTC(+y, m - 1, +d) / 864e5 + 25569) : fmt === 'time' ? `${v} 00:00:00` : `${+d} ${'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[m - 1]} ${y}`;
  }
  return out;
}
function shuffleColumns(rows) {
  // columns in another order, plus unknown columns: text, an HSN code, and a numeric weight
  const order = HEAD.map((_, j) => j).sort((a, b) => ((a * 7919) % 31) - ((b * 7919) % 31));
  return rows.map((r, i) => {
    const moved = order.map((j) => r[j]);
    if (i === 0) return moved.concat(['Courier Partner', 'HSN Code', 'Product Weight (gms)']);
    if (i === 1) return moved.concat(['Courier', 'HSN', 'Weight']);
    return moved.concat(['Delhivery', '6109', String(150 + (i % 7) * 50)]);
  });
}
function titleAndTotals(rows) {
  const tot = HEAD.map((h, j) => (isMoney(h) ? String(rows.slice(2).reduce((t, r) => t + (parseFloat(r[j]) || 0), 0).toFixed(2)) : ''));
  tot[0] = 'Total';
  const out = [['Payment report'], ['From 2026-08-01 to 2026-09-25'], []].concat(clone(rows));
  out.splice(40, 0, []); // a blank row in the middle
  return out.concat([[], tot]);
}

function gstAsText(rows, frac) {
  const out = clone(rows), j = col('Product GST %');
  for (const r of out.slice(2)) r[j] = frac ? String(+r[j] / 100) : r[j] + '%';
  return out;
}
function floatNoise(rows) {
  const out = clone(rows);
  for (const r of out.slice(2)) r.forEach((v, j) => { if (isMoney(HEAD[j]) && v !== '' && parseFloat(v) !== 0) r[j] = parseFloat(v) + 1e-9; });
  return out;
}
function shoutyHeaders(rows) {
  const out = clone(rows);
  out[0] = out[0].map((h) => '  ' + h.toUpperCase() + ' ');
  return out;
}
function noPayDate(rows) {
  // a few rows without a payment date: the dispatch or order date is used
  const out = clone(rows), j = col('Payment Date');
  out.slice(2).forEach((r, i) => { if (i % 37 === 0) r[j] = ''; });
  return out;
}
const variants = [
  ['as numbers', [book(PAY)]],
  ['text numbers with ₹, commas and brackets', [book(textNumbers(PAY))]],
  ['charges as positive numbers', [book(positiveCharges(PAY))]],
  ['dates as dd-mm-yyyy', [book(dates(PAY, 'dmy'))]],
  ['dates as dd/mm/yyyy', [book(dates(PAY, 'slash'))]],
  ['dates as Excel serial numbers', [book(dates(PAY, 'serial'))]],
  ['dates with a time', [book(dates(PAY, 'time'))]],
  ['dates as 5 Oct 2026', [book(dates(PAY, 'words'))]],
  ['columns moved, unknown columns added', [book(shuffleColumns(PAY))]],
  ['title rows, a blank row and a totals row', [book(titleAndTotals(PAY))]],
  ['two overlapping files', [book(PAY.slice(0, 2).concat(PAY.slice(2, 260)), 'a.xlsx'), book(PAY.slice(0, 2).concat(PAY.slice(150)), 'b.xlsx')]],
  ['the same file uploaded twice', [book(PAY, 'a.xlsx'), book(PAY, 'a (1).xlsx')]],
  ['a short file, then the same dates downloaded again with more rows', [book(PAY.slice(0, 200), 'aug.xlsx'), book(PAY, 'aug-sep.xlsx')]],
  ['GST % as 5%', [book(gstAsText(PAY, false))]],
  ['GST % as 0.05', [book(gstAsText(PAY, true))]],
  ['tiny floating point noise', [book(floatNoise(PAY))]],
  ['headers in capitals with spaces', [book(shoutyHeaders(PAY))]],
  ['some rows without a payment date', [book(noPayDate(PAY))]],
];
for (const cfg of [{}, { gstReg: false }, { taxCredits: 'expense' }]) {
  const want = oracle(cfg);
  for (const [name, books] of variants) {
    const { R, M } = run(books, { cfg });
    const tag = `oracle [${name}] ${JSON.stringify(cfg)}`;
    eq(M.pay.length, want.legs, tag + ': payment rows');
    eq(R.payout, want.payout, tag + ': money received');
    eq(R.NS, want.NS, tag + ': net sales');
    eq(R.K.OUT, want.OUT, tag + ': output GST');
    eq(R.K.T, want.T, tag + ': TCS');
    eq(R.K.D, want.D, tag + ': TDS');
    eq(R.NP, want.NP, tag + ': net profit');
    ok(R.checks.bridge && R.checks.sku, tag + ': identities');
  }
}

/* ---------------------------------------------------------------- 2. ledgers by hand */

const LH = ['Sub Order No', 'Order Date', 'Payment Date', 'Supplier SKU', 'Product Name', 'Live Order Status', 'Product GST %', 'Quantity',
  'Final Settlement Amount', 'Total Sale Amount (Incl. Shipping & GST)', 'Total Sale Return Amount (Incl. Shipping & GST)',
  'Shipping Charge (Incl. GST)', 'Return Shipping Charge (Incl. GST)', 'TCS', 'TDS', 'Claims'];
// id, order date, pay date, sku, status, qty, sale, return, ship, return ship, tcs, tds, claims
const LEGS = [
  ['100000001_1', '2026-08-01', '2026-08-12', 'KURTI', 'Delivered', 2, 1000, 0, -100, 0, -4.76, -1, 0],
  ['100000002_1', '2026-08-02', '2026-08-12', 'KURTI', 'Delivered', 1, 500, 0, -80, 0, -2.38, -0.5, 0],
  ['100000002_1', '2026-08-02', '2026-09-02', 'KURTI', 'Return', 1, 0, -500, 0, -60, 2.38, 0.5, 0],
  ['100000003_1', '2026-08-03', '2026-08-19', 'KURTI', 'RTO', 1, 0, 0, 0, -50, 0, 0, 0],
  ['100000004_1', '2026-08-04', '2026-09-09', 'KURTI', 'Lost', 1, 0, 0, 0, 0, 0, 0, 400],
  ['100000005_1', '2026-08-05', '2026-08-26', 'SAREE', 'Exchange', 1, 600, 0, -90, 0, -2.86, -0.6, 0],
];
function ledgerBook() {
  const rows = [LH];
  for (const l of LEGS) {
    const [id, od, pd, sku, st, q, s, r, sh, rs, tcs, tds, cl] = l;
    const f = s + r + sh + rs + tcs + tds + cl;
    rows.push([id, od, pd, sku, sku === 'KURTI' ? 'Cotton Kurti' : 'Silk Saree', st, '5', String(q), f.toFixed(2), String(s), String(r), String(sh), String(rs), String(tcs), String(tds), String(cl)]);
  }
  return { name: 'ledger.xlsx', sheets: [{ name: 'Order Payments', rows }] };
}
const costs = { KURTI: { c: 30000, n: 1 }, SAREE: { c: 45000, n: 1 } };
{
  // not GST registered: every rupee is plain money
  const { R } = run([ledgerBook()], { cfg: { gstReg: false, pack: 1000 }, costs });
  const NS = 100000 + 50000 - 50000 + 60000;
  const charges = -10000 - 8000 - 6000 - 5000 - 9000;
  // shipped: 2 kurtis + 1 kurti + 1 saree; the returned kurti is back in stock; RTO back in stock;
  // the lost kurti is written off
  const COGS = 2 * 30000 + 30000 + 45000 - 30000 + 30000;
  const pack = 5 * 1000; // every parcel that went out: 1, 2, 3 (RTO), 4 (lost), 5
  const credits = 40000;
  const taxes = Math.round((-4.76 - 1 - 2.38 - 0.5 + 2.38 + 0.5 - 2.86 - 0.6) * 100);
  eq(R.NS, NS, 'ledger: net sales');
  eq(R.COGS, COGS, 'ledger: cost of goods sold');
  eq(R.K.pack, pack, 'ledger: packaging');
  eq(R.K.parcels, 5, 'ledger: parcels');
  eq(R.MCx, charges, 'ledger: Meesho charges');
  // without GST registration the TCS cannot be used; TDS comes back in the income tax return
  eq(R.NP, NS + charges + credits - COGS - pack - Math.round((-4.76 - 2.38 + 2.38 - 2.86) * -100), 'ledger: net profit (not registered)');
  eq(R.payout, NS + charges + credits + taxes, 'ledger: money received');
  ok(R.checks.bridge && R.checks.sku, 'ledger: identities');
}
{
  // RTO parcels marked not resellable, and the returned kurti damaged
  const { R } = run([ledgerBook()], { cfg: { gstReg: false, rtoDefault: 'loss' }, costs, marks: { '100000002_1': 'loss' } });
  eq(R.COGS, 2 * 30000 + 30000 + 45000 + 30000 + 30000, 'ledger: COGS with RTO and the return written off');
  eq(R.K.rlu, 1, 'ledger: one returned piece not resellable');
}
{
  // GST registered, goods bought with a 5% GST bill: cost without GST, GST tracked as input credit
  const { R } = run([ledgerBook()], { cfg: { gstReg: true, buyGst: 5 }, costs });
  const net = (c) => Math.round(c * 100 / 105);
  eq(R.COGS, 2 * net(30000) + net(30000) + net(45000) - net(30000) + net(30000), 'ledger: COGS without the GST on the purchase bill');
  const out = [100000, 50000, -50000, 60000].reduce((t, v) => t + Math.round(v * 5 / 105), 0);
  eq(R.K.OUT, out, 'ledger: output GST at 5%');
  const chg = [-10000, -8000, -6000, -5000, -9000].reduce((t, v) => t + Math.round(v * 18 / 118), 0);
  eq(R.gst.itcCh, -chg, 'ledger: input credit on Meesho charges');
  ok(R.checks.bridge && R.checks.sku, 'ledger GST: identities');
}
{
  // costs for combos: a quantity of 3 of a pack of 2
  const b = ledgerBook();
  b.sheets[0].rows[1][7] = '3';
  const { R } = run([b], { cfg: { gstReg: false }, costs: { KURTI: { c: 30000, n: 2 }, SAREE: { c: 45000, n: 1 } } });
  eq(R.K.fu, 3 * 2 + 2 + 1 + 0, 'ledger: pieces shipped for a quantity of 3 of a pack of 2');
}

/* ---------------------------------------------------------------- 3. identities */

const real = { costs: D.costs, expenses: D.expenses };
const settings = [];
for (const gstReg of [true, false]) for (const taxCredits of ['claim', 'expense']) for (const buyGst of [0, 12]) for (const def of ['ok', 'loss'])
  settings.push({ gstReg, taxCredits, buyGst, returnDefault: def, rtoDefault: def, pack: def === 'ok' ? 0 : 900 });
const ORD = D.ordBook;
for (const cfg of settings) {
  const all = run([D.payBook, ORD], { cfg, ...real });
  const tag = JSON.stringify(cfg);
  ok(all.R.checks.bridge && all.R.checks.sku, 'identities all data ' + tag);
  const months = E.dataMonths(all.M, all.IX, 'pay');
  const sum = { NS: 0, payout: 0, COGS: 0, pre: 0, F: 0, EXP: 0 };
  for (const m of months) {
    const r = run([D.payBook, ORD], { cfg, ...real, sel: { mode: 'month', m, basis: 'pay' } }).R;
    ok(r.checks.bridge && r.checks.sku, `identities ${m} ${tag}`);
    sum.NS += r.NS; sum.payout += r.payout; sum.COGS += r.COGS; sum.pre += r.NP + r.UNU + r.tcsLoss; sum.EXP += r.EXP;
  }
  eq(sum.NS, all.R.NS, 'months add up: net sales ' + tag);
  eq(sum.payout, all.R.payout, 'months add up: money received ' + tag);
  eq(sum.COGS, all.R.COGS, 'months add up: cost of goods ' + tag);
  eq(sum.EXP, all.R.EXP, 'months add up: expenses ' + tag);
  eq(sum.pre, all.R.NP + all.R.UNU + all.R.tcsLoss, 'months add up: profit before unusable credit ' + tag);
  const byOrder = run([D.payBook, ORD], { cfg, ...real, sel: { mode: 'all', basis: 'order' } }).R;
  ok(byOrder.checks.bridge && byOrder.checks.sku, 'identities by order date ' + tag);
  eq(byOrder.payout, all.R.payout, 'order date basis covers the same money ' + tag);
  eq(byOrder.NS, all.R.NS, 'order date basis covers the same sales ' + tag);
  const rec = E.reconcile(all.M, all.IX, all.cfg);
  eq(rec.rows.filter((x) => x.hasPay).reduce((t, x) => t + x.f, 0), all.R.K.F, 'reconcile covers every payment row ' + tag);
  eq(E.BUCKETS.reduce((t, b) => t + rec.counts[b].n, 0), rec.rows.length, 'every order in one reconcile bucket ' + tag);
}
{
  // the sample shop's audited numbers (the same as the app's tests)
  const r = run([D.payBook, ORD], { costs: D.costs, expenses: D.expenses, cfg: { pack: D.pack } }).R;
  eq(r.NP, 1795139, 'sample shop: net profit');
  eq(r.payout, 8756110, 'sample shop: money received');
  eq(r.payout, D.expect.F + D.expect.AD + D.expect.REF + D.expect.ADJ, 'sample shop: money received from the generator');
}

/* ---------------------------------------------------------------- 4. the tools built on the report */

{
  // price check, worked out by hand. Meesho pays ₹400 for a delivered order; the sale value is 1.25 x the
  // payout (₹500 at 5% GST), TCS + TDS are 0.6% of it and come back; cost ₹200, packaging ₹10; Meesho keeps
  // ₹118 on a return and ₹59 on an RTO (with 18% GST); 10% RTO, 20% returns.
  const base = { pay: 40000, q: 1.25, tt: 0.006, claim: true, gst: 5, reg: true, cost: 20000, pcs: 1, pack: 1000, retLoss: 11800, rtoLoss: 5900, rto: 0.1, ret: 0.2, loss: 0, buy: 0 };
  const pc = E.priceCheck(base);
  // per payout rupee: 1 - (1.25 x 5/105 - (1.25 - 1 - 0.0075) x 18/118) + 0.0075 = 0.9849677
  // per parcel: 0.72 x (0.9849677 x 400 - 200) - (0.18 x 100 + 0.1 x 50) - 10 = 106.6707
  const keep = 1 - (1.25 * 5 / 105 - (1.25 - 1 - 1.25 * 0.006) * 18 / 118) + 1.25 * 0.006;
  eq(pc.perParcel, Math.round(0.72 * (keep * 40000 - 20000) - 2300 - 1000), 'price check: profit per parcel');
  eq(pc.perParcel, 10667, 'price check: profit per parcel, by hand');
  eq(pc.perOrder, Math.round((0.72 * (keep * 40000 - 20000) - 3300) / 0.72), 'price check: profit per kept order');
  eq(pc.breakEven, Math.ceil(17700 / (0.72 * keep)), 'price check: lowest payout without a loss');
  ok(Math.abs(E.priceCheck(Object.assign({}, base, { pay: pc.breakEven })).perParcel) <= 1, 'price check: no profit at the lowest payout');
  ok(Math.abs(E.priceCheck(Object.assign({}, base, { pay: pc.payFor(10000) })).perOrder - 10000) <= 1, 'price check: payout for ₹100 per order gives ₹100');
  const sp = pc.split;
  ok(Math.abs(sp.goods + sp.gst + sp.returns + sp.pack + sp.profit - 40000) <= 2, 'price check: the parts add up to the payout', JSON.stringify(sp));
  eq(pc.saleValue, 50000, 'price check: sale value from the payout');
  // not registered and TCS/TDS as a cost: nothing taken out or added back
  eq(E.priceCheck(Object.assign({}, base, { reg: false, claim: false })).perParcel, Math.round(0.72 * (40000 - 20000) - (0.18 * 11800 + 0.1 * 5900) - 1000), 'price check: not registered');
  // the GST on a purchase bill comes back for a registered seller
  eq(E.priceCheck(Object.assign({}, base, { buy: 5, cost: 21000 })).perParcel, 10667, 'price check: cost without the GST on the bill');
  // half the returned and RTO pieces cannot be sold again
  eq(E.priceCheck(Object.assign({}, base, { loss: 0.5 })).perParcel, Math.round(0.72 * (keep * 40000 - 20000) - 2300 - 1000 - 0.28 * 0.5 * 20000), 'price check: unsellable returns');
}
{
  // price check from the sample shop's own files: a product's profit per kept order comes out close to
  // what the report says that product made
  const all = run([D.payBook, ORD], { costs: D.costs, expenses: D.expenses, cfg: { pack: D.pack } });
  const REC = E.reconcile(all.M, all.IX, all.cfg), RV = E.returnsView(all.M, all.IX, all.cfg, all.per);
  for (const x of all.R.skus.filter((k) => k.delivered >= 25)) {
    const d = E.priceDefaults(all.R, RV, all.M, all.cfg, REC, x.sku), c = D.costs[x.sku] || {};
    const r = E.priceCheck(Object.assign({}, d, { reg: !!all.cfg.gstReg, cost: c.c, pcs: x.pcs || 1, pack: c.p != null ? c.p : D.pack }));
    ok(Math.abs(r.perOrder - x.perOrder) <= Math.abs(x.perOrder) * 0.1, 'price check matches the report within 10%: ' + x.sku, r.perOrder + ' vs ' + x.perOrder);
  }
  const shop = E.priceDefaults(all.R, RV, all.M, all.cfg, REC);
  ok(shop.n > 100 && shop.q > 1 && shop.q < 1.6, 'price check: average payout and sale value from the files', JSON.stringify({ n: shop.n, q: shop.q }));
}
{
  // recoveries: each kind of recovery is read the way a seller would want it explained
  const H2 = ['Sub Order No', 'Order Date', 'Payment Date', 'Supplier SKU', 'Product Name', 'Live Order Status', 'Product GST %', 'Quantity',
    'Final Settlement Amount', 'Total Sale Amount (Incl. Shipping & GST)', 'Shipping Charge (Incl. GST)', 'Claims', 'Recovery', 'Claims Reason', 'Recovery Reason'];
  // id, pay date, status, sale, shipping, claims, recovery, claims reason, recovery reason
  const L2 = [
    ['200000001_1', '2026-08-12', 'Delivered', 500, -80, 0, 0, '', ''],
    ['200000001_1', '2026-08-26', 'Delivered', 0, 0, 0, -200, '', 'Wrong product dispatched'],
    ['200000002_1', '2026-08-12', 'Delivered', 500, -80, 0, 0, '', ''],
    ['200000002_1', '2026-08-19', 'Delivered', 0, 0, 0, -150, '', 'Wrong product'],
    ['200000002_1', '2026-08-26', 'Delivered', 0, 0, 0, -150, '', 'Wrong product'],
    ['200000003_1', '2026-08-12', 'Delivered', 500, -80, 0, -900, '', 'Customer complaint'],
    ['200000004_1', '2026-08-12', 'Lost', 0, 0, 300, 0, 'Shipment lost in transit', ''],
    ['200000004_1', '2026-09-02', 'Delivered', 0, 0, 0, -300, '', 'Lost claim reversed'],
    ['200000005_1', '2026-08-12', 'Delivered', 400, -80, 0, -100, '', 'Wrong product'],
    ['200000005_1', '2026-08-26', 'Delivered', 0, 0, 0, 100, '', 'Recovery reversal'],
    ['200000006_1', '2026-08-12', 'Delivered', 300, -70, 0, -80, '', ''],
    ['200000007_1', '2026-08-12', 'Delivered', 300, -70, 0, -40, '', 'Weight discrepancy'],
    ['200000008_1', '2026-08-12', 'Delivered', 300, -70, 0, -50, '', 'Late dispatch penalty'],
    ['200000009_1', '2026-08-12', 'Lost', 0, 0, 200, 0, 'Damaged in transit', ''],
    ['200000009_1', '2026-08-26', 'Lost', 0, 0, 0, -350, '', 'Claim recovery']
  ];
  const rows = [H2].concat(L2.map((l) => {
    const [id, pd, st, sale, ship, cl, rc, cw, rw] = l;
    return [id, '2026-08-01', pd, 'TOP', 'Cotton Top', st, '5', '1', (sale + ship + cl + rc).toFixed(2), String(sale), String(ship), String(cl), String(rc), cw, rw];
  }));
  const adj = [['Date', 'Type', 'Reason', 'Amount (inc GST) INR'], ['2026-08-20', 'Compensation', 'Warehouse damage', '180'], ['2026-08-22', 'Recovery', 'Excess payout recovered', '75'],
    ['2026-08-25', 'Recovery', 'Weight discrepancy', '40'], ['2026-08-28', 'Recovery', 'Weight discrepancy', '40'], ['2026-09-01', 'Recovery', '', '60']];
  const bk = { name: 'rec.xlsx', sheets: [{ name: 'Order Payments', rows }, { name: 'Compensation and Recovery', rows: adj }] };
  const all = run([bk], { cfg: { gstReg: false } });
  const REC = E.reconcile(all.M, all.IX, all.cfg), RC = E.recoveries(all.M, all.IX, REC, all.cfg);
  const get = (id) => RC.list.find((x) => x.id === id && !x.acct) || {};
  const want = [['200000001_1', 'dispute', 20000, 'wrong'], ['200000002_1', 'dispute', 15000, 'wrong', 'twice'], ['200000003_1', 'dispute', 40000, 'other', 'over'],
    ['200000004_1', 'fair', 0, 'claimBack'], ['200000005_1', 'back', 0], ['200000006_1', 'ask', 8000, 'none'], ['200000007_1', 'dispute', 4000, 'weight'],
    ['200000008_1', 'ask', 5000, 'penalty'], ['200000009_1', 'dispute', 15000, 'claimBack', 'overClaim']];
  for (const [id, v, amt, kind, flag] of want) {
    const it = get(id);
    eq(it.verdict, v, 'recovery ' + id + ': verdict');
    eq(it.amt, amt, 'recovery ' + id + ': amount to raise');
    if (kind) eq(it.kind, kind, 'recovery ' + id + ': reason read as');
    if (flag) eq(it.flag, flag, 'recovery ' + id + ': found');
    ok(it.verdict === 'back' || it.verdict === 'fair' ? it.ticket === '' : it.ticket.indexOf(id) >= 0, 'recovery ' + id + ': ticket text');
  }
  ok(get('200000001_1').ticket.indexOf('Wrong product dispatched') > 0, 'recovery: the ticket quotes Meesho’s reason');
  eq(get('200000002_1').took, 30000, 'recovery: both deductions counted');
  // account level: recoveries written as positive amounts are deductions; a repeat is flagged
  const acct = RC.list.filter((x) => x.acct);
  eq(acct.length, 4, 'recovery: account-level entries');
  eq(acct.map((x) => x.verdict).join(','), 'fair,dispute,dispute,ask'.split(',').sort((a, b) => ({ dispute: 0, ask: 1, fair: 2, back: 3 })[a] - ({ dispute: 0, ask: 1, fair: 2, back: 3 })[b]).join(','), 'recovery: account-level verdicts', acct.map((x) => x.verdict + ':' + x.why).join(' | '));
  eq(acct.filter((x) => x.flag === 'twice').length, 1, 'recovery: only the repeat is flagged twice');
  eq(all.R.K.ADJ, 18000 - 7500 - 4000 - 4000 - 6000, 'recovery: account-level total, recoveries as deductions');
  eq(all.R.K.ADJP, 18000, 'recovery: account-level compensation');
  eq(all.R.K.ADJN, -21500, 'recovery: account-level recoveries');
  ok(all.R.lines.some((l) => l.l === 'Account-level recoveries' && l.v === -21500), 'recovery: its own line in the P&L');
  eq(all.R.payout, all.R.K.F + all.R.K.ADJ, 'recovery: money received includes the account-level entries');
  // money you may get back: only recoveries worth raising, at the amount worth raising
  const C = E.claims(all.M, all.IX, REC, all.cfg), cr = C.list.filter((c) => c.type === 'recovery');
  eq(cr.length, 7, 'recovery: claims list leaves out the fair and paid-back ones');
  eq(cr.reduce((t, c) => t + c.amt, 0), 20000 + 15000 + 40000 + 8000 + 4000 + 5000 + 15000, 'recovery: amount you may get back');
  eq(RC.by.back.n, 1, 'recovery: one paid back');
  eq(RC.net, RC.took - RC.back, 'recovery: net taken');
  // reconcile: a recovery paid back is not shown as charged
  const r5 = REC.rows.find((r) => r.id === '200000005_1');
  ok(r5 && r5.flags.indexOf('recovery') < 0, 'recovery: paid back is not flagged as charged');
  // reason words
  eq(E.recKind('Wrongly paid claim, recovered'), 'claimBack', 'recovery reason: wrongly paid is a claim taken back');
  eq(E.recKind('Customer received damaged product'), 'damaged', 'recovery reason: damaged');
  eq(E.recKind('Item missing in shipment'), 'missing', 'recovery reason: missing');
  eq(E.recKind('Excess weight charge'), 'weight', 'recovery reason: weight');
}
{
  // returns, deep: the same orders and money as the returns view, every cut adding up
  const all = run([D.payBook, ORD], { costs: D.costs, expenses: D.expenses, cfg: { pack: D.pack } });
  const catOf = (sku, pn) => E.categoryOf(pn || sku);
  for (const basis of ['pay', 'order']) {
    const per = E.periodFor({ mode: 'all', basis }, all.M, all.IX), RV = E.returnsView(all.M, all.IX, all.cfg, per);
    // every order counted: the same numbers as the returns view
    const X = E.returnsDeep(RV, { catOf, all: true }), T = X.tot;
    eq(T.done, RV.done, 'returns deep (' + basis + '): parcels');
    eq(T.delivered, RV.delivered, 'returns deep (' + basis + '): delivered');
    eq(T.rto, RV.G.rto.n, 'returns deep (' + basis + '): RTO');
    eq(T.ret, RV.G.ret.n, 'returns deep (' + basis + '): returns');
    eq(T.exch, RV.G.exch.n, 'returns deep (' + basis + '): exchanges');
    ok(Math.abs(T.loss - RV.loss) <= 1, 'returns deep (' + basis + '): money lost', T.loss + ' vs ' + RV.loss);
    ok(Math.abs(T.retRate - RV.retRate) < 1e-9 && Math.abs(T.rtoRate - (RV.rtoRate + RV.lostRate)) < 1e-9, 'returns deep (' + basis + '): rates');
    for (const [name, rows] of [['product', X.bySku], ['category', X.byCat], ['month', X.byMonth]]) {
      const sum = (k) => rows.reduce((t, g) => t + g[k], 0);
      ok(sum('done') === T.done && sum('ret') === T.ret && sum('rto') === T.rto && sum('exch') === T.exch && Math.abs(sum('loss') - T.loss) <= rows.length, 'returns deep (' + basis + '): by ' + name + ' adds up');
    }
    const withSize = RV.items.filter((it) => it.size), withState = RV.items.filter((it) => it.state);
    eq(X.bySize.reduce((t, g) => t + g.done, 0), withSize.length, 'returns deep (' + basis + '): by size covers every order with a size');
    eq(X.bySizeCat.reduce((t, c) => t + c.rows.reduce((u, g) => u + g.done, 0), 0), withSize.length, 'returns deep (' + basis + '): sizes per kind of product cover every order with a size');
    eq(X.byState.reduce((t, g) => t + g.done, 0), withState.length, 'returns deep (' + basis + '): by state covers every order with a state');
    ok(withSize.length > RV.done * 0.9, 'returns deep (' + basis + '): sizes read from the orders report', withSize.length + ' of ' + RV.done);
    const dated = RV.items.filter((it) => (it.kind === 'ret' || it.kind === 'rto') && it.od && it.back && it.back >= it.od).length;
    eq(X.days.reduce((t, b) => t + b.ret + b.rto, 0), dated, 'returns deep (' + basis + '): days to come back counts every dated return and RTO');
    // blouses: inch sizes read as L, XL and XXL, and kept apart from other products' letter sizes
    const bl = X.bySizeCat.find((c) => c.blouse);
    ok(bl && bl.rows.every((g) => ['L', 'XL', 'XXL'].includes(g.key)), 'returns deep (' + basis + '): blouse sizes grouped', bl && bl.rows.map((g) => g.key + JSON.stringify(g.sizes)).join(' '));
    ok(bl && bl.rows.every((g) => Object.keys(g.sizes).every((z) => E.groupSize(z, 'Blouses', '') === g.key)), 'returns deep (' + basis + '): each blouse size in its group');
    ok(X.bySizeCat.filter((c) => !c.blouse).every((c) => c.rows.every((g) => Object.keys(g.sizes).every((z) => z === g.key))), 'returns deep (' + basis + '): other products keep their sizes');
    // orders too new to have come back are left out of the rates, never out of the money
    const Y = E.returnsDeep(RV, { catOf });
    ok(Y.cut && Y.recent > 0, 'returns deep (' + basis + '): recent orders found', Y.cut + ' ' + Y.recent);
    eq(Y.recent, RV.items.filter((it) => it.od && it.od > Y.cut).length, 'returns deep (' + basis + '): orders after the cut');
    eq(Y.tot.done, RV.done - Y.recent, 'returns deep (' + basis + '): rates on the older orders');
    ok(Math.abs(Y.tot.loss - RV.loss) <= 1, 'returns deep (' + basis + '): money lost still counts every order');
    eq(Y.cut, (() => { const d = new Date(RV.lastPd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - Y.window); return d.toISOString().slice(0, 10); })(), 'returns deep (' + basis + '): cut is the window before the last payment');
    // the report dates: the first and last dates really in the files
    const sp = E.dataSpan(all.M, per), ds = all.M.pay.map((p) => basis === 'order' ? (p.od || p.pd) : p.pd).concat(basis === 'order' ? [] : all.M.ads.concat(all.M.ref, all.M.adj).map((x) => x.dt)).filter(Boolean).sort();
    eq(sp.from + ' ' + sp.to, ds[0] + ' ' + ds[ds.length - 1], 'report dates (' + basis + '): first and last date in the reports');
  }
  const sep = E.periodFor({ mode: 'month', m: '2026-09', basis: 'pay' }, all.M, all.IX), sps = E.dataSpan(all.M, sep);
  ok(sps.from >= '2026-09-01' && sps.to <= '2026-09-30' && sps.exact, 'report dates: one month stays inside it', JSON.stringify(sps));
  // sizes in the order a buyer reads them, written the way sellers write them
  eq(['XL', '38', 'S', 'Free size', 'M', 'XXL', '36', 'XS'].sort(E.sizeCmp).join(','), 'XS,S,M,XL,XXL,36,38,Free size', 'returns deep: size order');
  eq([E.normSize('xxl'), E.normSize('2XL'), E.normSize(' free size '), E.normSize('FS'), E.normSize('3 xl'), E.normSize('na'), E.normSize(38)].join(','), 'XXL,XXL,Free size,Free size,XXXL,,38', 'returns deep: sizes read the same way');
  eq(['26', '28', '30', '32', '34', '36', '38', '40', '42', 'XL', '38"'].map((z) => E.groupSize(z, 'Blouses', '')).join(','), 'L,L,L,XL,XL,XXL,XXL,XXL,42,XL,XXL', 'blouse sizes: 26 to 30 L, 32 to 34 XL, 36 to 40 XXL');
  eq(E.groupSize('38', 'Kurtis & suits', 'Rayon Kurti'), '38', 'blouse sizes: only for blouses');
  eq(E.groupSize('36', '', 'Readymade Cotton Blouse'), 'XXL', 'blouse sizes: known from the product name');
  // a size that comes back much more than the rest is called out
  const items = [];
  for (let i = 0; i < 40; i++) items.push({ kind: i < 4 ? 'ret' : 'ok', sku: 'A', pn: '', q: 1, size: 'M', state: '', od: '2026-08-01', value: 50000, back: '', cond: '', condDef: false, loss: i < 4 ? 10000 : 0, stock: 0 });
  for (let i = 0; i < 20; i++) items.push({ kind: i < 8 ? 'ret' : 'ok', sku: 'A', pn: '', q: 1, size: 'XL', state: '', od: '2026-08-01', value: 50000, back: '', cond: '', condDef: false, loss: i < 8 ? 10000 : 0, stock: 0 });
  const Z = E.returnsDeep({ items, G: { ret: { n: 12, loss: 120000 } } });
  const hi = Z.insights.find((x) => x.k === 'sizeHigh');
  ok(hi && hi.size === 'XL' && Math.abs(hi.rate - 0.4) < 1e-9, 'returns deep: the size that comes back most is found', JSON.stringify(hi));
  ok(Z.insights.some((x) => x.k === 'save' && x.amt === Math.round(60 * 0.05 * 10000)), 'returns deep: savings from 5 fewer returns in 100', JSON.stringify(Z.insights.find((x) => x.k === 'save')));
}
{
  // accuracy: a missing week of payments is found
  const rows = PAY.filter((r, i) => i < 2 || !/^2026-08-(19|26)$/.test(r[col('Payment Date')]));
  const files = [E.ingest('a.xlsx', 0, book(rows).sheets, cfgOf())];
  const M = E.merge(files), IX = E.index(M, cfgOf(), {}, {}), H = E.health(M);
  const R = E.compute(M, IX, cfgOf(), [], E.periodFor({ mode: 'all', basis: 'pay' }, M, IX));
  const A = E.accuracy(files, M, IX, R, H, cfgOf(), '2026-09-30');
  const gap = A.checks.find((c) => c.k === 'gaps');
  ok(gap && gap.lvl === 'warn' && gap.gaps[0].from === '2026-08-12' && gap.gaps[0].to === '2026-09-02', 'accuracy: missing payment weeks found', JSON.stringify(gap && gap.gaps));
  ok(A.checks.find((c) => c.k === 'ties').lvl === 'ok', 'accuracy: totals tie');
  ok(A.checks.some((c) => c.k === 'orders' && c.lvl === 'warn'), 'accuracy: orders report missing');
  const full = run([D.payBook, D.ordBook], { costs: D.costs });
  const A2 = E.accuracy(full.files, full.M, full.IX, full.R, E.health(full.M), full.cfg, '2026-09-30');
  ok(A2.checks.find((c) => c.k === 'gaps').lvl === 'ok' && !A2.checks.some((c) => c.k === 'orders'), 'accuracy: full files have no gap');
}
{
  // claims: a return marked damaged, a lost parcel, an overdue payment, a recovery
  const b = ledgerBook();
  const { M, IX, cfg } = run([b], { cfg: { gstReg: false }, costs, marks: { '100000002_1': 'loss' } });
  const C = E.claims(M, IX, E.reconcile(M, IX, cfg), cfg);
  const dmg = C.list.find((c) => c.type === 'damaged');
  ok(dmg && dmg.id === '100000002_1' && dmg.amt === 30000, 'claims: damaged return at its cost', JSON.stringify(dmg));
  const lost = C.list.find((c) => c.type === 'lost');
  ok(!lost, 'claims: a lost parcel that was already paid a claim is not listed');
  ok(C.list.every((c) => c.ticket.indexOf(c.id) >= 0), 'claims: every ticket names its order');
  const all = run([D.payBook, D.ordBook], { costs: D.costs });
  const C2 = E.claims(all.M, all.IX, E.reconcile(all.M, all.IX, all.cfg), all.cfg);
  eq(C2.by.overdue.n, D.expect.overdue, 'claims: the overdue payments of the sample shop');
  const W2 = E.onTheWay(E.reconcile(all.M, all.IX, all.cfg));
  ok(W2.due > 0 && W2.due <= W2.awaiting.v + W2.overdue.v, 'money on the way: an estimate below the order value');
}

/* ---------------------------------------------------------------- TCS and TDS rate check */
{
  // TCS 0.5% (1% before 10 Jul 2024) of the value without GST; TDS 0.1% (1% before 1 Oct 2024), 5% without a PAN
  const H = PAY[0], ci = (n) => H.indexOf(n);
  const sale = (r) => parseFloat(r[ci('Total Sale Amount (Incl. Shipping & GST)')] || 0) + parseFloat(r[ci('Total Sale Return Amount (Incl. Shipping & GST)')] || 0);
  const set = (r, colName, v) => { const f = ci('Final Settlement Amount'), old = parseFloat(r[ci(colName)] || 0); r[ci(colName)] = String(v); r[f] = String(Math.round((parseFloat(r[f]) - old + v) * 100) / 100); };
  const r2 = (x) => Math.round(x * 100) / 100;
  const variant = (fn) => { const c = JSON.parse(JSON.stringify(D.payBook)); c.sheets.find((x) => x.name === 'Order Payments').rows.slice(2).forEach(fn); return c; };
  const tc = (book) => { const x = run([book]); return E.taxCheck(x.M, x.per); };
  const t0 = tc(D.payBook);
  eq(t0.tcsState, 'ok', 'tax check: sample TCS at 0.5% is right');
  eq(t0.tdsState, 'ok', 'tax check: sample TDS at 0.1% is right');
  ok(Math.abs(t0.tcsPct - 0.5) < 0.01 && Math.abs(t0.tdsPct - 0.1) < 0.01, 'tax check: effective rates 0.5% and 0.1%', t0.tcsPct + ' ' + t0.tdsPct);
  eq(tc(variant((r) => set(r, 'TDS', -r2(sale(r) * 0.05)))).tdsState, 'nopan', 'tax check: TDS at 5% is the no-PAN rate');
  eq(tc(variant((r) => set(r, 'TCS', -r2(sale(r) / 1.05 * 0.01)))).tcsState, 'high', 'tax check: TCS at 1% after Jul 2024 is too high');
  eq(tc(variant((r) => set(r, 'TCS', -r2(sale(r) / 1.05 * 0.002)))).tcsState, 'low', 'tax check: TCS at 0.2% is too low');
  eq(tc(variant((r) => set(r, 'TCS', 0))).tcsState, 'none', 'tax check: no TCS (Enrolment ID seller)');
  const old = tc(variant((r) => { set(r, 'TCS', -r2(sale(r) / 1.05 * 0.01)); set(r, 'TDS', -r2(sale(r) * 0.01)); r[ci('Payment Date')] = '2024-06-15'; r[ci('Order Date')] = '2024-06-01'; }));
  ok(old.tcsState === 'ok' && old.tdsState === 'ok', 'tax check: 1% TCS and TDS are right before the 2024 cuts', old.tcsState + ' ' + old.tdsState);
  const mid = tc(variant((r) => { set(r, 'TDS', -r2(sale(r) * 0.01)); r[ci('Payment Date')] = '2024-10-05'; r[ci('Order Date')] = '2024-09-20'; }));
  eq(mid.tdsState, 'ok', 'tax check: an order placed before 1 Oct 2024 and paid after may use the old TDS rate');
  eq(tc(variant((r) => { set(r, 'TDS', -r2(sale(r) * 0.01)); r[ci('Payment Date')] = '2025-03-05'; r[ci('Order Date')] = '2025-02-20'; })).tdsState, 'high', 'tax check: 1% TDS in 2025 is too high');
}

/* ---------------------------------------------------------------- where every Rs 100 went */
{
  // the parts and the profit add up to the net sales, for every setting
  for (const cfg of [{}, { gstReg: false }, { taxCredits: 'expense' }, { gstReg: false, taxCredits: 'expense' }]) {
    const x = run([D.payBook, D.ordBook], { costs: D.costs, cfg, expenses: [{ id: 'e1', name: 'Rent', amt: 300000, when: 'monthly' }] });
    const H = E.hundred(x.R), tag = JSON.stringify(cfg);
    ok(!!H, 'every Rs 100: worked out ' + tag);
    if (!H) continue;
    const sum = H.segs.reduce((t, s2) => t + s2.v, 0);
    ok(Math.abs(sum - (x.R.NP > 0 ? x.R.NS : x.R.NS - x.R.NP)) <= 50 * H.segs.length + 2, 'every Rs 100: parts add up to the sales ' + tag, sum + ' vs ' + x.R.NS);
    ok(H.segs.every((s2) => s2.v > 0 && Math.abs(s2.per100 - s2.v / x.R.NS * 100) < 1e-9), 'every Rs 100: each part is positive, per Rs 100 of sales ' + tag);
    const np = H.segs.find((s2) => s2.k === 'np');
    ok(x.R.NP > 0 ? np && np.v === x.R.NP : !np, 'every Rs 100: the profit part is the net profit ' + tag);
  }
}

/* ---------------------------------------------------------------- a sale taken back is a return */
{
  // the reversal leg says "Delivered" or nothing (the status column lags): it is still a customer return
  for (const st of ['Delivered', '']) {
    const legs = LEGS.map((l) => l.slice());
    legs[2][4] = st; legs[1][4] = 'Delivered';
    const rows = [LH].concat(legs.map((l) => { const [id, od, pd, sku, s1, q, s, r, sh, rs, tcs, tds, cl] = l; const f = s + r + sh + rs + tcs + tds + cl; return [id, od, pd, sku, sku === 'KURTI' ? 'Cotton Kurti' : 'Silk Saree', s1, '5', String(q), f.toFixed(2), String(s), String(r), String(sh), String(rs), String(tcs), String(tds), String(cl)]; }));
    const x = run([{ name: 'l.xlsx', sheets: [{ name: 'Order Payments', rows }] }], { cfg: { gstReg: false }, costs });
    const base = run([ledgerBook()], { cfg: { gstReg: false }, costs });
    const tag = 'stale status "' + st + '"';
    eq(x.IX.O['100000002_1'].st, 'RETURN', tag + ': the order is a return');
    eq(x.R.NP, base.R.NP, tag + ': profit is the same as with the right status');
    const RV = E.returnsView(x.M, x.IX, x.cfg, x.per), RV0 = E.returnsView(base.M, base.IX, base.cfg, base.per);
    eq(RV.G.ret.n, RV0.G.ret.n, tag + ': counted as a customer return');
    eq(RV.G.ret.loss, RV0.G.ret.loss, tag + ': with its loss');
    eq(E.reconcile(x.M, x.IX, x.cfg).rows.find((r) => r.id === '100000002_1').b, 'returned', tag + ': reconcile puts it under returns');
  }
}

/* ---------------------------------------------------------------- returns not reversed yet */
{
  // sold and paid, now a return, but Meesho has not taken the sale back yet
  const legs = LEGS.filter((l) => !(l[0] === '100000002_1' && l[7] < 0)).map((l) => l.slice());
  const rows = [LH].concat(legs.map((l) => { const [id, od, pd, sku, s1, q, s, r, sh, rs, tcs, tds, cl] = l; const f = s + r + sh + rs + tcs + tds + cl; return [id, od, pd, sku, sku === 'KURTI' ? 'Cotton Kurti' : 'Silk Saree', s1, '5', String(q), f.toFixed(2), String(s), String(r), String(sh), String(rs), String(tcs), String(tds), String(cl)]; }));
  const ord = { name: 'o.csv', sheets: [{ name: 'Orders', rows: [['Reason for Credit Entry', 'Sub Order No', 'Order Date', 'SKU', 'Product Name', 'Quantity'], ['RETURN', '100000002_1', '2026-08-02', 'KURTI', 'Cotton Kurti', '1']] }] };
  for (const cfg of [{ gstReg: false }, { gstReg: true }, { gstReg: true, returnDefault: 'loss' }]) {
    const x = run([{ name: 'l.xlsx', sheets: [{ name: 'Order Payments', rows }] }, ord], { cfg, costs });
    const K = x.R.K, tag = 'pending return ' + JSON.stringify(cfg);
    eq(K.revPend, 1, tag + ': one');
    eq(K.revPendV, 50000, tag + ': its sale');
    const out = cfg.gstReg ? Math.round(50000 * 5 / 105) : 0, back = cfg.returnDefault === 'loss' ? 0 : 30000;
    const fee = Math.round(-(x.R.CH.shipret.v - x.R.CH.shipret.g) / (K.retn + K.rton));
    eq(K.revPendP, 50000 - out - back + fee, tag + ': profit drop = sale less GST, less goods back in stock, plus a return fee');
    ok(K.revPendP < K.revPendV, tag + ': less than the sale');
  }
}

/* ---------------------------------------------------------------- insights */
{
  for (const sel of [{ mode: 'all', basis: 'pay' }, { mode: 'all', basis: 'order' }, { mode: 'month', m: '2026-09', basis: 'pay' }, { mode: 'month', m: '2026-08', basis: 'order' }]) {
    for (const cfg of [{}, { gstReg: false }, { taxCredits: 'expense' }]) {
      const exp = [{ id: 'e1', name: 'Rent', amt: 300000, when: 'monthly' }];
      const x = run([D.payBook, D.ordBook], { costs: D.costs, cfg: Object.assign({ pack: D.pack }, cfg), sel, expenses: exp });
      const MO = E.monthly(x.M, x.IX, x.cfg, exp, sel.basis), I = E.insights(x.R, MO, x.M, x.IX, x.per, x.cfg), by = {};
      I.forEach((i) => { by[i.k] = i; });
      const tag = JSON.stringify(sel) + JSON.stringify(cfg);
      const u = by.unit;
      ok(u && u.sale - u.parts.reduce((t, p) => t + p.v, 0) === u.profit, 'insights unit: the parts take the sale down to the profit, to the paisa ' + tag);
      ok(u && Math.abs(u.profit - x.R.NP / x.R.K.del) < 1 && Math.abs(u.sale - x.R.NS / x.R.K.del) < 1, 'insights unit: sale and profit per kept order ' + tag);
      if (by.mom) {
        const m = by.mom, cur = MO.find((r) => r.m === m.m), prev = MO.find((r) => r.m === m.pm);
        ok(cur && prev && E.nextMonth(prev.m) === cur.m && m.np === cur.NP && m.d === cur.NP - prev.NP, 'insights mom: the two months next to each other ' + tag);
        ok(!m.main || m.full, 'insights mom: a reason only when both months are complete ' + tag);
      }
      if (by.conc) ok(by.conc.share >= 0.5 && by.conc.skus.length <= 3, 'insights conc: half the product profit from at most 3 products ' + tag);
      if (by.ads) ok(by.ads.need * by.ads.each >= by.ads.cost && (by.ads.need - 1) * by.ads.each < by.ads.cost + by.ads.each, 'insights ads: the fewest kept orders that pay the ads ' + tag);
      if (by.cash) ok(by.cash.med <= by.cash.p90 && by.cash.med > 0, 'insights cash: days to payment ' + tag);
      if (by.ship) ok(by.ship.avg - by.ship.others >= 500 && by.ship.extra > 0, 'insights ship: Rs 5 or more per order above the others ' + tag);
      if (by.priceUp) ok(by.priceUp.perOrder === (cfg.gstReg === false ? 1000 : Math.round(1000 * 100 / 105)), 'insights priceUp: Rs 10 less its GST (no commission on this product) ' + tag, by.priceUp.perOrder);
    }
  }
  // two complete months: the reasons add up to the change in profit
  const two = [];
  const book = JSON.parse(JSON.stringify(D.payBook));
  const pr = book.sheets.find((s2) => s2.name === 'Order Payments').rows, ci = (n) => pr[0].indexOf(n);
  pr.slice(2).forEach((r) => {
    const d = r[ci('Payment Date')];
    if (d < '2026-09-01') r[ci('Payment Date')] = '2026-08-' + String(Math.min(31, Math.max(1, (+d.slice(8)) * 2 - 22))).padStart(2, '0');
    else r[ci('Payment Date')] = '2026-09-' + String(Math.min(30, +d.slice(8) + 7)).padStart(2, '0');
  });
  const x2 = run([book], { costs: D.costs, sel: { mode: 'all', basis: 'pay' } });
  const MO2 = E.monthly(x2.M, x2.IX, x2.cfg, [], 'pay');
  const sp = E.dataSpan(x2.M, { from: '2026-08-01', to: '2026-08-31', basis: 'pay' });
  two.push(sp.from, sp.to);
  const m2 = E.insights(x2.R, MO2, x2.M, x2.IX, x2.per, x2.cfg).find((i) => i.k === 'mom');
  ok(m2 && m2.prev.full && m2.cur.full, 'insights mom: both months spread over the month are complete ' + two.join(' '));
  ok(m2 && m2.main && (m2.main.v > 0) === (m2.d > 0) && Math.abs(m2.main.v) <= Math.abs(m2.d) * 10, 'insights mom: the biggest reason moves profit the same way', m2 && JSON.stringify(m2.main));
}

console.log(`${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
