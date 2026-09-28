/* PakkaBill Android bridge. Injected by the app at document start on pakkabill1.vercel.app only.
   Android's WebView cannot save blob downloads, print, use the Web Share API or show the page
   colours in the status bar on its own; this passes those to the native app through
   PakkaBillAndroid.postMessage(JSON). */
(function () {
  'use strict';
  if (window.__pbAndroid) return;
  window.__pbAndroid = true;
  var bridge = window.PakkaBillAndroid;
  if (!bridge || typeof bridge.postMessage !== 'function') return;
  function send(msg) { try { bridge.postMessage(JSON.stringify(msg)); } catch (e) { /* ignore */ } }

  window.PakkaBillApp = {
    platform: 'android',
    version: '__VERSION__',
    build: __BUILD__,
    settings: function () { send({ t: 'settings' }); },
    review: function () { send({ t: 'review' }); },
    haptic: function () { send({ t: 'haptic' }); }
  };

  /* ---------- files: save blob: and data: downloads natively ---------- */
  // Pages often revoke a blob URL right after clicking it; keep it alive long enough to read.
  var revoke = URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL = function (u) { setTimeout(function () { try { revoke(u); } catch (e) { /* ignore */ } }, 60000); };

  function toBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { var s = String(r.result || ''); resolve(s.slice(s.indexOf(',') + 1)); };
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(blob);
    });
  }
  function guessName(name, type) {
    if (name) return name;
    var ext = { 'application/pdf': 'pdf', 'application/json': 'json', 'text/csv': 'csv', 'image/png': 'png', 'image/jpeg': 'jpg', 'application/zip': 'zip',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx' }[type] || 'bin';
    return 'PakkaBill-' + new Date().toISOString().slice(0, 10) + '.' + ext;
  }
  var busy = {};
  function saveUrl(href, name) {
    if (busy[href]) return;
    busy[href] = 1;
    setTimeout(function () { delete busy[href]; }, 3000);
    fetch(href).then(function (r) { return r.blob(); }).then(function (b) {
      return toBase64(b).then(function (data) {
        send({ t: 'save', name: guessName(name, b.type), mime: b.type || 'application/octet-stream', data: data });
      });
    }).catch(function () { send({ t: 'toast', text: 'Could not save this file. Please try again.' }); });
  }
  window.__pbSaveUrl = saveUrl;
  function isFile(a) { var h = a && a.href ? String(a.href) : ''; return /^(blob|data):/i.test(h); }

  var aClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (isFile(this)) { saveUrl(this.href, this.getAttribute('download') || ''); return; }
    return aClick.apply(this, arguments);
  };
  var aDispatch = HTMLAnchorElement.prototype.dispatchEvent;
  HTMLAnchorElement.prototype.dispatchEvent = function (ev) {
    if (ev && ev.type === 'click' && isFile(this)) { saveUrl(this.href, this.getAttribute('download') || ''); return false; }
    return aDispatch.apply(this, arguments);
  };
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (a && isFile(a)) { ev.preventDefault(); ev.stopImmediatePropagation(); saveUrl(a.href, a.getAttribute('download') || ''); }
  }, true);
  var wOpen = window.open;
  window.open = function (u) {
    if (u && /^(blob|data):/i.test(String(u))) { saveUrl(String(u), ''); return null; }
    return wOpen.apply(window, arguments);
  };

  /* ---------- printing ---------- */
  window.print = function () { send({ t: 'print', title: document.title || 'PakkaBill' }); };

  /* ---------- Web Share API (WhatsApp, email, Drive ...) ---------- */
  var SHAREABLE = /^(application\/pdf|image\/|text\/|application\/json|application\/zip|application\/vnd\.)/;
  navigator.canShare = function (data) {
    if (!data) return false;
    if (data.files) return Array.prototype.every.call(data.files, function (f) { return SHAREABLE.test(f.type || 'application/pdf'); });
    return !!(data.text || data.url || data.title);
  };
  navigator.share = function (data) {
    data = data || {};
    var files = data.files ? Array.prototype.slice.call(data.files) : [];
    return Promise.all(files.map(function (f) {
      return toBase64(f).then(function (d) { return { name: f.name || guessName('', f.type), type: f.type || 'application/octet-stream', data: d }; });
    })).then(function (list) {
      send({ t: 'share', title: data.title || '', text: data.text || '', url: data.url || '', files: list });
    });
  };

  /* ---------- status bar colour follows the page ---------- */
  var lastBars = '', pen = null;
  // any CSS colour (rgb, hex, color(srgb ...), oklch ...) as "rgb(r, g, b)"; '' when mostly transparent
  function toRgb(c) {
    try {
      if (!pen) { var cv = document.createElement('canvas'); cv.width = cv.height = 1; pen = cv.getContext('2d', { willReadFrequently: true }); }
      pen.clearRect(0, 0, 1, 1);
      pen.fillStyle = '#000'; pen.fillStyle = c; pen.fillRect(0, 0, 1, 1);
      var d = pen.getImageData(0, 0, 1, 1).data;
      return d[3] < 128 ? '' : 'rgb(' + d[0] + ', ' + d[1] + ', ' + d[2] + ')';
    } catch (e) { return ''; }
  }
  function barColour() {
    var els = [document.querySelector('.topbar'), document.body, document.documentElement];
    for (var i = 0; i < els.length; i++) {
      if (!els[i]) continue;
      var c = toRgb(getComputedStyle(els[i]).backgroundColor);
      if (c) return c;
    }
    return '';
  }
  function bars() {
    var c = barColour();
    if (c && c !== lastBars) { lastBars = c; send({ t: 'bars', color: c }); }
  }
  function watch() {
    bars();
    try {
      var mo = new MutationObserver(function () { setTimeout(bars, 50); });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
      if (document.body) mo.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
      if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { setTimeout(bars, 50); });
    } catch (e) { /* ignore */ }
    window.addEventListener('hashchange', function () { setTimeout(bars, 150); });
    setTimeout(bars, 800);
  }
  // page errors, kept for the emulator test and for support
  window.__pbErrors = [];
  window.addEventListener('error', function (e) { if (window.__pbErrors.length < 20) window.__pbErrors.push(String(e.message) + ' @ ' + String(e.filename).split('/').pop() + ':' + e.lineno); });
  window.addEventListener('unhandledrejection', function (e) { if (window.__pbErrors.length < 20) window.__pbErrors.push('promise: ' + String(e.reason && (e.reason.message || e.reason))); });

  // the Meesho P&L runs in a frame: only the main page sets the status bar
  if (window.top === window) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
    send({ t: 'ready' });
  }
})();
