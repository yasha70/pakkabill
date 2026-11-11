// PakkaBill Home (#/dashboard): the first screen of the app on a phone or a laptop.
// The shop's name, three quick buttons, the last Meesho profit, this month's billing with the
// newest bills, every tool as a tile, and the account. Everything is read from this device:
// the open shop (shops.js), the profit the P&L tool last showed (pnl.html saves it as
// "hisaab:last") and the login (pro.js). The app calls window.pbHomeMount(el).
(function () {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function ls(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function acct() { var a = ls('pb-acct'); return a && a.token && a.user ? a : null; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rupees(n) { n = Math.round(Number(n) || 0); return (n < 0 ? '−' : '') + '₹' + Math.abs(n).toLocaleString('en-IN'); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function shortDate(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? +m[3] + ' ' + MONTHS[+m[2] - 1].slice(0, 3) : ''; }
  function longDate(t) { var d = new Date(t); return isNaN(d) ? '' : d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear(); }
  function icon(k) { return (window.pbToolIcons || {})[k] || ''; }
  var PLUS = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  var GO = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  /* ---------------- the numbers ---------------- */
  function total(i) { var t = i.totals || {}; return Number(t.total != null ? t.total : t.grandTotal) || 0; }
  function billing(d) {
    var month = ymd(new Date()).slice(0, 7), all = (d.invoices || []).filter(function (i) { return i && i.status !== 'cancelled'; });
    var bills = all.filter(function (i) { return i.docType === 'invoice'; });
    var s = { monthSales: 0, monthBills: 0, due: 0, dueBills: 0, any: all.length > 0 };
    bills.forEach(function (i) {
      if (String(i.date || '').slice(0, 7) === month) { s.monthBills++; s.monthSales += total(i); }
      if (i.status !== 'paid') { s.dueBills++; s.due += total(i); }
    });
    s.recent = all.slice().sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')) || (b.createdAt || 0) - (a.createdAt || 0); }).slice(0, 3);
    return s;
  }
  // what the P&L tool last showed for the seller's own Meesho files (never the sample data)
  function profit() { var p = ls('hisaab:last'); return p && typeof p.np === 'number' && p.label ? p : null; }
  function plan() {
    var a = acct(), cfg = ls('pb-cfg') || {};
    var paid = !!(cfg.enabled && cfg.enforce), trial = paid ? Number(cfg.trialDays) || 0 : 0;
    if (!a) return { inn: false, paid: paid, trial: trial };
    var u = a.user, left = Math.ceil(((u.paidUntil || 0) - Date.now()) / 864e5), pro = left > 0;
    return { inn: true, paid: paid, user: u, pro: pro, left: left, trialPlan: u.lastPlan === 'trial' };
  }

  /* ---------------- drawing ---------------- */
  var TOOLS = [
    ['pnl', '#/pnl', 'Profit & Loss', 'Your real profit on Meesho'],
    ['labels', '#/labels', 'Labels & packing', 'Packing chart and sorted labels'],
    ['lowship', '#/lowship', 'Low shipping image', 'Photos with lower Meesho shipping'],
    ['autolist', '#/autolist', 'Auto listing', 'Fill Meesho’s catalogue form'],
    ['bills', '#/bills', 'Bills', 'GST invoices and estimates'],
    ['reports', '#/reports', 'GST summary', 'Tax by month and rate'],
    ['gstr1', '#/gstr1', 'GSTR-1 JSON', 'From marketplace reports'],
    ['parties', '#/parties', 'Parties', 'Your buyers'],
    ['items', '#/items', 'Items', 'What you sell, with HSN'],
    ['listing', '#/listing', 'Meesho listing', 'Bulk catalogue Excel'],
    ['lens', '#/lens', 'Meesho Lens', 'Competitor prices and sales'],
    ['shop', '#/shop', 'Shop details', 'Name, GSTIN, logo, backup'],
  ];
  function hello() { var h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
  function pill(i) {
    if (i.docType === 'estimate') return '<span class="pill pill--est">Estimate</span>';
    return i.status === 'paid' ? '<span class="pill pill--paid">Paid</span>' : '<span class="pill pill--due">Unpaid</span>';
  }

  function profitCard() {
    var p = profit();
    if (!p) {
      return '<section class="paper pbh-card"><h2 class="card-title">Meesho profit</h2>' +
        '<p class="pbh-lead">See your real profit in 2 minutes.</p>' +
        '<p class="pbh-muted">Upload the payment report from the Meesho Supplier Panel. PakkaBill takes out every fee, return, RTO, GST and product cost.</p>' +
        '<div class="pbh-acts"><a class="pb-btn pb-btn--primary" href="#/pnl">Upload my report</a></div></section>';
    }
    var loss = p.np < 0;
    return '<section class="paper pbh-card"><div class="pbh-cardhead"><h2 class="card-title">Meesho profit</h2><a class="pbh-more" href="#/pnl">Open ' + GO + '</a></div>' +
      '<p class="pbh-label">' + (loss ? 'Real loss' : 'Real profit') + '</p>' +
      '<p class="pbh-big ' + (loss ? 'is-neg' : 'is-pos') + '">' + rupees(p.np) + '</p>' +
      '<p class="pbh-muted">' + esc(p.label) + (typeof p.margin === 'number' && isFinite(p.margin) ? ' · ' + (p.margin * 100).toFixed(1) + '% margin' : '') + '</p>' +
      '<p class="pbh-fine">From your Meesho reports, as Profit &amp; Loss last showed it' + (p.at ? ' on ' + longDate(p.at) : '') + '.</p></section>';
  }
  function billingCard(st) {
    var head = '<div class="pbh-cardhead"><h2 class="card-title">Billing in ' + MONTHS[new Date().getMonth()] + '</h2><a class="pbh-more" href="#/bills">All bills ' + GO + '</a></div>';
    if (!st.data) return '<section class="paper pbh-card">' + head + '<p class="pbh-muted">Opening your bills…</p></section>';
    var b = st.bill;
    if (!b.any) {
      return '<section class="paper pbh-card">' + head + '<p class="pbh-lead">No bills yet.</p>' +
        '<p class="pbh-muted">A GST bill takes about a minute. CGST, SGST and IGST are worked out for you.</p>' +
        '<div class="pbh-acts"><a class="pb-btn pb-btn--primary" href="#/new">' + PLUS + 'New bill</a>' + (st.named ? '' : '<a class="pb-btn pb-btn--secondary" href="#/shop">Add shop details</a>') + '</div></section>';
    }
    return '<section class="paper pbh-card">' + head +
      '<dl class="pbh-stats"><div><dt>Billed</dt><dd>' + rupees(b.monthSales) + '</dd><small>' + b.monthBills + ' bill' + (b.monthBills === 1 ? '' : 's') + '</small></div>' +
      '<div><dt>To collect</dt><dd' + (b.due > 0 ? ' class="is-neg"' : '') + '>' + rupees(b.due) + '</dd><small>' + (b.dueBills ? b.dueBills + ' unpaid bill' + (b.dueBills === 1 ? '' : 's') : 'Nothing unpaid') + '</small></div></dl>' +
      '<ul class="pbh-bills">' + b.recent.map(function (i) {
        return '<li><a href="#/bill/' + encodeURIComponent(i.id) + '"><span class="pbh-b1"><b>' + esc((i.buyer && i.buyer.name) || 'Cash sale') + '</b><small>' + esc(i.number || '') + (i.date ? ' · ' + shortDate(i.date) : '') + '</small></span>' +
          '<span class="pbh-b2"><b>' + rupees(total(i)) + '</b>' + pill(i) + '</span></a></li>';
      }).join('') + '</ul></section>';
  }
  function accountCard() {
    var p = plan();
    if (!p.inn) {
      var why = p.trial ? 'Create a free account and get ' + p.trial + ' days of Pro free, no payment needed.'
        : p.paid ? 'With a free account your plan and help requests follow you to every phone and laptop.'
        : 'Create a free account to back up your bills and open them on any phone or laptop.';
      return '<section class="paper pbh-card pbh-acct"><div class="pbh-acct__t"><h2 class="card-title">Keep your work safe</h2><p class="pbh-muted">Your bills are saved on this device only. ' + why + '</p></div>' +
        '<div class="pbh-acts"><button type="button" class="pb-btn pb-btn--primary" data-pbh="signup">Sign up free</button><button type="button" class="pb-btn pb-btn--secondary" data-pbh="login">Log in</button></div></section>';
    }
    var u = p.user, who = u.phone === 'owner' ? 'Owner account' : '+91 ' + String(u.phone).replace(/^(\d{5})(\d{5})$/, '$1 $2');
    var tag = p.pro ? (p.trialPlan ? '<span class="pill pill--est">Free Pro trial</span>' : '<span class="pill pill--paid">Pro</span>') : '<span class="pill pill--void">Free plan</span>';
    var line = p.pro && u.paidUntil && p.left < 3650 ? (p.trialPlan ? 'Trial' : 'Pro') + ' till ' + longDate(u.paidUntil) + (p.left <= 7 ? ' (' + p.left + ' day' + (p.left === 1 ? '' : 's') + ' left)' : '')
      : p.pro ? 'Everything in PakkaBill is open.' : p.paid ? 'Upgrade for the full P&L report, unlimited bills and cloud backup.' : 'Everything in PakkaBill is free right now.';
    return '<section class="paper pbh-card pbh-acct"><div class="pbh-acct__t"><h2 class="card-title">Your account ' + tag + '</h2><p class="pbh-muted">' + esc(who) + ' · ' + esc(line) + '</p></div>' +
      '<div class="pbh-acts"><a class="pb-btn pb-btn--secondary" href="#/account">My account</a>' + (p.paid && (!p.pro || p.left <= 7) ? '<a class="pb-btn pb-btn--primary" href="#/plan">' + (p.pro ? 'Renew Pro' : 'See Pro plans') + '</a>' : '') + '</div></section>';
  }

  function draw(el) {
    var st = el._pbh, now = new Date();
    el.innerHTML = '<div class="pbh">' +
      '<header class="pbh-hello"><p class="pbh-date">' + DAYS[now.getDay()] + ', ' + now.getDate() + ' ' + MONTHS[now.getMonth()] + '</p>' +
        '<h1 class="page-title">' + hello() + (st.name ? ', <span>' + esc(st.name) + '</span>' : '') + '</h1>' +
        '<p class="page-sub">What would you like to do today?</p></header>' +
      '<nav class="pbh-quick" aria-label="Quick actions">' +
        '<a class="pbh-q pbh-q--pri" href="#/pnl"><span class="pbh-q__i">' + icon('pnl') + '</span><span><b>Check my profit</b><small>From Meesho’s payment report</small></span></a>' +
        '<a class="pbh-q" href="#/new"><span class="pbh-q__i">' + PLUS + '</span><span><b>New bill</b><small>GST invoice or estimate</small></span></a>' +
        '<a class="pbh-q" href="#/labels"><span class="pbh-q__i">' + icon('labels') + '</span><span><b>Sort labels</b><small>Packing chart and labels PDF</small></span></a></nav>' +
      '<div class="pbh-cols">' + profitCard() + billingCard(st) + '</div>' +
      '<section aria-labelledby="pbh-tools"><h2 class="pbh-h" id="pbh-tools">All tools</h2><div class="pbh-tools">' + TOOLS.map(function (t) {
        return '<a class="pbh-tool" href="' + t[1] + '"><span class="pbh-tool__i">' + icon(t[0]) + '</span><span class="pbh-tool__t"><b>' + t[2] + '</b><small>' + t[3] + '</small></span></a>';
      }).join('') + '</div></section>' +
      accountCard() +
      '<nav class="pbh-foot" aria-label="More"><a href="#/support">' + icon('support') + 'Help &amp; support</a><a href="#/app">' + icon('app') + 'Get the app</a><a href="#/home">About PakkaBill</a></nav></div>';
  }

  function load(el) {
    var st = el._pbh, P = window.pbShops;
    st.at = Date.now();
    if (!P) { st.data = true; st.bill = billing({}); draw(el); return; }
    var id = P.active();
    st.name = st.name || P.label(id) || '';
    if (/^my shop$/i.test(st.name)) st.name = '';
    P.read(id).then(function (d) {
      if (!el.isConnected) return;
      var b = (d && d.business) || {};
      st.data = true; st.named = !!(b.name || '').trim(); st.name = (b.name || '').trim(); st.sample = !!(d.meta && d.meta.sample); st.bill = billing(d || {});
      draw(el);
    }).catch(function () { st.data = true; st.bill = billing({}); draw(el); });
  }

  var CSS = '.pbh{display:grid;gap:18px;max-width:1080px}' +
    '.pbh-date{margin:0 0 4px;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-3)}' +
    '.pbh-hello .page-title span{color:var(--carbon)}.pbh-hello .page-sub{margin-top:6px}' +
    '.pbh-quick{display:grid;gap:10px}' +
    '.pbh-q{display:flex;align-items:center;gap:13px;min-height:68px;padding:12px 16px;border-radius:14px;border:1px solid var(--rule);background:var(--paper);color:var(--ink);text-decoration:none;box-shadow:0 1px 2px #141a330a;transition:border-color .15s,box-shadow .15s}' +
    '.pbh-q:hover{border-color:var(--carbon);box-shadow:0 10px 24px -18px #141a3366}' +
    '.pbh-q__i{flex:none;width:42px;height:42px;border-radius:11px;display:grid;place-items:center;background:var(--carbon-tint);color:var(--carbon)}.pbh-q__i svg{display:block}' +
    '.pbh-q b{display:block;font-size:16px;font-weight:700;line-height:1.25}.pbh-q small{display:block;font-size:13px;color:var(--ink-2);line-height:1.35}' +
    '.pbh-q--pri{background:var(--btn-bg);border-color:var(--btn-bg);color:var(--btn-fg)}.pbh-q--pri:hover{background:var(--btn-bg-hover);border-color:var(--btn-bg-hover)}' +
    '.pbh-q--pri .pbh-q__i{background:#ffffff24;color:#fff}.pbh-q--pri small{color:#ffffffd1}' +
    '.pbh-cols{display:grid;gap:14px;align-items:start}' +
    '.pbh-card{padding:18px 18px 16px;min-width:0}.pbh-card .card-title{margin:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
    '.pbh-cardhead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}' +
    '.pbh-more{display:inline-flex;align-items:center;gap:4px;font-size:14px;font-weight:600;color:var(--carbon);text-decoration:none;white-space:nowrap}.pbh-more:hover{text-decoration:underline}' +
    '.pbh-label{margin:0;font-size:12.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3)}' +
    '.pbh-big{margin:2px 0 2px;font-size:34px;font-weight:700;line-height:1.15;letter-spacing:-.02em;font-variant-numeric:tabular-nums}' +
    '.pbh .is-pos{color:var(--green)}.pbh .is-neg{color:var(--red)}' +
    '.pbh-lead{margin:10px 0 4px;font-size:17px;font-weight:700;color:var(--ink)}.pbh-muted{margin:0;font-size:14.5px;color:var(--ink-2)}.pbh-fine{margin:10px 0 0;font-size:12.5px;color:var(--ink-3)}' +
    '.pbh-acts{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}.pbh-acts .pb-btn{text-decoration:none}' +
    '.pbh-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 6px}.pbh-stats div{padding:11px 13px;border-radius:11px;background:var(--desk);min-width:0}' +
    '.pbh-stats dt{font-size:12.5px;font-weight:600;color:var(--ink-2)}.pbh-stats dd{margin:1px 0 0;font-size:21px;font-weight:700;letter-spacing:-.01em;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.pbh-stats small{font-size:12.5px;color:var(--ink-3)}' +
    '.pbh-bills{list-style:none;margin:0;padding:0}.pbh-bills li+li{border-top:1px solid var(--rule-soft)}' +
    '.pbh-bills a{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 2px;color:var(--ink);text-decoration:none}.pbh-bills a:hover b{color:var(--carbon)}' +
    '.pbh-b1{min-width:0}.pbh-b1 b{display:block;font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pbh-b1 small{display:block;font-size:12.5px;color:var(--ink-3)}' +
    '.pbh-b2{flex:none;display:grid;justify-items:end;gap:3px}.pbh-b2 b{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}' +
    '.pbh-h{margin:6px 0 10px;font-size:17.5px;font-weight:700;letter-spacing:-.012em}' +
    '.pbh-tools{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}' +
    '.pbh-tool{display:flex;align-items:center;gap:11px;min-width:0;padding:12px;border-radius:12px;border:1px solid var(--rule);background:var(--paper);color:var(--ink);text-decoration:none;transition:border-color .15s}' +
    '.pbh-tool:hover{border-color:var(--carbon)}.pbh-tool__i{flex:none;width:38px;height:38px;border-radius:10px;display:grid;place-items:center;background:var(--carbon-tint);color:var(--carbon)}.pbh-tool__i svg{display:block}' +
    '.pbh-tool__t{min-width:0}.pbh-tool b{display:block;font-size:14.5px;font-weight:600;line-height:1.25}.pbh-tool small{display:block;font-size:12.5px;line-height:1.3;color:var(--ink-2)}' +
    '.pbh-acct{display:grid;gap:4px}.pbh-acct .pbh-muted{margin-top:6px}' +
    '.pbh-foot{display:flex;flex-wrap:wrap;gap:8px 22px;padding:2px 2px 0;font-size:14px}.pbh-foot a{display:inline-flex;align-items:center;gap:7px;color:var(--ink-2);font-weight:600;text-decoration:none}.pbh-foot a:hover{color:var(--carbon)}.pbh-foot svg{width:18px;height:18px}' +
    '.pbh a:focus-visible,.pbh button:focus-visible{outline:2.5px solid var(--focus,var(--carbon));outline-offset:2px}' +
    '@media (width<400px){.pbh-tool small{display:none}.pbh-tool{padding:10px}}' +
    '@media (width>=640px){.pbh-quick{grid-template-columns:repeat(3,minmax(0,1fr))}.pbh-tools{grid-template-columns:repeat(3,minmax(0,1fr))}.pbh-acct{grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:16px}.pbh-acct .pbh-acts{margin-top:0}}' +
    '@media (width>=900px){.pbh{gap:22px}.pbh-cols{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.pbh-tools{grid-template-columns:repeat(4,minmax(0,1fr))}.pbh-card{padding:22px 22px 20px}}' +
    '@media (prefers-reduced-motion:reduce){.pbh-q,.pbh-tool{transition:none}}';

  var mounts = [];
  window.pbHomeMount = function (el) {
    if (!el) return;
    if (!document.getElementById('pbh-css')) { var s = document.createElement('style'); s.id = 'pbh-css'; s.textContent = CSS; (document.head || document.documentElement).appendChild(s); }
    if (el._pbh) { if (Date.now() - el._pbh.at > 1500) load(el); return; } // the app calls this again when it redraws
    el._pbh = { at: 0, data: false, name: '' };
    mounts.push(el);
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pbh]');
      if (b && window.pbAuth) window.pbAuth({ mode: b.getAttribute('data-pbh'), from: 'home-app' });
    });
    draw(el);
    load(el);
  };
  function redraw() { mounts = mounts.filter(function (el) { return el.isConnected; }); mounts.forEach(function (el) { if (el._pbh.data) draw(el); }); }
  window.addEventListener('pb-account', redraw);
  window.addEventListener('storage', function (e) { if (e.key === 'pb-acct' || e.key === 'hisaab:last') redraw(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) mounts.forEach(function (el) { if (el.isConnected) load(el); }); });
})();
