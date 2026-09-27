// PakkaBill: Help & support (#/support). Customers raise a ticket, attach a screenshot and talk
// with support; replies show as a badge on the Tools button and in the menu. Guests (no account)
// give a mobile number and this device keeps a private key for each of their tickets.
(function () {
  var API = '/api/support', GUEST = 'pb-support-guest', LAST = 'pb-support-last';
  var TOPICS = [
    ['bug', 'Something is not working'], ['payment', 'Payment or Pro plan'], ['bills', 'Bills, PDF or printing'],
    ['gst', 'GST summary or GSTR-1'], ['meesho', 'Meesho tools'], ['account', 'Login or account'],
    ['idea', 'Suggestion'], ['other', 'Something else']
  ];
  var STATUS = { open: ['Open', 'is-open'], progress: ['In progress', 'is-progress'], waiting: ['Waiting for you', 'is-waiting'], resolved: ['Resolved', 'is-resolved'], closed: ['Closed', 'is-closed'] };
  var state = { el: null, unread: 0, lastPage: '' };

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
    return (window.caches && caches.keys ? caches.keys().then(function (k) { d.app = (k.find(function (x) { return /^pakkabill-/.test(x); }) || '').replace('pakkabill-', ''); return d; }).catch(function () { return d; }) : Promise.resolve(d));
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
      head('Help & support', 'Tell us about a problem or ask a question. We reply here, usually within a day.'),
      h('section', { class: 'paper sup-hero' },
        h('div', { class: 'sup-hero__txt' }, h('h2', { class: 'form-sec__title' }, 'Need help?'),
          h('p', null, 'Raise a ticket and our team will look into it. You can add a screenshot and follow the reply here.')),
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
          h('span', { class: 'sup-item__last' }, (t.last && t.last.by === 'support' ? 'Support: ' : t.last && t.last.by === 'system' ? '' : 'You: ') + (t.last ? t.last.text : ''))));
      })));
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

  function ticketView(el, id) {
    var body = h('div', null, h('p', { class: 'fine' }, 'Opening the ticket…'));
    el.replaceChildren(h('div', { class: 'sup' }, head('Ticket', '', true), body));
    var k = keyFor(id);
    call('get', { id: id, key: k }).then(function (j) {
      var t = j.ticket, img = '';
      checkUnread(true);
      var sent = ''; try { sent = sessionStorage.getItem('pb-support-sent') || ''; sessionStorage.removeItem('pb-support-sent'); } catch (e) { /* ignore */ }
      var thread = h('ol', { class: 'sup-thread' }, t.messages.map(function (m) {
        if (m.by === 'system') return h('li', { class: 'sup-sys' }, m.text.replace('Status changed to ', 'Marked as ').replace(/\.$/, '') + ' · ' + when(m.at));
        var pic = null;
        if (m.img) {
          pic = h('button', { type: 'button', class: 'sup-pic', 'aria-label': 'Open screenshot' }, 'Loading screenshot…');
          call('image', { id: t.id, key: k, n: m.img }).then(function (r) {
            pic.replaceChildren(h('img', { src: r.image, alt: 'Screenshot' })); pic.onclick = function () { lightbox(r.image); };
          }).catch(function () { pic.textContent = 'Screenshot could not load'; });
        }
        return h('li', { class: 'sup-msg ' + (m.by === 'support' ? 'is-them' : 'is-me') },
          h('div', { class: 'sup-bubble' }, m.text ? h('p', null, m.text) : null, pic),
          h('span', { class: 'sup-meta' }, (m.by === 'support' ? 'PakkaBill support' : 'You') + ' · ' + when(m.at)));
      }));
      var ta = h('textarea', { class: 'pb-input sup-ta', rows: '3', maxlength: '2000', placeholder: 'Write a reply…', 'aria-label': 'Your reply' });
      var note = h('div'), send = h('button', { type: 'submit', class: 'pb-btn pb-btn--primary' }, 'Send reply');
      var done = t.status === 'resolved' || t.status === 'closed';
      var form = h('form', { class: 'paper sup-reply' },
        done ? h('p', { class: 'fine' }, 'This ticket is ' + (STATUS[t.status] || STATUS.open)[0].toLowerCase() + '. If you still need help, reply and it opens again.') : null,
        ta, picker(function (d) { img = d; }), note, h('div', { class: 'sup-actions' }, send));
      form.addEventListener('submit', function (e) {
        e.preventDefault(); note.replaceChildren();
        if (!ta.value.trim() && !img) { note.append(banner('Write a message first.', true)); return; }
        busyBtn(send, true, 'Sending…');
        call('reply', { id: t.id, key: k, message: ta.value, image: img || undefined }).then(function () { ticketView(el, id); })
          .catch(function (err) { busyBtn(send, false, 'Send reply'); note.append(banner(err.message, true)); });
      });
      el.replaceChildren(h('div', { class: 'sup' },
        head(t.subject, null, true),
        h('div', { class: 'sup-tmeta' }, h('span', { class: 'sup-no' }, t.no), pill(t.status), h('span', null, topicName(t.category)), h('span', null, 'Raised ' + when(t.createdAt))),
        sent ? banner('Ticket ' + sent + ' sent. We will reply here, usually within a day.') : null,
        h('section', { class: 'paper sup-conv' }, thread), form));
    }).catch(function (e) { body.replaceChildren(banner(e.message, true)); });
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
    + '@media (width < 720px){.sup-form,.sup-reply,.sup-conv{padding:14px}.sup-msg{max-width:94%}}';
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

  window.pbSupportMount = function (el) {
    if (!el) return;
    css();
    if (state.el === el && state.renderedHash === location.hash) return;
    state.el = el;
    render();
  };
})();
