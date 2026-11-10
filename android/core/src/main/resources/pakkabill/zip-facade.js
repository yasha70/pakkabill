/* PakkaBill native app: what the website's Meesho listing engine expects from a browser.
   PBZip stands in for JSZip (the app reads and writes the .xlsx zip itself; the engine only reads and
   changes the XML parts), and xmldom's node lists get what browser node lists have (for...of,
   children). Loaded after xmldom.js and before listing.js. ES5 only. */
var PBZip = (function () {
  'use strict';
  // src: { files: { path: text }, bin: [paths of other parts, kept as they are by the app] }
  function Zip(src) {
    this._t = {}; this._bin = (src && src.bin) || []; this._gone = []; this.files = {};
    var f = (src && src.files) || {}, k;
    for (k in f) if (Object.prototype.hasOwnProperty.call(f, k)) { this._t[k] = f[k]; this.files[k] = { name: k, dir: false }; }
    for (var i = 0; i < this._bin.length; i++) this.files[this._bin[i]] = { name: this._bin[i], dir: false };
  }
  Zip.prototype.file = function (p, content) {
    if (arguments.length > 1) { this._t[p] = String(content); this.files[p] = { name: p, dir: false }; return this; }
    if (!Object.prototype.hasOwnProperty.call(this._t, p)) return null;
    var t = this._t;
    return { name: p, async: function () { return Promise.resolve(t[p]); } };
  };
  Zip.prototype.remove = function (p) { delete this._t[p]; delete this.files[p]; this._gone.push(p); return this; };
  Zip.prototype.generateAsync = function () { return Promise.resolve({ __zip: this }); };
  return {
    loadAsync: function (src) {
      if (!src || (!src.files && !src.bin)) return Promise.reject(new Error('This is not an Excel (.xlsx) file.'));
      return Promise.resolve(new Zip(src));
    },
    // what changed, for the app to write the .xlsx: every XML part as it is now, and the parts removed
    out: function (blob) { var z = blob && blob.__zip; return z ? { files: z._t, removed: z._gone } : null; }
  };
})();

(function () {
  'use strict';
  var doc = new DOMParser().parseFromString('<a><b/></a>', 'application/xml');
  function iter() { var i = 0, self = this; return { next: function () { return i < self.length ? { value: self.item ? self.item(i++) : self[i++], done: false } : { value: undefined, done: true }; } }; }
  var lists = [doc.childNodes, doc.getElementsByTagNameNS('*', 'b'), doc.getElementsByTagName('b')];
  lists.forEach(function (l) { var p = Object.getPrototypeOf(l); if (p && !p[Symbol.iterator]) p[Symbol.iterator] = iter; });
  var el = Object.getPrototypeOf(doc.documentElement);
  if (!('children' in doc.documentElement)) {
    Object.defineProperty(el, 'children', {
      get: function () { var out = [], n = this.firstChild; while (n) { if (n.nodeType === 1) out.push(n); n = n.nextSibling; } return out; }
    });
  }
})();
