// PakkaBill shipping check, on Meesho's supplier panel (supplier.meesho.com).
// PakkaBill's Image tab sends versions of a product photo here. In Meesho's catalogue upload this
// puts each version into Meesho's photo box, waits for Meesho to show the shipping charge, reads it
// and sends it back to PakkaBill, which marks the cheapest. It only fills the photo box on the page
// you have open, in your own account, and never submits a catalogue. Nothing goes to any server.
(() => {
  if (window.top !== window) return;
  const get = k => new Promise(r => chrome.storage.local.get(k, r));
  const set = o => new Promise(r => chrome.storage.local.set(o, r));
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PB = 'https://pakkabill1.vercel.app/#/lowship';

  // "Shipping Charges ₹ 1,234" -> 1234; a cell holding just "72" -> 72; null when there is no amount.
  function rupeesIn(text) {
    const t = String(text || '').replace(/ /g, ' ');
    const m = t.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/i) || t.match(/^\s*([\d,]+(?:\.\d+)?)\s*$/);
    if (!m) return null;
    const n = Number(m[1].replace(/,/g, ''));
    return n >= 0 && n < 100000 ? n : null;
  }

  let Q = null; // { at, cat, items: [{ id, label, name, data }] }
  let R = {}; // id -> rupees Meesho showed
  let picks = {}; // { input, ship }: where the photo box and the shipping amount are, if pointed to
  let mode = 'idle'; // idle | pick-input | pick-ship | running
  let current = -1, note = '', stop = false, open = true;
  const missed = new Set();

  /* ---------- finding things on Meesho's page ---------- */

  // A CSS path to an element, so it can be found again after Meesho redraws the page.
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

  // Meesho's photo box: the one pointed to, else the first file input that takes images.
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

  // The shipping amount: the element pointed to, else the smallest bit of the page that mentions
  // shipping (or delivery charge) with a rupee amount in it or right after it.
  const LABEL = /shipping|delivery\s*charge/i;
  function findShip() {
    const t = byPath(picks.ship);
    if (t && rupeesIn(t.textContent) != null) return t;
    let best = null, len = 1e9;
    for (const e of document.body.querySelectorAll('div,span,p,label,td,th,li,strong,b,small,h4,h5,h6')) {
      const text = e.textContent;
      if (!text || text.length > 160 || !LABEL.test(text)) continue;
      let c = rupeesIn(text) != null ? e : null;
      if (!c) { const n = e.nextElementSibling; if (n && n.textContent.length < 40 && rupeesIn(n.textContent) != null) c = n; }
      if (c && c.textContent.length < len) { best = c; len = c.textContent.length; }
    }
    return best;
  }
  const shipText = () => { const e = findShip(); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; };

  /* ---------- trying one version ---------- */

  async function putImage(input, item) {
    const blob = await (await fetch(item.data)).blob();
    const dt = new DataTransfer();
    dt.items.add(new File([blob], item.name || 'photo.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Waits for Meesho to work out the shipping for the new photo: the text changes (often through
  // "calculating"), then stays the same for 1.5 s. If it never changes in 12 s, the charge is the
  // same as before. Gives up after 40 s (time to finish a crop window Meesho may open).
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

  async function checkAll(again) {
    if (!Q || !Q.items.length) return;
    if (!findInput()) { note = 'Could not find Meesho\'s photo box. Open Catalog Upload → Add Single Catalog, or tap "Point to the photo box".'; return draw(); }
    if (!findShip()) note = 'Meesho is not showing a shipping charge yet. Fill the category and details first; PakkaBill waits for it after each photo.';
    mode = 'running'; stop = false;
    if (again) { R = {}; missed.clear(); await set({ shipres: { at: Date.now(), results: R } }); }
    for (let i = 0; i < Q.items.length && !stop; i++) {
      const it = Q.items[i];
      if (R[it.id] != null) continue;
      current = i; note = ''; draw();
      await set({ shipres: { at: Date.now(), results: R, current: it.id } }); // PakkaBill shows which one is being checked
      const input = findInput(); // found again each time: Meesho may redraw the form
      if (!input) { note = 'Meesho\'s photo box went away. Open the catalogue form again and tap Check all.'; break; }
      const before = shipText();
      try { await putImage(input, it); } catch (e) { missed.add(it.id); continue; }
      const r = await waitShip(before);
      if (r.value != null) { R[it.id] = r.value; missed.delete(it.id); }
      else if (!stop) missed.add(it.id);
      await set({ shipres: { at: Date.now(), results: R, current: null } });
      draw();
    }
    mode = 'idle'; current = -1;
    await set({ shipres: { at: Date.now(), results: R, current: null } });
    if (!note) note = stop ? 'Stopped.' : missed.size ? `${missed.size} version${missed.size > 1 ? 's' : ''} got no reading. Tap Check all to try them again.` : 'All checked. The prices are in PakkaBill too.';
    draw();
  }

  function cheapest() {
    let best = null;
    for (const it of (Q && Q.items) || []) if (R[it.id] != null && (!best || R[it.id] < R[best.id])) best = it;
    return best;
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
        if (el && el !== document.body && el.textContent.length < 200) { picks.ship = pathOf(el); note = `Shipping amount found: ₹${rupeesIn(el.textContent)}.`; } else note = 'No rupee amount there. Click the shipping charge itself.';
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
  .card{width:340px;max-height:80vh;overflow:auto;background:#fff;color:#1C2340;font:13.5px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;border:1px solid #DCD6F5;border-radius:12px;box-shadow:0 10px 30px rgba(40,24,90,.25)}
  .hd{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(120deg,#6d4aff,#c04fd0 60%,#ff7a59);color:#fff;padding:9px 12px;z-index:1}
  .hd b{font-size:14.5px}
  .hd button{background:none;border:0;color:#fff;font:inherit;font-weight:700;cursor:pointer;padding:2px 8px;font-size:18px}
  .mini{background:linear-gradient(120deg,#6d4aff,#c04fd0);color:#fff;border:0;border-radius:999px;padding:10px 16px;font:700 14px system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(40,24,90,.3)}
  .sec{padding:10px 12px;border-top:1px solid #F0EDF8}
  .sec:first-of-type{border-top:0}
  .muted{color:#6b6880;font-size:12.5px}
  .row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 0}
  .ok{color:#1f7a4d;font-weight:700} .no{color:#B42318;font-weight:700}
  .btn{font:inherit;font-weight:700;border:1.5px solid #6d4aff;background:#fff;color:#4b35c9;border-radius:8px;padding:6px 10px;cursor:pointer;text-decoration:none;display:inline-block}
  .btn.pri{background:#6d4aff;color:#fff}
  .btn.sm{padding:3px 8px;font-size:12px}
  .btn:disabled{opacity:.55;cursor:default}
  .acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
  ul{list-style:none;margin:0;padding:0}
  li{display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid #F5F2FB}
  li:first-child{border-top:0}
  li img{width:34px;height:34px;object-fit:contain;border:1px solid #eee;border-radius:6px;background:#fff;flex:none}
  li span{flex:1;min-width:0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  li b{font-variant-numeric:tabular-nums}
  li.best{background:#e9f7ef;border-radius:8px;padding-left:4px}
  li.now b{color:#8a5a00}
  .note{background:#fff7e0;border-radius:8px;padding:7px 9px;margin-top:8px;font-size:12.5px}
  .win{background:#e9f7ef;border-radius:10px;padding:8px 10px;margin-top:8px}
  .hl{position:fixed;pointer-events:none;border:2px solid #ff7a59;background:rgba(255,122,89,.12);border-radius:6px;display:none;z-index:2147483646}
  ol{margin:0;padding-left:18px}
  `;

  function mount() {
    if (host && document.body.contains(host)) return;
    host = document.createElement('div'); host.id = 'pakkabill-ship';
    host.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483647';
    root = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
  }

  function draw() {
    mount();
    // while pointing, only a small bar at the top, so the whole page can be clicked
    host.style.cssText = mode.startsWith('pick-') ? 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147483647' : 'position:fixed;left:16px;bottom:16px;z-index:2147483647';
    if (mode.startsWith('pick-')) {
      root.innerHTML = `<style>${STYLE}</style><div class="card" style="width:auto;max-width:90vw"><div class="hd"><b>PakkaBill · ${esc(note)}</b><button title="Cancel" data-cancel>×</button></div></div><div class="hl"></div>`;
      root.querySelector('[data-cancel]').onclick = () => { if (endPoint) endPoint(); mode = 'idle'; note = ''; draw(); };
      return;
    }
    if (!open) {
      root.innerHTML = `<style>${STYLE}</style><button class="mini">PakkaBill shipping check${Q ? ` · ${Object.keys(R).length}/${Q.items.length}` : ''}</button><div class="hl"></div>`;
      root.querySelector('.mini').onclick = () => { open = true; draw(); };
      return;
    }
    const inp = findInput(), sh = findShip(), shv = sh ? rupeesIn(sh.textContent.replace(/^.*?(₹|rs\.?|inr)/i, '$1')) : null;
    const best = cheapest(), done = Q ? Q.items.filter(it => R[it.id] != null).length : 0;
    const running = mode === 'running';
    root.innerHTML = `<style>${STYLE}</style><div class="card">
      <div class="hd"><b>PakkaBill · Shipping check</b><button title="Hide" data-min>–</button></div>
      ${!Q ? `<div class="sec"><p style="margin:0 0 8px">In PakkaBill's <b>Image</b> tab, add your product photos and tap <b>Send to Meesho check</b>. They appear here.</p><a class="btn pri" href="${PB}" target="_blank" rel="noopener">Open PakkaBill</a></div>` : `
      <div class="sec">
        <div class="muted">${Q.items.length} versions${Q.cat ? ' · ' + esc(Q.cat) : ''} from PakkaBill</div>
        <ol class="muted" style="margin-top:6px"><li style="display:list-item;border:0;padding:0">Open <b>Catalog Upload → Add Single Catalog</b>, pick the category and fill the details until Meesho shows a shipping charge.</li><li style="display:list-item;border:0;padding:0">Tap <b>Check all</b>. Keep this tab open.</li></ol>
        <div class="row"><span>Photo box</span><span>${inp ? '<span class="ok">✓ found</span>' : '<span class="no">not found</span>'} <button class="btn sm" data-point="input"${running ? ' disabled' : ''}>Point to it</button></span></div>
        <div class="row"><span>Shipping charge</span><span>${shv != null ? `<span class="ok">₹${shv}</span>` : '<span class="no">not shown yet</span>'} <button class="btn sm" data-point="ship"${running ? ' disabled' : ''}>Point to it</button></span></div>
        <div class="acts">${running ? `<button class="btn" data-stop>Stop</button><span class="muted">${current + 1} of ${Q.items.length} · waiting for Meesho… If Meesho asks to crop or confirm the photo, do it.</span>`
          : `<button class="btn pri" data-check${inp ? '' : ' disabled'}>${done ? (done < Q.items.length ? `Check the other ${Q.items.length - done}` : 'Check all again') : `Check all ${Q.items.length}`}</button>`}</div>
        ${note ? `<div class="note">${esc(note)}</div>` : ''}
        ${best && !running ? `<div class="win">Cheapest: <b>₹${R[best.id]}</b> · ${esc(best.label)}<div class="acts"><button class="btn pri sm" data-use>Put it in Meesho's photo box</button></div></div>` : ''}
      </div>
      <div class="sec"><ul>${Q.items.map((it, i) => `<li class="${best && best.id === it.id ? 'best' : ''}${running && i === current ? ' now' : ''}"><img src="${it.data}" alt=""><span title="${esc(it.label)}">${esc(it.label)}</span><b>${R[it.id] != null ? '₹' + R[it.id] : running && i === current ? '…' : missed.has(it.id) ? '✗' : ''}</b></li>`).join('')}</ul></div>
      <div class="sec acts"><a class="btn sm" href="${PB}" target="_blank" rel="noopener">Open PakkaBill</a><button class="btn sm" data-clear${running ? ' disabled' : ''}>Clear</button></div>`}
    </div><div class="hl"></div>`;
    root.querySelector('[data-min]').onclick = () => { open = false; draw(); };
    root.querySelectorAll('[data-point]').forEach(b => b.onclick = () => point(b.dataset.point));
    const chk = root.querySelector('[data-check]');
    if (chk) chk.onclick = () => checkAll(done === Q.items.length);
    const st = root.querySelector('[data-stop]');
    if (st) st.onclick = () => { stop = true; };
    const use = root.querySelector('[data-use]');
    if (use) use.onclick = async () => { const input = findInput(), b = cheapest(); if (input && b) { await putImage(input, b); note = 'The cheapest version is in Meesho\'s photo box. Carry on with your catalogue.'; draw(); } };
    const clr = root.querySelector('[data-clear]');
    if (clr) clr.onclick = async () => { if (!confirm('Remove these versions from the shipping check?')) return; Q = null; R = {}; missed.clear(); note = ''; await set({ shipq: null, shipres: null }); draw(); };
  }

  async function load() {
    const x = await get(['shipq', 'shipres', 'shippicks']);
    picks = x.shippicks || {};
    const q = x.shipq;
    Q = q && Array.isArray(q.items) && q.items.length && Date.now() - q.at < 7 * 864e5 ? q : null;
    R = Q && x.shipres && x.shipres.at >= Q.at ? { ...(x.shipres.results || {}) } : {};
    draw();
  }
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local' || mode === 'running') return;
    if (ch.shipq) { open = true; note = ''; missed.clear(); load(); }
  });
  // the found / not found marks follow the page while nothing else is going on
  let seen = '';
  setInterval(() => {
    if (!open || mode !== 'idle' || !Q || document.visibilityState !== 'visible') return;
    const now = `${!!findInput()}|${shipText()}`;
    if (now !== seen) { seen = now; draw(); }
  }, 2000);
  load();
})();
