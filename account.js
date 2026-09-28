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
    '.pba-card{background:var(--paper-card,var(--card,#fff));border:1px solid var(--line,#e2daf2);border-radius:14px;padding:16px}' +
    '.pba-card h2{margin:0 0 12px;font-size:1.05rem}' +
    '.pba-me{display:flex;gap:14px;align-items:center;flex-wrap:wrap}' +
    '.pba-av{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:1.2rem;color:#fff;background:linear-gradient(135deg,#5b3fe6,#ff7a59);flex:none}' +
    '.pba-me .pba-who{flex:1;min-width:180px}.pba-who b{display:block;font-size:1.15rem}.pba-who span{display:block;color:var(--ink-3,#736e8d);font-size:.88rem}' +
    '.pba-pill{display:inline-block;padding:3px 10px;border-radius:99px;font-size:.8rem;font-weight:700;margin-top:6px}' +
    '.pba-pill.is-pro{background:#e6f6ee;color:#12714b}.pba-pill.is-trial{background:#ece6ff;color:#5b3fe6}.pba-pill.is-free{background:#f1eff7;color:#5c5776}.pba-pill.is-soon{background:#fff4df;color:#9a5a00}' +
    '.pba-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}' +
    '.pba-btn{border:1px solid var(--line,#e2daf2);background:transparent;color:inherit;border-radius:10px;padding:8px 14px;font:inherit;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block}' +
    '.pba-btn.pri{background:var(--carbon,#5b3fe6);border-color:var(--carbon,#5b3fe6);color:#fff}' +
    '.pba-tiles{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}@media(min-width:700px){.pba-tiles{grid-template-columns:repeat(3,1fr)}}' +
    '.pba-tile{border:1px solid var(--line,#e2daf2);border-radius:12px;padding:10px 12px;min-width:0}.pba-tile small{display:block;color:var(--ink-3,#736e8d);font-size:.8rem;font-weight:600}.pba-tile b{display:block;font-size:1.35rem;margin-top:2px;overflow-wrap:anywhere}.pba-tile span{display:block;font-size:.78rem;color:var(--ink-3,#736e8d)}' +
    '.pba-list{list-style:none;margin:0;padding:0}.pba-list li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--line,#e2daf2)}.pba-list li:first-child{border-top:0}' +
    '.pba-list .pba-l{min-width:0}.pba-list .pba-l b{display:block;overflow-wrap:anywhere}.pba-list .pba-l span{display:block;font-size:.82rem;color:var(--ink-3,#736e8d)}.pba-list .pba-r{text-align:right;flex:none;font-size:.88rem}' +
    '.pba-shop{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px;font-size:.82rem}.pba-shop div{background:var(--soft,#f6f3fd);border-radius:8px;padding:6px 8px;min-width:0}.pba-shop b{display:block;font-size:.95rem}' +
    '.pba-shopc{border:1px solid var(--line,#e2daf2);border-radius:12px;padding:12px;margin-top:10px}.pba-shopc:first-of-type{margin-top:0}.pba-shopc.is-on{border-color:var(--carbon,#5b3fe6)}.pba-shopc header{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}' +
    '.pba-tag{font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:99px;background:#ece6ff;color:#5b3fe6;white-space:nowrap}' +
    '.pba-st{font-weight:700;font-size:.8rem}.pba-st.ok{color:#12714b}.pba-st.wait{color:#9a5a00}.pba-st.bad{color:#c8202a}' +
    '.pba-muted{color:var(--ink-3,#736e8d);font-size:.88rem;margin:0}' +
    '.pba-kv{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:.9rem;margin:0}.pba-kv dt{color:var(--ink-3,#736e8d)}.pba-kv dd{margin:0;text-align:right;overflow-wrap:anywhere}' +
    '.pba-who .pba-pill{display:inline-block}.pba-shopc header .pba-l{min-width:0}.pba-shopc .pba-l b{display:block;font-size:1rem;overflow-wrap:anywhere}.pba-shopc .pba-l span{display:block}.pba-shopc header>div:last-child{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;flex:none}' +
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
      '<div class="pba-btns"><button type="button" class="pba-btn pri" data-pba="download">Download all my data</button></div>' +
      '<p class="pba-muted" style="margin-top:8px">One file with every shop’s bills, parties, items and settings. Keep it as your own backup.</p></section>';
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
    h += '</div>';
    var keepSync = el.querySelector('[data-pba-sync]');
    el.innerHTML = h;
    var slot = el.querySelector('[data-pba-sync]');
    if (slot) {
      if (keepSync && keepSync.firstChild) { while (keepSync.firstChild) slot.appendChild(keepSync.firstChild); }
      else if (window.pbSyncCard) window.pbSyncCard(slot);
      else slot.innerHTML = '<a class="pba-btn" href="#/shops">Open cloud backup</a>';
    }
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
