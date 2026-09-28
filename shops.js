// PakkaBill: several shops (one per GSTIN) in one app.
// Each shop keeps its own bills, parties, items and settings in its own browser database, so
// numbering and GST figures never mix. The first shop uses the original database ("pakkabill"),
// others use "pakkabill-<id>". The switcher changes which one the app opens (a quick reload).
// This file loads before the app so the app opens the right database.
(function () {
  var REG = 'pb-shops', ACTIVE = 'pb-shop', MAX = 10;
  var KEYS = ['business', 'parties', 'products', 'invoices', 'meta'];
  var STATES = { '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory' };
  var COLORS = ['#6c4dff', '#e0603f', '#0e9f6e', '#0ea5e9', '#d946ef', '#f59e0b', '#14b8a6', '#ef4444', '#8b5cf6', '#64748b'];

  function ls(k, v) {
    try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; }
  }
  function registry() {
    var r = ls(REG);
    if (!r || !Array.isArray(r.list)) r = { list: [] };
    if (!r.list.some(function (s) { return s.id === 'main'; })) r.list.unshift({ id: 'main', color: COLORS[0], at: 0 });
    return r;
  }
  function saveRegistry(r) { ls(REG, r); }
  function activeId() { var id = ls(ACTIVE); return registry().list.some(function (s) { return s.id === id; }) ? id : 'main'; }
  var dbName = function (id) { return id === 'main' ? 'pakkabill' : 'pakkabill-' + id; };
  var prefix = function (id) { return id === 'main' ? 'pakkabill:' : 'pakkabill-' + id + ':'; };
  // The app asks these which database and localStorage prefix to use.
  window.pbShopDb = function (id) { return dbName(id || activeId()); };
  window.pbShopPrefix = function (id) { return prefix(id || activeId()); };

  /* ---------------- reading and writing any shop's data ---------------- */
  function openDb(id) {
    return new Promise(function (resolve) {
      var done = false, t = setTimeout(function () { if (!done) { done = true; resolve(null); } }, 3000);
      try {
        var r = indexedDB.open(dbName(id), 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
        r.onsuccess = function () { if (done) { r.result.close(); return; } done = true; clearTimeout(t); resolve(r.result); };
        r.onerror = r.onblocked = function () { if (!done) { done = true; clearTimeout(t); resolve(null); } };
      } catch (e) { done = true; clearTimeout(t); resolve(null); }
    });
  }
  function fromLocal(id) {
    var out = {}, any = false;
    KEYS.forEach(function (k) { try { var v = localStorage.getItem(prefix(id) + k); if (v != null) { out[k] = JSON.parse(v); any = true; } } catch (e) { /* ignore */ } });
    return any ? out : null;
  }
  // Resolves { business, parties, products, invoices, meta } (missing keys left out).
  function readShop(id) {
    return openDb(id).then(function (db) {
      if (!db) return fromLocal(id) || {};
      return new Promise(function (resolve) {
        var out = {}, tx = db.transaction('kv', 'readonly'), st = tx.objectStore('kv');
        KEYS.forEach(function (k) { var g = st.get(k); g.onsuccess = function () { if (g.result !== undefined) out[k] = g.result; }; });
        tx.oncomplete = function () { db.close(); resolve(Object.keys(out).length ? out : fromLocal(id) || {}); };
        tx.onerror = tx.onabort = function () { db.close(); resolve(fromLocal(id) || {}); };
      });
    });
  }
  function writeShop(id, data) {
    var local = !!fromLocal(id);
    return openDb(id).then(function (db) {
      if (local || !db) KEYS.forEach(function (k) { if (data[k] !== undefined) { try { localStorage.setItem(prefix(id) + k, JSON.stringify(data[k])); } catch (e) { /* full */ } } });
      if (!db) return;
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('kv', 'readwrite'), st = tx.objectStore('kv');
        KEYS.forEach(function (k) { if (data[k] !== undefined) st.put(data[k], k); });
        tx.oncomplete = function () { db.close(); resolve(); };
        tx.onerror = tx.onabort = function () { db.close(); reject(tx.error || new Error('Could not save on this device.')); };
      });
    });
  }
  function dropShop(id) {
    KEYS.forEach(function (k) { try { localStorage.removeItem(prefix(id) + k); } catch (e) { /* ignore */ } });
    return new Promise(function (resolve) { try { var r = indexedDB.deleteDatabase(dbName(id)); r.onsuccess = r.onerror = r.onblocked = function () { resolve(); }; } catch (e) { resolve(); } });
  }
  function isEmpty(d) {
    if (!d) return true;
    var sample = d.meta && d.meta.sample;
    var b = d.business || {};
    return sample || (!(d.invoices || []).length && !(d.parties || []).length && !(d.products || []).length && !b.name && !b.gstin);
  }

  /* ---------------- the shop list ---------------- */
  // Name, GSTIN and bill count shown in the switcher (kept in the registry so it shows at once).
  function refreshInfo() {
    var r = registry();
    return Promise.all(r.list.map(function (s) {
      return readShop(s.id).then(function (d) {
        var b = d.business || {};
        s.name = b.name || ''; s.gstin = b.gstin || ''; s.state = b.stateCode || '';
        s.bills = (d.invoices || []).filter(function (i) { return i.docType !== 'estimate'; }).length;
        s.sample = !!(d.meta && d.meta.sample);
      });
    })).then(function () { saveRegistry(r); drawMounts(); return r; });
  }
  function label(s) { return s.name || (s.id === 'main' ? 'My shop' : 'New shop'); }
  function initials(s) {
    var w = label(s).replace(/[^A-Za-z0-9ऀ-ॿ ]/g, ' ').trim().split(/\s+/);
    return w.slice(0, 3).map(function (x) { return x[0] || ''; }).join('').toUpperCase() || '?';
  }
  function suggestPrefix(name) {
    var w = String(name || '').replace(/[^A-Za-z ]/g, ' ').trim().split(/\s+/).filter(Boolean);
    var p = w.length >= 2 ? w.slice(0, 3).map(function (x) { return x[0]; }).join('') : (w[0] || 'INV').slice(0, 3);
    return p.toUpperCase() || 'INV';
  }

  function switchTo(id, hash) {
    var go = function () {
      ls(ACTIVE, id);
      if (hash) location.hash = hash;
      location.reload();
    };
    // let cloud sync save the shop we are leaving first
    if (window.pbSyncFlush) Promise.race([window.pbSyncFlush(), new Promise(function (r) { setTimeout(r, 4000); })]).then(go, go);
    else go();
  }

  // Creates a shop and opens it on the Shop page. opts: { name, gstin, stateCode, copyItems, copyParties, copySettings }
  function addShop(opts) {
    var r = registry();
    if (r.list.length >= MAX) return Promise.reject(new Error('You can keep up to ' + MAX + ' shops.'));
    if (r.list.length >= 1 && window.pbGate && !window.pbGate('shops')) return Promise.resolve(false);
    var id = 's_' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6);
    return readShop(activeId()).then(function (cur) {
      var cb = cur.business || {};
      var b = {
        name: opts.name, gstin: (opts.gstin || '').toUpperCase(), stateCode: opts.stateCode || '', address: '', phone: '', email: '', logo: '', signature: '',
        bankName: '', accountName: '', accountNo: '', ifsc: '', upi: '', prefix: suggestPrefix(opts.name), estPrefix: 'EST',
        terms: 'Goods once sold will not be taken back.\nPayment due within 15 days.', composition: false, roundOff: true, inclusive: false, template: 'carbon', accent: cb.accent || '', showQr: true,
      };
      if (opts.copySettings) ['phone', 'email', 'logo', 'signature', 'bankName', 'accountName', 'accountNo', 'ifsc', 'upi', 'terms', 'composition', 'roundOff', 'inclusive', 'template', 'accent', 'showQr', 'estPrefix'].forEach(function (k) { if (cb[k] !== undefined) b[k] = cb[k]; });
      if (!b.accent) delete b.accent;
      var now = Date.now();
      var data = {
        business: b,
        parties: opts.copyParties ? (cur.parties || []).map(function (p) { return Object.assign({}, p, { updatedAt: now }); }) : [],
        products: opts.copyItems ? (cur.products || []).map(function (p) { return Object.assign({}, p, { updatedAt: now }); }) : [],
        invoices: [], meta: { lastBackup: '', sample: false, created: now },
      };
      return writeShop(id, data).then(function () {
        r.list.push({ id: id, color: COLORS[r.list.length % COLORS.length], at: now, name: b.name, gstin: b.gstin, state: b.stateCode, bills: 0 });
        saveRegistry(r);
        switchTo(id, '#/shop');
        return true;
      });
    });
  }
  function removeShop(id) {
    if (id === 'main' || id === activeId()) return Promise.reject(new Error('Switch to another shop before deleting this one.'));
    var r = registry();
    r.list = r.list.filter(function (s) { return s.id !== id; });
    saveRegistry(r);
    if (window.pbSyncForget) window.pbSyncForget(id);
    return dropShop(id).then(drawMounts);
  }

  /* ---------------- UI ---------------- */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) { var v = attrs[k]; if (v == null || v === false) continue; if (k === 'class') el.className = v; else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v); }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(function (x) { add(el, x); }); else el.append(c.nodeType ? c : document.createTextNode(String(c))); }
  function avatar(s, big) { return h('span', { class: 'pbs-av' + (big ? ' is-big' : ''), style: 'background:' + (s.color || COLORS[0]), 'aria-hidden': 'true' }, initials(s)); }
  function sub(s) { return [s.gstin || 'No GSTIN yet', STATES[s.state] || ''].filter(Boolean).join(' · '); }
  function toast(msg, bad) {
    var old = document.querySelector('.pbs-toast'); if (old) old.remove();
    var el = h('div', { class: 'pbs-toast' + (bad ? ' is-bad' : ''), role: 'status' }, msg);
    document.body.append(el); setTimeout(function () { el.remove(); }, 4000);
  }

  var mounts = { chip: [], card: [], page: [] };
  function drawMounts() {
    mounts.chip = mounts.chip.filter(function (el) { return el.isConnected; });
    mounts.card = mounts.card.filter(function (el) { return el.isConnected; });
    mounts.page = mounts.page.filter(function (el) { return el.isConnected; });
    mounts.chip.forEach(drawChip); mounts.card.forEach(drawCard); mounts.page.forEach(function (el) { if (el._pbsList) el._pbsList(); });
  }
  function current() { var id = activeId(); return registry().list.find(function (s) { return s.id === id; }); }

  // Top bar on phones: shows the open shop when there are two or more.
  function drawChip(el) {
    var r = registry(), s = current();
    el.replaceChildren();
    el.hidden = r.list.length < 2;
    if (el.hidden) return;
    el.append(h('button', { type: 'button', class: 'pbs-chip', 'aria-label': 'Shop: ' + label(s) + '. Switch shop', title: label(s), onclick: openSwitcher }, avatar(s), h('span', { class: 'pbs-chip__t' }, label(s)), h('span', { class: 'pbs-caret', 'aria-hidden': 'true' }, '▾')));
  }
  // Side menu on computers: always shows the open shop.
  function drawCard(el) {
    var r = registry(), s = current();
    el.replaceChildren(h('button', { type: 'button', class: 'pbs-card', onclick: openSwitcher, 'aria-label': 'Shop: ' + label(s) + '. Switch or add a shop' },
      avatar(s), h('span', { class: 'pbs-card__t' }, h('b', null, label(s)), h('span', null, r.list.length > 1 ? r.list.length + ' shops · switch' : (s.gstin || 'Add another GSTIN'))),
      h('span', { class: 'pbs-caret', 'aria-hidden': 'true' }, '▾')));
  }

  var sheet = null;
  function closeSwitcher() { if (sheet) { sheet.remove(); sheet = null; document.removeEventListener('keydown', onKey); } }
  function onKey(e) { if (e.key === 'Escape') closeSwitcher(); }
  function openSwitcher(noRefresh) {
    closeSwitcher();
    var r = registry(), act = activeId();
    var list = h('ul', { class: 'pbs-list' }, r.list.map(function (s) {
      var on = s.id === act;
      return h('li', null, h('button', { type: 'button', class: 'pbs-row' + (on ? ' is-on' : ''), 'aria-current': on ? 'true' : null, onclick: function () { if (on) { closeSwitcher(); return; } closeSwitcher(); toast('Opening ' + label(s) + '…'); switchTo(s.id, '#/'); } },
        avatar(s, true), h('span', { class: 'pbs-row__t' }, h('b', null, label(s)), h('span', null, sub(s))),
        on ? h('span', { class: 'pbs-tag' }, 'Open') : h('span', { class: 'pbs-go', 'aria-hidden': 'true' }, '›')));
    }));
    sheet = h('div', { class: 'pbs-back', onclick: function (e) { if (e.target === sheet) closeSwitcher(); } },
      h('div', { class: 'pbs-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pbs-h' },
        h('div', { class: 'pbs-head' }, h('h2', { id: 'pbs-h' }, 'Your shops'), h('button', { type: 'button', class: 'pbs-x', 'aria-label': 'Close', onclick: closeSwitcher }, '×')),
        h('p', { class: 'pbs-note' }, 'Each shop has its own GSTIN, bills, numbering and GST summary.'),
        list,
        h('div', { class: 'pbs-foot' },
          h('a', { class: 'pbs-btn', href: '#/shops?add=1', onclick: closeSwitcher }, '+ Add another shop (GSTIN)'),
          h('a', { class: 'pbs-link', href: '#/shops', onclick: closeSwitcher }, 'Manage shops and cloud backup'))));
    document.body.append(sheet);
    document.addEventListener('keydown', onKey);
    var first = sheet.querySelector('.pbs-row.is-on') || sheet.querySelector('.pbs-row'); if (first) first.focus();
    if (noRefresh !== true) refreshInfo().then(function () { if (sheet) openSwitcher(true); }).catch(function () {});
  }

  // #/shops: every shop, adding one, and the cloud backup card (from sync.js).
  function stateOptions(sel) {
    return [h('option', { value: '' }, 'Select state')].concat(Object.keys(STATES).map(function (c) { return h('option', { value: c, selected: c === sel }, c + ' ' + STATES[c]); }));
  }
  function drawPage(el, fresh) {
    var r = registry(), act = activeId(), q = (location.hash.split('?')[1] || '');
    var wantAdd = /(^|&)add=1/.test(q);
    var shops = shopCards(el);
    // redraws just the list, so a half-filled form is never lost
    el._pbsList = function () { var fresh2 = shopCards(el); shops.replaceWith(fresh2); shops = fresh2; };
    drawPageRest(el, shops, h('div'), r, wantAdd, fresh);
  }
  function shopCards(el) {
    var r = registry(), act = activeId();
    return h('ul', { class: 'pbs-cards' }, r.list.map(function (s) {
      var on = s.id === act;
      return h('li', { class: 'paper pbs-shop' + (on ? ' is-on' : '') },
        avatar(s, true),
        h('div', { class: 'pbs-shop__t' }, h('b', null, label(s)), h('span', null, sub(s)), h('span', { class: 'pbs-fine' }, (s.bills || 0) + ' bill' + (s.bills === 1 ? '' : 's') + (s.sample ? ' · sample data' : ''))),
        h('div', { class: 'pbs-shop__a' },
          on ? h('span', { class: 'pbs-tag' }, 'Open now') : h('button', { type: 'button', class: 'pbs-btn pbs-btn--sm', onclick: function () { switchTo(s.id, '#/'); } }, 'Open'),
          !on && s.id !== 'main' ? h('button', { type: 'button', class: 'pbs-link pbs-del', onclick: function () {
            var n = label(s);
            if (!confirm('Delete "' + n + '" and all its bills from this device' + (window.pbSyncOn && window.pbSyncOn() ? ' and from your cloud backup' : '') + '? This cannot be undone. Download a backup first if you need it.')) return;
            removeShop(s.id).then(function () { toast(n + ' deleted.'); drawPage(el, false); }).catch(function (e) { toast(e.message, true); });
          } }, 'Delete') : null));
    }));
  }
  function drawPageRest(el, shops, formBox, r, wantAdd, fresh) {
    function showForm() {
      var name = h('input', { class: 'pbs-in', id: 'pbs-name', maxlength: '80', placeholder: 'e.g. Rangrez Sarees', autocomplete: 'organization', required: true });
      var gstin = h('input', { class: 'pbs-in', id: 'pbs-gstin', maxlength: '15', placeholder: '15 characters (optional)', autocomplete: 'off', style: 'text-transform:uppercase' });
      var state = h('select', { class: 'pbs-in', id: 'pbs-state' }, stateOptions(current().state || ''));
      var copy = function (id, text, on) { return h('label', { class: 'pbs-check' }, h('input', { type: 'checkbox', id: id, checked: on }), h('span', null, text)); };
      var note = h('p', { class: 'pbs-err', role: 'alert' });
      var btn = h('button', { type: 'submit', class: 'pbs-btn' }, 'Create shop');
      gstin.addEventListener('input', function () { var c = gstin.value.slice(0, 2); if (STATES[c]) state.value = c; });
      var form = h('form', { class: 'paper pbs-form', novalidate: true },
        h('h2', { class: 'form-sec__title' }, 'Add another shop'),
        h('p', { class: 'pbs-fine' }, 'For a second GSTIN or a separate business. It gets its own bills, numbering and GST summary; switch any time from the shop button.'),
        h('div', { class: 'pbs-grid' },
          h('label', { class: 'pbs-f', for: 'pbs-name' }, 'Shop or business name', name),
          h('label', { class: 'pbs-f', for: 'pbs-gstin' }, 'GSTIN', gstin),
          h('label', { class: 'pbs-f', for: 'pbs-state' }, 'State', state)),
        h('div', { class: 'pbs-copy' }, h('b', null, 'Copy from ' + label(current()) + ':'),
          copy('pbs-ci', 'Items (products, HSN, GST)', true), copy('pbs-cp', 'Parties (buyers)', false), copy('pbs-cs', 'Bank, UPI, logo, design and terms', true)),
        note, h('div', { class: 'pbs-actions' }, btn, h('button', { type: 'button', class: 'pbs-link', onclick: function () { formBox.replaceChildren(); history.replaceState(null, '', '#/shops'); } }, 'Cancel')));
      form.addEventListener('submit', function (e) {
        e.preventDefault(); note.textContent = '';
        var g = gstin.value.trim().toUpperCase();
        if (name.value.trim().length < 2) { note.textContent = 'Enter the shop name.'; name.focus(); return; }
        if (g && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(g)) { note.textContent = 'That GSTIN does not look right (15 characters, like 24AAXFR4821K1ZO).'; gstin.focus(); return; }
        if (!state.value) { note.textContent = 'Pick the state of this GSTIN.'; state.focus(); return; }
        btn.disabled = true; btn.textContent = 'Creating…';
        addShop({ name: name.value.trim(), gstin: g, stateCode: state.value, copyItems: form.querySelector('#pbs-ci').checked, copyParties: form.querySelector('#pbs-cp').checked, copySettings: form.querySelector('#pbs-cs').checked })
          .then(function (ok) { if (!ok) { btn.disabled = false; btn.textContent = 'Create shop'; } })
          .catch(function (err) { note.textContent = err.message; btn.disabled = false; btn.textContent = 'Create shop'; });
      });
      formBox.replaceChildren(form);
      name.focus();
    }
    var cloud = h('div', { class: 'pbs-cloud' });
    el.replaceChildren(h('div', { class: 'pbs-page' },
      h('div', { class: 'page-head' }, h('div', null, h('h1', { class: 'page-title' }, 'Shops & cloud backup'),
        h('p', { class: 'page-sub' }, 'Keep several GSTINs in one app, and your bills safe on every device you log in on.'))),
      h('section', { class: 'pbs-sec' }, h('div', { class: 'pbs-sechead' }, h('h2', { class: 'form-sec__title' }, 'Your shops'),
        r.list.length < MAX ? h('button', { type: 'button', class: 'pbs-btn pbs-btn--sm', onclick: showForm }, '+ Add shop') : null), shops, formBox),
      cloud));
    if (window.pbSyncCard) window.pbSyncCard(cloud);
    if (wantAdd) showForm();
    if (fresh) refreshInfo().catch(function () {});
  }

  var CSS = '.pbs-av{flex:none;display:grid;place-items:center;width:30px;height:30px;border-radius:9px;color:#fff;font-weight:800;font-size:12.5px;letter-spacing:.02em}.pbs-av.is-big{width:42px;height:42px;border-radius:12px;font-size:15px}'
    + '.pbs-chip{display:inline-flex;align-items:center;gap:6px;height:38px;max-width:132px;padding:0 8px 0 4px;border-radius:999px;border:1.5px solid var(--rule);background:var(--paper);color:var(--ink);font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}.pbs-chip .pbs-av{width:28px;height:28px;border-radius:50%;font-size:11px}'
    + '.pbs-chip__t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.pbs-caret{color:var(--ink-3,var(--ink-2));font-size:11px}@media (width < 430px){.pbs-chip__t{display:none}.pbs-chip{padding:0 6px 0 4px}}'
    + '.pb-shopchip{display:contents}.pb-shopchip[hidden]{display:none}'
    + '.pbs-card{display:flex;align-items:center;gap:10px;width:100%;margin:0 0 12px;padding:9px 10px;border-radius:14px;border:1.5px solid var(--rule);background:var(--paper);color:var(--ink);font:inherit;text-align:left;cursor:pointer}.pbs-card:hover{border-color:var(--carbon)}'
    + '.pbs-card__t{display:grid;min-width:0;flex:1}.pbs-card__t b{font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pbs-card__t span{font-size:12px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.pbs-back{position:fixed;inset:0;z-index:1100;background:rgba(18,12,40,.45);display:flex;align-items:flex-end;justify-content:center}@media (width >= 640px){.pbs-back{align-items:center}}'
    + '.pbs-sheet{width:min(460px,100%);max-height:86vh;overflow:auto;background:var(--paper);color:var(--ink);border-radius:22px 22px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom,0px));box-shadow:0 -18px 50px -20px rgba(20,10,60,.55)}@media (width >= 640px){.pbs-sheet{border-radius:22px}}'
    + '.pbs-head{display:flex;justify-content:space-between;align-items:center}.pbs-head h2{margin:0;font-family:var(--font-display);font-size:26px;font-weight:600}.pbs-x{width:38px;height:38px;border-radius:50%;border:1.5px solid var(--rule);background:var(--paper);color:var(--ink-2);font-size:20px;cursor:pointer}'
    + '.pbs-note,.pbs-fine{font-size:13px;color:var(--ink-2);margin:4px 0 10px}.pbs-list{list-style:none;margin:0;padding:0;display:grid;gap:8px}'
    + '.pbs-row{display:flex;align-items:center;gap:12px;width:100%;padding:10px 12px;border-radius:14px;border:1.5px solid var(--rule);background:var(--paper);color:var(--ink);font:inherit;text-align:left;cursor:pointer}.pbs-row:hover,.pbs-row.is-on{border-color:var(--carbon)}.pbs-row.is-on{background:var(--carbon-tint)}'
    + '.pbs-row__t{display:grid;min-width:0;flex:1}.pbs-row__t b{font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pbs-row__t span{font-size:12.5px;color:var(--ink-2)}.pbs-go{font-size:22px;color:var(--carbon)}'
    + '.pbs-tag{flex:none;font-size:11.5px;font-weight:800;color:var(--carbon);background:var(--paper);border:1px solid var(--carbon);border-radius:999px;padding:2px 9px}'
    + '.pbs-foot{display:grid;gap:10px;margin-top:14px;justify-items:start}.pbs-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;border-radius:12px;padding:11px 16px;font:inherit;font-weight:700;font-size:15px;cursor:pointer;text-decoration:none;color:var(--btn-fg,#fff);background:var(--btn-bg,#6c4dff);background-image:var(--btn-grad,none)}.pbs-btn:disabled{opacity:.6;cursor:wait}.pbs-btn--sm{padding:8px 13px;font-size:14px}'
    + '.pbs-link{border:0;background:none;font:inherit;font-weight:700;font-size:14px;color:var(--carbon);cursor:pointer;text-decoration:none;padding:4px 0}.pbs-del{color:#c2410c}'
    + '.pbs-page{display:grid;gap:18px;max-width:760px}.pbs-sechead{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}.pbs-sechead .form-sec__title{margin:0}'
    + '.pbs-cards{list-style:none;margin:0;padding:0;display:grid;gap:10px}.pbs-shop{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:16px;border:1.5px solid transparent}.pbs-shop.is-on{border-color:var(--carbon)}'
    + '.pbs-shop__t{display:grid;min-width:0;flex:1}.pbs-shop__t b{font-size:16px}.pbs-shop__t span{font-size:13px;color:var(--ink-2)}.pbs-shop__t .pbs-fine{margin:0;font-size:12.5px}.pbs-shop__a{display:flex;flex-direction:column;align-items:flex-end;gap:4px}'
    + '.pbs-form{display:grid;gap:12px;padding:18px 20px;border-radius:16px;margin-top:12px}.pbs-form .form-sec__title{margin:0}.pbs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(220px,100%),1fr));gap:12px}'
    + '.pbs-f{display:grid;gap:5px;font-size:13px;font-weight:700;color:var(--ink-2)}.pbs-in{font:inherit;font-size:15px;font-weight:500;color:var(--ink);background:var(--paper);border:1.5px solid var(--rule);border-radius:10px;padding:10px 12px;min-height:44px}'
    + '.pbs-copy{display:grid;gap:6px;font-size:14px}.pbs-check{display:flex;gap:8px;align-items:center;font-size:14px;cursor:pointer}.pbs-check input{width:18px;height:18px;accent-color:var(--carbon)}'
    + '.pbs-err{color:#c2410c;font-size:13.5px;margin:0}.pbs-err:empty{display:none}.pbs-actions{display:flex;gap:14px;align-items:center;flex-wrap:wrap}'
    + '.pbs-toast{position:fixed;left:50%;bottom:calc(104px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:1300;max-width:calc(100% - 32px);background:#1d1838;color:#fff;padding:11px 18px;border-radius:12px;font-weight:600}.pbs-toast.is-bad{background:#8a1c24}@media (width >= 1024px){.pbs-toast{bottom:28px}}';
  function css() { if (!document.getElementById('pbs-css')) { var s = document.createElement('style'); s.id = 'pbs-css'; s.textContent = CSS; (document.head || document.documentElement).append(s); } }

  window.pbShopChip = function (el) { if (!el || mounts.chip.indexOf(el) >= 0) return; css(); mounts.chip.push(el); drawChip(el); };
  window.pbShopCard = function (el) { if (!el || mounts.card.indexOf(el) >= 0) return; css(); mounts.card.push(el); drawCard(el); };
  window.pbShopsMount = function (el) {
    if (!el) return; css();
    if (el._pbsHash === location.hash) return;
    el._pbsHash = location.hash;
    if (mounts.page.indexOf(el) < 0) mounts.page.push(el);
    drawPage(el, true);
  };
  window.addEventListener('hashchange', function () { mounts.page.forEach(function (el) { if (el.isConnected && /^#\/shops/.test(location.hash) && el._pbsHash !== location.hash) { el._pbsHash = location.hash; drawPage(el, false); } }); });
  // For cloud sync (sync.js) and the Help assistant.
  window.pbShops = {
    KEYS: KEYS, list: function () { return registry().list.slice(); }, active: activeId, read: readShop, write: writeShop, drop: dropShop, isEmpty: isEmpty,
    register: function (s) { var r = registry(); if (!r.list.some(function (x) { return x.id === s.id; })) { r.list.push(Object.assign({ color: COLORS[r.list.length % COLORS.length], at: Date.now() }, s)); saveRegistry(r); drawMounts(); } },
    refresh: refreshInfo, switchTo: switchTo, open: openSwitcher, label: function (id) { var s = registry().list.find(function (x) { return x.id === id; }); return s ? label(s) : ''; },
  };
  // keep names fresh after the app starts
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { refreshInfo().catch(function () {}); }, 1500); });
  else setTimeout(function () { refreshInfo().catch(function () {}); }, 1500);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshInfo().catch(function () {}); });
})();
