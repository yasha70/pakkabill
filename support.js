// PakkaBill: Help & support (#/support). Customers raise a ticket, attach a screenshot and talk
// with support; replies show as a badge on the Tools button and in the menu. Guests (no account)
// give a mobile number and this device keeps a private key for each of their tickets.
// The PakkaBill assistant investigates each new ticket on the server and answers in seconds with
// one-tap fixes; "I still need help" hands the ticket to a person. Replies can also arrive as
// phone notifications (Web Push) once the customer turns them on.
(function () {
  var API = '/api/support', GUEST = 'pb-support-guest', LAST = 'pb-support-last';
  var TOPICS = [
    ['bug', 'Something is not working'], ['payment', 'Payment or Pro plan'], ['bills', 'Bills, PDF or printing'],
    ['gst', 'GST summary or GSTR-1'], ['meesho', 'Meesho tools'], ['account', 'Login or account'],
    ['idea', 'Suggestion'], ['other', 'Something else']
  ];
  var STATUS = { open: ['Open', 'is-open'], progress: ['In progress', 'is-progress'], waiting: ['Waiting for you', 'is-waiting'], resolved: ['Resolved', 'is-resolved'], closed: ['Closed', 'is-closed'] };
  var state = { el: null, unread: 0, lastPage: '' };
  // One-tap fixes the assistant (or support) can attach to a reply.
  var ACTIONS = {
    update: ['⟳', 'Update PakkaBill now'], refresh_plan: ['✦', 'Refresh my plan'], plan: ['★', 'Open Plan page'], login: ['→', 'Log in'],
    shop: ['🏪', 'Open Shop (backup, logo)'], reports: ['₹', 'Open GST summary'], gstr1: ['📄', 'Open GSTR-1 JSON'], new_bill: ['+', 'Make a new bill'], items: ['▦', 'Open Items'],
    parties: ['👥', 'Open Parties'], listing: ['📦', 'Open Meesho listing'], lens: ['🔍', 'Open Meesho Lens'], pnl: ['📊', 'Open Meesho P&L'],
    tickets: ['🎫', 'Open my tickets'], help_center: ['📚', 'Browse help topics']
  };
  var PAGES = { plan: '#/plan', login: '#/plan', shop: '#/shop', reports: '#/reports', gstr1: '#/gstr1', new_bill: '#/new', items: '#/items', parties: '#/parties', listing: '#/listing', lens: '#/lens', pnl: '#/pnl', tickets: '#/support', help_center: '#/support?guide=1' };

  /* ---------------- storage and API ---------------- */
  function ls(k, v) {
    try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; }
  }
  function acct() { var a = ls('pb-acct'); return a && a.token ? a : null; }
  function guests() { var g = ls(GUEST); return Array.isArray(g) ? g.filter(function (x) { return x && x.id && x.key; }) : []; }
  function keyFor(id) { var g = guests().find(function (x) { return x.id === id; }); return g ? g.key : undefined; }
  function call(action, body) {
    var a = acct(), headers = { 'Content-Type': 'application/json' };
    if (a) headers.Authorization = 'Bearer ' + a.token;
    return fetch(API, { method: 'POST', headers: headers, body: JSON.stringify(Object.assign({ action: action }, body || {})), cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Could not reach support (' + r.status + '). Check your internet.'); return j; }); });
  }

  /* ---------------- unread badge ---------------- */
  function setUnread(n) {
    state.unread = n || 0;
    document.documentElement.classList.toggle('pb-has-reply', state.unread > 0);
  }
  var lastCheck = 0;
  function checkUnread(force) {
    if (!acct() && !guests().length) { setUnread(0); return; }
    if (!force && Date.now() - lastCheck < 60000) return;
    lastCheck = Date.now();
    call('unread', { guests: guests() }).then(function (j) { setUnread(j.count); }).catch(function () { /* offline */ });
  }

  /* ---------------- helpers ---------------- */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k]; if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(function (x) { add(el, x); }); else el.append(c.nodeType ? c : document.createTextNode(String(c))); }
  function when(t) {
    var m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'just now'; if (m < 60) return m + ' min ago';
    var hr = Math.round(m / 60); if (hr < 24) return hr + (hr === 1 ? ' hour ago' : ' hours ago');
    var d = Math.round(hr / 24); if (d < 7) return d + (d === 1 ? ' day ago' : ' days ago');
    return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function topicName(v) { var t = TOPICS.find(function (x) { return x[0] === v; }); return t ? t[1] : 'Something else'; }
  function pill(status) { var s = STATUS[status] || STATUS.open; return h('span', { class: 'sup-pill ' + s[1] }, s[0]); }
  function params() { var q = location.hash.split('?')[1] || ''; try { return new URLSearchParams(q); } catch (e) { return new URLSearchParams(); } }
  function go(q) { location.hash = '#/support' + (q ? '?' + q : ''); }
  function banner(text, bad) { return h('div', { class: 'banner sup-note' + (bad ? ' banner--warn' : ''), role: bad ? 'alert' : 'status' }, text); }
  function busyBtn(b, on, label) { b.disabled = !!on; if (label) b.textContent = label; }

  // Shrinks a picture to at most 1400px and ~430 KB of JPEG before it is sent.
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) { reject(new Error('Please attach a picture, such as a screenshot.')); return; }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 1400, w = img.naturalWidth, hgt = img.naturalHeight, sc = Math.min(1, max / Math.max(w, hgt));
        var out = '';
        for (var pass = 0; pass < 6; pass++) {
          var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(hgt * sc));
          var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
          out = c.toDataURL('image/jpeg', pass < 3 ? 0.78 - pass * 0.12 : 0.5);
          if (out.length <= 580000) break;
          sc *= 0.75;
        }
        URL.revokeObjectURL(url);
        out.length <= 580000 ? resolve(out) : reject(new Error('This picture is too large. Please attach a smaller screenshot.'));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That picture could not be opened.')); };
      img.src = url;
    });
  }
  function picker(onPick) {
    var holder = h('div', { class: 'sup-attach' }), data = '';
    var inp = h('input', { type: 'file', accept: 'image/*', class: 'sup-sr', id: 'sup-f' + Math.random().toString(36).slice(2, 7) });
    var label = h('label', { class: 'pb-btn pb-btn--secondary sup-attach__btn', for: inp.id }, '📎 Attach a screenshot');
    function show() {
      holder.replaceChildren(inp);
      if (data) holder.append(h('div', { class: 'sup-thumb' }, h('img', { src: data, alt: 'Screenshot to send' }), h('button', { type: 'button', class: 'sup-thumb__x', 'aria-label': 'Remove screenshot', onclick: function () { data = ''; onPick(''); show(); } }, '×')));
      else holder.append(label, h('span', { class: 'fine sup-inline' }, 'Optional. A screenshot helps us fix it faster.'));
    }
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0]; inp.value = '';
      if (!f) return;
      shrink(f).then(function (d) { data = d; onPick(d); show(); }).catch(function (e) { holder.append(banner(e.message, true)); });
    });
    show();
    return holder;
  }
  function diag() {
    var a = acct();
    var d = {
      page: state.lastPage || '', ua: navigator.userAgent, screen: innerWidth + 'x' + innerHeight + '@' + (window.devicePixelRatio || 1),
      lang: navigator.language || '', online: String(navigator.onLine), theme: window.pbTheme ? window.pbTheme.get() : '',
      installed: String(!!(window.matchMedia && matchMedia('(display-mode: standalone)').matches)),
      plan: a ? (a.user && a.user.pro ? 'pro' : 'free') : 'no account'
    };
    var mine = window.caches && caches.keys ? caches.keys().then(function (k) { d.app = (k.find(function (x) { return /^pakkabill-/.test(x); }) || '').replace('pakkabill-', ''); }).catch(function () {}) : Promise.resolve();
    // the newest version on the server, so the assistant can tell an out-of-date app
    var latest = latestVersion().then(function (v) { if (v) d.latest = v; });
    return Promise.all([mine, latest]).then(function () { return d; });
  }
  function latestVersion() {
    var t = new Promise(function (r) { setTimeout(r, 4000); });
    var f = fetch('/sw.js', { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (s) { var m = /pakkabill-(v\d+)/.exec(s || ''); return m ? m[1] : ''; }).catch(function () { return ''; });
    return Promise.race([f, t]);
  }

  /* ---------------- one-tap fixes ---------------- */
  function toast(msg, bad) {
    var old = document.querySelector('.sup-toast'); if (old) old.remove();
    var el = h('div', { class: 'sup-toast' + (bad ? ' is-bad' : ''), role: 'status' }, msg);
    document.body.append(el); setTimeout(function () { el.remove(); }, 4500);
  }
  function updateApp() {
    if (!navigator.onLine) { toast('You are offline. Connect to the internet and tap Update again.', true); return; }
    toast('Updating PakkaBill…');
    var sw = navigator.serviceWorker;
    var regs = sw && sw.getRegistrations ? sw.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.update().catch(function () {}); })); }) : Promise.resolve();
    regs.then(function () {
      // only the app's own saved files are cleared; bills and settings are kept
      return window.caches ? caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return /^pakkabill-/.test(k); }).map(function (k) { return caches.delete(k); })); }) : null;
    }).catch(function () {}).then(function () {
      try { sessionStorage.setItem('pb-updated', '1'); } catch (e) { /* ignore */ }
      location.reload();
    });
  }
  function runAction(a, btn) {
    if (a === 'update') return updateApp();
    if (a === 'refresh_plan') {
      if (!acct()) { location.hash = '#/plan'; return; }
      if (btn) busyBtn(btn, true);
      var p = window.pbRefreshAccount ? window.pbRefreshAccount() : Promise.resolve();
      Promise.resolve(p).then(function () {
        if (btn) busyBtn(btn, false);
        var a2 = acct();
        toast(a2 && a2.user && a2.user.pro ? 'Your plan is refreshed: Pro is on.' : 'Your plan is refreshed.');
      });
      return;
    }
    if (PAGES[a]) location.hash = PAGES[a];
  }
  function actionBar(list) {
    if (!list || !list.length) return null;
    return h('div', { class: 'sup-acts' }, list.filter(function (a) { return ACTIONS[a]; }).map(function (a) {
      var b = h('button', { type: 'button', class: 'sup-act' + (a === 'update' || a === 'refresh_plan' ? ' is-main' : ''), onclick: function () { runAction(a, b); } },
        h('span', { class: 'sup-act__i', 'aria-hidden': 'true' }, ACTIONS[a][0]), ACTIONS[a][1]);
      return b;
    }));
  }

  /* ---------------- phone notifications ---------------- */
  function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && (location.protocol === 'https:' || location.hostname === 'localhost'); }
  function b64(s) { s = (s + '===').slice(0, s.length + (4 - s.length % 4) % 4).replace(/-/g, '+').replace(/_/g, '/'); var raw = atob(s), out = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out; }
  function swReady() {
    return Promise.race([navigator.serviceWorker.getRegistration().then(function (r) { return r || navigator.serviceWorker.register('sw.js'); }).then(function () { return navigator.serviceWorker.ready; }),
      new Promise(function (res, rej) { setTimeout(function () { rej(new Error('Notifications need the app to finish loading. Please try again.')); }, 10000); })]);
  }
  // ask: show the browser's permission prompt (only from a tap). Resolves when this device is registered.
  function enablePush(ask) {
    if (!pushSupported()) return Promise.reject(new Error('This browser cannot show notifications. On iPhone, add PakkaBill to the Home Screen first.'));
    var perm = ask && Notification.permission === 'default' ? Notification.requestPermission() : Promise.resolve(Notification.permission);
    return Promise.resolve(perm).then(function (p) {
      if (p !== 'granted') throw new Error(p === 'denied' ? 'Notifications are blocked for PakkaBill. Allow them in your browser\'s site settings.' : 'Notifications were not turned on.');
      return Promise.all([swReady(), call('pushKey')]);
    }).then(function (r) {
      var reg = r[0], key = b64(r[1].key);
      var sub = function () { return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }); };
      return reg.pushManager.getSubscription().then(function (s) { return s || sub(); })
        .catch(function () { return reg.pushManager.getSubscription().then(function (s) { return s ? s.unsubscribe() : null; }).then(sub); });
    }).then(function (s) {
      ls('pb-push-on', Date.now());
      return call('push', { sub: s.toJSON(), guests: guests() });
    });
  }
  // Keeps this device registered for new guest tickets once notifications are allowed.
  var pushSynced = '';
  function syncPush() {
    if (!pushSupported() || Notification.permission !== 'granted' || (!acct() && !guests().length)) return;
    var sig = (acct() ? 'a' : '') + guests().map(function (g) { return g.id; }).join(',');
    if (pushSynced === sig) return;
    pushSynced = sig;
    enablePush(false).catch(function () { pushSynced = ''; });
  }
  function pushCard() {
    if (!pushSupported() || Notification.permission === 'granted') return null;
    var no = Number(ls('pb-push-no') || 0);
    if (no && Date.now() - no < 14 * 864e5) return null;
    var card = h('div', { class: 'paper sup-push' });
    var on = h('button', { type: 'button', class: 'pb-btn pb-btn--primary' }, 'Turn on');
    var later = h('button', { type: 'button', class: 'pb-btn pb-btn--ghost' }, 'Not now');
    on.onclick = function () {
      busyBtn(on, true, 'Turning on…');
      enablePush(true).then(function () { card.replaceChildren(h('b', null, '🔔 Notifications are on'), h('span', { class: 'fine' }, 'We will tell you on this phone as soon as there is a reply.')); })
        .catch(function (e) { busyBtn(on, false, 'Turn on'); card.append(banner(e.message, true)); });
    };
    later.onclick = function () { ls('pb-push-no', Date.now()); card.remove(); };
    card.append(h('div', { class: 'sup-push__t' }, h('b', null, '🔔 Get a notification when we reply'), h('span', { class: 'fine' }, 'Replies and payment updates reach you even when PakkaBill is closed.')),
      h('div', { class: 'sup-push__a' }, on, later));
    return card;
  }

  /* ---------------- views ---------------- */
  function head(title, sub, back) {
    return h('div', { class: 'page-head' }, h('div', null,
      back ? h('a', { class: 'back', href: '#/support' }, '← Help & support') : null,
      h('h1', { class: 'page-title' }, title), sub ? h('p', { class: 'page-sub' }, sub) : null));
  }

  /* ---------------- guided help: topic, problem, quick questions, instant fix ---------------- */
  var SVG = function (d) { return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
  var TOPIC = {
    bills: ['Bills, PDF & printing', 'PDF, printing, design, logo, bill limit', 'g1', SVG('<path d="M5 3h14v18l-2.5-1.6L14 21l-2-1.6L10 21l-2.5-1.6L5 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>')],
    payment: ['Payment & Pro plan', 'Paid but not active, UTR, renew', 'g3', SVG('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M7 15h4"/>')],
    bug: ['App not working', "Won't open, slow, button or error", 'g5', SVG('<path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>')],
    gst: ['GST & GSTR-1', 'IGST or CGST, HSN, GSTR-1 file', 'g2', SVG('<path d="M3 21h18M6 17v-5M11 17V7M16 17v-8M21 17V4"/>')],
    meesho: ['Meesho tools', 'Listing, P&L, Lens', 'g1', SVG('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>')],
    account: ['Login & account', 'Log in, password, new phone', 'g4', SVG('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>')],
    idea: ['Suggest a feature', 'Tell us what to build next', 'g6', SVG('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>')],
    other: ['Something else', 'Ask us anything', 'g4', SVG('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"/>')]
  };
  var TOPIC_ORDER = ['bills', 'payment', 'bug', 'gst', 'meesho', 'account', 'idea', 'other'];
  var Q = {
    device: { id: 'device', short: 'Device', label: 'Where do you use PakkaBill?', options: ['Android phone', 'iPhone', 'Computer'] },
    page: { id: 'page', short: 'Page', label: 'Which page?', options: ['Bills', 'New bill', 'Items', 'Parties', 'GST summary', 'Shop', 'Plan', 'Meesho tools', 'Other'] },
    utr: { id: 'utr', short: 'UTR', label: 'UTR: the 12-digit UPI transaction ID', type: 'utr', hint: 'PhonePe: "UTR" · Google Pay: "UPI transaction ID" · Paytm: "UPI Ref No." Leave empty if you don\'t have it.' }
  };
  // [id, label, questions]; the id is what the assistant uses to find the right answer
  var PROBLEMS = {
    bills: [
      ['pdf', 'PDF won\'t download or share', [Q.device, { id: 'what', short: 'What happens', label: 'What happens when you tap PDF?', options: ['Nothing happens', 'An error shows', 'File is blank or cut off', 'Asks me to upgrade'] }]],
      ['print', 'Printout is cut off or the wrong size', [{ id: 'printer', short: 'Printer', label: 'Which printer?', options: ['A4 / A5 printer', 'Small thermal printer', 'Save as PDF'] }]],
      ['limit', 'Can\'t make a new bill / asks to upgrade', []],
      ['design', 'Change the bill design or colours', []],
      ['logo', 'Add logo, signature or stamp', []],
      ['lost', 'My bills disappeared', [{ id: 'change', short: 'Changed recently', label: 'Did anything change recently?', options: ['Cleared browser data', 'New phone', 'Different browser', 'Nothing I know of'] }]]
    ],
    payment: [
      ['paid_not_active', 'I paid but Pro is not active', [Q.utr, { id: 'plan', short: 'Plan', label: 'Which plan did you pay for?', options: ['Monthly', 'Yearly', 'Not sure'] }]],
      ['utr_error', 'UTR not accepted or "already submitted"', [Q.utr]],
      ['renew', 'Renew or check my plan', []],
      ['refund', 'I want a refund', [Q.utr]]
    ],
    bug: [
      ['blank', 'App won\'t open or shows a white screen', [Q.device]],
      ['slow', 'App is slow or gets stuck', [Q.page]],
      ['button', 'A button or page doesn\'t work', [Q.page]],
      ['error', 'I see an error message', [Q.page]]
    ],
    gst: [
      ['tax_wrong', 'IGST or CGST + SGST is wrong', []],
      ['hsn', 'HSN code or GST rate', []],
      ['gstr1', 'GSTR-1 file or GST summary', [{ id: 'src', short: 'Sales from', label: 'Which sales?', options: ['My PakkaBill bills', 'Amazon', 'Meesho', 'Flipkart'] }]]
    ],
    meesho: [
      ['listing', 'Meesho listing or bulk upload', []],
      ['pnl', 'Meesho P&L numbers look wrong', []],
      ['lens', 'Meesho Lens shows nothing', []]
    ],
    account: [
      ['login', 'Can\'t log in', []],
      ['forgot', 'Forgot my password', []],
      ['newphone', 'Move PakkaBill to a new phone', []],
      ['install', 'Install PakkaBill on my phone', []]
    ]
  };
  function problemOf(topic, id) { return (PROBLEMS[topic] || []).find(function (p) { return p[0] === id; }); }

  // what the Help page knows about reply times and WhatsApp (cached for 5 minutes)
  function getInfo() {
    if (state.info && Date.now() - state.infoAt < 300000) return Promise.resolve(state.info);
    return call('info').then(function (j) { state.info = j; state.infoAt = Date.now(); return j; }).catch(function () { return { teamText: 'usually within a few hours', whatsapp: '' }; });
  }
  function waLink(no, text) { return 'https://wa.me/91' + no + '?text=' + encodeURIComponent(text); }
  function statusStrip() {
    var strip = h('div', { class: 'sup-status', role: 'note' },
      h('span', { class: 'sup-status__i' }, h('i', { class: 'sup-live', 'aria-hidden': 'true' }), h('b', null, 'Assistant'), ' answers in seconds'),
      h('span', { class: 'sup-status__i', 'data-team': '' }, '👤 ', h('b', null, 'Our team'), ' replies usually within a few hours'));
    getInfo().then(function (inf) {
      var team = strip.querySelector('[data-team]');
      if (team) team.replaceChildren('👤 ', h('b', null, 'Our team'), ' replies ' + (inf.teamText || 'usually within a few hours'));
      if (inf.whatsapp) strip.append(h('a', { class: 'sup-wa', href: waLink(inf.whatsapp, 'Hi PakkaBill support, I need help with: '), target: '_blank', rel: 'noopener' }, h('span', { 'aria-hidden': 'true' }, '💬'), 'WhatsApp us'));
    });
    return strip;
  }
  function topicGrid(small) {
    return h('ul', { class: 'sup-topics' + (small ? ' is-small' : '') }, TOPIC_ORDER.map(function (k) {
      var t = TOPIC[k], ico = h('span', { class: 'sup-topic__ico ' + t[2] }); ico.innerHTML = t[3];
      return h('li', null, h('a', { class: 'sup-topic', href: '#/support?new=1&topic=' + k },
        ico, h('span', { class: 'sup-topic__t' }, h('b', null, t[0]), h('span', null, t[1]))));
    }));
  }
  function steps(n) {
    var names = ['Topic', 'Problem', 'Quick fix', 'Send'];
    return h('ol', { class: 'sup-steps', 'aria-label': 'Step ' + n + ' of 4' }, names.map(function (s, i) {
      return h('li', { class: i + 1 < n ? 'is-done' : i + 1 === n ? 'is-on' : '', 'aria-current': i + 1 === n ? 'step' : null }, h('span', null, i + 1 < n ? '✓' : String(i + 1)), s);
    }));
  }

  function listView(el) {
    var a = acct(), box = h('div', { class: 'sup-list' }, h('p', { class: 'fine' }, 'Loading your tickets…'));
    var fresh = h('div');
    el.replaceChildren(h('div', { class: 'sup' },
      head('Help & support', 'Ask the assistant, or pick a topic. Most answers are instant.'),
      fresh, askCard(), statusStrip(),
      h('section', { class: 'sup-sec', 'aria-labelledby': 'sup-topics-h' },
        h('h2', { id: 'sup-topics-h', class: 'form-sec__title' }, 'Or pick a topic'), topicGrid()),
      h('section', { class: 'sup-sec', 'aria-labelledby': 'sup-h' }, h('h2', { id: 'sup-h', class: 'form-sec__title' }, 'Your tickets'), box),
      !a ? h('p', { class: 'fine sup-foot' }, 'Tickets you raise without an account are kept on this device. Log in on the Plan page to see them on every device.') : null));
    call('list', { guests: guests() }).then(function (j) {
      var unread = j.tickets.filter(function (t) { return t.unread; });
      setUnread(unread.length);
      if (unread.length) {
        var u = unread[0];
        fresh.replaceChildren(h('a', { class: 'paper sup-newreply', href: '#/support?t=' + encodeURIComponent(u.id) },
          h('span', { class: 'sup-newreply__dot', 'aria-hidden': 'true' }), h('span', null, h('b', null, 'New reply on ' + u.no), h('span', null, u.subject)), h('span', { class: 'sup-newreply__go' }, 'Open →')));
      }
      if (!j.tickets.length) { box.replaceChildren(h('div', { class: 'paper sup-empty' }, h('b', null, 'No tickets yet'), h('p', { class: 'fine' }, 'Pick a topic above. You get a quick fix straight away, and you can send a ticket to our team if you still need help.'))); return; }
      box.replaceChildren(h('ul', { class: 'sup-items' }, j.tickets.map(function (t) {
        return h('li', null, h('a', { class: 'paper sup-item' + (t.unread ? ' is-unread' : ''), href: '#/support?t=' + encodeURIComponent(t.id) },
          h('div', { class: 'sup-item__top' }, h('span', { class: 'sup-no' }, t.no), pill(t.status), t.unread ? h('span', { class: 'sup-new' }, 'New reply') : null, h('span', { class: 'sup-when' }, when(t.updatedAt))),
          h('b', { class: 'sup-item__sub' }, t.subject),
          h('span', { class: 'sup-item__last' }, (t.last && t.last.by === 'support' ? 'Support: ' : t.last && t.last.by === 'assistant' ? 'Assistant: ' : t.last && t.last.by === 'system' ? '' : 'You: ') + (t.last ? t.last.text : ''))));
      })), pushCard());
      syncPush();
    }).catch(function (e) { box.replaceChildren(banner(e.message, true)); });
  }

  function newView(el) {
    var p = params(), topic = TOPIC[p.get('topic')] ? p.get('topic') : '', pid = p.get('p') || '';
    var probs = PROBLEMS[topic] || [];
    var prob = problemOf(topic, pid);
    var wrap = function (title, sub, back, n, kids) {
      el.replaceChildren(h('div', { class: 'sup sup-flow' },
        h('div', { class: 'page-head' }, h('div', null,
          h('a', { class: 'back', href: back }, '← Back'),
          h('h1', { class: 'page-title' }, title), sub ? h('p', { class: 'page-sub' }, sub) : null)),
        steps(n), kids));
    };
    // 1. topic
    if (!topic) {
      wrap('What do you need help with?', 'Choose a topic. You get an instant fix for most problems.', '#/support', 1, h('div', null, topicGrid(true)));
      return;
    }
    // 2. problem
    if (probs.length && !prob && pid !== 'other') {
      var ico = h('span', { class: 'sup-topic__ico ' + TOPIC[topic][2] }); ico.innerHTML = TOPIC[topic][3];
      wrap(TOPIC[topic][0], 'Which of these is it?', '#/support?new=1', 2, h('div', { class: 'paper sup-probs' },
        h('ul', { class: 'sup-plist' }, probs.map(function (x) {
          return h('li', null, h('a', { class: 'sup-prob', href: '#/support?new=1&topic=' + topic + '&p=' + x[0] }, h('span', null, x[1]), h('span', { class: 'sup-prob__go', 'aria-hidden': 'true' }, '›')));
        }).concat([h('li', null, h('a', { class: 'sup-prob is-other', href: '#/support?new=1&topic=' + topic + '&p=other' }, h('span', null, 'Something else'), h('span', { class: 'sup-prob__go', 'aria-hidden': 'true' }, '›')))]))));
      return;
    }
    // 3. quick questions and the instant fix, then 4. send to the team
    var label = prob ? prob[1] : (topic === 'idea' ? 'Suggest a feature' : TOPIC[topic][0]);
    var qs = prob ? prob[2] : [];
    var answers = {}, fixShown = false, saidNo = false;
    var backTo = probs.length ? '#/support?new=1&topic=' + topic : '#/support?new=1';
    var body = h('div');
    wrap(label, prob ? 'Answer a quick question and see the fix.' : 'Tell us about it and our team will reply here.', backTo, prob ? 3 : 4, body);
    var compose = function (details) {
      var lines = [label];
      qs.forEach(function (q) { if (answers[q.id]) lines.push('• ' + q.short + ': ' + answers[q.id]); });
      if (details && details.trim()) lines.push('', details.trim());
      return lines.join('\n');
    };
    var qCard = null, fixCard = h('div'), formHolder = h('div');
    if (qs.length) {
      var goBtn = h('button', { type: 'button', class: 'pb-btn pb-btn--primary' }, 'Show me the fix →');
      var qNote = h('div');
      qCard = h('section', { class: 'paper sup-qs' }, qs.map(function (q) {
        if (q.type === 'utr') {
          var inp = h('input', { class: 'pb-input sup-utr', id: 'sup-q-' + q.id, inputmode: 'numeric', maxlength: '16', placeholder: '12-digit number', autocomplete: 'off' });
          inp.addEventListener('input', function () { answers[q.id] = inp.value.replace(/\D/g, ''); });
          return h('div', { class: 'sup-q' }, h('label', { class: 'sup-q__l', for: inp.id }, q.label), inp, q.hint ? h('p', { class: 'fine sup-q__hint' }, q.hint) : null);
        }
        var group = h('div', { class: 'sup-chips', role: 'radiogroup', 'aria-labelledby': 'sup-ql-' + q.id }, q.options.map(function (o) {
          var b = h('button', { type: 'button', class: 'sup-chip', role: 'radio', 'aria-checked': 'false', onclick: function () {
            answers[q.id] = o;
            group.querySelectorAll('.sup-chip').forEach(function (c) { c.setAttribute('aria-checked', String(c === b)); });
          } }, o);
          return b;
        }));
        return h('div', { class: 'sup-q' }, h('div', { class: 'sup-q__l', id: 'sup-ql-' + q.id }, q.label), group);
      }), qNote, h('div', { class: 'sup-actions' }, goBtn));
      goBtn.onclick = function () {
        qNote.replaceChildren();
        var missing = qs.find(function (q) { return q.options && !answers[q.id]; });
        if (missing) { qNote.append(banner('Please choose: ' + missing.label, true)); return; }
        if (answers.utr && answers.utr.length !== 12) { qNote.append(banner('The UTR has exactly 12 digits. Check it, or leave it empty.', true)); return; }
        showFix();
      };
    }
    function showFix() {
      fixShown = true;
      if (qCard) qCard.classList.add('is-done');
      fixCard.replaceChildren(h('section', { class: 'paper sup-fix', role: 'status' },
        h('span', { class: 'sup-who' }, h('i', { class: 'sup-bot', 'aria-hidden': 'true' }, '✦'), 'Quick fix'),
        h('div', { class: 'sup-typing' }, h('span', { class: 'sup-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), 'Checking your account and app…')));
      fixCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      diag().then(function (d) {
        return call('preview', { category: topic, problem: pid, subject: label, message: compose(''), diag: d });
      }).then(function (j) {
        var a = j.answer, wait = a.outcome === 'escalate';
        var yes = h('button', { type: 'button', class: 'pb-btn pb-btn--primary' }, wait ? '👍 OK, thanks' : '👍 Yes, that fixed it');
        var no = h('button', { type: 'button', class: 'pb-btn pb-btn--secondary' }, wait ? '✉️ Send a ticket to the team' : '🙋 No, I still need help');
        yes.onclick = function () {
          call('quickfix', { problem: pid, solved: true }).catch(function () {});
          body.replaceChildren(h('section', { class: 'paper sup-done' }, h('div', { class: 'sup-done__big', 'aria-hidden': 'true' }, '🎉'),
            h('h2', { class: 'form-sec__title' }, wait ? 'Thanks for checking' : 'Great, glad it\'s fixed!'),
            h('p', null, wait ? 'You will get a message on the Help page as soon as it is done.' : 'If it comes back, you can always ask us here.'),
            h('div', { class: 'sup-actions' }, h('a', { class: 'pb-btn pb-btn--primary', href: '#/' }, 'Back to PakkaBill'), h('a', { class: 'pb-btn pb-btn--ghost', href: '#/support' }, 'Help with something else'))));
          el.querySelector('.sup-steps') && el.querySelector('.sup-steps').replaceWith(steps(5));
        };
        no.onclick = function () {
          saidNo = true;
          call('quickfix', { problem: pid, solved: false }).catch(function () {});
          yes.disabled = true; no.disabled = true;
          showForm();
        };
        fixCard.replaceChildren(h('section', { class: 'paper sup-fix' },
          h('span', { class: 'sup-who' }, h('i', { class: 'sup-bot', 'aria-hidden': 'true' }, '✦'), 'Quick fix', h('span', { class: 'sup-auto' }, 'Checked just now')),
          h('p', { class: 'sup-fix__txt' }, a.text), actionBar(a.actions),
          h('div', { class: 'sup-fix__ask' }, h('b', null, wait ? 'Anything else?' : 'Did this fix it?'), h('div', { class: 'sup-actions' }, yes, no))));
      }).catch(function () {
        // offline or server busy: go straight to the ticket form
        fixCard.replaceChildren();
        showForm();
      });
    }
    function showForm() {
      if (formHolder.firstChild) return;
      var a = acct(), img = '';
      var free = !prob;
      var subject = free ? h('input', { class: 'pb-input', id: 'sup-subject', maxlength: '120', placeholder: topic === 'idea' ? 'For example: Add barcode scanning' : 'In a few words', autocomplete: 'off' }) : null;
      var msg = h('textarea', { class: 'pb-input sup-ta', id: 'sup-msg', rows: free ? '5' : '3', maxlength: '2000',
        placeholder: free ? (topic === 'idea' ? 'What should PakkaBill do, and how would it help you?' : 'What happened, and what did you expect?') : 'Anything else we should know? (optional)' });
      var phone = a ? null : h('input', { class: 'pb-input', id: 'sup-phone', inputmode: 'tel', maxlength: '14', placeholder: '98765 43210', autocomplete: 'tel' });
      var name = a ? null : h('input', { class: 'pb-input', id: 'sup-name', maxlength: '60', placeholder: 'Your name or shop name', autocomplete: 'organization' });
      var urgent = topic === 'idea' ? null : h('input', { type: 'checkbox', id: 'sup-urgent' });
      var note = h('div');
      var send = h('button', { type: 'submit', class: 'pb-btn pb-btn--primary' }, 'Send to support');
      var field = function (id, lab, control, hint) { return h('div', { class: 'pb-field' }, h('label', { class: 'pb-field__label', for: id }, lab), control, hint ? h('div', { class: 'pb-field__msg' }, hint) : null); };
      var form = h('form', { class: 'paper sup-form', novalidate: true },
        h('h2', { class: 'form-sec__title' }, free ? (topic === 'idea' ? 'Your idea' : 'Tell us about it') : 'Send it to our team'),
        !free ? h('p', { class: 'fine' }, 'Your answers above and your app details go with it, so there is no need to explain everything again.') : null,
        subject ? field('sup-subject', 'Subject', subject) : null,
        field('sup-msg', free ? 'Message' : 'Details', msg),
        a ? null : h('div', { class: 'sup-grid' }, field('sup-phone', 'Mobile number', phone, 'We reply here, and may also call or WhatsApp you.'), field('sup-name', 'Name (optional)', name)),
        picker(function (d) { img = d; }),
        urgent ? h('label', { class: 'sup-urgent', for: 'sup-urgent' }, urgent, h('span', null, h('b', null, '🚨 This is urgent'), h('span', { class: 'fine' }, 'I can\'t make bills or run my business right now.'))) : null,
        note,
        h('div', { class: 'sup-actions' }, send),
        h('p', { class: 'fine sup-eta', 'data-eta': '' }, 'Our team replies here, usually within a few hours. You get a notification if you turn them on.'));
      getInfo().then(function (inf) { var e = form.querySelector('[data-eta]'); if (e) e.textContent = 'Our team replies here, ' + (inf.teamText || 'usually within a few hours') + '. You get a notification if you turn them on.'; });
      form.addEventListener('submit', function (e) {
        e.preventDefault(); note.replaceChildren();
        if (subject && subject.value.trim().length < 3) { note.append(banner('Add a short subject.', true)); subject.focus(); return; }
        if (free && msg.value.trim().length < 5) { note.append(banner('Tell us a little more.', true)); msg.focus(); return; }
        if (phone && phone.value.replace(/\D/g, '').length < 10) { note.append(banner('Enter your 10-digit mobile number so we can reply.', true)); phone.focus(); return; }
        busyBtn(send, true, 'Sending…');
        diag().then(function (d) {
          return call('create', {
            category: topic, problem: prob ? pid : undefined, tried: !!(fixShown && saidNo), urgent: !!(urgent && urgent.checked),
            subject: subject ? subject.value : label, message: free ? msg.value : compose(msg.value),
            image: img || undefined, phone: phone ? phone.value : undefined, name: name ? name.value : undefined, diag: d
          });
        }).then(function (j) {
          if (j.key) { var g = guests(); g.unshift({ id: j.ticket.id, key: j.key, no: j.ticket.no }); ls(GUEST, g.slice(0, 30)); }
          try { sessionStorage.setItem('pb-support-sent', j.ticket.no); } catch (err) { /* ignore */ }
          syncPush();
          go('t=' + encodeURIComponent(j.ticket.id));
        }).catch(function (err) { busyBtn(send, false, 'Send to support'); note.append(banner(err.message, true)); });
      });
      formHolder.append(form);
      var st = el.querySelector('.sup-steps'); if (st) st.replaceWith(steps(4));
      if (!free) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      (subject || (free ? msg : null)) && (subject || msg).focus({ preventScroll: !free });
    }
    body.append(qCard, fixCard, formHolder);
    if (!prob) showForm();
    else if (!qs.length) showFix();
  }

  function lightbox(src) {
    var box = h('div', { class: 'sup-lb', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Screenshot', tabindex: '-1', onclick: function () { box.remove(); } }, h('img', { src: src, alt: 'Screenshot' }));
    box.addEventListener('keydown', function (e) { if (e.key === 'Escape') box.remove(); });
    document.body.append(box); box.focus();
  }

  function ticketView(el, id, preloaded) {
    var body = h('div', null, h('p', { class: 'fine' }, 'Opening the ticket…'));
    if (!preloaded) el.replaceChildren(h('div', { class: 'sup' }, head('Ticket', '', true), body));
    var k = keyFor(id);
    (preloaded ? Promise.resolve({ ticket: preloaded }) : call('get', { id: id, key: k })).then(function (j) {
      var t = j.ticket, img = '';
      checkUnread(true);
      var sent = ''; try { sent = sessionStorage.getItem('pb-support-sent') || ''; sessionStorage.removeItem('pb-support-sent'); } catch (e) { /* ignore */ }
      var open = t.status !== 'resolved' && t.status !== 'closed';
      var lastIdx = t.messages.length - 1;
      var thread = h('ol', { class: 'sup-thread' }, t.messages.map(function (m, i) {
        if (m.by === 'system') return h('li', { class: 'sup-sys' }, m.text.replace('Status changed to ', 'Marked as ').replace(/\.$/, '') + ' · ' + when(m.at));
        var pic = null;
        if (m.img) {
          pic = h('button', { type: 'button', class: 'sup-pic', 'aria-label': 'Open screenshot' }, 'Loading screenshot…');
          call('image', { id: t.id, key: k, n: m.img }).then(function (r) {
            pic.replaceChildren(h('img', { src: r.image, alt: 'Screenshot' })); pic.onclick = function () { lightbox(r.image); };
          }).catch(function () { pic.textContent = 'Screenshot could not load'; });
        }
        var bot = m.by === 'assistant', them = bot || m.by === 'support';
        return h('li', { class: 'sup-msg ' + (them ? 'is-them' : 'is-me') + (bot ? ' is-bot' : '') },
          bot ? h('span', { class: 'sup-who' }, h('i', { class: 'sup-bot', 'aria-hidden': 'true' }, '✦'), 'PakkaBill assistant', h('span', { class: 'sup-auto' }, 'Instant answer')) : null,
          h('div', { class: 'sup-bubble' }, m.text ? h('p', null, m.text) : null, pic, them && (open || i === lastIdx) ? actionBar(m.actions) : null),
          h('span', { class: 'sup-meta' }, (bot ? 'Checked your account and app' : m.by === 'support' ? 'PakkaBill support' : 'You') + ' · ' + when(m.at)));
      }));
      // the assistant is still investigating: show it working, then swap in its answer
      if (t.ai === 'pending') {
        var steps = ['Checking your account and plan…', 'Looking at your payments…', 'Checking the app version on this phone…', 'Matching known fixes…', 'Writing your answer…'];
        var stepEl = h('span', null, steps[0]), n = 0;
        thread.append(h('li', { class: 'sup-msg is-them is-bot' },
          h('span', { class: 'sup-who' }, h('i', { class: 'sup-bot', 'aria-hidden': 'true' }, '✦'), 'PakkaBill assistant'),
          h('div', { class: 'sup-bubble sup-typing', role: 'status' }, h('span', { class: 'sup-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), stepEl)));
        var tick = setInterval(function () { if (!stepEl.isConnected) { clearInterval(tick); return; } n = Math.min(n + 1, steps.length - 1); stepEl.textContent = steps[n]; }, 1600);
        state.tries = state.tries || {};
        state.tries[t.id] = (state.tries[t.id] || 0) + 1;
        call('assist', { id: t.id, key: k }).then(function (r) {
          clearInterval(tick);
          if (state.el !== el || location.hash !== state.renderedHash) return;
          // still pending: another check is running; look again shortly (a few times at most)
          if (r.ticket.ai === 'pending') {
            if (state.tries[t.id] < 8) setTimeout(function () { if (state.el === el && location.hash === state.renderedHash) ticketView(el, id); }, 3000);
            else ticketView(el, id, Object.assign({}, r.ticket, { ai: 'human' }));
            return;
          }
          ticketView(el, id, r.ticket);
        }).catch(function () {
          clearInterval(tick);
          if (state.el === el && location.hash === state.renderedHash) ticketView(el, id, Object.assign({}, t, { ai: 'human' }));
        });
      }
      // under the assistant's latest answer: did it help?
      var lastMsg = t.messages[lastIdx];
      var ask = null;
      if (open && lastMsg && lastMsg.by === 'assistant' && t.ai !== 'pending' && !t.feedback) {
        var yes = h('button', { type: 'button', class: 'pb-btn pb-btn--primary' }, '👍 Yes, it\'s solved');
        var no = h('button', { type: 'button', class: 'pb-btn pb-btn--secondary' }, t.ai === 'human' ? 'Add more details' : '🙋 I still need help');
        var fb = function (solved) {
          busyBtn(yes, true); busyBtn(no, true);
          call('feedback', { id: t.id, key: k, solved: solved }).then(function (r) { ticketView(el, id, r.ticket); })
            .catch(function (e) { busyBtn(yes, false); busyBtn(no, false); ask.append(banner(e.message, true)); });
        };
        yes.onclick = function () { fb(true); };
        no.onclick = t.ai === 'human' ? function () { var ta2 = el.querySelector('.sup-reply textarea'); if (ta2) ta2.focus(); } : function () { fb(false); };
        ask = h('div', { class: 'paper sup-ask' }, h('b', null, 'Did this solve your problem?'), h('div', { class: 'sup-actions' }, yes, no));
      }
      var human = open && t.ai === 'human' && lastMsg && lastMsg.by !== 'support'
        ? h('p', { class: 'fine sup-human' }, '👤 A person from our team will reply here, usually within a few hours.' + (pushSupported() && Notification.permission === 'granted' ? ' We will send you a notification.' : ''))
        : null;
      if (human) getInfo().then(function (inf) {
        human.firstChild.textContent = '👤 A person from our team will reply here, ' + (inf.teamText || 'usually within a few hours') + '.' + (pushSupported() && Notification.permission === 'granted' ? ' We will send you a notification.' : '');
        if (inf.whatsapp) human.append(h('br'), h('a', { class: 'sup-wa sup-wa--inline', href: waLink(inf.whatsapp, 'Hi PakkaBill support, about my ticket ' + t.no + ': ' + t.subject), target: '_blank', rel: 'noopener' }, h('span', { 'aria-hidden': 'true' }, '💬'), 'Need it faster? WhatsApp us'));
      });
      var ta = h('textarea', { class: 'pb-input sup-ta', rows: '3', maxlength: '2000', placeholder: 'Write a reply…', 'aria-label': 'Your reply' });
      var note = h('div'), send = h('button', { type: 'submit', class: 'pb-btn pb-btn--primary' }, 'Send reply');
      var form = h('form', { class: 'paper sup-reply' },
        !open ? h('p', { class: 'fine' }, 'This ticket is ' + (STATUS[t.status] || STATUS.open)[0].toLowerCase() + '. If you still need help, reply and it opens again.') : null,
        ta, picker(function (d) { img = d; }), note, h('div', { class: 'sup-actions' }, send));
      form.addEventListener('submit', function (e) {
        e.preventDefault(); note.replaceChildren();
        if (!ta.value.trim() && !img) { note.append(banner('Write a message first.', true)); return; }
        busyBtn(send, true, 'Sending…');
        diag().then(function (d) { return call('reply', { id: t.id, key: k, message: ta.value, image: img || undefined, diag: d }); })
          .then(function (r) { ticketView(el, id, r.ticket); })
          .catch(function (err) { busyBtn(send, false, 'Send reply'); note.append(banner(err.message, true)); });
      });
      var updated = ''; try { updated = sessionStorage.getItem('pb-updated') || ''; sessionStorage.removeItem('pb-updated'); } catch (e) { /* ignore */ }
      el.replaceChildren(h('div', { class: 'sup' },
        head(t.subject, null, true),
        h('div', { class: 'sup-tmeta' }, h('span', { class: 'sup-no' }, t.no), pill(t.status), h('span', null, topicName(t.category)), h('span', null, 'Raised ' + when(t.createdAt))),
        updated ? banner('PakkaBill is updated to the latest version. Check if the problem is gone.') : null,
        sent ? banner('Ticket ' + sent + ' sent.' + (t.ai === 'pending' ? ' Our assistant is checking it now.' : ' We will reply here, usually within a day.')) : null,
        h('section', { class: 'paper sup-conv' }, thread, human), ask, pushCard(), form));
      syncPush();
    }).catch(function (e) { body.replaceChildren(banner(e.message, true)); if (preloaded) el.replaceChildren(h('div', { class: 'sup' }, head('Ticket', '', true), body)); });
  }

  /* ---------------- chat with the assistant ---------------- */
  var CHAT = 'pb-chat', CHAT_DAYS = 3;
  var POPULAR = ['How do I make a bill?', 'Add my logo and signature', 'PDF is not downloading', 'Move PakkaBill to a new phone', 'How do I file GSTR-1?', 'What do I get with Pro?'];
  // What people usually ask on the page the customer came from.
  var PAGE_HELP = [
    [/^#\/(new|edit)/, 'New bill', ['How do I add items to a bill?', 'Give a discount on a bill', 'Rates including GST', 'Add e-way bill or vehicle number']],
    [/^#\/bill\//, 'a bill', ['Send this bill on WhatsApp', 'Download a bill as PDF', 'Print duplicate copies', 'Edit or cancel a bill']],
    [/^#\/items/, 'Items', ['Add a product with HSN', 'GST rate for clothes', 'Which HSN code should I use?']],
    [/^#\/parties/, 'Parties', ['Add a customer', 'GSTIN and state', 'Edit or delete a party']],
    [/^#\/shop/, 'Shop', ['Add my logo and signature', 'Add UPI QR on bills', 'Take a backup', 'Change invoice number']],
    [/^#\/reports/, 'GST summary', ['GSTR-1 files for my CA', 'Why is IGST charged?', 'How do I file GSTR-1?']],
    [/^#\/gstr1/, 'GSTR-1 JSON', ['How do I file GSTR-1 from Meesho?', 'Amazon GST report for GSTR-1']],
    [/^#\/listing/, 'Meesho listing', ['How to use Meesho listing', 'Meesho bulk upload template']],
    [/^#\/lens/, 'Meesho Lens', ['Install Meesho Lens', 'Use Meesho Lens on my phone']],
    [/^#\/pnl/, 'Meesho P&L', ['How to use Meesho P&L', 'Combo pack pieces are wrong']],
    [/^#\/plan/, 'Plan', ['Am I on Pro?', 'What do I get with Pro?', 'How do I pay for Pro?', 'I paid but Pro is not active']]
  ];
  function pageHelp() { var r = state.lastPage || ''; var m = PAGE_HELP.find(function (x) { return x[0].test(r); }); return m ? { name: m[1], qs: m[2] } : null; }
  function welcome() {
    var ph = pageHelp();
    return { role: 'assistant', welcome: true,
      text: 'Namaste! 👋 I\'m the PakkaBill assistant. Ask me how to do anything in PakkaBill, or tell me what is not working, and I\'ll check your account and app. English, Hindi or Hinglish is fine.' + (ph ? '\n\nYou came from ' + ph.name + '. People there often ask:' : ''),
      suggestions: ph ? ph.qs : POPULAR.slice(0, 4) };
  }
  function chatLoad() {
    var c = ls(CHAT);
    return c && Array.isArray(c.msgs) && Date.now() - (c.at || 0) < CHAT_DAYS * 864e5 ? c.msgs : [];
  }
  function chatSave(msgs) { ls(CHAT, { at: Date.now(), msgs: msgs.slice(-40) }); }
  var Speech = window.SpeechRecognition || window.webkitSpeechRecognition;

  // The "Ask the assistant" box at the top of the Help page.
  function askCard() {
    var inp = h('input', { class: 'pb-input sup-ask__in', type: 'text', maxlength: '500', placeholder: 'Type your question…', 'aria-label': 'Your question', enterkeyhint: 'send' });
    var go2 = function (q) { q = String(q || '').trim(); if (!q) { inp.focus(); return; } state.pendingQ = q; go('chat=1'); };
    var form = h('form', { class: 'sup-ask__row', onsubmit: function (e) { e.preventDefault(); go2(inp.value); } },
      inp, micBtn(inp), h('button', { type: 'submit', class: 'sup-send', 'aria-label': 'Ask' }, '➤'));
    var saved = chatLoad().filter(function (m) { return !m.welcome; });
    return h('section', { class: 'paper sup-askcard', 'aria-labelledby': 'sup-ask-h' },
      h('div', { class: 'sup-askcard__top' },
        h('span', { class: 'sup-avatar', 'aria-hidden': 'true' }, '✦'),
        h('div', null, h('h2', { id: 'sup-ask-h', class: 'sup-askcard__t' }, 'Ask the PakkaBill assistant'),
          h('span', { class: 'sup-askcard__s' }, h('i', { class: 'sup-live', 'aria-hidden': 'true' }), 'Online · answers in seconds · English or Hindi'))),
      form,
      h('div', { class: 'sup-sugs' }, ((pageHelp() || {}).qs || POPULAR).slice(0, 4).map(function (s) { return h('button', { type: 'button', class: 'sup-sug', onclick: function () { go2(s); } }, s); })),
      h('div', { class: 'sup-askcard__links' },
        saved.length ? h('a', { class: 'sup-continue', href: '#/support?chat=1' }, 'Continue your last chat →') : null,
        h('a', { class: 'sup-continue', href: '#/support?guide=1' }, '📚 Browse all help topics')));
  }

  function micBtn(target, onDone) {
    if (!Speech) return null;
    var b = h('button', { type: 'button', class: 'sup-mic', 'aria-label': 'Speak your question', title: 'Speak (English or Hindi)' });
    b.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
    var rec = null;
    b.onclick = function () {
      if (rec) { rec.stop(); return; }
      try { rec = new Speech(); } catch (e) { return; }
      rec.lang = /^hi/.test(navigator.language || '') ? 'hi-IN' : 'en-IN';
      rec.interimResults = true;
      rec.onresult = function (ev) { var t = ''; for (var i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript; target.value = t; };
      rec.onend = function () { rec = null; b.classList.remove('is-on'); if (onDone && target.value.trim()) onDone(); };
      rec.onerror = function () { rec = null; b.classList.remove('is-on'); };
      b.classList.add('is-on'); rec.start();
    };
    return b;
  }

  function chatView(el) {
    var msgs = chatLoad();
    if (!msgs.length) msgs = [welcome()];
    var busy = false, dg = null;
    var list = h('ol', { class: 'sup-chat', 'aria-live': 'polite' });
    var ta = h('textarea', { class: 'pb-input sup-chat__in', rows: '1', maxlength: '1000', placeholder: 'Ask anything about PakkaBill…', 'aria-label': 'Your message', enterkeyhint: 'send' });
    var sendBtn = h('button', { type: 'submit', class: 'sup-send', 'aria-label': 'Send' }, '➤');
    var person = h('button', { type: 'button', class: 'sup-person' }, '👤 Talk to a person');
    var handoffBox = h('div');
    var composer = h('form', { class: 'sup-composer' }, h('div', { class: 'sup-composer__row' }, ta, micBtn(ta, function () { send(ta.value); }), sendBtn), h('div', { class: 'sup-composer__foot' }, person, h('span', { class: 'fine' }, 'Answers come from PakkaBill\'s guide and your account.')));
    var newBtn = h('button', { type: 'button', class: 'pb-btn pb-btn--ghost sup-newchat' }, '+ New chat');
    el.replaceChildren(h('div', { class: 'sup sup-chatpage' },
      h('div', { class: 'page-head sup-chathead' }, h('div', null,
        h('a', { class: 'back', href: '#/support' }, '← Help & support'),
        h('h1', { class: 'page-title' }, 'PakkaBill assistant'),
        h('p', { class: 'page-sub' }, h('i', { class: 'sup-live', 'aria-hidden': 'true' }), ' Online · answers in seconds')),
        h('div', { class: 'sup-chathead__act' }, h('a', { class: 'pb-btn pb-btn--ghost sup-newchat', href: '#/support?guide=1' }, '📚 Topics'), newBtn)),
      h('section', { class: 'paper sup-chatbox' }, list, handoffBox), composer));
    var autosize = function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 132) + 'px'; };
    ta.addEventListener('input', autosize);
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(ta.value); } });
    composer.addEventListener('submit', function (e) { e.preventDefault(); send(ta.value); });
    newBtn.onclick = function () { msgs = [welcome()]; chatSave([]); handoffBox.replaceChildren(); draw(); ta.focus(); };
    person.onclick = function () { showHandoff(); };

    function bubble(m, i) {
      var last = i === msgs.length - 1;
      if (m.role === 'user') return h('li', { class: 'sup-cm is-me' }, h('div', { class: 'sup-cm__b' }, m.text));
      var fb = null;
      if (last && !m.welcome && !m.error) {
        fb = h('div', { class: 'sup-fb' }, m.fb ? h('span', { class: 'fine' }, m.fb === 'up' ? 'Thanks for the feedback! 🙏' : 'Sorry about that. Try asking another way, or talk to a person.')
          : [h('span', { class: 'fine' }, 'Helpful?'),
            h('button', { type: 'button', class: 'sup-fbb', 'aria-label': 'Yes, helpful', onclick: function () { rate(m, true); } }, '👍'),
            h('button', { type: 'button', class: 'sup-fbb', 'aria-label': 'Not helpful', onclick: function () { rate(m, false); } }, '👎')]);
      }
      return h('li', { class: 'sup-cm is-bot' },
        h('span', { class: 'sup-avatar sup-avatar--sm', 'aria-hidden': 'true' }, '✦'),
        h('div', { class: 'sup-cm__col' },
          h('div', { class: 'sup-cm__b' }, h('p', null, m.text), speakBtn(m.text), actionBar(m.actions),
            m.error ? h('button', { type: 'button', class: 'sup-act', onclick: function () { msgs.pop(); var q = msgs.pop(); draw(); send(q ? q.text : ''); } }, '⟳ Try again') : null,
            last && (m.handoff || m.fb === 'down') ? h('button', { type: 'button', class: 'sup-act is-main', onclick: showHandoff }, '👤 Talk to a person') : null),
          last && m.suggestions && m.suggestions.length ? h('div', { class: 'sup-sugs' }, m.suggestions.map(function (s) { return h('button', { type: 'button', class: 'sup-sug', onclick: function () { send(s); } }, s); })) : null,
          fb));
    }
    function draw(typing) {
      list.replaceChildren.apply(list, msgs.map(bubble));
      if (typing) list.append(h('li', { class: 'sup-cm is-bot' }, h('span', { class: 'sup-avatar sup-avatar--sm', 'aria-hidden': 'true' }, '✦'),
        h('div', { class: 'sup-cm__b sup-typing', role: 'status' }, h('span', { class: 'sup-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), 'Checking…')));
      var tail = list.lastElementChild;
      if (tail && msgs.length > 1) tail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    function rate(m, up) {
      m.fb = up ? 'up' : 'down'; chatSave(msgs); draw();
      call('chatfb', { helpful: up }).catch(function () {});
    }
    function send(text) {
      text = String(text || '').trim();
      if (!text || busy) return;
      busy = true; busyBtn(sendBtn, true);
      ta.value = ''; autosize();
      handoffBox.replaceChildren();
      msgs = msgs.filter(function (m) { return !m.error; });
      msgs.push({ role: 'user', text: text });
      chatSave(msgs); draw(true);
      (dg ? Promise.resolve(dg) : diag().then(function (d) { dg = d; return d; })).then(function (d) {
        var hist = msgs.filter(function (m) { return !m.welcome; }).map(function (m) { return { role: m.role, text: m.text }; }).slice(-12);
        return call('chat', { messages: hist, diag: d });
      }).then(function (j) {
        var r = j.reply;
        msgs.push({ role: 'assistant', text: r.text, actions: r.actions, suggestions: r.suggestions, handoff: r.handoff, source: r.source });
      }).catch(function (e) {
        msgs.push({ role: 'assistant', text: 'I could not reach PakkaBill just now (' + e.message.replace(/\.$/, '') + '). Check your internet and try again.', error: true });
      }).then(function () {
        busy = false; busyBtn(sendBtn, false);
        chatSave(msgs); draw();
        if (matchMedia('(pointer: fine)').matches) ta.focus();
      });
    }
    // Sends this chat to the support team as a ticket (they reply on the Help page).
    function showHandoff() {
      if (handoffBox.firstChild) { handoffBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
      var a = acct();
      var asked = msgs.filter(function (m) { return m.role === 'user'; });
      var extra = h('textarea', { class: 'pb-input sup-ta', rows: '2', maxlength: '600', placeholder: asked.length ? 'Anything to add? (optional)' : 'What do you need help with?' });
      var phone = a ? null : h('input', { class: 'pb-input', inputmode: 'tel', maxlength: '14', placeholder: 'Your 10-digit mobile number', autocomplete: 'tel', 'aria-label': 'Mobile number' });
      var ok2 = h('button', { type: 'submit', class: 'pb-btn pb-btn--primary' }, 'Send to our team');
      var note = h('div');
      var form = h('form', { class: 'sup-handoff' },
        h('b', null, 'Send this chat to our support team'),
        h('p', { class: 'fine' }, 'A person reads your chat and replies on the Help page, usually within a few hours. Your app details go with it.'),
        extra, phone, note,
        h('div', { class: 'sup-actions' }, ok2, h('button', { type: 'button', class: 'pb-btn pb-btn--ghost', onclick: function () { handoffBox.replaceChildren(); } }, 'Cancel')));
      getInfo().then(function (inf) { var p2 = form.querySelector('p'); if (p2) p2.textContent = 'A person reads your chat and replies on the Help page, ' + (inf.teamText || 'usually within a few hours') + '. Your app details go with it.'; });
      form.addEventListener('submit', function (e) {
        e.preventDefault(); note.replaceChildren();
        if (!asked.length && extra.value.trim().length < 5) { note.append(banner('Tell us a little about what you need.', true)); extra.focus(); return; }
        if (phone && phone.value.replace(/\D/g, '').length < 10) { note.append(banner('Enter your 10-digit mobile number so we can reply.', true)); phone.focus(); return; }
        busyBtn(ok2, true, 'Sending…');
        // the customer's words in full, the assistant's answers shortened; oldest lines go first if it is long
        var lines = msgs.filter(function (m) { return !m.welcome && !m.error; }).map(function (m) {
          var t2 = m.text.replace(/\s+/g, ' ');
          return m.role === 'user' ? 'You: ' + t2 : 'Assistant: ' + (t2.length > 140 ? t2.slice(0, 140) + '…' : t2);
        });
        while (lines.length > 1 && lines.join('\n').length > 1700) lines.shift();
        var transcript = lines.join('\n');
        var first = asked.length ? asked[0].text : extra.value;
        var message = (extra.value.trim() ? extra.value.trim() + '\n\n' : '') + (lines.length ? 'Chat with the assistant:\n' + transcript : '');
        (dg ? Promise.resolve(dg) : diag()).then(function (d) {
          return call('create', { category: 'other', subject: first.slice(0, 110), message: message || first, tried: lines.length > 0, phone: phone ? phone.value : undefined, diag: d });
        }).then(function (j) {
          if (j.key) { var g = guests(); g.unshift({ id: j.ticket.id, key: j.key, no: j.ticket.no }); ls(GUEST, g.slice(0, 30)); }
          try { sessionStorage.setItem('pb-support-sent', j.ticket.no); } catch (err) { /* ignore */ }
          msgs.push({ role: 'assistant', text: 'I have sent this chat to our support team as ticket ' + j.ticket.no + '. They will reply on the Help page.', welcome: true });
          chatSave(msgs);
          syncPush();
          go('t=' + encodeURIComponent(j.ticket.id));
        }).catch(function (err) { busyBtn(ok2, false, 'Send to our team'); note.append(banner(err.message, true)); });
      });
      handoffBox.append(form);
      form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      (phone || extra).focus({ preventScroll: true });
    }
    draw();
    var q = state.pendingQ; state.pendingQ = '';
    if (q) send(q);
  }


  /* ---------------- read aloud ---------------- */
  function speakBtn(text) {
    if (!('speechSynthesis' in window) || !text) return null;
    var b = h('button', { type: 'button', class: 'sup-speak', 'aria-label': 'Read this answer aloud', title: 'Read aloud' }, '🔊');
    b.onclick = function () {
      var synth = window.speechSynthesis;
      if (synth.speaking) { synth.cancel(); if (b.classList.contains('is-on')) { b.classList.remove('is-on'); return; } }
      document.querySelectorAll('.sup-speak.is-on').forEach(function (x) { x.classList.remove('is-on'); });
      var u = new SpeechSynthesisUtterance(text.replace(/[•✓✦➤→]/g, ' '));
      u.lang = /[ऀ-ॿ]/.test(text) ? 'hi-IN' : 'en-IN';
      var v = synth.getVoices().find(function (x) { return x.lang && x.lang.replace('_', '-').toLowerCase() === u.lang.toLowerCase(); });
      if (v) u.voice = v;
      u.rate = 0.95;
      u.onend = u.onerror = function () { b.classList.remove('is-on'); };
      b.classList.add('is-on');
      synth.speak(u);
    };
    return b;
  }

  /* ---------------- Help Center: every answer, searchable ---------------- */
  function helpCenterView(el) {
    var p = params(), openId = p.get('a') || '';
    var q = h('input', { class: 'pb-input sup-hc__q', type: 'search', placeholder: 'Search help, e.g. logo, backup, GSTR-1', 'aria-label': 'Search help topics' });
    var list = h('div', { class: 'sup-hc__list' }, h('p', { class: 'fine' }, 'Loading help topics…'));
    el.replaceChildren(h('div', { class: 'sup' },
      h('div', { class: 'page-head' }, h('div', null,
        h('a', { class: 'back', href: '#/support' }, '← Help & support'),
        h('h1', { class: 'page-title' }, 'Help Center'),
        h('p', { class: 'page-sub' }, 'Every answer in one place. Tap a question to read it.'))),
      h('div', { class: 'paper sup-hc__bar' }, q, h('a', { class: 'pb-btn pb-btn--primary sup-hc__ask', href: '#/support?chat=1' }, '✦ Ask the assistant')),
      list));
    var data = null;
    var norm = function (x) { return String(x || '').toLowerCase(); };
    function draw() {
      var terms = norm(q.value).split(/\s+/).filter(function (w) { return w.length > 1; });
      var arts = data.articles.filter(function (a) { var hay = norm(a.title + ' ' + a.text); return terms.every(function (w) { return hay.indexOf(w) >= 0; }); });
      if (!arts.length) {
        var ask = q.value.trim();
        list.replaceChildren(h('div', { class: 'paper sup-empty' }, h('b', null, 'No topic matches "' + ask + '"'),
          h('p', { class: 'fine' }, 'Ask the assistant in your own words; it also checks your account and app.'),
          h('button', { type: 'button', class: 'pb-btn pb-btn--primary', onclick: function () { state.pendingQ = ask; go('chat=1'); } }, 'Ask: "' + ask.slice(0, 40) + '"')));
        return;
      }
      var groups = {};
      if (terms.length) {
        // searching: one list, best match first (words in the question count most)
        var rank = function (a) { var t = norm(a.title), x = norm(a.text); return terms.reduce(function (n, w) { return n + (t.indexOf(w) >= 0 ? 10 : 0) + Math.min(3, x.split(w).length - 1); }, 0); };
        groups.results = arts.slice().sort(function (m, n) { return rank(n) - rank(m); });
      } else arts.forEach(function (a) { (groups[a.topic] = groups[a.topic] || []).push(a); });
      var names = terms.length ? { results: 'Results for "' + q.value.trim() + '"' } : data.topics;
      var order = Object.keys(names).filter(function (k) { return groups[k]; });
      list.replaceChildren.apply(list, order.map(function (k) {
        return h('section', { class: 'sup-hc__sec' }, h('h2', { class: 'form-sec__title' }, names[k] + ' ', h('span', { class: 'sup-hc__n' }, String(groups[k].length))),
          h('div', { class: 'paper sup-hc__items' }, groups[k].map(function (a) {
            var d = h('details', { class: 'sup-hc__item', id: 'hc-' + a.id, open: a.id === openId || (terms.length > 0 && arts.length <= 2) },
              h('summary', null, h('span', null, a.title)),
              h('div', { class: 'sup-hc__body' }, h('p', null, a.text),
                h('div', { class: 'sup-hc__tools' }, speakBtn(a.text), actionBar(a.actions)),
                h('div', { class: 'sup-hc__foot' },
                  h('button', { type: 'button', class: 'sup-person', onclick: function () { state.pendingQ = a.title; go('chat=1'); } }, '✦ Ask a follow-up'),
                  a.related && a.related.length ? h('span', { class: 'fine' }, 'Related: ', a.related.map(function (r, i) { return h('button', { type: 'button', class: 'sup-hc__rel', onclick: function () { q.value = ''; openId = (data.articles.find(function (x) { return x.title === r; }) || {}).id || ''; draw(); var t2 = document.getElementById('hc-' + openId); if (t2) t2.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, r + (i < a.related.length - 1 ? ',' : '')); })) : null)));
            return d;
          })));
      }));
      if (openId) { var t = document.getElementById('hc-' + openId); if (t) t.scrollIntoView({ block: 'center' }); openId = ''; }
    }
    var timer = null;
    q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { if (data) draw(); }, 120); });
    // show the last copy straight away (works offline), then the latest from the server
    if (state.hc) { data = state.hc; draw(); }
    call('guide').then(function (j) { state.hc = j; data = j; if (list.isConnected) draw(); })
      .catch(function (e) { if (!data) list.replaceChildren(banner(e.message, true)); });
  }

  function render() {
    var el = state.el; if (!el || !el.isConnected) return;
    state.renderedHash = location.hash;
    var p = params();
    if (p.get('t')) ticketView(el, p.get('t')); else if (p.get('chat')) chatView(el); else if (p.get('guide')) helpCenterView(el); else if (p.get('new')) newView(el); else listView(el);
  }

  var CSS = '.sup{min-width:0}.sup .page-title{font-size:clamp(30px,6vw,46px)}.sup-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}'
    + '.sup-hero{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:18px 22px;margin-bottom:18px;border-radius:14px;background-image:linear-gradient(120deg,rgba(108,77,255,.1),rgba(255,122,89,.1))}'
    + '.sup-hero p{margin:4px 0 0;color:var(--ink-2);max-width:56ch}.sup-hero .pb-btn{display:inline-flex}'
    + '.sup-sec .form-sec__title{margin:0 0 10px}.sup-items{list-style:none;margin:0;padding:0;display:grid;gap:10px}'
    + '.sup-item{display:grid;gap:4px;padding:14px 16px;border-radius:12px;color:var(--ink);text-decoration:none;border:1.5px solid transparent}.sup-item:hover{border-color:var(--carbon)}'
    + '.sup-item.is-unread{border-color:var(--carbon);background:var(--carbon-tint)}'
    + '.sup-item__top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.sup-when{margin-left:auto;font-size:12.5px;color:var(--ink-3,var(--ink-2))}'
    + '.sup-no{font-weight:700;font-size:13px;color:var(--carbon);letter-spacing:.02em}.sup-item__sub{font-size:16px}.sup-item__last{font-size:13.5px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.sup-new{font-size:11.5px;font-weight:700;color:#fff;background:#e0603f;border-radius:999px;padding:1px 8px}'
    + '.sup-pill{font-size:11.5px;font-weight:700;border-radius:999px;padding:1px 9px}.sup-pill.is-open{background:var(--carbon-tint);color:var(--carbon)}.sup-pill.is-progress{background:#fff1d6;color:#8a5a00}.sup-pill.is-waiting{background:#ffe3dc;color:#b3401f}.sup-pill.is-resolved{background:var(--green-soft);color:var(--green)}.sup-pill.is-closed{background:var(--desk-2,#eee);color:var(--ink-2)}'
    + '.sup-empty{padding:18px 20px;border-radius:12px}.sup-empty p{margin:4px 0 0}.sup-foot{margin-top:14px}'
    + '.sup-form,.sup-reply,.sup-conv{padding:18px 20px;border-radius:14px;margin-bottom:14px}.sup-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr));gap:14px 20px;margin-bottom:14px}'
    + '.sup-ta{height:auto!important;min-height:96px;resize:vertical;line-height:1.45!important;width:100%}.sup-form .pb-field{margin-bottom:12px}'
    + '.sup-attach{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:10px 0}.sup-attach__btn{display:inline-flex;cursor:pointer}.sup-inline{margin:0}'
    + '.sup-thumb{position:relative;display:inline-block}.sup-thumb img{display:block;max-width:180px;max-height:140px;border-radius:10px;border:1px solid var(--rule)}'
    + '.sup-thumb__x{position:absolute;top:-8px;right:-8px;width:28px;height:28px;border-radius:50%;border:0;background:#1d1838;color:#fff;font-size:17px;line-height:1;cursor:pointer}'
    + '.sup-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}.sup-actions .pb-btn{display:inline-flex}.sup-note{margin:10px 0}'
    + '.sup-tmeta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:-6px 0 14px;font-size:13.5px;color:var(--ink-2)}'
    + '.sup-thread{list-style:none;margin:0;padding:0;display:grid;gap:14px}'
    + '.sup-msg{display:grid;gap:3px;max-width:min(560px,88%)}.sup-msg.is-me{justify-self:end;justify-items:end}.sup-msg.is-them{justify-self:start}'
    + '.sup-bubble{padding:10px 14px;border-radius:16px;font-size:15px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}.sup-bubble p{margin:0}'
    + '.sup-msg.is-me .sup-bubble{background:var(--btn-bg);color:var(--btn-fg);border-bottom-right-radius:5px}.sup-msg.is-them .sup-bubble{background:var(--carbon-tint);color:var(--ink);border:1px solid var(--rule);border-bottom-left-radius:5px}'
    + '.sup-meta{font-size:12px;color:var(--ink-3,var(--ink-2))}.sup-sys{justify-self:center;font-size:12.5px;color:var(--ink-2);background:var(--desk);border-radius:999px;padding:3px 12px}'
    + '.sup-pic{display:block;margin-top:8px;padding:0;border:0;background:none;color:inherit;cursor:zoom-in;font:inherit;font-size:13px}.sup-pic img{display:block;max-width:240px;max-height:200px;border-radius:10px}'
    + '.sup-lb{position:fixed;inset:0;z-index:1200;background:rgba(10,8,24,.82);display:grid;place-items:center;padding:16px;cursor:zoom-out}.sup-lb img{max-width:100%;max-height:100%;border-radius:10px}'
    /* unread dot on the Help button, the side menu and the Tools tile */
    + 'html.pb-has-reply .topbar__help,html.pb-has-reply .spine__help{position:relative}html.pb-has-reply .topbar__help:after,html.pb-has-reply .spine__help:after,html.pb-has-reply .spine-nav a[href="#/support"]:after,html.pb-has-reply .pbt__tile[href="#/support"] .pbt__ico:after{content:"";position:absolute;width:10px;height:10px;border-radius:50%;background:#e0603f;box-shadow:0 0 0 2px var(--paper)}'
    + 'html.pb-has-reply .spine__help:after{top:8px;right:10px}'
    + 'html.pb-has-reply .topbar__help:after{top:-2px;right:-2px}html.pb-has-reply .spine-nav a[href="#/support"]:after{right:18px;top:50%;margin-top:-5px}html.pb-has-reply .pbt__tile[href="#/support"] .pbt__ico{position:relative}html.pb-has-reply .pbt__tile[href="#/support"] .pbt__ico:after{top:-3px;right:-3px}'
    /* assistant answers, fix buttons, feedback, notifications */
    + '.sup-who{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--carbon)}.sup-bot{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:linear-gradient(135deg,#6c4dff,#ff7a59);color:#fff;font-style:normal;font-size:11px}'
    + '.sup-auto{font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#1f7a4d;background:rgba(31,170,89,.14);border-radius:999px;padding:1px 7px}'
    + '.sup-msg.is-bot .sup-bubble{background:linear-gradient(135deg,rgba(108,77,255,.08),rgba(255,122,89,.08)),var(--paper);border:1px solid rgba(108,77,255,.28)}'
    + '.sup-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;white-space:normal}'
    + '.sup-act{display:inline-flex;align-items:center;gap:7px;font:inherit;font-size:14px;font-weight:700;padding:8px 13px;border-radius:999px;cursor:pointer;border:1.5px solid var(--carbon);background:var(--paper);color:var(--carbon);line-height:1.2}'
    + '.sup-act:hover{background:var(--carbon-tint)}.sup-act.is-main{background:var(--btn-bg);background-image:var(--btn-grad,none);color:var(--btn-fg);border-color:transparent}.sup-act:disabled{opacity:.6;cursor:wait}'
    + '.sup-act__i{font-size:14px;line-height:1}'
    + '.sup-typing{display:flex;align-items:center;gap:10px;color:var(--ink-2)}.sup-dots{display:inline-flex;gap:4px}.sup-dots i{width:7px;height:7px;border-radius:50%;background:var(--carbon);opacity:.35;animation:sup-dot 1.2s infinite}'
    + '.sup-dots i:nth-child(2){animation-delay:.2s}.sup-dots i:nth-child(3){animation-delay:.4s}@keyframes sup-dot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}'
    + '@media (prefers-reduced-motion:reduce){.sup-dots i,.sup-live,.sup-mic.is-on{animation:none;opacity:.7}}'
    + '.sup-wa--inline{margin:10px 0 0}'
    + '.sup-ask{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:14px 18px;border-radius:14px;margin-bottom:14px;border:1.5px solid rgba(108,77,255,.3)}.sup-ask .sup-actions{margin:0}'
    + '.sup-human{margin:12px 0 0;text-align:center}'
    + '.sup-push{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:14px 18px;border-radius:14px;margin:14px 0}.sup-push__t{display:grid;gap:2px}.sup-push__t .fine{margin:0}.sup-push__a{display:flex;gap:8px}.sup-push__a .pb-btn{display:inline-flex}'
    + 'html[data-theme=dark] .sup-auto{color:#6ee7a8;background:rgba(110,231,168,.14)}@media (prefers-color-scheme:dark){html:not([data-theme=light]) .sup-auto{color:#6ee7a8;background:rgba(110,231,168,.14)}}'
    + '.sup-toast{position:fixed;left:50%;bottom:calc(104px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:1300;max-width:calc(100% - 32px);background:#1d1838;color:#fff;padding:11px 18px;border-radius:12px;font-weight:600;box-shadow:0 12px 30px -10px rgba(0,0,0,.5)}.sup-toast.is-bad{background:#8a1c24}'
    /* guided help */
    + '.sup-status{display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;padding:12px 16px;margin:0 0 18px;border-radius:14px;background:var(--paper);border:1px solid var(--rule);font-size:14px;color:var(--ink-2)}.sup-status b{color:var(--ink)}'
    + '.sup-status__i{display:inline-flex;align-items:center;gap:6px}.sup-live{width:9px;height:9px;border-radius:50%;background:#1faa59;box-shadow:0 0 0 0 rgba(31,170,89,.5);animation:sup-live 2s infinite}@keyframes sup-live{70%{box-shadow:0 0 0 7px rgba(31,170,89,0)}100%{box-shadow:0 0 0 0 rgba(31,170,89,0)}}'
    + '.sup-wa{margin-left:auto;display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:999px;background:#1faa59;color:#fff;font-weight:700;text-decoration:none}.sup-wa:hover{background:#178a48}'
    + '.sup-topics{list-style:none;margin:0 0 22px;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}@media (width >= 900px){.sup-topics{grid-template-columns:repeat(4,minmax(0,1fr))}}'
    + '.sup-topic{display:flex;flex-direction:column;gap:10px;height:100%;padding:14px;border-radius:16px;background:var(--paper);border:1.5px solid var(--rule);color:var(--ink);text-decoration:none;transition:border-color .12s,transform .12s,box-shadow .12s}'
    + '.sup-topic:hover{border-color:var(--carbon);transform:translateY(-2px);box-shadow:0 10px 24px -16px rgba(60,30,160,.6)}.sup-topic:focus-visible{outline:2.5px solid var(--carbon);outline-offset:2px}'
    + '.sup-topic__ico{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;color:#fff;flex:none}.sup-topic__ico svg{display:block}'
    + '.sup-topic__ico.g1{background:linear-gradient(135deg,#8b5cf6,#d946ef 60%,#fb7185)}.sup-topic__ico.g2{background:linear-gradient(135deg,#0ea5e9,#6366f1)}.sup-topic__ico.g3{background:linear-gradient(135deg,#f59e0b,#f97316 60%,#ef4444)}'
    + '.sup-topic__ico.g4{background:linear-gradient(135deg,#10b981,#0ea5e9)}.sup-topic__ico.g5{background:linear-gradient(135deg,#ef4444,#f97316)}.sup-topic__ico.g6{background:linear-gradient(135deg,#eab308,#f59e0b)}'
    + '.sup-topic__t{display:grid;gap:2px;min-width:0}.sup-topic__t b{font-size:15.5px;line-height:1.25}.sup-topic__t span{font-size:12.5px;line-height:1.35;color:var(--ink-2)}'
    + '.sup-topics.is-small .sup-topic{flex-direction:row;align-items:center}'
    + '.sup-steps{list-style:none;display:flex;gap:6px;margin:-4px 0 16px;padding:0;font-size:12.5px;font-weight:600;color:var(--ink-3,var(--ink-2));flex-wrap:wrap}'
    + '.sup-steps li{display:inline-flex;align-items:center;gap:6px}.sup-steps li+li:before{content:"";width:16px;height:1.5px;background:var(--rule);margin-right:2px}'
    + '.sup-steps span{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;border:1.5px solid var(--rule);font-size:11.5px}'
    + '.sup-steps .is-on{color:var(--carbon)}.sup-steps .is-on span{background:var(--btn-bg);background-image:var(--btn-grad,none);border-color:transparent;color:var(--btn-fg)}.sup-steps .is-done span{background:var(--green-soft,#dff5e8);border-color:transparent;color:var(--green,#1f7a4d)}'
    + '.sup-probs{padding:6px;border-radius:16px}.sup-plist{list-style:none;margin:0;padding:0}.sup-plist li+li{border-top:1px solid var(--rule-soft,var(--rule))}'
    + '.sup-prob{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 14px;border-radius:12px;color:var(--ink);text-decoration:none;font-weight:600;font-size:15.5px}.sup-prob:hover{background:var(--carbon-tint)}'
    + '.sup-prob__go{font-size:24px;line-height:1;color:var(--carbon)}.sup-prob.is-other{color:var(--ink-2);font-weight:500}'
    + '.sup-qs{padding:18px 20px;border-radius:16px;margin-bottom:14px;display:grid;gap:16px}.sup-qs.is-done .sup-actions{display:none}'
    + '.sup-q{display:grid;gap:8px}.sup-q__l{font-weight:700;font-size:15px}.sup-q__hint{margin:0}.sup-utr{max-width:260px;letter-spacing:.08em;font-variant-numeric:tabular-nums}'
    + '.sup-chips{display:flex;flex-wrap:wrap;gap:8px}.sup-chip{font:inherit;font-size:14.5px;font-weight:600;padding:9px 15px;border-radius:999px;border:1.5px solid var(--rule);background:var(--paper);color:var(--ink);cursor:pointer;line-height:1.2}'
    + '.sup-chip:hover{border-color:var(--carbon)}.sup-chip[aria-checked=true]{border-color:var(--carbon);background:var(--carbon-tint);color:var(--carbon)}.sup-chip[aria-checked=true]:before{content:"✓ "}'
    + '.sup-fix{padding:16px 18px;border-radius:16px;margin-bottom:14px;border:1.5px solid rgba(108,77,255,.35);background:linear-gradient(135deg,rgba(108,77,255,.07),rgba(255,122,89,.07)),var(--paper);display:grid;gap:10px}'
    + '.sup-fix__txt{margin:0;white-space:pre-wrap;line-height:1.5;font-size:15px}.sup-fix .sup-acts{margin-top:0}'
    + '.sup-fix__ask{display:flex;align-items:center;justify-content:space-between;gap:10px 14px;flex-wrap:wrap;padding-top:12px;border-top:1px dashed var(--rule)}.sup-fix__ask .sup-actions{margin:0}'
    + '.sup-done{padding:26px 20px;border-radius:16px;text-align:center;display:grid;justify-items:center;gap:6px}.sup-done__big{font-size:44px;line-height:1}.sup-done p{margin:0;color:var(--ink-2)}'
    + '.sup-newreply{display:flex;align-items:center;gap:12px;padding:13px 16px;border-radius:14px;margin:0 0 18px;text-decoration:none;color:var(--ink);border:1.5px solid var(--carbon);background:var(--carbon-tint)}.sup-newreply>span:nth-child(2){display:grid;min-width:0}.sup-newreply>span:nth-child(2) span{font-size:13.5px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.sup-newreply__dot{flex:none;width:11px;height:11px;border-radius:50%;background:#e0603f}.sup-newreply__go{margin-left:auto;font-weight:700;color:var(--carbon);white-space:nowrap}'
    + '.sup-urgent{display:flex;gap:10px;align-items:flex-start;margin:12px 0 4px;padding:10px 12px;border-radius:12px;border:1.5px dashed var(--rule);cursor:pointer}.sup-urgent input{margin-top:3px;width:18px;height:18px;accent-color:#e0603f}.sup-urgent span{display:grid}.sup-urgent .fine{margin:0}'
    + '.sup-eta{margin:10px 0 0}.sup-form .form-sec__title{margin:0 0 6px}'
    /* chat with the assistant */
    + '.sup-avatar{flex:none;display:grid;place-items:center;width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,#6c4dff,#d946ef 55%,#ff7a59);color:#fff;font-size:20px;box-shadow:0 8px 18px -10px rgba(108,77,255,.8)}.sup-avatar--sm{width:30px;height:30px;border-radius:10px;font-size:14px;box-shadow:none}'
    + '.sup-askcard{padding:18px 20px;border-radius:18px;margin:0 0 16px;display:grid;gap:12px;border:1.5px solid rgba(108,77,255,.35);background:linear-gradient(135deg,rgba(108,77,255,.08),rgba(255,122,89,.07)),var(--paper)}'
    + '.sup-askcard__top{display:flex;gap:12px;align-items:center}.sup-askcard__t{margin:0;font-size:19px;line-height:1.2;font-weight:800}.sup-askcard__s{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--ink-2)}'
    + '.sup-ask__row,.sup-composer__row{display:flex;gap:8px;align-items:flex-end}.sup-ask__in{flex:1;min-width:0;height:48px!important;border-radius:14px!important;padding:0 14px!important;border:1.5px solid var(--rule)!important;background:var(--paper)!important;font-size:16px!important}'
    + '.sup-send{flex:none;width:48px;height:48px;border-radius:14px;border:0;cursor:pointer;font-size:19px;color:var(--btn-fg);background:var(--btn-bg);background-image:var(--btn-grad,none)}.sup-send:disabled{opacity:.55;cursor:wait}'
    + '.sup-mic{flex:none;width:48px;height:48px;border-radius:14px;border:1.5px solid var(--rule);background:var(--paper);color:var(--carbon);display:grid;place-items:center;cursor:pointer}.sup-mic.is-on{background:#e0603f;border-color:#e0603f;color:#fff;animation:sup-live 1.4s infinite}'
    + '.sup-sugs{display:flex;flex-wrap:wrap;gap:7px}.sup-sug{font:inherit;font-size:13.5px;font-weight:600;padding:7px 12px;border-radius:999px;border:1.5px solid rgba(108,77,255,.35);background:var(--paper);color:var(--carbon);cursor:pointer;text-align:left;line-height:1.25}.sup-sug:hover{background:var(--carbon-tint)}'
    + '.sup-continue{font-weight:700;color:var(--carbon);text-decoration:none;justify-self:start}'
    + '.sup-chathead{display:flex;justify-content:space-between;align-items:flex-end;gap:12px}.sup-chathead .page-sub{display:flex;align-items:center;gap:6px}.sup-newchat{display:inline-flex;flex:none}'
    + '.sup-chatbox{padding:16px;border-radius:18px;min-height:40vh}.sup-chat{list-style:none;margin:0;padding:0;display:grid;gap:14px}'
    + '.sup-cm{display:flex;gap:9px;align-items:flex-start;max-width:min(640px,94%)}.sup-cm.is-me{justify-self:end}.sup-cm__col{display:grid;gap:7px;min-width:0}'
    + '.sup-cm__b{padding:10px 14px;border-radius:16px;font-size:15px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}.sup-cm__b p{margin:0}'
    + '.sup-cm.is-me .sup-cm__b{background:var(--btn-bg);background-image:var(--btn-grad,none);color:var(--btn-fg);border-bottom-right-radius:5px}'
    + '.sup-cm.is-bot .sup-cm__b{background:var(--paper);border:1px solid rgba(108,77,255,.28);border-top-left-radius:5px;background-image:linear-gradient(135deg,rgba(108,77,255,.06),rgba(255,122,89,.05))}'
    + '.sup-cm .sup-acts{margin-top:10px}.sup-cm .sup-sugs{margin-left:2px}'
    + '.sup-fb{display:flex;align-items:center;gap:6px}.sup-fb .fine{margin:0}.sup-fbb{border:1px solid var(--rule);background:var(--paper);border-radius:999px;width:34px;height:30px;cursor:pointer;font-size:15px}.sup-fbb:hover{border-color:var(--carbon)}'
    + '.sup-composer{position:sticky;bottom:calc(80px + env(safe-area-inset-bottom,0px));z-index:5;margin-top:12px;padding:10px;border-radius:18px;background:var(--paper);border:1.5px solid var(--rule);box-shadow:0 14px 34px -18px rgba(40,20,120,.55);display:grid;gap:6px}'
    + '@media (width >= 1024px){.sup-composer{bottom:16px}}'
    + '.sup-chat__in{flex:1;min-width:0;min-height:48px;max-height:132px;resize:none;border-radius:14px!important;padding:12px 14px!important;border:1.5px solid var(--rule)!important;line-height:1.4!important;font-size:16px!important;background:var(--paper)!important}'
    + '.sup-composer__foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.sup-composer__foot .fine{margin:0;font-size:12px}'
    + '.sup-person{border:0;background:none;font:inherit;font-size:13.5px;font-weight:700;color:var(--carbon);cursor:pointer;padding:2px 0}'
    + '.sup-handoff{display:grid;gap:8px;margin-top:14px;padding:14px;border-radius:14px;border:1.5px dashed var(--carbon);background:var(--carbon-tint)}.sup-handoff .fine{margin:0}.sup-handoff .sup-actions{margin-top:4px}'
    + '.sup-askcard__links{display:flex;gap:8px 18px;flex-wrap:wrap}.sup-chathead__act{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}'
    + '.sup-speak{float:right;margin:-4px -6px 2px 8px;border:0;background:none;cursor:pointer;font-size:16px;line-height:1;padding:4px;border-radius:8px;opacity:.7}.sup-speak:hover,.sup-speak.is-on{opacity:1;background:var(--carbon-tint)}'
    + '.sup-hc__bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px;border-radius:16px;margin-bottom:16px}.sup-hc__q{flex:1;min-width:200px;height:46px!important;border-radius:12px!important;padding:0 14px!important;border:1.5px solid var(--rule)!important;font-size:16px!important}.sup-hc__ask{display:inline-flex}'
    + '.sup-hc__sec{margin-bottom:16px}.sup-hc__sec .form-sec__title{margin:0 0 8px;display:flex;align-items:center;gap:8px}.sup-hc__n{font-size:12px;font-weight:700;color:var(--carbon);background:var(--carbon-tint);border-radius:999px;padding:1px 8px}'
    + '.sup-hc__items{padding:4px 6px;border-radius:14px}.sup-hc__item+.sup-hc__item{border-top:1px solid var(--rule-soft,var(--rule))}'
    + '.sup-hc__item summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:13px 10px;font-weight:700;font-size:15px;border-radius:10px}.sup-hc__item summary::-webkit-details-marker{display:none}'
    + '.sup-hc__item summary:after{content:"+";font-size:20px;color:var(--carbon);flex:none}.sup-hc__item[open] summary:after{content:"−"}.sup-hc__item summary:hover{background:var(--carbon-tint)}'
    + '.sup-hc__body{padding:0 10px 14px}.sup-hc__body>p{margin:0;white-space:pre-wrap;line-height:1.55;font-size:15px;color:var(--ink)}'
    + '.sup-hc__tools{display:flex;align-items:flex-start;gap:6px;flex-wrap:wrap;margin-top:8px}.sup-hc__tools .sup-speak{float:none;margin:6px 0 0}.sup-hc__tools .sup-acts{margin-top:4px}'
    + '.sup-hc__foot{display:flex;gap:6px 14px;align-items:center;flex-wrap:wrap;margin-top:10px}.sup-hc__foot .fine{margin:0}.sup-hc__rel{border:0;background:none;font:inherit;font-size:12.5px;color:var(--carbon);font-weight:600;cursor:pointer;padding:0 2px;text-decoration:underline;text-underline-offset:2px}'
    + '@media (width >= 900px){.sup-toast{bottom:28px}}'
    + '@media (width < 720px){.sup-form,.sup-reply,.sup-conv{padding:14px}.sup-msg{max-width:94%}.sup-ask,.sup-push{padding:12px 14px}}';
  function css() { if (!document.getElementById('sup-css')) { var s = document.createElement('style'); s.id = 'sup-css'; s.textContent = CSS; document.head.append(s); } }

  // remember which page the customer was on before opening support (sent with the ticket)
  function track() { var r = location.hash || '#/'; if (!/^#\/support/.test(r)) { state.lastPage = r.slice(0, 80); ls(LAST, state.lastPage); } }
  state.lastPage = ls(LAST) || '';
  track();
  // PakkaBill re-mounts the page on every link change; this only catches a change it missed.
  window.addEventListener('hashchange', function () { track(); checkUnread(false); setTimeout(function () { if (/^#\/support/.test(location.hash) && location.hash !== state.renderedHash) render(); }, 0); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) checkUnread(false); });
  css();
  setTimeout(function () { checkUnread(true); }, 1500);
  setInterval(function () { checkUnread(false); }, 300000);

  window.pbPushSupported = pushSupported;
  window.pbPushEnable = enablePush;
  setTimeout(syncPush, 2500);

  window.pbSupportMount = function (el) {
    if (!el) return;
    css();
    if (state.el === el && state.renderedHash === location.hash) return;
    state.el = el;
    render();
  };
})();
