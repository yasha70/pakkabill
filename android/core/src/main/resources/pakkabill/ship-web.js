/* PakkaBill app: Meesho's real shipping for every photo version, in Meesho's supplier panel opened
   inside the app. The website's shipping bookmark (lens/shipcore.js, shiphook.js and shipbm.js, as
   they are, put together the way lens/build.py does) runs here as it does when a seller taps the PB
   Shipping bookmark on a phone; like the bookmark, it watches Meesho's own requests in this page to
   learn how Meesho prices the seller's photo. The app is the PakkaBill tab it talks to: the versions
   come from the app, and every price goes back to it through PBLensHost, which only
   supplier.meesho.com is given. */
(function () {
  'use strict';
  if (window.top !== window || window.__pbShipApp) return;
  var host = window.PBLensHost;
  if (!host || typeof host.postMessage !== 'function') return;
  var PB = 'https://pakkabill1.vercel.app';
  // the page's own fetch, from before the bookmark watches it: PakkaBill's requests are not Meesho's
  var pageFetch = window.fetch;

  // The PakkaBill tab: an empty frame of this page, outside Meesho's own part of it, whose
  // postMessage takes the bookmark's messages to the app.
  var frame = document.createElement('iframe');
  frame.style.display = 'none';
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('tabindex', '-1');
  document.documentElement.appendChild(frame);
  var peer = frame.contentWindow;
  peer.postMessage = function (m) {
    try { host.postMessage(JSON.stringify({ op: 'ship', m: m })); } catch (e) { /* the app is gone */ }
  };
  // a message from PakkaBill, as the bookmark gets it from PakkaBill's tab
  function deliver(m) { window.dispatchEvent(new MessageEvent('message', { data: m, origin: PB, source: peer })); }

  // a version, from the address the app answers, as the photo data the bookmark takes
  function dataUrl(u) {
    return pageFetch.call(window, u, { credentials: 'omit', cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.blob();
    }).then(function (b) {
      return new Promise(function (ok, no) { var fr = new FileReader(); fr.onload = function () { ok(fr.result); }; fr.onerror = function () { no(fr.error); }; fr.readAsDataURL(b); });
    });
  }
  window.__pbShipApp = {
    // { cats: [{ name, id }], items: [{ id, label, name, url }] }: what PakkaBill's Image tab sends
    queue: function (q) {
      var items = (q && q.items) || [];
      Promise.all(items.map(function (it) {
        return dataUrl(it.url).then(function (d) { return { id: it.id, label: it.label, name: it.name, data: d }; }, function () { return null; });
      })).then(function (list) { deliver({ pbsb: 1, type: 'queue', cats: (q && q.cats) || [], items: list.filter(Boolean) }); });
    },
    ping: function () { deliver({ pbsb: 1, type: 'ping' }); }
  };

/*@shipcore@*/
window.PBShipSync = PBShipSync;
/*@shiphook@*/
/*@shipbm@*/
})();
