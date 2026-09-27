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
    shop: ['🏪', 'Open Shop (backup, logo)'], reports: ['₹', 'Open GST summary'], new_bill: ['+', 'Make a new bill'], items: ['▦', 'Open Items'],
    parties: ['👥', 'Open Parties'], listing: ['📦', 'Open Meesho listing'], lens: ['🔍', 'Open Meesho Lens'], pnl: ['📊', 'Open Meesho P&L']
  };
  var PAGES = { plan: '#/plan', login: '#/plan', shop: '#/shop', reports: '#/reports', new_bill: '#/new', items: '#/items', parties: '#/parties', listing: '#/listing', lens: '#/lens', pnl: '#/pnl' };

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

  function listView(el) {
    var a = acct(), box = h('div', { class: 'sup-list' }, h('p', { class: 'fine' }, 'Loading your tickets…'));
    el.replaceChildren(h('div', { class: 'sup' },
      head('Help & support', 'Tell us about a problem or ask a question. Most answers arrive in seconds.'),
      h('section', { class: 'paper sup-hero' },
        h('div', { class: 'sup-hero__txt' }, h('h2', { class: 'form-sec__title' }, 'Need help?'),
          h('p', null, 'Raise a ticket and the PakkaBill assistant checks your account, payments and app straight away, then answers with a fix you can tap. If it can\'t solve it, a person from our team replies here.')),
        h('div', { class: 'sup-hero__act' }, h('a', { class: 'pb-btn pb-btn--primary', href: '#/support?new=1' }, '+ Raise a ticket'))),
      h('section', { class: 'sup-sec', 'aria-labelledby': 'sup-h' }, h('h2', { id: 'sup-h', class: 'form-sec__title' }, 'Your tickets'), box),
      !a ? h('p', { class: 'fine sup-foot' }, 'Tickets you raise without an account are kept on this device. Log in on the Plan page to see them on every device.') : null));
    call('list', { guests: guests() }).then(function (j) {
      setUnread(j.tickets.filter(function (t) { return t.unread; }).length);
      if (!j.tickets.length) { box.replaceChildren(h('div', { class: 'paper sup-empty' }, h('b', null, 'No tickets yet'), h('p', { class: 'fine' }, 'When you raise a ticket, it shows here with our replies.'))); return; }
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
    var a = acct(), p = params(), img = '';
    var topic = h('select', { class: 'pb-input', id: 'sup-topic' }, TOPICS.map(function (t) { return h('option', { value: t[0] }, t[1]); }));
    if (p.get('topic')) topic.value = p.get('topic');
    var subject = h('input', { class: 'pb-input', id: 'sup-subject', maxlength: '120', placeholder: 'For example: PDF does not download', autocomplete: 'off' });
    var msg = h('textarea', { class: 'pb-input sup-ta', id: 'sup-msg', rows: '5', maxlength: '2000', placeholder: 'What happened, what you expected, and the steps to see it again.' });
    var phone = a ? null : h('input', { class: 'pb-input', id: 'sup-phone', inputmode: 'tel', maxlength: '14', placeholder: '98765 43210', autocomplete: 'tel' });
    var name = a ? null : h('input', { class: 'pb-input', id: 'sup-name', maxlength: '60', placeholder: 'Your name or shop name', autocomplete: 'organization' });
    var note = h('div');
    var send = h('button', { type: 'submit', class: 'pb-btn pb-btn--primary' }, 'Send ticket');
    var field = function (id, label, control, hint) { return h('div', { class: 'pb-field' }, h('label', { class: 'pb-field__label', for: id }, label), control, hint ? h('div', { class: 'pb-field__msg' }, hint) : null); };
    var form = h('form', { class: 'paper sup-form', novalidate: true },
      h('div', { class: 'sup-grid' },
        field('sup-topic', 'Topic', h('div', { class: 'pb-select' }, topic)),
        field('sup-subject', 'Subject', subject),
        a ? null : field('sup-phone', 'Mobile number', phone, 'We reply here. We may also call or WhatsApp you on this number.'),
        a ? null : field('sup-name', 'Name (optional)', name)),
      field('sup-msg', 'Message', msg),
      picker(function (d) { img = d; }),
      h('p', { class: 'fine' }, 'We attach basic app details (app version, page, phone or browser type) to help us fix it. No bills or customer data are sent.'),
      note,
      h('div', { class: 'sup-actions' }, send, h('a', { class: 'pb-btn pb-btn--ghost', href: '#/support' }, 'Cancel')));
    form.addEventListener('submit', function (e) {
      e.preventDefault(); note.replaceChildren();
      if (subject.value.trim().length < 3) { note.append(banner('Add a short subject.', true)); subject.focus(); return; }
      if (msg.value.trim().length < 5) { note.append(banner('Tell us a little more about the problem.', true)); msg.focus(); return; }
      if (phone && phone.value.replace(/\D/g, '').length < 10) { note.append(banner('Enter your 10-digit mobile number so we can reply.', true)); phone.focus(); return; }
      busyBtn(send, true, 'Sending…');
      diag().then(function (d) {
        return call('create', { category: topic.value, subject: subject.value, message: msg.value, image: img || undefined, phone: phone ? phone.value : undefined, name: name ? name.value : undefined, diag: d });
      }).then(function (j) {
        if (j.key) { var g = guests(); g.unshift({ id: j.ticket.id, key: j.key, no: j.ticket.no }); ls(GUEST, g.slice(0, 30)); }
        try { sessionStorage.setItem('pb-support-sent', j.ticket.no); } catch (err) { /* ignore */ }
        syncPush();
        go('t=' + encodeURIComponent(j.ticket.id));
      }).catch(function (err) { busyBtn(send, false, 'Send ticket'); note.append(banner(err.message, true)); });
    });
    el.replaceChildren(h('div', { class: 'sup' }, head('Raise a ticket', 'Tell us what went wrong or what you need. We reply on this page.', true), form));
    subject.focus({ preventScroll: true });
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
        ? h('p', { class: 'fine sup-human' }, '👤 A person from our team will reply here, usually within a day.' + (pushSupported() && Notification.permission === 'granted' ? ' We will send you a notification.' : ''))
        : null;
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

  function render() {
    var el = state.el; if (!el || !el.isConnected) return;
    state.renderedHash = location.hash;
    var p = params();
    if (p.get('t')) ticketView(el, p.get('t')); else if (p.get('new')) newView(el); else listView(el);
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
    /* unread dot on the Tools button, the menu link and the Tools tile */
    + 'html.pb-has-reply .topbar__tools{position:relative}html.pb-has-reply .topbar__tools:after,html.pb-has-reply .spine-nav a[href="#/support"]:after,html.pb-has-reply .pbt__tile[href="#/support"] .pbt__ico:after{content:"";position:absolute;width:10px;height:10px;border-radius:50%;background:#e0603f;box-shadow:0 0 0 2px var(--paper)}'
    + 'html.pb-has-reply .topbar__tools:after{top:-2px;right:-2px}html.pb-has-reply .spine-nav a[href="#/support"]:after{right:18px;top:50%;margin-top:-5px}html.pb-has-reply .pbt__tile[href="#/support"] .pbt__ico{position:relative}html.pb-has-reply .pbt__tile[href="#/support"] .pbt__ico:after{top:-3px;right:-3px}'
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
    + '@media (prefers-reduced-motion:reduce){.sup-dots i{animation:none;opacity:.7}}'
    + '.sup-ask{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:14px 18px;border-radius:14px;margin-bottom:14px;border:1.5px solid rgba(108,77,255,.3)}.sup-ask .sup-actions{margin:0}'
    + '.sup-human{margin:12px 0 0;text-align:center}'
    + '.sup-push{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:14px 18px;border-radius:14px;margin:14px 0}.sup-push__t{display:grid;gap:2px}.sup-push__t .fine{margin:0}.sup-push__a{display:flex;gap:8px}.sup-push__a .pb-btn{display:inline-flex}'
    + 'html[data-theme=dark] .sup-auto{color:#6ee7a8;background:rgba(110,231,168,.14)}@media (prefers-color-scheme:dark){html:not([data-theme=light]) .sup-auto{color:#6ee7a8;background:rgba(110,231,168,.14)}}'
    + '.sup-toast{position:fixed;left:50%;bottom:calc(104px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:1300;max-width:calc(100% - 32px);background:#1d1838;color:#fff;padding:11px 18px;border-radius:12px;font-weight:600;box-shadow:0 12px 30px -10px rgba(0,0,0,.5)}.sup-toast.is-bad{background:#8a1c24}'
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
