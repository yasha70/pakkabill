// PakkaBill Pro: plan checks, upgrade dialog, account and the Plan page.
// The app calls window.pbPro(), pbGate(feature), pbCanAddBill(invoices, bill),
// pbPlanMount(el) and pbLocked(el, feature). Paid features only lock once the
// server reports that payments are set up (config.enabled && config.enforce).
(function () {
  const ACCT = 'pb-acct';
  const CFG = 'pb-cfg';
  const LAST_PHONE = 'pb-last-phone'; // the number last logged in on this device, to fill in next time
  const ASK_PROFILE = 'pb-ask-profile'; // set on sign-up: ask about the shop once (optional)
  const read = (k) => {
    try {
      return JSON.parse(localStorage.getItem(k) || 'null');
    } catch {
      return null;
    }
  };
  const write = (k, v) => {
    try {
      v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  };

  let acct = read(ACCT); // { token, user }
  let cfg = read(CFG); // { enabled, enforce, monthly, yearly, freeBills }

  const enforced = () => !!(cfg && cfg.enabled && cfg.enforce);
  // The Android app installed from Google Play reports "store=play" in its user agent. Google Play
  // only allows digital upgrades to be sold there through Play Billing, so Pro is not sold in it.
  const playApp = () => /PakkaBillApp\/[^)]*store=play/.test(navigator.userAgent);
  const NO_SALE = '<p class="pbp-fine pbp-noapp">Buying Pro is not available in this app. If your account already has Pro, it works here too: log in with the same mobile number.</p>';
  const isPro = () => !!(acct && acct.user && acct.user.paidUntil > Date.now());
  // The owner account, or Pro for years ahead (a gift): nothing to buy, so no plans or pay screens.
  const isLifetime = () => !!(acct && acct.user && (acct.user.phone === 'owner' || acct.user.paidUntil > Date.now() + 3 * 365 * 864e5));
  const pbPro = () => !enforced() || isPro();

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const rupees = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const dateStr = (t) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  async function api(path, opts = {}) {
    acct = read(ACCT); // another page (My account → Change password) may have saved a new token
    const headers = { 'Content-Type': 'application/json' };
    if (acct && acct.token) headers.Authorization = 'Bearer ' + acct.token;
    const res = await fetch('/api/' + path, {
      method: opts.body ? 'POST' : 'GET',
      headers,
      cache: 'no-store',
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && acct && path !== 'auth') setAcct(null);
    if (!res.ok) throw new Error(data.error || 'Could not reach PakkaBill. Check your internet.');
    return data;
  }

  // Pro status changes what the bill renders, so reload the app when it flips.
  function setAcct(next, reloadOnChange = true) {
    const before = pbPro();
    const was = acct && acct.user ? acct.user.phone : '';
    acct = next;
    write(ACCT, next);
    rerender();
    // cloud backup (sync.js) starts or stops with the login
    if ((next && next.user ? next.user.phone : '') !== was) {
      try { window.dispatchEvent(new Event('pb-account')); } catch {}
    }
    const reloading = reloadOnChange && before !== pbPro();
    if (reloading) setTimeout(() => location.reload(), 600);
    return reloading;
  }

  async function refresh() {
    try {
      const before = pbPro();
      cfg = await api('config');
      write(CFG, cfg);
      if (acct && acct.token) {
        const { user } = await api('me');
        acct = { ...acct, user };
        write(ACCT, acct);
      }
      rerender();
      // not while the home page shows: nothing there depends on Pro, and the tools read it fresh when opened
      if (before !== pbPro() && !document.documentElement.classList.contains('pb-home-on')) location.reload();
      renewNudge();
    } catch {
      /* offline or server not deployed: keep the last known state */
    }
    loadNews();
  }
  // Once a day in the last 3 days of Pro (or the trial): a small reminder to renew.
  function renewNudge() {
    if (!enforced() || !isPro() || daysLeft() > 3 || playApp()) return;
    const key = 'pb-renew-' + new Date().toISOString().slice(0, 10);
    if (read(key)) return;
    write(key, 1);
    setTimeout(() => {
      const n = daysLeft();
      const el = document.createElement('aside');
      el.className = 'pbp-news tone-warn';
      el.setAttribute('aria-label', 'Pro plan ending');
      el.innerHTML = `<button type="button" class="pbp-x" aria-label="Hide">×</button><b class="pbp-news__title">${acct.user.lastPlan === 'trial' ? 'Your free Pro trial' : 'Your Pro plan'} ends in ${n} day${n === 1 ? '' : 's'}</b><p class="pbp-news__msg">Renew to keep unlimited bills, all your shops and cloud backup. The new time adds on top.</p><div class="pbp-news__row"><button type="button" class="pbp-btn pbp-btn--sm" data-renew>Renew Pro</button></div>`;
      el.querySelector('.pbp-x').onclick = () => el.remove();
      el.querySelector('[data-renew]').onclick = () => { el.remove(); openUpgrade('renew'); };
      document.body.appendChild(el);
    }, 2500);
  }

  const WHY = {
    bills: (n) => `You have used your ${n} free bills this month.`,
    design: () => 'The Royal, Elegant, Boutique, Studio, Utsav and Prism bill designs are part of PakkaBill Pro.',
    logo: () => 'Your logo and signature on bills are part of PakkaBill Pro.',
    gstr1: () => 'GSTR-1 JSON export is part of PakkaBill Pro.',
    autolist: () => 'More listing templates, and sending more than 5 products to Meesho at a time, are part of PakkaBill Pro.',
    pdf: () => 'PDF download and sharing are part of PakkaBill Pro.',
    share: () => 'WhatsApp sharing is part of PakkaBill Pro.',
    offer: () => 'Everything in PakkaBill, without limits.',
    pnl: () => 'Your full profit and loss report (statement, RTO and returns, profit by product and category, GST, month by month and order-wise reconcile) is part of PakkaBill Pro.',
    pnlDl: () => 'Downloading your profit and loss report as PDF or Excel is part of PakkaBill Pro.',
    claim: () => 'Log in or create a free account to claim your free Pro days.',
    shops: () => 'More than one shop (GSTIN) in PakkaBill is part of Pro. Your first shop stays free.',
    sync: () => 'Cloud backup on every phone and laptop you log in on is part of PakkaBill Pro.',
    renew: () => (acct && acct.user && acct.user.paidUntil ? `Your Pro plan ends on ${dateStr(acct.user.paidUntil)}. Renew now; the new time adds on top of what is left.` : 'Renew PakkaBill Pro.'),
  };
  const PERKS = [
    'Full Meesho profit & loss report, with PDF and Excel download',
    'Unlimited bills every month',
    'Up to 10 shops (GSTINs) in one app',
    'Cloud backup: your bills on every phone and laptop you log in on',
    'All 14 bill designs, including Royal, Utsav and Prism, with your logo and signature',
    'PDF download, share and WhatsApp',
    'GSTR-1 JSON from Meesho, Amazon and Flipkart reports',
    'Auto listing on Meesho: unlimited templates and products',
  ];
  // Free vs Pro, for the Plan page.
  function compareHtml() {
    const free = cfg ? cfg.freeBills : 15;
    const rows = [
      ['Meesho P&L: real profit summary', '✓', '✓'],
      ['Meesho P&L: full report, reconcile, PDF and Excel', '–', '✓'],
      ['Bills every month', `${free}`, 'Unlimited'],
      ['Shops (GSTINs)', '1', 'Up to 10'],
      ['Cloud backup and sync', '–', '✓'],
      ['Bill designs', '8', 'All 14'],
      ['Logo and signature on bills', '–', '✓'],
      ['PDF, share and WhatsApp', 'Print only', '✓'],
      ['GSTR-1 JSON from marketplace reports', '–', '✓'],
      ['GST summary, parties, items, estimates', '✓', '✓'],
    ];
    return `<table class="pbp-compare"><thead><tr><th></th><th>Free</th><th>Pro</th></tr></thead><tbody>${rows
      .map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td><b>${r[2]}</b></td></tr>`).join('')}</tbody></table>`;
  }
  const daysLeft = () => (acct && acct.user ? Math.ceil(((acct.user.paidUntil || 0) - Date.now()) / 864e5) : 0);

  function plansHtml() {
    if (playApp()) return NO_SALE;
    const m = cfg ? cfg.monthly : 99;
    const y = cfg ? cfg.yearly : 999;
    const save = m * 12 - y;
    return `<div class="pbp-plans">
      <button type="button" class="pbp-plan" data-plan="monthly"><b>${rupees(m)}</b><span>per month</span></button>
      <button type="button" class="pbp-plan is-best" data-plan="yearly">${save > 0 ? `<i>Save ${rupees(save)}</i>` : ''}<b>${rupees(y)}</b><span>per year · ${rupees(Math.round(y / 12))}/month</span></button>
    </div>`;
  }

  function authHtml(mode, from = '') {
    const last = mode === 'login' ? read(LAST_PHONE) || '' : '';
    return `<form class="pbp-auth" data-mode="${mode}" data-from="${esc(from)}">
      <div class="pbp-tabs"><button type="button" data-mode="login" class="${mode === 'login' ? 'is-on' : ''}">Log in</button><button type="button" data-mode="signup" class="${mode === 'signup' ? 'is-on' : ''}">Create account</button></div>
      <label>Mobile number<input name="phone" inputmode="numeric" autocomplete="tel" placeholder="10-digit mobile" maxlength="14" value="${esc(last)}" required></label>
      ${mode === 'signup' ? '<label>Shop name<input name="shopName" autocomplete="organization" placeholder="As on your bills"></label>' : ''}
      <label>Password<span class="pbp-pw"><input name="password" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" autocapitalize="none" autocorrect="off" spellcheck="false" minlength="6" required><button type="button" class="pbp-show" aria-label="Show password">Show</button></span></label>
      <p class="pbp-err" role="alert"></p>
      <button class="pbp-btn" type="submit">${mode === 'signup' ? (cfg && cfg.trialDays ? `Create account: ${cfg.trialDays} days of Pro free` : 'Create account') : 'Log in'}</button>
      <p class="pbp-fine">${mode === 'login' ? 'Log in and your shops and bills from your other devices download here. Forgot your password? <a href="#/support?new=1&amp;topic=account&amp;p=login">Ask support to reset it</a>.' : `${cfg && cfg.trialDays ? `Every new account gets ${cfg.trialDays} days of Pro free, no payment needed. ` : ''}Your account keeps your Pro plan and cloud backup on every phone and laptop you log in on. By creating an account you agree to the <a href="/terms" target="_blank" rel="noopener">Terms</a> and <a href="/privacy" target="_blank" rel="noopener">Privacy policy</a>.`}</p>
    </form>`;
  }

  // Wires plan buttons and the login/sign-up form inside `root`; `redraw` re-renders it.
  function wire(root, redraw) {
    root.querySelectorAll('.pbp-plan').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!acct || !acct.token) {
          root.querySelector('.pbp-auth input')?.focus();
          return toast('Log in or create an account first.', true);
        }
        openPay(b.dataset.plan);
      }),
    );
    root.querySelectorAll('.pbp-tabs button').forEach((b) => b.addEventListener('click', () => redraw(b.dataset.mode)));
    root.querySelectorAll('[data-auth]').forEach((b) => b.addEventListener('click', () => openAuth({ mode: b.dataset.auth, from: b.dataset.from || 'plan' })));
    // a link inside a dialog (Terms, Ask support) leaves the dialog
    if (dialog && dialog.contains(root)) root.querySelectorAll('a[href^="#/"]').forEach((a) => a.addEventListener('click', closeUpgrade));
    const form = root.querySelector('.pbp-auth');
    if (form)
      form.querySelectorAll('.pbp-show').forEach((b) => b.addEventListener('click', () => {
        const inp = b.previousElementSibling, show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        b.textContent = show ? 'Hide' : 'Show';
        b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      }));
    if (form)
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const f = new FormData(form);
        const err = form.querySelector('.pbp-err');
        const btn = form.querySelector('.pbp-btn');
        err.textContent = '';
        btn.disabled = true;
        try {
          const r = await api('auth', {
            body: { action: form.dataset.mode, phone: f.get('phone'), password: f.get('password'), shopName: f.get('shopName') || '', from: form.dataset.from || '' },
          });
          if (/^\d{10}$/.test(r.user.phone)) write(LAST_PHONE, r.user.phone);
          // a new account: ask about the shop once (optional), now or when the app opens next
          const fresh = form.dataset.mode === 'signup' && !r.user.profiled && r.user.phone !== 'owner';
          if (fresh) write(ASK_PROFILE, 1);
          // logged in with a password PakkaBill support made: ask them to set their own
          if (r.user && r.user.tempPw) setTimeout(() => { if (confirm('You logged in with a temporary password from PakkaBill support. Set your own password now?')) location.hash = '#/account?pw=1'; }, 900);
          const claimId = pendingClaim;
          pendingClaim = '';
          const done = root._pbDone;
          const reloading = setAcct({ token: r.token, user: r.user }, !claimId);
          if (claimId) {
            if (done) closeUpgrade();
            return claimOffer(claimId);
          }
          toast(form.dataset.mode === 'signup' ? (r.user.trial ? 'Account created. Your free Pro trial is on.' : 'Account created. You are logged in.') : r.user.pro ? 'Logged in. Pro is active.' : 'Logged in.');
          loadNews();
          if (done) done(r.user, reloading, fresh);
          else if (fresh && !reloading && !dialog) setTimeout(askProfile, 900);
        } catch (e) {
          err.textContent = e.message;
          btn.disabled = false;
        }
      });
    root.querySelector('[data-logout]')?.addEventListener('click', async () => {
      try {
        await api('auth', { body: { action: 'logout' } });
      } catch {}
      setAcct(null);
      loadNews();
    });
  }

  function accountHtml() {
    if (!acct || !acct.user) return '';
    const u = acct.user;
    return `<div class="pbp-acct"><span>${u.phone === 'owner' ? 'Owner account' : 'Logged in as ' + esc(u.phone)}${u.shopName && u.phone !== 'owner' ? ' · ' + esc(u.shopName) : ''}</span><span><a class="pbp-link" href="#/account">My account</a> · <button type="button" class="pbp-link" data-logout>Log out</button></span></div>`;
  }

  // ---------- Quick log in / sign up sheet ----------
  const trialDays = () => (enforced() && cfg && Number(cfg.trialDays)) || 0;
  // What a free account really gives on this server (cloud backup needs Pro once paid plans are on).
  function accountGets() {
    const t = trialDays();
    if (enforced()) return [t ? `${t} days of Pro free: full Meesho P&L, unlimited bills, PDF and WhatsApp` : 'Your Pro plan on every phone and laptop you log in on', t ? 'Cloud backup of your bills while Pro is on' : 'Offers and free Pro days from PakkaBill', 'Your help requests in one place'];
    return ['Cloud backup: your bills stay safe even if you lose your phone', 'Open your shops on any phone or laptop', 'Offers and help requests in one place'];
  }
  function authWhy(feature, arg) {
    const t = trialDays();
    if (/^pnl/.test(feature)) return `Create a free account or log in to open your full profit and loss report${feature === 'pnlDl' ? ' and download it' : ''}.${t ? ` New accounts get ${t} days of Pro free.` : ''}`;
    if (feature === 'claim') return WHY.claim();
    return `${(WHY[feature] || WHY.pdf)(arg)} ${t ? `Create a free account and get ${t} days of Pro free, no payment needed.` : 'Log in or create a free account first.'}`;
  }
  // { mode: 'login' | 'signup', why, from, then(user) }. A returning device opens on Log in.
  function openAuth(o = {}) {
    if (acct && acct.token) return o.then ? o.then(acct.user) : undefined;
    let mode = o.mode || (read(LAST_PHONE) ? 'login' : 'signup');
    const box = showDialog(() => {});
    dialog.classList.add('pbp-sheetwrap');
    box.classList.add('pbp-sheet');
    const draw = (m) => {
      if (m) mode = m;
      const signup = mode === 'signup';
      box.innerHTML = `<button type="button" class="pbp-x" aria-label="Close">×</button>
        <h2 id="pbp-title">${signup ? 'Create your free account' : 'Log in to PakkaBill'}</h2>
        <p class="pbp-why">${esc(o.why || (signup ? 'Only your mobile number and a password. Takes 20 seconds.' : 'Your shops, bills and plan come to this device.'))}</p>
        ${signup ? `<ul class="pbp-gets">${accountGets().map((g) => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}
        ${authHtml(mode, o.from || '')}
        <p class="pbp-keep">Bills already on this device stay as they are.</p>
        <button type="button" class="pbp-link pbp-later" data-later>Not now</button>`;
      box.querySelector('.pbp-x').addEventListener('click', closeUpgrade);
      box.querySelector('[data-later]').addEventListener('click', closeUpgrade);
      box._pbDone = (u, reloading, fresh) => {
        closeUpgrade();
        if (reloading) return; // Pro turned on: the app reloads, and asks about the shop after
        if (o.then) o.then(u);
        // after `then` (an upgrade dialog may be open: askProfile then waits for the next app start)
        if (fresh) setTimeout(askProfile, 700);
      };
      wire(box, draw);
      const ph = box.querySelector('input[name=phone]');
      (ph && ph.value ? box.querySelector('input[name=password]') : ph)?.focus({ preventScroll: true });
    };
    draw();
  }

  // ---------- "About your shop": once, after sign-up; every answer optional ----------
  const PROFILE = {
    sells: ['Sarees', 'Kurtis & suits', 'Blouses', 'Lehengas', 'Jewellery', "Men's clothing", 'Kids', 'Home & kitchen', 'Beauty', 'Other'],
    where: ['Meesho', 'Amazon', 'Flipkart', 'Own shop', 'Instagram / WhatsApp', 'Other'],
    orders: ['Up to 10', '10 to 50', '50 to 200', 'More than 200'],
  };
  function askProfile(edit) {
    if (!acct || !acct.user || acct.user.phone === 'owner' || (!edit && acct.user.profiled)) return write(ASK_PROFILE, null);
    if (!edit && dialog) return; // something else is open: ask the next time the app opens
    write(ASK_PROFILE, null);
    const p = acct.user.profile || {};
    const st = { sells: [...(p.sells || [])], where: [...(p.where || [])], orders: p.orders || '' };
    const chips = (k, multi) => `<div class="pbp-chips" role="group" data-k="${k}" data-multi="${multi ? 1 : ''}">${PROFILE[k].map((v) => `<button type="button" aria-pressed="${multi ? st[k].includes(v) : st[k] === v}" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div>`;
    const box = showDialog(() => {});
    dialog.classList.add('pbp-sheetwrap');
    box.classList.add('pbp-sheet');
    const shop = acct.user.shopName;
    box.innerHTML = `<button type="button" class="pbp-x" aria-label="Close">×</button>
      <h2 id="pbp-title">${edit ? 'About your shop' : `Welcome${shop ? ', ' + esc(shop) : ''}!`}</h2>
      <p class="pbp-why">${edit ? 'Change anything you like. Every answer is optional.' : 'Tell us a little about your business, so PakkaBill can show tips that fit you. Every answer is optional.'}</p>
      <form class="pbp-auth pbp-prof">
        <label>Your name<input name="name" autocomplete="name" maxlength="60" value="${esc(p.name || '')}" placeholder="Optional"></label>
        <fieldset><legend>What do you sell?</legend>${chips('sells', 1)}</fieldset>
        <fieldset><legend>Where do you sell?</legend>${chips('where', 1)}</fieldset>
        <fieldset><legend>Orders a day</legend>${chips('orders', 0)}</fieldset>
        <label>City<input name="city" autocomplete="address-level2" maxlength="40" value="${esc(p.city || '')}" placeholder="Optional"></label>
        <p class="pbp-err" role="alert"></p>
        <button class="pbp-btn" type="submit">Save</button>
        <button type="button" class="pbp-link pbp-later" data-skip>${edit ? 'Cancel' : 'Skip'}</button>
      </form>`;
    const form = box.querySelector('form');
    form.querySelectorAll('.pbp-chips').forEach((g) => g.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      const k = g.dataset.k, v = b.dataset.v;
      if (g.dataset.multi) st[k] = st[k].includes(v) ? st[k].filter((x) => x !== v) : [...st[k], v];
      else st[k] = st[k] === v ? '' : v;
      g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(g.dataset.multi ? st[k].includes(x.dataset.v) : st[k] === x.dataset.v)));
    }));
    const send = (body) => api('auth', { body: { action: 'profile', ...body } }).then((r) => {
      if (r.user && acct) setAcct({ ...acct, user: r.user }, false);
      try { window.dispatchEvent(new Event('pb-profile')); } catch {}
      return r;
    });
    // closing without saving counts as "no thanks": never asked again
    const skip = () => { closeUpgrade(); if (!edit) send({ skip: true }).catch(() => {}); };
    box.querySelector('.pbp-x').addEventListener('click', skip);
    box.querySelector('[data-skip]').addEventListener('click', skip);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = new FormData(form);
      const body = { name: f.get('name') || '', city: f.get('city') || '', ...st };
      if (!edit && !body.name.trim() && !body.city.trim() && !st.sells.length && !st.where.length && !st.orders) return skip();
      const btn = form.querySelector('.pbp-btn');
      btn.disabled = true;
      try {
        await send(body);
        closeUpgrade();
        toast(edit ? 'Saved.' : 'Thank you! Saved.');
      } catch (e) {
        form.querySelector('.pbp-err').textContent = e.message;
        btn.disabled = false;
      }
    });
  }

  // ---------- Log in / Sign up buttons in the top bar and the side menu ----------
  const chips = new Set();
  const cards = new Set();
  const initials = (n) => String(n || '').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
  function drawChip(el) {
    if (acct && acct.token && acct.user) {
      const u = acct.user;
      el.className = 'pb-authchip is-in';
      el.innerHTML = `<a class="pbp-av" href="#/account" title="My account" aria-label="My account">${esc(initials(u.shopName) || (u.phone === 'owner' ? 'PB' : '☺'))}</a>`;
      return;
    }
    // on small phones only one button fits: the one this device most likely needs
    el.className = 'pb-authchip' + (read(LAST_PHONE) ? ' is-back' : '');
    el.innerHTML = '<button type="button" class="pbp-in pbp-in--ghost" data-a="login">Log in</button><button type="button" class="pbp-in" data-a="signup">Sign up</button>';
  }
  function drawCard(el) {
    if (acct && acct.token) {
      el.hidden = true;
      el.replaceChildren();
      return;
    }
    el.hidden = false;
    const t = trialDays();
    el.innerHTML = `<div class="pbp-acard"><b>Keep your work safe</b><span>${t ? `Free account, with ${t} days of Pro free` : enforced() ? 'Free account: your plan on every device' : 'Free account with cloud backup'}</span><div><button type="button" class="pbp-btn pbp-btn--sm" data-a="signup">Sign up free</button><button type="button" class="pbp-link" data-a="login">Log in</button></div></div>`;
  }
  function mountAuth(set, draw, from) {
    return (el) => {
      if (!el || set.has(el)) return;
      set.add(el);
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-a]');
        if (b) openAuth({ mode: b.dataset.a, from });
      });
      draw(el);
    };
  }
  const pbAuthChip = mountAuth(chips, drawChip, 'header');
  const pbAuthCard = mountAuth(cards, drawCard, 'menu');

  // ---------- A gentle reminder after useful work, for people not logged in ----------
  // Never on opening the app, never over a dialog, at most 3 times, 3 days apart, and never again
  // after "Don't ask again". Only when an account really gives something (backup, or a Pro trial).
  const NUDGE = 'pb-nudge';
  const NUDGE_TXT = {
    bill: 'Your bills are saved only on this phone.',
    labels: 'Your labels are ready.',
    image: 'Your images are ready.',
  };
  let nudgeEl = null;
  function pbNudge(kind) {
    const ok = () => {
      const s = read(NUDGE) || {};
      return !(acct && acct.token) && !s.off && (s.n || 0) < 3 && Date.now() - (s.at || 0) > 3 * 864e5 && !dialog && !nudgeEl && !document.querySelector('.pbp-news') && (!enforced() || trialDays() > 0);
    };
    if (!ok()) return;
    setTimeout(() => {
      if (!ok()) return;
      const s = read(NUDGE) || {};
      write(NUDGE, { ...s, n: (s.n || 0) + 1, at: Date.now() });
      const t = trialDays();
      nudgeEl = document.createElement('aside');
      nudgeEl.className = 'pbp-news pbp-nudge';
      nudgeEl.setAttribute('aria-label', 'Create a free account');
      nudgeEl.innerHTML = `<button type="button" class="pbp-x" aria-label="Hide">×</button><b class="pbp-news__title">${esc(NUDGE_TXT[kind] || 'Keep your work safe.')} Want a free account?</b><p class="pbp-news__msg">${t ? `Get ${t} days of Pro free, with cloud backup of your bills on any phone or laptop.` : 'Back up your bills for free and open them on any phone or laptop.'}</p><div class="pbp-news__row"><button type="button" class="pbp-btn pbp-btn--sm" data-yes>Sign up free</button><button type="button" class="pbp-link" data-no>Not now</button><button type="button" class="pbp-link pbp-off" data-off>Don't ask again</button></div>`;
      const hide = () => { nudgeEl?.remove(); nudgeEl = null; };
      nudgeEl.querySelector('.pbp-x').onclick = hide;
      nudgeEl.querySelector('[data-no]').onclick = hide;
      nudgeEl.querySelector('[data-off]').onclick = () => { write(NUDGE, { ...(read(NUDGE) || {}), off: 1 }); hide(); toast('Okay, we will not ask again. You can log in any time from the top of the screen.'); };
      nudgeEl.querySelector('[data-yes]').onclick = () => { hide(); openAuth({ mode: 'signup', from: kind }); };
      document.body.appendChild(nudgeEl);
      const me = nudgeEl;
      setTimeout(() => { if (nudgeEl === me) hide(); }, 30000);
    }, 1500);
  }
  // A bill was just saved (the editor opens it with ?fresh=1): from the second bill on this device.
  function onRoute() {
    if (!/^#\/bill\/[^?]+\?(.*&)?fresh=1/.test(location.hash) || (acct && acct.token)) return;
    const s = read(NUDGE) || {};
    const bills = (s.bills || 0) + 1;
    write(NUDGE, { ...s, bills });
    if (bills >= 2) pbNudge('bill');
  }

  // ---------- UPI payment screen ----------
  function upiLink(plan, amount) {
    const p = new URLSearchParams({
      pn: (cfg.payeeName || 'PakkaBill').slice(0, 40),
      am: Number(amount).toFixed(2),
      cu: 'INR',
      tn: `PakkaBill Pro ${plan} ${acct && acct.user ? acct.user.phone : ''}`.trim().slice(0, 50),
    });
    // UPI apps expect the payee address unencoded, as the bill QR does.
    return `upi://pay?pa=${cfg.upiId.trim()}&` + p.toString().replace(/\+/g, '%20');
  }
  // Razorpay checkout when the admin has set it up (Pro turns on by itself), else the UPI QR screen.
  function openPay(plan, presetCoupon = '') {
    if (isLifetime()) return toast(acct.user.phone === 'owner' ? 'This is the owner account: Pro is on for good, nothing to pay. To try a payment, log in with a customer mobile number.' : 'Your PakkaBill Pro runs for years already. Nothing to pay.');
    if (playApp()) return toast('Buying Pro is not available in this app.', true);
    return cfg && cfg.razorpay ? openRzp(plan, presetCoupon) : openUpi(plan, presetCoupon);
  }
  function openUpi(plan, presetCoupon = '') {
    if (!cfg || !cfg.upiId) return toast('Payments are not set up yet.', true);
    const listPrice = plan === 'yearly' ? cfg.yearly : cfg.monthly;
    const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    let amount = listPrice;
    let coupon = '';
    showDialog((box) => {
      const draw = () => {
        const link = upiLink(plan, amount);
        let qr = '';
        try {
          qr = window.pbQR ? window.pbQR(link, 6, 2) : '';
        } catch {}
        const typed = box.querySelector('.pbp-utr input')?.value || '';
        box.innerHTML = `<button type="button" class="pbp-x" aria-label="Close">×</button>
        <div class="pbp-badge">PRO</div>
        <h2 id="pbp-title">Pay ${rupees(amount)}${amount < listPrice ? ` <s class="pbp-was">${rupees(listPrice)}</s>` : ''}</h2>
        <p class="pbp-why">PakkaBill Pro for ${plan === 'yearly' ? '1 year' : '1 month'}.${coupon ? ` Coupon <b>${esc(coupon)}</b> applied.` : ''}</p>
        <form class="pbp-coupon"><input name="code" placeholder="Coupon code" aria-label="Coupon code" autocomplete="off" value="${esc(coupon || presetCoupon)}"><button type="submit" class="pbp-btn pbp-btn--sm">${coupon ? 'Change' : 'Apply'}</button></form>
        <p class="pbp-err pbp-coupon-err" role="alert"></p>
        <ol class="pbp-steps">
          <li><b>Scan and pay exactly ${rupees(amount)}</b> with any UPI app.
            ${qr ? `<img class="pbp-qr" src="${qr}" alt="UPI QR code to pay ${esc(rupees(amount))} to ${esc(cfg.upiId)}">` : ''}
            <span class="pbp-upi">To <b>${esc(cfg.payeeName || cfg.upiId)}</b> · <code>${esc(cfg.upiId)}</code> <button type="button" class="pbp-link" data-copy>Copy UPI ID</button></span>
            ${mobile ? `<a class="pbp-btn pbp-open" href="${esc(link)}">Open UPI app</a>` : ''}
          </li>
          <li><b>Enter the 12-digit transaction number</b> from the payment receipt. PhonePe calls it <i>UTR</i>, Google Pay <i>UPI transaction ID</i>, Paytm <i>UPI Ref No</i>.
            <form class="pbp-auth pbp-utr"><div class="pbp-utr__row"><input name="utr" inputmode="numeric" autocomplete="off" maxlength="14" placeholder="12-digit number" aria-label="UPI transaction number" value="${esc(typed)}" required>${navigator.clipboard && navigator.clipboard.readText ? '<button type="button" class="pbp-btn pbp-btn--sm pbp-paste" data-paste>Paste</button>' : ''}</div>
            <p class="pbp-err" role="alert"></p><button class="pbp-btn" type="submit">Submit payment</button></form>
          </li>
        </ol>
        <p class="pbp-fine">We check every payment by hand. Pro turns on as soon as it is confirmed, usually within a few hours.</p>`;
        box.querySelector('.pbp-x').addEventListener('click', closeUpgrade);
        box.querySelector('[data-copy]').addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(cfg.upiId);
            toast('UPI ID copied.');
          } catch {
            toast(cfg.upiId);
          }
        });
        const cform = box.querySelector('.pbp-coupon');
        cform.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const code = cform.code.value.trim();
          const cerr = box.querySelector('.pbp-coupon-err');
          cerr.textContent = '';
          if (!code) {
            coupon = '';
            amount = listPrice;
            return draw();
          }
          cform.querySelector('button').disabled = true;
          try {
            const q = await api('pay', { body: { action: 'quote', plan, coupon: code } });
            coupon = q.coupon;
            amount = q.amount;
            draw();
            toast(`Coupon applied. You pay ${rupees(amount)}.`);
          } catch (e) {
            cerr.textContent = e.message;
            cform.querySelector('button').disabled = false;
          }
        });
        const form = box.querySelector('.pbp-utr');
        // Paste: finds the 12-digit UTR in whatever was copied from the payment app
        const pasteBtn = box.querySelector('[data-paste]');
        if (pasteBtn) pasteBtn.addEventListener('click', async () => {
          try {
            const text = await navigator.clipboard.readText();
            const m = String(text).replace(/(\d)[ -](?=\d)/g, '$1').match(/(?<!\d)\d{12}(?!\d)/);
            if (m) { form.utr.value = m[0]; toast('UTR pasted. Check it matches your payment app.'); }
            else toast('No 12-digit number found in what you copied. Copy the UTR in your payment app first.', true);
          } catch { toast('Allow PakkaBill to paste, or type the 12-digit number.', true); }
        });
        form.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const err = form.querySelector('.pbp-err');
          const btn = form.querySelector('.pbp-btn');
          const utr = form.utr.value.replace(/\s/g, '');
          err.textContent = '';
          if (!/^\d{12}$/.test(utr)) return (err.textContent = 'The transaction number has exactly 12 digits.');
          btn.disabled = true;
          try {
            await api('pay', { body: { plan, utr, coupon } });
            myOrders = null;
            box.innerHTML = `<button type="button" class="pbp-x" aria-label="Close">×</button><div class="pbp-badge">PRO</div>
            <h2 id="pbp-title">Payment submitted</h2>
            <p class="pbp-why">Thank you. We will match transaction <b>${esc(utr)}</b> for ${rupees(amount)} with our account and turn on Pro, usually within a few hours. You can keep using PakkaBill meanwhile.</p>
            ${window.pbPushSupported && window.pbPushSupported() ? '<button type="button" class="pbp-btn pbp-btn--ghost" data-notify>🔔 Notify me when it is approved</button>' : ''}
            <button type="button" class="pbp-btn" data-done>OK</button>`;
            box.querySelector('.pbp-x').addEventListener('click', closeUpgrade);
            box.querySelector('[data-done]').addEventListener('click', closeUpgrade);
            const nb = box.querySelector('[data-notify]');
            if (nb) nb.addEventListener('click', () => {
              nb.disabled = true;
              window.pbPushEnable(true)
                .then(() => { nb.textContent = '✓ We will notify you on this phone'; })
                .catch((e) => { nb.disabled = false; toast(e.message, true); });
            });
            rerender();
          } catch (e) {
            err.textContent = e.message;
            btn.disabled = false;
          }
        });
      };
      draw();
      box.querySelector('.pbp-utr input').focus();
      if (presetCoupon) box.querySelector('.pbp-coupon').requestSubmit();
      // back from the UPI app: ready for the UTR
      const back = () => { if (!document.hidden && box.isConnected) { const i = box.querySelector('.pbp-utr input'); if (i && !i.value) i.focus(); } else if (!box.isConnected) document.removeEventListener('visibilitychange', back); };
      document.addEventListener('visibilitychange', back);
    });
  }

  // ---------- Razorpay checkout ----------
  let rzpLib = null;
  const loadRzp = () => rzpLib || (rzpLib = new Promise((ok, fail) => {
    if (window.Razorpay) return ok(window.Razorpay);
    const sc = document.createElement('script');
    sc.src = 'https://checkout.razorpay.com/v1/checkout.js';
    sc.async = true;
    sc.onload = () => (window.Razorpay ? ok(window.Razorpay) : fail(new Error('Razorpay did not load. Try again.')));
    sc.onerror = () => { rzpLib = null; sc.remove(); fail(new Error('Could not load Razorpay. Check your internet and try again.')); };
    document.head.appendChild(sc);
  }));
  const LOCK = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z"/></svg>';
  const TICK = '<svg class="pbp-tick" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="36"/><path d="M22 37l10 10 18-20"/></svg>';
  function openRzp(plan, presetCoupon = '') {
    const price = { monthly: Number(cfg.monthly), yearly: Number(cfg.yearly) };
    const wasPro = isPro();
    // plan, coupon and price shown; couponOpen shows the code box; errors stay until the next action
    const st = { plan, coupon: '', amount: price[plan], couponOpen: !!presetCoupon, couponErr: '', payErr: '' };
    const period = () => (st.plan === 'yearly' ? '1 year' : '1 month');
    // the new end date: Pro time adds on top of what is left
    const until = () => dateStr(Math.max(Date.now(), (acct && acct.user && acct.user.paidUntil) || 0) + (st.plan === 'yearly' ? 365 : 30) * 864e5);
    loadRzp().catch(() => {}); // start loading while the customer reads
    showDialog((box) => {
      const overlay = box.parentNode;
      const quote = async (code) => {
        const q = await api('pay', { body: { action: 'quote', plan: st.plan, coupon: code } });
        st.coupon = q.coupon;
        st.amount = q.amount;
      };
      const draw = () => {
        const list = price[st.plan];
        const save = price.monthly * 12 - price.yearly;
        box.innerHTML = `<button type="button" class="pbp-x" aria-label="Close">×</button>
        <div class="pbp-badge">PRO</div>
        <h2 id="pbp-title">${wasPro ? 'Extend PakkaBill Pro' : 'Get PakkaBill Pro'}</h2>
        <div class="pbp-pick" role="radiogroup" aria-label="Choose a plan">
          <button type="button" role="radio" aria-checked="${st.plan === 'monthly'}" class="${st.plan === 'monthly' ? 'is-on' : ''}" data-pick="monthly"><span>Monthly</span><b>${rupees(price.monthly)}</b><small>per month</small></button>
          <button type="button" role="radio" aria-checked="${st.plan === 'yearly'}" class="${st.plan === 'yearly' ? 'is-on' : ''}" data-pick="yearly">${save > 0 ? `<i>Save ${rupees(save)}</i>` : ''}<span>Yearly</span><b>${rupees(price.yearly)}</b><small>${rupees(Math.round(price.yearly / 12))} a month</small></button>
        </div>
        <div class="pbp-sum">
          <div><span>PakkaBill Pro, ${period()}</span><span>${rupees(list)}</span></div>
          ${st.coupon ? `<div class="pbp-sum__off"><span>Coupon ${esc(st.coupon)} <button type="button" class="pbp-link" data-uncoupon>Remove</button></span><span>−${rupees(list - st.amount)}</span></div>` : ''}
          <div class="pbp-sum__total"><span>You pay</span><b>${rupees(st.amount)}</b></div>
          <p>Pro till <b>${until()}</b>${wasPro && isPro() ? `<br><small>Your plan now ends on ${dateStr(acct.user.paidUntil)}. The new ${period()} starts after that, so no day is lost.</small>` : ''}</p>
        </div>
        ${st.coupon ? '' : st.couponOpen
          ? `<form class="pbp-coupon"><input name="code" placeholder="Coupon code" aria-label="Coupon code" autocomplete="off" autocapitalize="characters" value="${esc(presetCoupon)}"><button type="submit" class="pbp-btn pbp-btn--sm">Apply</button></form>`
          : '<button type="button" class="pbp-link pbp-havecode" data-havecode>Have a coupon code?</button>'}
        <p class="pbp-err pbp-coupon-err" role="alert">${esc(st.couponErr)}</p>
        <button type="button" class="pbp-btn pbp-paybtn" data-rzp>${LOCK}<span>Pay ${rupees(st.amount)}</span></button>
        <p class="pbp-err pbp-rzp-err" role="alert">${esc(st.payErr)}</p>
        <div class="pbp-ways" aria-label="Ways to pay"><span>UPI</span><span>Cards</span><span>Net banking</span><span>Wallets</span></div>
        <p class="pbp-fine pbp-center">Secured by Razorpay. Pro turns on the moment you pay.</p>
        ${cfg.upiId ? '<p class="pbp-fine pbp-center"><button type="button" class="pbp-link" data-upi>Pay by scanning our UPI QR instead</button></p>' : ''}`;
        box.querySelector('.pbp-x').addEventListener('click', closeUpgrade);
        box.querySelector('[data-upi]')?.addEventListener('click', () => openUpi(st.plan, st.coupon || presetCoupon));
        box.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', async () => {
          if (b.dataset.pick === st.plan) return;
          st.plan = b.dataset.pick;
          st.amount = price[st.plan];
          st.couponErr = st.payErr = '';
          if (st.coupon) {
            try {
              await quote(st.coupon); // a coupon can be for one plan only
            } catch (e) {
              st.coupon = '';
              st.couponErr = e.message;
            }
          }
          draw();
        }));
        box.querySelector('[data-havecode]')?.addEventListener('click', () => {
          st.couponOpen = true;
          draw();
          box.querySelector('.pbp-coupon input').focus();
        });
        box.querySelector('[data-uncoupon]')?.addEventListener('click', () => {
          st.coupon = '';
          st.amount = price[st.plan];
          draw();
        });
        const cform = box.querySelector('.pbp-coupon');
        if (cform) cform.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const code = cform.code.value.trim();
          if (!code) return;
          cform.querySelector('button').disabled = true;
          try {
            await quote(code);
            st.couponErr = '';
            draw();
            toast(`Coupon applied. You pay ${rupees(st.amount)}.`);
          } catch (e) {
            st.couponErr = e.message;
            draw();
          }
        });
        const btn = box.querySelector('[data-rzp]');
        const ready = () => {
          overlay.style.display = '';
          btn.disabled = false;
          btn.lastChild.textContent = `Pay ${rupees(st.amount)}`;
        };
        btn.addEventListener('click', async () => {
          st.payErr = '';
          box.querySelector('.pbp-rzp-err').textContent = '';
          btn.disabled = true;
          btn.lastChild.textContent = 'Opening secure payment…';
          try {
            const [Razorpay, o] = await Promise.all([loadRzp(), api('pay', { body: { action: 'rzpOrder', plan: st.plan, coupon: st.coupon } })]);
            if (o.amount !== Math.round(st.amount * 100)) { st.amount = o.amount / 100; toast(`The price is now ${rupees(st.amount)}.`); } // prices changed since the page loaded
            const u = (acct && acct.user) || {};
            const rz = new Razorpay({
              key: o.key,
              order_id: o.orderId,
              amount: o.amount,
              currency: o.currency || 'INR',
              name: 'PakkaBill',
              description: `PakkaBill Pro, ${period()}`,
              image: location.origin + '/icon-192.png',
              prefill: { contact: /^\d{10}$/.test(u.phone || '') ? u.phone : '', name: u.shopName || '' },
              notes: { plan: st.plan },
              theme: { color: '#5b3fe6' },
              modal: { ondismiss: ready, confirm_close: true },
              handler: (r) => { overlay.style.display = ''; afterPay(r); },
            });
            rz.on('payment.failed', (r) => {
              st.payErr = ((r && r.error && r.error.description) || 'The payment did not go through.') + ' No money was taken. Try again or pick another way to pay.';
              box.querySelector('.pbp-rzp-err').textContent = st.payErr;
            });
            overlay.style.display = 'none'; // Razorpay shows its own window
            rz.open();
          } catch (e) {
            st.payErr = e.message;
            box.querySelector('.pbp-rzp-err').textContent = e.message;
            ready();
          }
        });
      };
      // Back from checkout: the server checks the payment with Razorpay and turns Pro on.
      const afterPay = async (r) => {
        box.innerHTML = '<div class="pbp-done"><div class="pbp-spin" aria-hidden="true"></div><h2 id="pbp-title">Confirming your payment…</h2><p class="pbp-why">This takes a few seconds. Please keep this open.</p></div>';
        let res = null;
        let last = null;
        for (let i = 0; i < 3 && !res; i++) {
          try {
            res = await api('pay', { body: { action: 'rzpDone', ...r } });
          } catch (e) {
            last = e;
            await new Promise((ok) => setTimeout(ok, 2500));
          }
        }
        myOrders = null;
        if (res && res.user) setAcct({ ...acct, user: res.user }, false);
        const pid = esc(r.razorpay_payment_id || '');
        box.innerHTML = res
          ? `<button type="button" class="pbp-x" aria-label="Close">×</button><div class="pbp-done">${TICK}
            <h2 id="pbp-title">Payment successful</h2>
            <p class="pbp-why">PakkaBill Pro is active till <b>${dateStr(res.user.paidUntil)}</b>.</p>
            <div class="pbp-rows"><div><span>Paid</span><b>${rupees(res.order.amount / 100)}</b></div><div><span>Plan</span><b>Pro, ${res.order.plan === 'yearly' ? '1 year' : '1 month'}</b></div><div><span>Payment ID</span><b>${pid}</b></div></div>
            <button type="button" class="pbp-btn pbp-paybtn" data-done>Start using Pro</button>
            <p class="pbp-fine">Razorpay also sends a receipt by SMS or email.</p></div>`
          : `<button type="button" class="pbp-x" aria-label="Close">×</button><div class="pbp-done"><div class="pbp-wait" aria-hidden="true">⏳</div>
            <h2 id="pbp-title">Payment received</h2>
            <p class="pbp-why">We are still confirming it with Razorpay. Pro turns on by itself within a few minutes; this page updates when it does.${last ? ` <span class="pbp-fine">(${esc(last.message)})</span>` : ''}</p>
            <div class="pbp-rows"><div><span>Payment ID</span><b>${pid}</b></div></div>
            <button type="button" class="pbp-btn pbp-paybtn" data-done>OK</button></div>`;
        const finish = () => { closeUpgrade(); if (!wasPro && isPro()) location.reload(); else rerender(); };
        if (!res) {
          // the server catches up from Razorpay; ask again every 20 seconds for a few minutes
          let n = 0;
          const poll = setInterval(() => { if (isPro() !== wasPro || ++n > 15) return clearInterval(poll); loadOrders(); }, 20000);
        }
        box.querySelector('.pbp-x').addEventListener('click', finish);
        box.querySelector('[data-done]').addEventListener('click', finish);
        loadOrders();
      };
      draw();
      if (presetCoupon) box.querySelector('.pbp-coupon').requestSubmit();
    });
  }

  let myOrders = null;
  async function loadOrders() {
    if (!acct || !acct.token || !cfg || !cfg.enabled) return;
    try {
      const r = await api('pay');
      myOrders = r.orders;
      if (r.user) setAcct({ ...acct, user: r.user }); // a Razorpay payment the app had not heard back about
      plans.forEach((el) => el.isConnected && drawPlan(el));
    } catch {}
  }
  function ordersHtml() {
    if (!myOrders || !myOrders.length) return '';
    const label = { PENDING: 'Waiting for confirmation', COMPLETED: 'Confirmed', REJECTED: 'Not found in our account', REFUNDED: 'Refunded' };
    return `<ul class="pbp-orders">${myOrders
      .map((o) => `<li class="is-${o.state.toLowerCase()}"><span>${rupees(o.amount / 100)} · ${o.plan === 'yearly' ? 'Yearly' : 'Monthly'} · ${o.utr ? 'UTR ' + esc(o.utr) : 'Razorpay'}</span><b>${label[o.state] || esc(o.state)}</b></li>`)
      .join('')}</ul>${myOrders.some((o) => o.state === 'REJECTED') ? '<p class="pbp-fine">If a payment was not found, check the transaction number and submit it again.</p>' : ''}`;
  }

  // ---------- Messages and offers from the admin ----------
  const SEEN = 'pb-news-seen';
  let news = [];
  let pendingClaim = '';
  let newsEl = null;

  async function loadNews() {
    try {
      news = (await api('news')).news || [];
    } catch {
      news = [];
    }
    drawNewsCard();
    plans.forEach((el) => el.isConnected && drawPlan(el));
  }

  function newsAction(n) {
    if (n.trialDays && !n.claimed) return `<button type="button" class="pbp-btn pbp-btn--sm" data-claim="${esc(n.id)}">Claim ${n.trialDays} day${n.trialDays > 1 ? 's' : ''} of Pro free</button>`;
    if (n.trialDays && n.claimed) return '<span class="pbp-claimed">Claimed</span>';
    if (n.cta === 'upgrade' && (isLifetime() || (isPro() && acct.user.lastPlan !== 'trial' && daysLeft() > 7))) return '';
    if (n.cta === 'upgrade') return `<button type="button" class="pbp-btn pbp-btn--sm" data-upgrade>${esc(n.ctaLabel || 'See Pro plans')}</button>`;
    if (n.cta === 'link' && n.link) return `<a class="pbp-btn pbp-btn--sm" href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">${esc(n.ctaLabel || 'Open')}</a>`;
    return '';
  }
  function newsItemHtml(n) {
    const until = n.endAt ? `<small>Till ${dateStr(n.endAt)}</small>` : '';
    return `<b class="pbp-news__title">${esc(n.title)}</b>${n.message ? `<p class="pbp-news__msg">${esc(n.message).replace(/\n/g, '<br>')}</p>` : ''}<div class="pbp-news__row">${newsAction(n)}${until}</div>`;
  }
  function wireNews(root) {
    root.querySelectorAll('[data-claim]').forEach((b) => b.addEventListener('click', () => claimOffer(b.dataset.claim, b)));
    root.querySelectorAll('[data-upgrade]').forEach((b) => b.addEventListener('click', () => openUpgrade('offer')));
  }

  function drawNewsCard() {
    const seen = read(SEEN) || [];
    const next = news.find((n) => !seen.includes(n.id) && !(n.trialDays && n.claimed));
    if (!next) {
      newsEl?.remove();
      newsEl = null;
      return;
    }
    if (!newsEl) {
      newsEl = document.createElement('aside');
      newsEl.setAttribute('aria-label', 'Message from PakkaBill');
      document.body.appendChild(newsEl);
    }
    newsEl.className = `pbp-news tone-${next.tone}`;
    newsEl.innerHTML = `<button type="button" class="pbp-x" aria-label="Hide this message">×</button>${newsItemHtml(next)}`;
    newsEl.querySelector('.pbp-x').addEventListener('click', () => {
      write(SEEN, [...(read(SEEN) || []), next.id].slice(-100));
      drawNewsCard();
    });
    wireNews(newsEl);
  }

  async function claimOffer(id, btn) {
    if (!acct || !acct.token) {
      pendingClaim = id;
      return openUpgrade('claim');
    }
    if (btn) btn.disabled = true;
    try {
      const r = await api('news', { body: { action: 'claim', id } });
      const n = news.find((x) => x.id === id);
      if (n) n.claimed = true;
      toast(`Done! PakkaBill Pro is active till ${dateStr(r.user.paidUntil)}.`);
      closeUpgrade();
      drawNewsCard();
      setAcct({ ...acct, user: r.user });
    } catch (e) {
      toast(e.message, true);
      if (btn) btn.disabled = false;
    }
  }

  function newsListHtml() {
    if (!news.length) return '';
    return `<section class="paper pbp-card"><h2 class="form-sec__title">Messages and offers</h2><ul class="pbp-newslist">${news
      .map((n) => `<li class="tone-${n.tone}">${newsItemHtml(n)}</li>`)
      .join('')}</ul></section>`;
  }

  // ---------- Upgrade dialog ----------
  let dialog = null;
  function showDialog(fill) {
    closeUpgrade();
    dialog = document.createElement('div');
    dialog.className = 'pbp-overlay';
    dialog.innerHTML = '<div class="pbp-dialog" role="dialog" aria-modal="true" aria-labelledby="pbp-title"></div>';
    dialog.addEventListener('click', (e) => e.target === dialog && closeUpgrade());
    document.addEventListener('keydown', onKey);
    document.body.appendChild(dialog);
    fill(dialog.firstChild);
    return dialog.firstChild;
  }
  function openUpgrade(feature, arg) {
    // Already Pro (a page asked from an old state): say so instead of asking to pay again.
    if (isPro() && !['renew', 'offer', 'claim'].includes(feature)) return toast(`PakkaBill Pro is already active till ${dateStr(acct.user.paidUntil)}.`);
    // Not logged in: the short sign-in sheet first, then the plans if Pro is still needed.
    if (!(acct && acct.token)) return openAuth({ why: authWhy(feature, arg), from: 'pro-' + String(feature).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16), then: () => { if (feature === 'offer' || !pbPro()) openUpgrade(feature, arg); } });
    let mode = 'signup';
    const draw = (m) => {
      if (m) mode = m;
      box.innerHTML = `<button type="button" class="pbp-x" aria-label="Close">×</button>
        <div class="pbp-badge">PRO</div>
        <h2 id="pbp-title">${!(acct && acct.token) && /^pnl/.test(feature) ? 'Log in to see your full report' : 'Upgrade to PakkaBill Pro'}</h2>
        <p class="pbp-why">${!(acct && acct.token) && /^pnl/.test(feature) ? 'Create a free account or log in to open your full profit and loss report and download it as PDF or Excel.' : esc((WHY[feature] || WHY.pdf)(arg))}</p>
        <ul class="pbp-perks">${PERKS.map((p) => `<li>${p}</li>`).join('')}</ul>
        ${acct && acct.token ? accountHtml() + plansHtml() + (playApp() ? '' : `<p class="pbp-fine">${cfg && cfg.razorpay ? 'Pay by UPI, card or net banking. Pro turns on as soon as you pay.' : 'Pay by UPI from any app: PhonePe, Google Pay, Paytm or your bank.'}</p>`) : authHtml(mode)}`;
      box.querySelector('.pbp-x').addEventListener('click', closeUpgrade);
      wire(box, draw);
    };
    const box = showDialog(() => {});
    draw();
    dialogDraw = draw;
    box.querySelector('input,button.pbp-plan')?.focus();
  }
  function onKey(e) {
    if (e.key === 'Escape') closeUpgrade();
  }
  function closeUpgrade() {
    if (!dialog) return;
    dialog.remove();
    dialog = null;
    document.removeEventListener('keydown', onKey);
    dialogDraw = null;
  }

  // ---------- Plan page ----------
  const plans = new Set();
  let dialogDraw = null;
  function rerender() {
    if (dialogDraw) dialogDraw();
    plans.forEach((el) => (el.isConnected ? drawPlan(el) : plans.delete(el)));
    chips.forEach((el) => (el.isConnected ? drawChip(el) : chips.delete(el)));
    cards.forEach((el) => (el.isConnected ? drawCard(el) : cards.delete(el)));
  }
  function drawPlan(el, mode = el._pbMode || 'signup') {
    el._pbMode = mode;
    let status;
    if (!cfg || !cfg.enabled) status = '<div class="pbp-status is-free"><b>Everything is free right now.</b><span>Paid plans are not switched on yet.</span></div>';
    else if (isLifetime()) status = `<div class="pbp-status is-pro"><b>${acct.user.phone === 'owner' ? 'Owner account: Pro for good' : 'PakkaBill Pro for years ahead'}</b><span>${acct.user.phone === 'owner' ? 'Everything is unlocked on this device. To try buying Pro, log in with a customer mobile number.' : `Till ${dateStr(acct.user.paidUntil)}. Everything is unlocked; nothing to pay.`}</span></div>`;
    else if (isPro() && acct.user.lastPlan === 'trial') status = `<div class="pbp-status is-pro${daysLeft() <= 3 ? ' is-soon' : ''}"><b>Free Pro trial: ${daysLeft()} day${daysLeft() === 1 ? '' : 's'} left</b><span>Till ${dateStr(acct.user.paidUntil)}. Take Pro before it ends to keep unlimited bills, your shops and cloud backup.</span></div>`;
    else if (isPro() && daysLeft() <= 5) status = `<div class="pbp-status is-pro is-soon"><b>Your Pro plan ends in ${daysLeft()} day${daysLeft() === 1 ? '' : 's'}</b><span>On ${dateStr(acct.user.paidUntil)}. Renew now; the new time adds on top of what is left.</span></div>`;
    else if (isPro()) status = `<div class="pbp-status is-pro"><b>PakkaBill Pro is active</b><span>Till ${dateStr(acct.user.paidUntil)}. Everything is unlocked; nothing to pay now.</span></div>`;
    else if (acct && acct.user && acct.user.paidUntil) status = `<div class="pbp-status is-free"><b>Your Pro plan ended on ${dateStr(acct.user.paidUntil)}</b><span>You are on the free plan: ${cfg.freeBills} bills a month.</span></div>`;
    else status = `<div class="pbp-status is-free"><b>You are on the free plan</b><span>${cfg.freeBills} bills a month, 8 bill designs including Trader and Bill book, printing.</span></div>`;
    // Pro already active with more than a week left: no buying section, only "Extend Pro early" folded away
    const proOn = isPro() && acct.user.lastPlan !== 'trial' && daysLeft() > 7;
    const payLine = playApp() ? '' : `<p class="pbp-fine">${cfg && cfg.razorpay ? 'Pay by UPI, card or net banking. Pro turns on as soon as you pay.' : 'Pay by UPI from any app: PhonePe, Google Pay, Paytm or your bank.'}</p>`;
    const proCard = !(cfg && cfg.enabled) ? ''
      : proOn ? `<section class="paper pbp-card"><h2 class="form-sec__title">Your Pro plan</h2>
          <p class="pbp-fine pbp-have">Everything in PakkaBill is unlocked for you:</p>
          <ul class="pbp-perks">${PERKS.map((p) => `<li>${p}</li>`).join('')}</ul>
          ${playApp() || isLifetime() ? '' : `<details class="pbp-cmp pbp-extend"><summary>Extend Pro early</summary><p class="pbp-fine">Not needed now. Paying again adds the new time after ${dateStr(acct.user.paidUntil)}.</p>${plansHtml()}${payLine}</details>`}</section>`
      : `<section class="paper pbp-card"><h2 class="form-sec__title">${isPro() ? 'Keep PakkaBill Pro' : 'PakkaBill Pro'}</h2>
          <ul class="pbp-perks">${PERKS.map((p) => `<li>${p}</li>`).join('')}</ul>
          <details class="pbp-cmp"><summary>Compare Free and Pro</summary>${compareHtml()}</details>
          ${acct && acct.token ? plansHtml() + payLine : authHtml(mode)}</section>`;
    el.innerHTML = `<div class="page-head"><div><h1 class="page-title">Plan</h1><p class="page-sub">Your PakkaBill account and Pro plan.</p></div></div>
      <div class="pbp-page">
        <section class="paper pbp-card">${status}${ordersHtml()}${accountHtml()}${acct && acct.token ? '' : '<div class="pbp-acct"><span>Not logged in. Your bills are saved on this device only.</span><span class="pbp-acct__btns"><button type="button" class="pbp-btn pbp-btn--sm" data-auth="signup">Create free account</button><button type="button" class="pbp-link" data-auth="login">Log in</button></span></div>'}${isPro() ? '' : '<p class="pbp-fine pbp-help">Paid but Pro is not on yet, or a question about your plan? <a href="#/support?new=1&amp;topic=payment">Raise a support ticket</a>.</p>'}${acct && acct.token ? '<p class="pbp-fine pbp-help">☁️ <a href="#/shops">Your shops and cloud backup →</a></p>' : ''}</section>
        ${newsListHtml()}
        ${proCard}
      </div>`;
    wire(el, (m) => drawPlan(el, m));
    wireNews(el);
  }
  function pbPlanMount(el) {
    if (plans.has(el)) return;
    plans.add(el);
    drawPlan(el);
    loadOrders();
  }

  function pbLocked(el, feature) {
    if (el._pbLocked) return;
    el._pbLocked = true;
    el.innerHTML = `<div class="page-head"><div><h1 class="page-title">GSTR-1 JSON</h1><p class="page-sub">Build your GSTR-1 file from Meesho's reports.</p></div></div>
      <section class="paper pbp-card pbp-lock"><div class="pbp-badge">PRO</div><h2 class="form-sec__title">${esc(WHY[feature]())}</h2>
      <p class="pbp-fine">Upload Meesho's sales, returns and tax invoice reports and get a ready GSTR-1 JSON to file on the GST portal.</p>
      <button type="button" class="pbp-btn">See Pro plans</button></section>`;
    el.querySelector('.pbp-btn').addEventListener('click', () => openUpgrade(feature));
  }

  function pbGate(feature) {
    if (pbPro()) return true;
    openUpgrade(feature);
    return false;
  }

  function monthOf(t) {
    const d = new Date(t);
    return d.getFullYear() * 12 + d.getMonth();
  }
  // Called before a new bill is saved. Estimates never count.
  function pbCanAddBill(invoices, bill) {
    if (pbPro() || !bill || bill.docType === 'estimate') return true;
    const now = monthOf(Date.now());
    const used = (invoices || []).filter(
      (x) => x.docType !== 'estimate' && monthOf(x.createdAt || Date.parse(x.date) || 0) === now,
    ).length;
    const limit = cfg ? Number(cfg.freeBills) : 15;
    if (used < limit) return true;
    openUpgrade('bills', limit);
    return false;
  }

  let toastEl = null;
  function toast(msg, bad) {
    toastEl?.remove();
    toastEl = document.createElement('div');
    toastEl.className = 'pbp-toast' + (bad ? ' is-bad' : '');
    toastEl.setAttribute('role', 'status');
    toastEl.textContent = msg;
    document.body.appendChild(toastEl);
    const me = toastEl;
    setTimeout(() => me.remove(), 5000);
  }

  const css = `
.pbp-overlay{position:fixed;inset:0;z-index:1000;background:#1a14307a;display:grid;place-items:center;padding:16px;animation:pbp-in .15s}
@keyframes pbp-in{from{opacity:0}}
.pbp-dialog{position:relative;background:var(--paper,#fff);color:var(--ink,#222);width:min(420px,100%);max-height:calc(100dvh - 32px);overflow:auto;border-radius:18px;padding:26px 22px 20px;box-shadow:0 24px 60px -20px #1a1430b3}
.pbp-x{position:absolute;top:10px;right:12px;border:0;background:none;font-size:26px;line-height:1;color:var(--ink-3,#777);cursor:pointer;padding:4px 8px}
.pbp-badge{display:inline-block;background:var(--btn-grad,var(--btn-bg,#6c4dff));background-color:var(--btn-bg,#6c4dff);color:var(--btn-fg,#fff);font-weight:700;font-size:11px;letter-spacing:.12em;padding:3px 10px;border-radius:999px}
.pbp-dialog h2{font-family:var(--font-display);font-size:28px;font-weight:600;line-height:1;margin:10px 0 6px;padding-top:4px}
.pbp-why{margin:0 0 12px;color:var(--ink-2,#555)}
.pbp-perks{list-style:none;margin:0 0 16px;padding:0;display:grid;gap:6px}
.pbp-perks li{padding-left:24px;position:relative}
.pbp-perks li:before{content:"";position:absolute;left:3px;top:6px;width:11px;height:6px;border-left:2.4px solid var(--carbon,#5b3fe6);border-bottom:2.4px solid var(--carbon,#5b3fe6);transform:rotate(-45deg)}
.pbp-plans{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:4px 0 10px}
.pbp-plan{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;padding:16px 8px 12px;border-radius:14px;border:1.5px solid var(--rule,#ddd);background:var(--paper,#fff);color:var(--ink,#222);cursor:pointer;font:inherit;transition:transform .12s,border-color .12s}
.pbp-plan:hover{transform:translateY(-1px);border-color:var(--carbon,#5b3fe6)}
.pbp-plan b{font-family:var(--font-display);font-size:30px;font-weight:600;line-height:1;padding-top:4px}
.pbp-plan span{font-size:13px;color:var(--ink-2,#555)}
.pbp-plan i{position:absolute;top:-10px;font-style:normal;font-size:11px;font-weight:700;background:var(--carbon,#5b3fe6);color:#fff;padding:2px 8px;border-radius:999px}
.pbp-plan.is-best{border-color:var(--carbon,#5b3fe6);background:var(--carbon-tint,#f6f2ff)}
.pbp-plan:disabled{opacity:.6;cursor:wait}
.pbp-plan.is-busy b:after{content:"…"}
.pbp-auth{display:grid;gap:10px}
.pbp-auth label{display:grid;gap:4px;font-size:13px;font-weight:600;color:var(--ink-2,#555)}
.pbp-pw{position:relative;display:block}.pbp-pw input{width:100%;box-sizing:border-box;padding-right:64px!important}.pbp-show{position:absolute;right:6px;top:50%;transform:translateY(-50%);border:0;background:none;color:var(--brand,#5b3fe6);font:inherit;font-size:13px;font-weight:700;padding:6px 8px;cursor:pointer}
.pbp-auth input{font:inherit;font-size:16px;padding:10px 12px;border-radius:var(--r-ctl,9px);border:1.5px solid var(--rule,#ddd);background:var(--paper,#fff);color:var(--ink,#222)}
.pbp-auth input:focus{outline:2px solid var(--focus,#ff7a59);outline-offset:1px}
.pbp-tabs{display:flex;gap:4px;padding:4px;background:var(--carbon-tint,#f6f2ff);border-radius:999px}
.pbp-tabs button{flex:1;border:0;background:none;font:inherit;font-weight:600;padding:7px;border-radius:999px;color:var(--ink-2,#555);cursor:pointer}
.pbp-tabs button.is-on{background:var(--paper,#fff);color:var(--carbon,#5b3fe6);box-shadow:0 2px 6px -2px #0003}
.pbp-btn{font:inherit;font-weight:700;font-size:15.5px;border:0;border-radius:10px;padding:12px 18px;cursor:pointer;color:var(--btn-fg,#fff);background:var(--btn-bg,#6c4dff);background-image:var(--btn-grad,none)}
.pbp-btn:disabled{opacity:.6;cursor:wait}
.pbp-utr__row{display:flex;gap:8px;align-items:center}.pbp-utr__row input{flex:1;min-width:0}.pbp-paste{flex:none}
.pbp-cmp{margin:4px 0 14px}.pbp-cmp summary{cursor:pointer;font-weight:700;color:var(--carbon,#5b3fe6);margin-bottom:8px}
.pbp-compare{width:100%;border-collapse:collapse;font-size:14px}.pbp-compare th,.pbp-compare td{padding:8px 6px;border-bottom:1px solid var(--rule,#ddd);text-align:center}.pbp-compare td:first-child,.pbp-compare th:first-child{text-align:left}
.pbp-compare th{font-size:12.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3,#777)}.pbp-compare td:last-child{color:var(--carbon,#5b3fe6)}
.pbp-status.is-soon{border-color:#f59e0b;background:#fff7e6}
.pbp-btn--ghost{display:block;width:100%;margin:0 0 8px;background:var(--carbon-tint,#efeaff);background-image:none;color:var(--carbon,#5b3fe6);border:1.5px solid var(--carbon,#5b3fe6)}
.pbp-err{color:var(--red,#c8202a);margin:0;font-size:13.5px;min-height:0}
.pbp-err:empty{display:none}
.pbp-fine{font-size:12.5px;color:var(--ink-3,#777);margin:6px 0 0}
.pbp-acct{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;font-size:13.5px;color:var(--ink-2,#555);padding:10px 0;border-top:1px dashed var(--rule,#ddd);margin-top:12px}
.pbp-dialog .pbp-acct{margin:0 0 10px;border-top:0;border-bottom:1px dashed var(--rule,#ddd);padding-top:0}
.pbp-link{border:0;background:none;font:inherit;font-weight:600;color:var(--carbon,#5b3fe6);text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.pbp-page{display:grid;gap:16px;max-width:560px}
.pbp-card{padding:20px}
.pbp-status{display:grid;gap:2px}
.pbp-status b{font-size:17px}
.pbp-status span{color:var(--ink-2,#555);font-size:14px}
.pbp-status.is-pro b{color:var(--green,#12714b)}
.pbp-lock{max-width:560px;display:grid;gap:8px;justify-items:start}
.pbp-lock .form-sec__title{margin:4px 0 0}
.pbp-toast{position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:1100;background:#1d1838;color:#fff;padding:11px 16px;border-radius:12px;font-size:14.5px;max-width:calc(100vw - 32px);box-shadow:0 12px 30px -12px #0009;animation:pbp-in .2s}
.pbp-toast.is-bad{background:#7d1218}
@media (width>=1024px){.pbp-toast{bottom:28px}}
.pb-ico{display:inline-grid;place-items:center}
.pbp-steps{margin:4px 0 8px;padding-left:22px;display:grid;gap:14px}
.pbp-steps li{padding-left:2px}
.pbp-steps li>b{display:block;margin-bottom:6px}
.pbp-pick{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0 12px}
.pbp-pick button{position:relative;display:grid;gap:2px;justify-items:start;text-align:left;padding:14px 12px 12px;border-radius:14px;border:1.5px solid var(--rule,#ddd);background:var(--paper,#fff);color:var(--ink,#222);font:inherit;cursor:pointer;transition:border-color .12s,background .12s}
.pbp-pick button span{font-size:13px;font-weight:700;color:var(--ink-2,#555)}
.pbp-pick button b{font-family:var(--font-display);font-size:26px;font-weight:600;line-height:1.15}
.pbp-pick button small{font-size:12.5px;color:var(--ink-3,#777)}
.pbp-pick button i{position:absolute;top:-10px;left:10px;font-style:normal;font-size:11px;font-weight:700;background:var(--green,#12714b);color:#fff;padding:2px 8px;border-radius:999px}
.pbp-pick button.is-on{border-color:var(--carbon,#5b3fe6);background:var(--carbon-tint,#f6f2ff);box-shadow:inset 0 0 0 1px var(--carbon,#5b3fe6)}
.pbp-pick button.is-on:after{content:"✓";position:absolute;top:10px;right:10px;width:20px;height:20px;border-radius:50%;background:var(--carbon,#5b3fe6);color:#fff;font-size:12px;font-weight:700;display:grid;place-items:center}
.pbp-sum{border:1px dashed var(--rule,#ddd);border-radius:12px;padding:12px 14px;margin:0 0 10px;display:grid;gap:6px;font-size:14.5px}
.pbp-sum>div{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.pbp-sum__off{color:var(--green,#12714b)}
.pbp-sum__total{border-top:1px solid var(--rule,#ddd);padding-top:8px;font-weight:700}
.pbp-sum__total b{font-family:var(--font-display);font-size:24px;font-weight:600}
.pbp-sum p{margin:0;font-size:12.5px;color:var(--ink-3,#777)}
.pbp-havecode{font-size:14px;margin:0 0 6px;padding:0}
.pbp-paybtn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px 18px;font-size:16.5px;margin-top:6px}
.pbp-ways{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:12px 0 0}
.pbp-ways span{font-size:12px;font-weight:600;color:var(--ink-2,#555);border:1px solid var(--rule,#ddd);border-radius:999px;padding:3px 10px}
.pbp-center{text-align:center}
.pbp-done{text-align:center;display:grid;justify-items:center;gap:4px}
.pbp-done h2{margin-top:6px}
.pbp-done .pbp-why{margin:0}
.pbp-spin{width:46px;height:46px;border-radius:50%;border:4px solid var(--carbon-tint,#efeaff);border-top-color:var(--carbon,#5b3fe6);animation:pbp-rot .8s linear infinite;margin:18px 0 8px}
@keyframes pbp-rot{to{transform:rotate(360deg)}}
.pbp-tick{width:72px;height:72px;margin:8px 0 2px}
.pbp-tick circle{fill:var(--green,#12714b)}
.pbp-tick path{fill:none;stroke:#fff;stroke-width:5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:44;stroke-dashoffset:44;animation:pbp-draw .45s .15s ease-out forwards}
@keyframes pbp-draw{to{stroke-dashoffset:0}}
.pbp-wait{font-size:44px;line-height:1;margin:10px 0 0}
.pbp-rows{display:grid;gap:6px;width:100%;box-sizing:border-box;margin:12px 0 4px;text-align:left;border:1px dashed var(--rule,#ddd);border-radius:12px;padding:12px 14px;font-size:14px}
.pbp-rows div{display:flex;justify-content:space-between;gap:10px}
.pbp-rows span{color:var(--ink-3,#777)}
.pbp-rows b{text-align:right;word-break:break-all}
.pbp-have{margin:0 0 10px}
.pbp-extend{margin:8px 0 0}
.pbp-extend .pbp-plans{margin-top:10px}
@media (prefers-reduced-motion:reduce){.pbp-spin{animation-duration:2.4s}.pbp-tick path{animation:none;stroke-dashoffset:0}}
.pbp-qr{display:block;width:210px;height:210px;margin:6px 0 8px;border-radius:12px;border:1px solid var(--rule,#ddd);image-rendering:pixelated;background:#fff}
.pbp-upi{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font-size:14px;color:var(--ink-2,#555)}
.pbp-upi code{background:var(--carbon-tint,#f6f2ff);padding:1px 7px;border-radius:6px;color:var(--ink,#222)}
.pbp-open{display:inline-block;margin-top:10px;text-decoration:none}
.pbp-utr{margin-top:6px}
.pbp-utr input{letter-spacing:.08em;font-variant-numeric:tabular-nums}
.pbp-orders{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:6px}
.pbp-orders li{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:13.5px;padding:8px 10px;border-radius:10px;background:var(--carbon-tint,#f6f2ff)}
.pbp-orders li b{font-weight:600}
.pbp-orders .is-pending b{color:var(--amber,#b26a00)}
.pbp-orders .is-completed b{color:var(--green,#12714b)}
.pbp-orders .is-rejected b{color:var(--red,#c8202a)}
.pbp-btn--sm{font-size:14px;padding:8px 14px;border-radius:9px;text-decoration:none;display:inline-block}
.pbp-was{font-size:.6em;color:var(--ink-3,#777);font-weight:500}
.pbp-coupon{display:flex;gap:8px;margin:2px 0 4px}
.pbp-coupon input{flex:1;min-width:0;font:inherit;font-size:15px;padding:8px 12px;border-radius:9px;border:1.5px dashed var(--rule,#ddd);background:var(--paper,#fff);color:var(--ink,#222);text-transform:uppercase;letter-spacing:.06em}
.pbp-coupon input::placeholder{text-transform:none;letter-spacing:0}
.pbp-coupon-err{margin:0 0 6px}
.pbp-news{position:fixed;z-index:900;right:20px;bottom:24px;width:min(360px,calc(100vw - 32px));background:var(--paper,#fff);color:var(--ink,#222);border-radius:16px;padding:16px 18px 14px;box-shadow:0 18px 40px -14px #1a143099;border:1px solid var(--rule,#ddd);border-top:5px solid var(--carbon,#5b3fe6);animation:pbp-up .25s ease-out}
@keyframes pbp-up{from{opacity:0;transform:translateY(12px)}}
.pbp-news .pbp-x{top:6px;right:8px;font-size:22px}
.pbp-news.tone-offer,.pbp-newslist .tone-offer{border-top-color:#ff7a59}
.pbp-news.tone-offer{background:linear-gradient(180deg,#fff4ef,var(--paper,#fff) 70%)}
.pbp-news.tone-warn,.pbp-newslist .tone-warn{border-top-color:#e0a300}
.pbp-news__title{display:block;font-size:16px;padding-right:22px;line-height:1.3}
.pbp-news__msg{margin:4px 0 0;color:var(--ink-2,#555);font-size:14px}
.pbp-news__row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px}
.pbp-news__row small{color:var(--ink-3,#777)}
.pbp-news__row:empty{display:none}
.pbp-claimed{font-weight:700;color:var(--green,#12714b);font-size:14px}
.pbp-newslist{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:10px}
.pbp-newslist li{border:1px solid var(--rule,#ddd);border-top:4px solid var(--carbon,#5b3fe6);border-radius:12px;padding:12px 14px}
@media (width<1024px){.pbp-news{right:16px;bottom:calc(76px + env(safe-area-inset-bottom,0px))}}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .pbp-news.tone-offer{background:var(--paper)}}
:root[data-theme=dark] .pbp-news.tone-offer{background:var(--paper)}
@media print{.pbp-news,.pbp-toast{display:none!important}}
.pbp-gets{list-style:none;margin:0 0 14px;padding:12px 14px;display:grid;gap:7px;border-radius:12px;background:var(--carbon-tint,#f6f2ff);font-size:14px}
.pbp-gets li{padding-left:24px;position:relative}
.pbp-gets li:before{content:"";position:absolute;left:3px;top:5px;width:11px;height:6px;border-left:2.4px solid var(--green,#12714b);border-bottom:2.4px solid var(--green,#12714b);transform:rotate(-45deg)}
.pbp-keep{font-size:12.5px;color:var(--ink-3,#777);margin:10px 0 0;text-align:center}
.pbp-later{display:block;margin:8px auto 0;padding:8px 12px;color:var(--ink-2,#555);text-decoration:none;font-weight:600}
.pbp-sheet h2{font-size:26px}
@media (width<600px){.pbp-sheetwrap{place-items:end center;padding:0}.pbp-sheet{width:100%;border-radius:20px 20px 0 0;max-height:calc(100dvh - 24px - env(safe-area-inset-top,0px));padding-bottom:calc(18px + env(safe-area-inset-bottom,0px));animation:pbp-sheet .22s ease-out}}
@keyframes pbp-sheet{from{transform:translateY(40px);opacity:0}}
@media (prefers-reduced-motion:reduce){.pbp-sheet{animation:none}}
.pbp-prof fieldset{border:0;margin:0;padding:0;display:grid;gap:6px}
.pbp-prof legend{font-size:13px;font-weight:600;color:var(--ink-2,#555);padding:0;margin-bottom:6px}
.pbp-chips{display:flex;flex-wrap:wrap;gap:6px}
.pbp-chips button{font:inherit;font-size:13.5px;font-weight:600;padding:6px 12px;border-radius:999px;border:1.5px solid var(--rule,#ddd);background:var(--paper,#fff);color:var(--ink-2,#555);cursor:pointer}
.pbp-chips button[aria-pressed=true]{border-color:var(--carbon,#5b3fe6);background:var(--carbon-tint,#f6f2ff);color:var(--carbon,#5b3fe6)}
.pbp-chips button[aria-pressed=true]:before{content:"✓ "}
.pb-authchip{display:inline-flex;align-items:center;gap:4px;margin:0 2px;flex:none}
.pb-authchip:empty{display:none}
.pbp-in{font:inherit;font-size:14px;font-weight:700;height:36px;padding:0 13px;border-radius:999px;border:1.5px solid transparent;cursor:pointer;white-space:nowrap;color:var(--btn-fg,#fff);background:var(--btn-bg,#6c4dff);background-image:var(--btn-grad,none)}
.pbp-in--ghost{background:none;background-image:none;color:var(--carbon,#5b3fe6);border-color:var(--rule,#ddd)}
.pbp-in:focus-visible,.pbp-av:focus-visible{outline:2px solid var(--focus,#ff7a59);outline-offset:2px}
.pbp-av{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:800;color:#fff;text-decoration:none;background:linear-gradient(135deg,#5b3fe6,#ff7a59)}
@media (width<560px){.pb-authchip .pbp-in--ghost{display:none}.pb-authchip.is-back .pbp-in--ghost{display:inline-block}.pb-authchip.is-back .pbp-in:not(.pbp-in--ghost){display:none}.pb-authchip.is-in{display:none}.pbp-in{height:34px;padding:0 11px;font-size:13.5px}.topbar__right:has(.pb-authchip:not(.is-in)) .topbar__help-txt{display:none}.topbar__right:has(.pb-authchip:not(.is-in)) .topbar__help{padding:0 9px}}
.pb-authcard{display:block;margin:0 0 10px}
.pb-authcard[hidden]{display:none}
.pbp-acard{display:grid;gap:3px;padding:12px 14px;border-radius:14px;border:1px solid var(--rule,#ddd);background:var(--paper,#fff);color:var(--ink,#222)}
.pbp-acard b{font-size:14.5px}
.pbp-acard span{font-size:12.5px;color:var(--ink-3,#777);line-height:1.35}
.pbp-acard div{display:flex;align-items:center;gap:10px;margin-top:8px}
.pbp-acct__btns{display:inline-flex;align-items:center;gap:12px;flex-wrap:wrap}
.pbp-nudge .pbp-news__row{gap:6px 12px}
.pbp-nudge .pbp-off{font-size:12.5px;color:var(--ink-3,#777);font-weight:500}
@media print{.pb-authchip,.pb-authcard{display:none!important}}`;

  function init() {
    const st = document.createElement('style');
    st.id = 'pbp-css';
    st.textContent = css;
    document.head.appendChild(st);
    refresh();
    window.addEventListener('online', refresh);
    window.addEventListener('hashchange', onRoute);
    // logged in or out in another tab, or on My account
    window.addEventListener('storage', (e) => {
      if (e.key !== ACCT) return;
      acct = read(ACCT);
      rerender();
    });
    window.addEventListener('pb-account', () => {
      acct = read(ACCT);
      rerender();
    });
    // signed up just before the app reloaded (the free trial turned Pro on): ask about the shop now
    if (read(ASK_PROFILE)) setTimeout(() => { if (acct && acct.token && !acct.user.profiled && !dialog) askProfile(); else if (!(acct && acct.token)) write(ASK_PROFILE, null); }, 1800);
  }
  // When a new version of the app takes over, reload once so it shows straight away.
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloaded) {
        reloaded = true;
        location.reload();
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Opens .zip files (the GST portal hands out reports zipped) and returns the
  // spreadsheets inside; other files pass through unchanged.
  async function pbUnzipFiles(files) {
    const out = [];
    for (const f of files) {
      if (!/\.zip$/i.test(f.name)) {
        out.push(f);
        continue;
      }
      const found = [];
      try {
        const buf = new Uint8Array(await f.arrayBuffer());
        const dv = new DataView(buf.buffer);
        let eocd = -1;
        for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
          if (dv.getUint32(i, true) === 0x06054b50) {
            eocd = i;
            break;
          }
        }
        if (eocd < 0) throw new Error('not a zip');
        let p = dv.getUint32(eocd + 16, true);
        for (let k = dv.getUint16(eocd + 10, true); k > 0; k--) {
          if (dv.getUint32(p, true) !== 0x02014b50) break;
          const method = dv.getUint16(p + 10, true);
          const size = dv.getUint32(p + 20, true);
          const nameLen = dv.getUint16(p + 28, true);
          const skip = nameLen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
          const local = dv.getUint32(p + 42, true);
          const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
          p += 46 + skip;
          if (!/\.(xlsx|xls|csv)$/i.test(name) || name.includes('__MACOSX')) continue;
          const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
          const data = buf.subarray(start, start + size);
          let bytes = null;
          if (method === 0) bytes = data;
          else if (method === 8 && typeof DecompressionStream !== 'undefined')
            bytes = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
          if (bytes) found.push(new File([bytes], name.split('/').pop(), { lastModified: f.lastModified }));
        }
      } catch {}
      // Nothing readable inside: pass the zip on so the reader explains the problem.
      out.push(...(found.length ? found : [f]));
    }
    return out;
  }

  // The Meesho P&L (pnl.html, in a frame) asks this: the full report and downloads need a login and Pro
  // (or everything free, when paid plans are off).
  const pbPnlAccess = () => {
    const login = !!(acct && acct.token);
    return { login, pro: login && pbPro(), trialDays: (cfg && cfg.trialDays) || 0, play: playApp() };
  };
  Object.assign(window, { pbPnlAccess, pbPro, pbGate, pbCanAddBill, pbPlanMount, pbLocked, pbUpgrade: openUpgrade, pbUnzipFiles, pbRefreshAccount: refresh, pbAuth: openAuth, pbAuthChip, pbAuthCard, pbNudge, pbAuthProfile: () => askProfile(true) });
})();
