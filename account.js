// PakkaBill "My account" page (#/account): everything about the customer in one place.
// Their login and plan, every shop with its bills, sales, parties and items, cloud backup,
// payments, support tickets and this device, plus a download of all their data.
// The app calls window.pbAccountMount(el).
(function () {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function ls(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function acct() { var a = ls('pb-acct'); return a && a.token && a.user ? a : null; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rupees(n) { return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN'); }
  function num(n) { return Number(n || 0).toLocaleString('en-IN'); }
  function day(t) { if (!t) return ''; var d = new Date(t); return isNaN(d) ? '' : d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function ymd(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? +m[3] + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1] : ''; }
  function size(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function api(path, body) {
    var a = acct(), headers = { 'Content-Type': 'application/json' };
    if (a) headers.Authorization = 'Bearer ' + a.token;
    return fetch('/api/' + path, { method: body ? 'POST' : 'GET', headers: headers, cache: 'no-store', body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Could not load'); return j; }); });
  }

  /* ---------------- the numbers from each shop's bills ---------------- */
  function isBill(i) { return i && i.docType === 'invoice' && i.status !== 'cancelled'; }
  function billTotal(i) { var t = i.totals || {}; return Number(t.total != null ? t.total : t.grandTotal) || 0; }
  function stats(d) {
    var month = new Date().toISOString().slice(0, 7), bills = (d.invoices || []).filter(isBill);
    var s = { bills: bills.length, sales: 0, monthBills: 0, monthSales: 0, last: '', parties: (d.parties || []).length, items: (d.products || []).length, estimates: (d.invoices || []).filter(function (i) { return i && i.docType === 'estimate'; }).length };
    bills.forEach(function (i) {
      var t = billTotal(i); s.sales += t;
      if (String(i.date || '').slice(0, 7) === month) { s.monthBills++; s.monthSales += t; }
      if (i.date && i.date > s.last) s.last = i.date;
    });
    return s;
  }

  /* ---------------- drawing ---------------- */
  var CSS = '.pba{display:grid;gap:14px;max-width:980px}' +
    '.pba-card{background:var(--paper,#fff);border:1px solid var(--rule,#e2daf2);border-radius:14px;padding:16px}' +
    '.pba-card h2{margin:0 0 12px;font-size:1.05rem}' +
    '.pba-me{display:flex;gap:14px;align-items:center;flex-wrap:wrap}' +
    '.pba-av{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:1.2rem;color:#fff;background:linear-gradient(135deg,#5b3fe6,#ff7a59);flex:none}' +
    '.pba-me .pba-who{flex:1;min-width:180px}.pba-who b{display:block;font-size:1.15rem}.pba-who span{display:block;color:var(--ink-3,#736e8d);font-size:.88rem}' +
    '.pba-pill{display:inline-block;padding:3px 10px;border-radius:99px;font-size:.8rem;font-weight:700;margin-top:6px}' +
    '.pba-pill.is-pro{background:#e6f6ee;color:#12714b}.pba-pill.is-trial{background:#ece6ff;color:#5b3fe6}.pba-pill.is-free{background:#f1eff7;color:#5c5776}.pba-pill.is-soon{background:#fff4df;color:#9a5a00}' +
    '.pba-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}' +
    '.pba-btn{border:1px solid var(--rule,#e2daf2);background:transparent;color:inherit;border-radius:10px;padding:8px 14px;font:inherit;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block}' +
    '.pba-btn.pri{background:var(--carbon,#5b3fe6);border-color:var(--carbon,#5b3fe6);color:#fff}' +
    '.pba-tiles{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}@media(min-width:700px){.pba-tiles{grid-template-columns:repeat(3,1fr)}}' +
    '.pba-tile{border:1px solid var(--rule,#e2daf2);border-radius:12px;padding:10px 12px;min-width:0}.pba-tile small{display:block;color:var(--ink-3,#736e8d);font-size:.8rem;font-weight:600}.pba-tile b{display:block;font-size:1.35rem;margin-top:2px;overflow-wrap:anywhere}.pba-tile span{display:block;font-size:.78rem;color:var(--ink-3,#736e8d)}' +
    '.pba-list{list-style:none;margin:0;padding:0}.pba-list li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--rule,#e2daf2)}.pba-list li:first-child{border-top:0}' +
    '.pba-list .pba-l{min-width:0}.pba-list .pba-l b{display:block;overflow-wrap:anywhere}.pba-list .pba-l span{display:block;font-size:.82rem;color:var(--ink-3,#736e8d)}.pba-list .pba-r{text-align:right;flex:none;font-size:.88rem}' +
    '.pba-shop{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px;font-size:.82rem}.pba-shop div{background:var(--desk-2,#f6f3fd);border-radius:8px;padding:6px 8px;min-width:0}.pba-shop b{display:block;font-size:.95rem}' +
    '.pba-shopc{border:1px solid var(--rule,#e2daf2);border-radius:12px;padding:12px;margin-top:10px}.pba-shopc:first-of-type{margin-top:0}.pba-shopc.is-on{border-color:var(--carbon,#5b3fe6)}.pba-shopc header{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}' +
    '.pba-tag{font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:99px;background:#ece6ff;color:#5b3fe6;white-space:nowrap}' +
    '.pba-st{font-weight:700;font-size:.8rem}.pba-st.ok{color:#12714b}.pba-st.wait{color:#9a5a00}.pba-st.bad{color:#c8202a}' +
    '.pba-muted{color:var(--ink-3,#736e8d);font-size:.88rem;margin:0}' +
    '.pba-kv{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:.9rem;margin:0}.pba-kv dt{color:var(--ink-3,#736e8d)}.pba-kv dd{margin:0;text-align:right;overflow-wrap:anywhere}' +
    '.pba-who .pba-pill{display:inline-block}.pba-shopc header .pba-l{min-width:0}.pba-shopc .pba-l b{display:block;font-size:1rem;overflow-wrap:anywhere}.pba-shopc .pba-l span{display:block}.pba-shopc header>div:last-child{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;flex:none}' +
    '.pba-danger{border-color:#f3c4c7}.pba-danger summary{cursor:pointer;font-weight:700;color:#c8202a}.pba-lbl{display:block;font-size:.85rem;font-weight:600;margin:6px 0}' +
    '.pba-in{display:block;width:100%;max-width:320px;margin-top:4px;padding:9px 11px;border:1px solid var(--rule,#e2daf2);border-radius:10px;font:inherit;background:transparent;color:inherit}' +
    '.pba-chk{display:flex;gap:8px;align-items:center;font-size:.88rem;margin:10px 0}.pba-err{color:#c8202a;font-weight:600;margin:8px 0 0}.pba-ok{color:#12714b;font-weight:600;margin:8px 0 0}.pba-legal{display:flex;flex-wrap:wrap;gap:8px 16px}.pba-legal a{font-weight:600}' +
    '.pba-btn-danger{background:#c8202a;border-color:#c8202a;color:#fff}.pba-btn[disabled]{opacity:.6;cursor:wait}' +
    '@media(max-width:420px){.pba-shop{grid-template-columns:repeat(2,1fr)}}';
  function css() {
    if (document.getElementById('pba-css')) return;
    var s = document.createElement('style'); s.id = 'pba-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  function planPill(u) {
    if (!u) return '';
    var left = Math.ceil(((u.paidUntil || 0) - Date.now()) / 86400000);
    if (u.phone === 'owner') return '<span class="pba-pill is-pro">Owner</span>';
    if (left > 0 && u.lastPlan === 'trial') return '<span class="pba-pill ' + (left <= 3 ? 'is-soon' : 'is-trial') + '">Free Pro trial · ' + left + ' day' + (left === 1 ? '' : 's') + ' left</span>';
    if (left > 0) return '<span class="pba-pill ' + (left <= 5 ? 'is-soon' : 'is-pro') + '">Pro till ' + day(u.paidUntil) + '</span>';
    if (u.paidUntil) return '<span class="pba-pill is-free">Free plan · Pro ended ' + day(u.paidUntil) + '</span>';
    return '<span class="pba-pill is-free">Free plan</span>';
  }

  function profileHtml(a, main) {
    var b = (main && main.business) || {};
    if (!a) {
      return '<section class="pba-card"><div class="pba-me"><div class="pba-av">?</div><div class="pba-who"><b>' + esc(b.name || 'Not logged in') + '</b>' +
        '<span>Your bills are saved only on this device. Log in to back them up and open them on any phone or computer.</span></div></div>' +
        '<div class="pba-btns"><a class="pba-btn pri" href="#/plan">Log in or create account</a></div></section>';
    }
    var u = a.user, name = u.shopName || b.name || 'My account';
    var ini = name.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0] || ''; }).join('').toUpperCase() || 'PB';
    var rows = [['Mobile number', u.phone === 'owner' ? 'Owner' : '+91 ' + u.phone]];
    if (u.createdAt) rows.push(['Member since', day(u.createdAt)]);
    if (b.gstin) rows.push(['GSTIN', b.gstin]);
    if (b.phone && b.phone !== u.phone) rows.push(['Shop phone', b.phone]);
    if (b.email) rows.push(['Email', b.email]);
    var addr = [b.address, b.city, b.pincode].filter(Boolean).join(', ');
    if (addr) rows.push(['Address', addr]);
    return '<section class="pba-card"><div class="pba-me"><div class="pba-av">' + esc(ini) + '</div><div class="pba-who"><b>' + esc(name) + '</b>' + planPill(u) + '</div></div>' +
      '<dl class="pba-kv" style="margin-top:14px">' + rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl>' +
      '<div class="pba-btns"><a class="pba-btn pri" href="#/plan">Plan and payments</a><a class="pba-btn" href="#/shop">Edit shop details</a><button type="button" class="pba-btn" data-pba="logout">Log out</button></div></section>';
  }

  function totalsHtml(shops) {
    var t = { bills: 0, sales: 0, monthBills: 0, monthSales: 0, parties: 0, items: 0 };
    shops.forEach(function (s) { for (var k in t) t[k] += s.st[k]; });
    var now = new Date(), mname = MONTHS[now.getMonth()] + ' ' + now.getFullYear();
    return '<section class="pba-card"><h2>My business at a glance' + (shops.length > 1 ? ' (all ' + shops.length + ' shops)' : '') + '</h2><div class="pba-tiles">' +
      '<div class="pba-tile"><small>Total sales</small><b>' + rupees(t.sales) + '</b><span>' + num(t.bills) + ' bills</span></div>' +
      '<div class="pba-tile"><small>This month</small><b>' + rupees(t.monthSales) + '</b><span>' + num(t.monthBills) + ' bills in ' + mname + '</span></div>' +
      '<div class="pba-tile"><small>Average bill</small><b>' + rupees(t.bills ? t.sales / t.bills : 0) + '</b><span>per bill</span></div>' +
      '<div class="pba-tile"><small>Parties</small><b>' + num(t.parties) + '</b><span>customers and suppliers</span></div>' +
      '<div class="pba-tile"><small>Items</small><b>' + num(t.items) + '</b><span>products saved</span></div>' +
      '<div class="pba-tile"><small>Shops</small><b>' + shops.length + '</b><span>' + (shops.length === 1 ? 'one GSTIN' : 'GSTINs in this app') + '</span></div>' +
      '</div></section>';
  }

  function shopsHtml(shops, active) {
    return '<section class="pba-card"><h2>My shops</h2>' + shops.map(function (s) {
      var on = s.id === active, st = s.st;
      return '<div class="pba-shopc' + (on ? ' is-on' : '') + '"><header><div class="pba-l"><b>' + esc(s.name) + '</b><span class="pba-muted">' + esc(s.gstin || 'No GSTIN yet') + (st.last ? ' · last bill ' + ymd(st.last) : '') + '</span></div>' +
        '<div>' + (s.sample ? '<span class="pba-tag">Sample data</span>' : '') + (on ? '<span class="pba-tag">Open now</span>' : '<button type="button" class="pba-btn" data-pba="switch" data-id="' + esc(s.id) + '">Open</button>') + '</div></header>' +
        '<div class="pba-shop"><div>Bills<b>' + num(st.bills) + '</b></div><div>Sales<b>' + rupees(st.sales) + '</b></div><div>Parties<b>' + num(st.parties) + '</b></div><div>Items<b>' + num(st.items) + '</b></div></div></div>';
    }).join('') + '<div class="pba-btns"><a class="pba-btn" href="#/shops">Add or manage shops</a></div></section>';
  }

  function payHtml(p) {
    if (!p) return '<section class="pba-card"><h2>My payments</h2><p class="pba-muted">Loading…</p></section>';
    if (p.error) return ''; // payments not switched on, or offline
    var L = { PENDING: ['Waiting for check', 'wait'], COMPLETED: ['Confirmed', 'ok'], REJECTED: ['Not found', 'bad'] };
    var list = p.orders || [];
    return '<section class="pba-card"><h2>My payments</h2>' + (list.length ? '<ul class="pba-list">' + list.map(function (o) {
      var l = L[o.state] || [o.state, ''];
      return '<li><div class="pba-l"><b>' + rupees((o.amount || 0) / 100) + ' · ' + (o.plan === 'yearly' ? 'Yearly' : 'Monthly') + ' plan</b><span>' + (o.createdAt ? day(o.createdAt) + ' · ' : '') + 'UTR ' + esc(o.utr || '') + '</span></div><div class="pba-r"><span class="pba-st ' + l[1] + '">' + esc(l[0]) + '</span></div></li>';
    }).join('') + '</ul>' : '<p class="pba-muted">No payments yet.</p>') + '</section>';
  }

  function ticketsHtml(t) {
    if (!t) return '<section class="pba-card"><h2>My help requests</h2><p class="pba-muted">Loading…</p></section>';
    var list = t.tickets || [];
    var L = { open: ['Open', 'wait'], progress: ['We are on it', 'wait'], waiting: ['Waiting for you', 'wait'], resolved: ['Solved', 'ok'], closed: ['Closed', 'ok'] };
    return '<section class="pba-card"><h2>My help requests</h2>' + (t.error ? '<p class="pba-muted">' + esc(t.error) + '</p>' : list.length ? '<ul class="pba-list">' + list.slice(0, 8).map(function (x) {
      var l = L[x.status] || [x.status || '', 'wait'];
      return '<li><div class="pba-l"><b>' + esc(x.subject || 'Help') + '</b><span>' + esc(x.no || '') + (x.updatedAt ? ' · ' + day(x.updatedAt) : '') + (x.unread ? ' · new reply' : '') + '</span></div><div class="pba-r"><a class="pba-st ' + l[1] + '" href="#/support">' + esc(l[0]) + '</a></div></li>';
    }).join('') + '</ul>' : '<p class="pba-muted">No help requests. Tap Help any time you are stuck.</p>') +
      '<div class="pba-btns"><a class="pba-btn" href="#/support">Open Help</a></div></section>';
  }

  function deviceHtml(dev) {
    var rows = [['App version', dev.version || '…'], ['Saved on this device', dev.used == null ? '…' : size(dev.used)], ['Phone notifications', dev.push], ['Internet', navigator.onLine ? 'Online' : 'Offline']];
    return '<section class="pba-card"><h2>This device</h2><dl class="pba-kv">' + rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl>' +
      '<div class="pba-btns"><button type="button" class="pba-btn pri" data-pba="download">Download all my data</button>' +
      (window.PakkaBillApp ? '<button type="button" class="pba-btn" data-pba="appsettings">\u2699\ufe0f App settings</button>' : window.pbInApp && window.pbInApp() ? '' : '<a class="pba-btn" href="#/app">\ud83d\udcf2 Get the app</a>') + '</div>' +
      '<p class="pba-muted" style="margin-top:8px">One file with every shop’s bills, parties, items and settings. Keep it as your own backup.</p></section>';
  }

  function securityHtml(st) {
    var d = st.pw || {};
    return '<section class="pba-card"><details' + (d.open ? ' open' : '') + ' data-pba-pwdetails><summary><b>Change password</b></summary>' +
      '<p class="pba-muted" style="margin:10px 0">After you change it, PakkaBill logs out on every other phone and computer. This one stays logged in.</p>' +
      (acct() && acct().user.tempPw ? '<p class="pba-ok" style="margin:0 0 8px">You are using a temporary password from PakkaBill support. Type it as the current password, then choose your own.</p>' : '') +
      '<label class="pba-lbl">Current password<input type="password" class="pba-in" data-pba-pwold autocomplete="current-password" value="' + esc(d.old || '') + '"></label>' +
      '<label class="pba-lbl">New password (6 or more characters)<input type="password" class="pba-in" data-pba-pwnew autocomplete="new-password" value="' + esc(d.nw || '') + '"></label>' +
      (d.err ? '<p class="pba-err">' + esc(d.err) + '</p>' : '') + (d.ok ? '<p class="pba-ok">\u2713 Password changed.</p>' : '') +
      '<div class="pba-btns"><button type="button" class="pba-btn pri" data-pba="password"' + (d.busy ? ' disabled' : '') + '>' + (d.busy ? 'Saving\u2026' : 'Change password') + '</button></div></details></section>';
  }

  function legalHtml() {
    var L = [['About PakkaBill', '/about'], ['Terms & conditions', '/terms'], ['Privacy policy', '/privacy'], ['Refund & cancellation', '/refund'], ['Contact us', '/contact']];
    return '<section class="pba-card"><h2>About &amp; legal</h2><div class="pba-legal">' + L.map(function (l) { return '<a href="' + l[1] + '" target="_blank" rel="noopener">' + l[0] + '</a>'; }).join('') + '</div></section>';
  }

  // Google Play asks every app with sign-up to let people delete their account from inside the app.
  function deleteHtml(st) {
    var d = st.del || {};
    return '<section class="pba-card pba-danger" id="pba-delete"><details' + (d.open ? ' open' : '') + ' data-pba-deldetails><summary>Delete my account</summary>' +
      '<p class="pba-muted" style="margin:10px 0">This removes your PakkaBill login, your plan and every shop saved in the cloud backup, for good. It cannot be undone. ' +
      'Payment records are kept for as long as tax law needs them. If you have Pro time left, it is lost.</p>' +
      '<label class="pba-lbl">Your password<input type="password" class="pba-in" data-pba-delpw autocomplete="current-password" value="' + esc(d.pw || '') + '"></label>' +
      '<label class="pba-chk"><input type="checkbox" data-pba-delwipe' + (d.wipe ? ' checked' : '') + '> Also delete the bills saved on this device</label>' +
      (d.err ? '<p class="pba-err">' + esc(d.err) + '</p>' : '') +
      '<div class="pba-btns"><button type="button" class="pba-btn pba-btn-danger" data-pba="delete"' + (d.busy ? ' disabled' : '') + '>' + (d.busy ? 'Deleting\u2026' : 'Delete my account permanently') + '</button></div>' +
      '<p class="pba-muted" style="margin-top:8px">Forgot your password? <a href="#/support?new=1">Ask us</a> and we will delete it for you.</p></details></section>';
  }

  /* ---------------- the page ---------------- */
  var mounts = [];
  function load(el) {
    var st = el._pba = { shops: null, pay: null, tickets: null, dev: { push: pushState() } };
    var a = acct(), P = window.pbShops;
    var list = P ? P.list() : [{ id: 'main', name: '' }], active = P ? P.active() : 'main';
    Promise.all(list.map(function (s) {
      return (P ? P.read(s.id) : Promise.resolve({})).then(function (d) {
        var b = d.business || {};
        return { id: s.id, name: b.name || (P ? P.label(s) : 'My shop'), gstin: b.gstin || '', sample: !!(d.meta && d.meta.sample), data: d, st: stats(d) };
      });
    })).then(function (shops) { st.shops = shops; st.active = active; draw(el); });
    if (a) {
      api('pay').then(function (j) { st.pay = j; }).catch(function (e) { st.pay = { error: e.message }; }).then(function () { draw(el); });
      api('support', { action: 'list', guests: ls('pb-support-guest') || [] }).then(function (j) { st.tickets = j; }).catch(function (e) { st.tickets = { error: e.message }; }).then(function () { draw(el); });
    }
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) { st.dev.used = e.usage || 0; draw(el); }).catch(function () {});
    else st.dev.used = 0;
    if (window.caches && caches.keys) caches.keys().then(function (k) { var v = k.filter(function (x) { return /^pakkabill-v\d+/.test(x); }).sort().pop(); st.dev.version = v ? v.replace('pakkabill-', '') : 'Latest'; draw(el); }).catch(function () {});
    else st.dev.version = 'Latest';
    draw(el);
  }
  function pushState() {
    if (!('Notification' in window)) return 'Not supported here';
    return Notification.permission === 'granted' ? 'On' : Notification.permission === 'denied' ? 'Blocked' : 'Off';
  }
  function draw(el) {
    var st = el._pba, a = acct();
    if (!st) return;
    var pwIn = el.querySelector('[data-pba-delpw]'), wipeIn = el.querySelector('[data-pba-delwipe]'), det = el.querySelector('[data-pba-deldetails]');
    var po = el.querySelector('[data-pba-pwold]'), pn = el.querySelector('[data-pba-pwnew]'), pd = el.querySelector('[data-pba-pwdetails]');
    if (po) st.pw = Object.assign(st.pw || {}, { old: po.value, nw: pn.value, open: pd.open });
    if (pwIn || det) st.del = Object.assign(st.del || {}, { pw: pwIn ? pwIn.value : '', wipe: wipeIn ? wipeIn.checked : false, open: det ? det.open : false });
    if (!st.pwAsked && /[?&]pw=1/.test(location.hash) && a) { st.pwAsked = true; st.pw = Object.assign(st.pw || {}, { open: true }); st.scrollPw = true; }
    if (!st.delAsked && /[?&]delete=1/.test(location.hash) && a) { st.delAsked = true; st.del = Object.assign(st.del || {}, { open: true }); st.scrollDel = true; }
    var main = st.shops && st.shops.filter(function (s) { return s.id === st.active; })[0];
    var h = '<div class="page-head"><div><h1 class="page-title">My account</h1><p class="page-sub">Your login, plan, shops, bills, payments and help requests in one place.</p></div></div><div class="pba">';
    h += profileHtml(a, main && main.data);
    if (!st.shops) h += '<section class="pba-card"><p class="pba-muted">Reading your shops…</p></section>';
    else { h += totalsHtml(st.shops); h += shopsHtml(st.shops, st.active); }
    if (a) {
      h += '<section class="pba-card"><h2>Cloud backup</h2><div data-pba-sync></div></section>';
      h += payHtml(st.pay);
      h += ticketsHtml(st.tickets);
    }
    h += deviceHtml(st.dev);
    if (a && a.user.phone !== 'owner') h += securityHtml(st);
    h += legalHtml();
    if (a && a.user.phone !== 'owner') h += deleteHtml(st);
    h += '</div>';
    var keepSync = el.querySelector('[data-pba-sync]');
    el.innerHTML = h;
    var slot = el.querySelector('[data-pba-sync]');
    if (slot) {
      if (keepSync && keepSync.firstChild) { while (keepSync.firstChild) slot.appendChild(keepSync.firstChild); }
      else if (window.pbSyncCard) window.pbSyncCard(slot);
      else slot.innerHTML = '<a class="pba-btn" href="#/shops">Open cloud backup</a>';
    }
    if (st.scrollPw) { st.scrollPw = false; var pbx = el.querySelector('[data-pba-pwdetails]'); if (pbx) setTimeout(function () { pbx.scrollIntoView({ behavior: 'smooth', block: 'center' }); var i = pbx.querySelector('[data-pba-pwold]'); if (i) i.focus(); }, 200); }
    if (st.scrollDel) { st.scrollDel = false; var box = el.querySelector('#pba-delete'); if (box) setTimeout(function () { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 200); }
  }
  function deleteAccount(el) {
    var st = el._pba, pw = (el.querySelector('[data-pba-delpw]') || {}).value || '', wipe = !!(el.querySelector('[data-pba-delwipe]') || {}).checked;
    st.del = { open: true, pw: pw, wipe: wipe };
    if (!pw) { st.del.err = 'Type your password to confirm.'; draw(el); return; }
    if (!confirm('Delete your PakkaBill account and cloud backups for good? This cannot be undone.')) return;
    st.del.busy = true; draw(el);
    api('auth', { action: 'delete', password: pw }).then(function () {
      ['pb-acct', 'pb-sync'].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } });
      var P = window.pbShops, wipeAll = wipe && P ? Promise.all(P.list().map(function (s) { return P.drop(s.id); })).then(function () {
        ['pb-shops', 'pb-shop'].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } });
      }) : Promise.resolve();
      return wipeAll.then(function () {
        try { window.dispatchEvent(new Event('pb-account')); } catch (e) { /* ignore */ }
        alert('Your PakkaBill account has been deleted.' + (wipe ? ' The bills on this device were removed too.' : ' Bills saved on this device are still here.'));
        location.hash = '#/bills'; location.reload();
      });
    }).catch(function (e) { st.del = { open: true, pw: '', wipe: wipe, err: e.message || 'Could not delete the account. Try again.' }; draw(el); });
  }
  function changePassword(el) {
    var st = el._pba, old = (el.querySelector('[data-pba-pwold]') || {}).value || '', nw = (el.querySelector('[data-pba-pwnew]') || {}).value || '';
    st.pw = { open: true, old: old, nw: nw };
    if (!old || nw.length < 6) { st.pw.err = !old ? 'Type your current password.' : 'The new password needs 6 or more characters.'; draw(el); return; }
    st.pw.busy = true; draw(el);
    api('auth', { action: 'password', password: old, newPassword: nw }).then(function (j) {
      var a = acct();
      if (a) { a.token = j.token; a.user = j.user || a.user; try { localStorage.setItem('pb-acct', JSON.stringify(a)); } catch (e) { /* ignore */ } }
      st.pw = { open: true, ok: true }; draw(el);
    }).catch(function (e) { st.pw = { open: true, old: '', nw: nw, err: e.message || 'Could not change the password.' }; draw(el); });
  }
  function download(el) {
    var st = el._pba;
    if (!st || !st.shops) return;
    var a = acct(), out = { app: 'PakkaBill', exportedAt: new Date().toISOString(), account: a ? { phone: a.user.phone, shopName: a.user.shopName || '', plan: a.user.lastPlan || '', paidUntil: a.user.paidUntil || 0 } : null, shops: {} };
    st.shops.forEach(function (s) { out.shops[s.id] = s.data; });
    var blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' });
    var url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'PakkaBill-my-data-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function wire(el) {
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-pba]');
      if (!b) return;
      var act = b.getAttribute('data-pba');
      if (act === 'download') download(el);
      else if (act === 'delete') deleteAccount(el);
      else if (act === 'password') changePassword(el);
      else if (act === 'appsettings' && window.PakkaBillApp) window.PakkaBillApp.settings();
      else if (act === 'switch' && window.pbShops) window.pbShops.switchTo(b.getAttribute('data-id'), '#/account');
      else if (act === 'logout') {
        if (!confirm('Log out of PakkaBill on this device? Your bills stay on this device.')) return;
        api('auth', { action: 'logout' }).catch(function () {}).then(function () {
          try { localStorage.removeItem('pb-acct'); } catch (e) { /* ignore */ }
          try { window.dispatchEvent(new Event('pb-account')); } catch (e) { /* ignore */ }
          location.hash = '#/plan'; location.reload();
        });
      }
    });
  }

  window.pbAccountMount = function (el) {
    css();
    if (el._pbaWired) return;
    el._pbaWired = true; wire(el); mounts.push(el);
    load(el);
  };
  window.addEventListener('pb-account', function () { mounts.forEach(function (el) { if (el.isConnected) load(el); }); });
})();

