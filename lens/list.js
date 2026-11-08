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
  // Meesho marks a required box with * by its label (or the page marks it required).
  function requiredOf(el, label) {
    if (el.required || el.getAttribute('aria-required') === 'true') return true;
    if (el.labels && el.labels[0] && /\*/.test(el.labels[0].textContent)) return true;
    const want = C.norm(label);
    for (let e = el.parentElement, n = 0; e && e !== document.body && n < 4; e = e.parentElement, n++) {
      if ([...e.querySelectorAll('input,textarea,select,[role=combobox]')].filter(x => x !== el && !el.contains(x) && x.type !== 'hidden').length > 1) break; // reached other fields
      const raw = (e.textContent || '').slice(0, 160);
      if (want && C.norm(raw).includes(want)) return /\*/.test(raw);
    }
    return false;
  }
  // The size a control belongs to, when it sits in a row of the size table.
  function rowOf(el) {
    const td = el.closest('td');
    if (!td) return '';
    const row = td.parentElement, first = row.cells[0];
    if (!first || first === td || first.querySelector('input,textarea,select')) return '';
    return clean(first.textContent);
  }
  // The sizes chosen on the form, read from its Size box.
  function sizesShown(out) {
    const f = out.find(x => !x.row && C.canon(x.label) === 'size' && x.kind !== 'text');
    if (!f) return [];
    const v = readValue(f);
    return (Array.isArray(v) ? v : C.splitMulti(v)).filter(z => C.sizeKey(z));
  }
  // A size named in a box: "M", "Size: M", "XXL".
  function sizeIn(box, sizes) {
    for (const e of [box, ...box.querySelectorAll('*')]) {
      if (e.matches('input,textarea,select,option,script,style') || [...e.children].some(c => clean(c.textContent))) continue;
      const t = clean(e.textContent);
      if (!t || t.length > 30) continue;
      const z = sizes.find(x => C.norm(x) === C.norm(t) || C.sameSize(x, t));
      if (z) return z;
    }
    return '';
  }
  // Price, MRP, stock and SKU boxes that are not in a table: each size's boxes sit in a block that
  // names the size ("Size: M"), else they come in the order of the sizes. A single box is for all.
  function assignRows(out, sizes) {
    if (!sizes || !sizes.length) return;
    const groups = {};
    out.forEach(f => { if (!f.row && (f.kind === 'text' || f.kind === 'combo')) { const k = C.rowKeyOf(f.label); if (k) (groups[k] = groups[k] || []).push(f); } });
    for (const k in groups) {
      const g = groups[k];
      if (g.length === 1) { g[0].row = '*'; continue; }
      g.forEach(f => {
        let b = f.el;
        while (b.parentElement && b.parentElement !== document.body && !g.some(o => o !== f && b.parentElement.contains(o.el))) b = b.parentElement;
        f.row = sizeIn(b, sizes);
      });
      if (g.some(f => !f.row) && g.length === sizes.length) g.forEach((f, i) => { f.row = C.sortSizes(sizes)[i]; });
      g.forEach(f => { if (!f.row) f.row = '?'; }); // not known: never filled with another size's price
    }
  }
  // A box that opens a list but is not a real input: Meesho's own drop-downs are often a plain div
  // ("Select" and an arrow) with a class like "dropdown" or "select-box".
  const DROP_CLASS = /^(?:[a-z0-9]+[-_]+)*(?:select|dropdown|drop-down|picker|combobox)(?:[-_]+(?:box|input|control|trigger|field|container|wrapper|button|toggle|header|main|root))?$|^[A-Za-z]*(?:Select|Dropdown|DropDown|Picker|Combobox)(?:Box|Input|Control|Trigger|Field|Container|Wrapper|Button|Toggle|Header|Root)?$/i;
  const INNER_CTRL = 'input:not([type=hidden]):not([aria-hidden=true]),textarea,select,[role=combobox],[role=listbox]';
  function dropLike(el) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return false;
    const ex = el.getAttribute('aria-expanded'), hp = el.getAttribute('aria-haspopup');
    const byAttr = (hp && hp !== 'false') || ex === 'true' || ex === 'false';
    const byClass = [...el.classList].some(c => DROP_CLASS.test(c));
    if (!byAttr && !byClass) return false;
    if (el.querySelector(INNER_CTRL)) return false; // the input inside is the field
    const b = el.getBoundingClientRect();
    return b.height >= 18 && b.height <= 90 && b.width >= 40;
  }
  // A text box that is really a search list ("Select", "Search", or marked as opening a list).
  const softCombo = el => /^\s*(select|choose|search|pick|type to search)/i.test(el.getAttribute('placeholder') || '') || el.hasAttribute('aria-expanded') || (el.getAttribute('aria-haspopup') || 'false') !== 'false';
  function kindOf(el) {
    if (el.tagName === 'SELECT') return 'select';
    if (el.tagName === 'TEXTAREA') return 'text';
    if (el.tagName === 'INPUT') {
      const t = (el.type || 'text').toLowerCase();
      if (t === 'file') return 'file';
      if (t === 'radio') return 'radio';
      if (t === 'checkbox') return 'checkbox';
      if (!['text', 'number', 'tel', 'email', 'url', 'search', ''].includes(t)) return null;
      if (el.readOnly) return 'pick'; // a read-only box that opens a list on click
      if (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete') === 'list' || softCombo(el)) return 'combo';
      return 'text';
    }
    if (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-haspopup') === 'listbox' || dropLike(el)) return 'pick';
    return null;
  }
  const FIELD_SEL = 'input,textarea,select,[role=combobox],[aria-haspopup],[aria-expanded],[class*="select" i],[class*="dropdown" i],[class*="picker" i]';
  // Every field on the page: { i, el, kind, label, row, multi, required }
  function scan(sizes) {
    const out = [], radios = new Map(), picks = [];
    const els = document.querySelectorAll(FIELD_SEL);
    for (const el of els) {
      if (mine(el) || el.disabled || el.readOnly && el.tagName === 'TEXTAREA') continue;
      if (el.getAttribute('aria-hidden') === 'true' || el.classList.contains('MuiSelect-nativeInput') || el.type === 'hidden') continue;
      if (el.closest('[role=listbox],[role=menu],[role=dialog][aria-label*="PakkaBill"],header,nav')) continue;
      const kind = kindOf(el);
      if (!kind) continue;
      if (kind !== 'file' && kind !== 'radio' && !visible(el)) continue;
      // one drop-down box, not the box and the boxes inside it
      if (kind === 'pick' && el.tagName !== 'INPUT') { if (picks.some(p => p.contains(el))) continue; picks.push(el); }
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
      out.push({ el, kind, label, row: rowOf(el), soft: kind === 'combo' && el.getAttribute('role') !== 'combobox' && el.getAttribute('aria-autocomplete') !== 'list', multi: !!(root && root.querySelector('.MuiChip-root')) || el.multiple || el.getAttribute('aria-multiselectable') === 'true', required: requiredOf(el, label) });
    }
    out.forEach((f, i) => { f.i = i; });
    assignRows(out, sizes || sizesShown(out));
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
    if (f.kind === 'pick') { const c = chips(el); return c.length ? c : el.tagName === 'INPUT' ? el.value : clean(el.textContent); }
    if (f.kind === 'radio') { const r = f.radios.find(x => x.checked); return r ? clean((r.closest('label') || r.parentElement).textContent) : ''; }
    if (f.kind === 'checkbox') return el.checked ? 'Yes' : '';
    return '';
  }

  /* ---------- filling ---------- */

  // Waits for fn() to give something, checking every 30 ms; null after ms.
  async function until(fn, ms) {
    const t0 = Date.now();
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() - t0 >= ms) return null;
      await sleep(30);
    }
  }
  function setNative(el, v) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // A real press, the events a finger or mouse makes: pointer, mouse and click. Many drop-downs open on
  // pointerdown or mousedown only and ignore a bare click().
  function press(el, parts = 'down up click') {
    const b = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, composed: true, view: window, button: 0, buttons: 1, clientX: b.left + Math.min(b.width / 2, 40), clientY: b.top + b.height / 2, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    const P = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
    if (parts.includes('down')) {
      el.dispatchEvent(new P('pointerover', o)); el.dispatchEvent(new MouseEvent('mouseover', o));
      el.dispatchEvent(new P('pointerdown', o));
      if (el.dispatchEvent(new MouseEvent('mousedown', o)) && el.focus) try { el.focus({ preventScroll: true }); } catch (e) { /* not focusable */ }
    }
    const up = { ...o, buttons: 0 };
    if (parts.includes('up')) { el.dispatchEvent(new P('pointerup', up)); el.dispatchEvent(new MouseEvent('mouseup', up)); }
    if (parts.includes('click')) el.dispatchEvent(new MouseEvent('click', up));
  }
  const CODES = { ArrowDown: 40, Enter: 13, ' ': 32, Escape: 27 };
  function key(el, k) {
    const o = { key: k, code: k === ' ' ? 'Space' : k, keyCode: CODES[k], which: CODES[k], bubbles: true, cancelable: true, composed: true };
    el.dispatchEvent(new KeyboardEvent('keydown', o));
    el.dispatchEvent(new KeyboardEvent('keyup', o));
  }

  // The options of an open list, however the page builds them: ARIA options, list items or "option"
  // classes. Only options that were not on screen before the list was opened count, so the page's
  // own menus and lists are never picked.
  const ROLE_OPT = '[role=option],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=treeitem]';
  const LOOSE_OPT = 'li,[class*="option" i],[class*="menu-item" i],[class*="menuitem" i],[class*="dropdown-item" i],[class*="list-item" i],[class*="listitem" i]';
  const ANY_OPT = ROLE_OPT + ',' + LOOSE_OPT;
  function optionEls() {
    const out = [];
    for (const o of document.querySelectorAll(ANY_OPT)) {
      if (mine(o) || o.closest('header,nav')) continue;
      const role = o.matches(ROLE_OPT);
      if (o.querySelector(role ? ROLE_OPT : ANY_OPT)) continue; // the innermost one
      if (o.querySelector('input:not([type=checkbox]):not([type=radio]),textarea,select')) continue;
      const t = clean(o.textContent);
      if (!t || t.length > 120 || !visible(o)) continue;
      out.push(o);
    }
    return out;
  }
  const textOf = o => clean(o.textContent);
  // Everything the page adds, so a list built from plain boxes (no "option" names at all) is still
  // found: it is what appeared after the drop-down was pressed.
  const ADDED = [];
  new MutationObserver(ms => {
    const t = Date.now();
    for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && !mine(n)) ADDED.push([t, n]);
    if (ADDED.length > 4000) ADDED.splice(0, ADDED.length - 2000);
  }).observe(document.documentElement, { childList: true, subtree: true });
  const NOT_OPT = /^(apply|done|ok|okay|cancel|clear|clear all|reset|close|select all|search|save|no options?|no results?( found)?|loading\W*)$/i;
  function popupOpts(since, el) {
    const roots = [];
    for (let k = ADDED.length - 1; k >= 0 && ADDED[k][0] >= since; k--) {
      const n = ADDED[k][1];
      // not new form boxes (the size table), which hold several inputs; a list may hold one search box
      if (n.isConnected && !n.contains(el) && !mine(n) && !n.closest('header,nav') && !n.matches('script,style,link') && n.querySelectorAll('input,textarea,select').length <= 1) roots.push(n);
    }
    const top = roots.filter(r => !roots.some(o => o !== r && o.contains(r)) && popupish(r));
    const out = [];
    for (const r of top) {
      if (el.contains(r)) continue;
      for (const e of [r, ...r.querySelectorAll('*')]) {
        if (e.closest('input,textarea,select,button,svg,script,style')) continue;
        const t = clean(e.textContent);
        if (!t || t.length > 120 || NOT_OPT.test(t)) continue;
        if ([...e.children].some(c => !c.matches('svg,input,img') && clean(c.textContent))) continue; // the box with the words itself
        if (!visible(e)) continue;
        out.push(e);
      }
    }
    return out;
  }
  // A list that popped up: floating, put straight in the page, or named like a menu or popover.
  function popupish(r) {
    if (r.parentElement === document.body || r.matches('[role=listbox],[role=menu],[role=dialog],[role=presentation],[role=tooltip]')) return true;
    if (/popover|popper|dropdown|drop-down|menu|options|overlay|portal|listbox|select/i.test((r.getAttribute('class') || '') + ' ' + (r.id || ''))) return true;
    for (let x = r, n = 0; x && n < 3; x = x.firstElementChild, n++) { const p = getComputedStyle(x).position; if (p === 'absolute' || p === 'fixed') return true; }
    return false;
  }
  // A "before" picture: the options already on screen, and the moment, for popupOpts.
  const snap = el => { const b = new Set(optionEls()); b.since = Date.now(); b.el = el; return b; };
  const freshOpts = before => {
    const o = optionEls().filter(x => !before.has(x));
    return o.length || !before.since ? o : popupOpts(before.since, before.el);
  };
  const expanded = el => { const e = el.matches('[aria-expanded]') ? el : el.closest('[aria-expanded]') || el.querySelector('[aria-expanded]'); return !!e && e.getAttribute('aria-expanded') === 'true'; };
  // The arrow of a drop-down, never its clear (×) button.
  function arrowOf(el) {
    const box = el.closest('.MuiAutocomplete-root,.MuiInputBase-root,.MuiFormControl-root') || el.parentElement || el;
    const mui = box.querySelector('.MuiAutocomplete-popupIndicator,.MuiSelect-icon');
    if (mui) return mui;
    const c = [...box.querySelectorAll('button,[class*="indicator" i],[class*="arrow" i],[class*="chevron" i],[class*="caret" i],[class*="icon" i],svg')]
      .filter(x => x !== el && !mine(x) && visible(x) && !/clear|close|remove|delete|cross/i.test((x.getAttribute('class') || '') + ' ' + (x.getAttribute('aria-label') || '') + ' ' + (x.getAttribute('title') || '')));
    return c.pop() || null;
  }
  // Opens the list: each way a drop-down can be opened, until options show.
  async function openList(el, before) {
    const ways = [
      () => press(el),
      () => { const a = arrowOf(el); if (a) press(a); },
      () => { if (el.focus) el.focus(); key(el, 'ArrowDown'); },
      () => key(el, 'Enter'),
      () => { const p = el.parentElement; if (p && p !== document.body) press(p); },
    ];
    for (const w of ways) {
      w();
      // a list that opened but is still loading its options gets longer
      const got = await until(() => { const o = freshOpts(before); return o.length ? o : null; }, 200);
      if (got) return got;
      if (expanded(el)) { const late = await until(() => { const o = freshOpts(before); return o.length ? o : null; }, 2500); if (late) return late; }
    }
    return null;
  }
  const isOn = o => o.getAttribute('aria-selected') === 'true' || o.getAttribute('aria-checked') === 'true' || !!(o.querySelector('input[type=checkbox]:checked,input[type=radio]:checked'));
  async function choose(opts, value, before) {
    let i = opts.findIndex(o => same(textOf(o), value));
    // a long list draws only some rows: scroll it to find the exact one ("Neck 33", not "Neck 3")
    if (i < 0 && before) {
      const sc = scroller(opts[opts.length - 1]);
      if (sc) {
        const top = sc.scrollTop;
        sc.scrollTop = 0; await sleep(50);
        for (let n = 0; n < 80; n++) {
          const now = freshOpts(before), k = now.findIndex(o => same(textOf(o), value));
          if (k >= 0) { opts = now; i = k; break; }
          if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2) break;
          sc.scrollTop += Math.max(sc.clientHeight - 20, 40); await sleep(45);
        }
        if (i < 0) { sc.scrollTop = top; await sleep(50); opts = freshOpts(before); }
      }
    }
    if (i < 0) i = C.matchOption(opts.map(textOf), value);
    if (i < 0) return false;
    const o = opts[i];
    if (isOn(o)) return true;
    o.scrollIntoView({ block: 'nearest' });
    press(o);
    // a list item with a tick box that only the box itself answers to
    const box = o.querySelector('input[type=checkbox],input[type=radio]');
    if (box && !box.checked && document.contains(box)) { await sleep(40); if (document.contains(box) && !box.checked && !isOn(o)) box.click(); }
    return true;
  }
  // The options that hold the value, waiting a moment for a search to come back.
  const matching = (before, v, ms) => until(() => { const o = freshOpts(before); return o.length && C.matchOption(o.map(textOf), v) >= 0 ? o : null; }, ms);
  const freshInput = (beforeIn, el) => [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file])')].find(x => x !== el && !beforeIn.has(x) && !mine(x) && visible(x) && !x.readOnly);
  // Closes the list: an Apply / Done button in it first (size pickers keep ticks until then), then a
  // click outside, then Escape. Never a button outside the list, so nothing is ever submitted.
  // keep: false only looks (Read all drop-downs): Cancel or a click outside, never Apply.
  async function closeList(before, el, keep = true) {
    const o = freshOpts(before);
    if (!o.length) return;
    // closed when the options that were open are gone or hidden
    const gone = () => o.every(x => !x.isConnected || !visible(x)) && !optionEls().some(x => !before.has(x)); // a long list swaps its rows
    let box = o[0];
    for (let n = 0; n < 8 && box.parentElement && box.parentElement !== document.body; n++) {
      box = box.parentElement;
      if (box.contains(el) || box.tagName === 'FORM') break;
      const b = [...box.querySelectorAll('button,[role=button]')].find(x => visible(x) && (keep ? /^(apply|done|ok|okay|save|confirm|select|add)$/i : /^(cancel|close|discard|back)$/i).test(clean(x.textContent)));
      if (b) { press(b); if (await until(gone, 400)) return; break; }
    }
    const ways = [
      () => { const bd = [...document.querySelectorAll('.MuiBackdrop-invisible,.MuiPopover-root>.MuiBackdrop-root,.MuiMenu-root>.MuiBackdrop-root')].filter(visible).pop(); if (bd) press(bd); },
      () => { press(document.body); document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); },
      () => { const x = o.find(y => y.isConnected); if (x) key(x, 'Escape'); },
    ];
    for (const w of ways) { w(); if (await until(gone, 250)) return; }
  }

  // The field shows this value: the same words, or an option that starts with it ("620630 - Blouses").
  // Strict, so "L" is not found inside "Select".
  function same(h, v) {
    const a = C.norm(h), b = C.norm(v);
    if (!a || !b) return false;
    if (a === b || a.replace(/ /g, '') === b.replace(/ /g, '') || a.indexOf(b + ' ') === 0 || C.sameSize(h, v)) return true;
    return /^\d+(\.\d+)?$/.test(b) && parseFloat(a) === parseFloat(b) && /^\d+(\.\d+)?\s*%?$/.test(a);
  }
  const hasVal = (f, v) => { const g = readValue(f); return (Array.isArray(g) ? g : C.splitMulti(g)).some(h => same(h, v)); };
  // A drop-down or a search list: open it, find each value (typing to search when the list is long),
  // choose it, and close the list.
  async function pickValues(f, item) {
    const el = f.el;
    const loose = new Set(optionEls().filter(o => !o.matches(ROLE_OPT)));
    if (freshOpts(loose).length) await closeList(loose, el); // a list left open by the page or a last try
    const before = snap(el), beforeIn = new Set(document.querySelectorAll('input'));
    f.why = '';
    const typeable = el.tagName === 'INPUT' && !el.readOnly;
    let values = item.multi || f.multi ? C.splitMulti(item.value) : [item.value];
    let ok = 0, sawList = false;
    // "Festive, Wedding" is two choices unless the list has one option called that
    if (values.length === 1 && /[,;|]/.test(values[0])) {
      let o = freshOpts(before);
      if (!o.length) { if (typeable) { press(el); setNative(el, ''); o = await until(() => { const x = freshOpts(before); return x.length ? x : null; }, 1200); } else o = await openList(el, before); }
      if (o && o.length) sawList = true;
      const multiList = o && o.some(x => x.closest('[aria-multiselectable=true]'));
      if (!o || multiList || !o.some(x => C.norm(textOf(x)) === C.norm(values[0]))) values = C.splitMulti(values[0]);
    }
    for (let k = 0; k < values.length; k++) {
      const v = values[k];
      if (hasVal(f, v)) { ok++; continue; }
      let opts = freshOpts(before);
      if (typeable) {
        if (!opts.length || C.matchOption(opts.map(textOf), v) < 0) {
          if (!opts.length) press(el);
          setNative(el, v);
          // a box that shows no list at all soon is a plain text box
          if (f.soft && !(await until(() => freshOpts(before).length, 250))) { setNative(el, item.value); return 'text'; }
          opts = await matching(before, v, 1500);
          if (!opts) { setNative(el, String(v).split(/[\s,-]/)[0]); opts = await matching(before, v, 1000); }
          if (!opts) { setNative(el, ''); const a = arrowOf(el); if (a) press(a); opts = await matching(before, v, 800); }
        }
      } else {
        if (!opts.length) opts = await openList(el, before);
        if (opts && C.matchOption(opts.map(textOf), v) < 0) {
          // a long list with a search box of its own
          const s = freshInput(beforeIn, el);
          opts = (await matching(before, v, 300)) || (s ? (setNative(s, v), await matching(before, v, 1500)) : null);
        }
      }
      const seen = opts || freshOpts(before);
      if (seen.length) sawList = true;
      if (!opts) { f.why = seen.length ? `"${v}" is not in the list. The list shows: ${seen.slice(0, 12).map(textOf).join(' | ')}` : 'The list did not open.'; continue; }
      if (await choose(opts, v, before)) {
        ok++;
        if (typeable && values.length > 1) await until(() => hasVal(f, v), 300);
      }
      await until(() => hasVal(f, v), 150);
    }
    await closeList(before, el);
    if (typeable && el.blur) el.blur();
    // a box that looked like a search list but never opened one is a plain text box
    if (!sawList && f.soft) { setNative(el, item.value); return 'text'; }
    if (ok === values.length) return true;
    if (!f.why) f.why = 'Chosen, but the box did not keep it.';
    return false;
  }
  // The scrolling box of a list, to load the rest of a long list.
  function scroller(e) {
    for (let x = e && e.parentElement, n = 0; x && x !== document.body && n < 8; x = x.parentElement, n++) {
      const st = getComputedStyle(x);
      if (x.scrollHeight > x.clientHeight + 4 && /auto|scroll/.test(st.overflowY)) return x;
    }
    return null;
  }
  // Every choice a drop-down offers: opens it, scrolls to the end of a long list, closes it.
  async function readOptions(f) {
    const el = f.el;
    if (f.kind === 'select') return [...el.options].map(o => clean(o.text)).filter(t => t && !/^(select|choose)\b/i.test(t));
    if (f.kind === 'radio') return f.radios.map(r => clean((r.closest('label') || r.parentElement).textContent)).filter(Boolean);
    if (f.kind !== 'pick' && f.kind !== 'combo') return null;
    el.scrollIntoView({ block: 'center' });
    const loose = new Set(optionEls().filter(o => !o.matches(ROLE_OPT)));
    if (freshOpts(loose).length) await closeList(loose, el);
    const before = snap(el), typeable = el.tagName === 'INPUT' && !el.readOnly;
    let opts;
    if (typeable) { press(el); opts = await until(() => { const x = freshOpts(before); return x.length ? x : null; }, 900); if (!opts) { const a = arrowOf(el); if (a) { press(a); opts = await until(() => { const x = freshOpts(before); return x.length ? x : null; }, 900); } } }
    else opts = await openList(el, before);
    if (!opts) { f.why = 'The list did not open.'; return null; }
    const seen = new Set(opts.map(textOf));
    const sc = scroller(opts[opts.length - 1]);
    if (sc) for (let n = 0; n < 60; n++) {
      sc.scrollTop += Math.max(sc.clientHeight - 20, 40);
      await sleep(45);
      const more = freshOpts(before).map(textOf).filter(t => !seen.has(t));
      more.forEach(t => seen.add(t));
      if (!more.length && sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2) break;
    }
    if (sc) { sc.scrollTop = 0; await sleep(50); }
    await closeList(before, el, false);
    if (typeable) { setNative(el, ''); if (el.blur) el.blur(); }
    return [...seen].filter(t => !NOT_OPT.test(t));
  }
  // Did the value stick? Read the field back the way the seller would see it.
  function holds(f, item) {
    const got = readValue(f), want = C.splitMulti(item.value);
    if (f.kind === 'text') return C.norm(got) === C.norm(item.value) || String(got).trim() === String(item.value).trim();
    if (f.kind === 'checkbox') return /^(yes|true|1|y)$/i.test(item.value) === (got === 'Yes');
    const have = Array.isArray(got) ? got : C.splitMulti(got).length > 1 ? C.splitMulti(got) : [got];
    if (have.length === 1 && same(have[0], item.value)) return true;
    if (want.every(v => have.some(h => same(h, v)))) return true;
    // a drop-down that shows "3 selected", or all the choices in one line
    const all = ' ' + C.norm(Array.isArray(got) ? got.join(' ') : got) + ' ';
    return (f.kind === 'pick' || f.kind === 'combo') && (want.every(v => all.includes(' ' + C.norm(v) + ' ')) || (want.length > 1 && all.includes(' ' + want.length + ' selected ')));
  }
  async function fillOne(f, item) {
    const r = await fillTry(f, item);
    if (r === 'text') return true;
    if (!r) return false;
    if (f.kind === 'pick' || f.kind === 'combo') return !!(await until(() => holds(f, item), 250));
    return holds(f, item);
  }
  async function fillTry(f, item) {
    const el = f.el;
    if (f.kind === 'text') { setNative(el, item.value); el.dispatchEvent(new Event('blur', { bubbles: true })); el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); return true; }
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
    if (f.kind === 'pick' || f.kind === 'combo') { el.scrollIntoView({ block: 'center' }); return pickValues(f, item); }
    return false;
  }
  async function putPhotos(photos) {
    const inputs = scan().filter(f => f.kind === 'file');
    // every photo read at once
    const files = await Promise.all(photos.map(async (p, k) => {
      const blob = await (await fetch(p.data || p)).blob();
      return new File([blob], p.name || `photo-${k + 1}.jpg`, { type: blob.type || 'image/jpeg', lastModified: Date.now() });
    }));
    let i = 0, put = 0;
    for (const f of inputs) {
      if (i >= files.length) break;
      const take = f.el.multiple ? files.slice(i) : [files[i]];
      const dt = new DataTransfer();
      take.forEach(x => dt.items.add(x));
      f.el.files = dt.files;
      f.el.dispatchEvent(new Event('input', { bubbles: true }));
      f.el.dispatchEvent(new Event('change', { bubbles: true }));
      i += take.length; put += take.length;
      await sleep(120);
    }
    return put;
  }
  const keyOf = it => C.canon(it.label) + '|' + C.norm(it.row || '');
  const fieldsSig = () => document.querySelectorAll('input,textarea,select,[role=combobox]').length;
  // Fills the form in rounds, as some fields (the size rows) appear only after others are set.
  // Drop-downs go first in each round, as they are what makes new fields appear; each value gets
  // two tries at most, so a field Meesho does not have never slows the form down.
  let LOG = new Map(); // planned value -> { field, ok, why }, for the report
  const OPTS = new WeakMap(); // drop-down -> its choices, read once per page
  async function choicesOf(f) {
    if (OPTS.has(f.el)) return OPTS.get(f.el);
    const o = await readOptions(f);
    OPTS.set(f.el, o);
    return o;
  }
  // The values no label matched: each goes to the drop-down whose own choices hold it, so Meesho's
  // labels do not have to match the template's and nothing has to be pointed at.
  // A drop-down's choices, if read before (this page, or "Read all drop-downs" for this category).
  function knownChoices(f) {
    if (OPTS.has(f.el)) return OPTS.get(f.el);
    const d = SAVED && SAVED.fields && SAVED.fields.find(x => C.labelScore(x.label, f.label) >= 0.9 && x.options && x.options.length);
    return d ? d.options : null;
  }
  async function byChoices(items, done, marks, tpl) {
    const t0 = Date.now();
    const taken = new Set(marks);
    const left = items.filter(it => !done.has(it) && !it.row);
    if (!left.length) return;
    const boxes = scan().filter(f => !f.row && !taken.has(f.el) && ['pick', 'combo', 'select', 'radio'].includes(f.kind));
    const texts = scan().filter(f => !f.row && !taken.has(f.el) && f.kind === 'text' && !f.el.value);
    for (const it of left) {
      if (Date.now() - t0 > 25000) break;
      const want = C.splitMulti(it.value);
      // a box with a similar label first, then any box whose choices hold the value
      const order = boxes.filter(f => !taken.has(f.el) && document.contains(f.el)).sort((a, b) => C.looseScore(b.label, it.label) - C.looseScore(a.label, it.label));
      let hit = null, ok = false;
      // the box with the closest label is simply tried: quicker than reading every list
      const near = order[0] && C.looseScore(order[0].label, it.label) >= 0.5 ? order[0] : null;
      if (near) {
        try { ok = await fillOne(near, it); } catch (e) { ok = false; }
        if (ok) { LOG.set(it, { field: near.label + ' [' + near.kind + '] by a similar label', ok }); done.add(it); marks.push(near.el); taken.add(near.el); continue; }
      }
      for (const f of order) {
        if (f === near) continue;
        if (Date.now() - t0 > 4000) break;
        const o = knownChoices(f);
        if (!o || !o.length) continue;
        const has = v => o.some(x => same(x, v));
        if (has(it.value) || (want.length > 1 && want.every(has))) { hit = f; break; }
      }
      if (!hit) {
        const tf = texts.filter(f => !taken.has(f.el) && C.looseScore(f.label, it.label) >= 0.7);
        if (tf.length === 1) hit = tf[0];
      }
      if (!hit) continue;
      try { ok = await fillOne(hit, it); } catch (e) { ok = false; }
      LOG.set(it, { field: hit.label + ' [' + hit.kind + '] by its choices', ok, why: ok ? '' : hit.why || 'The value did not stay.' });
      if (ok) { done.add(it); marks.push(hit.el); taken.add(hit.el); }
    }
  }
  // Sizes shown as buttons or tick boxes on the form itself (no drop-down): press each size.
  async function sizeButtons(sizes) {
    if (!sizes.length) return false;
    const CL = 'label,button,[role=button],[role=checkbox],[role=option],[class*="chip" i],[class*="tag" i],[class*="pill" i],li,div,span';
    const near = e => { for (let x = e, n = 0; x && n < 5; x = x.parentElement, n++) if (/\bsizes?\b/i.test(clean(x.textContent).slice(0, 200))) return true; return false; };
    const on = e => e.getAttribute('aria-checked') === 'true' || e.getAttribute('aria-pressed') === 'true' || e.getAttribute('aria-selected') === 'true' || !!e.querySelector('input:checked') || /\b(selected|active|checked)\b/i.test(e.getAttribute('class') || '');
    const picks = [];
    for (const z of sizes) {
      const c = [...document.querySelectorAll(CL)].filter(e => !mine(e) && visible(e) && !e.closest('td,[role=listbox],header,nav') && !e.querySelector('input:not([type=checkbox]):not([type=radio]),textarea,select') && (C.norm(clean(e.textContent)) === C.norm(z) || C.sameSize(clean(e.textContent), z)) && clean(e.textContent).length <= 30);
      // the outermost box with just that size's name, near the word Size
      const cand = c.filter(near);
      if (!cand.length) return false;
      picks.push(cand.find(x => !cand.some(o => o !== x && o.contains(x))));
    }
    for (const e of picks) if (!on(e)) { press(e); await sleep(60); }
    return true;
  }
  async function fill(tpl, prod, again) {
    const items = C.plan(tpl, prod), done = new Set(), tries = new Map(), marks = [];
    const planSizes = C.sizesOf(tpl, prod).map(z => z.size), star = new Set();
    if (!again) LOG = new Map();
    else items.forEach(it => { if (it.size) done.add(it); }); // sizes pressed already
    const points = (tpl && tpl.points) || {};
    for (let round = 0; round < 5 && done.size < items.length; round++) {
      const fields = scan(planSizes), used = {}, sig = fieldsSig(), work = [];
      for (const it of items) {
        if (done.has(it) || (tries.get(it) || 0) >= 2) continue;
        let f = null;
        const p = points[keyOf(it)];
        if (p) { const el = byPath(p); if (el) f = fields.find(x => x.el === el || (x.radios && x.radios.includes(el))) || (kindOf(el) ? { el, kind: kindOf(el), label: it.label, row: it.row } : null); }
        if (!f) f = C.bestField(it, fields, used);
        if (!f) { LOG.set(it, { field: '', why: it.row ? 'No ' + it.label + ' box for size ' + it.row + '.' : 'No box with this label.' }); continue; }
        if (f.row === '*' && star.has(f.el)) { LOG.set(it, { field: f.label, why: 'One box for all sizes, and the sizes have different values.' }); tries.set(it, 9); continue; }
        if (f.i != null) used[f.i] = true;
        work.push([it, f]);
      }
      const opens = k => (k === 'pick' || k === 'combo' || k === 'radio' || k === 'select' ? 0 : 1);
      work.sort((a, b) => opens(a[1].kind) - opens(b[1].kind));
      let gained = 0, opened = 0, failed = 0;
      for (const [it, f] of work) {
        if (!document.contains(f.el)) continue; // re-drawn by the page; found again next round
        tries.set(it, (tries.get(it) || 0) + 1);
        let ok = false;
        try { ok = await fillOne(f, it); } catch (e) { ok = false; f.why = 'Error: ' + e.message; }
        LOG.set(it, { field: f.label + ' [' + f.kind + ']', ok, why: ok ? '' : f.why || 'The value did not stay.' });
        if (ok) {
          done.add(it); marks.push(f.el); gained++; if (opens(f.kind) === 0) opened++;
          // one Price box for all sizes: every size with the same price is done
          if (f.row === '*') { star.add(f.el); items.forEach(x => { if (x.col === it.col && x.value === it.value) { done.add(x); LOG.set(x, { field: f.label + ' (all sizes)', ok: true }); } }); }
        } else if (/did not keep|did not stay|Error/.test(f.why || '') || !document.contains(f.el)) failed++;
        else tries.set(it, 9); // not in the list, or the list does not open: trying again only costs time
      }
      if (done.size >= items.length) break;
      // only a drop-down makes new fields appear (the size table): wait for them only then
      const grew = opened ? await until(() => fieldsSig() !== sig, 1200) : fieldsSig() !== sig;
      if (!grew && !failed) break;
      if (grew) await sleep(100);
    }
    const sz = items.find(it => it.size);
    const sig0 = fieldsSig();
    if (sz && !again && !done.has(sz) && await sizeButtons(planSizes)) {
      done.add(sz); LOG.set(sz, { field: 'size buttons', ok: true });
      if (await until(() => fieldsSig() !== sig0, 2500)) await sleep(150); // the size boxes appear
      return fill(tpl, prod, true);
    }
    if (done.size < items.length) await byChoices(items, done, marks, tpl);
    let photos = 0;
    if (prod && prod.photos && prod.photos.length) photos = await putPhotos(prod.photos);
    flash(marks);
    // Meesho's required boxes the template has nothing for: shown, so nothing is forgotten
    const want = new Set(items.map(it => C.canon(it.label)));
    const empty = [...new Set(scan(planSizes).filter(f => f.required && f.kind !== 'file' && !f.row && !want.has(C.canon(f.label)) && C.canon(f.label) !== 'size' && !String(readValue(f) || '').replace(/^(select|choose)\b.*$/i, '').trim()).map(f => f.label))];
    return { total: items.length, filled: done.size, missing: items.filter(it => !done.has(it)), photos, empty };
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
      // Meesho's own drop-down: a plain box, found from where the seller clicked
      if (!el || !kindOf(el)) for (let x = e.target, n = 0; x && x !== document.body && n < 6; x = x.parentElement, n++) if (x.nodeType === 1 && kindOf(x) === 'pick') { el = x; break; }
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
    await readAll(tpl.id);
    note = `Template "${tpl.name}" saved: ${tpl.fields.length} detail${tpl.fields.length === 1 ? '' : 's'} and ${tpl.sizes.length} size${tpl.sizes.length === 1 ? '' : 's'}. It is in PakkaBill's Auto listing too. Next time, add products there and fill in one click.`;
    draw();
  }
  // Reads every drop-down on the form with all its choices. They are saved on the template, so
  // PakkaBill's Auto listing offers Meesho's exact choices for each detail.
  let FORM = null; // [{ label, kind, multi, options }]
  let SAVED = null; // the last "Read all drop-downs", kept in the extension
  async function readAll(tplId) {
    if (busy) return;
    busy = true; note = 'Reading every drop-down… keep this tab in front.'; draw();
    const out = [];
    try {
      for (const f of scan()) {
        // not Size: its picker makes the size table, and reading it could clear the sizes
        if (f.row || C.canon(f.label) === 'size' || !['pick', 'combo', 'select', 'radio'].includes(f.kind) || !document.contains(f.el)) continue;
        const keep = f.kind === 'pick' || f.kind === 'combo' ? readValue(f) : null;
        const o = await choicesOf(f);
        out.push({ label: f.label, kind: f.kind, multi: !!f.multi, options: o || [], why: o ? '' : f.why || '' });
        if (keep && C.norm(String(keep)) !== C.norm(String(readValue(f)))) f.why = 'Reading changed the value.';
      }
    } finally { busy = false; }
    FORM = out;
    SAVED = { at: Date.now(), cat: category(), fields: out };
    const id = tplId || (last && last.tplId) || (Q && Q.items[cur] && tplOf(Q.items[cur]) && tplOf(Q.items[cur]).id);
    const k = T.findIndex(t => t.id === id);
    let added = 0;
    if (k >= 0) {
      const t = { ...T[k], fields: (T[k].fields || []).map(x => ({ ...x })), updatedAt: Date.now() };
      out.forEach(d => {
        if (!d.options.length || C.canon(d.label) === 'size') return;
        let fl = t.fields.find(x => C.labelScore(x.label, d.label) >= 0.9);
        if (!fl) { fl = { label: d.label, value: '' }; t.fields.push(fl); added++; }
        fl.opts = d.options.slice(0, 400);
        if (d.multi) fl.multi = true;
      });
      T[k] = t;
      if (Q) Q.items.forEach(x => { if (x.tpl && x.tpl.id === t.id) x.tpl = t; });
    }
    await set(Q ? { listtpl: T, listq: Q, listform: { at: Date.now(), cat: category(), fields: out } } : { listtpl: T, listform: { at: Date.now(), cat: category(), fields: out } });
    const read = out.filter(d => d.options.length).length;
    note = `Read ${read} of ${out.length} drop-down${out.length === 1 ? '' : 's'}` + (k >= 0 ? `. Saved their choices on template "${T[k].name}"${added ? ` (${added} new detail${added > 1 ? 's' : ''} to fill in PakkaBill)` : ''}.` : '. Pick a product or save a template to keep them.') + (read < out.length ? ' Some did not open: tap "Copy form report" and send it to PakkaBill support.' : '');
    draw();
    return out;
  }
  // Everything PakkaBill sees on this form, without any values typed by the seller, to send to support.
  function report() {
    const strip = h => String(h).replace(/\svalue="[^"]*"/g, '').replace(/<(svg|path)[^>]*>[\s\S]*?<\/\1>/g, '<svg/>').replace(/\s+/g, ' ').slice(0, 400);
    const lines = ['PakkaBill Lens ' + chrome.runtime.getManifest().version + ' form report', 'Page: ' + location.pathname, 'Category: ' + category(),
      'Frames: ' + document.querySelectorAll('iframe').length + ', shadow roots: ' + [...document.querySelectorAll('*')].filter(e => e.shadowRoot && !mine(e)).length, ''];
    lines.push('FIELDS');
    scan().forEach(f => {
      const el = f.el, a = [...(el.attributes || [])].filter(x => /^(role|aria-|type|readonly|placeholder|name|class|id|data-testid)/.test(x.name)).map(x => x.name + '="' + String(x.value).slice(0, 60) + '"').join(' ');
      const box = el.closest('.MuiFormControl-root,[class*="FormControl"],[class*="form-group"],td') || el.parentElement || el;
      lines.push(`- ${f.label || '(no label)'}${f.row ? ' (' + f.row + ')' : ''} [${f.kind}${f.multi ? ', multi' : ''}] <${el.tagName.toLowerCase()} ${a}>`);
      if (f.kind === 'pick' || f.kind === 'combo') lines.push('    html: ' + strip(box.outerHTML));
    });
    if (FORM) { lines.push('', 'DROP-DOWNS READ'); FORM.forEach(d => lines.push(`- ${d.label} [${d.kind}]: ${d.options.length} choices${d.options.length ? ': ' + d.options.slice(0, 15).join(' | ') : ''}${d.why ? ' (' + d.why + ')' : ''}`)); }
    if (LOG.size) { lines.push('', 'LAST FILL'); LOG.forEach((r, it) => lines.push(`- ${it.label}${it.row ? ' (' + it.row + ')' : ''} = ${String(it.value).slice(0, 60)} -> ${r.field || 'no box'}: ${r.ok ? 'filled' : 'NOT filled. ' + r.why}`)); }
    // what a list looks like when it is open: the first drop-down still unread is not opened here
    return lines.join('\n');
  }
  async function copyReport() {
    const t = report();
    try { await navigator.clipboard.writeText(t); }
    catch (e) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); }
    note = 'Form report copied (no prices, photos or login). Paste it in a message to PakkaBill support.';
    draw();
  }
  async function fillNow(tpl, prod, id) {
    if (busy) return;
    busy = true; note = 'Filling… keep this tab in front.'; draw();
    const t0 = Date.now();
    const r = await fill(tpl, prod);
    busy = false;
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    last = { missing: r.missing, tplId: tpl && tpl.id };
    note = `Filled ${r.filled} of ${r.total} in ${secs} s${r.photos ? ` and ${r.photos} photo${r.photos > 1 ? 's' : ''}` : ''}.` + (r.missing.length ? ' Point to the ones left, or fill them by hand.' : ' Check the form, then submit it in Meesho.');
    // the empty required boxes go on the template (with Meesho's choices when read), to fill in PakkaBill
    if (r.empty.length && tpl) {
      const k = T.findIndex(t => t.id === tpl.id);
      if (k >= 0) {
        const t = { ...T[k], fields: (T[k].fields || []).slice(), updatedAt: Date.now() };
        r.empty.forEach(l => { if (!t.fields.some(f => C.labelScore(f.label, l) >= 0.9)) { const d = SAVED && SAVED.fields && SAVED.fields.find(x => C.labelScore(x.label, l) >= 0.9); t.fields.push(d && d.options.length ? { label: l, value: '', opts: d.options.slice(0, 400) } : { label: l, value: '' }); } });
        T[k] = t;
        await set({ listtpl: T });
      }
      note += ` Meesho also needs: ${r.empty.slice(0, 8).join(', ')}${r.empty.length > 8 ? '…' : ''}. Fill them here; they are added to the template in PakkaBill for next time.`;
    }
    if (id) { S[id] = { state: 'filled', filled: r.filled, total: r.total, missing: r.missing.map(m => m.label + (m.row ? ' (' + m.row + ')' : '')), empty: r.empty, at: Date.now() }; await set({ liststat: S }); }
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
        <p class="muted" style="margin:8px 0 0">Keys: <b>Alt+Shift+F</b> fill, <b>Alt+Shift+N</b> next. Open <b>Catalog Upload → Add Single Catalog</b>, pick the category <b>${esc((tpl && tpl.category) || '')}</b>, then tap Fill. PakkaBill never submits: check and submit in Meesho.</p>
      </div>` : `<div class="sec"><p style="margin:0">Add products in PakkaBill's <b>Auto listing</b> and tap <b>Send to Meesho</b>. They come here to fill in one click.</p><div class="acts"><a class="btn pri" href="${PB}" target="_blank" rel="noopener">Open PakkaBill</a></div></div>`;
    const missHtml = last && last.missing.length ? `<div class="sec"><b>Not filled yet</b><ul>${last.missing.slice(0, 30).map((m, i) => `<li><span title="${esc(m.value)}">${esc(m.label)}${m.row ? ' (' + esc(m.row) + ')' : ''}: ${esc(m.value)}</span><button class="btn sm" data-point="${i}">Point</button></li>`).join('')}</ul></div>` : '';
    root.innerHTML = `<style>${STYLE}</style><div class="card">
      <div class="hd"><b>PakkaBill · Auto listing</b><button title="Hide" data-min>–</button></div>
      ${prodHtml}
      ${note ? `<div class="sec" style="padding-top:0;border:0"><div class="note">${esc(note)}</div></div>` : ''}
      ${missHtml}
      <div class="sec"><b>Templates</b>
        <div class="acts"><button class="btn sm" data-learn${busy ? ' disabled' : ''}>Save this form as a template</button><button class="btn sm" data-readall${busy ? ' disabled' : ''}>Read all drop-downs</button><button class="btn sm" data-report>Copy form report</button></div>
        ${FORM ? `<details style="margin-top:6px"><summary class="muted">${FORM.length} drop-down${FORM.length === 1 ? '' : 's'} on this form</summary><ul>${FORM.map(d => `<li><span title="${esc(d.options.join(', '))}">${esc(d.label)}: <span class="muted">${d.options.length ? d.options.length + ' choices · ' + esc(d.options.slice(0, 4).join(', ')) : 'did not open'}</span></span></li>`).join('')}</ul></details>` : ''}
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
    on('[data-readall]', () => readAll());
    on('[data-report]', copyReport);
    on('[data-clear]', async () => { if (!confirm('Remove these products from the panel? Templates stay.')) return; Q = null; last = null; note = ''; await set({ listq: null }); draw(); });
    root.querySelectorAll('[data-tfill]').forEach(b => b.onclick = () => fillNow(T[+b.dataset.tfill], { name: '' }, null));
    root.querySelectorAll('[data-point]').forEach(b => b.onclick = () => point(last.missing[+b.dataset.point]));
  }

  async function load() {
    const x = await get(['listq', 'listtpl', 'liststat', 'listform']);
    SAVED = x.listform || null;
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
  // Alt+Shift+F fills the form, Alt+Shift+N marks it submitted and goes to the next product.
  document.addEventListener('keydown', e => {
    if (!e.altKey || !e.shiftKey || !root) return;
    const k = e.code === 'KeyF' ? '[data-fill]' : e.code === 'KeyN' ? '[data-done]' : null;
    const b = k && root.querySelector(k);
    if (b && !b.disabled) { e.preventDefault(); b.click(); }
  }, true);
  window.PBListPage = { scan, readValue, fill, learnForm, category, readAll, report, readOptions }; // for checks in the browser console
})();
