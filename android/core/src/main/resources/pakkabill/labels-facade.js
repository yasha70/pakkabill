/* PakkaBill native app: Labels & packing chart. The engine (PBL) is the website's own, taken from
   labels.html when the app is built. The helpers here are the website page's (labels.html: classify,
   manInfo, chartSource, chartFor, couriersOf, parcelsOf, mappedText, chartDoc, chartCsv, chartText),
   with the page's state passed in. The app keeps one copy of this per Labels screen. ES5 only. */
var PBLabels = (function () {
  'use strict';
  var L = PBL, SEP = String.fromCharCode(1);
  var S = { files: [] };
  var RANGE = { L: '26-30', XL: '32-34', XXL: '36-40' };

  // labels.html readFile: one page's pdf.js-style text items -> what the page is
  function readPage(fid, pi, pg) {
    var ls = L.lines(L.words(pg.items || [])), mk = L.pageKind(ls), lab = mk ? { ok: false, why: 'man' } : L.parseLabel(ls);
    return { fid: fid, pi: pi, lab: lab, lines: ls, view: pg.view, rot: pg.rot || 0, mk: mk, man: !!mk };
  }
  // labels.html classify: label / manifest / unread, page by page
  function classify(f) {
    var anyLabel = f.pages.some(function (p) { return p.lab.ok; }), anyMan = f.pages.some(function (p) { return p.man; });
    var prevMan = false;
    f.pages.forEach(function (p) {
      if (p.lab.ok) p.kind = 'label';
      else if (p.man || (!anyLabel && anyMan) || (prevMan && p.lines.length)) p.kind = 'man';
      else p.kind = 'bad';
      prevMan = p.kind === 'man';
    });
  }
  function fileInfo(f) {
    var nl = 0, nm = 0, nb = 0;
    f.pages.forEach(function (p) { if (p.kind === 'label') nl++; else if (p.kind === 'man') nm++; else nb++; });
    return { id: f.id, name: f.name, pages: f.n, labels: nl, man: nm, bad: nb };
  }
  // pages = [{items, view: [x0, y0, x1, y1], rot}]
  function addFile(id, name, pages) {
    var f = { id: id, name: name, n: pages.length, pages: pages.map(function (pg, i) { return readPage(id, i, pg); }) };
    classify(f);
    S.files = S.files.filter(function (x) { return x.id !== id; }).concat([f]);
    manCache.key = null;
    return fileInfo(f);
  }
  function removeFile(id) { S.files = S.files.filter(function (f) { return f.id !== id; }); manCache.key = null; }
  function clear() { S.files = []; manCache.key = null; }

  function allPages() { var a = []; S.files.forEach(function (f) { f.pages.forEach(function (p) { a.push(p); }); }); return a; }
  function labelPages() { return allPages().filter(function (p) { return p.kind === 'label'; }); }
  function manPages() { return allPages().filter(function (p) { return p.kind === 'man'; }); }
  function badPages() { return allPages().filter(function (p) { return p.kind === 'bad'; }); }
  var manCache = { key: null, val: null };
  function manInfo() {
    var m = manPages(), key = m.map(function (p) { return p.fid + ':' + p.pi; }).join(',');
    if (key !== manCache.key) manCache = { key: key, val: m.length ? L.parseManifest(m.map(function (p) { return p.lines; })) : null };
    return manCache.val;
  }
  function chartSource() {
    var man = manInfo(), labs = labelPages();
    if (man && man.structured) return { from: 'man', items: man.rows, man: man, parcels: man.rows.length };
    if (labs.length) {
      var it = [];
      labs.forEach(function (p) { p.lab.rows.forEach(function (r) { it.push({ sku: r.sku, size: r.size, qty: r.qty, courier: p.lab.courier || 'Other', pid: p.fid + ':' + p.pi }); }); });
      return { from: 'labels', items: it, man: man, parcels: labs.length };
    }
    if (man && man.pick.length) return { from: 'pick', items: man.pick, man: man, parcels: null };
    return null;
  }
  function blouseOn(o, items) { return o.blouse == null ? L.looksBlouse(items) : !!o.blouse; }
  function parcelsOf(items) { var seen = {}, n = 0; items.forEach(function (it, i) { var k = it.pid || i; if (!seen[k]) { seen[k] = 1; n++; } }); return n; }
  function couriersOf(items) {
    var by = {}, n = {};
    items.forEach(function (it) { if (it.courier) (by[it.courier] = by[it.courier] || []).push(it); });
    Object.keys(by).forEach(function (c) { n[c] = parcelsOf(by[c]); });
    return { count: n, all: parcelsOf(items), names: Object.keys(n).sort(function (a, b) { return n[b] - n[a] || (a < b ? -1 : 1); }) };
  }
  function chartFor(o, src, courier) {
    var items = courier && courier !== 'all' ? src.items.filter(function (it) { return it.courier === courier; }) : src.items;
    var ch = L.packChart(items, { blouse: blouseOn(o, src.items), sort: o.chartSort });
    ch.parcels = courier && courier !== 'all' ? parcelsOf(items) : src.parcels;
    return ch;
  }
  function mappedText(ch, sep) {
    var by = {}, order = [];
    ch.mapped.forEach(function (m) { if (!by[m.to]) { by[m.to] = []; order.push(m.to); } by[m.to].push(m.from); });
    return order.map(function (k) { return k + ': ' + by[k].join(', '); }).join(sep || ' · ');
  }
  function ordered(o) {
    var labs = labelPages().map(function (p, i) { p.i = i; return p; });
    return L.sortLabels(labs, o);
  }
  function fmtDateEn(d) { var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return d.getDate() + ' ' + M[d.getMonth()] + ' ' + d.getFullYear(); }

  // labels.html chartDoc: what the designed packing chart pages show
  function chartDoc(o, src, forLabels, chk) {
    var man = src.man, bl = blouseOn(o, src.items), all = chartFor(o, src, 'all'), cs = couriersOf(src.items), pc = !forLabels && src.from === 'man' ? L.pickCheck(man) : null;
    var pct = function (v) { return all.grand ? Math.round(1000 * v / all.grand) / 10 + '%' : '0%'; };
    var kp = [{ label: 'PIECES TO PACK', value: all.grand, note: (all.parcels != null ? all.parcels + (forLabels ? ' labels' : ' parcels') + '  ·  ' : '') + all.rows.length + ' SKUs' }];
    if (bl) ['L', 'XL', 'XXL'].forEach(function (k) { kp.push({ label: 'SIZE ' + k, value: all.totals[k] || 0, note: pct(all.totals[k] || 0) + '  ·  ' + RANGE[k] + ' in', size: k }); });
    else kp.push({ label: forLabels ? 'LABELS' : 'PARCELS', value: all.parcels != null ? all.parcels : '-', icon: 'box' }, { label: 'SKUS', value: all.rows.length, icon: 'tag' }, { label: 'COURIERS', value: cs.names.length || '-', icon: 'truck' });
    var notes = [];
    if (bl && all.mapped.length) notes.push({ text: 'Sizes counted as  -  ' + mappedText(all, '   ') + '. A free-size range counts by its middle.', kind: 'muted' });
    if (pc) notes.push(pc.same ? { text: 'Checked: every SKU and size matches Meesho\'s own picklist in the manifest (' + pc.pieces + ' pieces).', kind: 'ok' }
      : { text: 'Not the same as Meesho\'s picklist in the manifest: ' + pc.diffs.length + ' differences. See them in PakkaBill before packing.', kind: 'warn' });
    if (chk) notes.push(chk.off.length || chk.extra.length ? { text: 'Manifest: ' + chk.on.length + ' of ' + chk.on.concat(chk.off).length + ' labels found' + (chk.extra.length ? ', ' + chk.extra.length + ' listed without a label' : '') + '. Check them before handing over.', kind: 'warn' }
      : { text: 'Every label is on the Meesho manifest.', kind: 'ok' });
    var date = (man && man.date) || fmtDateEn(new Date());
    return {
      kicker: 'Ready to pack,', title: 'Packing chart', pill: forLabels ? 'LABELS IN ORDER' : 'PACKING CHART', date: date, blouse: bl,
      tagline: forLabels ? 'Packing chart for your sorted Meesho labels' : 'Packing chart from your Meesho manifest',
      sub: (bl ? 'Blouse sizes as L / XL / XXL' : 'Every size as written') + '  ·  ' + date,
      forName: (man && man.supplier) || '', forLine: forLabels ? all.parcels + ' labels sorted by SKU and size  ·  ' + cs.names.length + (cs.names.length === 1 ? ' courier' : ' couriers')
        : (src.from === 'man' ? 'From the Meesho manifest' : src.from === 'labels' ? 'From the labels' : 'From the picklist') + (all.parcels != null ? '  ·  ' + all.parcels + ' parcels' : '') + (cs.names.length ? '  ·  ' + cs.names.length + (cs.names.length === 1 ? ' courier' : ' couriers') : ''),
      main: all, kpis: kp, notes: notes, tableSub: 'Most pieces first' + (forLabels ? '. The labels follow in SKU and size order.' : '. One table for each courier follows.'),
      sections: forLabels || cs.names.length < 2 ? [] : cs.names.map(function (c) { var ch = chartFor(o, src, c); return { title: c, sub: ch.parcels + ' parcels  ·  ' + ch.grand + ' pieces', chart: ch }; }),
      stamp: pc && pc.same ? { top: 'MATCHED WITH MEESHO', bottom: 'PICKLIST  ' + pc.pieces + ' PCS' } : chk && !chk.off.length && !chk.extra.length ? { top: 'EVERY LABEL ON THE', bottom: 'MEESHO MANIFEST' } : null,
      footer: 'Made with PakkaBill from your Meesho ' + (forLabels ? 'labels' : 'manifest') + '  ·  not a Meesho document',
      end: forLabels ? '' : 'Pack pakka, ship fast!'
    };
  }
  function chartRows(ch) {
    var rows = [['SKU'].concat(ch.cols, ['Total'])];
    ch.rows.forEach(function (r) { rows.push([r.sku].concat(ch.cols.map(function (c) { return r.cells[c] || 0; }), [r.total])); });
    rows.push(['GRAND TOTAL'].concat(ch.cols.map(function (c) { return ch.totals[c] || 0; }), [ch.grand]));
    return rows;
  }
  // labels.html chartText: the chart for WhatsApp
  function chartText(o, src, title, total, date) {
    var ch = chartFor(o, src, o.chartCourier), man = src.man, cur = o.chartCourier !== 'all' && couriersOf(src.items).count[o.chartCourier] ? o.chartCourier : '';
    var cell = function (cells, tot) { return ch.cols.filter(function (c) { return cells[c]; }).map(function (c) { return c + ' ' + cells[c]; }).join(' · ') + ' = *' + tot + '*'; };
    return '*' + title + '*' + (cur ? ' · ' + cur : '') + ' · ' + ((man && man.date) || date) + '\n\n' +
      ch.rows.map(function (r) { return r.sku + ': ' + cell(r.cells, r.total); }).join('\n') + '\n\n*' + total + '*: ' + cell(ch.totals, ch.grand);
  }

  // Everything the screen shows, for the options o: {by, courier, mixedLast, mode, pick, man, blouse, chartSort, chartCourier}
  function view(o, today) {
    var labs = ordered(o), bad = badPages(), man = manInfo(), co = L.courierOrder(labs), tiles, check = null, pc = null;
    if (labs.length || !man) {
      var pcs = 0, skus = {};
      labs.forEach(function (p) { p.lab.rows.forEach(function (r) { pcs += r.qty; skus[L.skuKey(r.sku)] = 1; }); });
      tiles = [['Labels', labs.length], ['Pieces', pcs], ['SKUs', Object.keys(skus).length], ['Couriers', co.names.length]];
    } else {
      var src0 = man.structured ? man.rows : man.pick, mp = 0, ms = {};
      src0.forEach(function (r) { mp += r.qty; ms[L.skuKey(r.sku)] = 1; });
      tiles = [['Parcels', man.structured ? man.rows.length : '–'], ['Pieces', mp], ['SKUs', Object.keys(ms).length], ['Couriers', man.couriers.length]];
    }
    if (labs.length && man) {
      var c = L.checkManifest(labs, man);
      check = {
        on: c.on.length, off: c.off.map(function (p) { var r = p.lab.rows[0]; return { sku: r.sku, size: L.showSize(L.canonSize(r.size)), courier: p.lab.courier || '', order: (p.lab.orders[0] || p.lab.ids[0] || '') }; }),
        extra: c.extra.map(function (r) { return { sku: r.sku || '', size: r.size || '', id: (r.ids && r.ids[0]) || '' }; }), rows: c.rows, total: c.total
      };
    }
    var src = chartSource(), chart = null;
    if (src) {
      var cs = couriersOf(src.items), cur = o.chartCourier !== 'all' && cs.count[o.chartCourier] ? o.chartCourier : 'all';
      var ch = chartFor(o, src, cur);
      if (src.from === 'man') pc = L.pickCheck(man);
      chart = {
        from: src.from, parcels: ch.parcels, chart: ch, couriers: cs.names.map(function (n) { return { name: n, parcels: cs.count[n] }; }), courier: cur, all: cs.all,
        blouse: blouseOn(o, src.items), looksBlouse: L.looksBlouse(src.items), mapped: mappedText(ch), pick: pc, rows: chartRows(ch),
        text: chartText(o, src, 'Packing chart', 'Total', today)
      };
    }
    return {
      files: S.files.map(fileInfo), tiles: tiles, labels: labs.length, manifest: !!man, supplier: man ? man.supplier : '', manDate: man ? man.date : '', check: check, chart: chart,
      bad: bad.map(function (p) { var f = null; S.files.forEach(function (x) { if (x.id === p.fid) f = x; }); return { file: f ? f.name : '', page: p.pi + 1, why: p.lab.why === 'image' ? 'image' : 'table' }; }),
      order: labs.map(function (p) { return { fid: p.fid, pi: p.pi, courier: p.lab.courier || 'Other', mixed: L.isMixed(p.lab), rows: p.lab.rows.map(function (r) { return { sku: r.sku, size: L.showSize(L.canonSize(r.size)) || r.size, qty: r.qty }; }) }; }),
      couriers: co.names.map(function (n) { return { name: n, labels: co.count[n] }; })
    };
  }

  // What the sorted PDF holds, in print order (labels.html build)
  function plan(o, today) {
    var labs = ordered(o), bad = badPages(), man = manPages();
    var pageOf = function (p) { return { fid: p.fid, pi: p.pi, kind: p.kind, view: p.view, rot: p.rot, cutY: p.lab.cutY == null ? null : p.lab.cutY, lastY: p.lab.lastY == null ? null : p.lab.lastY }; };
    var out = { labels: labs.map(pageOf), bad: bad.map(pageOf), man: o.man === 'none' ? [] : man.map(pageOf), chart: null };
    if (o.pick && labs.length) {
      var items = [], chk = man.length ? L.checkManifest(labs, manInfo()) : null;
      labs.forEach(function (p) { p.lab.rows.forEach(function (r) { items.push({ sku: r.sku, size: r.size, qty: r.qty, courier: p.lab.courier || 'Other', pid: p.fid + ':' + p.pi }); }); });
      out.chart = chartDoc(o, { from: 'labels', items: items, man: manInfo(), parcels: labs.length }, true, chk);
    }
    return out;
  }
  // The packing chart on its own (labels.html chartPdf): all parcels, then one table per courier
  function chartOnly(o) {
    var src = chartSource();
    return src ? chartDoc(o, src, false, null) : null;
  }
  function csv(o) {
    var src = chartSource(); if (!src) return null;
    var ch = chartFor(o, src, o.chartCourier), q = function (v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var cur = o.chartCourier !== 'all' && couriersOf(src.items).count[o.chartCourier] ? '-' + o.chartCourier.toLowerCase().replace(/[^a-z0-9]+/g, '-') : '';
    return { text: String.fromCharCode(0xFEFF) + chartRows(ch).map(function (r) { return r.map(q).join(','); }).join('\r\n') + '\r\n', suffix: cur };
  }

  return { addFile: addFile, removeFile: removeFile, clear: clear, view: view, plan: plan, chartOnly: chartOnly, csv: csv };
})();
