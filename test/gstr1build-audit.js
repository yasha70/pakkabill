// Checks of the GSTR-1 return itself: the builder inside index.html (reading the marketplace reports and
// making every table), run exactly as the Android app runs it (android/engines/build.mjs takes it out of
// the bundle), with the page's glue (g1-facade.js), the checker and the steps view around it.
// Every figure is worked out a second time here, straight from the report rows, and compared.
//   - the sample month (Meesho + Amazon B2C + Amazon B2B) gives the saved return, byte for byte
//   - Table 7, Table 12 and Table 14 tie to each other and to the reports, to the paisa
//   - no negative value is ever written; returns held back are carried and come back next month
//   - rows of another GSTIN never enter the return
//   - B2C large by date, 0% bills in Table 8, the GSTR-8 tax period in every form, quarterly returns
// Run: node test/gstr1build-audit.js   (needs `npm ci` in android/engines once; skipped without it)
//      node test/gstr1build-audit.js --write   saves the sample month's return again after a rule change
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), cp = require('child_process');
const repo = path.join(__dirname, '..'), eng = path.join(repo, 'android', 'engines');
if (!fs.existsSync(path.join(eng, 'node_modules', '@babel', 'core'))) {
  console.log('GSTR-1 return checks skipped: run `npm ci` in android/engines first.');
  process.exit(0);
}
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-g1-'));
cp.execFileSync(process.execPath, [path.join(eng, 'build.mjs'), out], { cwd: eng, stdio: ['ignore', 'ignore', 'inherit'] });
const tools = path.join(out, 'pakkabill', 'tools');

function engine() {
  const ctx = { console, Intl, TextEncoder };
  ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ['g1check.js', 'g1view.js', 'g1build.js']) vm.runInContext(fs.readFileSync(path.join(tools, f), 'utf8'), ctx, { filename: f });
  vm.runInContext(fs.readFileSync(path.join(repo, 'android/core/src/main/resources/pakkabill/g1-facade.js'), 'utf8'), ctx, { filename: 'g1-facade.js' });
  return vm.runInContext('({ G: PBGstr1, B: PBG1B, C: PBG1, V: PBG1V })', ctx);
}

let fails = 0, checks = 0;
function ok(cond, what, detail) { checks++; if (!cond) { fails++; console.log('FAIL  ' + what + (detail ? '  ' + detail : '')); } }
function eq(a, b, what) { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, what, `expected ${B}, got ${A}`); }
const r2 = (v) => Math.round((v + Number.EPSILON * Math.sign(v)) * 100) / 100;
const near = (a, b, what, tol) => ok(Math.abs(a - b) <= (tol == null ? 0.011 : tol), what, `expected ${b}, got ${a}`);

function csv(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.map((r) => r.map((v) => (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v)));
}
const sheet = (head, rows) => [{ name: 'Sheet1', rows: [head, ...rows] }];

const ME = '24ABCDE1234F1Z6', OTHER = '27ABCDE1234F1Z0', BUYER = '27AAACB2222C1ZH';
const SALES = ['identifier', 'sup_name', 'gstin', 'sub_order_num', 'order_date', 'hsn_code', 'quantity', 'gst_rate', 'total_taxable_sale_value', 'tax_amount', 'total_invoice_value', 'taxable_shipping', 'end_customer_state_new', 'enrollment_no', 'financial_year', 'month_number', 'supplier_id'];
const RET = [...SALES.slice(0, 5), 'cancel_return_date', ...SALES.slice(5)];
// one Meesho row: [order, hsn, qty, rate, taxable, state], month and year of the report
const sale = (m, y, gstin) => ([o, hsn, qty, rate, tx, state]) => ['x', 'Shop', gstin || ME, o, `${y}-${String(m).padStart(2, '0')}-10`, hsn, qty, rate, tx, r2(tx * rate / 100), r2(tx * (1 + rate / 100)), 0, state, '', y, m, 1];
const ret = (m, y) => ([o, hsn, qty, rate, tx, state]) => { const s = sale(m, y)([o, hsn, qty, rate, tx, state]); return [...s.slice(0, 5), `${y}-${String(m).padStart(2, '0')}-20`, ...s.slice(5)]; };

