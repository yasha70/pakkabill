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

console.log(`${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
