// Checks of the GSTR-1 JSON checker (gstr1check.js): GSTIN check digits, document series, every
// portal rule on a clean file and on files broken one rule at a time, the safe clean-up (never an
// amount), and comparing two files. Run: node test/gstr1-audit.js   (exits 1 on any failure)
'use strict';
const G = require('../gstr1check.js');

let fails = 0, checks = 0;
function ok(cond, what, detail) { checks++; if (!cond) { fails++; console.log('FAIL  ' + what + (detail ? '  ' + detail : '')); } }
function eq(a, b, what) { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, what, `expected ${B}, got ${A}`); }
const clone = (x) => JSON.parse(JSON.stringify(x));
const has = (R, re, lvl) => R.issues.some((x) => re.test(x.msg) && (!lvl || x.lvl === lvl));

/* GSTIN check digits */
ok(G.gstinOk('23AZYPA2461L1Z4'), 'GSTIN: a real seller GSTIN passes');
ok(G.gstinOk('23AARCM9332R1CW'), 'GSTIN: Meesho\'s Madhya Pradesh TCS GSTIN passes');
ok(G.gstinOk('27AAPFU0939F1ZV'), 'GSTIN: a published example passes');
ok(!G.gstinOk('23AZYPA2461L1Z5'), 'GSTIN: a wrong check digit fails');
ok(!G.gstinOk('23AZYPA2461L1Z'), 'GSTIN: 14 characters fail');
ok(!G.gstinOk('2AZYPA2461L1Z4X'), 'GSTIN: a bad pattern fails');

/* document series */
const sp = (list) => G.splitSeries(list).map((x) => [x.s, x.prefix, x.n]);
eq(sp(['rsium274899', 'rsium2712640']), [['rsium274899', 'rsium27', 4899], ['rsium2712640', 'rsium27', 12640]], 'series: a number growing from 4 to 5 digits keeps the series rsium27');
eq(sp(['rsium279999', 'rsium2710000']), [['rsium279999', 'rsium27', 9999], ['rsium2710000', 'rsium27', 10000]], 'series: 9999 then 10000');
eq(sp(['INV0099', 'INV0100']), [['INV0099', 'INV0', 99], ['INV0100', 'INV0', 100]], 'series: zero-padded numbers stay in order');
eq(sp(['rsium27C2235', 'rsium27CM339']).map((x) => x[1]), ['rsium27C', 'rsium27CM'], 'series: C and CM credit notes are two series');
eq(G.rangesOf([{ from: 'rsium277697', to: 'rsium2712640' }, { from: 'rsium2712495', to: 'rsium2718596' }]), [{ prefix: 'rsium27', lo: 7697, hi: 12640 }, { prefix: 'rsium27', lo: 12495, hi: 18596 }], 'series: ranges read together find rsium27 (alone, 12495 to 18596 looks like series rsium271)');
eq(G.covered([{ prefix: 'A', lo: 1, hi: 10 }, { prefix: 'A', lo: 5, hi: 20 }, { prefix: 'B', lo: 1, hi: 5 }]), 25, 'series: overlapping ranges are counted once');