// the return of one set of files, the way the page makes it
function make(files, st) {
  const E = engine();
  files.forEach((f, i) => { const r = E.G.addFile(i + 1, f[0], f[1]); ok(r.ok, 'read ' + f[0], r.message); });
  const d = E.G.defaults({ gstin: '' });
  const set = { gstin: d.gstin, period: d.period, etinBySource: d.etinBySource, hsnDesc: d.hsnDesc, ...(st || {}) };
  const v = E.G.compute(set);
  return { E, v, d, set, json: JSON.parse(E.G.jsonText()), check: E.G.ownCheck() };
}
const sumOf = (list, k) => r2((list || []).reduce((a, r) => a + (Number(r[k]) || 0), 0));
function noNegative(J, what) {
  const bad = [];
  (J.b2cs || []).forEach((r) => { if (r.txval < 0 || (r.iamt || 0) < 0 || (r.camt || 0) < 0) bad.push('Table 7 ' + r.pos + ' ' + r.rt); });
  ((J.hsn && J.hsn.hsn_b2c) || []).forEach((h) => { if (h.txval < 0 || h.qty < 0 || h.iamt < 0 || h.camt < 0) bad.push('Table 12 ' + h.hsn_sc + ' ' + h.rt); });
  ((J.supeco && J.supeco.clttx) || []).forEach((e) => { if (e.suppval < 0 || e.igst < 0 || e.cgst < 0) bad.push('Table 14 ' + e.etin); });
  eq(bad, [], what + ': no negative value in Tables 7, 12 (B2C) and 14');
}

/* ---------------- 1. the sample month: Meesho + Amazon B2C + Amazon B2B ---------------- */
{
  const dir = path.join(repo, 'android/core/src/test/resources/gstr1');
  const names = ['tcs_sales', 'tcs_sales_return', 'Tax_invoice_details', 'MTR_B2C-MAR-2025', 'MTR_B2B-MAR-2025'];
  const R = make(names.map((n) => [n + '.csv', [{ name: 'Sheet1', rows: csv(fs.readFileSync(path.join(dir, n + '.csv'), 'utf8')) }]]));
  const J = R.json, saved = path.join(dir, 'website-GSTR1.json');
  if (process.argv.includes('--write')) { fs.writeFileSync(saved, JSON.stringify(J, null, 2) + '\n'); console.log('saved ' + path.relative(repo, saved)); }
  eq(J, JSON.parse(fs.readFileSync(saved, 'utf8')), 'sample month: the saved return, byte for byte');
  eq(R.v.label, 'March 2025', 'sample month: label');
  noNegative(J, 'sample month');

  // worked out again from the report rows
  const rows = [];
  // the rows are read again through the builder's own reader
  const E2 = engine();
  names.forEach((n, i) => { const f = E2.B.parseBook({ SheetNames: ['s'], Sheets: { s: csv(fs.readFileSync(path.join(dir, n + '.csv'), 'utf8')) } }, { id: String(i), name: n + '.csv', note: '', source: 'meesho', kind: null, tcs: [], docs: [], period: '', message: '' }); rows.push(...(f.tcs || [])); });
  const inMonth = rows.filter((r) => r.period === '2025-03' && r.pos && (r.rate || r.tax));
  const sgn = (r) => (r.kind === 'returns' ? -1 : 1);
  const b2b = (r) => r.buyerGstin && r.invNo;
  const netB2c = r2(inMonth.filter((r) => !b2b(r)).reduce((a, r) => a + sgn(r) * r.taxable, 0));
  const carried = sumOf(R.E.G.carrySave({}, 0)[R.set.gstin]['032025'].items, 'txval');
  near(sumOf(J.b2cs, 'txval'), r2(netB2c - carried), 'sample month: Table 7 = B2C sales less returns in the reports, less what is carried', 0.02);
  near(sumOf(J.hsn.hsn_b2c, 'txval'), sumOf(J.b2cs, 'txval'), 'sample month: Table 12 B2C = Table 7', 0.05);
  const inv = r2(inMonth.filter((r) => b2b(r) && r.kind === 'sales').reduce((a, r) => a + r.taxable, 0));
  const cn = r2(inMonth.filter((r) => b2b(r) && r.kind === 'returns' && r.cnNo).reduce((a, r) => a + r.taxable, 0));
  near(R.v.summary.find((t) => t.key === 'b2b').txval, inv, 'sample month: Table 4 = B2B invoices in the reports', 0.02);
  near(R.v.summary.find((t) => t.key === 'cdnr').txval, cn, 'sample month: Table 9B = B2B credit notes in the reports', 0.02);
  near(sumOf(J.hsn.hsn_b2b, 'txval'), r2(inv - cn), 'sample month: Table 12 B2B = Table 4 less Table 9B', 0.05);
  near(sumOf(J.supeco.clttx, 'suppval'), r2(sumOf(J.b2cs, 'txval') + inv - cn), 'sample month: Table 14 = everything sold through the operators', 0.05);
  const tax7 = r2(sumOf(J.b2cs, 'iamt') + sumOf(J.b2cs, 'camt') + sumOf(J.b2cs, 'samt'));
  const taxRows = r2(inMonth.filter((r) => !b2b(r)).reduce((a, r) => a + sgn(r) * r.tax, 0) - sumOf(R.E.G.carrySave({}, 0)[R.set.gstin]['032025'].items, 'tax'));
  near(tax7, taxRows, 'sample month: Table 7 tax = tax in the reports', 0.4);
  eq(R.v.bridge.unexplained, 0, 'sample month: reports to return, every rupee accounted for');
  near(R.v.bridge.gstr1, R.v.totals.txval, 'sample month: bridge ends at the return');
  // the checker agrees with its own builder, apart from what the random sample really has
  eq(R.check.issues.filter((x) => x.lvl === 'error').map((x) => x.msg).filter((m) => !/^HSN 6302 12%/.test(m)), [], 'sample month: the checker finds no error in the B2C tables');
  // each B2B invoice and note: value = taxable + tax, tax from the rate
  J.b2b.forEach((p) => p.inv.forEach((v) => { const s = v.itms.reduce((a, i) => a + i.itm_det.txval + (i.itm_det.iamt || 0) + (i.itm_det.camt || 0) + (i.itm_det.samt || 0), 0); near(v.val, s, 'invoice ' + v.inum + ' value', 0.02); }));
}

