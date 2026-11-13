// PakkaBill: Label cropper (#/crop, under "More tools").
// Shipping-label PDFs often have a big empty white area under the label. This cuts it off: every page is
// drawn on a canvas, the lowest non-white pixel is found and the page is cut just below it (or on all
// four sides, if chosen). Only the page's MediaBox / CropBox change, so the text and barcodes stay
// sharp and exactly as they were. Rotated pages are cut along their visual bottom.
// Everything runs in the browser with the app's own PDF.js and pdf-lib (labels-libs.js, loaded only
// when this page opens): files never leave the device.
// The app calls window.pbCropMount(el) when #/crop opens. window.PBCrop is the engine (no DOM).
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;

  /* ======================================================= engine (no DOM) */

  const WHITE = 235;        // a pixel darker than this in any channel is content
  const MIN_DOTS = 2;       // a row/column needs this many dark pixels (ignores single specks of noise)
  const MAX_SIDE = 2600;    // longest side of the check canvas in pixels (keeps phones from running out of memory)
  const MIN_SIZE = 18;      // never cut a page smaller than this many points on a side

  // Scan RGBA pixels for the box that holds content. Returns pixel edges (right/bottom exclusive) or null.
  function contentBox(data, width, height, white, minDots) {
    white = white == null ? WHITE : white;
    minDots = minDots == null ? MIN_DOTS : minDots;
    const rows = new Uint32Array(height), cols = new Uint32Array(width);
    for (let y = 0; y < height; y++) {
      let i = y * width * 4, n = 0;
      for (let x = 0; x < width; x++, i += 4) {
        if (data[i] < white || data[i + 1] < white || data[i + 2] < white) { n++; cols[x]++; }
      }
      rows[y] = n;
    }
    let top = 0, bottom = height - 1, left = 0, right = width - 1;
    while (top < height && rows[top] < minDots) top++;
    if (top >= height) return null; // blank page
    while (bottom > top && rows[bottom] < minDots) bottom--;
    while (left < width && cols[left] < minDots) left++;
    while (right > left && cols[right] < minDots) right--;
    if (left >= width) { left = 0; right = width - 1; }
    return { top: top, bottom: bottom + 1, left: left, right: right + 1 };
  }

  // The new box in visual points (origin top-left of the page as shown, y down).
  // vw, vh: page size as shown; box: content in visual points; gap: points kept around it.
  function cutBox(vw, vh, box, gap, all) {
    let x0 = 0, y0 = 0, x1 = vw, y1 = Math.min(vh, box.bottom + gap);
    if (all) {
      x0 = Math.max(0, box.left - gap);
      x1 = Math.min(vw, box.right + gap);
      y0 = Math.max(0, box.top - gap);
    }
    // never smaller than MIN_SIZE (grow back towards the original edges)
    if (x1 - x0 < MIN_SIZE) { const c = (x0 + x1) / 2; x0 = Math.max(0, c - MIN_SIZE / 2); x1 = Math.min(vw, x0 + MIN_SIZE); }
    if (y1 - y0 < MIN_SIZE) { y1 = Math.min(vh, y0 + MIN_SIZE); if (y1 - y0 < MIN_SIZE) y0 = Math.max(0, y1 - MIN_SIZE); }
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }

  // Visual (as shown, y down, unscaled) point → PDF user space, for a page whose visible box is
  // view = [vx0, vy0, vx1, vy1] and whose /Rotate is rot (0, 90, 180, 270). Same maths as PDF.js.
  function toPdf(view, rot, x, y) {
    const [a, b, c, d] = view, W = c - a, H = d - b;
    switch (((rot % 360) + 360) % 360) {
      case 90: return [a + y, b + x];
      case 180: return [a + (W - x), b + y];
      case 270: return [a + (W - y), b + (H - x)];
      default: return [a + x, b + (H - y)];
    }
  }
  function visualSize(view, rot) {
    const W = view[2] - view[0], H = view[3] - view[1];
    return (((rot % 360) + 360) % 360) % 180 ? [H, W] : [W, H];
  }
  // Visual cut box → PDF rectangle [x, y, w, h], clamped to the visible box.
  function pdfRect(view, rot, cut) {
    const p = toPdf(view, rot, cut.x0, cut.y0), q = toPdf(view, rot, cut.x1, cut.y1);
    let x0 = Math.max(view[0], Math.min(p[0], q[0])), x1 = Math.min(view[2], Math.max(p[0], q[0]));
    let y0 = Math.max(view[1], Math.min(p[1], q[1])), y1 = Math.min(view[3], Math.max(p[1], q[1]));
    const r = (v) => Math.round(v * 100) / 100;
    return [r(x0), r(y0), r(x1 - x0), r(y1 - y0)];
  }

  root.PBCrop = { contentBox, cutBox, toPdf, visualSize, pdfRect, WHITE, MIN_SIZE };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PBCrop;
  if (typeof document === 'undefined') return;

  /* ======================================================= page */

  const S = {
    gap: 8,          // points kept around the label
    all: false,      // also cut top and sides
    files: [],       // { id, file, name, status: 'wait'|'work'|'done'|'err', msg, out, thumbs, pages, cut, size }
    run: 0,          // bumps when settings change, so an old run stops
    busy: false,
    note: '',
  };
  try {
    const g = localStorage.getItem('pb-crop-gap'), n = Number(g);
    if (g !== null && g !== '' && Number.isFinite(n) && n >= 0 && n <= 40) S.gap = Math.round(n);
    S.all = localStorage.getItem('pb-crop-all') === '1';
  } catch (e) { /* ignore */ }
  let el = null, nextId = 1, libs = null;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const kb = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const isPdf = (f) => /pdf$/i.test(f.type || '') || /\.pdf$/i.test(f.name || '');
  const outName = (n) => String(n || 'labels').replace(/\.pdf$/i, '') + '-cropped.pdf';

  function loadLibs() {
    const ready = () => root.pdfjsLib && root.PDFLib;
    const done = () => { root.pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'; };
    if (ready()) { done(); return Promise.resolve(); }
    if (libs) return libs;
    libs = new Promise((ok, no) => {
      let s = document.querySelector('script[data-pb-labels-libs]');
      if (!s) {
        s = document.createElement('script');
        s.src = '/labels-libs.js';
        s.setAttribute('data-pb-labels-libs', '1');
        document.head.appendChild(s);
      }
      let n = 0;
      const iv = setInterval(() => {
        if (ready()) { clearInterval(iv); done(); ok(); }
        else if (++n > 300) { clearInterval(iv); no(new Error('The PDF tools did not load. Check your internet and try again.')); }
      }, 100);
      s.addEventListener('error', () => { clearInterval(iv); no(new Error('The PDF tools did not load. Check your internet and try again.')); });
    });
    libs.catch(() => {
      libs = null;
      const s = document.querySelector('script[data-pb-labels-libs]');
      if (s && !ready()) s.remove();
    });
    return libs;
  }

  // Finds the content of one PDF.js page, in visual points. Returns { vw, vh, box } (box null when blank).
  async function measure(page) {
    const v1 = page.getViewport({ scale: 1 });
    const scale = Math.max(0.5, Math.min(2.5, MAX_SIDE / Math.max(v1.width, v1.height)));
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(vp.width)); c.height = Math.max(1, Math.ceil(vp.height));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    try {
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const img = ctx.getImageData(0, 0, c.width, c.height);
      const b = contentBox(img.data, img.width, img.height);
      return {
        vw: v1.width, vh: v1.height,
        box: b && { top: b.top / scale, bottom: b.bottom / scale, left: b.left / scale, right: b.right / scale },
      };
    } finally { c.width = c.height = 0; }
  }

  async function cropOne(it, run) {
    const bytes = new Uint8Array(await it.file.arrayBuffer());
    let src;
    try {
      src = await root.pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
    } catch (e) {
      if (e && e.name === 'PasswordException') throw new Error('This PDF has a password. Open it, save a copy without the password, and try again.');
      throw new Error('This is not a PDF that can be read.');
    }
    try {
      let out;
      try { out = await root.PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }); }
      catch (e) { throw new Error('This PDF could not be opened for editing.'); }
      const pages = out.getPages();
      if (pages.length !== src.numPages) throw new Error('This PDF has a damaged page list.');
      let cut = 0, before = 0, after = 0;
      for (let i = 0; i < src.numPages; i++) {
        if (run !== S.run) return null;
        it.msg = `Checking page ${i + 1} of ${src.numPages}…`; status(it);
        const p = await src.getPage(i + 1);
        try {
          const m = await measure(p);
          const view = p.view, rot = p.rotate || 0;
          before += (view[2] - view[0]) * (view[3] - view[1]);
          if (!m.box) { after += (view[2] - view[0]) * (view[3] - view[1]); continue; } // blank page: leave it
          const r = pdfRect(view, rot, cutBox(m.vw, m.vh, m.box, S.gap, S.all));
          after += r[2] * r[3];
          const same = Math.abs(r[0] - view[0]) < 0.5 && Math.abs(r[1] - view[1]) < 0.5 &&
            Math.abs(r[2] - (view[2] - view[0])) < 0.5 && Math.abs(r[3] - (view[3] - view[1])) < 0.5;
          if (same) continue;
          const pg = pages[i];
          pg.setMediaBox(r[0], r[1], r[2], r[3]);
          pg.setCropBox(r[0], r[1], r[2], r[3]);
          pg.setBleedBox(r[0], r[1], r[2], r[3]);
          pg.setTrimBox(r[0], r[1], r[2], r[3]);
          pg.setArtBox(r[0], r[1], r[2], r[3]);
          cut++;
        } finally { p.cleanup(); }
      }
      if (run !== S.run) return null;
      it.msg = 'Saving…'; status(it);
      const res = await out.save({ useObjectStreams: false });
      return { bytes: res, pages: src.numPages, cut, saved: before > 0 ? Math.round((1 - after / before) * 100) : 0 };
    } finally { src.destroy(); }
  }

  async function thumbsOf(bytes, run) {
    const doc = await root.pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
    const urls = [];
    try {
      for (let i = 1; i <= Math.min(doc.numPages, 8); i++) {
        if (run !== S.run) break;
        const p = await doc.getPage(i);
        const v1 = p.getViewport({ scale: 1 });
        const vp = p.getViewport({ scale: Math.min(2, 360 / Math.max(v1.width, v1.height)) });
        const c = document.createElement('canvas');
        c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        await p.render({ canvasContext: ctx, viewport: vp }).promise;
        urls.push(c.toDataURL('image/jpeg', 0.82));
        c.width = c.height = 0; p.cleanup();
      }
    } finally { doc.destroy(); }
    return urls;
  }

  // One file at a time, so a big batch does not run a phone out of memory.
  async function work() {
    if (S.busy) return;
    S.busy = true;
    try {
      for (;;) {
        const it = S.files.find((f) => f.status === 'wait');
        if (!it) break;
        const run = S.run;
        it.status = 'work'; it.msg = 'Opening…'; status(it);
        try {
          await loadLibs();
          const r = await cropOne(it, run);
          if (!r) { if (it.status === 'work') it.status = 'wait'; continue; }
          const th = await thumbsOf(r.bytes, run);
          if (run !== S.run) { it.status = 'wait'; continue; }
          it.out = new Blob([r.bytes], { type: 'application/pdf' });
          it.bytes = r.bytes; it.pages = r.pages; it.cut = r.cut; it.saved = r.saved; it.thumbs = th;
          it.status = 'done'; it.msg = '';
        } catch (e) {
          console.warn('label cropper:', e);
          if (run !== S.run) { it.status = 'wait'; continue; }
          it.status = 'err'; it.msg = (e && e.message) || String(e);
        }
        draw();
      }
    } finally { S.busy = false; draw(); }
  }

  function add(list) {
    const fs = [].slice.call(list || []);
    const pdfs = fs.filter(isPdf), skip = fs.length - pdfs.length;
    S.note = skip ? `${skip} file${skip > 1 ? 's were' : ' was'} not a PDF and left out.` : '';
    pdfs.forEach((file) => S.files.push({ id: nextId++, file, name: file.name || 'labels.pdf', status: 'wait', msg: 'Waiting…' }));
    draw();
    work();
  }

  // Settings changed: crop every file again with the new settings.
  function redo() {
    S.run++;
    S.files.forEach((f) => { f.status = 'wait'; f.msg = 'Waiting…'; f.thumbs = null; });
    draw();
    // the running file notices the new run and stops; work() then picks everything up again
    const wait = () => (S.busy ? setTimeout(wait, 60) : work());
    wait();
  }

  function save(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function canShare() {
    try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] })); } catch (e) { return false; }
  }
  async function share(blob, name) {
    try { await navigator.share({ files: [new File([blob], name, { type: 'application/pdf' })], title: name }); }
    catch (e) { if (!e || e.name !== 'AbortError') save(blob, name); }
  }

  async function mergeAll() {
    const done = S.files.filter((f) => f.status === 'done');
    if (!done.length) return null;
    const out = await root.PDFLib.PDFDocument.create();
    for (const f of done) {
      const d = await root.PDFLib.PDFDocument.load(f.bytes, { ignoreEncryption: true });
      (await out.copyPages(d, d.getPageIndices())).forEach((p) => out.addPage(p));
    }
    return new Blob([await out.save()], { type: 'application/pdf' });
  }

  /* ---------- drawing */
  const CSS = `
.pcr{max-width:900px}
.pcr .pcr-card{padding:18px;margin-bottom:16px}
.pcr-drop{display:grid;place-items:center;gap:6px;text-align:center;border:2px dashed var(--rule);border-radius:16px;padding:30px 16px;cursor:pointer;background:var(--paper);transition:border-color .12s,background .12s}
.pcr-drop:hover,.pcr-drop.is-over,.pcr-drop:focus-within{border-color:var(--carbon);background:var(--carbon-tint)}
.pcr-drop b{font-size:17px}
.pcr-drop span{color:var(--ink-3);font-size:13.5px}
.pcr-sr{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none}
.pcr-opts{display:flex;flex-wrap:wrap;gap:12px 22px;margin-top:16px;align-items:center;font-size:14.5px;font-weight:600}
.pcr-opts label{display:flex;align-items:center;gap:8px;cursor:pointer}
.pcr-opts input[type=range]{width:140px;accent-color:var(--carbon)}
.pcr-opts input[type=checkbox]{width:18px;height:18px;accent-color:var(--carbon)}
.pcr-opts output{min-width:44px;font-variant-numeric:tabular-nums;color:var(--ink-2)}
.pcr-note{font-size:13px;color:var(--ink-3);margin:10px 0 0}
.pcr-warn{color:var(--red,#b42318)}
.pcr-bar{display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:center;margin:4px 0 12px}
.pcr-bar h2{font-family:var(--font-display);font-size:24px;font-weight:600;margin:0;line-height:1}
.pcr-file{padding:14px 16px;margin-bottom:12px}
.pcr-row{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.pcr-name{font-weight:700;word-break:break-all}
.pcr-meta{font-size:13px;color:var(--ink-3)}
.pcr-meta.is-err{color:var(--red,#b42318);font-weight:600}
.pcr-acts{display:flex;gap:8px;flex-wrap:wrap}
.pcr-btn{font:inherit;font-weight:700;font-size:14.5px;border:0;border-radius:10px;padding:9px 15px;cursor:pointer;color:var(--btn-fg,#fff);background:var(--btn-bg,#2b3494);background-image:var(--btn-grad,none);display:inline-flex;align-items:center;gap:6px;text-decoration:none}
.pcr-btn--ghost{background:var(--carbon-tint);background-image:none;color:var(--carbon);border:1.5px solid var(--carbon)}
.pcr-btn--x{background:none;border:0;color:var(--ink-3);padding:6px 8px;font-size:18px;line-height:1}
.pcr-btn:disabled{opacity:.55;cursor:not-allowed}
.pcr-thumbs{display:flex;gap:10px;overflow-x:auto;margin-top:12px;padding-bottom:4px}
.pcr-thumbs img{height:170px;width:auto;border:1px solid var(--rule);border-radius:6px;background:#fff;flex:none}
.pcr-spin{display:inline-block;width:12px;height:12px;border:2px solid var(--rule);border-top-color:var(--carbon);border-radius:50%;animation:pcr-r .8s linear infinite;vertical-align:-1px;margin-right:6px}
@keyframes pcr-r{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.pcr-spin{animation:none}}
.pcr-how{margin:0;padding-left:22px;list-style:decimal;font-size:14px;color:var(--ink-2)}
.pcr-how li{margin:3px 0}
`;

  function fileHtml(f) {
    const meta = f.status === 'done'
      ? `${f.pages} page${f.pages === 1 ? '' : 's'} · ${f.cut ? `${f.cut} cropped${f.saved > 0 ? `, ${f.saved}% smaller` : ''}` : 'nothing to cut'} · ${kb(f.out.size)}`
      : f.status === 'err' ? esc(f.msg) : `<span class="pcr-spin" aria-hidden="true"></span>${esc(f.msg || 'Working…')}`;
    const acts = f.status === 'done'
      ? `<button type="button" class="pcr-btn" data-dl="${f.id}">⬇ Download</button>${canShare() ? `<button type="button" class="pcr-btn pcr-btn--ghost" data-share="${f.id}">Share</button>` : ''}`
      : f.status === 'err' ? `<button type="button" class="pcr-btn pcr-btn--ghost" data-retry="${f.id}">Try again</button>` : '';
    return `<section class="paper pcr-file" data-file="${f.id}">
      <div class="pcr-row"><div><div class="pcr-name">${esc(f.name)}</div><div class="pcr-meta${f.status === 'err' ? ' is-err' : ''}" data-meta aria-live="polite">${meta}</div></div>
      <div class="pcr-acts">${acts}<button type="button" class="pcr-btn pcr-btn--x" data-rm="${f.id}" aria-label="Remove ${esc(f.name)}" title="Remove">×</button></div></div>
      ${f.status === 'done' && f.thumbs && f.thumbs.length ? `<div class="pcr-thumbs">${f.thumbs.map((u, i) => `<img src="${u}" alt="Page ${i + 1} after cropping">`).join('')}</div>` : ''}
    </section>`;
  }

  function draw() {
    if (!el || !el.isConnected) return;
    const done = S.files.filter((f) => f.status === 'done').length;
    el.innerHTML = `<div class="pcr">
      <div class="page-head"><div><h1 class="page-title">Label cropper</h1><p class="page-sub">Cuts the empty white space under your shipping labels, so they print right on 4×6 label sheets and thermal printers. Text and barcodes stay sharp. Files never leave your device.</p></div></div>
      <section class="paper pcr-card">
        <label class="pcr-drop" data-drop><input type="file" accept="application/pdf,.pdf" multiple class="pcr-sr" data-pick><b>📄 Choose label PDFs</b><span>Or drop them here. Many files at once is fine.</span></label>
        <div class="pcr-opts">
          <label>Space kept <input type="range" min="0" max="40" step="1" value="${S.gap}" data-gap aria-label="Space kept around the label, in points"><output data-gapv>${S.gap} pt</output></label>
          <label><input type="checkbox" data-all${S.all ? ' checked' : ''}> Also cut top and sides</label>
        </div>
        ${S.note ? `<p class="pcr-note pcr-warn">${esc(S.note)}</p>` : ''}
      </section>
      ${S.files.length ? `<div class="pcr-bar"><h2>Your files</h2><span class="pcr-acts">${done > 1 ? `<button type="button" class="pcr-btn" data-all-dl>⬇ All in one PDF</button>` : ''}<button type="button" class="pcr-btn pcr-btn--ghost" data-clear>Clear</button></span></div>${S.files.map(fileHtml).join('')}` :
        `<section class="paper pcr-card"><ol class="pcr-how"><li>Download the labels PDF from Meesho (or any courier).</li><li>Choose it above. Each page is checked and cut just under the label.</li><li>Download or share the cropped PDF and print it.</li></ol></section>`}
    </div>`;
    wire();
  }
  // Updates one file's status line without redrawing the page (keeps the slider usable while working).
  function status(f) {
    if (!el) return;
    const m = el.querySelector(`[data-file="${f.id}"] [data-meta]`);
    if (m) m.innerHTML = `<span class="pcr-spin" aria-hidden="true"></span>${esc(f.msg || 'Working…')}`;
    else draw();
  }

  function wire() {
    const q = (s) => el.querySelector(s), byId = (id) => S.files.find((f) => f.id === +id);
    const pick = q('[data-pick]'), drop = q('[data-drop]');
    pick.addEventListener('change', () => { const fs = [].slice.call(pick.files || []); pick.value = ''; add(fs); });
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'dragend'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('is-over')));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); add(e.dataTransfer && e.dataTransfer.files); });

    const gap = q('[data-gap]'), gv = q('[data-gapv]');
    let t = null;
    gap.addEventListener('input', () => {
      gv.textContent = gap.value + ' pt';
      clearTimeout(t);
      t = setTimeout(() => {
        const v = +gap.value;
        if (v === S.gap) return;
        S.gap = v; try { localStorage.setItem('pb-crop-gap', String(v)); } catch (e) { /* ignore */ }
        if (S.files.length) redo();
      }, 350);
    });
    q('[data-all]').addEventListener('change', (e) => {
      S.all = e.target.checked; try { localStorage.setItem('pb-crop-all', S.all ? '1' : '0'); } catch (x) { /* ignore */ }
      if (S.files.length) redo();
    });

    el.querySelectorAll('[data-dl]').forEach((b) => b.addEventListener('click', () => { const f = byId(b.dataset.dl); if (f && f.out) save(f.out, outName(f.name)); }));
    el.querySelectorAll('[data-share]').forEach((b) => b.addEventListener('click', () => { const f = byId(b.dataset.share); if (f && f.out) share(f.out, outName(f.name)); }));
    el.querySelectorAll('[data-retry]').forEach((b) => b.addEventListener('click', () => { const f = byId(b.dataset.retry); if (f) { f.status = 'wait'; f.msg = 'Waiting…'; draw(); work(); } }));
    el.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
      const f = byId(b.dataset.rm);
      if (!f) return;
      if (f.status === 'work') S.run++; // stop it; the others carry on
      S.files = S.files.filter((x) => x !== f);
      draw();
      if (S.files.some((x) => x.status === 'wait')) { const w = () => (S.busy ? setTimeout(w, 60) : work()); w(); }
    }));
    const clear = q('[data-clear]');
    if (clear) clear.addEventListener('click', () => { S.run++; S.files = []; S.note = ''; draw(); });
    const all = q('[data-all-dl]');
    if (all) all.addEventListener('click', async () => {
      all.disabled = true; all.textContent = 'Joining…';
      try { const b = await mergeAll(); if (b) save(b, 'labels-cropped-all.pdf'); }
      catch (e) { console.error('label cropper: join failed', e); S.note = 'Could not join the files: ' + ((e && e.message) || e); }
      draw();
    });
  }

  root.pbCropMount = function (target) {
    if (!document.getElementById('pcr-css')) {
      const st = document.createElement('style');
      st.id = 'pcr-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    el = target;
    draw();
    loadLibs().catch(() => { /* shown when a file is added */ });
  };
})();
