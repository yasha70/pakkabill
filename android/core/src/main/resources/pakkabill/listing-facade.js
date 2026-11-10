/* PakkaBill native app: Meesho listing. PBListing is the website's own engine (listing.js "Core engine":
   reading the category template, photo names, links, rows and the Excel writer), taken when the app is
   built. This is the website page's glue (listing.js applyTemplate, remapColours, autoSort, placePhoto,
   groupInThrees, onMatchLinks, onMatchByOrder, fillTypical), line for line, with the page's state S
   (settings) and W (work: photos, colours, catalogues) passed in and given back. ES5 only. */
var PBListingApp = (function () {
  'use strict';
  var L = PBListing, VIEWS = L.VIEWS;
  var st = { tpl: null };
  var copy = function (o) { return JSON.parse(JSON.stringify(o)); };
  var uid = L.uid;

  // the template as the screen needs it (no XML)
  function schemaView(s) {
    var col = function (c) { return { col: c.col, name: c.name, desc: c.desc, required: c.required, role: c.role, kind: c.kind, options: c.options, store: c.store }; };
    return { firstRow: s.firstRow, maxRows: s.maxRows, fillName: s.fillName, columns: s.columns.map(col),
      name: col(s.byRole.name), size: col(s.byRole.size), price: col(s.byRole.price), mrp: col(s.byRole.mrp), color: col(s.byRole.color),
      returns: s.byRole.returns ? col(s.byRole.returns) : null, sku: s.byRole.sku ? col(s.byRole.sku) : null, style: s.byRole.style ? col(s.byRole.style) : null,
      group: s.byRole.group ? col(s.byRole.group) : null, images: s.byRole.image.map(col), measures: s.byRole.measure.map(col), generic: s.byRole.generic.map(col) };
  }

  // src: { files: { path: text }, bin: [paths] } of the .xlsx
  function template(src) {
    return L.loadTemplate(src).then(function (tpl) {
      tpl.bytes = src; st.tpl = tpl;
      return { info: tpl.info, schema: schemaView(tpl.schema), prefill: tpl.prefill };
    });
  }

  // listing.js applyTemplate: what Meesho already filled in goes into empty settings
  function apply(S, W) {
    S = copy(S); W = copy(W);
    var tpl = st.tpl, P = tpl.prefill, R = tpl.schema.byRole, copied = { details: 0, sizes: 0 };
    Object.keys(P.details).forEach(function (k) { if (!String(S.details[k] || '').trim()) { S.details[k] = P.details[k]; copied.details++; } });
    if (!S.sizes.length && P.sizes.length) { S.sizes = P.sizes.slice(); copied.sizes = P.sizes.length; }
    Object.keys(P.chart).forEach(function (s) { var cur = S.chart[s] = S.chart[s] || {}; Object.keys(P.chart[s]).forEach(function (m) { if (!cur[m]) cur[m] = P.chart[s][m]; }); });
    if (!S.price && P.price) S.price = P.price;
    if (!S.mrp && P.mrp) S.mrp = P.mrp;
    if (!S.productName && P.productName) S.productName = P.productName;
    R.generic.forEach(function (c) {
      if (String(S.details[c.name] || '').trim()) return;
      if (/country of origin/i.test(c.name) && (!c.options || c.options.indexOf('India') >= 0)) S.details[c.name] = 'India';
      else if (c.kind === 'list' && c.options && c.options.length === 1) S.details[c.name] = c.options[0];
    });
    var sOpts = R.size.options;
    if (sOpts) S.sizes = S.sizes.filter(function (s) { return sOpts.indexOf(s) >= 0; }).sort(function (a, b) { return sOpts.indexOf(a) - sOpts.indexOf(b); });
    remapColours(S, W);
    return { S: S, W: W, copied: copied };
  }

  // the website page's own state, for its parts the app calls as they are (listing.js remapColours,
  // defaultMeeshoColour, the ready-made sets, suggestName, swatchOf)
  function page(S, W) { var p = L.state; p.tpl = st.tpl; if (S) p.S = S; if (W) p.W = W; L.__page.toasts = []; return p; }
  function said() { var t = L.__page.toasts; return t.length ? t[t.length - 1] : null; }
  function defaultMeeshoColour(S) { page(S, null); return L.defaultMeeshoColour(); }
  function remapColours(S, W) { if (!st.tpl) return; page(S, W); L.remapColours(); }
  function newColour(S, W, label, meesho, key) {
    return { id: 'k' + uid(), key: key || L.normKey(label), label: label || '', meesho: meesho || defaultMeeshoColour(S), front: '', back: '', side: '', cat: W.catalogues[0].id };
  }
  function autoSort(S, W, keys) {
    var dict = L.colourDict(st.tpl.schema.byRole.color.options);
    keys.forEach(function (k) {
      var cls = L.classifyName(W.images[k].name, dict);
      if (cls.type === 'colour') {
        var col = null;
        W.colours.forEach(function (c) { if (!col && c.key === cls.colour.key) col = c; });
        if (!col) { col = newColour(S, W, cls.colour.label, cls.colour.meesho, cls.colour.key); W.colours.push(col); }
        var view = cls.view && !col[cls.view] ? cls.view : null;
        if (!view) for (var i = 0; i < VIEWS.length; i++) if (!col[VIEWS[i]]) { view = VIEWS[i]; break; }
        if (view) col[view] = k;
      } else if (cls.type === 'set') {
        for (var j = 0; j < W.catalogues.length; j++) if (!W.catalogues[j].cover) { W.catalogues[j].cover = k; break; }
      }
    });
  }
  function locate(W, key) {
    for (var i = 0; i < W.colours.length; i++) for (var j = 0; j < VIEWS.length; j++) if (W.colours[i][VIEWS[j]] === key) return { type: 'slot', colourId: W.colours[i].id, view: VIEWS[j] };
    for (var c = 0; c < W.catalogues.length; c++) if (W.catalogues[c].cover === key) return { type: 'cover', catId: W.catalogues[c].id };
    return { type: 'tray' };
  }
  function getAt(W, t) {
    if (t.type === 'slot') { var c = W.colours.filter(function (x) { return x.id === t.colourId; })[0]; return c ? c[t.view] : ''; }
    if (t.type === 'cover') { var k = W.catalogues.filter(function (x) { return x.id === t.catId; })[0]; return k ? k.cover : ''; }
    return '';
  }
  function setAt(W, t, key) {
    if (t.type === 'slot') { var c = W.colours.filter(function (x) { return x.id === t.colourId; })[0]; if (c) c[t.view] = key || ''; }
    else if (t.type === 'cover') { var k = W.catalogues.filter(function (x) { return x.id === t.catId; })[0]; if (k) k.cover = key || ''; }
  }
  // listing.js placePhoto: whatever was there swaps back to where the photo came from
  function place(W, key, target) {
    W = copy(W);
    var from = locate(W, key);
    if (target.type === 'tray') { setAt(W, from, ''); return W; }
    var occupant = getAt(W, target);
    if (occupant === key) return W;
    setAt(W, target, key);
    if (from.type !== 'tray') setAt(W, from, occupant || '');
    return W;
  }

  // photos: [{ name, size, format, cmyk, w, h }] (the app reads each photo's header)
  function addPhotos(S, W, photos) {
    W = copy(W);
    var list = photos.slice().sort(function (a, b) { return L.natural(a.name, b.name); }), added = [];
    list.forEach(function (f) {
      var dup = false; Object.keys(W.images).forEach(function (k) { if (W.images[k].name === f.name && W.images[k].size === f.size) dup = true; });
      if (dup) return;
      var key = L.normKey(f.name) || 'photo';
      if (W.images[key]) { var i = 2; while (W.images[key + '_' + i]) i++; key = key + '_' + i; }
      W.images[key] = { key: key, name: f.name, size: f.size, link: '', how: '', format: f.format || '', cmyk: !!f.cmyk, w: f.w || 0, h: f.h || 0 };
      added.push(key);
    });
    autoSort(S, W, added);
    var left = added.filter(function (k) { return locate(W, k).type === 'tray'; }).length;
    return { W: W, added: added, left: left };
  }
  function removePhotos(W, keys) {
    W = copy(W);
    keys.forEach(function (k) { var at = locate(W, k); setAt(W, at, ''); delete W.images[k]; });
    return W;
  }
  function groupInThrees(S, W, keys) {
    W = copy(W);
    var list = keys.slice().sort(function (a, b) { return L.natural(W.images[a].name, W.images[b].name); });
    for (var i = 0; i < list.length; i += 3) {
      var col = newColour(S, W, '', '', 'g' + uid());
      list.slice(i, i + 3).forEach(function (k, j) { col[VIEWS[j]] = k; });
      W.colours.push(col);
    }
    return W;
  }
  // listing.js "Add a colour by hand"
  function newColourIn(S, W, label) { W = copy(W); W.colours.push(newColour(S, W, label || '', '', label ? '' : 'm' + uid())); return W; }
  function catOf(W, col) { return W.catalogues.some(function (c) { return c.id === col.cat; }) ? col.cat : W.catalogues[0].id; }
  function usedPhotoKeys(S, W) {
    var set = {};
    W.colours.forEach(function (c) { VIEWS.forEach(function (v) { if (c[v] && W.images[c[v]]) set[c[v]] = 1; }); });
    if (S.placement !== 'none') W.catalogues.forEach(function (cat) { if (cat.cover && W.images[cat.cover] && W.colours.some(function (c) { return catOf(W, c) === cat.id; })) set[cat.cover] = 1; });
    return Object.keys(set).sort(function (a, b) { return L.natural(W.images[a].name, W.images[b].name); });
  }
  // listing.js onMatchLinks
  function matchLinks(S, W, text) {
    W = copy(W);
    var entries = L.parseLinkText(text);
    if (!entries.length) return { W: W, note: null, none: true };
    var used = usedPhotoKeys(S, W);
    var r = L.matchLinks(entries, used.map(function (k) { return { key: k, name: W.images[k].name }; }));
    r.pairs.forEach(function (p) { W.images[p.key].link = p.url; W.images[p.key].how = p.how; });
    var assigned = {}; Object.keys(W.images).forEach(function (k) { if (W.images[k].link) assigned[W.images[k].link] = 1; });
    W.pendingLinks = r.unmatched.filter(function (u) { return !assigned[u]; });
    return { W: W, note: { total: entries.length, matched: r.pairs.length, missing: used.filter(function (k) { return !W.images[k].link; }).length } };
  }
  // listing.js onMatchByOrder
  function matchByOrder(S, W) {
    W = copy(W);
    var missing = usedPhotoKeys(S, W).filter(function (k) { return !W.images[k].link; });
    var n = Math.min(missing.length, W.pendingLinks.length);
    for (var i = 0; i < n; i++) { var im = W.images[missing[i]]; im.link = W.pendingLinks[i]; im.how = 'order'; }
    W.pendingLinks = W.pendingLinks.slice(n);
    return { W: W, n: n };
  }
  function clearLinks(W) { W = copy(W); Object.keys(W.images).forEach(function (k) { W.images[k].link = ''; W.images[k].how = ''; }); W.pendingLinks = []; return W; }
  // a links spreadsheet as text lines (listing.js xlsxToText)
  function linksText(src) { return L.xlsxToText(src); }
  // listing.js fillTypical: a typical readymade-blouse chart, only a start the seller checks
  function typical(S) {
    S = copy(S);
    var n = 0, sOpts = st.tpl.schema.byRole.size.options;
    var sizes = S.sizes.slice(); if (sOpts) sizes.sort(function (a, b) { return sOpts.indexOf(a) - sOpts.indexOf(b); });
    sizes.forEach(function (s) {
      st.tpl.schema.byRole.measure.forEach(function (m) {
        var ch = S.chart[s] = S.chart[s] || {};
        if (ch[m.name]) return;
        var v = L.typicalMeasure(m.name, s, m.options || []);
        if (v) { ch[m.name] = v; n++; }
      });
    });
    if (n) { S.chartTypical = true; S.chartChecked = false; }
    return { S: S, n: n };
  }

  // the rows Meesho gets, split into files it accepts, with every problem found (buildPlan)
  function plan(S, W) {
    var p = L.buildPlan(st.tpl, S, W);
    return { issues: p.issues, counts: p.counts, returnsLess: p.returnsLess,
      parts: p.parts.map(function (x) { return { groups: x.groups, cats: x.cats, rows: x.rows.map(function (r) { return r.meta; }) }; }) };
  }
  // one Excel file: the template with the rows written in (writeWorkbook); the app puts the zip together
  function write(S, W, i) {
    var p = L.buildPlan(st.tpl, S, W), part = p.parts[i];
    if (!part) return Promise.reject(new Error('Nothing to write.'));
    return L.writeWorkbook(st.tpl, part.rows, { returnsLess: p.returnsLess }).then(function (r) {
      var o = PBZip.out(r.blob); o.formulasOk = r.formulasOk; return o;
    });
  }

  // listing.js ready-made sets: the seller's own sets (the app keeps them) and the website's
  function withSets(user) { L.__page.store[L.PRESET_KEY] = JSON.stringify(user || []); }
  function userSets() { return JSON.parse(L.__page.store[L.PRESET_KEY] || '[]'); }
  function sets(user) {
    withSets(user);
    return L.allPresets().map(function (P) { return { id: P.id, name: P.name, builtIn: !!P.builtIn, facts: L.presetFacts(P) }; });
  }
  function useSet(S, W, user, id) {
    withSets(user);
    var p = page(copy(S), copy(W)), P = L.allPresets().filter(function (x) { return x.id === id; })[0];
    p.presetResult = null;
    if (!P) return { S: p.S, W: p.W, result: null, toast: { msg: 'This set is no longer saved.', level: 'error' } };
    L.usePreset(P);
    return { S: p.S, W: p.W, result: p.presetResult || null, toast: said() };
  }
  function saveSet(S, W, user, name) {
    withSets(user);
    var p = page(copy(S), copy(W));
    L.saveCurrentAsPreset(name);
    return { S: p.S, sets: userSets(), toast: said() };
  }
  function deleteSet(user, id) { withSets(user); L.deletePreset(id); return userSets(); }
  // listing.js onTemplateFile, once the template is in: a set picked before it fills in now, and
  // applyShopDefaults with the shop's name and address the app gives (readShop)
  function afterTemplate(S, W, user, shop) {
    withSets(user);
    var p = page(copy(S), copy(W)), pend = null, shopNote = false;
    var id = p.S.pendingPreset;
    pend = id ? L.allPresets().filter(function (x) { return x.id === id; })[0] || null : null;
    delete p.S.pendingPreset;
    p.presetResult = null;
    if (pend) { var r = L.applyPreset(pend); p.presetResult = Object.assign({ name: pend.name }, r); }
    var maker = st.tpl.schema.byRole.generic.filter(function (c) { return /^manufacturer/i.test(c.name); })[0];
    if (maker && !String(p.S.details[maker.name] || '').trim() && shop) { p.S.details[maker.name] = shop; shopNote = true; }
    return { S: p.S, W: p.W, result: p.presetResult, pend: pend ? pend.name : null, shopNote: shopNote };
  }
  // listing.js suggestName: a Meesho-style name from the details filled in
  function suggestName(S) { page(S, null); return L.suggestName(); }
  // listing.js swatchOf, for each colour: a CSS colour, the multicolour gradient, or nothing
  function swatches(W) { var o = {}; W.colours.forEach(function (c) { o[c.id] = L.swatchOf(c) || ''; }); return o; }
  // listing.js colourCard: typing a colour's name picks Meesho's colour when it has none yet
  function label(W, id, text) {
    W = copy(W);
    var opts = st.tpl.schema.byRole.color.options;
    W.colours.forEach(function (col) {
      if (col.id !== id) return;
      col.label = text;
      if (!col.meesho && opts) { var g = L.colourDict(opts)[L.normKey(col.label)]; if (g) col.meesho = g; }
    });
    return W;
  }
  // listing.js detailField: an importer field when the country of origin is India
  function importer(name) {
    var c = st.tpl.schema.byRole.generic.filter(function (x) { return x.name === name; })[0];
    return c ? L.importerValue(c) : 'Not Required';
  }

  return { template: template, apply: apply, addPhotos: addPhotos, removePhotos: removePhotos, groupInThrees: groupInThrees, newColour: newColourIn,
    place: place, matchLinks: matchLinks, matchByOrder: matchByOrder, clearLinks: clearLinks, linksText: linksText, typical: typical, plan: plan, write: write,
    used: usedPhotoKeys, colourDict: function () { return L.colourDict(st.tpl.schema.byRole.color.options); },
    sets: sets, useSet: useSet, saveSet: saveSet, deleteSet: deleteSet, afterTemplate: afterTemplate, suggestName: suggestName, swatches: swatches,
    label: label, importer: importer };
})();