// PakkaBill "Get the app" page (#/app): download the Android app, install from the browser, or
// add it to an iPhone home screen. Also a small one-time "Get the app" nudge on Android phones.
(function () {
  'use strict';
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; redraw(); });
  window.addEventListener('appinstalled', function () { deferred = null; try { localStorage.setItem('pb-app-installed', '1'); } catch (e) { /* ignore */ } redraw(); });

  // opened from the Android app (its start address carries ?source=android)
  try {
    if (/[?&]source=android\b/.test(location.search) || /^android-app:\/\/com\.pakkabill\.app/.test(document.referrer)) sessionStorage.setItem('pb-in-app', '1');
  } catch (e) { /* ignore */ }
  function inApp() {
    if (window.PakkaBillApp || /PakkaBillApp\//.test(navigator.userAgent)) return true;
    try { return sessionStorage.getItem('pb-in-app') === '1'; } catch (e) { return false; }
  }
  function standalone() { return inApp() || (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  var ua = navigator.userAgent || '';
  var android = /Android/i.test(ua), ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);

  var CSS = '.pbg{display:grid;gap:14px;max-width:760px}' +
    '.pbg-card{background:var(--paper,#fff);border:1px solid var(--rule,#e2daf2);border-radius:14px;padding:16px}' +
    '.pbg-card h2{margin:0 0 6px;font-size:1.1rem;display:flex;gap:8px;align-items:center}.pbg-card p{margin:0 0 10px;color:var(--ink-2,#5c5776)}' +
    '.pbg-hero{display:flex;gap:16px;align-items:center;flex-wrap:wrap;background:linear-gradient(135deg,#5b3fe6,#ff7a59);color:#fff;border:0}' +
    '.pbg-hero img{width:72px;height:72px;border-radius:18px;background:#fff;flex:none}.pbg-hero h2{color:#fff;font-size:1.3rem}.pbg-hero p{color:#fff;opacity:.92;margin:0}' +
    '.pbg-btn{display:inline-flex;align-items:center;gap:8px;border-radius:12px;padding:12px 18px;font:inherit;font-weight:700;cursor:pointer;text-decoration:none;border:1px solid var(--rule,#e2daf2);background:transparent;color:inherit}' +
    '.pbg-btn.pri{background:var(--carbon,#5b3fe6);border-color:var(--carbon,#5b3fe6);color:#fff}' +
    '.pbg-steps{margin:8px 0 0;padding-left:20px;color:var(--ink-2,#5c5776);font-size:.92rem}.pbg-steps li{margin:4px 0}' +
    '.pbg-meta{font-size:.82rem;color:var(--ink-3,#736e8d);margin-top:8px}.pbg-ok{background:#e6f6ee;color:#12714b;border-radius:10px;padding:10px 12px;font-weight:600}' +
    '.pbg-nudge{position:fixed;left:12px;right:12px;bottom:calc(76px + env(safe-area-inset-bottom));z-index:60;display:flex;gap:10px;align-items:center;background:#1b1631;color:#fff;border-radius:14px;padding:10px 12px;box-shadow:0 8px 30px rgba(0,0,0,.25);max-width:460px;margin:0 auto}' +
    '.pbg-nudge a{color:#fff;font-weight:700;flex:1;text-decoration:none}.pbg-nudge button{background:transparent;border:0;color:#fff;font-size:1.3rem;cursor:pointer;padding:0 4px}';
  function css() { if (document.getElementById('pbg-css')) return; var s = document.createElement('style'); s.id = 'pbg-css'; s.textContent = CSS; document.head.appendChild(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var info = null;
  function loadInfo() {
    fetch('/download/app.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { info = j || {}; redraw(); }).catch(function () { info = {}; redraw(); });
  }

  var mounts = [];
  function draw(el) {
    var apk = info && info.apk;
    var h = '<div class="page-head"><div><h1 class="page-title">Get the app</h1><p class="page-sub">PakkaBill on your phone’s home screen, full screen, with your bills always there.</p></div></div><div class="pbg">';
    h += '<section class="pbg-card pbg-hero"><img src="icon-192.png" alt=""><div><h2>PakkaBill app</h2><p>The Meesho P&amp;L as a real Android app: same calculations, same screens, English and हिंदी. Your Meesho files are read on the phone. Same login as the website.</p></div></section>';
    if (standalone()) h += '<div class="pbg-ok">✅ You are using the PakkaBill app. Nothing more to install.</div>';
    if (!inApp()) {
      // Android
      h += '<section class="pbg-card"><h2>🤖 Android phone</h2>';
      if (info && info.play) {
        h += '<p>Install PakkaBill from Google Play. It updates by itself.</p><a class="pbg-btn pri" href="' + esc(info.play) + '" target="_blank" rel="noopener">▶ Get it on Google Play</a>' +
          (apk ? '<div class="pbg-meta">No Play Store? <a href="' + esc(apk) + '" download="PakkaBill.apk">Download the app file</a> (' + (info.size ? (info.size / 1048576).toFixed(1) + ' MB, ' : '') + 'Android ' + esc(String(info.minAndroid || '8').replace(/\.0$/, '')) + ' or newer).</div>' : '');
      } else if (apk) {
        h += '<p>Download the PakkaBill app and install it.</p><a class="pbg-btn pri" href="' + esc(apk) + '" download="PakkaBill.apk">⬇️ Download PakkaBill for Android</a>' +
          '<div class="pbg-meta">Version ' + esc(info.version || '1.0') + (info.size ? ' · ' + (info.size / 1048576).toFixed(1) + ' MB' : '') + ' · Android ' + esc(String(info.minAndroid || '8').replace(/\.0$/, '')) + ' or newer</div>' +
          '<ol class="pbg-steps"><li>Tap <b>Download</b>, then open <b>PakkaBill.apk</b> from the notification or Downloads.</li><li>If the phone asks, allow <b>Install unknown apps</b> for Chrome (or your file app). This is normal for apps from a website.</li><li>Tap <b>Install</b>, then <b>Open</b>. Log in with the same mobile number to use your plan.</li></ol>' +
          '<p class="pbg-meta">The app has the Meesho P&amp;L. GST bills, estimates and GSTR-1 are on this website for now: install it from your browser below to keep them one tap away too.</p>';
      } else {
        h += '<p>The Android app download is being prepared. Meanwhile, install PakkaBill straight from Chrome below; it works the same way.</p>';
      }
      h += '</section>';
      // install from the browser
      h += '<section class="pbg-card"><h2>⚡ Install from your browser</h2><p>No download needed: Chrome and Edge can add PakkaBill as an app on Android phones and computers.</p>';
      if (deferred) h += '<button type="button" class="pbg-btn' + (apk ? '' : ' pri') + '" data-pbg="install">📲 Install PakkaBill</button>';
      else if (!standalone()) h += '<ol class="pbg-steps"><li><b>Android (Chrome):</b> tap ⋮ at the top right, then <b>Install app</b> or <b>Add to Home screen</b>.</li><li><b>Computer (Chrome or Edge):</b> click the install icon at the right end of the address bar, or ⋮ → <b>Install PakkaBill</b>.</li></ol>';
      h += '</section>';
      // iPhone
      h += '<section class="pbg-card"><h2>📱 iPhone and iPad</h2><p>Add PakkaBill to your home screen from Safari:</p>' +
        '<ol class="pbg-steps"><li>Open <b>pakkabill1.vercel.app</b> in <b>Safari</b>.</li><li>Tap the <b>Share</b> button (square with an arrow).</li><li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol></section>';
    }
    h += '<section class="pbg-card"><h2>🔒 Your data</h2><p>The app and the website are the same PakkaBill. Log in with your mobile number and turn on cloud backup (Shops &amp; cloud) to see the same bills on every device.</p></section>';
    h += '</div>';
    el.innerHTML = h;
  }
  function redraw() { mounts.forEach(function (el) { if (el.isConnected) draw(el); }); }
  window.pbAppMount = function (el) {
    if (el._pbg) return;
    el._pbg = true; css(); mounts.push(el);
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-pbg="install"]');
      if (!b || !deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; redraw(); }).catch(function () {});
    });
    if (!info) loadInfo();
    draw(el);
  };
  window.pbInApp = inApp;

  // one gentle nudge on Android browsers, at most once a week, never inside the app
  function nudge() {
    if (!android || standalone() || /#\/app\b/.test(location.hash)) return;
    var last = 0; try { last = Number(localStorage.getItem('pb-app-nudge') || 0); if (localStorage.getItem('pb-app-installed')) return; } catch (e) { return; }
    if (Date.now() - last < 7 * 864e5) return;
    css();
    var n = document.createElement('div'); n.className = 'pbg-nudge'; n.setAttribute('role', 'status');
    n.innerHTML = '<span aria-hidden="true">📲</span><a href="#/app">Get the PakkaBill app for your phone</a><button type="button" aria-label="Close">×</button>';
    function done() { try { localStorage.setItem('pb-app-nudge', String(Date.now())); } catch (e) { /* ignore */ } n.remove(); }
    n.querySelector('button').addEventListener('click', done);
    n.querySelector('a').addEventListener('click', done);
    document.body.appendChild(n);
    setTimeout(function () { if (n.isConnected) n.remove(); }, 15000);
  }
  setTimeout(nudge, 20000);
})();
