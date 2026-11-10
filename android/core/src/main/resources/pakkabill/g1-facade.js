/* PakkaBill native app: GSTR-1 JSON. The parts that work out the return are the website's own, taken
   from index.html (PBG1B: reading the marketplace reports and building the return), gstr1check.js
   (PBG1: checks, Excel for the CA) and gstr1view.js (PBG1V: statement, TCS report, summary). This file
   is the website page's glue around them (index.html, the GSTR-1 page: months, document series,
   defaults and the page's notes), line for line, with the page's state passed in. ES5 only. */
var PBGstr1 = (function () {
  'use strict';
  var B = PBG1B, V = PBG1V, C = PBG1;
  var S = { files: [], Z: null, st: null, M: [], R: '', K: '' };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var uniq = function (a) { var o = [], s = {}; a.forEach(function (x) { if (!s.hasOwnProperty(x)) { s[x] = 1; o.push(x); } }); return o; };
  var flat = function (a, f) { var o = []; a.forEach(function (x) { o.push.apply(o, f(x) || []); }); return o; };

  /* ---------------- reports ---------------- */

  // sheets: [{name, rows: [[cell, ...], ...]}] as the app reads the spreadsheet (index.html cp)
  function addFile(id, name, sheets) {
    var book = { SheetNames: sheets.map(function (s) { return s.name; }), Sheets: {} };
    sheets.forEach(function (s) { book.Sheets[s.name] = s.rows; });
    var info = { id: String(id), name: name, note: '', source: 'meesho', kind: null, tcs: [], docs: [], period: '', message: '' };
    var f;
    try { f = B.parseBook(book, info); } catch (e) { f = Object.assign({}, info, { message: "Couldn't read this file: " + (e && e.message || e) }); }
    if (!f.kind) return { ok: false, message: f.message || "This doesn't look like a Meesho, Amazon or Flipkart GST report. Use the file exactly as downloaded." };
    S.files = S.files.filter(function (x) { return x.id !== f.id; }).concat([f]);
    return { ok: true, file: fileInfo(f) };
  }
  function removeFile(id) { S.files = S.files.filter(function (f) { return f.id !== String(id); }); }
  function clear() { S.files = []; S.Z = null; }
  function fileInfo(f) {
    return { id: f.id, name: f.name, source: f.source, kind: f.kind, period: f.period || '', rows: (f.tcs || []).length, docs: (f.docs || []).length,
      portal: (f.portal || []).length, note: f.note || '', platform: V.platformOf(f) };
  }

  /* ---------------- what the page fills in by itself (the page's useEffect) ---------------- */

  // st.gstin is what the seller typed; returns the GSTIN of most rows, the newest month, operator GSTINs and HSN words
  function defaults(st) {
    var L = flat(S.files, function (e) { return e.tcs; }).filter(function (e) { return st.cashback !== false || e.bucket !== 'cashback'; });
    var count = {}, best = '', bn = 0;
    L.forEach(function (e) { if (e.gstin) { count[e.gstin] = (count[e.gstin] || 0) + 1; if (count[e.gstin] > bn) { bn = count[e.gstin]; best = e.gstin; } } });
    var D = uniq(S.files.map(function (e) { return e.period; }).filter(Boolean)).sort().reverse();
    var gstin = best || st.gstin || '';
    var pbSt = gstin.slice(0, 2), ebs = {};
    if (/^\d\d$/.test(pbSt)) S.files.forEach(function (e) { if (B.opPan[e.source] && !ebs[e.source]) ebs[e.source] = B.opGstin(pbSt + B.opPan[e.source] + '1C'); });
    var desc = {};
    flat(S.files, function (e) { return e.docs; }).forEach(function (e) {
      if (e.hsn && !desc[e.hsn] && e.desc) desc[e.hsn] = e.desc.replace(/["\\`]+/g, '').split(/[|,(]| - /)[0].replace(/\s+/g, ' ').trim().slice(0, 30);
    });
    return { gstin: best, period: D[0] || '', etinBySource: ebs, hsnDesc: desc };
  }

  /* ---------------- the return (the page's render) ---------------- */

  function prevFp(fp, q) { var m = +fp.slice(0, 2) - (q ? 3 : 1), y = +fp.slice(2); while (m < 1) { m += 12; y--; } return pad(m) + y; }
  function carryGet(all, g, fp, q) { var a = (all || {})[g] || {}, p = prevFp(fp, q), c = a[p]; return c && c.items && c.items.length ? { from: p, items: c.items } : null; }

  /* st: { gstin, period 'YYYY-MM', quarterly, uqc, cashback, tagEtin, table14, bills (add PakkaBill bills), usePortal, carryOn,
          etinBySource, hsnDesc, docs (Table 13 counts changed by hand: key -> {count, cancel}), carry (saved carries),
          shopGstin, invoices (PakkaBill bills), hsnB2c, docTable } */
  function compute(st) {
    var a = S.files, d = st.period, p = !!st.quarterly, T = st.cashback !== false, k = st.docs || {}, Q = st.etinBySource || {};
    var L = flat(a, function (e) { return e.tcs; }).filter(function (e) { return T || e.bucket !== 'cashback'; });
    var M = p ? (function () { var y = +d.slice(0, 4), m0 = +d.slice(5, 7), t = m0 - (m0 - 1) % 3; return [0, 1, 2].map(function (i) { return y + '-' + pad(t + i); }); })() : [d];
    var last = M[M.length - 1], R = last ? last.slice(5, 7) + last.slice(0, 4) : '';
    var label = p ? B.monthLabel(M[0]).split(' ')[0] + ' to ' + B.monthLabel(M[2]) : B.monthLabel(d);
    var P = flat(a, function (e) { return e.tcs; }).filter(function (e) { return e.bucket === 'cashback' && M.indexOf(e.period) >= 0; }).length;
    var j = B.gstinCheck(st.gstin || ''), K = B.gstinClean(st.gstin || '');
    var G = !!st.shopGstin && B.gstinClean(st.shopGstin) === K;
    var invoices = st.invoices || [];
    var Vb = invoices.filter(function (e) { return e.docType === 'invoice' && M.indexOf(String(e.date || '').slice(0, 7)) >= 0; });
    var z = !!st.bills && G;
    var W = flat(a.filter(function (e) { return e.kind === 'invoices'; }), function (e) { return e.docs.filter(function (x) { return M.indexOf(x.date ? x.date.slice(0, 7) : e.period) >= 0; }); });
    var X = L.filter(function (e) { return M.indexOf(e.period) >= 0 && e.invNo; });
    var Y = flat(B.marketplaces, function (e) {
      var pbC = uniq(flat(a.filter(function (A) { return A.source === e; }), function (A) { return A.cancelled || []; }).filter(function (A) { return M.indexOf(A.period) >= 0; }).map(function (A) { return A.invNo; }));
      var cset = new Set(pbC);
      var A = uniq(X.filter(function (x) { return x.source === e && x.kind === 'sales' && !x.cbType; }).map(function (x) { return x.invNo; }).concat(pbC));
      var t = uniq(X.filter(function (x) { return x.source === e && (x.kind === 'returns' && !x.cbType || x.cbType === 'credit'); }).map(function (x) { return x.invNo; })).filter(function (x) { return A.indexOf(x) < 0; });
      var dn = uniq(X.filter(function (x) { return x.source === e && x.cbType === 'debit'; }).map(function (x) { return x.invNo; })).filter(function (x) { return A.indexOf(x) < 0 && t.indexOf(x) < 0; });
      return B.series(A, 1, B.ops[e], cset).concat(B.series(t, 5, B.ops[e]), B.series(dn, 4, B.ops[e]));
    });
    var J = B.series(W.filter(function (e) { return e.type === 'invoice'; }).map(function (e) { return e.number; }), 1, 'Meesho')
      .concat(B.series(W.filter(function (e) { return e.type === 'debit'; }).map(function (e) { return e.number; }), 4, 'Meesho'),
        B.series(W.filter(function (e) { return e.type === 'credit'; }).map(function (e) { return e.number; }), 5, 'Meesho'), Y,
        z ? B.series(Vb.map(function (e) { return e.number; }), 1, 'PakkaBill', new Set(Vb.filter(function (e) { return e.status === 'cancelled'; }).map(function (e) { return e.number; }))) : [])
      .map(function (e) {
        var A = k[e.key] || {}, t = Math.max(1, A.count != null ? A.count : e.count);
        return Object.assign({}, e, { count: t, cancel: Math.min(Math.max(0, A.cancel != null ? A.cancel : e.cancel), t) });
      });
    var cIx = /^\d{6}$/.test(R) && K ? carryGet(st.carry, K, R, p) : null, cU = st.carryOn !== false;
    var portal = st.usePortal ? flat(a.filter(function (e) { return e.kind === 'portaltcs'; }), function (e) { return e.portal; }).filter(function (e) { return M.indexOf(e.period) >= 0; }).map(function (e) {
      var A = null; Object.keys(Q).forEach(function (s) { var g = Q[s]; if (!A && g && g.slice(2, 12) === e.etin.slice(2, 12)) A = g; });
      return A && A !== e.etin ? Object.assign({}, e, { etin: A }) : e;
    }) : null;
    var Z = B.build({
      gstin: K, fp: R, months: M, tcs: cU && cIx ? L.concat(B.carryRows(cIx, M)) : L, carryIn: cU && cIx ? cIx.items : [], carryFrom: cIx ? cIx.from : '',
      etinBySource: Q, tagEtin: !!st.tagEtin, table14: st.table14 !== false, uqc: st.uqc || 'PCS', hsnDesc: st.hsnDesc || {}, docSeries: J, local: z ? invoices : [], portal: portal
    });

    // the page's notes around the return
    var q = Z.warnings.map(function (e) { return { tone: 'warn', text: e }; });
    var ee = a.some(function (e) { return e.source === 'meesho'; }), eA = B.kinds.filter(function (e) { return !a.some(function (A) { return A.kind === e; }); });
    if (ee && eA.length) q.unshift({ tone: 'warn', text: 'Meesho reports not added yet: ' + eA.map(function (e) { return B.kindNames[e]; }).join(', ') + '.' });
    B.marketplaces.forEach(function (e) {
      if (a.some(function (A) { return A.source === e; }) && !Q[e]) q.push({ tone: 'info', text: B.ops[e] + "'s report carries no operator GSTIN. Add it below if you report Table 14, otherwise those sales stay in Table 7 as ordinary B2C." });
    });
    if (Z.ecoB2bCount) q.push({ tone: 'info', text: Z.ecoB2bCount + ' marketplace ' + (Z.ecoB2bCount === 1 ? 'invoice was' : 'invoices were') + ' sold to registered buyers, so they go in Table 4 with their invoice numbers rather than the B2C table.' });
    a.filter(function (e) { return e.note; }).forEach(function (e) { q.push({ tone: 'info', text: e.name + ': ' + e.note }); });
    var et = uniq(L.map(function (e) { return e.gstin; })).filter(function (e) { return e && e !== K; });
    if (et.length) q.unshift({ tone: 'warn', text: 'Some reports are for a different GSTIN (' + et.join(', ') + '). Only file reports that belong to ' + (K || 'your GSTIN') + '.' });
    if (Z.outOfPeriod) q.push({ tone: 'info', text: Z.outOfPeriod + ' report rows belong to other months and are left out of ' + label + '.' });
    var er = new Set(W.filter(function (e) { return e.type === 'invoice'; }).map(function (e) { return e.order; }));
    var en = L.filter(function (e) { return e.kind === 'sales' && e.qty > 0 && M.indexOf(e.period) >= 0 && er.size && !er.has(e.order); });
    if (en.length) q.push({ tone: 'info', text: en.length + ' shipped ' + (en.length === 1 ? 'order has' : 'orders have') + ' no invoice number in the tax invoice report. Table 13 counts only the numbers in that report.' });
    J.filter(function (e) { return e.missing.length; }).forEach(function (e) {
      q.push({ tone: 'info', text: e.label + ' ' + e.from + ' to ' + e.to + ': ' + (e.rangeSize - e.count) + " numbers in between aren't in the report (" + e.missing.slice(0, 6).join(', ') + (e.missing.length > 6 ? ', …' : '') + '). If they were issued this period, raise the total in Table 13.' });
    });
    var es = Z.b2cs.length > 0 || Z.hsnB2c.length > 0 || Z.hsnB2b.length > 0, el = j.state === 'valid' || j.state === 'checksum', eo = es && el && /^\d{6}$/.test(R);
    S.Z = Z; S.M = M; S.R = R; S.K = K; S.st = st; S.label = label; S.L = L; S.cIx = cIx; S.cU = cU;

    // the steps view (gstr1view.js calc)
    var home = K.slice(0, 2);
    var portalRows = flat(a.filter(function (f) { return f.kind === 'portaltcs'; }), function (f) { return f.portal || []; });
    var stmt = V.statement(L, { home: home, months: M });
    stmt.months.forEach(function (m) { delete m.rows; });
    stmt.platforms.forEach(function (pl) { pl.months.forEach(function (m) { delete m.rows; }); });
    var tcs = V.tcsReport(L, portalRows, { months: M, etinBySource: Q });
    var cov = V.coverage(a, M).map(function (pl) {
      return { key: pl.key, name: pl.name, type: pl.type, color: pl.color, where: pl.where, optional: !!pl.optional, status: pl.status, need: pl.need, have: pl.have,
        added: pl.added.map(function (f) { return f.id; }),
        slots: pl.slots.map(function (sl) { return { id: sl.id, label: sl.label, file: sl.file, what: sl.what, done: sl.done, months: sl.months, files: sl.files.map(function (f) { return f.id; }) }; }) };
    });
    return {
      files: a.map(fileInfo), months: M, fp: R, label: label, gstin: K, gstinState: j.state, gstinMsg: j.message || '', ready: eo, fileName: 'GSTR1_' + (K || 'GSTIN') + '_' + R + '.json',
      cashbackRows: P, sameShop: G, notes: q, docSeries: J, carryFrom: cIx ? cIx.from : '', carryIn: cU && cIx ? cIx.items.length : 0,
      z: {
        b2bCount: Z.b2bCount, b2clCount: Z.b2clCount, cdnrCount: Z.cdnrCount, ecoB2bCount: Z.ecoB2bCount, outOfPeriod: Z.outOfPeriod, unknownStates: Z.unknownStates,
        sales: Z.sales, returns: Z.returns, net: Z.net, sourceTotals: Z.sourceTotals, carryOut: Z.carryOut, portalAdj: Z.portalAdj,
        b2cs: Z.b2cs, hsnB2c: Z.hsnB2c, hsnB2b: Z.hsnB2b, eco: Z.eco
      },
      summary: V.summary(Z.json), totals: V.returnTotals(Z.json), statement: stmt, tcs: tcs, coverage: cov,
      bridge: V.bridge(L, Z, { months: M, bills: z, carryOn: cU }), big: V.b2clCandidates(L, { home: home, months: M })
    };
  }

  /* ---------------- files out ---------------- */

  function trimmed() { return V.trimJson(S.Z.json, { hsnB2c: S.st.hsnB2c !== false, docs: S.st.docTable !== false }); }
  function jsonText() { return S.Z ? JSON.stringify(trimmed()) : null; }
  function extra() { return { carryOut: S.Z.carryOut, carryIn: S.Z.carryIn, carryFrom: S.cIx && S.cU ? S.cIx.from : '', sales: S.Z.sales, returns: S.Z.returns, sourceTotals: S.Z.sourceTotals, period: S.label }; }
  function workbook() { return S.Z ? C.workbook(trimmed(), extra()) : null; }
  function offline() { return S.Z ? V.offlineWorkbook(trimmed()) : null; }
  // what to keep for the next return (the page's pbCarrySave): gstin -> fp -> {items, at}
  function carrySave(all, now) {
    if (!S.Z || !S.K || !/^\d{6}$/.test(S.R)) return all || {};
    var o = JSON.parse(JSON.stringify(all || {}));
    o[S.K] = o[S.K] || {};
    o[S.K][S.R] = { items: S.Z.carryOut, at: now };
    return o;
  }

  /* ---------------- the checker (gstr1check.js) ---------------- */
  function check(text) {
    var j;
    try { j = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { return C.check(null, { marketplace: true }); }
    return C.check(j, { marketplace: true });
  }
  function ownCheck() { return S.Z ? C.check(trimmed(), { marketplace: true }) : null; }
  function cleaned(text) { var r = C.clean(JSON.parse(text)); return { text: JSON.stringify(r.json), changes: r.changes }; }
  function compare(a, b) { return C.compare(JSON.parse(a), JSON.parse(b)); }
  function workbookOf(text) { return C.workbook(JSON.parse(text), {}); }

  return { addFile: addFile, removeFile: removeFile, clear: clear, defaults: defaults, compute: compute, jsonText: jsonText, workbook: workbook, offline: offline,
    carrySave: carrySave, check: check, ownCheck: ownCheck, cleaned: cleaned, compare: compare, workbookOf: workbookOf,
    states: function () { return B.states; } };
})();
