// PakkaBill Home (#/dashboard): the screen the website opens on, on a phone or a laptop.
// Kept short on purpose: a greeting, the four main tools (the rest are one tap away in All tools),
// this month's numbers when there are any, why PakkaBill is safe to use, and the account.
// Everything is read from this device: the open shop (shops.js), the profit the P&L tool last
// showed (pnl.html saves it as "hisaab:last"), the login and the business details saved in the
// admin panel (pro.js keeps /api/config as "pb-cfg"). The app calls window.pbHomeMount(el).
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
  function longDate(t) { var d = new Date(t); return isNaN(d) ? '' : d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear(); }
  function icon(k) { return (window.pbToolIcons || {})[k] || ''; }
  function svg(d, w) { return '<svg width="' + (w || 22) + '" height="' + (w || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; }
  var PLUS = svg('<path d="M12 5v14M5 12h14"/>');
  var GO = svg('<path d="M5 12h14M13 6l6 6-6 6"/>', 16);
  var GRID = svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>', 18);
  var TRUST = [
    [svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'), 'Your files stay with you', 'Meesho reports are read on your own phone or laptop. They are not uploaded to us.'],
    [svg('<path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>'), 'No ads. Never sold.', 'We never sell your data, show no ads and use no outside tracking.'],
    [svg('<path d="M4 4v16h16"/><path d="m8 14 3-3 3 3 5-6"/>'), 'Checked to the paisa', 'Your profit is matched to what Meesho paid you. GST is worked out by the rules.'],
    [svg('<path d="M4 13a8 8 0 0 1 16 0v4a2 2 0 0 1-2 2h-1v-6h3M4 13v4a2 2 0 0 0 2 2h1v-6H4"/>'), 'Real help', 'Ask the assistant in English or Hindi, or write to our team.'],
  ];

  /* ---------------- the numbers ---------------- */
  function total(i) { var t = i.totals || {}; return Number(t.total != null ? t.total : t.grandTotal) || 0; }
  function billing(d) {
    var month = ymd(new Date()).slice(0, 7), s = { monthSales: 0, monthBills: 0, due: 0, dueBills: 0, any: false };
    (d.invoices || []).forEach(function (i) {
      if (!i || i.status === 'cancelled') return;
      s.any = true;
      if (i.docType !== 'invoice') return;
      if (String(i.date || '').slice(0, 7) === month) { s.monthBills++; s.monthSales += total(i); }
      if (i.status !== 'paid') { s.dueBills++; s.due += total(i); }
    });
    return s;
  }
  // what the P&L tool last showed for the seller's own Meesho files (never the sample data)
  function profit() { var p = ls('hisaab:last'); return p && typeof p.np === 'number' && p.label ? p : null; }
  function plan() {
    var a = acct(), cfg = ls('pb-cfg') || {};
    var paid = !!(cfg.enabled && cfg.enforce), trial = paid ? Number(cfg.trialDays) || 0 : 0;
    if (!a) return { inn: false, paid: paid, trial: trial };
    var u = a.user, left = Math.ceil(((u.paidUntil || 0) - Date.now()) / 864e5);
    return { inn: true, paid: paid, user: u, pro: left > 0, left: left, trialPlan: u.lastPlan === 'trial' };
  }

  /* ---------------- drawing ---------------- */
  var MAIN = [
    ['pnl', '#/pnl', 'Check my profit', 'Profit & Loss from Meesho’s payment report', 1],
    ['new', '#/new', 'New bill', 'GST invoice or estimate'],
    ['labels', '#/labels', 'Sort labels', 'Packing chart and labels in one PDF'],
    ['lowship', '#/lowship', 'Low shipping photo', 'Find the photo Meesho charges less for'],
  ];
  function hello() { var h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

  function numbers(st) {
    var p = profit(), b = st.bill || {}, cells = [];
    if (p) cells.push('<a class="pbh-n" href="#/pnl"><small>Meesho ' + (p.np < 0 ? 'loss' : 'profit') + '</small><b class="' + (p.np < 0 ? 'is-neg' : 'is-pos') + '">' + rupees(p.np) + '</b><span>' + esc(p.label) + '</span></a>');
    if (b.any) {
      cells.push('<a class="pbh-n" href="#/bills"><small>Billed in ' + MONTHS[new Date().getMonth()] + '</small><b>' + rupees(b.monthSales) + '</b><span>' + b.monthBills + ' bill' + (b.monthBills === 1 ? '' : 's') + '</span></a>');
      cells.push('<a class="pbh-n" href="#/bills"><small>To collect</small><b' + (b.due > 0 ? ' class="is-neg"' : '') + '>' + rupees(b.due) + '</b><span>' + (b.dueBills ? b.dueBills + ' unpaid' : 'All paid') + '</span></a>');
    }
    if (!cells.length) return '';
    return '<section class="pbh-sec" aria-labelledby="pbh-n"><h2 class="pbh-h" id="pbh-n">Your numbers</h2><div class="paper pbh-nums">' + cells.join('') + '</div>' +
      (p ? '<p class="pbh-fine">Meesho profit is what Profit &amp; Loss last showed for your own reports' + (p.at ? ', on ' + longDate(p.at) : '') + '.</p>' : '') + '</section>';
  }
  function trust() {
    var biz = (ls('pb-cfg') || {}).biz || {}, name = String(biz.name || '').trim(), addr = String(biz.address || '').trim(), mail = String(biz.email || '').trim(), phone = String(biz.phone || '').trim();
    var bits = [];
    if (addr) bits.push(esc(addr));
    if (mail) bits.push('<a href="mailto:' + esc(mail) + '">' + esc(mail) + '</a>');
    if (phone) bits.push('<a href="tel:' + esc(phone.replace(/[^\d+]/g, '')) + '">' + esc(phone) + '</a>');
    var who = name ? '<p class="pbh-who"><b>Run by ' + esc(name) + '</b>' + (bits.length ? '<span>' + bits.join(' \u00b7 ') + '</span>' : '') + '</p>' : '';
    return '<section class="pbh-sec" aria-labelledby="pbh-t"><h2 class="pbh-h" id="pbh-t">Safe to use</h2><div class="paper pbh-trust"><ul>' +
      TRUST.map(function (t) { return '<li><span class="pbh-ti">' + t[0] + '</span><span><b>' + t[1] + '</b><small>' + t[2] + '</small></span></li>'; }).join('') + '</ul>' +
      '<div class="pbh-legal">' + who + '<nav aria-label="Policies"><a href="/privacy">Privacy policy</a><a href="/terms">Terms</a><a href="/refund">Refunds</a><a href="/contact">Contact us</a></nav></div></div></section>';
  }
  function account() {
    var p = plan();
    if (!p.inn) {
      var why = p.trial ? 'A free account adds ' + p.trial + ' days of Pro and backs up your bills.' : 'A free account backs up your bills and opens them on any phone or laptop.';
      return '<section class="paper pbh-acct pbh-acct--out"><div><b>Your bills are saved on this device only.</b><span>' + why + '</span></div>' +
        '<div class="pbh-acts"><button type="button" class="pb-btn pb-btn--primary" data-pbh="signup">Sign up free</button><button type="button" class="pb-btn pb-btn--secondary" data-pbh="login">Log in</button></div></section>';
    }
    var u = p.user, who = u.phone === 'owner' ? 'Owner account' : '+91 ' + String(u.phone).replace(/^(\d{5})(\d{5})$/, '$1 $2');
    var line = p.pro && u.paidUntil && p.left < 3650 ? (p.trialPlan ? 'Free Pro trial' : 'Pro') + ' till ' + longDate(u.paidUntil)
      : p.pro ? 'Pro' : p.paid ? 'Free plan' : 'Everything is free right now';
    return '<section class="paper pbh-acct"><div><b>Logged in as ' + esc(who) + '</b><span>' + esc(line) + '</span></div>' +
      '<div class="pbh-acts"><a class="pb-btn pb-btn--secondary" href="#/account">My account</a>' + (p.paid && (!p.pro || p.left <= 7) ? '<a class="pb-btn pb-btn--primary" href="#/plan">' + (p.pro ? 'Renew Pro' : 'See Pro') + '</a>' : '') + '</div></section>';
  }

  function draw(el) {
    var st = el._pbh, now = new Date(), fresh = st.data && !st.name && !(st.bill && st.bill.any) && !profit();
    el.innerHTML = '<div class="pbh">' +
      '<header class="pbh-hello"><p class="pbh-date">' + DAYS[now.getDay()] + ', ' + now.getDate() + ' ' + MONTHS[now.getMonth()] + '</p>' +
        '<h1 class="page-title">' + (fresh ? 'Welcome to PakkaBill' : hello() + (st.name ? ', <span>' + esc(st.name) + '</span>' : '')) + '</h1>' +
        '<p class="page-sub">' + (fresh ? 'Know your real profit on Meesho, make GST bills and sort labels. Free to start, no sign-up needed.' : 'What would you like to do today?') + '</p></header>' +
      '<section aria-label="Main tools"><div class="pbh-main">' + MAIN.map(function (t) {
        return '<a class="pbh-m' + (t[4] ? ' pbh-m--pri' : '') + '" href="' + t[1] + '"><span class="pbh-mi">' + (t[0] === 'new' ? PLUS : icon(t[0])) + '</span><span class="pbh-mt"><b>' + t[2] + '</b><small>' + t[3] + '</small></span><span class="pbh-go">' + GO + '</span></a>';
      }).join('') + '</div><button type="button" class="pbh-all" data-pbh="tools">' + GRID + 'All tools<span>Bills, GST, GSTR-1, listing, Lens and more</span></button></section>' +
      numbers(st) + trust() + account() +
      '<nav class="pbh-foot" aria-label="More"><a href="#/support">Help &amp; support</a><a href="#/app">Get the Android app</a><a href="#/home">About PakkaBill</a></nav></div>';
  }

  function load(el) {
    var st = el._pbh, P = window.pbShops;
    st.at = Date.now();
    if (!P) { st.data = true; st.bill = billing({}); draw(el); return; }
    P.read(P.active()).then(function (d) {
      if (!el.isConnected) return;
      var b = (d && d.business) || {};
      st.data = true; st.name = (b.name || '').trim(); st.bill = billing(d || {});
      draw(el);
    }).catch(function () { st.data = true; st.bill = billing({}); draw(el); });
  }

  var CSS = '.pbh{display:grid;gap:22px;max-width:880px}' +
    '.pbh-date{margin:0 0 4px;font-size:12.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-3)}' +
    '.pbh-hello .page-title span{color:var(--carbon)}.pbh-hello .page-sub{margin-top:6px;max-width:46ch}' +
    '.pbh-main{display:grid;gap:10px}' +
    '.pbh-m{display:flex;align-items:center;gap:14px;min-height:72px;padding:13px 16px;border-radius:14px;border:1px solid var(--rule);background:var(--paper);color:var(--ink);text-decoration:none;box-shadow:0 1px 2px #141a330a;transition:border-color .15s,box-shadow .15s}' +
    '.pbh-m:hover{border-color:var(--carbon);box-shadow:0 10px 24px -18px #141a3366}' +
    '.pbh-mi{flex:none;width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:var(--carbon-tint);color:var(--carbon)}.pbh-mi svg{display:block}' +
    '.pbh-mt{flex:1;min-width:0}.pbh-mt b{display:block;font-size:16.5px;font-weight:700;line-height:1.25}.pbh-mt small{display:block;font-size:13.5px;line-height:1.35;color:var(--ink-2)}' +
    '.pbh-go{flex:none;color:var(--ink-3)}.pbh-go svg{display:block}' +
    '.pbh-m--pri{background:var(--btn-bg);border-color:var(--btn-bg);color:var(--btn-fg)}.pbh-m--pri:hover{background:var(--btn-bg-hover);border-color:var(--btn-bg-hover)}' +
    '.pbh-m--pri .pbh-mi{background:#ffffff26;color:#fff}.pbh-m--pri small,.pbh-m--pri .pbh-go{color:#ffffffd9}' +
    '.pbh-all{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px;padding:6px 2px;border:0;background:none;font:inherit;font-size:15px;font-weight:600;color:var(--carbon);cursor:pointer}' +
    '.pbh-all span{font-weight:400;font-size:13.5px;color:var(--ink-3)}.pbh-all:hover{text-decoration:underline;text-underline-offset:3px}' +
    '.pbh-h{margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)}' +
    '.pbh-nums{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));padding:0;overflow:hidden}' +
    '.pbh-n{display:grid;gap:1px;padding:16px 18px;color:var(--ink);text-decoration:none;border-top:1px solid var(--rule-soft)}.pbh-n:first-child{border-top:0}.pbh-n:hover{background:var(--desk)}' +
    '.pbh-n small{font-size:13px;font-weight:600;color:var(--ink-2)}.pbh-n b{font-size:24px;font-weight:700;letter-spacing:-.015em;font-variant-numeric:tabular-nums;line-height:1.2}.pbh-n span{font-size:12.5px;color:var(--ink-3)}' +
    '.pbh .is-pos{color:var(--green)}.pbh .is-neg{color:var(--red)}' +
    '.pbh-fine{margin:8px 2px 0;font-size:12.5px;color:var(--ink-3)}' +
    '.pbh-trust{padding:6px 18px 0;overflow:hidden}.pbh-trust ul{list-style:none;margin:0;padding:0;display:grid}' +
    '.pbh-trust li{display:flex;gap:13px;align-items:flex-start;padding:13px 0;border-top:1px solid var(--rule-soft)}.pbh-trust li:first-child{border-top:0}' +
    '.pbh-ti{flex:none;width:38px;height:38px;border-radius:10px;display:grid;place-items:center;background:var(--green-soft);color:var(--green)}.pbh-ti svg{display:block;width:20px;height:20px}' +
    '.pbh-trust b{display:block;font-size:15px;font-weight:700}.pbh-trust small{display:block;font-size:13.5px;line-height:1.45;color:var(--ink-2)}' +
    '.pbh-legal{margin:0 -18px;padding:12px 18px 14px;border-top:1px solid var(--rule-soft);background:var(--desk);font-size:13px;color:var(--ink-2)}' +
    '.pbh-who{margin:0 0 8px;line-height:1.5}.pbh-who b{display:block;font-size:13.5px;color:var(--ink);font-weight:600}.pbh-who span{display:block}.pbh-who a{color:var(--carbon)}' +
    '.pbh-legal nav{display:flex;flex-wrap:wrap;gap:4px 18px}.pbh-legal nav a{color:var(--carbon);font-weight:600;text-decoration:none}.pbh-legal nav a:hover{text-decoration:underline}' +
    '.pbh-acct{display:grid;gap:12px;padding:16px 18px}.pbh-acct b{display:block;font-size:15px;font-weight:700}.pbh-acct span{display:block;margin-top:2px;font-size:13.5px;color:var(--ink-2)}' +
    '.pbh-acts{display:flex;flex-wrap:wrap;gap:10px}.pbh-acts .pb-btn{text-decoration:none}' +
    '.pbh-foot{display:flex;flex-wrap:wrap;gap:6px 22px;padding:0 2px;font-size:14px}.pbh-foot a{color:var(--ink-2);font-weight:600;text-decoration:none}.pbh-foot a:hover{color:var(--carbon);text-decoration:underline}' +
    '.pbh a:focus-visible,.pbh button:focus-visible{outline:2.5px solid var(--focus,var(--carbon));outline-offset:2px}' +
    '@media (width>=640px){.pbh-main{grid-template-columns:repeat(2,minmax(0,1fr))}.pbh-nums .pbh-n{border-top:0;border-left:1px solid var(--rule-soft)}.pbh-nums .pbh-n:first-child{border-left:0}' +
      '.pbh-trust ul{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:24px}.pbh-trust li:nth-child(2){border-top:0}.pbh-acct{grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:18px}}' +
    '@media (width>=900px){.pbh{gap:28px}}@media (width>=1024px){.pbh-acct--out{display:none}}' +
    '@media (prefers-reduced-motion:reduce){.pbh-m{transition:none}}';

  var mounts = [];
  window.pbHomeMount = function (el) {
    if (!el) return;
    if (!document.getElementById('pbh-css')) { var s = document.createElement('style'); s.id = 'pbh-css'; s.textContent = CSS; (document.head || document.documentElement).appendChild(s); }
    if (el._pbh) { if (Date.now() - el._pbh.at > 1500) load(el); return; } // the app calls this again when it redraws
    el._pbh = { at: 0, data: false, name: '' };
    mounts.push(el);
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pbh]');
      if (!b) return;
      var a = b.getAttribute('data-pbh');
      if (a === 'tools') { if (window.pbTools) window.pbTools(); else location.hash = '#/bills'; }
      else if (window.pbAuth) window.pbAuth({ mode: a, from: 'home-app' });
    });
    draw(el);
    load(el);
  };
  function redraw() { mounts = mounts.filter(function (el) { return el.isConnected; }); mounts.forEach(function (el) { if (el._pbh.data) draw(el); }); }
  window.addEventListener('pb-account', redraw);
  window.addEventListener('storage', function (e) { if (e.key === 'pb-acct' || e.key === 'hisaab:last' || e.key === 'pb-cfg') redraw(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) mounts.forEach(function (el) { if (el.isConnected) load(el); }); });
})();