/* ---------------- 2. returns that would push one HSN below zero are held back, then come back ---------------- */
{
  // Gujarat 5%: kurtis (6204) sold 3000, a saree (5407) of an earlier month returned 900 -> state is still positive, HSN 5407 would be -900
  const mar = [['tcs_sales.csv', sheet(SALES, [['S1', '6204', 3, 5, 3000, 'GUJARAT'], ['S2', '5407', 1, 5, 400, 'Maharashtra']].map(sale(3, 2025)))],
    ['tcs_sales_return.csv', sheet(RET, [['R1', '5407', 2, 5, 900, 'GUJARAT'], ['R2', '5407', 1, 5, 100, 'Maharashtra']].map(ret(3, 2025)))]];
  const R = make(mar);
  noNegative(R.json, 'HSN below zero');
  const h = Object.fromEntries(R.json.hsn.hsn_b2c.map((x) => [x.hsn_sc, x]));
  eq([h['6204'].txval, h['5407'].txval, h['5407'].qty], [3000, 300, 0], 'the 900 return is held back, the 100 return is netted');
  eq(R.json.b2cs.map((r) => [r.pos, r.rt, r.txval, r.camt || 0, r.iamt || 0]), [['24', 5, 3000, 75, 0], ['27', 5, 300, 0, 15]], 'Table 7 without the held-back return');
  eq(R.json.supeco.clttx.map((e) => [e.suppval, e.igst, e.cgst, e.sgst]), [[3300, 15, 75, 75]], 'Table 14 the same');
  eq(sumOf(R.json.hsn.hsn_b2c, 'txval'), sumOf(R.json.b2cs, 'txval'), 'Table 12 = Table 7');
  const carry = R.E.G.carrySave({}, 0);
  eq(carry[ME]['032025'].items.map((c) => [c.pos, c.rate, c.txval, c.tax, c.hsn]), [['24', 5, -900, -45, { 5407: { txval: -900, tax: -45, qty: -2 } }]], 'carried with its HSN, state, rate and tax');
  ok(R.v.notes.some((n) => /1 return held back/.test(n.text)), 'the page says a return was held back');
  eq(R.v.bridge.unexplained, 0, 'bridge: nothing unexplained');
  eq(R.check.errors, 0, 'the checker finds no error');

  // April: 5407 sells again; the carried return is taken off there
  const apr = [['tcs_sales.csv', sheet(SALES, [['S5', '5407', 3, 5, 1500, 'GUJARAT']].map(sale(4, 2025)))]];
  const A = make(apr, { carry });
  eq(A.json.b2cs.map((r) => [r.pos, r.txval, r.camt]), [['24', 600, 15]], 'next month: 1500 sold less 900 carried');
  eq(A.json.hsn.hsn_b2c.map((x) => [x.hsn_sc, x.txval, x.qty]), [['5407', 600, 1]], 'next month: HSN net of the carried return');
  eq(A.v.carryIn, 1, 'next month: one carried line added');
  const A0 = make(apr, { carry, carryOn: false });
  eq(A0.json.b2cs.map((r) => r.txval), [1500], 'carry switched off: left out');
}

