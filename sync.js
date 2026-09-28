// PakkaBill cloud backup and sync. When the customer is logged in (and backup is part of their
// plan), every shop on this device is compressed and saved to their account whenever it
// changes; on any other phone or laptop they log in on, their shops download by themselves.
//
// Each shop is synced as a whole (bills, parties, items, settings). If both devices changed a
// shop, the two copies are merged record by record: the newer edit of a bill wins, a bill
// deleted on one device stays deleted, and nothing added on either device is lost.
(function () {
  // The device checks its own data every minute (no network); it talks to the server when
  // something changed, when the app is opened again, or every 5 minutes, to keep database use low.
  var S = 'pb-sync', API = '/api/sync', PART = 500000, CHECK = 60000, POLL = 300000;
  var LISTS = ['invoices', 'parties', 'products'];
  var busy = false, again = false, info = null, lastError = '', pendingActive = false, lastRun = 0;
  var shops = function () { return window.pbShops; };

  function ls(k, v) {
    try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; }
  }
  function acct() { var a = ls('pb-acct'); return a && a.token && a.user ? a : null; }
  // What this device last synced, per shop: server version, a fingerprint of each part, record ids.
  function state() {
    var s = ls(S) || {}, a = acct();
    if (!a || s.phone !== a.user.phone) s = { phone: a ? a.user.phone : '', auto: s.auto !== false, shops: {} };
    s.shops = s.shops || {};
    return s;
  }
  function save(s) { ls(S, s); }
  function device() {
    var ua = navigator.userAgent;
    var os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Computer';
    var br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'browser';
    return os + ' · ' + br;
  }
  function call(action, body) {
    var a = acct();
    return fetch(API, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (a ? a.token : '') }, body: JSON.stringify(Object.assign({ action: action }, body || {})) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Cloud backup is not reachable (' + r.status + ').'); e.status = r.status; throw e; } return j; }); });
  }

  /* ---------------- fingerprints, packing ---------------- */
  function hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
    return str.length.toString(36) + '.' + h.toString(36);
  }
  function print(d) {
    var out = {};
    shops().KEYS.forEach(function (k) { out[k] = hash(JSON.stringify(k === 'meta' ? { sample: !!(d.meta && d.meta.sample) } : d[k] === undefined ? null : d[k])); });
    return out;
  }
  function ids(d) { var o = {}; LISTS.forEach(function (k) { o[k] = (d[k] || []).map(function (x) { return x.id; }); }); return o; }
  function same(a, b) { return !!a && !!b && shops().KEYS.every(function (k) { return a[k] === b[k]; }); }
  function counts(d) { return { invoices: (d.invoices || []).length, parties: (d.parties || []).length, products: (d.products || []).length }; }

  function toB64(blob) {
    return new Promise(function (resolve, reject) { var r = new FileReader(); r.onload = function () { resolve(String(r.result).split(',')[1] || ''); }; r.onerror = function () { reject(r.error); }; r.readAsDataURL(blob); });
  }
  function pack(d) {
    var text = JSON.stringify({ v: 1, data: d });
    var blob = new Blob([text], { type: 'application/json' });
    if (window.CompressionStream) {
      return new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob().then(toB64).then(function (b) { return { b64: b, enc: 'gz' }; });
    }
    return toB64(blob).then(function (b) { return { b64: b, enc: 'raw' }; });
  }
  function unpack(b64, enc) {
    return fetch('data:application/octet-stream;base64,' + b64).then(function (r) { return r.blob(); }).then(function (blob) {
      if (enc === 'gz') {
        if (!window.DecompressionStream) throw new Error('This browser is too old to open the cloud backup. Update Chrome or Safari.');
        return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
      }
      return blob.text();
    }).then(function (t) { return JSON.parse(t).data; });
  }

  /* ---------------- merging two copies of a shop ---------------- */
  var stamp = function (x) { return (x && (x.updatedAt || x.createdAt)) || 0; };
  function mergeList(L, R, baseIds) {
    var base = new Set(baseIds || []);
    var lm = new Map((L || []).map(function (x) { return [x.id, x]; })), rm = new Map((R || []).map(function (x) { return [x.id, x]; }));
    var out = [];
    new Set(Array.from(lm.keys()).concat(Array.from(rm.keys()))).forEach(function (id) {
      var l = lm.get(id), r = rm.get(id);
      if (l && r) out.push(stamp(r) > stamp(l) ? r : l);
      else if (l && !base.has(id)) out.push(l); // added here (if it was synced before, the other device deleted it)
      else if (r && !base.has(id)) out.push(r); // added there (if it was synced before, it was deleted here)
    });
    return out.sort(function (a, b) { return (b.createdAt || stamp(b)) - (a.createdAt || stamp(a)); });
  }
  function merge(L, R, e) {
    var out = {};
    LISTS.forEach(function (k) { out[k] = mergeList(L[k], R[k], e && e.ids ? e.ids[k] : []); });
    var lb = hash(JSON.stringify(L.business || null)), rb = hash(JSON.stringify(R.business || null)), base = e && e.h ? e.h.business : '';
    out.business = (rb !== base && lb === base) || !L.business || !L.business.name ? R.business : L.business;
    out.meta = Object.assign({}, R.meta || {}, L.meta || {}, { sample: false, lastBackup: [L.meta && L.meta.lastBackup, R.meta && R.meta.lastBackup].filter(Boolean).sort().pop() || '' });
    return out;
  }
  function differentShop(L, R) {
    var a = L.business || {}, b = R.business || {};
    if (a.gstin && b.gstin) return a.gstin.toUpperCase() !== b.gstin.toUpperCase();
    return !!(a.name && b.name && a.name.trim().toLowerCase() !== b.name.trim().toLowerCase());
  }

  /* ---------------- upload and download ---------------- */
  function push(id, d, s) {
    var e = s.shops[id] || { v: 0 };
    var b = d.business || {};
    var clean = {}; shops().KEYS.forEach(function (k) { if (d[k] !== undefined) clean[k] = d[k]; });
    if (clean.meta) clean.meta = Object.assign({}, clean.meta, { sample: false });
    return pack(clean).then(function (p) {
      var parts = []; for (var i = 0; i < p.b64.length; i += PART) parts.push(p.b64.slice(i, i + PART));
      if (!parts.length) parts.push('');
      var token = Math.random().toString(36).slice(2) + Date.now().toString(36);
      var body = { shop: id, base: e.v, parts: parts.length, enc: p.enc, token: token, device: device(), info: { name: b.name, gstin: b.gstin, state: b.stateCode, counts: counts(d) } };
      var i2 = 0;
      var next = function () {
        return call('put', Object.assign({}, body, { part: i2, data: parts[i2] })).then(function (r) {
          if (r.conflict) return r;
          if (++i2 < parts.length) return next();
          s.shops[id] = { v: r.version, h: print(d), ids: ids(d), at: Date.now() };
          save(s);
          return r;
        });
      };
      return next();
    });
  }
  function pull(id, meta) {
    var got = [], i = 0;
    var next = function () {
      return call('get', { shop: id, part: i, version: meta.version }).then(function (r) {
        if (r.conflict) { var err = new Error('changed'); err.retry = true; throw err; }
        got.push(r.data);
        if (++i < meta.parts) return next();
        return unpack(got.join(''), meta.enc);
      });
    };
    return next();
  }
  function adopt(id, d, version, s) { s.shops[id] = { v: version, h: print(d), ids: ids(d), at: Date.now() }; save(s); }

  // The app keeps the open shop in memory, so changing it underneath means reopening the app;
  // never while a bill is being made or edited.
  function safeToReload() { return !/^#\/(new|edit)/.test(location.hash) && !document.querySelector('.pbp-overlay, .pbs-back'); }
  function reopen(msg) {
    try { sessionStorage.setItem('pb-sync-msg', msg); } catch (e) { /* ignore */ }
    location.reload();
  }

  /* ---------------- the sync run ---------------- */
  function run(reason) {
    var a = acct();
    if (!a || !shops() || !window.indexedDB && !window.localStorage) return Promise.resolve();
    if (busy) { again = true; return Promise.resolve(); }
    busy = true; lastRun = Date.now();
    var s = state(), act = shops().active(), activeChanged = false, restored = 0, notes = [];
    return call('status').then(function (st) {
      info = st; lastError = '';
      var cloud = {}; st.shops.forEach(function (x) { cloud[x.id] = x; });
      // the open shop goes last, so the app reopens right after it changes
      var local = shops().list().map(function (x) { return x.id; }).sort(function (x, y) { return (x === act) - (y === act); });
      var chain = Promise.resolve();
      // shops in the cloud that this device does not have yet: download them
      st.shops.forEach(function (cs) {
        if (local.indexOf(cs.id) >= 0) return;
        chain = chain.then(function () {
          return pull(cs.id, cs).then(function (d) {
            return shops().write(cs.id, d).then(function () {
              shops().register({ id: cs.id, name: cs.name, gstin: cs.gstin, state: cs.state });
              adopt(cs.id, d, cs.version, s); restored += (d.invoices || []).length;
            });
          });
        });
      });
      // every shop on this device
      var light = /^(timer|changed|hide|show|pending)$/.test(reason);
      local.forEach(function (id) {
        chain = chain.then(function () {
          var cs = cloud[id], e = s.shops[id];
          if (id === act && pendingActive && !safeToReload()) return; // wait until the bill is saved
          // a shop that is not open cannot have changed here; skip it unless the cloud has news
          if (light && id !== act && e && cs && cs.version === e.v) return;
          return shops().read(id).then(function (d) {
            var fp = print(d), mine = !e || !same(fp, e.h), theirs = cs && (!e || cs.version !== e.v);
            var empty = shops().isEmpty(d);
            if (!cs) {
              if (!empty && st.allowed && (st.pro || id === 'main') && s.auto !== false) return push(id, d, s).then(function (r) { if (r && r.conflict) again = true; });
              return;
            }
            if (theirs && (!mine || empty)) {
              if (id === act && !safeToReload()) { pendingActive = true; return; }
              return pull(id, cs).then(function (rd) {
                return shops().write(id, rd).then(function () { adopt(id, rd, cs.version, s); if (id === act) activeChanged = true; if (empty) restored += (rd.invoices || []).length; });
              });
            }
            if (theirs && mine) {
              if (id === act && !safeToReload()) { pendingActive = true; return; }
              return pull(id, cs).then(function (rd) {
                // first sync on this device, and its first shop is a different business: keep both
                if (!e && id === 'main' && differentShop(d, rd)) {
                  var nid = 's_' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6);
                  return shops().write(nid, d).then(function () {
                    shops().register({ id: nid, name: (d.business || {}).name, gstin: (d.business || {}).gstin, state: (d.business || {}).stateCode });
                    notes.push('This device\'s shop "' + ((d.business || {}).name || 'shop') + '" is kept as a separate shop.');
                    return shops().write('main', rd).then(function () { adopt('main', rd, cs.version, s); if (act === 'main') activeChanged = true; restored += (rd.invoices || []).length; });
                  });
                }
                var m = merge(d, rd, e);
                return shops().write(id, m).then(function () {
                  if (id === act && !same(print(m), fp)) activeChanged = true;
                  if (!st.allowed) { adopt(id, m, cs.version, s); return; }
                  s.shops[id] = { v: cs.version, h: e && e.h, ids: e && e.ids };
                  return push(id, m, s).then(function (r) { if (r && r.conflict) again = true; });
                });
              });
            }
            if (mine && st.allowed && (st.pro || id === 'main') && s.auto !== false) return push(id, d, s).then(function (r) { if (r && r.conflict) again = true; });
          });
        });
      });
      return chain;
    }).then(function () {
      busy = false;
      if (activeChanged) {
        pendingActive = false;
        var msg = restored ? 'Restored ' + restored + ' bill' + (restored === 1 ? '' : 's') + ' from your cloud backup.' : 'Updated with changes from your other device.';
        if (notes.length) msg += ' ' + notes.join(' ');
        return reopen(msg);
      }
      if (restored) toast('Restored ' + restored + ' bill' + (restored === 1 ? '' : 's') + ' from your cloud backup.' + (notes.length ? ' ' + notes.join(' ') : ''));
      if (pendingActive) showPending();
      drawCards();
      if (again) { again = false; setTimeout(function () { run('again'); }, 1500); }
    }).catch(function (err) {
      busy = false;
      lastError = err.message;
      if (err.retry || err.status === 423 || err.status === 409) setTimeout(function () { run('retry'); }, 5000);
      if (err.status === 401) info = null;
      drawCards();
    });
  }

  /* ---------------- messages ---------------- */
  function toast(msg, bad) {
    var old = document.querySelector('.pby-toast'); if (old) old.remove();
    var el = document.createElement('div'); el.className = 'pby-toast' + (bad ? ' is-bad' : ''); el.setAttribute('role', 'status'); el.textContent = msg;
    document.body.append(el); setTimeout(function () { el.remove(); }, 6000);
  }
  var bar = null;
  function showPending() {
    if (bar) return;
    bar = document.createElement('div'); bar.className = 'pby-bar'; bar.setAttribute('role', 'status');
    bar.innerHTML = '<span>☁️ Changes from your other device are ready.</span>';
    var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Load now';
    b.onclick = function () { bar.remove(); bar = null; pendingActive = true; if (safeToReload()) run('load'); else toast('Save or close the bill first, then tap Load now.', true); };
    bar.append(b); document.body.append(bar);
  }

  /* ---------------- the card on the Shops page ---------------- */
  var cards = [];
  function mb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function ago(t) { if (!t) return 'never'; var m = Math.round((Date.now() - t) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; var hr = Math.round(m / 60); if (hr < 24) return hr + ' h ago'; return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }
  function drawCards() { cards = cards.filter(function (el) { return el.isConnected; }); cards.forEach(drawCard); }
  function drawCard(el) {
    var a = acct(), s = state();
    var box = document.createElement('section'); box.className = 'paper pby-card';
    var h = '<h2 class="form-sec__title">☁️ Cloud backup and sync</h2>';
    if (!a) {
      h += '<p>Log in and your shops are saved to your account. Open PakkaBill on another phone or laptop, log in with the same number, and your bills are there.</p><a class="pbs-btn" href="#/plan">Log in or create account</a>';
    } else if (!info) {
      h += '<p class="pbs-fine">' + (lastError ? 'Could not reach cloud backup: ' + esc(lastError) : 'Checking your cloud backup…') + '</p>';
    } else if (!info.allowed) {
      h += '<p>Cloud backup is part of PakkaBill Pro: every shop saved to your account and on every device you log in on.</p>'
        + (info.shops.length ? '<p class="pbs-fine">Your earlier backup (' + info.shops.length + ' shop' + (info.shops.length > 1 ? 's' : '') + ') is kept and still downloads on new devices.</p>' : '')
        + '<button type="button" class="pbs-btn" data-pro>See Pro plans</button>';
    } else {
      var local = shops().list();
      var rows = local.map(function (x) {
        var c = info.shops.find(function (y) { return y.id === x.id; }), e = s.shops[x.id];
        var st2 = c ? '✓ Saved ' + ago(c.updatedAt) + (c.device ? ' from ' + esc(c.device) : '') + ' · ' + mb(c.bytes) : (!info.pro && x.id !== 'main' ? 'Pro backs up this shop' : 'Not saved yet');
        return '<li><b>' + esc(shops().label(x.id)) + '</b><span>' + st2 + (e && c && e.v !== c.version ? ' · update waiting' : '') + '</span></li>';
      }).join('');
      h += '<p class="pby-on"><span class="pby-dot" aria-hidden="true"></span> ' + (s.auto === false ? 'Automatic backup is paused' : 'Backup is on: changes save by themselves') + ' · logged in as ' + esc(a.user.phone) + '</p>'
        + '<ul class="pby-list">' + rows + '</ul>'
        + '<p class="pbs-fine">Using ' + mb(info.used) + ' of ' + Math.round(info.quota / 1048576) + ' MB.' + (lastError ? ' Last try: ' + esc(lastError) : '') + '</p>'
        + '<div class="pbs-actions"><button type="button" class="pbs-btn pbs-btn--sm" data-now>Back up now</button>'
        + '<label class="pbs-check"><input type="checkbox" data-auto' + (s.auto === false ? '' : ' checked') + '><span>Back up automatically</span></label></div>'
        + '<p class="pbs-fine">On a new phone or laptop: open PakkaBill, log in on the Plan page with ' + esc(a.user.phone) + ', and your shops download by themselves.</p>';
    }
    box.innerHTML = h;
    var now = box.querySelector('[data-now]');
    if (now) now.onclick = function () { now.disabled = true; now.textContent = 'Backing up…'; run('manual').then(function () { toast(lastError ? lastError : 'All shops are backed up.', !!lastError); }); };
    var auto = box.querySelector('[data-auto]');
    if (auto) auto.onchange = function () { var s2 = state(); s2.auto = auto.checked; save(s2); if (auto.checked) run('auto'); drawCards(); };
    var pro = box.querySelector('[data-pro]');
    if (pro) pro.onclick = function () { if (window.pbUpgrade) window.pbUpgrade('sync'); };
    el.replaceChildren(box);
  }
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var CSS = '.pby-card{display:grid;gap:10px;padding:18px 20px;border-radius:16px}.pby-card p{margin:0}.pby-card .form-sec__title{margin:0}'
    + '.pby-on{display:flex;align-items:center;gap:8px;font-weight:600}.pby-dot{width:10px;height:10px;border-radius:50%;background:#1faa59;flex:none}'
    + '.pby-list{list-style:none;margin:0;padding:0;display:grid;gap:6px}.pby-list li{display:grid;gap:2px;padding:9px 12px;border-radius:12px;border:1px solid var(--rule)}.pby-list span{font-size:13px;color:var(--ink-2)}'
    + '.pby-toast{position:fixed;left:50%;bottom:calc(104px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:1300;max-width:calc(100% - 32px);background:#1d1838;color:#fff;padding:11px 18px;border-radius:12px;font-weight:600}.pby-toast.is-bad{background:#8a1c24}'
    + '.pby-bar{position:fixed;left:50%;top:calc(12px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:1250;display:flex;gap:12px;align-items:center;max-width:calc(100% - 24px);padding:10px 12px 10px 16px;border-radius:14px;background:#1d1838;color:#fff;font-weight:600;box-shadow:0 12px 30px -12px rgba(0,0,0,.5)}'
    + '.pby-bar button{border:0;border-radius:10px;padding:8px 12px;font:inherit;font-weight:700;background:#fff;color:#1d1838;cursor:pointer}'
    + '@media (width >= 1024px){.pby-toast{bottom:28px}}';
  function css() { if (!document.getElementById('pby-css')) { var st = document.createElement('style'); st.id = 'pby-css'; st.textContent = CSS; document.head.append(st); } }

  /* ---------------- hooks ---------------- */
  window.pbSyncCard = function (el) { css(); cards.push(el); drawCard(el); if (acct() && Date.now() - lastRun > 5000) run('page'); };
  window.pbSyncOn = function () { return !!(acct() && info && info.allowed); };
  // before switching shops: save the one we are leaving
  window.pbSyncFlush = function () { return acct() ? run('switch') : Promise.resolve(); };
  // a shop deleted on this device is removed from the cloud too
  window.pbSyncForget = function (id) {
    var s = state(); delete s.shops[id]; save(s);
    if (acct()) call('delete', { shop: id }).catch(function () {});
  };

  css();
  try { var m = sessionStorage.getItem('pb-sync-msg'); if (m) { sessionStorage.removeItem('pb-sync-msg'); setTimeout(function () { toast(m); }, 900); } } catch (e) { /* ignore */ }
  // logging in on this device: get the account's shops straight away
  window.addEventListener('pb-account', function () { info = null; if (acct()) run('login'); else drawCards(); });
  setTimeout(function () { if (acct()) run('start'); }, 2500);
  setInterval(function () {
    if (document.hidden || !acct() || busy || !shops()) return;
    var id = shops().active(), e = state().shops[id];
    shops().read(id).then(function (d) {
      var changed = !e || !same(print(d), e.h);
      if (changed && !shops().isEmpty(d) && state().auto !== false) run('changed');
      else if (Date.now() - lastRun > POLL) run('timer');
    }).catch(function () {});
  }, CHECK);
  document.addEventListener('visibilitychange', function () { if (acct() && Date.now() - lastRun > (document.hidden ? 10000 : 60000)) run(document.hidden ? 'hide' : 'show'); });
  window.addEventListener('hashchange', function () { if (pendingActive && safeToReload() && acct()) run('pending'); });
})();
