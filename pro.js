// PakkaBill Pro: plan checks, upgrade dialog, account and the Plan page.
// The app calls window.pbPro(), pbGate(feature), pbCanAddBill(invoices, bill),
// pbPlanMount(el) and pbLocked(el, feature). Paid features only lock once the
// server reports that payments are set up (config.enabled && config.enforce).
(function () {
  const ACCT = 'pb-acct';
  const CFG = 'pb-cfg';
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
  const isPro = () => !!(acct && acct.user && acct.user.paidUntil > Date.now());
  const pbPro = () => !enforced() || isPro();

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const rupees = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const dateStr = (t) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  async function api(path, opts = {}) {
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
    acct = next;
    write(ACCT, next);
    rerender();
    if (reloadOnChange && before !== pbPro()) setTimeout(() => location.reload(), 600);
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
      if (before !== pbPro()) location.reload();
    } catch {
      /* offline or server not deployed: keep the last known state */
    }
  }

  const WHY = {
    bills: (n) => `You have used your ${n} free bills this month.`,
    design: () => 'The Royal bill design is part of PakkaBill Pro.',
    logo: () => 'Your logo and signature on bills are part of PakkaBill Pro.',
    gstr1: () => 'GSTR-1 JSON export is part of PakkaBill Pro.',
    pdf: () => 'PDF download and sharing are part of PakkaBill Pro.',
    share: () => 'WhatsApp sharing is part of PakkaBill Pro.',
  };
  const PERKS = [
    'Unlimited bills every month',
    'Royal design, your logo and signature',
    'PDF download, share and WhatsApp',
    'GSTR-1 JSON from Meesho reports',
  ];

  function plansHtml() {
    const m = cfg ? cfg.monthly : 99;
    const y = cfg ? cfg.yearly : 999;
    const save = m * 12 - y;
    return `<div class="pbp-plans">
      <button type="button" class="pbp-plan" data-plan="monthly"><b>${rupees(m)}</b><span>per month</span></button>
      <button type="button" class="pbp-plan is-best" data-plan="yearly">${save > 0 ? `<i>Save ${rupees(save)}</i>` : ''}<b>${rupees(y)}</b><span>per year</span></button>
    </div>`;
  }

  function authHtml(mode) {
    return `<form class="pbp-auth" data-mode="${mode}">
      <div class="pbp-tabs"><button type="button" data-mode="login" class="${mode === 'login' ? 'is-on' : ''}">Log in</button><button type="button" data-mode="signup" class="${mode === 'signup' ? 'is-on' : ''}">Create account</button></div>
      <label>Mobile number<input name="phone" inputmode="numeric" autocomplete="tel" placeholder="10-digit mobile" required></label>
      ${mode === 'signup' ? '<label>Shop name<input name="shopName" autocomplete="organization" placeholder="As on your bills"></label>' : ''}
      <label>Password<input name="password" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" minlength="6" required></label>
      <p class="pbp-err" role="alert"></p>
      <button class="pbp-btn" type="submit">${mode === 'signup' ? 'Create account' : 'Log in'}</button>
      <p class="pbp-fine">${mode === 'login' ? 'Forgot your password? Ask PakkaBill support to reset it.' : 'Your account lets Pro work on every phone and laptop you log in on.'}</p>
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
    const form = root.querySelector('.pbp-auth');
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
            body: { action: form.dataset.mode, phone: f.get('phone'), password: f.get('password'), shopName: f.get('shopName') || '' },
          });
          setAcct({ token: r.token, user: r.user });
          toast(r.user.pro ? 'Logged in. Pro is active.' : 'Logged in.');
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
    });
  }

  function accountHtml() {
    if (!acct || !acct.user) return '';
    const u = acct.user;
    return `<div class="pbp-acct"><span>${u.phone === 'owner' ? 'Owner account' : 'Logged in as ' + esc(u.phone)}${u.shopName && u.phone !== 'owner' ? ' · ' + esc(u.shopName) : ''}</span><button type="button" class="pbp-link" data-logout>Log out</button></div>`;
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
  function openPay(plan) {
    if (!cfg || !cfg.upiId) return toast('Payments are not set up yet.', true);
    const amount = plan === 'yearly' ? cfg.yearly : cfg.monthly;
    const link = upiLink(plan, amount);
    let qr = '';
    try {
      qr = window.pbQR ? window.pbQR(link, 6, 2) : '';
    } catch {}
    const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    showDialog((box) => {
      box.innerHTML = `<button type="button" class="pbp-x" aria-label="Close">×</button>
        <div class="pbp-badge">PRO</div>
        <h2 id="pbp-title">Pay ${rupees(amount)}</h2>
        <p class="pbp-why">PakkaBill Pro for ${plan === 'yearly' ? '1 year' : '1 month'}.</p>
        <ol class="pbp-steps">
          <li><b>Scan and pay exactly ${rupees(amount)}</b> with any UPI app.
            ${qr ? `<img class="pbp-qr" src="${qr}" alt="UPI QR code to pay ${esc(rupees(amount))} to ${esc(cfg.upiId)}">` : ''}
            <span class="pbp-upi">To <b>${esc(cfg.payeeName || cfg.upiId)}</b> · <code>${esc(cfg.upiId)}</code> <button type="button" class="pbp-link" data-copy>Copy UPI ID</button></span>
            ${mobile ? `<a class="pbp-btn pbp-open" href="${esc(link)}">Open UPI app</a>` : ''}
          </li>
          <li><b>Enter the 12-digit transaction number</b> from the payment receipt. PhonePe calls it <i>UTR</i>, Google Pay <i>UPI transaction ID</i>, Paytm <i>UPI Ref No</i>.
            <form class="pbp-auth pbp-utr"><input name="utr" inputmode="numeric" autocomplete="off" maxlength="14" placeholder="12-digit number" aria-label="UPI transaction number" required>
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
      const form = box.querySelector('.pbp-utr');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const err = form.querySelector('.pbp-err');
        const btn = form.querySelector('.pbp-btn');
        const utr = form.utr.value.replace(/\s/g, '');
        err.textContent = '';
        if (!/^\d{12}$/.test(utr)) return (err.textContent = 'The transaction number has exactly 12 digits.');
        btn.disabled = true;
        try {
          await api('pay', { body: { plan, utr } });
          myOrders = null;
          box.innerHTML = `<button type="button" class="pbp-x" aria-label="Close">×</button><div class="pbp-badge">PRO</div>
            <h2 id="pbp-title">Payment submitted</h2>
            <p class="pbp-why">Thank you. We will match transaction <b>${esc(utr)}</b> with our account and turn on Pro, usually within a few hours. You can keep using PakkaBill meanwhile.</p>
            <button type="button" class="pbp-btn" data-done>OK</button>`;
          box.querySelector('.pbp-x').addEventListener('click', closeUpgrade);
          box.querySelector('[data-done]').addEventListener('click', closeUpgrade);
          rerender();
        } catch (e) {
          err.textContent = e.message;
          btn.disabled = false;
        }
      });
      form.utr.focus();
    });
  }

  let myOrders = null;
  async function loadOrders() {
    if (!acct || !acct.token || !cfg || !cfg.enabled) return;
    try {
      myOrders = (await api('pay')).orders;
      plans.forEach((el) => el.isConnected && drawPlan(el));
    } catch {}
  }
  function ordersHtml() {
    if (!myOrders || !myOrders.length) return '';
    const label = { PENDING: 'Waiting for confirmation', COMPLETED: 'Confirmed', REJECTED: 'Not found in our account' };
    return `<ul class="pbp-orders">${myOrders
      .map((o) => `<li class="is-${o.state.toLowerCase()}"><span>${rupees(o.amount / 100)} · ${o.plan === 'yearly' ? 'Yearly' : 'Monthly'} · UTR ${esc(o.utr)}</span><b>${label[o.state] || esc(o.state)}</b></li>`)
      .join('')}</ul>${myOrders.some((o) => o.state === 'REJECTED') ? '<p class="pbp-fine">If a payment was not found, check the transaction number and submit it again.</p>' : ''}`;
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
    let mode = 'signup';
    const draw = (m) => {
      if (m) mode = m;
      box.innerHTML = `<button type="button" class="pbp-x" aria-label="Close">×</button>
        <div class="pbp-badge">PRO</div>
        <h2 id="pbp-title">Upgrade to PakkaBill Pro</h2>
        <p class="pbp-why">${esc((WHY[feature] || WHY.pdf)(arg))}</p>
        <ul class="pbp-perks">${PERKS.map((p) => `<li>${p}</li>`).join('')}</ul>
        ${acct && acct.token ? accountHtml() + plansHtml() + '<p class="pbp-fine">Pay by UPI from any app: PhonePe, Google Pay, Paytm or your bank.</p>' : authHtml(mode)}`;
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
  }
  function drawPlan(el, mode = el._pbMode || 'signup') {
    el._pbMode = mode;
    let status;
    if (!cfg || !cfg.enabled) status = '<div class="pbp-status is-free"><b>Everything is free right now.</b><span>Paid plans are not switched on yet.</span></div>';
    else if (isPro()) status = `<div class="pbp-status is-pro"><b>PakkaBill Pro is active</b><span>Till ${dateStr(acct.user.paidUntil)}. Paying again adds time on top.</span></div>`;
    else if (acct && acct.user && acct.user.paidUntil) status = `<div class="pbp-status is-free"><b>Your Pro plan ended on ${dateStr(acct.user.paidUntil)}</b><span>You are on the free plan: ${cfg.freeBills} bills a month.</span></div>`;
    else status = `<div class="pbp-status is-free"><b>You are on the free plan</b><span>${cfg.freeBills} bills a month, Carbon, Ledger and Plain designs, printing.</span></div>`;
    el.innerHTML = `<div class="page-head"><div><h1 class="page-title">Plan</h1><p class="page-sub">Your PakkaBill account and Pro plan.</p></div></div>
      <div class="pbp-page">
        <section class="paper pbp-card">${status}${ordersHtml()}${accountHtml()}</section>
        ${cfg && cfg.enabled ? `<section class="paper pbp-card"><h2 class="form-sec__title">PakkaBill Pro</h2>
          <ul class="pbp-perks">${PERKS.map((p) => `<li>${p}</li>`).join('')}</ul>
          ${acct && acct.token ? plansHtml() + '<p class="pbp-fine">Pay by UPI from any app: PhonePe, Google Pay, Paytm or your bank.</p>' : authHtml(mode)}</section>` : ''}
      </div>`;
    wire(el, (m) => drawPlan(el, m));
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
.pbp-auth input{font:inherit;font-size:16px;padding:10px 12px;border-radius:var(--r-ctl,9px);border:1.5px solid var(--rule,#ddd);background:var(--paper,#fff);color:var(--ink,#222)}
.pbp-auth input:focus{outline:2px solid var(--focus,#ff7a59);outline-offset:1px}
.pbp-tabs{display:flex;gap:4px;padding:4px;background:var(--carbon-tint,#f6f2ff);border-radius:999px}
.pbp-tabs button{flex:1;border:0;background:none;font:inherit;font-weight:600;padding:7px;border-radius:999px;color:var(--ink-2,#555);cursor:pointer}
.pbp-tabs button.is-on{background:var(--paper,#fff);color:var(--carbon,#5b3fe6);box-shadow:0 2px 6px -2px #0003}
.pbp-btn{font:inherit;font-weight:700;font-size:15.5px;border:0;border-radius:10px;padding:12px 18px;cursor:pointer;color:var(--btn-fg,#fff);background:var(--btn-bg,#6c4dff);background-image:var(--btn-grad,none)}
.pbp-btn:disabled{opacity:.6;cursor:wait}
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
.pbp-orders .is-rejected b{color:var(--red,#c8202a)}`;

  function init() {
    const st = document.createElement('style');
    st.id = 'pbp-css';
    st.textContent = css;
    document.head.appendChild(st);
    refresh();
    window.addEventListener('online', refresh);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  Object.assign(window, { pbPro, pbGate, pbCanAddBill, pbPlanMount, pbLocked, pbUpgrade: openUpgrade });
})();
