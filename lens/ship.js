// PakkaBill shipping check, on Meesho's supplier panel (supplier.meesho.com).
// PakkaBill's Low shipping image page sends versions of a product photo here, with up to 5 categories.
// Exact way (Lens 3): when the seller uploads one photo in Catalog Upload and Meesho shows its shipping,
// the hook in the page (shiphook.js) learns which of Meesho's own requests gave that number. Then each
// version is uploaded and priced with those same requests, for every chosen category, from the seller's
// own tab: the shipping is Meesho's answer, read from Meesho's reply. Before checking, the seller's own
// photo is sent again and must give back the same number Meesho showed, or nothing is trusted.
// Backup way: each version goes into Meesho's photo box and the number on the screen is read.
// It never submits a catalogue. Nothing goes to any server but Meesho's, from this tab.
(() => {
  if (window.top !== window) return;
  const SC = window.PBShipSync;
  const get = k => new Promise(r => chrome.storage.local.get(k, r));
  const set = o => new Promise(r => chrome.storage.local.set(o, r));
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PB = 'https://pakkabill1.vercel.app/#/lowship';
  const PICKED = 'picked';

  // "Shipping Charges ₹ 1,234" -> 1234; a cell holding just "72" -> 72; null when there is no amount.
  function rupeesIn(text) {
    const t = String(text || '').replace(/ /g, ' ');
    const m = t.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/i) || t.match(/^\s*([\d,]+(?:\.\d+)?)\s*$/);
    if (!m) return null;
    const n = Number(m[1].replace(/,/g, ''));
    return n >= 0 && n < 100000 ? n : null;
  }

  let Q = null; // { at, gen, cats: [{ name, id }], items: [{ id, label, name, data }] }
  let R = {}; // item id -> { category key -> rupees }
  let names = {}; // category key -> name
  let mcats = []; // Meesho's categories seen in this account: [{ id, name, path, leaf }]
  let hook = { learned: false }; // what the page hook learned
  let picks = {}; // { input, ship }: where the photo box and the shipping amount are, if pointed to
  let mode = 'idle'; // idle | pick-input | pick-ship | running
  let current = -1, note = '', stop = false, open = true, shown = false, verified = null;
  const missed = new Set();

  /* ---------- talking to the hook in the page ---------- */

  const toHook = m => window.postMessage({ pbsh: 1, to: 'hook', ...m }, location.origin);
  const waiting = new Map();
  let reqN = 0;
  function ask(m, ms) {
    const req = 'r' + (++reqN);
    return new Promise(resolve => {
      const t = setTimeout(() => { waiting.delete(req); resolve({ values: {}, errors: { all: 'timeout' } }); }, ms || 90000);
      waiting.set(req, x => { clearTimeout(t); resolve(x); });
      toHook({ ...m, req });
    });
  }
  window.addEventListener('message', e => {
    const m = e.data;
    if (e.source !== window || !m || m.pbsh !== 1 || m.to !== 'panel') return;
    if (m.type === 'status') {
      const was = hook.learned && hook.ship;
      hook = { learned: !!m.learned, confirmed: !!m.confirmed, ship: m.ship, key: m.key, steps: m.steps, cat: m.cat || null, why: m.why || '', report: m.report || null };
      if (hook.learned && was !== hook.ship) verified = null;
      saveState();
      draw();
    } else if (m.type === 'cats' && Array.isArray(m.list)) {
      const by = new Map(mcats.map(c => [c.id, c]));
      m.list.forEach(c => { if (c && /^\d{1,12}$/.test(String(c.id)) && c.name) by.set(String(c.id), { id: String(c.id), name: String(c.name).slice(0, 80), path: String(c.path || c.name).slice(0, 200), leaf: c.leaf !== false }); });
      mcats = [...by.values()].slice(0, 5000);
      set({ mcats });
      draw();
    } else if ((m.type === 'done' || m.type === 'report') && waiting.has(m.req)) { const f = waiting.get(m.req); waiting.delete(m.req); f(m); }
  });

  /* ---------- finding things on Meesho's page (backup way, and the number to learn from) ---------- */

  function pathOf(el) {
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && e !== document.body; e = e.parentElement) {
      if (e.id && /^[A-Za-z][\w-]{2,40}$/.test(e.id) && !/\d{3,}/.test(e.id)) { parts.unshift('#' + CSS.escape(e.id)); return parts.join(' > '); }
      let s = e.tagName.toLowerCase();
      const same = e.parentElement ? [...e.parentElement.children].filter(c => c.tagName === e.tagName) : [];
      if (same.length > 1) s += `:nth-of-type(${same.indexOf(e) + 1})`;
      parts.unshift(s);
    }
    return 'body > ' + parts.join(' > ');
  }
  const byPath = p => { try { return p ? document.querySelector(p) : null; } catch { return null; } };
  function findInput() {
    const t = byPath(picks.input);
    if (t && t.matches('input[type=file]')) return t;
    return [...document.querySelectorAll('input[type=file]')].find(i => !i.disabled && (!i.accept || /image|jpe?g|png|\*/i.test(i.accept))) || null;
  }
  function nearestFileInput(el) {
    for (let e = el, n = 0; e && n < 8; e = e.parentElement, n++) {
      if (e.matches && e.matches('input[type=file]')) return e;
      const lab = e.closest && e.closest('label');
      if (lab && lab.control && lab.control.type === 'file') return lab.control;
      const inside = e.querySelector && e.querySelector('input[type=file]');
      if (inside) return inside;
    }
    return null;
  }
  const LABEL = /shipping|delivery\s*charge/i;
  function findShip() {
    const t = byPath(picks.ship);
    if (t && rupeesIn(t.textContent) != null) return t;
    let best = null, len = 1e9;
    for (const e of document.body.querySelectorAll('div,span,p,label,td,th,li,strong,b,small,h4,h5,h6')) {
      if (host && host.contains(e)) continue;
      const text = e.textContent;
      if (!text || text.length > 160 || !LABEL.test(text)) continue;
      let c = rupeesIn(text) != null ? e : null;
      if (!c) { const n = e.nextElementSibling; if (n && n.textContent.length < 40 && rupeesIn(n.textContent) != null) c = n; }
      if (c && c.textContent.length < len) { best = c; len = c.textContent.length; }
    }
    return best;
  }
  const shipText = () => { const e = findShip(); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; };
  const shownShip = () => { const t = shipText(); return t ? rupeesIn(t.replace(/^.*?(₹|rs\.?|inr)/i, '$1')) : null; };

  /* ---------- the categories to check ---------- */

  // PakkaBill's chosen categories with Meesho's ids, plus the one picked in Meesho's form.
  function catPlan() {
    const tplCat = hook.cat; // { id, name } in Meesho's shipping request, or null
    const pickedName = (tplCat && (tplCat.name || (mcats.find(c => c.id === String(tplCat.id)) || {}).name)) || 'Category picked in Meesho';
    const chosen = ((Q && Q.cats) || []).slice(0, 5).map(c => {
      const id = c.id && /^\d{1,12}$/.test(String(c.id)) ? String(c.id) : null;
      const m = id ? (mcats.find(x => x.id === id) || { id, name: c.name }) : SC ? SC.matchCategory(c.name, mcats) : null;
      return { name: c.name, id: m ? String(m.id) : null, mname: m ? m.name : null };
    });
    const list = [];
    if (hook.learned && tplCat) {
      chosen.filter(c => c.id).forEach(c => { if (!list.some(x => x.id === c.id)) list.push({ key: c.id, id: c.id, name: c.mname || c.name }); });
      if (!list.length) list.push({ key: String(tplCat.id), id: String(tplCat.id), name: pickedName });
    } else list.push({ key: tplCat ? String(tplCat.id) : PICKED, id: null, name: pickedName });
    return { list, chosen, tplCat, pickedName, perCategory: !!(hook.learned && tplCat) };
  }

  /* ---------- checking ---------- */

  async function saveState(extra) {
    await set({ shipres: { at: Date.now(), results: R, cats: names, current: null, lens: { learned: !!hook.learned, confirmed: !!hook.confirmed, ship: hook.ship ?? null, verified }, ...(extra || {}) } });
  }
  async function putImage(input, item) {
    const blob = await (await fetch(item.data)).blob();
    const dt = new DataTransfer();
    dt.items.add(new File([blob], item.name || 'photo.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // The exact way: Meesho's own requests, for every version and category.
  async function checkExact(again) {
    if (!Q || !Q.items.length) return;
    const cp = catPlan();
    mode = 'running'; stop = false; note = '';
    if (again) { R = {}; missed.clear(); }
    cp.list.forEach(c => { names[c.key] = c.name; });
    draw();
    // first: the seller's own photo again must give back the number Meesho showed
    if (verified !== true) {
      note = 'Checking that PakkaBill gets the same shipping Meesho showed…'; draw();
      const v = await ask({ type: 'run', data: null, cats: [{ key: 'v', id: null }] });
      const got = v.values && v.values.v;
      if (got == null || (hook.ship != null && Math.abs(got - hook.ship) > 0.5)) {
        verified = false; mode = 'idle';
        note = got == null ? `Meesho did not answer PakkaBill's request (${esc(Object.values(v.errors || {})[0] || 'no answer')}). Upload your photo in Meesho again and tap Check all, or use "Read from Meesho's screen".`
          : `Meesho gave ₹${got} instead of ₹${hook.ship}, so PakkaBill will not trust this way. Use "Read from Meesho's screen".`;
        await saveState(); return draw();
      }
      verified = true;
    }
    note = '';
    for (let i = 0; i < Q.items.length && !stop; i++) {
      const it = Q.items[i];
      const have = R[it.id] || {};
      const todo = cp.list.filter(c => have[c.key] == null);
      if (!todo.length) continue;
      current = i; draw();
      await saveState({ current: it.id });
      const r = await ask({ type: 'run', data: it.data, cats: todo.map(c => ({ key: c.key, id: c.id })) });
      R[it.id] = { ...have, ...(r.values || {}) };
      if (!Object.keys(r.values || {}).length) missed.add(it.id); else missed.delete(it.id);
      if (r.errors && r.errors.all && /upload:(4\d\d|0)/.test(r.errors.all) && !Object.keys(R).some(k => Object.keys(R[k]).length)) { note = 'Meesho refused the upload. Upload your photo in Meesho again (the session may have ended), then tap Check all.'; break; }
      await saveState();
      draw();
    }
    mode = 'idle'; current = -1;
    await saveState();
    if (!note) note = stop ? 'Stopped.' : missed.size ? `${missed.size} version${missed.size > 1 ? 's' : ''} got no answer from Meesho. Tap Check all to try them again.` : 'All checked. The shipping is in PakkaBill too.';
    draw();
  }

  // The backup way: each version in Meesho's photo box, the number on the screen read.
  function waitShip(before) {
    return new Promise(resolve => {
      const t0 = Date.now();
      let last = null, since = Date.now(), changed = false;
      const tick = () => {
        if (stop) return resolve({ value: null });
        const text = shipText(), now = Date.now();
        if (text !== last) { last = text; since = now; if (text !== before) changed = true; }
        const v = rupeesIn(text.replace(/^.*?(₹|rs\.?|inr)/i, '$1'));
        if (changed && v != null && now - since >= 1500) return resolve({ value: v });
        if (!changed && v != null && now - t0 >= 12000) return resolve({ value: v, same: true });
        if (now - t0 >= 40000) return resolve({ value: v });
        setTimeout(tick, 300);
      };
      tick();
    });
  }
  async function checkScreen(again) {
    if (!Q || !Q.items.length) return;
    if (!findInput()) { note = 'Could not find Meesho\'s photo box. Open Catalog Upload → Add Single Catalog, or tap "Point to box".'; return draw(); }
    const cp = catPlan(), key = cp.tplCat ? String(cp.tplCat.id) : PICKED;
    names[key] = cp.pickedName;
    mode = 'running'; stop = false; note = '';
    if (again) { R = {}; missed.clear(); }
    for (let i = 0; i < Q.items.length && !stop; i++) {
      const it = Q.items[i];
      if (R[it.id] && R[it.id][key] != null) continue;
      current = i; draw();
      await saveState({ current: it.id });
      const input = findInput();
      if (!input) { note = 'Meesho\'s photo box went away. Open the catalogue form again and tap the button.'; break; }
      const before = shipText();
      try { await putImage(input, it); } catch (e) { missed.add(it.id); continue; }
      const r = await waitShip(before);
      if (r.value != null) { R[it.id] = { ...(R[it.id] || {}), [key]: r.value }; missed.delete(it.id); } else if (!stop) missed.add(it.id);
      await saveState();
      draw();
    }
    mode = 'idle'; current = -1;
    await saveState();
    if (!note) note = stop ? 'Stopped.' : missed.size ? `${missed.size} got no reading. Tap the button again to try them.` : 'All read from Meesho\'s screen.';
    draw();
  }

  function cheapest() {
    let best = null, bv = Infinity;
    for (const it of (Q && Q.items) || []) Object.values(R[it.id] || {}).forEach(v => { if (v < bv) { bv = v; best = it; } });
    return best ? { it: best, v: bv } : null;
  }

  /* ---------- pointing at the photo box or the shipping amount ---------- */

  let hoverEl = null, endPoint = null;
  function point(kind) {
    mode = 'pick-' + kind; note = kind === 'input' ? 'Click Meesho\'s photo upload box.' : 'Click the shipping amount (₹) Meesho shows.';
    draw();
    const mark = root.querySelector('.hl');
    const over = e => {
      if (e.target === host) return;
      hoverEl = e.target;
      const b = hoverEl.getBoundingClientRect();
      Object.assign(mark.style, { display: 'block', left: b.left + 'px', top: b.top + 'px', width: b.width + 'px', height: b.height + 'px' });
    };
    endPoint = () => {
      document.removeEventListener('mouseover', over, true);
      document.removeEventListener('click', click, true);
      mark.style.display = 'none';
      endPoint = null;
    };
    const click = e => {
      if (e.target === host) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      endPoint();
      if (kind === 'input') {
        const inp = nearestFileInput(e.target);
        if (inp) { picks.input = pathOf(inp); note = 'Photo box found.'; } else note = 'No photo box there. Click right on Meesho\'s upload box.';
      } else {
        let el = e.target;
        while (el && el !== document.body && rupeesIn(el.textContent) == null) el = el.parentElement;
        if (el && el !== document.body && el.textContent.length < 200) { picks.ship = pathOf(el); note = `Shipping amount found: ₹${rupeesIn(el.textContent)}.`; toHook({ type: 'learn', displayed: rupeesIn(el.textContent) }); } else note = 'No rupee amount there. Click the shipping charge itself.';
      }
      set({ shippicks: picks });
      mode = 'idle'; draw();
    };
    document.addEventListener('mouseover', over, true);
    document.addEventListener('click', click, true);
  }

  /* ---------- the panel ---------- */

  let host, root;
  const STYLE = `
  :host{all:initial}
  *{box-sizing:border-box}
  .card{width:360px;max-height:82vh;overflow:auto;background:#fff;color:#1C2340;font:13.5px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;border:1px solid #DCD6F5;border-radius:12px;box-shadow:0 10px 30px rgba(40,24,90,.25)}
  .hd{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(120deg,#6d4aff,#c04fd0 60%,#ff7a59);color:#fff;padding:9px 12px;z-index:1}
  .hd b{font-size:14.5px}
  .hd button{background:none;border:0;color:#fff;font:inherit;font-weight:700;cursor:pointer;padding:2px 8px;font-size:18px}
  .mini{background:linear-gradient(120deg,#6d4aff,#c04fd0);color:#fff;border:0;border-radius:999px;padding:10px 16px;font:700 14px system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(40,24,90,.3)}
  .sec{padding:10px 12px;border-top:1px solid #F0EDF8}
  .sec:first-of-type{border-top:0}
  .muted{color:#6b6880;font-size:12.5px}
  .row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 0 0}
  .ok{color:#1f7a4d;font-weight:700} .no{color:#B42318;font-weight:700} .wait{color:#8a5a00;font-weight:700}
  .btn{font:inherit;font-weight:700;border:1.5px solid #6d4aff;background:#fff;color:#4b35c9;border-radius:8px;padding:6px 10px;cursor:pointer;text-decoration:none;display:inline-block}
  .btn.pri{background:#6d4aff;color:#fff}
  .btn.sm{padding:3px 8px;font-size:12px}
  .btn:disabled{opacity:.55;cursor:default}
  .link{background:none;border:0;padding:0;color:#4b35c9;font:inherit;font-size:12.5px;font-weight:700;text-decoration:underline;cursor:pointer}
  .acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center}
  .step{display:flex;gap:9px;align-items:flex-start;margin:6px 0}
  .step i{flex:none;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-size:11.5px;font-weight:700;background:#ece6ff;color:#4b35c9}
  .step.done i{background:#1f7a4d;color:#fff}
  .cats{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px}
  .cat{font-size:12px;padding:2px 8px;border-radius:999px;background:#f1eff7}
  .cat.ok{background:#e9f7ef;color:#1f7a4d}.cat.no{background:#fff1f0;color:#B42318}
  ul{list-style:none;margin:0;padding:0}
  li{display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid #F5F2FB}
  li:first-child{border-top:0}
  li img{width:34px;height:34px;object-fit:contain;border:1px solid #eee;border-radius:6px;background:#fff;flex:none}
  li span{flex:1;min-width:0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  li b{font-variant-numeric:tabular-nums;font-size:12.5px;text-align:right}
  li.best{background:#e9f7ef;border-radius:8px;padding-left:4px}
  li.now b{color:#8a5a00}
  .note{background:#fff7e0;border-radius:8px;padding:7px 9px;margin-top:8px;font-size:12.5px}
  .win{background:#e9f7ef;border-radius:10px;padding:8px 10px;margin-top:8px}
  .hl{position:fixed;pointer-events:none;border:2px solid #ff7a59;background:rgba(255,122,89,.12);border-radius:6px;display:none;z-index:2147483646}
  details{margin-top:8px}summary{cursor:pointer;font-weight:700;font-size:12.5px;color:#4b35c9}
  `;
  function mount() {
    if (host && document.body.contains(host)) return;
    host = document.createElement('div'); host.id = 'pakkabill-ship';
    root = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
  }
  const rs = v => (v == null ? '' : '₹' + (Math.round(v * 100) / 100));

  function draw() {
    mount();
    host.style.cssText = mode.startsWith('pick-') ? 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147483647' : 'position:fixed;left:16px;bottom:16px;z-index:2147483647';
    if (mode.startsWith('pick-')) {
      root.innerHTML = `<style>${STYLE}</style><div class="card" style="width:auto;max-width:90vw"><div class="hd"><b>PakkaBill · ${esc(note)}</b><button title="Cancel" data-cancel>×</button></div></div><div class="hl"></div>`;
      root.querySelector('[data-cancel]').onclick = () => { if (endPoint) endPoint(); mode = 'idle'; note = ''; draw(); };
      return;
    }
    if (!open) {
      const done = Q ? Q.items.filter(it => R[it.id] && Object.keys(R[it.id]).length).length : 0;
      root.innerHTML = `<style>${STYLE}</style><button class="mini">PakkaBill shipping check${Q ? ` · ${done}/${Q.items.length}` : ''}</button><div class="hl"></div>`;
      root.querySelector('.mini').onclick = () => { open = true; draw(); };
      return;
    }
    const running = mode === 'running', cp = catPlan(), onScreen = shownShip();
    const best = cheapest(), done = Q ? Q.items.filter(it => cp.list.every(c => R[it.id] && R[it.id][c.key] != null)).length : 0;
    const learned = hook.learned;
    const status = learned ? `<span class="ok">✓ Learned: Meesho priced your photo at ₹${esc(hook.ship)}</span>${hook.confirmed ? ' <span class="muted">· same as this page shows</span>' : ' <span class="muted">(read from Meesho\'s answer)</span>'}`
      : hook.why === 'danger' || hook.why === 'long' ? '<span class="no">Meesho\'s requests here can\'t be repeated safely. Use "Read from Meesho\'s screen" below.</span>'
      : onScreen != null ? '<span class="wait">Meesho shows ₹' + esc(onScreen) + '. Upload your photo in Meesho\'s photo box so PakkaBill can learn how Meesho works it out.</span>'
      : '<span class="wait">Waiting for you to upload a photo and for Meesho to show the shipping.</span>';
    root.innerHTML = `<style>${STYLE}</style><div class="card">
      <div class="hd"><b>PakkaBill · Shipping check</b><button title="Hide" data-min>–</button></div>
      ${!Q ? `<div class="sec"><p style="margin:0 0 8px">On PakkaBill's <b>Low shipping image</b> page, choose categories, add your photo and tap <b>Check in Meesho</b>. The versions appear here.</p><a class="btn pri" href="${PB}" target="_blank" rel="noopener">Open PakkaBill</a></div>` : `
      <div class="sec">
        <div class="muted">${Q.items.length} versions from PakkaBill</div>
        <div class="step${learned ? ' done' : ''}"><i>${learned ? '✓' : '1'}</i><div>Open <b>Catalog Upload → Add Single Catalog</b>, pick a category and upload <b>your photo</b>. Fill price and weight if Meesho asks, until it shows the shipping charge.<div style="margin-top:3px">${status}</div></div></div>
        <div class="step${done && done === Q.items.length ? ' done' : ''}"><i>${done && done === Q.items.length ? '✓' : '2'}</i><div>Tap <b>Check all</b>. Meesho prices each version in ${cp.list.length === 1 ? 'this category' : `these ${cp.list.length} categories`}:
          <div class="cats">${cp.list.map(c => `<span class="cat ok">${esc(c.name)}</span>`).join('')}${cp.chosen.filter(c => !c.id).map(c => `<span class="cat no">${esc(c.name)} ✗</span>`).join('')}</div>
          ${cp.chosen.some(c => !c.id) ? '<div class="muted" style="margin-top:4px">✗: not in Meesho\'s category list yet. Search it once in Meesho\'s category picker.</div>' : ''}
          ${learned && !cp.perCategory ? '<div class="muted" style="margin-top:4px">Meesho\'s request here does not name the category, so only the category picked in Meesho is checked. For another, pick it in Meesho and upload your photo again.</div>' : ''}</div></div>
        <div class="acts">${running ? `<button class="btn" data-stop>Stop</button><span class="muted">${current >= 0 ? `${current + 1} of ${Q.items.length} · ` : ''}asking Meesho…</span>`
          : `<button class="btn pri" data-check${learned ? '' : ' disabled'}>${done ? (done < Q.items.length ? `Check the other ${Q.items.length - done}` : 'Check all again') : `Check all ${Q.items.length}`}</button>`}</div>
        ${note ? `<div class="note">${note}</div>` : ''}
        ${best && !running ? `<div class="win">Cheapest: <b>${rs(best.v)}</b> · ${esc(best.it.label)}<div class="acts"><button class="btn pri sm" data-use>Put it in Meesho's photo box</button></div></div>` : ''}
        <details><summary>Not working? Other ways</summary>
          <div class="acts"><button class="btn sm" data-screen${running ? ' disabled' : ''}>Read from Meesho's screen (slower)</button><button class="btn sm" data-report>Copy a report for support</button></div>
          <div class="row"><span class="muted">Photo box ${findInput() ? '<span class="ok">✓</span>' : '<span class="no">✗</span>'} · Shipping on screen ${onScreen != null ? `<span class="ok">₹${esc(onScreen)}</span>` : '<span class="no">✗</span>'}</span><span><button class="link" data-point="input">Point to box</button> · <button class="link" data-point="ship">Point to ₹</button></span></div>
          <p class="muted" style="margin:6px 0 0">The report shows the shape of Meesho's requests (names only, no values, no login details).</p></details>
      </div>
      <div class="sec"><ul>${Q.items.map((it, i) => { const r = R[it.id] || {}; const vals = cp.list.map(c => r[c.key]); const isBest = best && best.it.id === it.id; return `<li class="${isBest ? 'best' : ''}${running && i === current ? ' now' : ''}"><img src="${it.data}" alt=""><span title="${esc(it.label)}">${esc(it.label)}</span><b>${vals.some(v => v != null) ? vals.map(v => (v == null ? '–' : rs(v))).join(' · ') : running && i === current ? '…' : missed.has(it.id) ? '✗' : ''}</b></li>`; }).join('')}</ul></div>
      <div class="sec acts"><a class="btn sm" href="${PB}" target="_blank" rel="noopener">Open PakkaBill</a><button class="btn sm" data-clear${running ? ' disabled' : ''}>Clear</button></div>`}
    </div><div class="hl"></div>`;
    const on = (sel, fn) => { const b = root.querySelector(sel); if (b) b.onclick = fn; };
    on('[data-min]', () => { open = false; draw(); });
    root.querySelectorAll('[data-point]').forEach(b => b.onclick = () => point(b.dataset.point));
    on('[data-check]', () => checkExact(done === Q.items.length));
    on('[data-screen]', () => checkScreen(false));
    on('[data-stop]', () => { stop = true; });
    on('[data-use]', async () => { const input = findInput(), b = cheapest(); if (input && b) { await putImage(input, b.it); note = 'The cheapest version is in Meesho\'s photo box. Carry on with your catalogue.'; } else note = 'Open Meesho\'s catalogue form first.'; draw(); });
    on('[data-report]', async () => {
      const r = await ask({ type: 'report' }, 5000);
      const text = JSON.stringify({ lens: chrome.runtime.getManifest().version, status: { learned: hook.learned, confirmed: hook.confirmed, why: hook.why, steps: hook.steps, cat: !!hook.cat }, report: r.report || hook.report || null }, null, 1);
      try { await navigator.clipboard.writeText(text); note = 'Report copied. Paste it in a PakkaBill support ticket.'; } catch (e) { note = 'Could not copy. Select and copy this: ' + esc(text.slice(0, 400)); }
      draw();
    });
    on('[data-clear]', async () => { if (!confirm('Remove these versions from the shipping check?')) return; Q = null; R = {}; names = {}; missed.clear(); note = ''; await set({ shipq: null, shipres: null }); draw(); });
  }

  async function load() {
    const x = await get(['shipq', 'shipres', 'shippicks', 'mcats']);
    picks = x.shippicks || {};
    mcats = Array.isArray(x.mcats) ? x.mcats : [];
    const q = x.shipq;
    Q = q && Array.isArray(q.items) && q.items.length && Date.now() - q.at < 7 * 864e5 ? q : null;
    const old = Q && x.shipres && x.shipres.at >= Q.at ? x.shipres : null;
    R = {}; names = {};
    if (old) {
      names = old.cats || {};
      Object.entries(old.results || {}).forEach(([id, v]) => { R[id] = typeof v === 'number' ? { [PICKED]: v } : { ...(v || {}) }; });
    }
    if (!Q && !shown) open = false; // nothing to check: a small button, not the whole panel
    shown = true;
    draw();
  }
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local' || mode === 'running') return;
    if (ch.shipq) { open = true; note = ''; missed.clear(); verified = null; load(); }
  });
  // the number on Meesho's screen: when it changes after an upload, the hook learns from it
  let seen = '', lastShown = null;
  setInterval(() => {
    if (document.visibilityState !== 'visible' || mode === 'running') return;
    const v = shownShip();
    if (v != null && v !== lastShown) { lastShown = v; toHook({ type: 'learn', displayed: v }); }
    if (!open || mode !== 'idle' || !Q) return;
    const now = `${!!findInput()}|${shipText()}|${hook.learned}|${hook.ship}`;
    if (now !== seen) { seen = now; draw(); }
  }, 1000);
  toHook({ type: 'hello' });
  load();
})();
