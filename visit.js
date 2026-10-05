// Counts visits for the PakkaBill admin panel (our own counter: no Google Analytics, no ads
// trackers, no cookies). A random visitor number is kept on this device; a new visit starts after
// 30 minutes away. Page changes inside the app are counted as page views.
// A visit is only sent once there is a sign of a real person (a tap, scroll or key press, or the
// page kept open on screen for a few seconds), so robots that load the page and leave are not
// counted as visitors; the server checks more signs and keeps likely bots apart.
(function () {
  try {
    var now = Date.now(), ls = window.localStorage, vid = ls.getItem('pb-vid'), isNew = false;
    if (!vid) {
      vid = (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + now).replace(/-/g, '').slice(0, 24);
      ls.setItem('pb-vid', vid); isNew = true;
    }
    var last = Number(ls.getItem('pb-vlast') || 0), lastPath = '', human = false;
    function path() {
      var p = location.pathname;
      if (p === '/' || p === '/index.html') return '/#/' + ((location.hash || '').replace(/^#\/?/, '').split(/[?/]/)[0] || '');
      return p;
    }
    function token() { try { var a = JSON.parse(ls.getItem('pb-acct') || 'null'); return a && a.token ? a.token : ''; } catch (e) { return ''; } }
    function post(body) {
      if (navigator.sendBeacon && navigator.sendBeacon('/api/visit', new Blob([body], { type: 'text/plain' }))) return;
      fetch('/api/visit', { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(function () {});
    }
    function send(kind) {
      var p = path();
      if (kind === 'pv' && p === lastPath) return;
      lastPath = p;
      ls.setItem('pb-vlast', String(Date.now()));
      var q = /[?&]utm_source=([^&#]+)/.exec(location.search), ref = document.referrer && document.referrer.indexOf(location.origin) !== 0 ? document.referrer : '';
      post(JSON.stringify(kind === 'visit'
        ? { kind: kind, vid: vid, path: p, ref: ref, utm: q ? decodeURIComponent(q[1]) : '', isNew: isNew, h: 1, wd: !!navigator.webdriver, lang: String(navigator.language || '').slice(0, 20), standalone: !!(window.matchMedia && matchMedia('(display-mode: standalone)').matches), token: token() }
        : { kind: kind, vid: vid, path: p, h: 1 }));
    }
    var EVENTS = ['pointerdown', 'touchstart', 'keydown', 'scroll', 'wheel'];
    function becameHuman() {
      if (human) return;
      human = true;
      EVENTS.forEach(function (t) { removeEventListener(t, becameHuman, true); });
      send(!last || Date.now() - last > 30 * 60e3 ? 'visit' : 'pv');
    }
    EVENTS.forEach(function (t) { addEventListener(t, becameHuman, { capture: true, passive: true }); });
    // or the page stays open and visible for 4 seconds
    var seen = 0, tick = setInterval(function () {
      if (human) { clearInterval(tick); return; }
      if (document.visibilityState === 'visible') { seen += 500; if (seen >= 4000) { clearInterval(tick); becameHuman(); } }
    }, 500);
    var t;
    window.addEventListener('hashchange', function () {
      clearTimeout(t);
      t = setTimeout(function () { if (!human) return; var gone = Date.now() - Number(ls.getItem('pb-vlast') || 0) > 30 * 60e3; send(gone ? 'visit' : 'pv'); }, 400);
    });
  } catch (e) { /* counting must never break the app */ }
})();