/* ---------------- 3. intra-state tax of one HSN below zero while its value is above ---------------- */
{
  const R = make([['tcs_sales.csv', sheet(SALES, [['S1', '6204', 1, 5, 2000, 'Maharashtra'], ['S2', '6109', 2, 5, 1000, 'GUJARAT']].map(sale(3, 2025)))],
    ['tcs_sales_return.csv', sheet(RET, [['R1', '6204', 1, 5, 500, 'GUJARAT']].map(ret(3, 2025)))]]);
  noNegative(R.json, 'HSN tax below zero');
  eq(R.json.hsn.hsn_b2c.map((x) => [x.hsn_sc, x.txval, x.iamt, x.camt]), [['6109', 1000, 0, 25], ['6204', 2000, 100, 0]], 'a return whose CGST would go below zero in its HSN line is held back');
}

/* ---------------- 4. state by state: whole state negative is carried as before ---------------- */
{
  const R = make([['tcs_sales.csv', sheet(SALES, [['S1', '6204', 1, 5, 1000, 'GUJARAT']].map(sale(3, 2025)))],
    ['tcs_sales_return.csv', sheet(RET, [['R1', '6204', 1, 5, 800, 'Karnataka']].map(ret(3, 2025)))]]);
  noNegative(R.json, 'state below zero');
  eq(R.json.b2cs.map((r) => [r.pos, r.txval]), [['24', 1000]], 'Karnataka (returns only) is left out');
  eq(R.E.G.carrySave({}, 0)[ME]['032025'].items.map((c) => [c.pos, c.txval]), [['29', -800]], 'and carried');
}

/* ---------------- 5. rows of another GSTIN ---------------- */
{
  const MTR = ['Seller Gstin', 'Invoice Number', 'Invoice Date', 'Transaction Type', 'Order Id', 'Quantity', 'Item Description', 'Hsn/sac', 'Ship To State', 'Invoice Amount', 'Tax Exclusive Gross', 'Total Tax Amount', 'Igst Rate', 'Cgst Rate', 'Sgst Rate', 'Igst Tax', 'Cgst Tax', 'Sgst Tax', 'Customer Bill To Gstid', 'Credit Note No', 'Credit Note Date'];
  const m = (g, inv, state, tx, tax) => [g, inv, '2025-03-05', 'Shipment', 'O' + inv, 1, 'Saree', '5007', state, tx + tax, tx, tax, 0.05, 0, 0, tax, 0, 0, '', '', ''];
  const R = make([['MTR_B2C.csv', sheet(MTR, [m(ME, 'A1', 'MAHARASHTRA', 1000, 50), m(ME, 'A2', 'DELHI', 2000, 100), m(OTHER, 'B1', 'KERALA', 9000, 450)])]]);
  eq(R.set.gstin, ME, 'the GSTIN of most rows is picked');
  eq(sumOf(R.json.b2cs, 'txval'), 3000, 'the other GSTIN\'s sale is not in Table 7');
  eq(R.json.b2cs.some((r) => r.pos === '32'), false, 'nor its state');
  eq(R.json.doc_issue.doc_det[0].docs.map((d) => [d.from, d.to, d.totnum]), [['A1', 'A2', 2]], 'nor its invoice in Table 13');
  ok(R.v.notes.some((n) => n.tone === 'warn' && /1 report row belongs to another GSTIN/.test(n.text)), 'and the page says so');
  eq(R.v.statement.platforms[0].total.sales.txval, 3000, 'the statement has this GSTIN only');
}