/* a clean file: no errors, no warnings */
const GOOD = {
  gstin: '23AZYPA2461L1Z4', fp: '092026', version: 'GST3.2.4', hash: 'hash',
  b2b: [{ ctin: '27AAPFU0939F1ZV', inv: [{ inum: 'RBH/26-27/0001', idt: '15-09-2026', val: 10500, pos: '27', rchrg: 'N', inv_typ: 'R', itms: [{ num: 1, itm_det: { rt: 5, txval: 10000, iamt: 500, csamt: 0 } }] }] }],
  b2cl: [{ pos: '29', inv: [{ inum: 'RBH/26-27/0002', idt: '20-09-2026', val: 210000, itms: [{ num: 1, itm_det: { rt: 5, txval: 200000, iamt: 10000, csamt: 0 } }] }] }],
  b2cs: [
    { sply_ty: 'INTER', rt: 5, typ: 'OE', pos: '27', txval: 50000, iamt: 2500, csamt: 0 },
    { sply_ty: 'INTRA', rt: 5, typ: 'OE', pos: '23', txval: 20000, camt: 500, samt: 500, csamt: 0 },
  ],
  hsn: {
    hsn_b2b: [{ num: 1, hsn_sc: '6206', desc: 'Blouses', uqc: 'PCS', qty: 10, rt: 5, txval: 10000, iamt: 500, camt: 0, samt: 0, csamt: 0 }],
    hsn_b2c: [{ num: 1, hsn_sc: '6206', desc: 'Blouses', uqc: 'PCS', qty: 300, rt: 5, txval: 270000, iamt: 12500, camt: 500, samt: 500, csamt: 0 }],
  },
  doc_issue: { doc_det: [
    { doc_num: 1, doc_typ: 'Invoices for outward supply', docs: [{ num: 1, from: 'rsium274899', to: 'rsium2718596', totnum: 13698, cancel: 0, net_issue: 13698 }] },
    { doc_num: 5, doc_typ: 'Credit Note', docs: [{ num: 1, from: 'rsium27C1324', to: 'rsium27C5397', totnum: 4074, cancel: 0, net_issue: 4074 }] },
  ] },
  supeco: { clttx: [{ etin: '23AARCM9332R1CW', suppval: 70000, igst: 2500, cgst: 500, sgst: 500, cess: 0, flag: 'N' }] },
};
const R0 = G.check(GOOD, { marketplace: true });
eq([R0.errors, R0.warns], [0, 0], 'a clean file: no errors, no warnings');
if (R0.errors || R0.warns) R0.issues.forEach((x) => console.log('   ', x.lvl, x.msg));
eq(R0.totals.b2cs.txval, 70000, 'totals: Table 7 taxable');
eq([R0.threeB.a31.txval, R0.threeB.a31.iamt, R0.threeB.a31.camt], [280000, 13000, 500], 'GSTR-3B 3.1(a): Tables 4, 5 and 7 together');
eq(R0.threeB.a32.map((u) => [u.pos, u.txval]), [['27', 50000], ['29', 200000]], 'GSTR-3B 3.2: inter-state B2C by state, B2CL included');

