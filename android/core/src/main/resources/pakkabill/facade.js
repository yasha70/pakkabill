/* PakkaBill native app: the bridge between the Kotlin app and the Meesho P&L engine (HE, taken
   unchanged from pnl.html at build time, so the app and the website always calculate the same).
   Everything goes in and out as JSON text. Money is integer paise. ES5 only (runs in Rhino). */
var PB = (function () {
  'use strict';
  var E = HE;

  function settingsOf(s) {
    var out = {}, k;
    for (k in E.DEFAULTS) out[k] = E.DEFAULTS[k];
    for (k in (s || {})) out[k] = s[k];
    return out;
  }

  // One uploaded file: sheets = [{ name, rows: [[cell, ...], ...] }]
  function ingest(name, size, sheetsJson, settingsJson) {
    var f = E.ingest(name, size, JSON.parse(sheetsJson), settingsOf(JSON.parse(settingsJson || '{}')));
    return JSON.stringify(f);
  }

  // Sample data: the same blouse and track pant store as the website's "Try with sample data".
  function demo() {
    var D = E.demo();
    var st = { pack: D.pack, biz: 'Sample blouse store', gstReg: true, taxCredits: 'claim', returnDefault: 'ok', rtoDefault: 'ok' };
    var s2 = settingsOf(st);
    return JSON.stringify({
      files: [E.ingest(D.payBook.name, 0, D.payBook.sheets, s2), E.ingest(D.ordBook.name, 0, D.ordBook.sheets, s2)],
      costs: D.costs, expenses: D.expenses, settings: st, marks: {}
    });
  }

  // How combo pieces are found (the website's Costs tab note)
  function packNote(st, M) {
    var pk = M && M.pk, rule = E.packRule(st, M), v = st.packFromSku, mode = v === true || v === 'sku' ? 'sku' : v === false || v === 'name' ? 'name' : 'auto';
    var sku = 'When the product name says the size ("Pack of 5"), that is used. Otherwise each letter before the number in the SKU is a piece and a colour in brackets is one more (BPYG05 = 4, PGWM(GREY)05 = 5, G21 = 1); the number is ignored.';
    var name = 'Read from the product name, like "Combo of 2" or "Pack of 5"; anything else counts as 1 piece.';
    if (mode !== 'auto') return rule === 'sku' ? sku : name;
    if (rule === 'sku' && pk) return 'Automatic: your SKUs follow the letters rule (' + pk.agree + ' of ' + pk.stated + ' combo names agree). ' + sku;
    return 'Automatic: ' + name;
  }

  function fileCatFn(M) {
    var m = (M && M.cats) || {}, ix = {};
    for (var k in m) ix[k.replace(/^\s+|\s+$/g, '').toUpperCase()] = m[k];
    return function (sku) { return m[sku] || ix[String(sku || '').replace(/^\s+|\s+$/g, '').toUpperCase()] || ''; };
  }

  // The uploaded files rarely change, but costs, marks and settings do. The files and their merge
  // are kept here between reports (the engine only reads them), so a cost change does not send
  // and read every Meesho row again. filesKey() says which files are kept.
  var kept = { key: null, files: [], M: null };
  function filesKey() { return kept.key; }

  // The whole report for one period. state = { filesKey, files (left out when kept), costs, marks, expenses, settings, sel }
  function report(stateJson) {
    var st = JSON.parse(stateJson), cfg = settingsOf(st.settings), costs = st.costs || {}, marks = st.marks || {}, exps = st.expenses || [];
    var sel = st.sel || { mode: 'all', basis: 'pay' };
    if (st.files || st.filesKey !== kept.key) kept = { key: st.filesKey == null ? null : st.filesKey, files: st.files || [], M: null };
    var files = kept.files;
    var out = { files: files.map(function (f) { return { id: f.id, name: f.name, size: f.size, at: f.at, sheets: f.sheets, cats: Object.keys(f.cats || {}).length }; }) };
    if (!files.length) { out.empty = true; out.catList = E.catNames(); return JSON.stringify(out); }
    var M = kept.M || (kept.M = E.merge(files)), IX = E.index(M, cfg, costs, marks), H = E.health(M);
    var months = E.dataMonths(M, IX, sel.basis === 'order' ? 'order' : 'pay');
    if (sel.mode === 'month' && months.indexOf(sel.m) < 0) sel = { mode: 'all', basis: sel.basis };
    var per = E.periodFor(sel, M, IX);
    var R = E.compute(M, IX, cfg, exps, per);
    var RV = E.returnsView(M, IX, cfg, per);
    var MO = E.monthly(M, IX, cfg, exps, per.basis);
    var REC = E.reconcile(M, IX, cfg);
    var fileCat = fileCatFn(M);
    function catOf(sku, pn) { var c = costs[sku]; return (c && c.k) || fileCat(sku) || E.categoryOf(pn || sku); }
    var K = R.K;

    // categories
    var cm = {};
    function crow(k) { return cm[k] || (cm[k] = { cat: k, skus: 0, sold: 0, NS: 0, profit: 0, delivered: 0, rto: 0, ret: 0, loss: 0 }); }
    R.skus.forEach(function (x) { var r = crow(catOf(x.sku, x.pn)); r.skus++; r.sold += x.sold; r.NS += x.NS; r.profit += x.contrib; r.delivered += x.delivered || 0; });
    (RV ? RV.skus : []).forEach(function (x) { var r = crow(catOf(x.sku, x.pn)); r.rto += x.rto + x.lost; r.ret += x.ret; r.loss += x.loss; });
    var cats = Object.keys(cm).map(function (k) { return cm[k]; }).sort(function (a, b) { return b.NS - a.NS; });

    // SKU list for the Costs screen (like the website's Costs tab)
    var map = {}, price = {};
    IX.list.forEach(function (x) {
      var k = x.sku; if (!k) return;
      var e = map[k] || (map[k] = { sku: k, pn: '', orders: 0, units: 0 });
      e.orders++; if (x.sale >= 0) e.units += x.q || 1;
      if (!e.pn && x.pn) e.pn = x.pn;
      var v = x.s > 0 ? x.s / (x.q || 1) : x.ord && x.ord.price ? x.ord.price : 0;
      if (v > 0) { var p = price[k] || (price[k] = { t: 0, n: 0 }); p.t += v; p.n++; }
    });
    Object.keys(costs).forEach(function (k) { if (!map[k]) map[k] = { sku: k, pn: '', orders: 0, units: 0 }; });
    var skuList = Object.keys(map).map(function (k) {
      var e = map[k];
      e.pcs = E.piecesOf(k, cfg, costs[k], M); e.auto = E.piecesOf(k, cfg, null, M);
      e.autoCat = fileCat(k) || E.categoryOf(e.pn || k); e.cat = (costs[k] && costs[k].k) || e.autoCat;
      e.price = price[k] ? Math.round(price[k].t / price[k].n) : 0;
      var ce = costs[k] || null;
      e.cost = ce && ce.c != null ? ce.c : null;
      // what the seller saved for this SKU (null = not set), and the GST bill rate that applies
      e.n = ce && ce.n != null ? ce.n : null; e.pack = ce && ce.p != null ? ce.p : null; e.b = ce && ce.b != null ? ce.b : null;
      e.rate = E.buyRate(ce, cfg);
      e.netCost = e.cost != null && e.rate ? Math.round(e.cost * 100 / (100 + e.rate)) : e.cost;
      return e;
    }).sort(function (a, b) { return b.orders - a.orders || (a.sku < b.sku ? -1 : 1); });
    var catList = E.catNames(), other = catList.pop(), extra = {};
    for (var ck in (M.cats || {})) if (catList.indexOf(M.cats[ck]) < 0 && M.cats[ck] !== other) extra[M.cats[ck]] = 1;
    catList = catList.concat(Object.keys(extra).sort()).concat([other]);

    // change vs the month before
    var vs = null;
    if (per.mode === 'month') {
      for (var i = 1; i < MO.length; i++) if (MO[i].m === per.m) vs = { prev: MO[i - 1].m, prevLabel: E.fmtMonth(MO[i - 1].m), diff: MO[i].NP - MO[i - 1].NP };
    }

    out.months = months.map(function (m) { return { m: m, label: E.fmtMonth(m) }; });
    out.per = per; out.sel = sel;
    out.health = H;
    out.dup = M.dup || {};
    // amounts of each expense counted in this period (the website's Expenses tab shows them)
    out.expIn = {}; R.EXL.forEach(function (x) { out.expIn[x.id] = x.amt; });
    out.packNote = packNote(cfg, M);
    out.packAgree = M.pk ? { agree: M.pk.agree, stated: M.pk.stated } : null;
    out.sum = {
      NP: R.NP, NS: R.NS, NR: R.NR, margin: R.margin, payout: R.payout, COGS: R.COGS, sales: K.sales, del: K.del || 0,
      perDel: K.del ? Math.round(R.NP / K.del) : 0, pieces: K.fu, rdef: K.rdef, revPend: K.revPend, revPendV: K.revPendV,
      unexpl: K.unexpl, O: K.O, T: K.T, D: K.D, rlu: K.rlu, rlv: K.rlv, REGD: !!R.REGD, claim: !!R.claim,
      missing: R.missing, unalloc: R.unalloc, IG: K.IG || 0, parcels: K.parcels, OPEX: R.OPEX, GP: R.GP, adsNet: R.adsNet
    };
    out.vs = vs;
    out.lines = R.lines;
    out.bridge = R.bridge;
    out.gst = R.gst || null;
    out.gstRows = R.gst ? E.gstRows(R.gst).map(function (x) { return { l: x[0], v: x[1], b: !!x[2] }; }) : [];
    out.returns = RV ? { done: RV.done, delivered: RV.delivered, transit: RV.transit, loss: RV.loss,
      rtoRate: RV.rtoRate, retRate: RV.retRate, exchRate: RV.exchRate, lostRate: RV.lostRate, G: RV.G,
      skus: RV.skus.slice(0, 50), cols: RV.cols.filter(function (c) { return c.rto || c.ret || c.exch || c.lost; }) } : null;
    out.categories = cats;
    out.skus = R.skus.map(function (x) {
      return { sku: x.sku, pn: x.pn, pcs: x.pcs, sold: x.sold, units: x.units, retRto: x.retU + x.rto, delivered: x.delivered || 0,
        NS: x.NS, contrib: x.contrib, perOrder: x.perOrder, avgPrice: x.avgPrice, breakEven: x.breakEven, cat: catOf(x.sku, x.pn),
        COGS: x.COGS, MC: x.MC, pack: x.pack, perUnit: x.perUnit, ret: x.retU, rto: x.rto };
    });
    out.monthly = MO.map(function (m) { return { m: m.m, label: E.fmtMonth(m.m), NS: m.NS, GP: m.GP, NP: m.NP, payout: m.payout, MCx: m.MCx,
      COGS: m.COGS, ads: m.ads, OPEX: m.OPEX, orders: m.orders, parcels: m.parcels }; });
    out.reconcile = REC.counts;
    // every order, as on the website's Reconcile tab (newest first), and payouts by date
    out.orders = REC.rows.map(function (r) {
      return { id: r.id, b: r.b, st: r.st, label: E.ST_LABEL[r.st] || '', sku: r.sku, pn: r.pn, od: r.od, pd: r.pd, legs: r.legs, f: r.f,
        est: r.est, cond: r.cond, condDef: r.condDef, flags: r.flags, issue: !!r.issue, hasPay: r.hasPay, q: r.q };
    });
    out.payouts = E.payouts(M).map(function (p) { return { d: p.d, n: p.n, f: p.f, ads: p.ads, other: p.ref + p.adj, net: p.net, tx: p.tx.slice(0, 3) }; });
    out.lastPd = REC.lastPd; out.firstPd = REC.firstPd;
    out.costs = skuList;
    out.catList = catList;
    out.checks = R.checks;
    return JSON.stringify(out);
  }

  function money(p) { return E.money(p, { sym: '₹', noPaise: true }); }

  function guide() { return typeof GUIDE === 'undefined' ? '{}' : JSON.stringify(GUIDE); }

  return { ingest: ingest, report: report, filesKey: filesKey, demo: demo, money: money, guide: guide, catNames: function () { return JSON.stringify(E.catNames()); } };
})();
