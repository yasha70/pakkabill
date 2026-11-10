/* PakkaBill native app: what the website's tool engines expect from a browser, for Rhino.
   Loaded before any engine in pakkabill/tools/ (built from the website by android/engines/build.mjs).
   ES5 only. */
var window = this, self = this, globalThis = this;
var console = { log: function () {}, warn: function () {}, error: function () {}, info: function () {} };

(function (G) {
  'use strict';

  // 1234567.5 -> "12,34,567.50" (Indian grouping), with the fraction digits asked for
  function indian(n, minF, maxF) {
    n = Number(n);
    if (!isFinite(n)) return String(n);
    if (maxF == null) maxF = Math.max(minF || 0, 3);
    if (minF == null) minF = 0;
    var neg = n < 0, a = Math.abs(n);
    var s = a.toFixed(maxF);
    if (maxF > minF) s = s.replace(new RegExp('0{1,' + (maxF - minF) + '}$'), '').replace(/\.$/, '');
    var parts = s.split('.'), i = parts[0];
    if (i.length > 3) {
      var last = i.slice(-3), rest = i.slice(0, -3);
      rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
      i = rest + ',' + last;
    }
    return (neg && Number(s) !== 0 ? '-' : '') + i + (parts.length > 1 ? '.' + parts[1] : '');
  }
  function western(n, minF, maxF) {
    n = Number(n);
    if (!isFinite(n)) return String(n);
    if (maxF == null) maxF = Math.max(minF || 0, 3);
    var s = Math.abs(n).toFixed(maxF);
    if (maxF > (minF || 0)) s = s.replace(new RegExp('0{1,' + (maxF - (minF || 0)) + '}$'), '').replace(/\.$/, '');
    var p = s.split('.');
    return (n < 0 && Number(s) !== 0 ? '-' : '') + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (p.length > 1 ? '.' + p[1] : '');
  }

  // "SKU2" before "SKU10", capitals and small letters the same (Intl.Collator numeric, base)
  function natural(a, b, numeric) {
    a = String(a).toLowerCase(); b = String(b).toLowerCase();
    if (!numeric) return a < b ? -1 : a > b ? 1 : 0;
    var re = /\d+|\D+/g, x = a.match(re) || [], y = b.match(re) || [];
    for (var i = 0; i < x.length && i < y.length; i++) {
      var p = x[i], q = y[i], pn = /^\d/.test(p), qn = /^\d/.test(q);
      if (pn && qn) {
        var d = parseFloat(p) - parseFloat(q);
        if (d) return d < 0 ? -1 : 1;
      } else if (p !== q) {
        if (pn !== qn) return pn ? -1 : 1;
        return p < q ? -1 : 1;
      }
    }
    return x.length - y.length < 0 ? -1 : x.length > y.length ? 1 : 0;
  }

  if (typeof G.Intl === 'undefined') {
    G.Intl = {
      NumberFormat: function (loc, o) {
        o = o || {};
        var ind = /IN/.test(String(loc || 'en-IN'));
        this.format = function (n) { return (ind ? indian : western)(n, o.minimumFractionDigits, o.maximumFractionDigits); };
      },
      Collator: function (loc, o) {
        var num = !!(o && o.numeric);
        this.compare = function (a, b) { return natural(a, b, num); };
      }
    };
  }
  var nativeLocale = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (loc, o) {
    o = o || {};
    if (loc && /IN/.test(String(loc))) return indian(this, o.minimumFractionDigits, o.maximumFractionDigits);
    return loc ? western(this, o.minimumFractionDigits, o.maximumFractionDigits) : nativeLocale.call(this);
  };

  // UTF-8 bytes, as the browser's TextEncoder gives them
  if (typeof G.TextEncoder === 'undefined') {
    G.TextEncoder = function () {};
    G.TextEncoder.prototype.encode = function (s) {
      s = String(s == null ? '' : s);
      var out = [];
      for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
          var d = s.charCodeAt(i + 1);
          if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
        }
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
        else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
      return new Uint8Array(out);
    };
  }

  // The app's way in: call "PBL.packChart" with JSON text, get JSON text back.
  function resolve(path) {
    var parts = String(path).split('.'), o = G, self0 = null;
    for (var i = 0; i < parts.length; i++) { self0 = o; o = o == null ? undefined : o[parts[i]]; }
    if (typeof o !== 'function') throw new Error(path + ' is not a function');
    return { fn: o, self: self0 };
  }
  G.__pbCall = function (path, argsJson) {
    var f = resolve(path), args = JSON.parse(argsJson || '[]');
    var r = f.fn.apply(f.self, args);
    return r === undefined ? 'null' : JSON.stringify(r);
  };
  // the same for functions that give a Promise (the Meesho listing engine reads and writes files that way):
  // the result is kept, and the app takes it once the promise has settled
  G.__pbAsync = function (path, argsJson) {
    var f = resolve(path), args = JSON.parse(argsJson || '[]');
    G.__pbOut = null;
    Promise.resolve().then(function () { return f.fn.apply(f.self, args); })
      .then(function (v) { G.__pbOut = { ok: true, v: v === undefined ? null : v }; }, function (e) { G.__pbOut = { ok: false, e: String((e && e.message) || e) }; });
  };
  G.__pbTake = function () { var o = G.__pbOut; G.__pbOut = null; return o == null ? 'null' : JSON.stringify(o); };
  // the same for functions that give file bytes (an Excel workbook, a zip)
  G.__pbBytes = function (path, argsJson) {
    var f = resolve(path), args = JSON.parse(argsJson || '[]');
    return f.fn.apply(f.self, args);
  };
})(this);