/* one rule broken at a time */
function broken(fn, re, lvl, what) {
  const J = clone(GOOD); fn(J);
  const R = G.check(J, { marketplace: true });
  ok(has(R, re, lvl), what, R.issues.map((x) => x.lvl + ': ' + x.msg).join(' / ') || 'no issue');
}
broken((J) => { J.gstin = '23AZYPA2461L1Z5'; }, /check digit/, 'error', 'header: a wrong GSTIN check digit');
broken((J) => { J.fp = '132026'; }, /Return period/, 'error', 'header: month 13');
broken((J) => { J.b2cs[0].sply_ty = 'INTRA'; }, /supply type is INTRA/, 'error', 'Table 7: INTRA for another state');
broken((J) => { J.b2cs[1] = { ...J.b2cs[1], iamt: 1000, camt: 0, samt: 0 }; }, /IGST is filled/, 'error', 'Table 7: IGST within the state');
broken((J) => { J.b2cs[1].samt = 501; }, /must be equal/, 'error', 'Table 7: CGST and SGST not equal');
broken((J) => { J.b2cs[0].iamt = 2510; }, /IGST .* more than 5%/, 'warn', 'Table 7: IGST Rs 10 over rate x value');
broken((J) => { J.b2cs[0].pos = '28'; }, /no longer exists. Use 37/, 'error', 'Table 7: old Andhra Pradesh code 28');
broken((J) => { J.b2cs[0].pos = '99'; }, /not a state code/, 'error', 'Table 7: state code 99');
broken((J) => { J.b2cs.push(clone(J.b2cs[0])); }, /appear twice/, 'error', 'Table 7: the same state and rate twice');
broken((J) => { J.b2cs[0].etin = '23AARCM9332R1CW'; }, /type OE must not have/, 'error', 'Table 7: OE with an operator GSTIN');
broken((J) => { J.b2cs[0].rt = 13; }, /not a GST rate/, 'error', 'Table 7: 13% is not a rate');
broken((J) => { J.b2cs[0].txval = 50000.123; }, /at most 2 decimals/, 'error', 'amounts: three decimals');
broken((J) => { J.b2cl[0].inv[0].val = 90000; J.b2cl[0].inv[0].itms[0].itm_det = { rt: 5, txval: 85714.29, iamt: 4285.71, csamt: 0 }; }, /belongs in B2C/, 'warn', 'Table 5: Rs 90,000 is not B2C large');
broken((J) => { J.b2cl[0].pos = '23'; }, /only for sales to other states/, 'error', 'Table 5: B2CL within the state');
broken((J) => { J.b2b[0].ctin = '27AAPFU0939F1ZX'; }, /Buyer GSTIN .* not valid/, 'error', 'Table 4: buyer GSTIN check digit');
broken((J) => { J.b2b[0].inv[0].inum = 'RBH/2026-27/00001'; }, /not allowed/, 'error', 'Table 4: invoice number of 17 characters');
broken((J) => { J.b2cl[0].inv[0].inum = J.b2b[0].inv[0].inum; }, /used twice/, 'error', 'Tables 4 and 5: one invoice number twice');
broken((J) => { J.b2b[0].inv[0].idt = '01-10-2026'; }, /after the return period/, 'error', 'Table 4: invoice dated after the period');
broken((J) => { J.b2b[0].inv[0].idt = '31-09-2026'; }, /must be DD-MM-YYYY/, 'error', 'Table 4: 31 September');
broken((J) => { delete J.hsn; }, /Table 12 \(HSN summary\) is missing/, 'error', 'Table 12: missing');
broken((J) => { J.hsn = { data: J.hsn.hsn_b2c }; }, /old single list/, 'error', 'Table 12: old format without the B2B/B2C split');
broken((J) => { J.hsn.hsn_b2c[0].hsn_sc = '62'; }, /4, 6 or 8 digits/, 'error', 'Table 12: a 2-digit HSN');
broken((J) => { J.hsn.hsn_b2c[0].uqc = 'PIECES'; }, /not a GST unit/, 'error', 'Table 12: unit PIECES');
broken((J) => { J.hsn.hsn_b2c[0].txval = 260000; }, /Table 12 B2C adds up to/, 'warn', 'Table 12: B2C short of the sales');
broken((J) => { J.hsn.hsn_b2b[0].txval = 9000; }, /Table 12 B2B adds up to/, 'warn', 'Table 12: B2B short of the invoices');
broken((J) => { J.doc_issue.doc_det[0].docs[0].net_issue = 1; }, /net issued 1 must be/, 'error', 'Table 13: net issued wrong');
broken((J) => { J.doc_issue.doc_det[0].docs[0].totnum = 20000; J.doc_issue.doc_det[0].docs[0].net_issue = 20000; }, /cannot fit/, 'error', 'Table 13: more documents than numbers');
broken((J) => { J.doc_issue.doc_det[0].docs = [{ num: 1, from: 'rsium277697', to: 'rsium2712640', totnum: 4799, cancel: 0, net_issue: 4799 }, { num: 2, from: 'rsium2712495', to: 'rsium2718596', totnum: 5875, cancel: 0, net_issue: 5875 }]; }, /ranges overlaps/, 'warn', 'Table 13: overlapping monthly ranges of one series');
broken((J) => { J.doc_issue.doc_det[1].doc_typ = 'Credit notes'; }, /the portal calls it "Credit Note"/, 'info', 'Table 13: document type name');
broken((J) => { J.doc_issue.doc_det[0].doc_num = 13; }, /does not exist/, 'error', 'Table 13: document type 13');
broken((J) => { J.supeco.clttx[0].etin = '23AZYPA2461L1Z4'; }, /not an e-commerce TCS registration/, 'error', 'Table 14: a normal GSTIN as operator');
broken((J) => { J.supeco.clttx[0].suppval = 400000; }, /more than all the sales/, 'warn', 'Table 14: more than all sales');
broken((J) => { J.fp = '122025'; J.b2cs[0].rt = 12; J.b2cs[0].iamt = 6000; J.supeco.clttx[0].igst = 6000; J.b2b[0].inv[0].idt = '15-12-2025'; J.b2cl[0].inv[0].idt = '20-12-2025'; }, /12% after September 2025/, 'info', 'rates: 12% after the September 2025 GST change is flagged to check');
broken((J) => { J.b2cs[0].rt = 0; J.b2cs[0].iamt = 0; }, /belongs in nil-rated/, 'warn', 'Table 7: a 0% line');
broken((J) => { J.extra = 1; }, /Unknown section/, 'warn', 'header: an unknown section');
broken((J) => { J.b2cs[0].txval = -100; J.b2cs[0].iamt = -5; }, /Negative B2C lines.*do not take negative values/, 'error', 'Table 7: negative after returns is refused by the portal');
broken((J) => { J.hsn.hsn_b2c[0].qty = -3; }, /negative after returns/, 'error', 'Table 12: a negative HSN line is refused');
broken((J) => { J.supeco.clttx[0].suppval = -5; }, /negative value/, 'error', 'Table 14: a negative value is refused');
broken((J) => { J.version = 'GST3.1.6'; }, /version GST3\.1\.6.*3\.2\.4/, 'warn', 'header: a file made for an old offline tool');
broken((J) => { J.b2cs[0].typ = 'E'; J.b2cs[0].etin = '23AARCM9332R1CW'; }, /type E/, 'info', 'Table 7: type E is noted, Table 14 is the place now');
{
  const J = clone(GOOD); J.b2cs[0].iamt = 2500.9;
  ok(!G.check(J).issues.some((x) => /IGST/.test(x.msg)), 'Table 7: Rs 0.90 of rounding is accepted');
  const J2 = clone(GOOD); J2.fp = '082026';
  ok(G.check(J2, { quarterly: true }).issues.some((x) => /last month of the quarter/.test(x.msg)), 'header: quarterly return in August');
}

