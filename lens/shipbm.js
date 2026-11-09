// PakkaBill shipping bookmark: the shipping check without any extension (phone Chrome too).
// The bookmark carries shipcore.js, shiphook.js and this file (built by lens/build.py into shipmark.js).
// Tapped on supplier.meesho.com it starts watching the page's own requests (shiphook.js); the seller
// uploads their own photo once, PakkaBill learns which of Meesho's requests gave the shipping, checks
// that it gets back the same number, then prices every version from PakkaBill the same way, in this tab,
// with the seller's own login. Versions come from PakkaBill's Image tab (the tab that opened Meesho, or
// the one opened from here) by window messages, and every price goes straight back to show under its
// image. Nothing is saved or sent anywhere but Meesho, from this tab. It never submits a catalogue.
(() => {
  if (window.__pbShipBm) { window.__pbShipBm(); return; }
  if (!/(^|\.)supplier\.meesho\.com$/.test(location.hostname)) { alert('Open supplier.meesho.com, then Catalog Upload → Add Single Catalog, and tap the PakkaBill shipping bookmark there.'); return; }
  if (document.getElementById('pakkabill-ship')) { alert('PakkaBill Lens is installed in this browser: use its panel at the bottom left.'); return; }
  const SC = window.PBShipSync;
  // PakkaBill's addresses; __PB_ORIGIN__ is the address the bookmark was made on
  const HOME = '__PB_ORIGIN__';
  const ORIGINS = [...new Set([HOME, 'https://pakkabill1.vercel.app', 'https://pakkabill-one.vercel.app'].filter((o) => /^https:\/\//.test(o)))];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rs = (v) => (v == null ? '' : '₹' + Math.round(v * 100) / 100);
  const PICKED = 'picked';

  function rupeesIn(text) {
    const t = String(text || '').replace(/ /g, ' ');
    const m = t.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/i) || t.match(/^\s*([\d,]+(?:\.\d+)?)\s*$/);
    if (!m) return null;
    const n = Number(m[1].replace(/,/g, ''));
    return n >= 0 && n < 100000 ? n : null;
  }

  let Q = null; // { cats: [{ name, id }], items: [{ id, label, name, data }] }
  let R = {}; // item id -> { category key -> rupees }
  let names = {}, mcats = [], hook = { learned: false }, verified = null;
  let mode = 'idle', current = -1, note = '', stop = false, open = true, autoDone = false;
  const missed = new Set();
  let peer = window.opener && !window.opener.closed ? window.opener : null, peerOrigin = null;

  /* ---------- PakkaBill's tab ---------- */
  const tell = (m) => { if (peer && peerOrigin && !peer.closed) try { peer.postMessage({ pbsb: 1, ...m }, peerOrigin); } catch (e) { /* tab closed */ } };
  const lensState = () => ({ learned: !!hook.learned, confirmed: !!hook.confirmed, ship: hook.ship ?? null, verified });
  const sendResults = () => tell({ type: 'results', results: R, cats: names, current: mode === 'running' && Q && Q.items[current] ? Q.items[current].id : null, lens: lensState() });
  // "hello" says nothing but that this tab is here; PakkaBill answers with the versions, to this address only
  let helloN = 0, helloT = 0;
  function hello() {
    clearInterval(helloT);
    helloN = 0;
    const one = () => { if (peerOrigin || ++helloN > 60) return clearInterval(helloT); if (peer && !peer.closed) try { peer.postMessage({ pbsb: 1, type: 'hello' }, '*'); } catch (e) { /* closed */ } };
    one();
    helloT = setInterval(one, 1500);
  }
  window.addEventListener('message', (e) => {
    const m = e.data;
    if (!m || typeof m !== 'object' || m.pbsb !== 1 || !ORIGINS.includes(e.origin)) return;
    peer = e.source; peerOrigin = e.origin;
    if (m.type === 'queue' && Array.isArray(m.items)) {
      const items = m.items.filter((it) => it && typeof it.id === 'string' && it.id.length <= 80 && typeof it.data === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(it.data) && it.data.length < 4e6)
        .slice(0, 200).map((it) => ({ id: it.id, label: String(it.label || '').slice(0, 80), name: String(it.name || 'photo.jpg').slice(0, 80), data: it.data }));
      const cats = (Array.isArray(m.cats) ? m.cats : []).filter((c) => c && typeof c.name === 'string' && c.name.trim()).slice(0, 5)
        .map((c) => ({ name: c.name.trim().slice(0, 80), id: /^\d{1,12}$/.test(String(c.id || '')) ? String(c.id) : null }));
      if (mode === 'running') stop = true;
      Q = items.length ? { cats, items } : null;
      R = {}; names = {}; missed.clear(); verified = null; autoDone = false; note = ''; open = true;
      tell({ type: 'state', lens: lensState() });
      if (mcats.length) tell({ type: 'cats', cats: mcats });
      draw();
      autoStart();
    } else if (m.type === 'ping') tell({ type: 'state', lens: lensState() });
  });

  /* ---------- the hook in this page (shiphook.js) ---------- */
  const toHook = (m) => window.postMessage({ pbsh: 1, to: 'hook', ...m }, location.origin);
  const waiting = new Map();
  let reqN = 0;
  function ask(m, ms) {
    const req = 'b' + (++reqN);
    return new Promise((resolve) => {
      const t = setTimeout(() => { waiting.delete(req); resolve({ values: {}, errors: { all: 'timeout' } }); }, ms || 90000);
      waiting.set(req, (x) => { clearTimeout(t); resolve(x); });
      toHook({ ...m, req });
    });
  }
  window.addEventListener('message', (e) => {
    const m = e.data;
    if (e.source !== window || !m || m.pbsh !== 1 || m.to !== 'panel') return;
    if (m.type === 'status') {
      const was = hook.learned && hook.ship;
      hook = { learned: !!m.learned, confirmed: !!m.confirmed, ship: m.ship, cat: m.cat || null, why: m.why || '' };
      if (hook.learned && was !== hook.ship) { verified = null; autoDone = false; }
      tell({ type: 'state', lens: lensState() });
      draw();
      autoStart();
    } else if (m.type === 'cats' && Array.isArray(m.list)) {
      const by = new Map(mcats.map((c) => [c.id, c]));
      m.list.forEach((c) => { if (c && /^\d{1,12}$/.test(String(c.id)) && c.name) by.set(String(c.id), { id: String(c.id), name: String(c.name).slice(0, 80), path: String(c.path || c.name).slice(0, 200), leaf: c.leaf !== false }); });
      mcats = [...by.values()].slice(0, 5000);
      tell({ type: 'cats', cats: mcats });
    } else if (m.type === 'done' && waiting.has(m.req)) { const f = waiting.get(m.req); waiting.delete(m.req); f(m); }
  });

  /* ---------- Meesho's page: the photo box and the shipping shown ---------- */
  const findInput = () => [...document.querySelectorAll('input[type=file]')].find((i) => !i.disabled && (!i.accept || /image|jpe?g|png|\*/i.test(i.accept))) || null;
  function shownShip() {
    let best = null, len = 1e9;
    for (const e of document.body.querySelectorAll('div,span,p,label,td,th,li,strong,b,small,h4,h5,h6')) {
      if (host && host.contains(e)) continue;
      const text = e.textContent;
      if (!text || text.length > 160 || !/shipping|delivery\s*charge/i.test(text)) continue;
      let c = rupeesIn(text) != null ? e : null;
      if (!c) { const n = e.nextElementSibling; if (n && n.textContent.length < 40 && rupeesIn(n.textContent) != null) c = n; }
      if (c && c.textContent.length < len) { best = c; len = c.textContent.length; }
    }
    return best ? rupeesIn(best.textContent.replace(/\s+/g, ' ').replace(/^.*?(₹|rs\.?|inr)/i, '$1')) : null;
  }
  async function putImage(item) {
    const input = findInput();
    if (!input) return false;
    const blob = await (await fetch(item.data)).blob();
    const dt = new DataTransfer();
    dt.items.add(new File([blob], item.name || 'photo.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  /* ---------- categories and checking (as in the extension's ship.js) ---------- */
  function catPlan() {
    const t = hook.cat;
    const pickedName = (t && (t.name || (mcats.find((c) => c.id === String(t.id)) || {}).name)) || 'Category picked in Meesho';
    const chosen = ((Q && Q.cats) || []).map((c) => {
      const m = c.id ? (mcats.find((x) => x.id === c.id) || { id: c.id, name: c.name }) : SC ? SC.matchCategory(c.name, mcats) : null;
      return { name: c.name, id: m ? String(m.id) : null, mname: m ? m.name : null };
    });
    const list = [];
    if (hook.learned && t) {
      chosen.filter((c) => c.id).forEach((c) => { if (!list.some((x) => x.id === c.id)) list.push({ key: c.id, id: c.id, name: c.mname || c.name }); });
      if (!list.length) list.push({ key: String(t.id), id: String(t.id), name: pickedName });
    } else list.push({ key: t ? String(t.id) : PICKED, id: null, name: pickedName });
    return { list, chosen };
  }
  const AUTH = /:(401|403)$/;
  async function pass(items, cp) {
    for (let i = 0; i < items.length && !stop; i++) {
      const it = items[i], have = R[it.id] || {}, todo = cp.list.filter((c) => have[c.key] == null);
      if (!todo.length) continue;
      current = Q.items.indexOf(it); draw(); sendResults();
      const r = await ask({ type: 'run', data: it.data, cats: todo.map((c) => ({ key: c.key, id: c.id })) });
      R[it.id] = { ...have, ...(r.values || {}) };
      if (Object.keys(r.values || {}).length) missed.delete(it.id); else missed.add(it.id);
      const err = Object.values(r.errors || {}).join(' ');
      if (AUTH.test(err) || /(upload|step):(401|403)/.test(err)) { note = 'Meesho says you are logged out. Log in again, upload your photo once more, then tap Check all.'; return false; }
      sendResults(); draw();
    }
    return true;
  }
  async function check(again) {
    if (!Q || !Q.items.length || mode === 'running') return;
    const cp = catPlan();
    mode = 'running'; stop = false; note = '';
    if (again) { R = {}; missed.clear(); }
    cp.list.forEach((c) => { names[c.key] = c.name; });
    draw();
    if (verified !== true) {
      note = 'Checking that PakkaBill gets the same shipping Meesho showed…'; draw();
      const v = await ask({ type: 'run', data: null, cats: [{ key: 'v', id: null }] });
      const got = v.values && v.values.v;
      if (got == null || (hook.ship != null && Math.abs(got - hook.ship) > 0.5)) {
        verified = false; mode = 'idle';
        note = got == null ? 'Meesho did not answer PakkaBill. Upload your photo in Meesho again, then tap Check all.' : `Meesho gave ₹${got} instead of ₹${hook.ship}, so PakkaBill will not trust it. Upload your photo again.`;
        sendResults(); return draw();
      }
      verified = true; note = '';
    }
    let ok = await pass(Q.items, cp);
    // versions with no answer get one more try, after a short wait
    if (ok && !stop && missed.size) { note = `Trying ${missed.size} again…`; draw(); await new Promise((r) => setTimeout(r, 3000)); note = ''; ok = await pass(Q.items.filter((it) => missed.has(it.id)), cp); }
    mode = 'idle'; current = -1;
    if (!note) note = stop ? 'Stopped.' : missed.size ? `${missed.size} got no answer from Meesho. Tap Check all to try them again.` : 'All checked. The shipping shows under each image in PakkaBill.';
    sendResults(); draw();
  }
  function autoStart() {
    if (Q && hook.learned && hook.confirmed && !autoDone && mode === 'idle' && verified !== false) { autoDone = true; check(false); }
  }
  function ranked() {
    if (!Q) return [];
    const cp = catPlan(), low = (it) => { const v = cp.list.map((c) => (R[it.id] || {})[c.key]).filter((x) => x != null); return v.length ? Math.min(...v) : Infinity; };
    return [...Q.items].sort((a, b) => low(a) - low(b));
  }

  /* ---------- the panel ---------- */
  let host, root;
  const STYLE = `:host{all:initial}*{box-sizing:border-box}
  .card{width:min(360px,calc(100vw - 24px));max-height:70vh;overflow:auto;background:#fff;color:#1C2340;font:13.5px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;border:1px solid #DCD6F5;border-radius:12px;box-shadow:0 10px 30px rgba(40,24,90,.25)}
  .hd{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(120deg,#6d4aff,#c04fd0 60%,#ff7a59);color:#fff;padding:9px 12px}
  .hd button{background:none;border:0;color:#fff;font:inherit;font-weight:700;cursor:pointer;padding:2px 8px;font-size:18px}
  .mini{background:linear-gradient(120deg,#6d4aff,#c04fd0);color:#fff;border:0;border-radius:999px;padding:10px 16px;font:700 14px system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(40,24,90,.3)}
  .sec{padding:10px 12px;border-top:1px solid #F0EDF8}.sec:first-of-type{border-top:0}
  .muted{color:#6b6880;font-size:12.5px}.ok{color:#1f7a4d;font-weight:700}.no{color:#B42318;font-weight:700}.wait{color:#8a5a00;font-weight:700}
  .btn{font:inherit;font-weight:700;border:1.5px solid #6d4aff;background:#fff;color:#4b35c9;border-radius:8px;padding:7px 11px;cursor:pointer}
  .btn.pri{background:#6d4aff;color:#fff}.btn.sm{padding:3px 8px;font-size:12px}.btn:disabled{opacity:.55;cursor:default}
  .acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center}
  .step{display:flex;gap:9px;align-items:flex-start;margin:6px 0}
  .step i{flex:none;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-size:11.5px;font-weight:700;background:#ece6ff;color:#4b35c9}
  .step.done i{background:#1f7a4d;color:#fff}
  ul{list-style:none;margin:0;padding:0}li{display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid #F5F2FB}li:first-child{border-top:0}
  li img{width:34px;height:34px;object-fit:contain;border:1px solid #eee;border-radius:6px;background:#fff;flex:none}
  li span{flex:1;min-width:0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  li b{font-variant-numeric:tabular-nums;font-size:12.5px}li.best{background:#e9f7ef;border-radius:8px;padding-left:4px}li.now b{color:#8a5a00}
  .note{background:#fff7e0;border-radius:8px;padding:7px 9px;margin-top:8px;font-size:12.5px}
  .win{background:#e9f7ef;border-radius:10px;padding:8px 10px;margin-top:8px}`;
  function draw() {
    if (!host || !document.body.contains(host)) {
      host = document.createElement('div'); host.id = 'pakkabill-shipbm';
      root = host.attachShadow({ mode: 'open' });
      document.body.appendChild(host);
    }
    host.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483647';
    if (!open) {
      const done = Q ? Q.items.filter((it) => Object.keys(R[it.id] || {}).length).length : 0;
      root.innerHTML = `<style>${STYLE}</style><button class="mini">PakkaBill shipping${Q ? ` · ${done}/${Q.items.length}` : ''}</button>`;
      root.querySelector('.mini').onclick = () => { open = true; draw(); };
      return;
    }
    const running = mode === 'running', cp = catPlan(), list = running ? (Q ? Q.items : []) : ranked();
    const done = Q ? Q.items.filter((it) => cp.list.every((c) => (R[it.id] || {})[c.key] != null)).length : 0;
    const own = Q && Q.items.find((it) => /\|orig$/.test(it.id)), ownV = own && Object.values(R[own.id] || {})[0];
    const best = list.find((it) => Object.keys(R[it.id] || {}).length), bestV = best && Math.min(...Object.values(R[best.id]));
    const onScreen = shownShip();
    const status = hook.learned ? `<span class="ok">✓ Learned: Meesho priced your photo at ₹${esc(hook.ship)}</span>`
      : hook.why === 'danger' || hook.why === 'long' ? '<span class="no">Meesho\'s requests here can\'t be repeated safely, sorry.</span>'
      : onScreen != null ? `<span class="wait">Meesho shows ₹${esc(onScreen)}. Upload your photo once more so PakkaBill can learn how Meesho works it out.</span>`
      : '<span class="wait">Waiting for you to upload your photo and for Meesho to show the shipping.</span>';
    root.innerHTML = `<style>${STYLE}</style><div class="card">
      <div class="hd"><b>PakkaBill · Shipping (no extension)</b><button title="Hide" data-min>–</button></div>
      <div class="sec">
        <div class="step${peerOrigin && Q ? ' done' : ''}"><i>${peerOrigin && Q ? '✓' : '1'}</i><div>${peerOrigin && Q ? `${Q.items.length} versions from PakkaBill` : peerOrigin ? 'PakkaBill is connected. Make the versions there.' : 'Connect PakkaBill (the tab that opened this page, or open it here).'}
          ${peerOrigin ? '' : `<div class="acts"><button class="btn sm" data-open>Open PakkaBill</button></div>`}</div></div>
        <div class="step${hook.learned ? ' done' : ''}"><i>${hook.learned ? '✓' : '2'}</i><div>In <b>Add Single Catalog</b>, pick a category and upload <b>your own photo</b> until Meesho shows the shipping charge.<div style="margin-top:3px">${status}</div></div></div>
        <div class="step${Q && done === Q.items.length ? ' done' : ''}"><i>${Q && done === Q.items.length ? '✓' : '3'}</i><div>PakkaBill prices every version in ${cp.list.map((c) => `<b>${esc(c.name)}</b>`).join(', ')}. It starts by itself.${cp.chosen.some((c) => !c.id) ? `<div class="muted" style="margin-top:4px">Not found yet: ${cp.chosen.filter((c) => !c.id).map((c) => esc(c.name)).join(', ')}. Open Meesho's category picker and search it once, then tap Check all.</div>` : ''}</div></div>
        <div class="acts">${running ? `<button class="btn" data-stop>Stop</button><span class="muted">${current + 1} of ${Q.items.length} · asking Meesho…</span>`
          : `<button class="btn pri" data-check${hook.learned && Q ? '' : ' disabled'}>${done && Q && done < Q.items.length ? `Check the other ${Q.items.length - done}` : done ? 'Check all again' : 'Check all'}</button>`}</div>
        ${note ? `<div class="note">${esc(note)}</div>` : ''}
        ${best && !running ? `<div class="win">Cheapest: <b>${rs(bestV)}</b> · ${esc(best.label)}${ownV != null && ownV > bestV ? ` <span class="ok">· saves ${rs(ownV - bestV)} on every order</span>` : ''}<div class="acts"><button class="btn pri sm" data-use>Put it in Meesho's photo box</button></div></div>` : ''}
      </div>
      ${Q ? `<div class="sec"><ul>${list.map((it) => { const r = R[it.id] || {}, vals = cp.list.map((c) => r[c.key]); return `<li class="${best && it === best ? 'best' : ''}${running && Q.items[current] === it ? ' now' : ''}"><img src="${it.data}" alt=""><span title="${esc(it.label)}">${esc(it.label)}</span><b>${vals.some((v) => v != null) ? vals.map((v) => (v == null ? '–' : rs(v))).join(' · ') : running && Q.items[current] === it ? '…' : missed.has(it.id) ? '✗' : ''}</b></li>`; }).join('')}</ul></div>` : ''}
      <div class="sec muted">Works only in this tab, with your own Meesho login. Nothing is saved or sent anywhere but Meesho. It never submits a catalogue. <button class="btn sm" data-close>Close</button></div>
    </div>`;
    const on = (s, fn) => { const b = root.querySelector(s); if (b) b.onclick = fn; };
    on('[data-min]', () => { open = false; draw(); });
    on('[data-open]', () => { peer = window.open(HOME + '/#/lowship', 'pakkabill'); hello(); });
    on('[data-check]', () => check(Q && done === Q.items.length));
    on('[data-stop]', () => { stop = true; });
    on('[data-use]', async () => { note = (await putImage(best)) ? 'The cheapest version is in Meesho\'s photo box. Carry on with your catalogue.' : 'Open Meesho\'s catalogue form first.'; draw(); });
    on('[data-close]', () => { stop = true; clearInterval(tick); host.remove(); window.__pbShipBm = () => { tick = setInterval(watch, 1000); draw(); }; });
  }

  // the number on Meesho's screen: when it changes after an upload, the hook learns from it
  let lastShown = null;
  const watch = () => {
    if (document.visibilityState !== 'visible' || mode === 'running') return;
    const v = shownShip();
    if (v != null && v !== lastShown) { lastShown = v; toHook({ type: 'learn', displayed: v }); draw(); }
  };
  let tick = setInterval(watch, 1000);
  window.__pbShipBm = () => { open = true; draw(); };
  toHook({ type: 'hello' });
  if (peer) hello();
  draw();
})();
