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

  // Label sizes for thermal printers, in points (72 = 1 inch). 'any': keep the page's own size, only cut.
  const SIZES = { '4x4': [288, 288], '4x6': [288, 432], 'any': null };

  // Affine matrices in PDF order [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f.
  function mul(m2, m1) { // m2 after m1
    return [m2[0] * m1[0] + m2[2] * m1[1], m2[1] * m1[0] + m2[3] * m1[1], m2[0] * m1[2] + m2[2] * m1[3],
      m2[1] * m1[2] + m2[3] * m1[3], m2[0] * m1[4] + m2[2] * m1[5] + m2[4], m2[1] * m1[4] + m2[3] * m1[5] + m2[5]];
  }
  function apply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  // PDF user space → visual (as shown, y down, unscaled): the inverse of toPdf.
  function userToVisual(view, rot) {
    const [a, b, c, d] = view, W = c - a, H = d - b;
    switch (((rot % 360) + 360) % 360) {
      case 90: return [0, 1, 1, 0, -b, -a];
      case 180: return [-1, 0, 0, 1, a + W, -b];
      case 270: return [0, -1, -1, 0, b + H, a + W];
      default: return [1, 0, 0, -1, -a, b + H];
    }
  }
  // Fit the visual box cut = {x0, y0, x1, y1} into an OW x OH page with pad points of margin on every side,
  // centred, turned a quarter (clockwise) when that makes the label at least 8% bigger.
  // Returns { m: user space → new page, turned, scale }.
  function fitMatrix(view, rot, cut, OW, OH, pad) {
    const w = Math.max(1, cut.x1 - cut.x0), h = Math.max(1, cut.y1 - cut.y0);
    pad = Math.max(0, Math.min(pad || 0, OW / 4, OH / 4));
    const AW = OW - 2 * pad, AH = OH - 2 * pad;
    const s1 = Math.min(AW / w, AH / h), s2 = Math.min(AW / h, AH / w), turned = s2 > s1 * 1.08;
    let v2o;
    if (!turned) {
      const ox = (OW - w * s1) / 2, oy = (OH - h * s1) / 2;
      v2o = [s1, 0, 0, -s1, ox - s1 * cut.x0, OH - oy + s1 * cut.y0];
    } else {
      const ox = (OW - h * s2) / 2, oy = (OH - w * s2) / 2;
      v2o = [0, -s2, -s2, 0, ox + s2 * (h + cut.y0), OH - oy + s2 * cut.x0];
    }
    return { m: mul(v2o, userToVisual(view, rot)), turned, scale: turned ? s2 : s1 };
  }

  root.PBCrop = { contentBox, cutBox, toPdf, visualSize, pdfRect, SIZES, mul, apply, userToVisual, fitMatrix, WHITE, MIN_SIZE };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PBCrop;
  if (typeof document === 'undefined') return;

  /* ======================================================= page */

  const S = {
    size: '4x4',     // '4x4' | '4x6' | 'any' (see SIZES)
    inv: true,       // leave out the invoice under a Meesho label (cut at "TAX INVOICE")
    gap: 8,          // points kept around the label (fixed sizes: margin inside the label)
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
    const z = localStorage.getItem('pb-crop-size'); if (z && Object.prototype.hasOwnProperty.call(SIZES, z)) S.size = z;
    S.inv = localStorage.getItem('pb-crop-inv') !== '0';
  } catch (e) { /* ignore */ }
  let el = null, nextId = 1, libs = null;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const kb = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const isPdf = (f) => /pdf$/i.test(f.type || '') || /\.pdf$/i.test(f.name || '');
  const outName = (n) => String(n || 'labels').replace(/\.pdf$/i, '') + (SIZES[S.size] ? '-' + S.size : '-cropped') + '.pdf';
  // Where a Meesho invoice starts under the label (the same words the label sorter stops at).
  const STOP = /tax\s*invoice|\binvoice\b|bill\s*to|ship\s*to|sold\s*by|original\s*for|bill\s*of\s*supply/i;

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
  // upright: turn the page so most of its text reads left to right (for exact label sizes, so a label stored
  // sideways or upside down still prints upright). Returns { rot, vw, vh, box, invoice } in that orientation.
  async function measure(page, cutInvoice, upright) {
    const base = page.rotate || 0;
    let items = null;
    if (cutInvoice || upright) { try { items = (await page.getTextContent()).items; } catch (e) { items = null; } }
    let rot = base;
    if (upright && items && items.length) {
      const v0 = page.getViewport({ scale: 1 }), w = [0, 0, 0, 0]; // reads right, down, left, up (as shown)
      for (const t of items) {
        const n = (t.str || '').trim().length;
        if (!n) continue;
        const a = v0.convertToViewportPoint(t.transform[4], t.transform[5]);
        const e = v0.convertToViewportPoint(t.transform[4] + t.transform[0], t.transform[5] + t.transform[1]);
        const dx = e[0] - a[0], dy = e[1] - a[1];
        w[Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 0 : 2) : (dy >= 0 ? 1 : 3)] += n;
      }
      const best = w.indexOf(Math.max(...w));
      if (w[best] > 0 && w[best] > w[0] * 1.5) rot = (base + [0, 270, 180, 90][best]) % 360;
    }
    const v1 = page.getViewport({ scale: 1, rotation: rot });
    // the top of the invoice, as shown (visual points); content below it is left out
    let limit = v1.height;
    if (cutInvoice && items) {
      {
        for (const t of items) {
          if (!t.str || !STOP.test(t.str)) continue;
          const z = Math.hypot(t.transform[2], t.transform[3]) || Math.abs(t.transform[3]) || 10;
          const a = v1.convertToViewportPoint(t.transform[4], t.transform[5]);
          // only text that reads left to right as the page is shown (a turned page's invoice is not "below")
          const e = v1.convertToViewportPoint(t.transform[4] + t.transform[0], t.transform[5] + t.transform[1]);
          if (!(e[0] - a[0] > 3 * Math.abs(e[1] - a[1]))) continue;
          const b = v1.convertToViewportPoint(t.transform[4] - t.transform[2], t.transform[5] + z);
          const top = Math.min(a[1], b[1]) - 2;
          // only when there is a label above it (not an invoice-only page)
          if (top > v1.height * 0.15 && top < limit) limit = top;
        }
      }
    }
    const scale = Math.max(0.5, Math.min(2.5, MAX_SIDE / Math.max(v1.width, v1.height)));
    const vp = page.getViewport({ scale, rotation: rot });
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(vp.width)); c.height = Math.max(1, Math.ceil(vp.height));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    try {
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const img = ctx.getImageData(0, 0, c.width, c.height);
      const rows = Math.max(1, Math.min(img.height, Math.floor(limit * scale)));
      const b = contentBox(img.data, img.width, rows);
      return {
        rot, vw: v1.width, vh: v1.height, invoice: limit < v1.height,
        box: b && { top: b.top / scale, bottom: b.bottom / scale, left: b.left / scale, right: b.right / scale },
      };
    } finally { c.width = c.height = 0; }
  }

  function setBoxes(pg, r) {
    pg.setMediaBox(r[0], r[1], r[2], r[3]);
    pg.setCropBox(r[0], r[1], r[2], r[3]);
    pg.setBleedBox(r[0], r[1], r[2], r[3]);
    pg.setTrimBox(r[0], r[1], r[2], r[3]);
    pg.setArtBox(r[0], r[1], r[2], r[3]);
  }
  // Puts the visual box vcut of a pdf-lib page on a new OW x OH page: the page's drawing is moved and scaled
  // with one matrix and clipped to the label, so nothing outside it prints. Text and barcodes stay vector.
  function fitPage(pg, view, rot, vcut, OW, OH, pad) {
    const P = root.PDFLib, f = fitMatrix(view, rot, vcut, OW, OH, pad), m = f.m, r = pdfRect(view, rot, vcut);
    pg.node.normalize();
    const ctx = pg.doc.context;
    const a = ctx.register(pg.createContentStream(P.pushGraphicsState(), P.concatTransformationMatrix(m[0], m[1], m[2], m[3], m[4], m[5]),
      P.rectangle(r[0], r[1], r[2], r[3]), P.clip(), P.endPath()));
    const b = ctx.register(pg.createContentStream(P.popGraphicsState()));
    pg.node.wrapContentStreams(a, b);
    ['Annots', 'TrimBox', 'BleedBox', 'ArtBox', 'UserUnit'].forEach((k) => pg.node.delete(P.PDFName.of(k)));
    pg.setRotation(P.degrees(0));
    pg.setMediaBox(0, 0, OW, OH);
    pg.setCropBox(0, 0, OW, OH);
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
          const fixed = SIZES[S.size];
          const m = await measure(p, S.inv, !!fixed);
          const view = p.view, rot = m.rot;
          before += (view[2] - view[0]) * (view[3] - view[1]);
          if (!m.box) { // blank page: leave it (a fixed size still gets the exact page size, empty)
            if (fixed) { const pg = pages[i]; pg.setRotation(root.PDFLib.degrees(0)); setBoxes(pg, [0, 0, fixed[0], fixed[1]]); pg.node.set(root.PDFLib.PDFName.of('Contents'), out.context.obj([])); cut++; }
            after += (view[2] - view[0]) * (view[3] - view[1]); continue;
          }
          if (fixed) {
            // exact label size: the label alone (all sides cut), scaled to fit with S.gap of margin
            const vcut = cutBox(m.vw, m.vh, m.box, 1, true);
            fitPage(pages[i], view, rot, vcut, fixed[0], fixed[1], Math.min(S.gap, 20));
            after += fixed[0] * fixed[1]; cut++;
            continue;
          }
          const vc = cutBox(m.vw, m.vh, m.box, S.gap, S.all);
          if (m.invoice) vc.y1 = Math.min(vc.y1, m.box.bottom + Math.min(S.gap, 4)); // never into the invoice
          const r = pdfRect(view, rot, vc);
          after += r[2] * r[3];
          const same = Math.abs(r[0] - view[0]) < 0.5 && Math.abs(r[1] - view[1]) < 0.5 &&
            Math.abs(r[2] - (view[2] - view[0])) < 0.5 && Math.abs(r[3] - (view[3] - view[1])) < 0.5;
          if (same) continue;
          setBoxes(pages[i], r);
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
          it.bytes = r.bytes; it.pages = r.pages; it.size = S.size; it.cut = r.cut; it.saved = r.saved; it.thumbs = th;
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
.pcr-size{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin-top:16px;font-size:14.5px;font-weight:700}
.pcr-seg{display:flex;flex-wrap:wrap;gap:8px}
.pcr-seg button{font:inherit;font-size:14.5px;font-weight:700;text-align:left;padding:8px 14px;border-radius:10px;border:1.5px solid var(--rule);background:var(--paper);color:var(--ink);cursor:pointer;line-height:1.25}
.pcr-seg button small{display:block;font-weight:500;font-size:12px;color:var(--ink-3)}
.pcr-seg button[aria-pressed=true]{border-color:var(--carbon);background:var(--carbon-tint);color:var(--carbon)}
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
      ? `${f.pages} page${f.pages === 1 ? '' : 's'} · ${f.size !== 'any' ? `every page exactly ${f.size.replace('x', ' × ')} inch` : f.cut ? `${f.cut} cropped${f.saved > 0 ? `, ${f.saved}% smaller` : ''}` : 'nothing to cut'} · ${kb(f.out.size)}`
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
      <div class="page-head"><div><h1 class="page-title">Label cropper</h1><p class="page-sub">Makes every label page exactly 4×4 or 4×6 inch (or just cuts the empty white space), so each label prints on one label of your thermal printer. Text and barcodes stay sharp. Files never leave your device.</p></div></div>
      <section class="paper pcr-card">
        <label class="pcr-drop" data-drop><input type="file" accept="application/pdf,.pdf" multiple class="pcr-sr" data-pick><b>📄 Choose label PDFs</b><span>Or drop them here. Many files at once is fine.</span></label>
        <div class="pcr-size"><span>Label size</span><div class="pcr-seg" role="group" aria-label="Label size">${[['4x4', '4 × 4 inch', 'Exact size'], ['4x6', '4 × 6 inch', 'Exact size'], ['any', 'Any size', 'Only cut empty space']].map(([k, a, b]) => `<button type="button" data-size="${k}" aria-pressed="${S.size === k}">${a}<small>${b}</small></button>`).join('')}</div></div>
        <div class="pcr-opts">
          <label>${SIZES[S.size] ? 'Margin' : 'Space kept'} <input type="range" min="0" max="${SIZES[S.size] ? 20 : 40}" step="1" value="${Math.min(S.gap, SIZES[S.size] ? 20 : 40)}" data-gap aria-label="${SIZES[S.size] ? 'Margin inside the label' : 'Space kept around the label'}, in points"><output data-gapv>${Math.min(S.gap, SIZES[S.size] ? 20 : 40)} pt</output></label>
          ${SIZES[S.size] ? '' : `<label><input type="checkbox" data-all${S.all ? ' checked' : ''}> Also cut top and sides</label>`}
          <label><input type="checkbox" data-inv${S.inv ? ' checked' : ''}> Leave out the invoice (label only)</label>
        </div>
        ${SIZES[S.size] ? `<p class="pcr-note">Every page comes out exactly ${S.size.replace('x', ' × ')} inch, so each label prints on one label. In the print window choose this paper size, <b>Actual size</b> (100%, not "Fit") and no margins.</p>` : ''}
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
    el.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => {
      const z = b.dataset.size;
      if (z === S.size) return;
      S.size = z; try { localStorage.setItem('pb-crop-size', z); } catch (x) { /* ignore */ }
      if (SIZES[z] && S.gap > 20) S.gap = 20;
      if (S.files.length) redo(); else draw();
    }));
    q('[data-inv]').addEventListener('change', (e) => {
      S.inv = e.target.checked; try { localStorage.setItem('pb-crop-inv', S.inv ? '1' : '0'); } catch (x) { /* ignore */ }
      if (S.files.length) redo();
    });
    const allBox = q('[data-all]');
    if (allBox) allBox.addEventListener('change', (e) => {
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
