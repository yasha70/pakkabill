// PakkaBill auto listing, on Meesho's supplier panel (supplier.meesho.com).
// Fills Meesho's catalogue form from a PakkaBill template and product: every detail field by its
// label, the sizes with price, MRP and stock, and the photos. Works with Meesho's text boxes,
// drop-downs, search lists, chips and radio buttons. "Save this form as a template" reads a form the
// seller filled once, so the next products fill in one click. It never presses Submit: the seller
// checks the form and submits it in Meesho. Nothing goes to any server.
(() => {
  if (window.top !== window) return;
  const C = PBListCore;
  const get = k => new Promise(r => chrome.storage.local.get(k, r));
  const set = o => new Promise(r => chrome.storage.local.set(o, r));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PB = 'https://pakkabill1.vercel.app/#/autolist';
  const clean = s => String(s || '').replace(/[​ ]/g, ' ').replace(/\s*\*\s*/g, ' ').replace(/\s+/g, ' ').trim();

  let Q = null; // { at, items: [{ id, tpl, prod }] } from PakkaBill
  let T = []; // templates (from PakkaBill and saved here)
  let S = {}; // id -> { state: 'filled' | 'done', filled, total, missing, at }
  let cur = 0, open = true, shown = false, busy = false, note = '', last = null; // last: { missing: [items], tplId }
  let mode = 'idle', pickFor = null;

  /* ---------- reading Meesho's form ---------- */

  const visible = el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const mine = el => host && (el === host || host.contains(el));
  function textWithout(el, skip) {
    let t = '';
    const walk = n => {
      if (n.nodeType === 3) t += n.textContent + ' ';
      else if (n.nodeType === 1 && n !== skip && !n.matches('input,textarea,select,[role=listbox],[role=combobox],[aria-haspopup=listbox],button,svg,.MuiChip-root')) n.childNodes.forEach(walk);
    };
    walk(el);
    return clean(t);
  }
  // The label of a form control, the way the seller sees it.
  function labelOf(el) {
    if (el.labels && el.labels.length) { const t = textWithout(el.labels[0], el); if (t) return t; }
    const fc = el.closest('.MuiFormControl-root,.MuiTextField-root,[class*="FormControl"],[class*="form-group"],[class*="formGroup"]');
    if (fc) { const l = fc.querySelector('label,legend,.MuiFormLabel-root'); if (l && !l.contains(el)) { const t = textWithout(l, el); if (t) return t; } }
    const lb = (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => id && document.getElementById(id)).filter(x => x && x !== el && !x.contains(el) && !el.contains(x));
    if (lb.length) { const t = clean(lb.map(x => textWithout(x, el)).join(' ')); if (t) return t; }
    const td = el.closest('td');
    if (td) {
      const table = td.closest('table'), row = td.parentElement, i = [...row.children].indexOf(td);
      const head = table && (table.tHead ? table.tHead.rows[0] : table.rows[0]);
      if (head && head !== row && head.cells[i]) return clean(head.cells[i].textContent);
    }
    const al = el.getAttribute('aria-label');
    if (al && !/^(open|close|clear)$/i.test(al)) return clean(al);
    // the nearest short text before the control
    for (let e = el, n = 0; e && e !== document.body && n < 5; e = e.parentElement, n++) {
      for (let p = e.previousElementSibling; p; p = p.previousElementSibling) {
        if (p.querySelector && p.querySelector('input,textarea,select,[role=combobox]')) break;
        const t = clean(p.textContent);
        if (t && t.length <= 80) return t;
      }
    }
    return clean(el.getAttribute('placeholder') || '');
  }
  // The size a control belongs to, when it sits in a row of the size table.
  function rowOf(el) {
    const td = el.closest('td');
    if (!td) return '';
    const row = td.parentElement, first = row.cells[0];
    if (!first || first === td || first.querySelector('input,textarea,select')) return '';
    return clean(first.textContent);
  }
  function kindOf(el) {
    if (el.tagName === 'SELECT') return 'select';
    if (el.tagName === 'TEXTAREA') return 'text';
    if (el.tagName === 'INPUT') {
      const t = (el.type || 'text').toLowerCase();
      if (t === 'file') return 'file';
      if (t === 'radio') return 'radio';
      if (t === 'checkbox') return 'checkbox';
      if (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete') === 'list') return 'combo';
      return ['text', 'number', 'tel', 'email', 'url', 'search', ''].includes(t) ? 'text' : null;
    }
    if (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-haspopup') === 'listbox') return 'pick';
    return null;
  }
  // Every field on the page: { i, el, kind, label, row, multi, required }
  function scan() {
    const out = [], radios = new Map();
    const els = document.querySelectorAll('input,textarea,select,[role=combobox],[aria-haspopup=listbox]');
    for (const el of els) {
      if (mine(el) || el.disabled || el.readOnly && el.tagName === 'TEXTAREA') continue;
      if (el.getAttribute('aria-hidden') === 'true' || el.classList.contains('MuiSelect-nativeInput') || el.type === 'hidden') continue;
      if (el.closest('[role=listbox],[role=dialog][aria-label*="PakkaBill"],header,nav')) continue;
      const kind = kindOf(el);
      if (!kind) continue;
      if (kind !== 'file' && kind !== 'radio' && !visible(el)) continue;
      if (kind === 'radio') {
        const g = el.closest('[role=radiogroup]') || el.form || document.body, key = (el.name || '') + '|' + (g.id || '');
        if (!radios.has(key)) { const f = { el: g, radios: [], kind: 'radio', label: g.getAttribute && g.getAttribute('role') === 'radiogroup' ? labelOf(g) : labelOf(el.closest('fieldset') || el), row: '' }; radios.set(key, f); out.push(f); }
        radios.get(key).radios.push(el);
        continue;
      }
      if (kind === 'file' && el.accept && !/image|jpe?g|png|\*/i.test(el.accept)) continue;
      const label = labelOf(el);
      if (!label && kind !== 'file') continue;
      const root = el.closest('.MuiAutocomplete-root,.MuiInputBase-root,.MuiFormControl-root') || el.parentElement;
      out.push({ el, kind, label, row: rowOf(el), multi: !!(root && root.querySelector('.MuiChip-root')) || el.multiple, required: /\*/.test((el.labels && el.labels[0] && el.labels[0].textContent) || '') || el.required || el.getAttribute('aria-required') === 'true' });
    }
    out.forEach((f, i) => { f.i = i; });
    return out;
  }
  function chips(el) {
    const root = el.closest('.MuiAutocomplete-root,.MuiInputBase-root,.MuiFormControl-root') || el;
    return [...root.querySelectorAll('.MuiChip-label,.MuiChip-root')].filter(c => !c.querySelector('.MuiChip-label')).map(c => clean(c.textContent)).filter(Boolean);
  }
  function readValue(f) {
    const el = f.el;
    if (f.kind === 'text' || f.kind === 'combo') { const c = chips(el); return c.length ? c : el.value; }
    if (f.kind === 'select') return el.selectedIndex > 0 || (el.selectedIndex === 0 && el.value) ? clean(el.options[el.selectedIndex].text) : '';
    if (f.kind === 'pick') { const c = chips(el); return c.length ? c : clean(el.textContent); }
    if (f.kind === 'radio') { const r = f.radios.find(x => x.checked); return r ? clean((r.closest('label') || r.parentElement).textContent) : ''; }
    if (f.kind === 'checkbox') return el.checked ? 'Yes' : '';
    return '';
  }

  /* ---------- filling ---------- */

  function setNative(el, v) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const listboxes = () => [...document.querySelectorAll('[role=listbox]')].filter(l => visible(l) && !mine(l));
  async function waitList(ms = 2500) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const l = listboxes().pop();
      if (l && l.querySelector('[role=option]')) return l;
      await sleep(80);
    }
    return null;
  }
  async function closeList() {
    for (let i = 0; i < 3 && listboxes().length; i++) {
      const l = listboxes().pop();
      l.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(150);
      if (listboxes().length) { const b = document.querySelector('.MuiBackdrop-root,.MuiBackdrop-invisible'); if (b) b.click(); await sleep(150); }
    }
  }
  function choose(list, value) {
    const opts = [...list.querySelectorAll('[role=option]')];
    const i = C.matchOption(opts.map(o => o.textContent), value);
    if (i < 0) return false;
    const o = opts[i];
    if (o.getAttribute('aria-selected') === 'true') return true;
    o.scrollIntoView({ block: 'nearest' });
    o.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    o.click();
    return true;
  }
  // A value like "Festive, Wedding" is several choices when the field takes several (chips, a list that
  // allows many) or when no single option is called that.
  async function valuesFor(f, item) {
    if (item.multi || f.multi) return C.splitMulti(item.value);
    if (!/[,;|]/.test(item.value) || (f.kind !== 'pick' && f.kind !== 'combo')) return [item.value];
    return f.manyOk ? C.splitMulti(item.value) : [item.value];
  }
  // Did the value stick? Read the field back the way the seller would see it.
  function holds(f, item) {
    const got = readValue(f), want = C.splitMulti(item.value);
    if (f.kind === 'text') return C.norm(got) === C.norm(item.value) || String(got).trim() === String(item.value).trim();
    if (f.kind === 'checkbox') return /^(yes|true|1|y)$/i.test(item.value) === (got === 'Yes');
    const have = Array.isArray(got) ? got : [got];
    if (have.length === 1 && want.length > 1 && C.matchOption(have, item.value) >= 0 && C.norm(have[0]) === C.norm(item.value)) return true;
    return want.every(v => have.some(h => C.matchOption([h], v) >= 0 || C.matchOption([v], h) >= 0));
  }
  async function fillOne(f, item) {
    const ok = await fillTry(f, item);
    await sleep(80);
    return ok && holds(f, item);
  }
  async function fillTry(f, item) {
    const el = f.el;
    let values = await valuesFor(f, item);
    el.scrollIntoView({ block: 'center' });
    if (f.kind === 'text') { el.focus(); setNative(el, item.value); el.dispatchEvent(new Event('blur', { bubbles: true })); return true; }
    if (f.kind === 'select') {
      const i = C.matchOption([...el.options].map(o => o.text), item.value);
      if (i < 0) return false;
      setNative(el, el.options[i].value); return true;
    }
    if (f.kind === 'radio') {
      const i = C.matchOption(f.radios.map(r => (r.closest('label') || r.parentElement).textContent), item.value);
      if (i < 0) return false;
      f.radios[i].click(); return true;
    }
    if (f.kind === 'checkbox') { const want = /^(yes|true|1|y)$/i.test(item.value); if (el.checked !== want) el.click(); return true; }
    if (f.kind === 'pick') {
      let ok = 0;
      const have = C.splitMulti(readValue(f));
      if (values.length === 1 && /[,;|]/.test(values[0])) {
        el.focus(); el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); el.click();
        const l = await waitList();
        const opts = l ? [...l.querySelectorAll('[role=option]')].map(o => C.norm(o.textContent)) : [];
        if (l && (l.getAttribute('aria-multiselectable') === 'true' || !opts.includes(C.norm(values[0])))) values = C.splitMulti(values[0]);
      }
      for (const v of values) {
        if (have.some(h => C.matchOption([h], v) >= 0)) { ok++; continue; }
        if (!listboxes().length) { el.focus(); el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); el.click(); }
        const l = await waitList();
        if (l && choose(l, v)) ok++;
        await sleep(120);
      }
      await closeList();
      return ok === values.length;
    }
    if (f.kind === 'combo') {
      let ok = 0;
      if (values.length === 1 && /[,;|]/.test(values[0])) {
        // open the whole list: a list that takes many, or one with no option of that full name, gets the parts
        el.focus(); setNative(el, '');
        const b = (el.closest('.MuiAutocomplete-root') || document).querySelector('.MuiAutocomplete-popupIndicator');
        if (b) b.click(); else el.click();
        const l = await waitList(1500);
        const opts = l ? [...l.querySelectorAll('[role=option]')].map(o => C.norm(o.textContent)) : [];
        if (!l || l.getAttribute('aria-multiselectable') === 'true' || !opts.includes(C.norm(values[0]))) values = C.splitMulti(values[0]);
        await closeList();
      }
      for (const v of values) {
        if (C.splitMulti(readValue(f)).some(h => C.matchOption([h], v) >= 0)) { ok++; continue; }
        el.focus(); el.click();
        setNative(el, v);
        let l = await waitList(1500);
        if (!l || C.matchOption([...l.querySelectorAll('[role=option]')].map(o => o.textContent), v) < 0) {
          // a shorter search: the first word, then the whole list
          setNative(el, String(v).split(/[\s-]/)[0]); l = await waitList(1200);
          if (!l) { setNative(el, ''); const b = (el.closest('.MuiAutocomplete-root') || document).querySelector('.MuiAutocomplete-popupIndicator'); if (b) b.click(); l = await waitList(1200); }
        }
        if (l && choose(l, v)) ok++;
        await sleep(150);
      }
      await closeList();
      el.blur();
      return ok === values.length;
    }
    return false;
  }
  async function putPhotos(photos) {
    const inputs = scan().filter(f => f.kind === 'file');
    let i = 0, put = 0;
    for (const f of inputs) {
      if (i >= photos.length) break;
      const take = f.el.multiple ? photos.slice(i) : [photos[i]];
      const dt = new DataTransfer();
      for (const [k, p] of take.entries()) {
        const blob = await (await fetch(p.data || p)).blob();
        dt.items.add(new File([blob], p.name || `photo-${i + k + 1}.jpg`, { type: blob.type || 'image/jpeg', lastModified: Date.now() }));
      }
      f.el.files = dt.files;
      f.el.dispatchEvent(new Event('input', { bubbles: true }));
      f.el.dispatchEvent(new Event('change', { bubbles: true }));
      i += take.length; put += take.length;
      await sleep(400);
    }
    return put;
  }
  const keyOf = it => C.canon(it.label) + '|' + C.norm(it.row || '');
  // Fills the form: up to four rounds, as some fields (the size rows) appear only after others are set.
  async function fill(tpl, prod) {
    const items = C.plan(tpl, prod), done = new Set(), marks = [];
    const points = (tpl && tpl.points) || {};
    for (let round = 0; round < 4 && done.size < items.length; round++) {
      const fields = scan(), used = {};
      for (const it of items) {
        if (done.has(it)) continue;
        let f = null;
        const p = points[keyOf(it)];
        if (p) { const el = byPath(p); if (el) f = fields.find(x => x.el === el || (x.radios && x.radios.includes(el))) || (kindOf(el) ? { el, kind: kindOf(el), label: it.label, row: it.row } : null); }
        if (!f) f = C.bestField(it, fields, used);
        if (!f) continue;
        used[f.i] = true;
        let ok = false;
        try { ok = await fillOne(f, it); } catch (e) { ok = false; }
        if (ok) { done.add(it); marks.push(f.el); }
        await sleep(60);
      }
      if (done.size < items.length) await sleep(700);
    }
    let photos = 0;
    if (prod && prod.photos && prod.photos.length) photos = await putPhotos(prod.photos);
    flash(marks);
    return { total: items.length, filled: done.size, missing: items.filter(it => !done.has(it)), photos };
  }
  function flash(els) {
    els.forEach(el => { const box = el.closest('.MuiInputBase-root,.MuiFormControl-root,td') || el; const o = box.style.outline; box.style.outline = '2px solid #1f9d55'; setTimeout(() => { box.style.outline = o; }, 4000); });
  }

  /* ---------- pointing at a field Meesho calls something else ---------- */

  function pathOf(el) {
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && e !== document.body; e = e.parentElement) {
      if (e.id && /^[A-Za-z][\w-]{2,40}$/.test(e.id) && !/\d{3,}|^:/.test(e.id)) { parts.unshift('#' + CSS.escape(e.id)); return parts.join(' > '); }
      let s = e.tagName.toLowerCase();
      const same = e.parentElement ? [...e.parentElement.children].filter(c => c.tagName === e.tagName) : [];
      if (same.length > 1) s += `:nth-of-type(${same.indexOf(e) + 1})`;
      parts.unshift(s);
    }
    return 'body > ' + parts.join(' > ');
  }
  const byPath = p => { try { return p ? document.querySelector(p) : null; } catch { return null; } };
  let endPoint = null;
  function point(item) {
    mode = 'pick'; pickFor = item; draw();
    const mark = root.querySelector('.hl');
    const over = e => { if (mine(e.target)) return; const b = e.target.getBoundingClientRect(); Object.assign(mark.style, { display: 'block', left: b.left + 'px', top: b.top + 'px', width: b.width + 'px', height: b.height + 'px' }); };
    const click = async e => {
      if (mine(e.target)) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      endPoint();
      let el = e.target.closest('input,textarea,select,[role=combobox],[aria-haspopup=listbox]');
      if (!el) { const lab = e.target.closest('label'); el = lab && lab.control; }
      if (!el) { const box = e.target.closest('.MuiFormControl-root,.MuiAutocomplete-root,td,div'); el = box && box.querySelector('input:not([aria-hidden=true]):not([type=hidden]),textarea:not([aria-hidden=true]),select,[role=combobox],[aria-haspopup=listbox]'); }
      mode = 'idle';
      if (!el || !kindOf(el)) { note = 'No form field there. Click right on the box for ' + item.label + '.'; return draw(); }
      const f = kindOf(el) === 'radio' ? scan().find(x => x.radios && x.radios.includes(el)) : { el, kind: kindOf(el), label: item.label, row: item.row };
      const ok = f ? await fillOne(f, item) : false;
      // remembered on the template that was filled, here and in PakkaBill
      const tid = last && last.tplId, k = T.findIndex(t => t.id === tid);
      if (k >= 0) {
        T[k] = { ...T[k], points: { ...(T[k].points || {}), [keyOf(item)]: pathOf(el) }, updatedAt: Date.now() };
        if (Q) Q.items.forEach(x => { if (x.tpl && x.tpl.id === tid) x.tpl = { ...x.tpl, points: T[k].points }; });
        await set(Q ? { listtpl: T, listq: Q } : { listtpl: T });
      }
      if (ok && last) last.missing = last.missing.filter(m => m !== item);
      note = ok ? `${item.label} filled. PakkaBill will remember this box for the template.` : `Could not put "${item.value}" in that box. Choose it by hand.`;
      draw();
    };
    endPoint = () => { document.removeEventListener('mouseover', over, true); document.removeEventListener('click', click, true); mark.style.display = 'none'; endPoint = null; };
    document.addEventListener('mouseover', over, true);
    document.addEventListener('click', click, true);
  }

  /* ---------- actions ---------- */

  function category() {
    const crumbs = [...document.querySelectorAll('[class*="readcrumb"],nav[aria-label*="readcrumb"],ol,div,span,p')].map(e => clean(e.textContent)).filter(t => t.length < 120 && /\S\s*(>|›|\/)\s*\S/.test(t) && t.split(/>|›/).length >= 2);
    return crumbs.sort((a, b) => a.length - b.length)[0] || '';
  }
  async function learnForm() {
    const fields = scan().map(f => ({ label: f.label, row: f.row, kind: f.kind, multi: f.multi, value: f.kind === 'file' ? '' : readValue(f) })).filter(f => f.value && (!Array.isArray(f.value) || f.value.length));
    if (fields.length < 3) { note = 'Fill Meesho\'s form for one product first (category, details, sizes, prices), then save it as a template.'; return draw(); }
    const cat = category();
    const name = prompt('Name for this template (for example "Cotton blouse")', (cat.split(/>|›/).pop() || 'Meesho product').trim());
    if (name == null) return;
    const tpl = C.learn(fields, cat, name.trim() || cat);
    T = [tpl, ...T.filter(t => t.id !== tpl.id)].slice(0, 200);
    await set({ listtpl: T });
    note = `Template "${tpl.name}" saved: ${tpl.fields.length} detail${tpl.fields.length === 1 ? '' : 's'} and ${tpl.sizes.length} size${tpl.sizes.length === 1 ? '' : 's'}. It is in PakkaBill's Auto listing too. Next time, add products there and fill in one click.`;
    draw();
  }
  async function fillNow(tpl, prod, id) {
    if (busy) return;
    busy = true; note = 'Filling… keep this tab in front.'; draw();
    const r = await fill(tpl, prod);
    busy = false;
    last = { missing: r.missing, tplId: tpl && tpl.id };
    note = `Filled ${r.filled} of ${r.total}${r.photos ? ` and ${r.photos} photo${r.photos > 1 ? 's' : ''}` : ''}.` + (r.missing.length ? ' Point to the ones left, or fill them by hand.' : ' Check the form, then submit it in Meesho.');
    if (id) { S[id] = { state: 'filled', filled: r.filled, total: r.total, missing: r.missing.map(m => m.label + (m.row ? ' (' + m.row + ')' : '')), at: Date.now() }; await set({ liststat: S }); }
    draw();
  }

  /* ---------- the panel ---------- */

  let host, root;
  const STYLE = `
  :host{all:initial}
  *{box-sizing:border-box}
  .card{width:350px;max-height:82vh;overflow:auto;background:#fff;color:#1C2340;font:13.5px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;border:1px solid #DCD6F5;border-radius:12px;box-shadow:0 10px 30px rgba(40,24,90,.25)}
  .hd{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(120deg,#1f9d8a,#6d4aff);color:#fff;padding:9px 12px;z-index:1}
  .hd b{font-size:14.5px}
  .hd button{background:none;border:0;color:#fff;font:inherit;font-weight:700;cursor:pointer;padding:2px 8px;font-size:18px}
  .mini{background:linear-gradient(120deg,#1f9d8a,#6d4aff);color:#fff;border:0;border-radius:999px;padding:10px 16px;font:700 14px system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(40,24,90,.3)}
  .sec{padding:10px 12px;border-top:1px solid #F0EDF8}
  .sec:first-of-type{border-top:0}
  .muted{color:#6b6880;font-size:12.5px}
  .btn{font:inherit;font-weight:700;border:1.5px solid #6d4aff;background:#fff;color:#4b35c9;border-radius:8px;padding:6px 10px;cursor:pointer;text-decoration:none;display:inline-block}
  .btn.pri{background:#6d4aff;color:#fff}
  .btn.sm{padding:3px 8px;font-size:12px}
  .btn:disabled{opacity:.55;cursor:default}
  .acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center}
  .prod{display:flex;gap:10px;align-items:flex-start}
  .prod img{width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid #eee;flex:none}
  .prod b{display:block}
  .pager{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
  .tag{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:1px 8px;background:#eef;color:#4b35c9}
  .tag.ok{background:#e9f7ef;color:#1f7a4d}
  ul{list-style:none;margin:6px 0 0;padding:0}
  li{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 0;border-top:1px solid #F5F2FB}
  li:first-child{border-top:0}
  li span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .note{background:#fff7e0;border-radius:8px;padding:7px 9px;margin-top:8px;font-size:12.5px}
  .hl{position:fixed;pointer-events:none;border:2px solid #1f9d8a;background:rgba(31,157,138,.12);border-radius:6px;display:none;z-index:2147483646}
  `;
  function mount() {
    if (host && document.body.contains(host)) return;
    host = document.createElement('div'); host.id = 'pakkabill-list';
    root = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
  }
  const tplOf = it => it && (T.find(t => t.id === (it.tpl && it.tpl.id)) || it.tpl);
  function draw() {
    mount();
    host.style.cssText = mode === 'pick' ? 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147483647' : 'position:fixed;right:16px;bottom:16px;z-index:2147483647';
    if (mode === 'pick') {
      root.innerHTML = `<style>${STYLE}</style><div class="card" style="width:auto;max-width:90vw"><div class="hd"><b>PakkaBill · Click the box for ${esc(pickFor.label)}${pickFor.row ? ' (' + esc(pickFor.row) + ')' : ''}</b><button title="Cancel" data-cancel>×</button></div></div><div class="hl"></div>`;
      root.querySelector('[data-cancel]').onclick = () => { if (endPoint) endPoint(); mode = 'idle'; draw(); };
      return;
    }
    if (!open) {
      root.innerHTML = `<style>${STYLE}</style><button class="mini">PakkaBill auto listing${Q ? ` · ${Q.items.filter(x => S[x.id] && S[x.id].state === 'done').length}/${Q.items.length}` : ''}</button><div class="hl"></div>`;
      root.querySelector('.mini').onclick = () => { open = true; draw(); };
      return;
    }
    const it = Q && Q.items[cur], tpl = tplOf(it), st = it && S[it.id];
    const prodHtml = it ? `<div class="sec">
        <div class="pager"><button class="btn sm" data-prev${cur ? '' : ' disabled'}>‹</button><span class="muted">Product ${cur + 1} of ${Q.items.length}${st ? ` · <span class="tag${st.state === 'done' ? ' ok' : ''}">${st.state === 'done' ? 'Done' : 'Filled'}</span>` : ''}</span><button class="btn sm" data-next${cur < Q.items.length - 1 ? '' : ' disabled'}>›</button></div>
        <div class="prod">${it.prod.photos && it.prod.photos[0] ? `<img src="${it.prod.photos[0].data || it.prod.photos[0]}" alt="">` : ''}<div><b>${esc(C.render((tpl && tpl.title) || '{name}', tpl, it.prod) || it.prod.name || 'Product')}</b><span class="muted">${esc(tpl ? tpl.name : '')}${it.prod.sku ? ' · ' + esc(it.prod.sku) : ''} · ${C.sizesOf(tpl, it.prod).map(s => esc(s.size)).join(', ')} · ${(it.prod.photos || []).length} photo${(it.prod.photos || []).length === 1 ? '' : 's'}</span></div></div>
        <div class="acts"><button class="btn pri" data-fill${busy ? ' disabled' : ''}>Fill this form</button><button class="btn" data-done${busy ? ' disabled' : ''}>Submitted, next ›</button></div>
        <p class="muted" style="margin:8px 0 0">Open <b>Catalog Upload → Add Single Catalog</b>, pick the category <b>${esc((tpl && tpl.category) || '')}</b>, then tap Fill. PakkaBill never submits: check and submit in Meesho.</p>
      </div>` : `<div class="sec"><p style="margin:0">Add products in PakkaBill's <b>Auto listing</b> and tap <b>Send to Meesho</b>. They come here to fill in one click.</p><div class="acts"><a class="btn pri" href="${PB}" target="_blank" rel="noopener">Open PakkaBill</a></div></div>`;
    const missHtml = last && last.missing.length ? `<div class="sec"><b>Not filled yet</b><ul>${last.missing.slice(0, 30).map((m, i) => `<li><span title="${esc(m.value)}">${esc(m.label)}${m.row ? ' (' + esc(m.row) + ')' : ''}: ${esc(m.value)}</span><button class="btn sm" data-point="${i}">Point</button></li>`).join('')}</ul></div>` : '';
    root.innerHTML = `<style>${STYLE}</style><div class="card">
      <div class="hd"><b>PakkaBill · Auto listing</b><button title="Hide" data-min>–</button></div>
      ${prodHtml}
      ${note ? `<div class="sec" style="padding-top:0;border:0"><div class="note">${esc(note)}</div></div>` : ''}
      ${missHtml}
      <div class="sec"><b>Templates</b>
        <div class="acts"><button class="btn sm" data-learn${busy ? ' disabled' : ''}>Save this form as a template</button></div>
        ${T.length ? `<ul>${T.slice(0, 12).map((t, i) => `<li><span title="${esc(t.category)}">${esc(t.name)} <span class="muted">· ${t.fields.length} detail${t.fields.length === 1 ? '' : 's'}, ${t.sizes.length} size${t.sizes.length === 1 ? '' : 's'}</span></span><button class="btn sm" data-tfill="${i}"${busy ? ' disabled' : ''}>Fill</button></li>`).join('')}</ul>` : '<p class="muted" style="margin:6px 0 0">Fill one product in Meesho by hand and save it here, or make templates in PakkaBill.</p>'}
      </div>
      <div class="sec acts"><a class="btn sm" href="${PB}" target="_blank" rel="noopener">Open PakkaBill</a>${Q ? '<button class="btn sm" data-clear>Clear products</button>' : ''}</div>
    </div><div class="hl"></div>`;
    const on = (sel, fn) => { const b = root.querySelector(sel); if (b) b.onclick = fn; };
    on('[data-min]', () => { open = false; draw(); });
    on('[data-prev]', () => { cur = Math.max(0, cur - 1); last = null; note = ''; draw(); });
    on('[data-next]', () => { cur = Math.min(Q.items.length - 1, cur + 1); last = null; note = ''; draw(); });
    on('[data-fill]', () => fillNow(tpl, it.prod, it.id));
    on('[data-done]', async () => {
      S[it.id] = { ...(S[it.id] || {}), state: 'done', at: Date.now() };
      await set({ liststat: S });
      const nx = Q.items.findIndex((x, i) => i > cur && !(S[x.id] && S[x.id].state === 'done'));
      if (nx >= 0) { cur = nx; last = null; note = 'Next product. Open a new Add Single Catalog form and tap Fill.'; } else note = 'All products are done.';
      draw();
    });
    on('[data-learn]', learnForm);
    on('[data-clear]', async () => { if (!confirm('Remove these products from the panel? Templates stay.')) return; Q = null; last = null; note = ''; await set({ listq: null }); draw(); });
    root.querySelectorAll('[data-tfill]').forEach(b => b.onclick = () => fillNow(T[+b.dataset.tfill], { name: '' }, null));
    root.querySelectorAll('[data-point]').forEach(b => b.onclick = () => point(last.missing[+b.dataset.point]));
  }

  async function load() {
    const x = await get(['listq', 'listtpl', 'liststat']);
    T = Array.isArray(x.listtpl) ? x.listtpl : [];
    S = x.liststat || {};
    const q = x.listq;
    Q = q && Array.isArray(q.items) && q.items.length ? q : null;
    if (Q) { const i = Q.items.findIndex(it => !(S[it.id] && S[it.id].state === 'done')); cur = i >= 0 ? i : 0; }
    if (!Q && !shown) open = false; // no products waiting: a small button until the seller opens it
    shown = true;
    draw();
  }
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local' || busy || mode === 'pick') return;
    if (ch.listq || ch.listtpl) { if (ch.listq) { open = true; last = null; note = ''; } load(); }
  });
  // only on Meesho's catalogue pages, or where products are waiting
  const want = () => /catalog|cataloging|upload|product/i.test(location.pathname + location.hash) || Q;
  let seenPath = '';
  setInterval(() => { const p = location.pathname + location.hash; if (p !== seenPath) { seenPath = p; if (want()) { if (shown) draw(); else load(); } else if (host) host.remove(); } }, 1500);
  get(['listq']).then(x => { if (want() || (x.listq && x.listq.items && x.listq.items.length)) load(); });
  window.PBListPage = { scan, readValue, fill, learnForm, category }; // for checks in the browser console
})();
