// PakkaBill: the GSTR-1 page laid out the way the marketplace GST tools (GST Tool and others) work:
// GST Profile, Import Data, Statement of imported data, TCS Report (your reports against the operators'
// GSTR-8) and GSTR-1 Report (table summary as the portal shows it, GSTR-1 Excel in the government
// offline-tool format and the JSON). It adds steps over the existing GSTR-1 page, never changes an amount.
// The page calls window.pbGstr1ViewMount(el, data) on every render. window.PBG1V is the engine (tested in Node).
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const G = () => root.PBG1 || {};

  /* ======================================================= engine (no DOM) */

  const r2 = (v) => { const n = Number(v) || 0; return (n < 0 ? -1 : 1) * Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100; };
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const OPS = { AARCM9332R: 'Meesho', AAICA3918J: 'Amazon', AACCF0683K: 'Flipkart' };
  const SRC = { meesho: 'Meesho', amazon: 'Amazon', flipkart: 'Flipkart', carry: 'Carried from last return' };
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pan = (g) => String(g || '').slice(2, 12);
  const opName = (g) => OPS[pan(g)] || g || 'Operator';
  const monthName = (p) => (p && /^\d{4}-\d{2}$/.test(p) ? `${MON[+p.slice(5, 7) - 1]} ${p.slice(0, 4)}` : p || 'Month unknown');
  const zero = () => ({ n: 0, txval: 0, iamt: 0, camt: 0, samt: 0, val: 0 });
  const addTo = (t, r, home, sign) => {
    const s = sign || 1, inter = r.pos && r.pos !== home;
    t.n++; t.txval += s * num(r.taxable); t.val += s * (num(r.total) || num(r.taxable) + num(r.tax));
    if (inter) t.iamt += s * num(r.tax); else { t.camt += s * num(r.tax) / 2; t.samt += s * num(r.tax) / 2; }
    return t;
  };
  const round = (t) => ({ ...t, txval: r2(t.txval), iamt: r2(t.iamt), camt: r2(t.camt), samt: r2(t.samt), val: r2(t.val) });
  const isB2B = (r) => !!(r.buyerGstin && r.invNo);
  const isNil = (r) => !num(r.rate) && !num(r.tax);

  // Statement of imported data: for every platform and month, sales, returns and net with tax, and the
  // split the GSTR-1 needs (B2B, B2C, credit notes, nil rated, HSN). rows: the report rows of the page.
  function statement(rows, opts) {
    const home = (opts && opts.home) || '', months = new Set((opts && opts.months) || []);
    const by = new Map();
    (rows || []).forEach((r) => {
      if (!r || r.source === 'carry') return;
      const key = r.source + '|' + (r.period || '');
      const m = by.get(key) || { source: r.source, period: r.period || '', inReturn: months.has(r.period), sales: zero(), returns: zero(), net: zero(), b2b: 0, b2c: 0, cdnr: 0, nil: 0, hsn: 0, noState: 0, rows: [] };
      const ret = r.kind === 'returns', s = ret ? -1 : 1;
      addTo(ret ? m.returns : m.sales, r, home, 1);
      addTo(m.net, r, home, s);
      const tx = s * num(r.taxable);
      if (!r.pos) m.noState++;
      if (isNil(r)) m.nil += tx;
      else if (isB2B(r)) { if (ret) m.cdnr += num(r.taxable); else m.b2b += tx; }
      else m.b2c += tx;
      if (r.hsn) m.hsn += tx;
      m.rows.push(r);
      by.set(key, m);
    });
    const list = [...by.values()].map((m) => ({ ...m, sales: round(m.sales), returns: round(m.returns), net: round(m.net), b2b: r2(m.b2b), b2c: r2(m.b2c), cdnr: r2(m.cdnr), nil: r2(m.nil), hsn: r2(m.hsn) }))
      .sort((a, b) => a.source.localeCompare(b.source) || String(b.period).localeCompare(String(a.period)));
    const platforms = [...new Set(list.map((m) => m.source))].map((src) => {
      const ms = list.filter((m) => m.source === src), inR = ms.filter((m) => m.inReturn);
      const tot = (k) => round(inR.reduce((t, m) => ({ n: t.n + m[k].n, txval: t.txval + m[k].txval, iamt: t.iamt + m[k].iamt, camt: t.camt + m[k].camt, samt: t.samt + m[k].samt, val: t.val + m[k].val }), zero()));
      return { source: src, name: SRC[src] || src, months: ms, total: { sales: tot('sales'), returns: tot('returns'), net: tot('net') } };
    });
    return { platforms, months: list };
  }

  // TCS rate on the net value of supplies (section 52): 1% until 9 July 2024, 0.5% from 10 July 2024.
  const tcsRate = (p) => (!p ? null : p < '2024-07' ? 0.01 : p > '2024-07' ? 0.005 : null);

  // TCS Report: your reports against what each operator reported in GSTR-8 (the portal's "TDS and TCS
  // credit received" file), by operator, month and state. Operators are matched by their PAN, so a
  // different TCS registration number in the same state still matches.
  function tcsReport(rows, portal, opts) {
    const o = opts || {}, months = new Set(o.months || []), ebs = o.etinBySource || {};
    const tol = o.tolerance == null ? 1 : o.tolerance;
    const lines = new Map(), ops = new Map();
    const line = (op, period, pos) => {
      const k = op + '|' + period + '|' + pos;
      return lines.get(k) || lines.set(k, { op, period, pos, stateRaw: '', ours: { gross: 0, returns: 0, net: 0, tax: 0, n: 0 }, portal: null }).get(k);
    };
    const opOf = (etin, src) => {
      const p = pan(etin);
      if (!ops.has(p)) ops.set(p, { pan: p, etin, name: OPS[p] || SRC[src] || etin, sources: new Set(), portalEtin: '' });
      if (src) ops.get(p).sources.add(src);
      return ops.get(p);
    };
    let skippedNil = 0, noOperator = 0, noState = 0;
    (rows || []).forEach((r) => {
      if (!r || r.source === 'carry' || !months.has(r.period)) return;
      const etin = r.etin || ebs[r.source] || '';
      if (!etin) { noOperator++; return; }
      if (isNil(r)) { skippedNil++; return; }
      if (!r.pos) { noState++; return; }
      const op = opOf(etin, r.source), L = line(op.pan, r.period, r.pos), ret = r.kind === 'returns';
      L.ours.n++;
      if (ret) L.ours.returns += num(r.taxable); else L.ours.gross += num(r.taxable);
      L.ours.net += (ret ? -1 : 1) * num(r.taxable);
      L.ours.tax += (ret ? -1 : 1) * num(r.tax);
    });
    let otherMonths = 0;
    (portal || []).forEach((p) => {
      if (!p || !p.etin) return;
      if (!months.has(p.period)) { otherMonths++; return; }
      const op = opOf(p.etin); op.portalEtin = p.etin;
      const L = line(op.pan, p.period, p.pos || '?');
      L.stateRaw = L.stateRaw || p.stateRaw || '';
      L.portal = L.portal || { gross: 0, returned: 0, net: 0, igst: 0, cgst: 0, sgst: 0, tcs: 0, n: 0 };
      L.portal.n++; L.portal.gross += num(p.gross); L.portal.returned += num(p.returned); L.portal.net += num(p.net);
      L.portal.igst += num(p.igst); L.portal.cgst += num(p.cgst); L.portal.sgst += num(p.sgst); L.portal.tcs += num(p.igst) + num(p.cgst) + num(p.sgst);
    });
    const fin = (L) => {
      const ours = { gross: r2(L.ours.gross), returns: r2(L.ours.returns), net: r2(L.ours.net), tax: r2(L.ours.tax), n: L.ours.n };
      const P = L.portal && { ...L.portal, gross: r2(L.portal.gross), returned: r2(L.portal.returned), net: r2(L.portal.net), igst: r2(L.portal.igst), cgst: r2(L.portal.cgst), sgst: r2(L.portal.sgst), tcs: r2(L.portal.tcs) };
      const diff = P ? r2(ours.net - P.net) : null, rate = tcsRate(L.period);
      const tcsDue = P && rate != null ? r2(P.net * rate) : null;
      const status = !P ? 'noportal' : !ours.n ? 'noreport' : Math.abs(diff) <= tol ? 'match' : 'diff';
      return { ...L, ours, portal: P, diff, tcsDue, tcsGap: tcsDue == null ? null : r2(P.tcs - tcsDue), status };
    };
    const all = [...lines.values()].map(fin).sort((a, b) => a.op.localeCompare(b.op) || a.period.localeCompare(b.period) || String(a.pos).localeCompare(String(b.pos)));
    const sumUp = (ls) => {
      const t = { gross: 0, returns: 0, net: 0, tax: 0, pgross: 0, preturned: 0, pnet: 0, tcs: 0, tcsDue: 0, hasPortal: false, hasOurs: false };
      ls.forEach((L) => {
        t.gross += L.ours.gross; t.returns += L.ours.returns; t.net += L.ours.net; t.tax += L.ours.tax; if (L.ours.n) t.hasOurs = true;
        if (L.portal) { t.hasPortal = true; t.pgross += L.portal.gross; t.preturned += L.portal.returned; t.pnet += L.portal.net; t.tcs += L.portal.tcs; t.tcsDue += L.tcsDue || 0; }
      });
      Object.keys(t).forEach((k) => { if (typeof t[k] === 'number') t[k] = r2(t[k]); });
      t.diff = t.hasPortal ? r2(t.net - t.pnet) : null;
      t.status = !t.hasPortal ? 'noportal' : !t.hasOurs ? 'noreport' : Math.abs(t.diff) <= tol ? 'match' : 'diff';
      return t;
    };
    const groups = [];
    [...ops.values()].forEach((op) => {
      const mine = all.filter((L) => L.op === op.pan);
      [...new Set(mine.map((L) => L.period))].sort().forEach((period) => {
        const ls = mine.filter((L) => L.period === period);
        groups.push({ pan: op.pan, name: op.name, etin: op.etin, portalEtin: op.portalEtin, sources: [...op.sources], period, lines: ls, total: sumUp(ls), differ: ls.filter((L) => L.status !== 'match').length });
      });
    });
    const gstinMismatch = [...ops.values()].filter((op) => op.portalEtin && op.sources.size && [...op.sources].some((s) => ebs[s] && ebs[s] !== op.portalEtin))
      .map((op) => ({ name: op.name, sources: [...op.sources], ours: [...op.sources].map((s) => ebs[s]).find(Boolean), portal: op.portalEtin }));
    return { groups, lines: all, total: sumUp(all), hasPortal: all.some((L) => L.portal), portalFile: (portal || []).length > 0, otherMonths, skippedNil, noOperator, noState, gstinMismatch };
  }

  // Invoices of more than Rs 1 lakh to unregistered buyers in another state belong in Table 5 (B2CL)
  // with their invoice number, not in Table 7. Marketplace rows carry invoice numbers for Amazon/Flipkart.
  function b2clCandidates(rows, opts) {
    const home = (opts && opts.home) || '', months = new Set((opts && opts.months) || []), inv = new Map();
    (rows || []).forEach((r) => {
      if (!r || r.kind !== 'sales' || isB2B(r) || !r.invNo || !r.pos || r.pos === home || !months.has(r.period)) return;
      const k = r.source + '|' + r.invNo, t = inv.get(k) || { source: r.source, invNo: r.invNo, pos: r.pos, val: 0 };
      t.val += num(r.total) || num(r.taxable) + num(r.tax); inv.set(k, t);
    });
    return [...inv.values()].filter((t) => t.val > 100000).map((t) => ({ ...t, val: r2(t.val) }));
  }

  // The GSTR-1 summary the way the portal shows it after upload: per table, records, value and tax.
  function summary(json) {
    const J = json || {}, out = [];
    const T = (key, label) => { const t = { key, label, n: 0, txval: 0, iamt: 0, camt: 0, samt: 0, val: 0 }; out.push(t); return t; };
    const itm = (t, d) => { t.txval += num(d.txval); t.iamt += num(d.iamt); t.camt += num(d.camt); t.samt += num(d.samt); };
    if ((J.b2b || []).length) { const t = T('b2b', '4A - B2B Regular'); J.b2b.forEach((p) => (p.inv || []).forEach((v) => { t.n++; t.val += num(v.val); (v.itms || []).forEach((i) => itm(t, i.itm_det || {})); })); }
    if ((J.b2cl || []).length) { const t = T('b2cl', '5 - B2CL (Large)'); J.b2cl.forEach((p) => (p.inv || []).forEach((v) => { t.n++; t.val += num(v.val); (v.itms || []).forEach((i) => itm(t, i.itm_det || {})); })); }
    if ((J.b2cs || []).length) { const t = T('b2cs', '7 - B2CS (Others)'); J.b2cs.forEach((r) => { t.n++; itm(t, r); t.val += num(r.txval) + num(r.iamt) + num(r.camt) + num(r.samt); }); }
    if (J.nil && (J.nil.inv || []).length) { const t = T('nil', '8 - Nil rated, exempted and non-GST'); J.nil.inv.forEach((r) => { t.n++; const v = num(r.nil_amt) + num(r.expt_amt) + num(r.ngsup_amt); t.txval += v; t.val += v; }); }
    if ((J.cdnr || []).length) { const t = T('cdnr', '9B - Credit / Debit Notes (Registered)'); J.cdnr.forEach((p) => (p.nt || []).forEach((v) => { t.n++; t.val += num(v.val); (v.itms || []).forEach((i) => itm(t, i.itm_det || {})); })); }
    const hsn = (list, key, label) => { if (!(list || []).length) return; const t = T(key, label); list.forEach((h) => { t.n++; itm(t, h); t.val += num(h.txval) + num(h.iamt) + num(h.camt) + num(h.samt); }); };
    if (J.hsn) { hsn(J.hsn.hsn_b2b, 'hsnB2B', '12 - HSN (B2B)'); hsn(J.hsn.hsn_b2c, 'hsnB2C', '12 - HSN (B2C)'); }
    const docs = (J.doc_issue && J.doc_issue.doc_det) || [];
    if (docs.length) { const t = T('docs', '13 - Documents Issued'); t.count = true; docs.forEach((d) => (d.docs || []).forEach((x) => { t.n++; t.issued = (t.issued || 0) + num(x.totnum); t.cancel = (t.cancel || 0) + num(x.cancel); t.net = (t.net || 0) + num(x.net_issue); })); }
    if (J.supeco && (J.supeco.clttx || []).length) { const t = T('eco', '14 - Supplies through ECO (TCS u/s 52)'); J.supeco.clttx.forEach((e) => { t.n++; t.txval += num(e.suppval); t.iamt += num(e.igst); t.camt += num(e.cgst); t.samt += num(e.sgst); t.val += num(e.suppval) + num(e.igst) + num(e.cgst) + num(e.sgst); }); }
    return out.map((t) => ({ ...t, txval: r2(t.txval), iamt: r2(t.iamt), camt: r2(t.camt), samt: r2(t.samt), val: r2(t.val) }));
  }

  // Taxable value the return reports (Tables 4, 5, 7 less credit notes in 9B), and nil/exempt (Table 8).
  function returnTotals(json) {
    const S = summary(json), g = (k) => S.find((t) => t.key === k) || { txval: 0, iamt: 0, camt: 0, samt: 0 };
    const t = { txval: 0, iamt: 0, camt: 0, samt: 0 };
    ['b2b', 'b2cl', 'b2cs'].forEach((k) => { const x = g(k); t.txval += x.txval; t.iamt += x.iamt; t.camt += x.camt; t.samt += x.samt; });
    ((json && json.cdnr) || []).forEach((p) => (p.nt || []).forEach((v) => { const s = v.ntty === 'D' ? 1 : -1; (v.itms || []).forEach((i) => { const d = i.itm_det || {}; t.txval += s * num(d.txval); t.iamt += s * num(d.iamt); t.camt += s * num(d.camt); t.samt += s * num(d.samt); }); }));
    return { txval: r2(t.txval), iamt: r2(t.iamt), camt: r2(t.camt), samt: r2(t.samt), nil: r2(g('nil').txval) };
  }

  // How the marketplace reports become the return, step by step, so every rupee is accounted for:
  // reports (net) - returns carried to the next return + returns carried from the last one
  // + operators' figures (if matched) + PakkaBill bills = taxable value in the GSTR-1.
  function bridge(rows, Z, opts) {
    const o = opts || {}, months = new Set(o.months || []);
    let reports = 0, b2bRetNoNote = 0, noState = 0;
    (rows || []).forEach((r) => {
      if (!r || r.source === 'carry' || !months.has(r.period) || isNil(r)) return;
      if (!r.pos) { noState += (r.kind === 'returns' ? -1 : 1) * num(r.taxable); return; }
      const v = (r.kind === 'returns' ? -1 : 1) * num(r.taxable);
      reports += v;
      if (r.kind === 'returns' && isB2B(r) && !r.cnNo) b2bRetNoNote += v;
    });
    const sum = (l) => (l || []).reduce((a, c) => a + num(c.txval), 0);
    const carryOut = -sum(Z && Z.carryOut), carryIn = o.carryOn ? sum(Z && Z.carryIn) : 0, portal = num(Z && Z.portalAdj);
    const ret = returnTotals(Z && Z.json).txval;
    const steps = [{ key: 'reports', label: 'Net sales in your reports (sales less returns, taxable)', v: r2(reports) }];
    if (Math.abs(b2bRetNoNote) >= 0.005) steps.push({ key: 'b2bret', label: 'B2B returns with no credit note number (enter on the portal)', v: r2(-b2bRetNoNote) });
    if (Math.abs(carryOut) >= 0.005) steps.push({ key: 'carryOut', label: 'Returns more than sales, carried to your next return', v: r2(carryOut) });
    if (Math.abs(carryIn) >= 0.005) steps.push({ key: 'carryIn', label: 'Returns carried from your last return', v: r2(carryIn) });
    if (Math.abs(portal) >= 0.005) steps.push({ key: 'portal', label: "Moved to the operators' GSTR-8 figures", v: r2(portal) });
    const known = steps.reduce((a, s) => a + s.v, 0), rest = r2(ret - known);
    if (o.bills && Math.abs(rest) >= 0.005) steps.push({ key: 'bills', label: 'Bills made in PakkaBill', v: rest });
    const unexplained = o.bills ? 0 : rest;
    return { steps, gstr1: r2(ret), unexplained: Math.abs(unexplained) < 0.02 ? 0 : unexplained, noState: r2(noState) };
  }

  // Optional parts of the return the seller can leave out of the files (as the marketplace tools allow).
  function trimJson(json, opts) {
    const o = opts || {}, J = JSON.parse(JSON.stringify(json || {}));
    if (o.hsnB2c === false && J.hsn) { delete J.hsn.hsn_b2c; if (!(J.hsn.hsn_b2b || []).length) delete J.hsn; }
    if (o.docs === false) delete J.doc_issue;
    return J;
  }

  /* ---------- GSTR-1 Excel in the government offline-tool format ---------- */
  const UQC_NAME = { PCS: 'PCS-PIECES', NOS: 'NOS-NUMBERS', SET: 'SET-SETS', PRS: 'PRS-PAIRS', MTR: 'MTR-METERS', KGS: 'KGS-KILOGRAMS', BOX: 'BOX-BOX', OTH: 'OTH-OTHERS', NA: 'NA' };
  const xDate = (d) => { const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(d || '')); return m ? `${m[1]}-${MON3[+m[2] - 1]}-${m[3]}` : String(d || ''); };
  const posName = (c) => { const S = G().STATES || {}; return c ? `${c}-${S[c] || ''}` : ''; };

  function offlineWorkbook(json) {
    const J = json || {}, X = G();
    const B = (v) => ({ v, b: 1 }), I = (v) => ({ v, i: 1 }), H = (...h) => h.map(B);
    const sheets = [];
    const sheet = (name, title, sumHead, sumRow, head, rows, widths) => sheets.push({ name, widths, rows: [[B(title)], sumHead.map((h) => (h ? B(h) : '')), sumRow, H(...head), ...rows] });
    // b2b,sez,de (4A, 4B, 6B, 6C)
    const b2b = []; let b2bInv = 0, b2bVal = 0, b2bTx = 0;
    (J.b2b || []).forEach((p) => (p.inv || []).forEach((v) => { b2bInv++; b2bVal += num(v.val); (v.itms || []).forEach((it) => { const d = it.itm_det || {}; b2bTx += num(d.txval); b2b.push([p.ctin, '', v.inum, xDate(v.idt), num(v.val), posName(v.pos), v.rchrg || 'N', '', v.inv_typ === 'R' || !v.inv_typ ? 'Regular B2B' : v.inv_typ, v.etin || '', I(num(d.rt)), num(d.txval), num(d.csamt)]); }); }));
    sheet('b2b,sez,de', 'Summary For B2B, SEZ, DE (4A, 4B, 6B, 6C)', ['No. of Recipients', '', 'No. of Invoices', '', 'Total Invoice Value', '', '', '', '', '', '', 'Total Taxable Value', 'Total Cess'],
      [I((J.b2b || []).length), '', I(b2bInv), '', r2(b2bVal), '', '', '', '', '', '', r2(b2bTx), 0],
      ['GSTIN/UIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Reverse Charge', 'Applicable % of Tax Rate', 'Invoice Type', 'E-Commerce GSTIN', 'Rate', 'Taxable Value', 'Cess Amount'], b2b, [20, 16, 16, 13, 14, 22, 9, 10, 12, 18, 7, 14, 10]);
    // b2cl (5)
    const b2cl = []; let lInv = 0, lVal = 0, lTx = 0;
    (J.b2cl || []).forEach((p) => (p.inv || []).forEach((v) => { lInv++; lVal += num(v.val); (v.itms || []).forEach((it) => { const d = it.itm_det || {}; lTx += num(d.txval); b2cl.push([v.inum, xDate(v.idt), num(v.val), posName(p.pos), '', I(num(d.rt)), num(d.txval), num(d.csamt), v.etin || '']); }); }));
    sheet('b2cl', 'Summary For B2CL(5)', ['No. of Invoices', '', 'Total Inv Value', '', '', '', 'Total Taxable Value', 'Total Cess', ''], [I(lInv), '', r2(lVal), '', '', '', r2(lTx), 0, ''],
      ['Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'], b2cl, [16, 13, 14, 22, 10, 7, 14, 10, 18]);
    // b2cs (7)
    const b2cs = (J.b2cs || []).map((r) => [r.typ || 'OE', posName(r.pos), '', I(num(r.rt)), num(r.txval), num(r.csamt), r.etin || '']);
    sheet('b2cs', 'Summary For B2CS(7)', ['', '', '', '', 'Total Taxable Value', 'Total Cess', ''], ['', '', '', '', r2((J.b2cs || []).reduce((a, r) => a + num(r.txval), 0)), 0, ''],
      ['Type', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'], b2cs, [8, 30, 12, 7, 14, 10, 18]);
    // cdnr (9B)
    const cdnr = []; let nNotes = 0, nVal = 0, nTx = 0;
    (J.cdnr || []).forEach((p) => (p.nt || []).forEach((v) => { nNotes++; nVal += num(v.val); (v.itms || []).forEach((it) => { const d = it.itm_det || {}; nTx += num(d.txval); cdnr.push([p.ctin, '', v.nt_num, xDate(v.nt_dt), v.ntty || 'C', posName(v.pos), v.rchrg || 'N', 'Regular B2B', num(v.val), '', I(num(d.rt)), num(d.txval), num(d.csamt)]); }); }));
    sheet('cdnr', 'Summary For CDNR(9B)', ['No. of Recipients', '', 'No. of Notes', '', '', '', '', '', 'Total Note Value', '', '', 'Total Taxable Value', 'Total Cess'],
      [I((J.cdnr || []).length), '', I(nNotes), '', '', '', '', '', r2(nVal), '', '', r2(nTx), 0],
      ['GSTIN/UIN of Recipient', 'Receiver Name', 'Note Number', 'Note Date', 'Note Type', 'Place Of Supply', 'Reverse Charge', 'Note Supply Type', 'Note Value', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount'], cdnr, [20, 16, 16, 13, 9, 22, 9, 14, 14, 10, 7, 14, 10]);
    // exemp (8)
    const nil = (J.nil && J.nil.inv) || [], g = (t) => nil.find((r) => r.sply_ty === t) || {};
    const ex = [['INTRB2B', 'Inter-State supplies to registered persons'], ['INTRAB2B', 'Intra-State supplies to registered persons'], ['INTRB2C', 'Inter-State supplies to unregistered persons'], ['INTRAB2C', 'Intra-State supplies to unregistered persons']]
      .map(([t, l]) => [l, num(g(t).nil_amt), num(g(t).expt_amt), num(g(t).ngsup_amt)]);
    const exT = (k) => r2(nil.reduce((a, r) => a + num(r[k]), 0));
    sheet('exemp', 'Summary For Nil rated, exempted and non GST outward supplies (8)', ['', 'Total Nil Rated Supplies', 'Total Exempted Supplies', 'Total Non-GST Supplies'], ['', exT('nil_amt'), exT('expt_amt'), exT('ngsup_amt')],
      ['Description', 'Nil Rated Supplies', 'Exempted(other than nil rated/non GST supply)', 'Non-GST Supplies'], ex, [44, 18, 22, 18]);
    // hsn (12), B2B and B2C tabs as in the current offline tool
    const hsnSheet = (name, list) => {
      const L = list || [], tot = (k) => r2(L.reduce((a, h) => a + num(h[k]), 0));
      const val = (h) => r2(num(h.txval) + num(h.iamt) + num(h.camt) + num(h.samt) + num(h.csamt));
      sheet(name, 'Summary For HSN(12)', ['No. of HSN', '', '', '', 'Total Value', '', 'Total Taxable Value', 'Total Integrated Tax', 'Total Central Tax', 'Total State/UT Tax', 'Total Cess'],
        [I(L.length), '', '', '', r2(L.reduce((a, h) => a + val(h), 0)), '', tot('txval'), tot('iamt'), tot('camt'), tot('samt'), tot('csamt')],
        ['HSN', 'Description', 'UQC', 'Total Quantity', 'Total Value', 'Rate', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount', 'Cess Amount'],
        L.map((h) => [String(h.hsn_sc), h.desc || '', UQC_NAME[h.uqc] || h.uqc || '', num(h.qty), val(h), I(num(h.rt)), num(h.txval), num(h.iamt), num(h.camt), num(h.samt), num(h.csamt)]), [10, 26, 14, 12, 14, 7, 14, 14, 14, 14, 10]);
    };
    hsnSheet('hsn(b2b)', J.hsn && J.hsn.hsn_b2b);
    hsnSheet('hsn(b2c)', J.hsn && J.hsn.hsn_b2c);
    // docs (13)
    const NAT = { 1: 'Invoices for outward supply', 4: 'Debit Note', 5: 'Credit Note' };
    const docs = []; let dTot = 0, dCan = 0;
    ((J.doc_issue && J.doc_issue.doc_det) || []).forEach((d) => (d.docs || []).forEach((x) => { dTot += num(x.totnum); dCan += num(x.cancel); docs.push([NAT[d.doc_num] || d.doc_typ, x.from, x.to, I(num(x.totnum)), I(num(x.cancel))]); }));
    sheet('docs', 'Summary of documents issued during the tax period (13)', ['', '', '', 'Total Number', 'Total Cancelled'], ['', '', '', I(dTot), I(dCan)],
      ['Nature of Document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled'], docs, [30, 18, 18, 13, 11]);
    // eco (14)
    const eco = (J.supeco && J.supeco.clttx) || [], eT = (k) => r2(eco.reduce((a, e) => a + num(e[k]), 0));
    sheet('eco', 'Summary For Supplies through ECO-14', ['', '', '', 'Total Net Value', 'Total Integrated Tax', 'Total Central Tax', 'Total State/UT Tax', 'Total Cess'], ['', '', '', eT('suppval'), eT('igst'), eT('cgst'), eT('sgst'), eT('cess')],
      ['Nature of Supply', 'GSTIN of E-Commerce Operator', 'E-Commerce Operator Name', 'Net value of supplies', 'Integrated tax', 'Central tax', 'State/UT tax', 'Cess'],
      eco.map((e) => ['Liable to collect tax u/s 52(TCS)', e.etin, opName(e.etin), num(e.suppval), num(e.igst), num(e.cgst), num(e.sgst), num(e.cess)]), [32, 20, 22, 16, 14, 14, 14, 10]);
    return X.xlsx ? X.xlsx(sheets) : null;
  }

  // The platforms on Import Data, with the files each one needs for every month of the return.
  const PLATFORMS = [
    { key: 'meesho', name: 'Meesho', type: 'B2C', color: '#e91e63', mono: 'm', perMonth: true,
      where: 'Meesho Supplier Panel → Payments → GST Report. Pick the month and download. The .zip can be added as it is.',
      files: [{ id: 'sales', label: 'TCS Sales', file: 'tcs_sales.xlsx', what: 'Every order shipped in the month' },
        { id: 'returns', label: 'TCS Sales Return', file: 'tcs_sales_return.xlsx', what: 'Every return and RTO received in the month' },
        { id: 'invoices', label: 'Tax Invoice Details', file: 'Tax_invoice_details.xlsx', what: 'Invoice and credit note numbers, for Table 13' }] },
    { key: 'amazon', name: 'Amazon', type: 'B2C', color: '#ff9900', mono: 'a', perMonth: true,
      where: 'Amazon Seller Central → Reports → Tax Document Library → Merchant Tax Report (MTR), B2C. Pick the month, generate and download.',
      files: [{ id: 'main', label: 'MTR B2C report', file: 'MTR_B2C-MONTH-YEAR.csv (or the .zip)', what: 'Shipments, refunds and cancellations to buyers without a GSTIN' }] },
    { key: 'amazonb2b', name: 'Amazon B2B', type: 'B2B', color: '#232f3e', mono: 'a', perMonth: true, optional: true,
      where: 'Amazon Seller Central → Reports → Tax Document Library → Merchant Tax Report (MTR), B2B. Only if you sold to buyers with a GSTIN.',
      files: [{ id: 'main', label: 'MTR B2B report', file: 'MTR_B2B-MONTH-YEAR.csv (or the .zip)', what: 'Invoices and credit notes to registered buyers (Tables 4 and 9B)' }] },
    { key: 'flipkart', name: 'Flipkart', type: 'B2C Sales Report', color: '#2874f0', mono: 'f', perMonth: true,
      where: 'Flipkart Seller Hub → Reports → Tax reports → Sales Report (GST). Pick the month and download. Its cash-back sheet is read too.',
      files: [{ id: 'main', label: 'Sales Report', file: 'Sales Report .xlsx', what: 'Sales, returns and cash-back notes, with HSN and invoice numbers' }] },
    { key: 'portal', name: 'GST Portal TCS', type: 'GSTR-8 TCS', color: '#1e3a8a', mono: 'GST', perMonth: true, optional: true,
      where: 'gst.gov.in → Returns Dashboard → pick the month → TDS and TCS Credit Received → download. Used only for the TCS Report.',
      files: [{ id: 'main', label: 'TCS credit received', file: 'the .zip or .xlsx from the portal', what: 'What Meesho, Amazon and Flipkart reported in GSTR-8' }] },
  ];
  const platformOf = (f) => {
    if (!f) return '';
    if (f.kind === 'portaltcs') return 'portal';
    if (f.source === 'amazon') return (f.tcs || []).some((r) => r.buyerGstin) ? 'amazonb2b' : 'amazon';
    return f.source || '';
  };
  const slotOf = (f) => (f.source === 'meesho' && f.kind !== 'portaltcs' ? f.kind : 'main');
  const monthsOf = (f) => {
    const m = new Set();
    (f.tcs || []).forEach((r) => r.period && m.add(r.period));
    (f.docs || []).forEach((d) => d.date && m.add(d.date.slice(0, 7)));
    (f.portal || []).forEach((r) => r.period && m.add(r.period));
    (f.cancelled || []).forEach((r) => r.period && m.add(r.period));
    if (!m.size && f.period) m.add(f.period);
    return [...m];
  };
  // For each platform: the files added, and for every required file which return months are covered.
  function coverage(files, months) {
    const M = months || [];
    return PLATFORMS.map((p) => {
      const mine = (files || []).filter((f) => platformOf(f) === p.key);
      const slots = p.files.map((sl) => {
        const fs = mine.filter((f) => slotOf(f) === sl.id), got = new Set(fs.flatMap(monthsOf));
        return { ...sl, files: fs, months: M.map((m) => ({ m, ok: got.has(m) })), done: M.length > 0 && M.every((m) => got.has(m)) };
      });
      const need = p.files.length * Math.max(1, M.length), have = slots.reduce((a, sl) => a + sl.months.filter((x) => x.ok).length, 0);
      const status = !mine.length ? 'empty' : slots.every((sl) => sl.done) ? 'done' : 'partial';
      return { ...p, added: mine, slots, need, have, status };
    });
  }

  root.PBG1V = { coverage, PLATFORMS, platformOf, statement, tcsReport, b2clCandidates, summary, returnTotals, bridge, trimJson, offlineWorkbook, opName, monthName, tcsRate, r2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PBG1V;
  if (typeof document === 'undefined') return;

  /* ======================================================= screen */

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Indian grouping, always two decimals, as the portal shows amounts (1,06,116.48)
  const nf = (v) => {
    const n = r2(v), neg = n < 0, [i, f] = Math.abs(n).toFixed(2).split('.');
    const last3 = i.slice(-3), rest = i.slice(0, -3);
    return (neg ? '−' : '') + (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3) + '.' + f;
  };
  const rs = (v) => (r2(v) < 0 ? '−₹' + nf(-v) : '₹' + nf(v));
  const stName = (c) => (G().STATES || {})[c] || '';

  const STEPS = [['profile', 'GST Profile'], ['import', 'Import Data'], ['statement', 'Statement'], ['tcs', 'TCS Report'], ['gstr1', 'GSTR1 Report']];
  const STYLE = `
.g1v-search{display:flex;max-width:520px;margin:0 auto 18px;border:1px solid var(--rule);border-radius:10px;background:var(--paper);overflow:hidden}
.g1v-search input{flex:1;min-width:0;border:0;padding:12px 14px;font:inherit;background:transparent;color:var(--ink)}
.g1v-search span{display:grid;place-items:center;width:46px;background:#2563eb;color:#fff;font-weight:700}
.g1v-plats{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:16px}
.g1v-plat{border:1px solid var(--rule-soft);border-radius:12px;background:var(--paper);box-shadow:0 2px 6px rgba(15,23,42,.08);padding:18px 14px 16px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;font:inherit;color:var(--ink)}
.g1v-plat:hover{box-shadow:0 6px 16px rgba(15,23,42,.14)}
.g1v-logo{width:64px;height:64px;border-radius:14px;display:grid;place-items:center;color:#fff;font-weight:800;font-size:30px;margin-bottom:6px;font-family:Georgia,serif}
.g1v-logo.sm{font-size:17px;font-family:inherit}
.g1v-plat b{font-size:17px}.g1v-plat>small{color:var(--ink-2);font-size:13px}
.g1v-plat .need{font-size:12.5px;color:var(--ink-2);margin:4px 0 8px}
.g1v-btn{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:9px 18px;font:600 13px/1 inherit;letter-spacing:.03em;text-transform:uppercase;border:0;background:var(--desk);color:var(--ink);margin-top:auto}
.g1v-btn.done{background:#14b8a6;color:#fff}.g1v-btn.part{background:#f59e0b;color:#fff}
.g1v-guide{border:1px solid var(--rule-soft);border-radius:10px;padding:12px 14px;margin:0 0 18px;font-size:14px;line-height:1.55;background:var(--desk)}
.g1v-guide b{font-weight:700}
.g1v-guide ul{margin:6px 0 0;padding-left:18px}
.g1v-ov{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:1000;display:grid;place-items:center;padding:16px}
.g1v-dlg{background:var(--paper);color:var(--ink);border-radius:14px;width:min(640px,100%);max-height:calc(100vh - 32px);overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.35)}
.g1v-dlg>.hd{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--rule-soft);position:sticky;top:0;background:var(--paper)}
.g1v-dlg>.hd .g1v-logo{width:44px;height:44px;font-size:22px;margin:0;border-radius:10px}
.g1v-dlg>.hd .g1v-logo.sm{font-size:13px}
.g1v-dlg>.hd b{font-size:18px;display:block}.g1v-dlg>.hd small{color:var(--ink-2)}
.g1v-dlg>.hd button{margin-left:auto;border:0;background:none;font-size:26px;line-height:1;cursor:pointer;color:var(--ink-2);padding:4px 8px}
.g1v-dlg .bd{padding:14px 18px 18px}
.g1v-count{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;background:color-mix(in srgb,#2563eb 8%,var(--paper));border:1px solid color-mix(in srgb,#2563eb 30%,transparent);border-radius:10px;padding:10px 12px;font-size:14px;margin:0 0 12px}
.g1v-count b{font-size:15px}
.g1v-slot{border:1px solid var(--rule-soft);border-radius:10px;padding:10px 12px;margin:0 0 10px}
.g1v-slot .t{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.g1v-slot .t b{font-size:15px}
.g1v-slot .t code{font-size:12.5px;background:var(--desk);border-radius:6px;padding:2px 6px;color:var(--ink-2)}
.g1v-slot>small{display:block;color:var(--ink-2);font-size:13px;margin-top:2px}
.g1v-mchips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.g1v-mchip{font-size:12.5px;font-weight:600;border-radius:999px;padding:3px 10px;border:1px solid var(--rule)}
.g1v-mchip.ok{background:var(--green-soft);color:var(--green);border-color:transparent}
.g1v-mchip.no{color:var(--red);border-color:color-mix(in srgb,var(--red) 40%,transparent)}
.g1v-flist{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:6px}
.g1v-flist li{display:flex;align-items:center;gap:8px;font-size:13.5px;background:var(--desk);border-radius:8px;padding:6px 8px;min-width:0}
.g1v-flist li span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.g1v-flist li small{color:var(--ink-2);white-space:nowrap}
.g1v-flist li button{border:0;background:none;color:var(--red);font-size:18px;cursor:pointer;line-height:1;padding:0 4px}
.g1v-drop{display:flex;flex-direction:column;align-items:center;gap:4px;border:2px dashed var(--rule);border-radius:12px;padding:18px;text-align:center;cursor:pointer;margin:6px 0 12px;background:var(--desk)}
.g1v-drop.over,.g1v-drop:hover{border-color:#2563eb}
.g1v-drop b{font-size:15px;color:#1d4ed8}.g1v-drop small{color:var(--ink-2);font-size:13px}
.g1v-drop input{position:absolute;width:1px;height:1px;opacity:0}
.g1v-where{font-size:13.5px;color:var(--ink-2);line-height:1.5;margin:0 0 12px}
.g1v-dlg .ft{display:flex;justify-content:flex-end;gap:10px;padding:0 18px 18px}
.g1v-dlg .ft button{border-radius:8px;padding:11px 20px;font:600 15px/1 inherit;cursor:pointer;border:0;background:#2563eb;color:#fff}
.g1v-top:empty,.g1v-foot:empty{display:none}
.g1v-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;background:#22315c;color:#fff;border-radius:14px;padding:16px 18px;margin:0 0 14px}
.g1v-bar h2{margin:0;font-size:20px;font-weight:700;color:#fff;letter-spacing:-.01em}
.g1v-bar small{display:block;color:#c7d2fe;font-size:13px;margin-top:2px}
.g1v-badge{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);border-radius:10px;padding:8px 12px;font-size:13px;line-height:1.5;font-variant-numeric:tabular-nums}
.g1v-badge b{font-weight:700}
.g1v-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:6px;margin:0 0 14px;padding:2px}
.g1v-steps button{min-width:0;display:flex;align-items:center;gap:8px;border:1.5px solid var(--rule);background:var(--paper);color:var(--ink);border-radius:10px;padding:9px 12px;font:600 14px/1.1 inherit;cursor:pointer;white-space:nowrap}
.g1v-steps button .n{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:12px;background:var(--desk);border:1px solid var(--rule)}
.g1v-steps button.is-on{border-color:#2563eb;color:#1d4ed8;background:color-mix(in srgb,#2563eb 8%,var(--paper))}
.g1v-steps button.is-on .n{background:#2563eb;border-color:#2563eb;color:#fff}
.g1v-steps button .ok{color:var(--green);font-size:13px}
.g1v-steps button .dot{width:8px;height:8px;border-radius:50%;background:var(--red)}
.g1v{padding:18px 20px 20px;margin:0 0 14px;min-width:0}
.g1v h3{margin:0 0 4px;font-size:22px;font-weight:700;text-align:center}
.g1v .sub{margin:0 auto 14px;color:var(--ink-2);font-size:14px;text-align:center;max-width:560px}
.g1v-card{border:1px solid var(--rule-soft);border-radius:10px;margin:12px 0 0;overflow:hidden;min-width:0}
.g1v-card>.hd{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px 12px;padding:12px 14px;background:var(--desk);border-bottom:1px solid var(--rule-soft);text-align:center}
.g1v-card>.hd b{font-size:16px}
.g1v-card>.bd{padding:0 0 4px}
.g1v table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.g1v th{font-weight:600;font-size:13px;color:var(--ink-2);padding:9px 10px;border-bottom:1px solid var(--rule-soft);text-align:right;white-space:nowrap}
.g1v td{padding:9px 10px;border-bottom:1px solid var(--rule-soft);text-align:right;font-size:14px;white-space:nowrap}
.g1v th.l,.g1v td.l{text-align:left;white-space:normal}
.g1v tr.tot td{font-weight:700}
.g1v tr.out td{color:var(--ink-3)}
.g1v tr.bad td{background:var(--red-soft)}
.g1v tr.good td.st{color:var(--green)}
.g1v .tw{overflow-x:auto}
.g1v-pill{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:700;padding:3px 10px;border-radius:999px;white-space:nowrap}
.g1v-pill.ok{background:var(--green-soft);color:var(--green)}
.g1v-pill.bad{background:var(--red-soft);color:var(--red)}
.g1v-pill.mid{background:color-mix(in srgb,#d97706 16%,transparent);color:#b45309}
.g1v-pill.off{background:var(--desk);color:var(--ink-2);border:1px solid var(--rule-soft)}
.g1v-link{background:none;border:1px solid var(--rule);border-radius:8px;padding:6px 10px;color:#2563eb;font:600 13px/1 inherit;cursor:pointer}
.g1v-note{font-size:13.5px;color:var(--ink-2);margin:10px 14px;line-height:1.5}
.g1v-warn{color:#b45309}
.g1v-err{color:var(--red);font-weight:600}
.g1v-acts{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin:18px 0 4px}
.g1v-dl{display:inline-flex;align-items:center;gap:12px;background:#2563eb;color:#fff;border:0;border-radius:8px;padding:12px 20px;font:600 15px/1.25 inherit;cursor:pointer;text-align:left;min-width:200px}
.g1v-dl:disabled{opacity:.45;cursor:not-allowed}
.g1v-dl .ic{width:36px;height:40px;border-radius:5px;display:grid;place-items:center;font-size:11px;font-weight:800;letter-spacing:.02em}
.g1v-dl .ic.x{background:#16a34a;color:#fff}.g1v-dl .ic.j{background:#fff;color:#15803d;border:2px solid #15803d}
.g1v-ret{text-align:center;color:#2563eb;font-weight:700;font-size:17px;margin:16px 0 0}
.g1v-tg{display:grid;grid-template-columns:46px 1fr;gap:12px;align-items:center;padding:10px 4px;border-bottom:1px dashed var(--rule-soft)}
.g1v-tg input{appearance:none;width:44px;height:24px;border-radius:999px;background:var(--rule);position:relative;cursor:pointer;margin:0;transition:background .15s}
.g1v-tg input::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:left .15s;box-shadow:0 1px 2px rgba(0,0,0,.25)}
.g1v-tg input:checked{background:#2563eb}.g1v-tg input:checked::after{left:23px}
.g1v-tg b{font-size:15px;font-weight:600}.g1v-tg small{display:block;color:var(--ink-2);font-size:13px}
.g1v-foot{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;margin:4px 0 14px}
.g1v-foot button{border-radius:8px;padding:11px 18px;font:600 15px/1 inherit;cursor:pointer;border:1.5px solid var(--rule);background:var(--paper);color:var(--ink)}
.g1v-foot button.go{background:#2563eb;border-color:#2563eb;color:#fff;margin-left:auto}
.g1v-rows{max-height:420px;overflow:auto;border-top:1px solid var(--rule-soft)}
.g1v-rows td,.g1v-rows th{font-size:13px;padding:6px 8px}
.g1v-bridge td{font-size:14.5px}
.page[data-g1tab] .gstr__main>section,.page[data-g1tab]>.gstr-check{display:none}
.page[data-g1tab=profile] .gstr__main>section[aria-labelledby=g-ret],
.page[data-g1tab=gstr1] .gstr__main>section[aria-labelledby=g-sum],
.page[data-g1tab=gstr1] .gstr__main>section[aria-labelledby=g-notes],
.page[data-g1tab=gstr1] .gstr__main>section[aria-labelledby=g-b2cs],
.page[data-g1tab=gstr1] .gstr__main>section[aria-labelledby=g-nil],
.page[data-g1tab=gstr1] .gstr__main>section[aria-labelledby=g-hsn],
.page[data-g1tab=gstr1] .gstr__main>section[aria-labelledby=g-docs],
.page[data-g1tab=gstr1] .gstr__main>section[aria-labelledby=g-eco],
.page[data-g1tab=gstr1] .gstr__main>section:not([aria-labelledby]),
.page[data-g1tab=statement] .gstr__main>section:not([aria-labelledby]){display:block}
.page[data-g1tab=gstr1]>.gstr-check{display:block}
.g1v-mob{display:none;grid-template-columns:1fr 1fr;gap:10px 14px;padding:12px 14px}.g1v-mob small{display:block;color:var(--ink-2);font-size:12px}.g1v-mob b{font-size:15px;font-variant-numeric:tabular-nums}
@media (max-width:560px){.g1v-sumt{display:none}.g1v-mob{display:grid}.g1v{padding:14px 12px}.g1v h3{font-size:19px}.g1v-bar{padding:14px}.g1v-dl{min-width:0;flex:1 1 100%}.g1v td,.g1v th{padding:8px 7px;font-size:13px}}`;

  function loadStyle() {
    if (document.getElementById('g1v-style')) return;
    const s = document.createElement('style'); s.id = 'g1v-style'; s.textContent = STYLE; document.head.appendChild(s);
  }

  // one state per page: both mounts (top and foot) draw from it
  const S = { tab: '', top: null, foot: null, data: null, key: '', open: new Set(), flip: {}, modal: '', q: '', hsnB2c: true, docs: true };
  try { const t = localStorage.getItem('pb-g1v-tab'); if (STEPS.some((x) => x[0] === t)) S.tab = t; } catch (e) { /* storage off */ }

  function setTab(t) {
    S.tab = t;
    try { localStorage.setItem('pb-g1v-tab', t); } catch (e) { /* storage off */ }
    drawAll();
    const pg = S.top && S.top.closest('.page');
    if (pg) { const y = pg.getBoundingClientRect().top + window.scrollY - 70; if (window.scrollY > y) window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' }); }
  }

  function mount(el, data) {
    loadStyle();
    if (!data) return;
    if (data.part === 'foot') S.foot = el; else S.top = el;
    S.data = data;
    if (!S.tab) S.tab = (data.files || []).length ? 'statement' : 'import';
    let key;
    try {
      key = [(data.files || []).map((f) => f.id).join(','), (data.months || []).join(','), data.gstin, data.usePortal, data.ready, data.carryOn, data.bills, data.busy,
        JSON.stringify(data.etinBySource || {}), JSON.stringify(data.Z && data.Z.json || {}), (data.rows || []).length].join('§');
    } catch (e) { key = String(Math.random()); }
    if (key === S.key && el.__g1vDone) return;
    S.key = key;
    S.calc = null;
    drawAll();
  }

  function calc() {
    if (S.calc) return S.calc;
    const D = S.data, home = String(D.gstin || '').slice(0, 2), months = D.months || [];
    const portal = (D.files || []).filter((f) => f.kind === 'portaltcs').flatMap((f) => f.portal || []);
    const rows = D.rows || [];
    S.calc = {
      home, months, portal,
      st: statement(rows, { home, months }),
      tcs: tcsReport(rows, portal, { months, etinBySource: D.etinBySource }),
      sum: summary(D.Z && D.Z.json),
      bridge: bridge(rows, D.Z, { months, bills: D.bills, carryOn: D.carryOn }),
      big: b2clCandidates(rows, { home, months }),
    };
    return S.calc;
  }

  function drawAll() {
    if (!S.data) return;
    const pg = S.top && S.top.closest('.page');
    if (pg) pg.setAttribute('data-g1tab', S.tab);
    if (S.top) { S.top.innerHTML = topHtml(); S.top.__g1vDone = true; wire(S.top); }
    if (S.foot) { S.foot.innerHTML = footHtml(); S.foot.__g1vDone = true; wire(S.foot); }
  }

  const periodLabel = () => { const m = S.data.months || []; return m.length > 1 ? `${monthName(m[0]).split(' ')[0]} to ${monthName(m[m.length - 1])}` : monthName(m[0]); };

  function stepsHtml(C) {
    const D = S.data, nFiles = (D.files || []).length, t = C.tcs.total;
    const mark = {
      profile: D.gstinOk ? '<span class="ok">✓</span>' : '',
      import: nFiles ? `<span class="ok">${nFiles}</span>` : '',
      statement: '',
      tcs: !C.tcs.hasPortal ? '' : t.status === 'match' ? '<span class="ok">✓</span>' : t.status === 'diff' ? '<span class="dot" title="Differences"></span>' : '',
      gstr1: D.ready ? '<span class="ok">✓</span>' : '',
    };
    return `<nav class="g1v-steps" aria-label="GSTR-1 steps">${STEPS.map(([k, l], i) => `<button type="button" data-g1v-tab="${k}" class="${S.tab === k ? 'is-on' : ''}" aria-current="${S.tab === k ? 'step' : 'false'}"><span class="n">${i + 1}</span>${l}${mark[k]}</button>`).join('')}</nav>`;
  }

  function topHtml() {
    const D = S.data, C = calc();
    const bar = `<div class="g1v-bar"><div><h2>GST Online Seller Tool</h2><small>Import data, check the statement and the TCS report, then download your GSTR-1</small></div><div class="g1v-badge">GSTIN: <b>${esc(D.gstin || '—')}</b><br>Period: <b>${esc(periodLabel())}</b></div></div>`;
    let body = '';
    if (S.tab === 'statement') body = statementHtml(C);
    else if (S.tab === 'tcs') body = tcsHtml(C);
    else if (S.tab === 'gstr1') body = gstr1Html(C);
    else if (S.tab === 'profile') body = `<section class="paper g1v"><h3>GST Profile</h3><p class="sub" style="margin-bottom:0">Your GSTIN, the return period and filing type. The GSTIN fills in from the reports; check the month the return is for.</p></section>`;
    else body = importHtml();
    if (S.modal) body += modalHtml();
    return bar + stepsHtml(C) + body;
  }

  const logo = (p, cls) => `<span class="g1v-logo${p.mono.length > 1 ? ' sm' : ''}${cls ? ' ' + cls : ''}" style="background:${p.color}" aria-hidden="true">${esc(p.mono)}</span>`;
  const perLabel = (n) => { const m = (S.data.months || []).length; return m > 1 ? `${n} ${n === 1 ? 'file' : 'files'} a month · ${n * m} for this quarter` : `${n} ${n === 1 ? 'file' : 'files'} for ${esc(monthName(S.data.months[0]))}`; };

  function importHtml() {
    const D = S.data, cov = coverage(D.files, D.months), q = S.q.trim().toLowerCase();
    const list = cov.filter((p) => !q || (p.name + ' ' + p.type).toLowerCase().includes(q));
    const used = cov.filter((p) => p.added.length);
    const m = (D.months || []).length;
    let h = `<section class="paper g1v" aria-labelledby="g1v-imp"><h3 id="g1v-imp">Import Platform Data</h3><p class="sub">Search and upload platform data, then check the statement and generate GSTR-1.</p>
      <p class="g1v-note g1v-err" style="text-align:center;margin:0 0 14px">Caution: avoid importing an edited file to prevent potential errors.</p>
      <div class="g1v-guide"><b>How many files to upload for ${esc(periodLabel())}</b>${m > 1 ? ` (quarterly: every file for each of the 3 months)` : ''}:
        <ul><li><b>Meesho:</b> 3 files a month: tcs_sales, tcs_sales_return and Tax_invoice_details (or the one GST Report .zip that holds them).</li>
        <li><b>Amazon:</b> 1 file a month, the MTR B2C report. Add the MTR B2B report too if you sold to buyers with a GSTIN.</li>
        <li><b>Flipkart:</b> 1 file a month, the Sales Report.</li>
        <li><b>GST portal TCS file:</b> optional, 1 a month, for the TCS Report.</li></ul>
        Upload only the platforms you sell on.${used.length ? ` Added so far: ${used.map((p) => `${esc(p.name)} ${p.have} of ${p.need}`).join(' · ')}.` : ''}</div>
      <label class="g1v-search"><input type="search" placeholder="Search for portal" value="${esc(S.q)}" data-g1v-q aria-label="Search for portal"><span aria-hidden="true">→</span></label>
      <div class="g1v-plats">${list.map((p) => {
        const btn = p.status === 'done' ? '<span class="g1v-btn done">✓ Uploaded</span>' : p.status === 'partial' ? `<span class="g1v-btn part">${p.have} of ${p.need} uploaded</span>` : '<span class="g1v-btn">Import data</span>';
        return `<button type="button" class="g1v-plat" data-g1v-plat="${p.key}" aria-label="${esc(p.name)}: ${p.status === 'done' ? 'uploaded' : 'import data'}">${logo(p)}<b>${esc(p.name)}</b><small>${esc(p.type)}</small><span class="need">${perLabel(p.files.length)}${p.optional ? ' · optional' : ''}</span>${btn}</button>`;
      }).join('')}${list.length ? '' : `<p class="g1v-note">No platform called "${esc(S.q)}". PakkaBill reads Meesho, Amazon, Amazon B2B, Flipkart and the GST portal TCS file.</p>`}</div>
      ${D.busy ? '<p class="g1v-note" style="text-align:center">Reading reports…</p>' : ''}</section>`;
    return h;
  }

  function modalHtml() {
    const D = S.data, p = coverage(D.files, D.months).find((x) => x.key === S.modal);
    if (!p) return '';
    const other = (D.files || []).filter((f) => !platformOf(f) || !PLATFORMS.some((x) => x.key === platformOf(f)));
    return `<div class="g1v-ov" data-g1v-ov><div class="g1v-dlg" role="dialog" aria-modal="true" aria-labelledby="g1v-dlg-h" tabindex="-1">
      <div class="hd">${logo(p)}<div><b id="g1v-dlg-h">${esc(p.name)} · Import data</b><small>${esc(p.type)} · ${esc(periodLabel())}</small></div><button type="button" data-g1v-close aria-label="Close">×</button></div>
      <div class="bd">
        <div class="g1v-count"><b>Upload ${p.need} ${p.need === 1 ? 'file' : 'files'}</b><span>${esc(perLabel(p.files.length))}${p.optional ? ' · optional' : ''}</span><span class="g1v-pill ${p.have >= p.need ? 'ok' : p.have ? 'mid' : 'off'}">${p.have} of ${p.need} uploaded</span></div>
        <p class="g1v-where"><b>Where to download:</b> ${esc(p.where)}</p>
        <label class="g1v-drop" data-g1v-drop><input type="file" multiple accept=".xlsx,.xls,.csv,.zip" data-g1v-file><b>${D.busy ? 'Reading reports…' : `Choose ${esc(p.name)} ${p.files.length > 1 ? 'files' : 'file'}`}</b><small>Drop them here or tap to choose. Several at once is fine; .xlsx, .csv or .zip exactly as downloaded.</small></label>
        ${p.slots.map((sl, i) => `<div class="g1v-slot"><div class="t"><b>${p.slots.length > 1 ? (i + 1) + '. ' : ''}${esc(sl.label)}</b><code>${esc(sl.file)}</code>${sl.done ? '<span class="g1v-pill ok">✓ Uploaded</span>' : ''}</div><small>${esc(sl.what)}</small>
          <div class="g1v-mchips">${sl.months.map((x) => `<span class="g1v-mchip ${x.ok ? 'ok' : 'no'}">${x.ok ? '✓' : '✗'} ${esc(monthName(x.m))}</span>`).join('')}</div>
          ${sl.files.length ? `<ul class="g1v-flist">${sl.files.map((f) => `<li><span title="${esc(f.name)}">${esc(f.name)}</span><small>${f.kind === 'invoices' ? (f.docs || []).length + ' documents' : f.kind === 'portaltcs' ? (f.portal || []).length + ' entries' : (f.tcs || []).length + ' rows'}, ${esc(monthsOf(f).map(monthName).join(', ') || 'month unknown')}</small><button type="button" data-g1v-rm="${esc(f.id)}" aria-label="Remove ${esc(f.name)}">×</button></li>`).join('')}</ul>` : ''}
        </div>`).join('')}
        ${other.length ? `<p class="g1v-note g1v-warn" style="margin:0">Also added: ${other.map((f) => esc(f.name)).join(', ')}.</p>` : ''}
      </div>
      <div class="ft"><button type="button" data-g1v-close>${p.status === 'done' ? 'Done' : 'Close'}</button></div></div></div>`;
  }

  function footHtml() {
    const i = STEPS.findIndex((s) => s[0] === S.tab), prev = STEPS[i - 1], next = STEPS[i + 1];
    const nextLabel = next ? (next[0] === 'gstr1' ? 'Generate GSTR1' : next[0] === 'statement' ? 'View statement' : 'Next: ' + next[1]) : '';
    return `<div class="g1v-foot">${prev ? `<button type="button" data-g1v-tab="${prev[0]}">← ${esc(prev[1])}</button>` : ''}${next ? `<button type="button" class="go" data-g1v-tab="${next[0]}">${esc(nextLabel)} →</button>` : ''}</div>`;
  }

  const money = (t) => `<td>${nf(t.txval)}</td><td>${nf(t.iamt)}</td><td>${nf(t.samt)}</td><td>${nf(t.camt)}</td><td>${nf(t.val)}</td>`;

  function statementHtml(C) {
    const D = S.data, P = C.st.platforms;
    let h = `<section class="paper g1v" aria-labelledby="g1v-st"><h3 id="g1v-st">Statement of Imported Data</h3><p class="sub">Please check this statement to verify whether the data has been imported correctly and completely. Months in grey are not in ${esc(periodLabel())}.</p>`;
    if (!P.length) h += `<p class="g1v-note" style="text-align:center">No platform data yet. Go to Import Data and add your Meesho, Amazon or Flipkart reports.</p>`;
    P.forEach((p) => {
      h += `<div class="g1v-card"><div class="hd"><b>${esc(p.name)}</b><span class="g1v-pill off">B2C TYPE${p.months.some((m) => m.b2b || m.cdnr) ? ' + B2B' : ''}</span></div><div class="bd"><div class="tw"><table>
        <thead><tr><th class="l">Month</th><th class="l">Data</th><th>Taxable</th><th>IGST</th><th>SGST</th><th>CGST</th><th>Invoice</th><th></th></tr></thead><tbody>`;
      p.months.forEach((m) => {
        const k = `st|${p.source}|${m.period}`, open = S.open.has(k);
        const cls = m.inReturn ? '' : ' class="out"';
        h += `<tr${cls}><td class="l" rowspan="3"><b>${esc(monthName(m.period))}</b>${m.inReturn ? '' : '<br><small>not in this return</small>'}</td><td class="l">Sales (${m.sales.n})</td>${money(m.sales)}<td rowspan="3"><button type="button" class="g1v-link" data-g1v-open="${esc(k)}">${open ? 'Hide data' : 'Show data'}</button></td></tr>
          <tr${cls}><td class="l">Returns (${m.returns.n})</td>${money(m.returns)}</tr>
          <tr${m.inReturn ? ' class="tot"' : ' class="out tot"'}><td class="l">Net</td>${money(m.net)}</tr>`;
        if (open) h += `<tr><td colspan="8" style="padding:0">${rowsHtml(m)}</td></tr>`;
      });
      h += `</tbody></table></div>`;
      h += `<div class="tw"><table><thead><tr><th class="l">Month</th><th>B2B Sales</th><th>B2C Sales</th><th>CDNR</th><th>Nil Rated</th><th>HSN</th></tr></thead><tbody>${p.months.map((m) => `<tr${m.inReturn ? '' : ' class="out"'}><td class="l">${esc(monthName(m.period))}</td><td>${nf(m.b2b)}</td><td>${nf(m.b2c)}</td><td>${nf(m.cdnr)}</td><td>${nf(m.nil)}</td><td>${nf(m.hsn)}</td></tr>`).join('')}</tbody></table></div>`;
      const noSt = p.months.filter((m) => m.inReturn).reduce((a, m) => a + m.noState, 0);
      if (noSt) h += `<p class="g1v-note g1v-warn">${noSt} rows have a state that could not be read, so they are left out of the return. Check the state names in the report.</p>`;
      h += `</div></div>`;
    });
    if (P.length) {
      const all = P.reduce((t, p) => { ['sales', 'returns', 'net'].forEach((k) => ['n', 'txval', 'iamt', 'camt', 'samt', 'val'].forEach((f) => { t[k][f] += p.total[k][f]; })); return t; }, { sales: zero(), returns: zero(), net: zero() });
      h += `<div class="g1v-card"><div class="hd"><b>All platforms, ${esc(periodLabel())}</b></div><div class="bd"><div class="tw"><table><thead><tr><th class="l">Data</th><th>Taxable</th><th>IGST</th><th>SGST</th><th>CGST</th><th>Invoice</th></tr></thead><tbody>
        <tr><td class="l">Sales (${all.sales.n})</td>${money(all.sales)}</tr><tr><td class="l">Returns (${all.returns.n})</td>${money(all.returns)}</tr><tr class="tot"><td class="l">Net</td>${money(all.net)}</tr></tbody></table></div>
        <p class="g1v-note">Taxable values are before GST. IGST is for buyers in other states, CGST and SGST for buyers in ${esc(stName(C.home) || 'your state')}. Returns count in the month they came back, as the platforms report them.</p></div></div>`;
    }
    const meeshoKinds = new Set((D.files || []).filter((f) => f.source === 'meesho').map((f) => f.kind));
    if (meeshoKinds.size && !(meeshoKinds.has('sales') && meeshoKinds.has('returns'))) h += `<p class="g1v-note g1v-warn">Meesho needs both tcs_sales and tcs_sales_return for the month, otherwise the statement is not complete.</p>`;
    return h + '</section>';
  }

  function rowsHtml(m) {
    const max = 300, list = m.rows.slice(0, max);
    return `<div class="g1v-rows"><table><thead><tr><th class="l">Type</th><th class="l">Date</th><th class="l">Order / Invoice</th><th class="l">State</th><th class="l">HSN</th><th>Rate</th><th>Qty</th><th>Taxable</th><th>Tax</th><th>Invoice</th></tr></thead><tbody>${list.map((r) => `<tr><td class="l">${r.kind === 'returns' ? 'Return' : 'Sale'}${isB2B(r) ? ' B2B' : ''}</td><td class="l">${esc(r.invDate || '')}</td><td class="l">${esc(r.invNo || r.order || '')}</td><td class="l">${esc(r.pos ? r.pos + ' ' + stName(r.pos) : r.stateRaw || '?')}</td><td class="l">${esc(r.hsn || '')}</td><td>${num(r.rate)}%</td><td>${num(r.qty)}</td><td>${nf(r.taxable)}</td><td>${nf(r.tax)}</td><td>${nf(num(r.total) || num(r.taxable) + num(r.tax))}</td></tr>`).join('')}</tbody></table></div>${m.rows.length > max ? `<p class="g1v-note">Showing the first ${max} of ${m.rows.length} rows. <button type="button" class="g1v-link" data-g1v-csv="${esc(m.source + '|' + m.period)}">Download all rows (CSV)</button></p>` : `<p class="g1v-note"><button type="button" class="g1v-link" data-g1v-csv="${esc(m.source + '|' + m.period)}">Download these rows (CSV)</button></p>`}`;
  }

  const pill = (st) => st === 'match' ? '<span class="g1v-pill ok">✓ Matched</span>' : st === 'diff' ? '<span class="g1v-pill bad">Difference</span>' : st === 'noreport' ? '<span class="g1v-pill mid">No report added</span>' : '<span class="g1v-pill off">Not in portal file</span>';

  function tcsHtml(C) {
    const D = S.data, T = C.tcs;
    let h = `<section class="paper g1v" aria-labelledby="g1v-tcs"><h3 id="g1v-tcs">TCS Report</h3><p class="sub">Your platform data against what Meesho, Amazon and Flipkart reported to GST in their GSTR-8, month by month and state by state. The TCS they collected is credited to your cash ledger.</p>`;
    if (!T.hasPortal && T.portalFile) {
      h += `<div class="g1v-card"><div class="hd"><b>The portal's TCS file has nothing for ${esc(periodLabel())}</b></div><div class="bd"><p class="g1v-note">Its entries are for other months. Check the return month in GST Profile, or download the file for this month.</p></div></div>`;
    } else if (!T.hasPortal) {
      h += `<div class="g1v-card"><div class="hd"><b>Add the portal's TCS file to compare</b></div><div class="bd"><p class="g1v-note">On gst.gov.in open Returns Dashboard, pick the month, choose <b>TDS and TCS credit received</b> and download the details. Add the file (the .zip is fine) under Import Data → Match with the GST portal.</p></div></div>`;
    }
    if (T.gstinMismatch.length) {
      T.gstinMismatch.forEach((g) => { h += `<p class="g1v-note g1v-warn">${esc(g.name)}'s operator GSTIN on this page is ${esc(g.ours)}, but GSTR-8 shows ${esc(g.portal)}. Table 14 must use the operator's real GSTIN. <button type="button" class="g1v-link" data-g1v-etin="${esc(g.sources.join(','))}" data-v="${esc(g.portal)}">Use ${esc(g.portal)}</button></p>`; });
    }
    if (!T.groups.length) {
      h += `<p class="g1v-note" style="text-align:center">${(D.rows || []).length ? `No sales through an operator in ${esc(periodLabel())}. Check the return month in GST Profile.` : 'Add your platform reports under Import Data first.'}</p>`;
    }
    // summary by operator and month
    if (T.groups.length) {
      h += `<div class="g1v-card"><div class="hd"><b>Summary, ${esc(periodLabel())}</b>${T.hasPortal ? pill(T.total.status) : ''}</div><div class="bd"><div class="tw"><table><thead><tr><th class="l">Operator</th><th class="l">Month</th><th>Your gross</th><th>Your returns</th><th>Your net</th><th>GSTR-8 gross</th><th>GSTR-8 returns</th><th>GSTR-8 net</th><th>Difference</th><th>TCS</th><th class="l">Status</th></tr></thead><tbody>${T.groups.map((g) => {
        const t = g.total, P = t.hasPortal;
        return `<tr class="${t.status === 'diff' ? 'bad' : t.status === 'match' ? 'good' : ''}"><td class="l"><b>${esc(g.name)}</b><br><small class="mono-ish">${esc(g.portalEtin || g.etin)}</small></td><td class="l">${esc(monthName(g.period))}</td><td>${nf(t.gross)}</td><td>${nf(t.returns)}</td><td><b>${nf(t.net)}</b></td><td>${P ? nf(t.pgross) : '—'}</td><td>${P ? nf(t.preturned) : '—'}</td><td>${P ? `<b>${nf(t.pnet)}</b>` : '—'}</td><td>${P ? (Math.abs(t.diff) < 0.005 ? '0.00' : nf(t.diff)) : '—'}</td><td>${P ? nf(t.tcs) : '—'}</td><td class="l st">${pill(t.status)}</td></tr>`;
      }).join('')}${T.groups.length > 1 ? `<tr class="tot"><td class="l" colspan="2">Total</td><td>${nf(T.total.gross)}</td><td>${nf(T.total.returns)}</td><td>${nf(T.total.net)}</td><td>${T.hasPortal ? nf(T.total.pgross) : '—'}</td><td>${T.hasPortal ? nf(T.total.preturned) : '—'}</td><td>${T.hasPortal ? nf(T.total.pnet) : '—'}</td><td>${T.hasPortal ? nf(T.total.diff) : '—'}</td><td>${T.hasPortal ? nf(T.total.tcs) : '—'}</td><td></td></tr>` : ''}</tbody></table></div>
        <p class="g1v-note">Net is gross sales less returns, taxable value before GST. A difference within ₹1 counts as matched (rounding). Your figures include B2B sales through the operator and leave out nil-rated sales, as GSTR-8 does.</p>`;
      if (T.hasPortal) {
        const due = T.groups.filter((g) => g.total.hasPortal && g.lines.some((L) => L.tcsDue != null));
        const gap = due.filter((g) => Math.abs(r2(g.total.tcs - g.total.tcsDue)) > 2);
        if (due.length) h += `<p class="g1v-note">TCS is ${T.groups.some((g) => g.period < '2024-07') ? '1% (0.5% from 10 July 2024)' : '0.5%'} of the net value. ${gap.length ? `<span class="g1v-warn">${gap.map((g) => `${esc(g.name)} ${esc(monthName(g.period))}: collected ${rs(g.total.tcs)}, 0.5% of net is ${rs(g.total.tcsDue)}`).join('; ')}. Ask the operator's seller support about the gap.</span>` : 'The TCS collected agrees with the net values.'}</p>`;
      }
      h += `</div></div>`;
      // the switch that makes the GSTR-1 use the operators' figures
      if (T.hasPortal && T.total.hasOurs) {
        const diff = T.total.diff, on = !!D.usePortal;
        h += `<div class="g1v-card"><div class="bd"><label class="g1v-tg" style="margin:4px 12px;border:0"><input type="checkbox" data-g1v-useportal ${on ? 'checked' : ''}><span><b>Use the GSTR-8 figures in this GSTR-1</b><small>${on ? `On: Tables 7, 12 and 14 moved by ${rs(num(D.Z && D.Z.portalAdj))} so your return equals what the operators reported.${D.Z && D.Z.portalHsnMiss ? ` ${rs(D.Z.portalHsnMiss)} had no HSN line at the same rate, so Table 12 differs by that amount.` : ''}` : Math.abs(diff) <= 1 ? 'Your reports already match GSTR-8; nothing to move.' : `GSTR-8 is ${diff < 0 ? 'higher' : 'lower'} by ${rs(Math.abs(diff))}. Turning this on ${diff < 0 ? 'adds' : 'takes off'} that amount in Tables 7, 12 and 14, state by state, so your return equals GSTR-8. Find the cause first (a missing report or month) where you can.`}</small></span></label></div></div>`;
      }
      // state-wise detail per operator and month
      T.groups.forEach((g) => {
        const k = `tcs|${g.pan}|${g.period}`, open = k in S.flip ? S.flip[k] : g.differ > 0 && g.total.hasPortal;
        h += `<div class="g1v-card"><div class="hd"><b>${esc(g.name)} · ${esc(monthName(g.period))}</b>${g.total.hasPortal ? (g.differ ? `<span class="g1v-pill bad">${g.differ} of ${g.lines.length} states differ</span>` : `<span class="g1v-pill ok">All ${g.lines.length} states match</span>`) : ''}<button type="button" class="g1v-link" data-g1v-flip="${esc(k)}" data-open="${open ? 1 : 0}">${open ? 'Hide states' : 'State-wise'}</button></div>`;
        if (open) {
          h += `<div class="bd"><div class="tw"><table><thead><tr><th class="l">Place of supply</th><th>Your gross</th><th>Your returns</th><th>Your net</th><th>GSTR-8 gross</th><th>GSTR-8 returns</th><th>GSTR-8 net</th><th>Difference</th><th>TCS</th></tr></thead><tbody>${g.lines.map((L) => `<tr class="${L.status === 'diff' ? 'bad' : ''}"><td class="l">${esc(L.pos && L.pos !== '?' ? L.pos + ' ' + stName(L.pos) : L.stateRaw || '?')}</td><td>${nf(L.ours.gross)}</td><td>${nf(L.ours.returns)}</td><td>${nf(L.ours.net)}</td><td>${L.portal ? nf(L.portal.gross) : '—'}</td><td>${L.portal ? nf(L.portal.returned) : '—'}</td><td>${L.portal ? nf(L.portal.net) : '—'}</td><td>${L.portal ? (Math.abs(L.diff) < 0.005 ? '0.00' : nf(L.diff)) : '—'}</td><td>${L.portal ? nf(L.portal.tcs) : '—'}</td></tr>`).join('')}</tbody></table></div></div>`;
        }
        h += `</div>`;
      });
    }
    const notes = [];
    if (T.otherMonths) notes.push(`${T.otherMonths} GSTR-8 entries are for other months and are not compared. Pick that month in GST Profile to see them.`);
    if (T.noOperator) notes.push(`${T.noOperator} rows have no operator GSTIN, so they are not compared. Add the operator GSTIN in GST Profile.`);
    if (T.hasPortal && T.lines.some((L) => L.pos === '?')) notes.push('The portal file has no place of supply column, so state-wise lines show "?". The operator totals above still compare.');
    if (notes.length) h += notes.map((n) => `<p class="g1v-note g1v-warn">${esc(n)}</p>`).join('');
    return h + '</section>';
  }

  function gstr1Html(C) {
    const D = S.data, Z = D.Z || {}, sum = C.sum;
    let h = `<section class="paper g1v" aria-labelledby="g1v-r"><h3 id="g1v-r">GSTR1 Report</h3><p class="sub">Here is your GSTR-1, table by table as the portal shows it. Download the Excel (government offline-tool format) and the JSON to upload on gst.gov.in.</p>`;
    if (!sum.length) h += `<p class="g1v-note" style="text-align:center">Nothing to report for ${esc(periodLabel())} yet. Add the reports under Import Data and pick the return month.</p>`;
    sum.forEach((t) => {
      if (t.count) {
        h += `<div class="g1v-card"><div class="hd"><b>${esc(t.label)}</b><button type="button" class="g1v-link" data-g1v-goto="g-docs">Edit</button></div><div class="g1v-mob"><div><small>No. of records</small><b>${t.n}</b></div><div><small>Total issued</small><b>${t.issued || 0}</b></div><div><small>Cancelled</small><b>${t.cancel || 0}</b></div><div><small>Net issued</small><b>${t.net || 0}</b></div></div><div class="bd g1v-sumt"><div class="tw"><table><thead><tr><th class="l">Description</th><th>No. of records</th><th>Total issued</th><th>Cancelled</th><th>Net issued</th><th>Option</th></tr></thead><tbody><tr><td class="l">Total</td><td>${t.n}</td><td>${t.issued || 0}</td><td>${t.cancel || 0}</td><td>${t.net || 0}</td><td><button type="button" class="g1v-link" data-g1v-goto="g-docs">Edit</button></td></tr></tbody></table></div></div></div>`;
        return;
      }
      const target = { b2cs: 'g-b2cs', nil: 'g-nil', hsnB2B: 'g-hsn', hsnB2C: 'g-hsn', eco: 'g-eco' }[t.key];
      const vl = t.key === 'cdnr' ? 'Note' : 'Invoice';
      h += `<div class="g1v-card"><div class="hd"><b>${esc(t.label)}</b></div><div class="g1v-mob"><div><small>No. of records</small><b>${t.n}</b></div><div><small>Taxable value</small><b>${nf(t.txval)}</b></div><div><small>Integrated tax</small><b>${nf(t.iamt)}</b></div><div><small>Central tax</small><b>${nf(t.camt)}</b></div><div><small>State/UT tax</small><b>${nf(t.samt)}</b></div><div><small>${vl} value</small><b>${nf(t.val)}</b></div></div><div class="bd g1v-sumt"><div class="tw"><table><thead><tr><th class="l">Description</th><th>No. of records</th><th>Taxable Value (₹)</th><th>Integrated tax (₹)</th><th>Central tax (₹)</th><th>State/UT tax (₹)</th><th>${t.key === 'cdnr' ? 'Note' : 'Invoice'} (₹)</th>${target ? '<th>Option</th>' : ''}</tr></thead><tbody><tr><td class="l">Total</td><td>${t.n}</td><td>${nf(t.txval)}</td><td>${nf(t.iamt)}</td><td>${nf(t.camt)}</td><td>${nf(t.samt)}</td><td>${nf(t.val)}</td>${target ? `<td><button type="button" class="g1v-link" data-g1v-goto="${target}">${t.key.startsWith('hsn') ? 'Edit' : 'View'}</button></td>` : ''}</tr></tbody></table></div></div></div>`;
    });
    // reconciliation: reports to return, every rupee accounted for
    const Bd = C.bridge;
    if (sum.length) {
      h += `<div class="g1v-card"><div class="hd"><b>Reconciliation: your reports to this GSTR-1</b>${Bd.unexplained ? `<span class="g1v-pill bad">${rs(Bd.unexplained)} not explained</span>` : '<span class="g1v-pill ok">✓ Every rupee accounted for</span>'}</div><div class="bd"><div class="tw"><table class="g1v-bridge"><tbody>${Bd.steps.map((s) => `<tr><td class="l">${esc(s.label)}</td><td>${s.key === 'reports' ? nf(s.v) : (s.v > 0 ? '+ ' : '− ') + nf(Math.abs(s.v))}</td></tr>`).join('')}${Bd.unexplained ? `<tr class="bad"><td class="l">Not explained</td><td>${nf(Bd.unexplained)}</td></tr>` : ''}<tr class="tot"><td class="l">Taxable value in GSTR-1 (Tables 4, 5 and 7, less credit notes in 9B)</td><td>${nf(Bd.gstr1)}</td></tr></tbody></table></div>
        <p class="g1v-note">Nil-rated and exempt sales go in Table 8 and are not part of this figure.${Bd.noState ? ` ${rs(Bd.noState)} of rows with an unreadable state are left out of both.` : ''}</p></div></div>`;
    }
    if (C.big.length) h += `<p class="g1v-note g1v-warn">${C.big.length} ${C.big.length === 1 ? 'invoice is' : 'invoices are'} over ₹1 lakh to unregistered buyers in another state (${C.big.slice(0, 4).map((b) => `${esc(b.invNo)} ${rs(b.val)}`).join(', ')}). These belong in Table 5 (B2CL) with the invoice number; move ${C.big.length === 1 ? 'it' : 'them'} on the portal before filing.</p>`;
    // the optional parts and the two files
    const has = !!sum.length;
    h += `<div class="g1v-card"><div class="bd" style="padding:4px 14px 14px">
      <label class="g1v-tg"><input type="checkbox" data-g1v-opt="hsnB2c" ${S.hsnB2c ? 'checked' : ''}><span><b>B2C HSN</b><small>Include the B2C HSN summary (Table 12) in GSTR-1? The portal needs it from 2025.</small></span></label>
      <label class="g1v-tg"><input type="checkbox" data-g1v-opt="docs" ${S.docs ? 'checked' : ''}><span><b>Documents Issued</b><small>Include the documents issued list (Table 13) in GSTR-1?</small></span></label>
      <p class="g1v-ret">Return of ${esc(periodLabel().replace(' ', ' - '))}</p>
      <div class="g1v-acts"><button type="button" class="g1v-dl" data-g1v-xlsx ${has ? '' : 'disabled'}><span class="ic x">XLS</span><span>GSTR1<br>Excel Download</span></button><button type="button" class="g1v-dl" data-g1v-json ${has && D.ready ? '' : 'disabled'}><span class="ic j">JSON</span><span>GSTR1<br>Json Download</span></button></div>
      <p class="g1v-note" style="text-align:center;margin:8px 0 0">${D.ready ? esc(D.fileName || '') + ' · upload it on gst.gov.in: Returns Dashboard → GSTR-1 → Prepare Offline → Upload.' : D.gstinOk ? 'Add reports for this period to download the JSON.' : 'Enter a valid GSTIN in GST Profile to download the JSON.'}</p>
    </div></div>`;
    return h + '</section>';
  }

  function saveBytes(name, bytes, type) {
    const D = S.data, blob = new Blob([bytes], { type });
    if (D.save) {
      return Promise.resolve(D.save(blob, name)).then((r) => {
        if (r === 'saved' && D.toast) D.toast(`Saved ${name}`);
        else if (r === 'blocked' && D.toast) D.toast("This view can't save files. Use the offline copy of PakkaBill.", { tone: 'error' });
      }).catch((e) => D.toast && D.toast(e.message, { tone: 'error' }));
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return Promise.resolve();
  }

  const csvCell = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

  function addFiles(list) {
    const D = S.data, files = [...(list || [])];
    if (!files.length || !D.addFiles) return;
    const want = S.modal, before = new Set((D.files || []).map((f) => f.id));
    Promise.resolve(D.addFiles(files)).then(() => setTimeout(() => {
      const added = (S.data.files || []).filter((f) => !before.has(f.id)), wrong = added.filter((f) => want && platformOf(f) !== want);
      if (wrong.length && D.toast) {
        const nm = (k) => (PLATFORMS.find((x) => x.key === k) || {}).name || 'another platform';
        const n = nm(platformOf(wrong[0]));
        D.toast(`${wrong.map((f) => f.name).join(', ')}: this is ${/^[AEIOU]/.test(n) ? 'an' : 'a'} ${n} report, so it was added there.`);
      }
    }, 50));
  }

  function wire(el) {
    el.querySelectorAll('[data-g1v-plat]').forEach((b) => b.addEventListener('click', () => { S.modal = b.dataset.g1vPlat; S.lastFocus = b.dataset.g1vPlat; drawAll(); }));
    const q = el.querySelector('[data-g1v-q]');
    if (q) q.addEventListener('input', () => { S.q = q.value; const pos = q.selectionStart; drawAll(); const n = S.top && S.top.querySelector('[data-g1v-q]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* type search */ } } });
    const ov = el.querySelector('[data-g1v-ov]');
    if (ov) {
      const close = () => { S.modal = ''; drawAll(); const b = S.top && S.top.querySelector(`[data-g1v-plat="${S.lastFocus}"]`); if (b) b.focus(); };
      ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
      ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
      ov.querySelectorAll('[data-g1v-close]').forEach((b) => b.addEventListener('click', close));
      const dlg = ov.querySelector('.g1v-dlg'); if (dlg && !dlg.contains(document.activeElement)) dlg.focus();
      const inp = ov.querySelector('[data-g1v-file]');
      if (inp) inp.addEventListener('change', () => { const f = [...inp.files]; inp.value = ''; addFiles(f); });
      const dz = ov.querySelector('[data-g1v-drop]');
      if (dz) {
        dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
        dz.addEventListener('dragleave', () => dz.classList.remove('over'));
        dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); addFiles(e.dataTransfer.files); });
      }
      ov.querySelectorAll('[data-g1v-rm]').forEach((b) => b.addEventListener('click', () => S.data.removeFile && S.data.removeFile(b.dataset.g1vRm)));
    }
    el.querySelectorAll('[data-g1v-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.g1vTab)));
    el.querySelectorAll('[data-g1v-open]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.g1vOpen;
      if (S.open.has(k)) S.open.delete(k); else S.open.add(k);
      drawAll();
    }));
    el.querySelectorAll('[data-g1v-flip]').forEach((b) => b.addEventListener('click', () => { S.flip[b.dataset.g1vFlip] = b.dataset.open !== '1'; drawAll(); }));
    el.querySelectorAll('[data-g1v-goto]').forEach((b) => b.addEventListener('click', () => {
      const pg = el.closest('.page'), sec = pg && pg.querySelector(`section[aria-labelledby="${b.dataset.g1vGoto}"]`);
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    el.querySelectorAll('[data-g1v-opt]').forEach((b) => b.addEventListener('change', () => { S[b.dataset.g1vOpt] = b.checked; }));
    const up = el.querySelector('[data-g1v-useportal]');
    if (up) up.addEventListener('change', () => S.data.setUsePortal && S.data.setUsePortal(up.checked));
    el.querySelectorAll('[data-g1v-etin]').forEach((b) => b.addEventListener('click', () => {
      b.dataset.g1vEtin.split(',').forEach((src) => S.data.setEtin && S.data.setEtin(src, b.dataset.v));
    }));
    el.querySelectorAll('[data-g1v-csv]').forEach((b) => b.addEventListener('click', () => {
      const [src, per] = b.dataset.g1vCsv.split('|'), m = calc().st.months.find((x) => x.source === src && x.period === per);
      if (!m) return;
      const head = ['Type', 'B2B', 'Date', 'Invoice no', 'Order', 'Buyer GSTIN', 'State code', 'State', 'HSN', 'Rate', 'Qty', 'Taxable', 'Tax', 'Invoice value'];
      const lines = [head, ...m.rows.map((r) => [r.kind === 'returns' ? 'Return' : 'Sale', isB2B(r) ? 'Yes' : '', r.invDate || '', r.invNo || '', r.order || '', r.buyerGstin || '', r.pos || '', r.stateRaw || stName(r.pos), r.hsn || '', num(r.rate), num(r.qty), r2(r.taxable), r2(r.tax), r2(num(r.total) || num(r.taxable) + num(r.tax))])];
      saveBytes(`${src}_${per}_rows.csv`, new TextEncoder().encode('﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n')), 'text/csv');
    }));
    const xb = el.querySelector('[data-g1v-xlsx]');
    if (xb) xb.addEventListener('click', () => {
      const D = S.data, J = trimJson(D.Z && D.Z.json, { hsnB2c: S.hsnB2c, docs: S.docs }), bytes = offlineWorkbook(J);
      if (!bytes) return;
      saveBytes(`GSTR1_${D.gstin || 'GSTIN'}_${D.fp || ''}.xlsx`, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });
    const jb = el.querySelector('[data-g1v-json]');
    if (jb) jb.addEventListener('click', () => {
      const D = S.data;
      if (!D.ready) return;
      if (D.saveCarry) D.saveCarry();
      const J = trimJson(D.Z && D.Z.json, { hsnB2c: S.hsnB2c, docs: S.docs });
      saveBytes(D.fileName || `GSTR1_${D.gstin}_${D.fp}.json`, new TextEncoder().encode(JSON.stringify(J)), 'application/json');
    });
  }

  root.pbGstr1ViewMount = mount;
})();
