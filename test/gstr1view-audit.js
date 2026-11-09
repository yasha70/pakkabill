// Checks of the GST Tool style GSTR-1 steps (gstr1view.js): the statement of imported data, the TCS
// report against GSTR-8 (by operator PAN, month and state; returns more than sales still compared;
// B2B through the operator counted), large B2C invoices, the portal-style table summary, the bridge
// from reports to the return, trimming optional tables, and the GSTR-1 Excel in the offline-tool format.
// Run: node test/gstr1view-audit.js   (exits 1 on any failure)
'use strict';
const G = require('../gstr1check.js');
const V = require('../gstr1view.js');

let fails = 0, checks = 0;
function ok(cond, what, detail) { checks++; if (!cond) { fails++; console.log('FAIL  ' + what + (detail ? '  ' + detail : '')); } }
function eq(a, b, what) { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, what, `expected ${B}, got ${A}`); }

const g = (s) => s + G.gstinCheckChar(s);
const MEESHO = g('24AARCM9332R1C'), AMAZON = g('24AAICA3918J1C'), AMAZON_REAL = g('24AAICA3918J2C'), BUYER = g('27AAACB2222C1Z');
const row = (o) => ({ kind: 'sales', source: 'meesho', bucket: 'main', buyerGstin: '', invNo: '', cnNo: '', etin: '', hsn: '6204', qty: 1, rate: 5, taxable: 0, tax: 0, total: 0, pos: '24', period: '2025-03', ...o });
const rows = [
  row({ taxable: 1000, tax: 50, pos: '24' }),
  row({ taxable: 2000, tax: 100, pos: '27' }),
  row({ taxable: 500, tax: 60, rate: 12, pos: '07', hsn: '6109' }),
  row({ taxable: 300, tax: 15, pos: '29' }),
  row({ kind: 'returns', taxable: 400, tax: 20, pos: '27' }),
  row({ kind: 'returns', taxable: 800, tax: 40, pos: '29' }),
  row({ taxable: 999, tax: 50, pos: '29', period: '2025-02' }), // another month
  row({ taxable: 70, tax: 0, rate: 0, pos: '24' }), // nil rated
  row({ source: 'amazon', taxable: 10000, tax: 1800, rate: 18, pos: '27', buyerGstin: BUYER, invNo: 'AMZ-1', hsn: '5007', total: 11800 }),
  row({ source: 'amazon', kind: 'returns', taxable: 2000, tax: 360, rate: 18, pos: '27', buyerGstin: BUYER, invNo: 'CN-AMZ-1', cnNo: 'CN-AMZ-1', hsn: '5007' }),
  row({ source: 'amazon', taxable: 1000, tax: 50, pos: '24', invNo: 'AMZ-2' }),
];
const ebs = { meesho: MEESHO, amazon: AMAZON };

/* statement */
const st = V.statement(rows, { home: '24', months: ['2025-03'] });
const me = st.platforms.find((p) => p.source === 'meesho'), mar = me.months.find((m) => m.period === '2025-03');
eq([mar.sales.n, mar.sales.txval, mar.returns.txval, mar.net.txval], [5, 3870, 1200, 2670], 'statement: Meesho March sales, returns and net (nil included)');
eq([mar.net.iamt, mar.net.camt, mar.net.samt], [115, 25, 25], 'statement: IGST for other states, CGST and SGST split in the home state');
eq(mar.nil, 70, 'statement: nil-rated column');
ok(me.months.some((m) => m.period === '2025-02' && !m.inReturn), 'statement: another month is listed but marked out of the return');
eq(me.total.net.txval, 2670, 'statement: platform total counts only the return months');
const am = st.platforms.find((p) => p.source === 'amazon').months[0];
eq([am.b2b, am.b2c, am.cdnr], [10000, 1000, 2000], 'statement: B2B, B2C and credit notes to registered buyers');