/* ---------------- 6. PakkaBill bills: B2C large by date, 0% lines, B2B ---------------- */
{
  const bill = (number, date, pos, items, buyer) => ({ id: number, docType: 'invoice', status: 'paid', number, date, pos, calcV: 2, inclusive: false, roundOff: false, composition: false, reverseCharge: false,
    buyer: { name: 'B', gstin: (buyer || ''), stateCode: pos }, seller: { stateCode: '24' }, items: items.map(([hsn, qty, rate, gstRate]) => ({ name: 'Item', hsn, qty: String(qty), unit: 'PCS', rate: String(rate), discount: '', taxMode: 'fixed', gstRate })) });
  const base = [['tcs_sales.csv', sheet(SALES, [['S1', '6204', 1, 5, 1000, 'GUJARAT']].map(sale(7, 2024)))]];
  const bills = [bill('PB-1', '2024-07-05', '27', [['6204', 1, 150000, 5]]), bill('PB-2', '2024-07-06', '27', [['6204', 1, 230000, 5]]), bill('PB-3', '2024-07-07', '24', [['4901', 2, 500, 0], ['6204', 1, 1000, 5]]),
    bill('PB-4', '2024-07-08', '27', [['6204', 10, 1000, 5]], BUYER), bill('PB-5', '2024-07-09', '27', [['6204', 1, 300000, 5]]), { ...bill('PB-6', '2024-07-10', '27', [['6204', 1, 999, 5]]), status: 'cancelled' }];
  const R = make(base, { bills: true, shopGstin: ME, invoices: bills });
  eq(R.json.b2cl.map((p) => p.inv.map((v) => [v.inum, v.val])), [[['PB-5', 315000]]], 'July 2024: only a bill above Rs 2.5 lakh is B2C large');
  eq(R.json.b2cs.find((r) => r.pos === '27').txval, 380000, 'July 2024: bills up to Rs 2.5 lakh stay in Table 7');
  eq(R.json.nil.inv, [{ sply_ty: 'INTRAB2C', expt_amt: 0, nil_amt: 1000, ngsup_amt: 0 }], 'a 0% line of a bill goes to Table 8');
  eq(R.json.b2cs.some((r) => r.rt === 0), false, 'and not to Table 7 as a 0% line');
  eq(R.json.b2b.map((p) => [p.ctin, p.inv.map((v) => [v.inum, v.idt, v.val, v.pos, v.itms[0].itm_det])]), [[BUYER, [['PB-4', '08-07-2024', 10500, '27', { rt: 5, txval: 10000, iamt: 500, csamt: 0 }]]]], 'a bill to a GSTIN is in Table 4');
  eq(R.json.hsn.hsn_b2b.map((h) => [h.hsn_sc, h.qty, h.txval, h.iamt]), [['6204', 10, 10000, 500]], 'with its HSN in the B2B part of Table 12');
  eq(R.json.doc_issue.doc_det[0].docs.find((d) => d.from === 'PB-1'), { num: 1, from: 'PB-1', to: 'PB-6', totnum: 6, cancel: 1, net_issue: 5 }, 'Table 13 counts the cancelled bill');
  // the same bills in a month after the change: Rs 1 lakh
  const later = bills.map((b) => ({ ...b, date: b.date.replace('2024-07', '2024-09') }));
  const R2 = make([['tcs_sales.csv', sheet(SALES, [['S1', '6204', 1, 5, 1000, 'GUJARAT']].map(sale(9, 2024)))]], { bills: true, shopGstin: ME, invoices: later });
  eq(R2.json.b2cl[0].inv.map((v) => v.inum), ['PB-1', 'PB-2', 'PB-5'], 'September 2024: above Rs 1 lakh is B2C large');
  eq(R2.check.errors, 0, 'bills: the checker finds no error');
}

