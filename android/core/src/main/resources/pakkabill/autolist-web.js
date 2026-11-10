/* PakkaBill app: Auto listing in Meesho's supplier panel, opened inside the app. The PakkaBill Lens
   extension's own form filler (lens/listcore.js and lens/list.js, as they are) runs here the way
   Chrome runs the extension on a laptop. Its chrome.storage is the app's, reached through
   PBLensHost, which only supplier.meesho.com is given. Nothing on Meesho's page is changed: the
   filler's names stay inside this function, and photos load from an address on the same site that
   the app answers from the phone. */
(function () {
  // not strict: the extension's files run as Chrome runs them
  if (window.top !== window || window.__pbAutoListing) return;
  var host = window.PBLensHost;
  if (!host || typeof host.postMessage !== 'function') return;
  window.__pbAutoListing = true;

  var waiting = {}, next = 0, listeners = [];
  host.onmessage = function (e) {
    var m;
    try { m = JSON.parse(e.data); } catch (x) { return; }
    var w = m && waiting[m.id];
    if (!w) return;
    delete waiting[m.id];
    w(m.v);
  };
  function ask(op, arg, cb) {
    var id = ++next;
    waiting[id] = cb || function () {};
    host.postMessage(JSON.stringify({ id: id, op: op, arg: arg === undefined ? null : arg }));
  }
  function keysOf(k) { return k == null ? null : typeof k === 'string' ? [k] : Array.isArray(k) ? k : Object.keys(k); }
  // chrome.storage.onChanged, for changes made here (the app makes none while this page is open)
  function changed(o) {
    var ch = {};
    Object.keys(o).forEach(function (k) { ch[k] = { newValue: o[k] }; });
    listeners.slice().forEach(function (fn) { try { fn(ch, 'local'); } catch (e) { /* as in Chrome: one listener does not stop the rest */ } });
  }
  var chrome = {
    storage: {
      local: {
        get: function (k, cb) { ask('get', keysOf(k), function (v) { if (cb) cb(v || {}); }); },
        set: function (o, cb) { o = o || {}; ask('set', o, function () { if (cb) cb(); changed(o); }); },
        remove: function (k, cb) {
          var ks = keysOf(k) || [];
          ask('remove', ks, function () { if (cb) cb(); var o = {}; ks.forEach(function (x) { o[x] = undefined; }); changed(o); });
        }
      },
      onChanged: { addListener: function (fn) { if (typeof fn === 'function') listeners.push(fn); } }
    },
    runtime: { getManifest: function () { return { version: '@VERSION@ (app)' }; } }
  };

/*@listcore@*/

/*@list@*/
})();
