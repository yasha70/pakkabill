// PakkaBill auto listing: the logic shared by the Lens extension (list.js, on Meesho's supplier panel)
// and PakkaBill's Auto listing page. No DOM here, so it is tested in Node (test/autolist-audit.js).
// A template is a product type saved once: Meesho category, every detail field (label and value), sizes
// with prices and stock, and patterns for the product name and description. A product is one thing to
// list: its photos, name, SKU, colour and any field that differs. plan() turns the two into the list of
// labels and values to put in Meesho's form; Meesho's own labels decide where each value goes.
var PBListCore = (function () {
  'use strict';

  // "Net Weight (gms) *" -> "net weight gms"
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/\(optional\)/g, ' ').replace(/[*:]/g, ' ').replace(/colour/g, 'color')
      .replace(/[^a-z0-9%₹]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  // the same field under other names Meesho or sellers use
  var SAME = [
    ['product name', 'name', 'title', 'product title'],
    ['meesho price', 'price', 'selling price', 'your price', 'supplier price'],
    ['wrong defective returns price', 'return price', 'returns price', 'defective returns price'],
    ['mrp', 'maximum retail price', 'max retail price'],
    ['inventory', 'stock', 'quantity in stock', 'available quantity'],
    ['supplier sku id', 'sku', 'sku id', 'supplier sku', 'style code'],
    ['net weight gms', 'net weight', 'weight', 'weight gms', 'product weight'],
    ['hsn code', 'hsn', 'hsn sac'],
    ['gst', 'gst %', 'gst rate', 'tax rate'],
    ['product description', 'description'],
    ['manufacturer details', 'manufacturer', 'manufacturer name and address'],
    ['packer details', 'packer', 'packer name and address'],
    ['importer details', 'importer'],
    ['color', 'colors', 'product color'],
    ['size', 'sizes', 'available sizes'],
    ['net quantity n', 'net quantity', 'pack of', 'number of pieces'],
    ['country of origin', 'origin'],
    ['brand name', 'brand'],
  ];
  var ALIAS = {};
  SAME.forEach(function (g) { g.forEach(function (x) { ALIAS[norm(x)] = g[0]; }); });
  function canon(label) { var n = norm(label); return ALIAS[n] || n; }

  // How well two labels mean the same field: 1 the same, 0.9 a known other name, then shared words.
  function labelScore(a, b) {
    var x = norm(a), y = norm(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    if (canon(a) === canon(b)) return 0.9;
    var A = x.split(' '), B = y.split(' '), both = A.filter(function (w) { return B.indexOf(w) >= 0; }).length;
    var j = both / (A.length + B.length - both);
    return j >= 0.66 ? 0.5 + j * 0.3 : 0; // most words shared: Fabric is not Blouse Fabric
  }

  // The option that is the value: exact, then the same without spaces, then a number match
  // ("5" and "5%"), then one starting with the other ("620630" and "620630 - Blouses of cotton"),
  // then one containing it. -1 when nothing fits.
  function matchOption(options, value) {
    var v = norm(value), vs = v.replace(/ /g, '');
    if (!v) return -1;
    var ns = options.map(norm), i;
    if ((i = ns.indexOf(v)) >= 0) return i;
    for (i = 0; i < ns.length; i++) if (ns[i].replace(/ /g, '') === vs) return i;
    var num = /^\d+(\.\d+)?$/.test(vs) ? parseFloat(vs) : null;
    if (num != null) for (i = 0; i < ns.length; i++) { var m = /^(\d+(\.\d+)?)\s*%?$/.exec(ns[i]); if (m && parseFloat(m[1]) === num) return i; }
    for (i = 0; i < ns.length; i++) if (ns[i].indexOf(v + ' ') === 0 || ns[i] === v) return i;
    var best = -1, bl = 1e9;
    for (i = 0; i < ns.length; i++) if (ns[i] && (ns[i].indexOf(v) >= 0 || (v.indexOf(ns[i]) >= 0 && ns[i].length >= 3)) && ns[i].length < bl) { best = i; bl = ns[i].length; }
    return best;
  }

  // "S, M, L" -> ["S", "M", "L"]; one value stays one.
  function splitMulti(value) {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    return String(value == null ? '' : value).split(/\s*[,;|]\s*/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  // Size order Meesho shows: free size, then XS to 6XL, then numbers.
  var ORDER = ['free size', 'xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', '2xl', '3xl', 'xxxl', '4xl', '5xl', '6xl'];
  function sizeRank(z) { var n = norm(z), i = ORDER.indexOf(n); if (i >= 0) return i; var d = parseFloat(n); return isNaN(d) ? 100 : 200 + d; }
  function sortSizes(list) { return list.slice().sort(function (a, b) { return sizeRank(a.size || a) - sizeRank(b.size || b); }); }

  // The size-row columns and the names they go by.
  var ROW = { price: 'meesho price', rprice: 'wrong defective returns price', mrp: 'mrp', stock: 'inventory', sku: 'supplier sku id' };
  function rowKeyOf(label) { var c = canon(label); for (var k in ROW) if (ROW[k] === c) return k; return null; }

  function fieldValue(fields, label) {
    var best = null, bs = 0;
    (fields || []).forEach(function (f) { var s = labelScore(f.label, label); if (s > bs) { bs = s; best = f; } });
    return best && bs >= 0.9 ? best.value : '';
  }
  // "{color} {fabric} Blouse" with the product's colour and the template's Fabric field.
  function render(pattern, tpl, prod) {
    prod = prod || {};
    var vals = { name: prod.name, sku: prod.sku, color: prod.color, sizes: sizesOf(tpl, prod).map(function (s) { return s.size; }).join(', ') };
    var out = String(pattern || '').replace(/\{([^{}]{1,40})\}/g, function (m, k) {
      var n = norm(k), v = vals[n];
      if (v == null || v === '') v = (prod.fields && fieldValue(prod.fields, k)) || fieldValue(tpl && tpl.fields, k);
      return v == null ? '' : String(v);
    });
    return out.replace(/[ \t]+/g, ' ').replace(/ ([,.])/g, '$1').trim();
  }

  // Sizes for a product: the template's, with the product's price, MRP and stock where given.
  function sizesOf(tpl, prod) {
    var base = (tpl && tpl.sizes) || [];
    var only = prod && prod.sizes && prod.sizes.length ? prod.sizes.map(norm) : null;
    return sortSizes(base.filter(function (s) { return s && s.size && (!only || only.indexOf(norm(s.size)) >= 0); }).map(function (s) {
      var o = { size: s.size, price: s.price, rprice: s.rprice, mrp: s.mrp, stock: s.stock };
      ['price', 'rprice', 'mrp', 'stock'].forEach(function (k) { if (prod && prod[k] !== '' && prod[k] != null) o[k] = prod[k]; });
      if (o.rprice === '' || o.rprice == null) o.rprice = o.price;
      return o;
    }));
  }

  // What goes into Meesho's form for this product: [{ label, value, multi, row, col }]. Size rows carry
  // row (the size) and col (price, rprice, mrp, stock, sku).
  function plan(tpl, prod) {
    tpl = tpl || {}; prod = prod || {};
    var out = [], seen = {};
    var push = function (label, value, extra) {
      if (value == null || value === '') return;
      var k = canon(label) + '|' + (extra && extra.row ? norm(extra.row) : '');
      if (seen[k]) return; seen[k] = 1;
      out.push(Object.assign({ label: label, value: String(value) }, extra || {}));
    };
    var name = render(tpl.title || '{name}', tpl, prod) || prod.name;
    push('Product Name', name);
    var sizes = sizesOf(tpl, prod);
    if (sizes.length) push('Size', sizes.map(function (s) { return s.size; }).join(', '), { multi: true });
    if (prod.color) push('Color', prod.color);
    // the product's own fields first, then the template's
    (prod.fields || []).concat(tpl.fields || []).forEach(function (f) {
      if (!f || !f.label || rowKeyOf(f.label) || canon(f.label) === 'product name' || canon(f.label) === 'size') return;
      if (canon(f.label) === 'color' && prod.color) return;
      push(f.label, canon(f.label) === 'product description' ? render(f.value, tpl, prod) : f.value, f.multi ? { multi: true } : null);
    });
    if (tpl.desc) push('Product Description', render(tpl.desc, tpl, prod));
    sizes.forEach(function (s) {
      push('Meesho Price', s.price, { row: s.size, col: 'price' });
      push('Wrong/Defective Returns Price', s.rprice, { row: s.size, col: 'rprice' });
      push('MRP', s.mrp, { row: s.size, col: 'mrp' });
      push('Inventory', s.stock, { row: s.size, col: 'stock' });
      if (prod.sku) push('Supplier SKU ID', sizes.length > 1 ? prod.sku + '-' + String(s.size).replace(/\s+/g, '') : prod.sku, { row: s.size, col: 'sku' });
    });
    return out;
  }

  // The form field for one planned value. fields: [{ label, row, kind, i }] as read from the page.
  function bestField(item, fields, used) {
    var best = null, bs = 0;
    fields.forEach(function (f) {
      if (used && used[f.i]) return;
      if (!!item.row !== !!f.row) return;
      if (item.row && norm(item.row) !== norm(f.row)) return;
      var s = labelScore(f.label, item.label);
      if (item.col && rowKeyOf(f.label) === item.col) s = Math.max(s, 0.95);
      if (s > bs) { bs = s; best = f; }
    });
    return bs >= 0.62 ? best : null;
  }

  // A template from a form the seller filled in Meesho (read by list.js): every field with a value
  // except the product's own (name, SKU, photos), and the size rows as sizes.
  function learn(fields, category, name) {
    var tpl = { id: 't' + Date.now().toString(36), name: name || category || 'Template from Meesho', category: category || '', fields: [], sizes: [], title: '{name}', desc: '', source: 'meesho', updatedAt: Date.now() };
    var rows = {};
    (fields || []).forEach(function (f) {
      if (f.kind === 'file' || f.value == null || f.value === '') return;
      if (f.row) {
        var k = rowKeyOf(f.label);
        if (!k || k === 'sku') return;
        var r = rows[f.row] || (rows[f.row] = { size: f.row });
        r[k] = String(f.value);
        return;
      }
      var c = canon(f.label);
      if (c === 'product name' || c === 'supplier sku id' || c === 'size') return;
      if (tpl.fields.some(function (x) { return canon(x.label) === c; })) return;
      var v = Array.isArray(f.value) ? f.value.join(', ') : String(f.value);
      tpl.fields.push(f.multi || Array.isArray(f.value) ? { label: f.label, value: v, multi: true } : { label: f.label, value: v });
    });
    tpl.sizes = sortSizes(Object.keys(rows).map(function (z) { return rows[z]; }));
    return tpl;
  }

  // What is missing before a product can be listed.
  function problems(tpl, prod) {
    var p = [];
    if (!tpl) return ['Pick a template.'];
    if (!prod.photos || !prod.photos.length) p.push('Add at least one photo.');
    if (!render(tpl.title || '{name}', tpl, prod)) p.push('Add a product name.');
    var sizes = sizesOf(tpl, prod);
    if (!sizes.length) p.push('The template has no sizes. Add sizes with price and stock.');
    sizes.forEach(function (s) {
      if (!(+s.price > 0)) p.push('Price is missing for size ' + s.size + '.');
      if (+s.mrp > 0 && +s.price > +s.mrp) p.push('Price is above MRP for size ' + s.size + '.');
      if (!(+s.stock >= 0) || s.stock === '' || s.stock == null) p.push('Stock is missing for size ' + s.size + '.');
    });
    return p;
  }

  var api = { norm: norm, canon: canon, labelScore: labelScore, matchOption: matchOption, splitMulti: splitMulti, sortSizes: sortSizes, rowKeyOf: rowKeyOf, render: render, sizesOf: sizesOf, plan: plan, bestField: bestField, learn: learn, problems: problems, fieldValue: fieldValue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