/* the file a seller made with another tool (Meesho, Jul-Sep 2026) */
const OTHER = {
  gstin: '23AZYPA2461L1Z4', fp: '092026', version: 'GST3.1.6', hash: 'hash',
  b2cs: [
    { sply_ty: 'INTER', rt: 5, typ: 'OE', pos: '37', txval: 338518.73, iamt: 16925.99, csamt: 0 },
    { sply_ty: 'INTRA', rt: 5, typ: 'OE', pos: '23', txval: 51504.61, camt: 1287.61, samt: 1287.61, csamt: 0 },
    { sply_ty: 'INTER', rt: 5, typ: 'OE', pos: '11', txval: 0, iamt: 0, csamt: 0 },
  ],
  supeco: { clttx: [{ etin: '23AARCM9332R1CW', suppval: 390023.34, igst: 16925.99, cgst: 1287.61, sgst: 1287.61, cess: 0, flag: 'N' }] },
  doc_issue: { doc_det: [
    { doc_num: 1, doc_typ: 'Invoices for outward supply', docs: [
      { num: 1, from: 'rsium277697', to: 'rsium2712640', totnum: 4799, cancel: 0, net_issue: 4799 },
      { num: 2, from: 'rsium2712495', to: 'rsium2718596', totnum: 5875, cancel: 0, net_issue: 5875 },
      { num: 3, from: 'rsium274899', to: 'rsium277696', totnum: 2793, cancel: 0, net_issue: 2793 }] },
    { doc_num: 5, doc_typ: 'Credit Note', docs: [
      { num: 1, from: 'rsium27C2235', to: 'rsium27C5192', totnum: 1296, cancel: 0, net_issue: 1296 },
      { num: 2, from: 'rsium27CM339', to: 'rsium27CM488', totnum: 143, cancel: 0, net_issue: 143 },
      { num: 3, from: 'rsium27C3354', to: 'rsium27C5397', totnum: 1533, cancel: 0, net_issue: 1533 },
      { num: 4, from: 'rsium27CM475', to: 'rsium27CM648', totnum: 153, cancel: 0, net_issue: 153 },
      { num: 5, from: 'rsium27C1324', to: 'rsium27C3353', totnum: 755, cancel: 0, net_issue: 755 },
      { num: 6, from: 'rsium27CM215', to: 'rsium27CM371', totnum: 111, cancel: 0, net_issue: 111 }] }] },
};
const RO = G.check(OTHER, { marketplace: true });
eq(RO.issues.filter((x) => x.lvl === 'error').map((x) => x.table), ['hsn'], 'other tool\'s file: the one error is the missing Table 12');
ok(RO.issues.filter((x) => x.lvl === 'warn' && /overlap/.test(x.msg)).length === 2, 'other tool\'s file: overlapping invoice and credit note ranges');
ok(has(RO, /all zero/, 'info'), 'other tool\'s file: the all-zero Sikkim line');
ok(has(RO, /13,698 numbers and 13,467 documents/, 'info'), 'other tool\'s file: numbers in the ranges not counted, for the whole quarter');
ok(has(RO, /Table 14 matches/, 'ok'), 'other tool\'s file: Table 14 matches Table 7 within a rupee');