/* TCS report */
const P = (etin, gross, ret, pos, period = '2025-03') => ({ etin, period, gross, returned: ret, net: gross - ret, igst: (gross - ret) * 0.005, cgst: 0, sgst: 0, pos });
const portal = [P(MEESHO, 1000, 0, '24'), P(MEESHO, 2000, 400, '27'), P(MEESHO, 600, 0, '07'), P(MEESHO, 300, 800, '29'), P(AMAZON_REAL, 10000, 2000, '27'), P(AMAZON_REAL, 1000, 0, '24'), P(MEESHO, 5, 0, '24', '2025-01')];
const T = V.tcsReport(rows, portal, { months: ['2025-03'], etinBySource: ebs });
const mg = T.groups.find((x) => x.name === 'Meesho'), ag = T.groups.find((x) => x.name === 'Amazon');
eq([mg.total.net, mg.total.pnet, mg.total.diff, mg.total.status], [2600, 2700, -100, 'diff'], 'tcs: Meesho net, GSTR-8 net, difference (nil rows left out)');
eq(mg.lines.filter((L) => L.status === 'diff').map((L) => L.pos), ['07'], 'tcs: only Delhi differs');
const ka = mg.lines.find((L) => L.pos === '29');
eq([ka.ours.net, ka.portal.net, ka.status], [-500, -500, 'match'], 'tcs: a state where returns are more than sales still matches GSTR-8');
eq([ag.total.net, ag.total.status], [9000, 'match'], 'tcs: Amazon B2B sale and credit note count, matched by PAN although the TCS GSTIN differs');
eq(T.gstinMismatch.map((x) => x.portal), [AMAZON_REAL], 'tcs: the different operator GSTIN is pointed out');
eq(T.otherMonths, 1, 'tcs: GSTR-8 rows of other months are counted, not compared');
eq(mg.lines.find((L) => L.pos === '27').tcsDue, 8, 'tcs: 0.5% TCS due on the net value');
eq([V.tcsRate('2024-06'), V.tcsRate('2024-07'), V.tcsRate('2024-08')], [0.01, null, 0.005], 'tcs: rate 1% before July 2024, 0.5% after, July itself not judged');
const T0 = V.tcsReport(rows, [], { months: ['2025-03'], etinBySource: ebs });
eq([T0.hasPortal, T0.groups[0].total.status], [false, 'noportal'], 'tcs: without the portal file nothing is called a difference');
eq(V.tcsReport(rows, portal, { months: ['2025-03'], etinBySource: ebs, tolerance: 200 }).groups.find((x) => x.name === 'Meesho').total.status, 'match', 'tcs: tolerance is respected');

/* B2CL candidates */
eq(V.b2clCandidates([...rows, row({ source: 'amazon', invNo: 'BIG', taxable: 90000, tax: 16200, rate: 18, pos: '07', total: 106200 })], { home: '24', months: ['2025-03'] }).map((x) => x.invNo), ['BIG'], 'b2cl: inter-state unregistered invoice over 1 lakh');