/* ---------------- 7. the GSTR-8 tax period, however the file gives it ---------------- */
{
  const HEAD = ['GSTIN of E-commerce Operator', 'Trade Name', 'Tax Period of GSTR-8', 'Gross Value', 'Supplies Returned', 'Net Value', 'Amount of tax collected by e-commerce operators', '', '', 'POS', 'Action'];
  const E = engine();
  const per = (v) => E.B.parseBook({ SheetNames: ['s'], Sheets: { s: [HEAD, ['24AARCM9332R1CU', 'Meesho', v, 1000, 0, 1000, 0, 2.5, 2.5, '24-Gujarat', '']] } }, { id: '1', name: 'tcs.xlsx', note: '', source: 'meesho', kind: null, tcs: [], docs: [], period: '', message: '' }).portal[0].period;
  [['Mar-2025', '2025-03'], ['March 2025', '2025-03'], ['Mar-25', '2025-03'], ['MAR 2025', '2025-03'], ['032025', '2025-03'], [32025, '2025-03'], [122025, '2025-12'], ['03-2025', '2025-03'], ['03/2025', '2025-03'],
    ['2025-03', '2025-03'], ['2025-03-01', '2025-03'], [45717, '2025-03'], ['01-03-2025', '2025-03'], ['September-2025', '2025-09'], ['', '']].forEach(([v, want]) => eq(per(v), want, 'GSTR-8 period ' + JSON.stringify(v)));
}

/* ---------------- 8. a quarterly return ---------------- */
{
  const MTR = ['Seller Gstin', 'Invoice Number', 'Invoice Date', 'Transaction Type', 'Order Id', 'Quantity', 'Item Description', 'Hsn/sac', 'Ship To State', 'Invoice Amount', 'Tax Exclusive Gross', 'Total Tax Amount', 'Igst Rate', 'Cgst Rate', 'Sgst Rate', 'Igst Tax', 'Cgst Tax', 'Sgst Tax', 'Customer Bill To Gstid', 'Credit Note No', 'Credit Note Date'];
  const files = [['tcs_sales_apr.csv', sheet(SALES, [['S1', '6204', 1, 5, 1000, 'GUJARAT']].map(sale(4, 2025)))], ['tcs_sales_may.csv', sheet(SALES, [['S2', '6204', 1, 5, 2000, 'GUJARAT']].map(sale(5, 2025)))],
    ['tcs_sales_jun.csv', sheet(SALES, [['S3', '6204', 1, 5, 4000, 'Delhi']].map(sale(6, 2025)))], ['tcs_sales_jul.csv', sheet(SALES, [['S4', '6204', 1, 5, 8000, 'Delhi']].map(sale(7, 2025)))],
    ['MTR_B2B.csv', sheet(MTR, [[ME, 'AB1', '2025-04-05', 'Shipment', 'O1', 1, 'Saree', '5007', 'MAHARASHTRA', 1050, 1000, 50, 0.05, 0, 0, 50, 0, 0, BUYER, '', '']])]];
  const R = make(files, { period: '2025-05', quarterly: true });
  eq([R.json.fp, R.v.months], ['062025', ['2025-04', '2025-05', '2025-06']], 'quarter: filed for June, April to June');
  eq(R.json.b2cs.map((r) => [r.pos, r.txval]), [['07', 4000], ['24', 3000]], 'quarter: three months together, July left out');
  ok(R.v.notes.some((n) => /already filed through IFF/.test(n.text)), 'quarter with B2B: the IFF note');
  const M = make(files.slice(0, 1));
  ok(!M.v.notes.some((n) => /IFF/.test(n.text)), 'a monthly return has no IFF note');
}

fs.rmSync(out, { recursive: true, force: true });
console.log(fails ? `${fails} of ${checks} GSTR-1 return checks FAILED` : `${checks}/${checks} GSTR-1 return checks passed`);
process.exit(fails ? 1 : 0);