/* clean: safe fixes only */
const C = G.clean(OTHER);
eq(C.json.b2cs.length, 2, 'clean: the zero line is dropped');
eq(C.json.doc_issue.doc_det[0].docs, [{ num: 1, from: 'rsium274899', to: 'rsium2718596', totnum: 13467, cancel: 0, net_issue: 13467 }], 'clean: three monthly invoice ranges become one, count kept');
eq(C.json.doc_issue.doc_det[1].docs.map((d) => [d.from, d.to, d.totnum]), [['rsium27C1324', 'rsium27C5397', 3584], ['rsium27CM215', 'rsium27CM648', 407]], 'clean: credit notes, one range per series, counts kept');
const RC = G.check(C.json, { marketplace: true });
eq([RC.errors, RC.warns], [1, 1], 'clean: only the missing Table 12 and the old version are left');
eq([RC.totals.b2cs.txval, RC.totals.b2cs.iamt, RC.totals.supeco.txval], [RO.totals.b2cs.txval, RO.totals.b2cs.iamt, RO.totals.supeco.txval], 'clean: no amount changes');
eq(G.clean(GOOD).changes, [], 'clean: a clean file is left as it is');

/* the Excel workbook for a CA */
{
  const wb = G.workbook(GOOD, { carryOut: [{ pos: '11', rate: 5, etin: '23AARCM9332R1CW', txval: -1000, tax: -50, qty: -2 }] });
  ok(wb[0] === 0x50 && wb[1] === 0x4b, 'Excel: a zip file');
  const txt = Buffer.from(wb).toString('latin1');
  for (const sh of ['Summary', 'Table 7 B2C', 'Table 4 B2B', 'Table 5 B2C large', 'Table 12 HSN B2C', 'Table 12 HSN B2B', 'Table 13 Documents', 'Table 14 E-commerce', 'GSTR-3B', 'Carried to next return', 'Checks']) ok(txt.includes(`name="${sh}"`), 'Excel: sheet ' + sh);
  ok(txt.includes('<v>50000</v>') && txt.includes('Maharashtra'), 'Excel: Table 7 values and state names');
  // the zip reads back: every stored file's CRC matches
  let pos = 0, files = 0, okCrc = true;
  while (wb[pos] === 0x50 && wb[pos + 1] === 0x4b && wb[pos + 2] === 3) {
    const crc = wb.readUInt32LE ? null : null; // Uint8Array: read by hand
    const u32 = (o) => (wb[o] | (wb[o + 1] << 8) | (wb[o + 2] << 16) | (wb[o + 3] << 24)) >>> 0, u16 = (o) => wb[o] | (wb[o + 1] << 8);
    const size = u32(pos + 18), nl = u16(pos + 26), data = wb.subarray(pos + 30 + nl, pos + 30 + nl + size);
    if (G.crc32(data) !== u32(pos + 14)) okCrc = false;
    void crc; files++; pos += 30 + nl + size;
  }
  ok(files >= 15 && okCrc, 'Excel: every part stored with the right CRC', files + ' files');
  eq(G.crc32(new TextEncoder().encode('123456789')), 0xcbf43926, 'zip: CRC-32 of the standard test string');
}

/* compare */
eq(G.compare(GOOD, clone(GOOD)).differ.length, 0, 'compare: a file with itself has no differences');
{
  const J = clone(GOOD); J.b2cs[0].txval = 50100; J.b2cs[0].iamt = 2505;
  const D = G.compare(GOOD, J).differ.map((r) => r.label);
  ok(D.includes('Maharashtra 5%: taxable value') && D.includes('B2C (Table 7): taxable value'), 'compare: a changed state shows in totals and by state', D.join(', '));
}

console.log(`${checks - fails}/${checks} GSTR-1 checker checks passed`);
process.exit(fails ? 1 : 0);