/* summary, totals, bridge, trim */
const json = {
  gstin: g('24ABCDE1234F1Z'), fp: '032025', version: 'GST3.2.4', hash: 'hash',
  b2b: [{ ctin: BUYER, inv: [{ inum: 'AMZ-1', idt: '05-03-2025', val: 11800, pos: '27', rchrg: 'N', inv_typ: 'R', itms: [{ num: 1, itm_det: { rt: 18, txval: 10000, iamt: 1800, csamt: 0 } }] }] }],
  cdnr: [{ ctin: BUYER, nt: [{ ntty: 'C', nt_num: 'CN-AMZ-1', nt_dt: '25-03-2025', pos: '27', rchrg: 'N', inv_typ: 'R', val: 2360, itms: [{ num: 1, itm_det: { rt: 18, txval: 2000, iamt: 360, csamt: 0 } }] }] }],
  b2cs: [{ sply_ty: 'INTRA', rt: 5, typ: 'OE', pos: '24', txval: 2000, camt: 50, samt: 50, csamt: 0 }, { sply_ty: 'INTER', rt: 5, typ: 'OE', pos: '27', txval: 1600, iamt: 80, csamt: 0 }, { sply_ty: 'INTER', rt: 12, typ: 'OE', pos: '07', txval: 500, iamt: 60, csamt: 0 }],
  nil: { inv: [{ sply_ty: 'INTRAB2C', nil_amt: 70, expt_amt: 0, ngsup_amt: 0 }] },
  hsn: { hsn_b2b: [{ hsn_sc: '5007', desc: 'Saree', uqc: 'PCS', qty: 1, rt: 18, txval: 8000, iamt: 1440, camt: 0, samt: 0, csamt: 0, num: 1 }], hsn_b2c: [{ hsn_sc: '6204', desc: 'Kurti', uqc: 'PCS', qty: 3, rt: 5, txval: 3600, iamt: 80, camt: 50, samt: 50, csamt: 0, num: 1 }] },
  doc_issue: { doc_det: [{ doc_num: 1, doc_typ: 'Invoices for outward supply', docs: [{ num: 1, from: 'A1', to: 'A9', totnum: 9, cancel: 1, net_issue: 8 }] }] },
  supeco: { clttx: [{ etin: MEESHO, suppval: 3100, igst: 140, cgst: 25, sgst: 25, cess: 0, flag: 'N' }] },
};
const S = V.summary(json), k = (x) => S.find((t) => t.key === x);
eq([k('b2b').n, k('b2b').txval, k('b2b').val], [1, 10000, 11800], 'summary: 4A records, value, invoice value');
eq([k('b2cs').n, k('b2cs').txval, k('b2cs').iamt, k('b2cs').camt], [3, 4100, 140, 50], 'summary: 7 B2CS');
eq([k('cdnr').n, k('cdnr').txval], [1, 2000], 'summary: 9B CDNR');
eq([k('docs').n, k('docs').issued, k('docs').net], [1, 9, 8], 'summary: 13 documents');
eq(k('eco').txval, 3100, 'summary: 14 ECO');
eq(V.returnTotals(json), { txval: 12100, iamt: 1580, camt: 50, samt: 50, nil: 70 }, 'totals: Tables 4 + 7 less credit notes, nil apart');
const Z = { json, carryOut: [{ pos: '29', rate: 5, txval: -500, tax: -25 }], carryIn: [], portalAdj: 0 };
const Bd = V.bridge(rows, Z, { months: ['2025-03'] });
eq([Bd.steps.map((s) => s.key), Bd.gstr1, Bd.unexplained], [['reports', 'carryOut'], 12100, 0], 'bridge: reports less the carried returns equal the return');
ok(V.bridge(rows, { ...Z, carryOut: [] }, { months: ['2025-03'] }).unexplained === 500, 'bridge: a missing step shows as not explained');
const tj = V.trimJson(json, { hsnB2c: false, docs: false });
ok(!tj.doc_issue && !tj.hsn.hsn_b2c && tj.hsn.hsn_b2b.length === 1 && json.doc_issue, 'trim: B2C HSN and documents left out of a copy only');

/* Excel in the offline-tool format: read the stored zip back */
const bytes = V.offlineWorkbook(json), txt = Buffer.from(bytes).toString('utf8');
ok(bytes && bytes[0] === 0x50 && bytes[1] === 0x4b, 'excel: a zip (xlsx)');
['b2b,sez,de', 'b2cl', 'b2cs', 'cdnr', 'exemp', 'hsn(b2b)', 'hsn(b2c)', 'docs', 'eco'].forEach((n) => ok(txt.includes(`name="${n}"`), `excel: sheet ${n}`));
['GSTIN/UIN of Recipient', 'Summary For B2CS(7)', '27-Maharashtra', '05-Mar-2025', 'Regular B2B', 'PCS-PIECES', 'Liable to collect tax u/s 52(TCS)', 'Note Supply Type', 'Intra-State supplies to unregistered persons'].forEach((s) => ok(txt.includes(s), `excel: has "${s}"`));

/* the engine still reads a GSTR-1 JSON the portal checker accepts */
const R = G.check(json, { marketplace: true });
eq(R.errors, 0, 'checker: the sample return has no errors (CDNR accepted)');

console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
