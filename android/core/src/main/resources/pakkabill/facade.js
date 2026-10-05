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

  function fileCatFn(M) {
    var m = (M && M.cats) || {}, ix = {};
    for (var k in m) ix[k.replace(/^\s+|\s+$/g, '').toUpperCase()] = m[k];
    return function (sku) { return m[sku] || ix[String(sku || '').replace(/^\s+|\s+$/g, '').toUpperCase()] || ''; };
  }

  // The whole report for one period. state = { files, costs, marks, expenses, settings, sel }
  function report(stateJson) {
    var st = JSON.parse(stateJson), cfg = settingsOf(st.settings), costs = st.costs || {}, marks = st.marks || {}, exps = st.expenses || [];
    var sel = st.sel || { mode: 'all', basis: 'pay' };
    var files = st.files || [];
    var out = { files: files.map(function (f) { return { id: f.id, name: f.name, size: f.size, at: f.at, sheets: f.sheets, cats: Object.keys(f.cats || {}).length }; }) };
    if (!files.length) { out.empty = true; out.catList = E.catNames(); return JSON.stringify(out); }
    var M = E.merge(files), IX = E.index(M, cfg, costs, marks), H = E.health(M);
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
      e.cost = costs[k] && costs[k].c != null ? costs[k].c : null;
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
    out.health = { legs: H.legs, ordRows: H.ordRows };
    out.sum = {
      NP: R.NP, NS: R.NS, NR: R.NR, margin: R.margin, payout: R.payout, COGS: R.COGS, sales: K.sales, del: K.del || 0,
      perDel: K.del ? Math.round(R.NP / K.del) : 0, pieces: K.fu, rdef: K.rdef, revPend: K.revPend, revPendV: K.revPendV,
      unexpl: K.unexpl, O: K.O, T: K.T, D: K.D, rlu: K.rlu, rlv: K.rlv, REGD: !!R.REGD, claim: !!R.claim,
      missing: R.missing, unalloc: R.unalloc
    };
    out.vs = vs;
    out.lines = R.lines;
    out.bridge = R.bridge;
    out.gst = R.gst || null;
    out.returns = RV ? { done: RV.done, delivered: RV.delivered, transit: RV.transit, loss: RV.loss,
      rtoRate: RV.rtoRate, retRate: RV.retRate, exchRate: RV.exchRate, lostRate: RV.lostRate, G: RV.G,
      skus: RV.skus.slice(0, 50) } : null;
    out.categories = cats;
    out.skus = R.skus.map(function (x) {
      return { sku: x.sku, pn: x.pn, pcs: x.pcs, sold: x.sold, units: x.units, retRto: x.retU + x.rto, delivered: x.delivered || 0,
        NS: x.NS, contrib: x.contrib, perOrder: x.perOrder, avgPrice: x.avgPrice, breakEven: x.breakEven, cat: catOf(x.sku, x.pn) };
    });
    out.monthly = MO.map(function (m) { return { m: m.m, label: E.fmtMonth(m.m), NS: m.NS, GP: m.GP, NP: m.NP, payout: m.payout, MCx: m.MCx }; });
    out.reconcile = REC.counts;
    out.costs = skuList;
    out.catList = catList;
    out.checks = R.checks;
    return JSON.stringify(out);
  }

  function money(p) { return E.money(p, { sym: '₹', noPaise: true }); }

  return { ingest: ingest, report: report, demo: demo, money: money, catNames: function () { return JSON.stringify(E.catNames()); } };
})();
