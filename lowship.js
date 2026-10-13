// PakkaBill: low shipping images for Meesho.
// Meesho works out a product's shipping charge partly from its main catalogue photo, so the same product
// can show ₹60 with one photo and ₹100+ with another. This tool finds the product in a photo, cleans
// the background to plain white, and makes 1000×1000 versions with the product at different sizes in
// the frame. The seller tries them in Meesho's catalogue upload, types in the shipping Meesho shows,
// and PakkaBill marks the cheapest and remembers which size works best for each category.
// Everything runs in the browser: photos never leave the phone.
// The app calls window.pbLowShipMount(el) when #/lowship opens. window.PBShip is the engine (tested in Node).
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;

  /* ======================================================= engine (no DOM) */

  // Product sizes tried: the longer side of the product as a share of the square photo.
  const FILLS = [40, 45, 50, 55, 60, 65, 70, 80];
  // Extra looks (stickers in the corners, a frame, a soft colour) at one product size: they change
  // what Meesho sees in the photo, so they can land in a different shipping charge too.
  const STYLES = [
    { id: 'stars', label: 'Stars' },
    { id: 'hearts', label: 'Hearts' },
    { id: 'sparkle', label: 'Sparkles' },
    { id: 'frame', label: 'Frame' },
    { id: 'pink', label: 'Soft pink', bg: [253, 236, 242] },
    { id: 'blue', label: 'Soft blue', bg: [233, 242, 255] },
  ];
  // How far a colour may be from the background colour and still count as background.
  const STRENGTH = { gentle: 28, normal: 42, strong: 60 };

  const d2 = (d, i, c) => (d[i] - c[0]) ** 2 + (d[i + 1] - c[1]) ** 2 + (d[i + 2] - c[2]) ** 2;

  // Background colour from the border of the photo: the most common colour there (16 levels per channel),
  // averaged with every border pixel close to it. uniform: share of the border that is that colour.
  function borderColor(img) {
    const { width: w, height: h, data: d } = img;
    const band = Math.max(1, Math.round(Math.min(w, h) * 0.015));
    const idx = [];
    for (let y = 0; y < h; y++) {
      if (y < band || y >= h - band) for (let x = 0; x < w; x++) idx.push((y * w + x) * 4);
      else for (let x = 0; x < band; x++) idx.push((y * w + x) * 4, (y * w + w - 1 - x) * 4);
    }
    const bins = new Map();
    for (const i of idx) {
      const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
      bins.set(k, (bins.get(k) || 0) + 1);
    }
    let best = 0, bestN = -1;
    bins.forEach((n, k) => { if (n > bestN) { best = k; bestN = n; } });
    const seed = [((best >> 8) & 15) * 16 + 8, ((best >> 4) & 15) * 16 + 8, (best & 15) * 16 + 8];
    let r = 0, g = 0, b = 0, n = 0;
    for (const i of idx) if (d2(d, i, seed) <= 24 * 24) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    const bg = n ? [r / n, g / n, b / n] : seed;
    let near = 0;
    for (const i of idx) if (d2(d, i, bg) <= 36 * 36) near++;
    // a studio sweep or uneven light: the outermost ring changes only a little from pixel to pixel
    const ring = [];
    for (let x = 0; x < w; x++) ring.push(x * 4);
    for (let y = 1; y < h; y++) ring.push((y * w + w - 1) * 4);
    for (let x = w - 2; x >= 0; x--) ring.push(((h - 1) * w + x) * 4);
    for (let y = h - 2; y > 0; y--) ring.push(y * w * 4);
    let smooth = 0, close = 0;
    for (let j = 0; j < ring.length; j++) {
      const i = ring[j], k = ring[(j + 1) % ring.length];
      if (d2(d, i, [d[k], d[k + 1], d[k + 2]]) <= 10 * 10) smooth++;
      if (d2(d, i, bg) <= 84 * 84) close++;
    }
    const shaded = Math.min(smooth, close) / ring.length;
    return { bg: bg.map(Math.round), uniform: Math.max(near / idx.length, shaded >= 0.9 ? shaded : 0) };
  }

  // Background pixels: flood fill from the border through colours close to the background colour, and
  // along gentle shading (each step close to the last, and not too far from the background), so studio
  // gradients and soft shadows go too. 1 = background.
  function backgroundMask(img, bg, tol) {
    const { width: w, height: h, data: d } = img;
    const N = w * h, m = new Uint8Array(N), q = new Int32Array(N);
    const t2 = tol * tol, far2 = (tol * 2) ** 2, step2 = 9 * 9;
    let qh = 0, qt = 0;
    const take = (p, from) => {
      if (m[p]) return;
      const i = p * 4, e = d2(d, i, bg);
      if (e <= t2 || (from >= 0 && e <= far2 && d2(d, i, [d[from * 4], d[from * 4 + 1], d[from * 4 + 2]]) <= step2)) { m[p] = 1; q[qt++] = p; }
    };
    for (let x = 0; x < w; x++) { take(x, -1); take((h - 1) * w + x, -1); }
    for (let y = 0; y < h; y++) { take(y * w, -1); take(y * w + w - 1, -1); }
    while (qh < qt) {
      const p = q[qh++], x = p % w;
      if (x > 0) take(p - 1, p);
      if (x < w - 1) take(p + 1, p);
      if (p >= w) take(p - w, p);
      if (p < N - w) take(p + w, p);
    }
    return m;
  }

  // The product: pieces of non-background, keeping every piece at least 2% the size of the biggest
  // (a pair of earrings stays, dust and specks go). Specks are turned into background in the mask.
  function productBox(mask, w, h) {
    const N = w * h, lab = new Int32Array(N), q = new Int32Array(N), parts = [];
    for (let s = 0; s < N; s++) {
      if (mask[s] || lab[s]) continue;
      const id = parts.length + 1;
      let qh = 0, qt = 0, area = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
      lab[s] = id; q[qt++] = s;
      while (qh < qt) {
        const p = q[qh++], x = p % w, y = (p / w) | 0;
        area++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
        for (const r of nb) if (r >= 0 && !mask[r] && !lab[r]) { lab[r] = id; q[qt++] = r; }
      }
      parts.push({ id, area, x0, y0, x1, y1 });
    }
    if (!parts.length) return null;
    const big = Math.max(...parts.map((p) => p.area));
    const keep = parts.filter((p) => p.area >= Math.max(big * 0.02, N * 0.0002));
    const kept = new Set(keep.map((p) => p.id));
    for (let p = 0; p < N; p++) if (lab[p] && !kept.has(lab[p])) mask[p] = 1;
    const box = { x: Math.min(...keep.map((p) => p.x0)), y: Math.min(...keep.map((p) => p.y0)) };
    box.w = Math.max(...keep.map((p) => p.x1)) - box.x + 1;
    box.h = Math.max(...keep.map((p) => p.y1)) - box.y + 1;
    return box;
  }

  // Looks at a photo (ImageData-like, ideally ≤ 600 px): background colour, whether it is plain,
  // the background mask and the product's box. On a busy photo (not a plain background) the whole
  // photo is the product.
  function analyze(img, opts = {}) {
    const { width: w, height: h } = img;
    const { bg, uniform } = borderColor(img);
    const plain = uniform >= 0.6;
    const whole = { x: 0, y: 0, w, h };
    if (!plain || opts.strength === 'off') return { bg, uniform, plain, mask: null, box: whole };
    const mask = backgroundMask(img, bg, STRENGTH[opts.strength] || STRENGTH.normal);
    const box = productBox(mask, w, h);
    // nothing left, or the "product" is the whole photo: treat as a busy photo
    if (!box || box.w * box.h > w * h * 0.985) return { bg, uniform, plain: false, mask: null, box: whole };
    return { bg, uniform, plain, mask, box };
  }

  // How big the product is in a square photo now (longer side of the product / longer side of the photo).
  const fillOf = (box, w, h) => Math.round((Math.max(box.w, box.h) / Math.max(w, h)) * 100);

  // Where the product goes on a square canvas of `size` for a fill (percent): scale and position.
  function place(box, fill, size) {
    const k = (size * fill) / 100 / Math.max(box.w, box.h);
    const dw = box.w * k, dh = box.h * k;
    return { k, x: (size - dw) / 2, y: (size - dh) / 2, w: dw, h: dh };
  }

  // The versions of one photo: every product size, then each look at `base` percent (the size that
  // did best before for this category, or 60%). key is what results are remembered by.
  function variants(base, styles = true) {
    const out = FILLS.map((f) => ({ key: String(f), fill: f, style: null, label: `Product ${f}%` }));
    if (styles) for (const st of STYLES) out.push({ key: `${base}-${st.id}`, fill: base, style: st.id, label: `${st.label} · ${base}%` });
    return out;
  }
  const keyLabel = (key) => { const [f, st] = String(key).split('-'); const s = STYLES.find((x) => x.id === st); return s ? `${s.label} at ${f}%` : `product at ${f}%`; };

  // Best version for a category from the seller's own Meesho results: lowest average shipping
  // (a tie goes to the one tried more often).
  function bestOf(results) {
    let best = null;
    for (const [key, list] of Object.entries(results || {})) {
      if (!list || !list.length) continue;
      const avg = list.reduce((a, b) => a + b, 0) / list.length;
      if (!best || avg < best.avg || (avg === best.avg && list.length > best.tries)) best = { key, avg: Math.round(avg), tries: list.length };
    }
    return best;
  }
  // The plain product size that did best (for placing the looks), or null.
  function bestPlainFill(results) {
    const plain = Object.fromEntries(Object.entries(results || {}).filter(([k]) => /^\d+$/.test(k)));
    const b = bestOf(plain);
    return b ? Number(b.key) : null;
  }

  // Corner spots for stickers (x, y, side) on a `size` square that stay clear of the product box p.
  function stickerSpots(size, p) {
    const side = Math.round(size * 0.11), m = Math.round(size * 0.05);
    return [[m, m], [size - m - side, m], [m, size - m - side], [size - m - side, size - m - side]]
      .filter(([x, y]) => x + side <= p.x || x >= p.x + p.w || y + side <= p.y || y >= p.y + p.h)
      .map(([x, y]) => ({ x, y, side }));
  }

  // The shipping charge in Meesho's text: "Shipping Charges ₹ 1,234" -> 1234, "₹62.50" -> 62.5. null when none.
  function rupeesIn(text) {
    const t = String(text || '').replace(/\u00a0/g, ' ');
    const m = t.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/i) || t.match(/^\s*([\d,]+(?:\.\d+)?)\s*$/);
    if (!m) return null;
    const n = Number(m[1].replace(/,/g, ''));
    return n >= 0 && n < 100000 ? n : null;
  }

  // ZIP without compression (photos are already compressed): files = [{ name, data: Uint8Array }].
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(u8) { let c = ~0; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return ~c >>> 0; }
  function zipParts(files) {
    const enc = new TextEncoder(), out = [], central = [];
    let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, sz, true); lh.setUint32(22, sz, true); lh.setUint16(26, name.length, true);
      out.push(new Uint8Array(lh.buffer), name, f.data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + sz;
    }
    const cd = central.reduce((n, a) => n + a.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cd, true); end.setUint32(16, off, true);
    return [...out, ...central, new Uint8Array(end.buffer)];
  }

  const engine = { FILLS, STYLES, STRENGTH, borderColor, backgroundMask, productBox, analyze, fillOf, place, variants, keyLabel, bestOf, bestPlainFill, stickerSpots, rupeesIn, crc32, zipParts };
  root.PBShip = engine;
  if (typeof document === 'undefined') return;

  /* ======================================================= browser: photos in, photos out */

  const SMALL = 600; // analysis size
  const MAX_SRC = 3000; // bigger photos are scaled down first
  const MAX_BYTES = 1000 * 1024; // keep each JPEG under about 1 MB

  const loadImage = (file) => new Promise((ok, fail) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => ok({ im, url });
    im.onerror = () => { URL.revokeObjectURL(url); fail(new Error('This file is not a photo PakkaBill can open (use JPG, PNG or WebP).')); };
    im.src = url;
  });
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // The photo on white (so see-through PNGs get a white background), scaled to at most MAX_SRC.
  function sourceCanvas(im) {
    const s = Math.min(1, MAX_SRC / Math.max(im.naturalWidth, im.naturalHeight));
    const c = canvas(Math.round(im.naturalWidth * s), Math.round(im.naturalHeight * s));
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(im, 0, 0, c.width, c.height);
    return c;
  }

  // Analysis on a small copy, then the product cut out at full size. clean: the background becomes
  // see-through (soft at the edges), so the product can go on white or any colour.
  function prepare(src, strength, clean) {
    const s = Math.min(1, SMALL / Math.max(src.width, src.height));
    const sm = canvas(Math.max(1, Math.round(src.width * s)), Math.max(1, Math.round(src.height * s)));
    const sx = sm.getContext('2d', { willReadFrequently: true });
    sx.drawImage(src, 0, 0, sm.width, sm.height);
    const a = analyze(sx.getImageData(0, 0, sm.width, sm.height), { strength });
    // product box at full size, with a little margin
    const fx = src.width / sm.width, fy = src.height / sm.height;
    const mx = a.mask ? Math.round(a.box.w * fx * 0.01) : 0, my = a.mask ? Math.round(a.box.h * fy * 0.01) : 0;
    const bx = Math.max(0, Math.floor(a.box.x * fx) - mx), by = Math.max(0, Math.floor(a.box.y * fy) - my);
    const bw = Math.min(src.width - bx, Math.ceil(a.box.w * fx) + 2 * mx), bh = Math.min(src.height - by, Math.ceil(a.box.h * fy) + 2 * my);
    const cut = canvas(bw, bh), cx = cut.getContext('2d', { willReadFrequently: true });
    cx.drawImage(src, bx, by, bw, bh, 0, 0, bw, bh);
    if (a.mask && clean) {
      // background → see-through, blending across the small mask so edges stay soft
      const id = cx.getImageData(0, 0, bw, bh), d = id.data, m = a.mask, W = sm.width, H = sm.height;
      const at = (x, y) => m[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
      for (let y = 0; y < bh; y++) {
        const fyv = (by + y + 0.5) / fy - 0.5, y0 = Math.floor(fyv), ty = fyv - y0;
        for (let x = 0; x < bw; x++) {
          const fxv = (bx + x + 0.5) / fx - 0.5, x0 = Math.floor(fxv), tx = fxv - x0;
          const v = (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
          if (v <= 0) continue;
          d[(y * bw + x) * 4 + 3] = Math.round(255 * (1 - v));
        }
      }
      cx.putImageData(id, 0, 0);
    }
    const inner = { x: a.box.x * fx - bx, y: a.box.y * fy - by, w: a.box.w * fx, h: a.box.h * fy };
    return { a, cut, inner, fill: fillOf(a.box, sm.width, sm.height) };
  }

  // One square version: the cut-out product at `fill` percent on a `size` canvas of `paint` colour,
  // with the look `style` (stickers, frame or a soft colour) when given.
  function compose(prep, fill, size, paint, style) {
    const c = canvas(size, size), x = c.getContext('2d');
    const st = STYLES.find((s) => s.id === style);
    x.fillStyle = `rgb(${(st && st.bg && prep.a.mask ? st.bg : paint).join(',')})`;
    x.fillRect(0, 0, size, size);
    // the product itself (not the margin around it) is `fill` percent, centred
    const p = place(prep.inner, fill, size);
    x.imageSmoothingQuality = 'high';
    x.drawImage(prep.cut, p.x - prep.inner.x * p.k, p.y - prep.inner.y * p.k, prep.cut.width * p.k, prep.cut.height * p.k);
    if (style === 'frame') {
      const w = size * 0.022, r = size * 0.05;
      x.strokeStyle = '#d9cffd'; x.lineWidth = w;
      const rr = (a, w, rad) => { x.beginPath(); if (x.roundRect) x.roundRect(a, a, w, w, rad); else x.rect(a, a, w, w); x.stroke(); };
      rr(size * 0.03, size * 0.94, r);
      x.strokeStyle = '#efeaff'; x.lineWidth = w / 3;
      rr(size * 0.055, size * 0.89, r * 0.8);
    } else if (st && !st.bg) {
      stickerSpots(size, p).forEach((spot, i) => sticker(x, style, spot, i));
    }
    return { c, k: p.k };
  }
  // Shapes only (no words): Meesho can reject main photos with text on them.
  function sticker(x, style, { x: sx, y: sy, side }, i) {
    const cx = sx + side / 2, cy = sy + side / 2, r = side / 2;
    x.save();
    x.translate(cx, cy);
    x.rotate((i % 2 ? 1 : -1) * 0.22);
    x.beginPath();
    if (style === 'stars') {
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      x.closePath(); x.fillStyle = '#ffc83d'; x.strokeStyle = '#e09a00';
    } else if (style === 'hearts') {
      x.moveTo(0, r * 0.75);
      x.bezierCurveTo(-r * 1.25, -r * 0.1, -r * 0.55, -r * 1.05, 0, -r * 0.35);
      x.bezierCurveTo(r * 0.55, -r * 1.05, r * 1.25, -r * 0.1, 0, r * 0.75);
      x.fillStyle = '#ff6b98'; x.strokeStyle = '#d93a6c';
    } else {
      for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4, rr = k % 2 ? r * 0.22 : r; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      x.closePath(); x.fillStyle = '#8b6dff'; x.strokeStyle = '#5b3fe6';
    }
    x.lineWidth = Math.max(2, side * 0.04);
    x.fill(); x.stroke();
    x.restore();
  }
  async function jpeg(c) {
    for (const q of [0.92, 0.86, 0.8, 0.72, 0.64]) {
      const b = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', q));
      if (b && (b.size <= MAX_BYTES || q === 0.64)) return b;
    }
    return null;
  }

  /* ---------- the seller's own results: which product size gave the lowest shipping, per category */
  const KEY = 'pb-lowship';
  const store = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
  const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } };
  const catKey = (c) => String(c || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40);
  function remember(cat, key, rupees) {
    const k = catKey(cat);
    if (!k || !(rupees > 0)) return;
    const s = store();
    s.cats = s.cats || {};
    const c = (s.cats[k] = s.cats[k] || { name: String(cat).trim(), fills: {} });
    const list = (c.fills[key] = c.fills[key] || []);
    list.push(Math.round(rupees));
    if (list.length > 20) list.shift();
    save(s);
  }
  function forget(cat, key, rupees) {
    const s = store(), c = s.cats && s.cats[catKey(cat)];
    const list = c && c.fills[key];
    if (!list) return;
    const i = list.lastIndexOf(Math.round(rupees));
    if (i >= 0) list.splice(i, 1);
    save(s);
  }
  const catOf = (cat) => (store().cats || {})[catKey(cat)];
  const bestFor = (cat) => { const c = catOf(cat); return c ? bestOf(c.fills) : null; };

  /* ---------- page */
  const CSS = `
.pls{max-width:1100px}
.pls .pls-card{padding:18px;margin-bottom:16px}
.pls h2{font-family:var(--font-display);font-size:26px;font-weight:600;line-height:1;margin:0 0 10px;padding-top:4px}
.pls-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:0;padding:0;list-style:none;counter-reset:s}
.pls-steps li{counter-increment:s;background:var(--carbon-tint);border-radius:12px;padding:12px 12px 12px 44px;position:relative;font-size:14px;color:var(--ink-2)}
.pls-steps li:before{content:counter(s);position:absolute;left:12px;top:11px;width:24px;height:24px;border-radius:50%;background:var(--carbon);color:#fff;font-weight:700;display:grid;place-items:center;font-size:13px}
.pls-steps b{display:block;color:var(--ink);font-size:14.5px}
@media (width<720px){.pls-steps{grid-template-columns:1fr}}
.pls-drop{display:grid;place-items:center;gap:6px;text-align:center;border:2px dashed var(--rule);border-radius:16px;padding:26px 16px;cursor:pointer;background:var(--paper);transition:border-color .12s,background .12s}
.pls-drop:hover,.pls-drop.is-over{border-color:var(--carbon);background:var(--carbon-tint)}
.pls-drop b{font-size:17px}
.pls-drop span{color:var(--ink-3);font-size:13.5px}
.pls-opts{display:flex;flex-wrap:wrap;gap:10px 18px;margin-top:14px;align-items:flex-end}
.pls-opts label{display:grid;gap:4px;font-size:12.5px;font-weight:700;color:var(--ink-2)}
.pls-opts select,.pls-opts input{font:inherit;font-size:15px;padding:8px 10px;border:1.5px solid var(--rule);border-radius:var(--r-ctl,9px);background:var(--paper);color:var(--ink);min-width:150px}
.pls-btn{font:inherit;font-weight:700;font-size:15px;border:0;border-radius:10px;padding:10px 16px;cursor:pointer;color:var(--btn-fg,#fff);background:var(--btn-bg,#6c4dff);background-image:var(--btn-grad,none);text-decoration:none;display:inline-flex;align-items:center;gap:6px}
.pls-btn--ghost{background:var(--carbon-tint);background-image:none;color:var(--carbon);border:1.5px solid var(--carbon)}
.pls-btn:disabled{opacity:.6;cursor:wait}
.pls-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin:0 0 12px}
.pls-photo{padding:16px;margin-bottom:16px}
.pls-photo__head{display:flex;gap:14px;align-items:center;margin-bottom:12px}
.pls-photo__head img{width:72px;height:72px;object-fit:contain;border-radius:10px;border:1px solid var(--rule);background:#fff;flex:none}
.pls-photo__head b{display:block;font-size:15.5px;overflow-wrap:anywhere}
.pls-photo__head span{display:block;font-size:13px;color:var(--ink-3)}
.pls-photo__head .pls-x{margin-left:auto;align-self:flex-start;border:0;background:none;font-size:22px;color:var(--ink-3);cursor:pointer;padding:2px 6px}
.pls-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.pls-v{position:relative;border:1.5px solid var(--rule);border-radius:14px;padding:8px;display:grid;gap:6px;background:var(--paper)}
.pls-v img{width:100%;aspect-ratio:1;object-fit:contain;border-radius:8px;background:#fff;border:1px solid var(--rule-soft,#eee)}
.pls-v__top{display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:13px;font-weight:700}
.pls-v__top a{font-size:12.5px;color:var(--carbon);text-decoration:none;font-weight:700}
.pls-v__ship{display:flex;align-items:center;gap:4px;font-size:12.5px;color:var(--ink-3)}
.pls-v__ship input{width:100%;min-width:0;font:inherit;font-size:14px;padding:6px 8px;border:1.5px solid var(--rule);border-radius:8px;background:var(--paper);color:var(--ink)}
.pls-v.is-best{border-color:var(--green);box-shadow:inset 0 0 0 1px var(--green)}
.pls-v.is-tip{border-color:var(--carbon)}
.pls-tag{position:absolute;top:-9px;left:10px;font-size:11px;font-weight:700;color:#fff;background:var(--carbon);padding:2px 8px;border-radius:999px}
.pls-v.is-best .pls-tag{background:var(--green)}
.pls-note{font-size:13px;color:var(--ink-3);margin:10px 0 0}
.pls-warn{font-size:13px;color:var(--amber,#b26a00);margin:8px 0 0}
.pls-tips{margin:0;padding-left:20px;display:grid;gap:6px;font-size:14px;color:var(--ink-2)}
.pls-mine{width:100%;border-collapse:collapse;font-size:14px}
.pls-mine td,.pls-mine th{padding:7px 6px;border-bottom:1px solid var(--rule);text-align:left}
.pls-mine th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3)}
.pls-busy{color:var(--ink-3);font-size:14px;padding:6px 0}
.pls-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
.pls-auto{border:1.5px solid var(--carbon)}
.pls-link{color:var(--carbon);font-weight:700;margin-left:8px}
`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const CATS = ['Blouse', 'Saree', 'Kurti', 'Kurta set', 'Dupatta', 'Lehenga', 'Top', 'Dress', 'Jewellery', 'Bag', 'Footwear', 'Home decor'];
  const toast = (m, bad) => { if (window.pbToast) return window.pbToast(m, bad); const t = document.createElement('div'); t.className = 'pbp-toast' + (bad ? ' is-bad' : ''); t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); };

  let el = null;
  const S = { size: 1000, bg: 'white', strength: 'normal', cat: '', styles: true, photos: [], busy: 0, ext: null, sent: 0 };

  function paintFor(prep) { return S.bg === 'white' || !prep ? [255, 255, 255] : prep.a.bg; }
  // the product size the looks use: what did best before for this category, else 60%
  const baseFill = () => { const c = catOf(S.cat); return (c && bestPlainFill(c.fills)) || 60; };

  async function addFiles(files) {
    const list = [...files].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
    if (!list.length) return toast('Choose photos (JPG, PNG or WebP).', true);
    S.busy += list.length;
    draw();
    for (const file of list) {
      try {
        const { im, url } = await loadImage(file);
        const ph = { id: Math.random().toString(36).slice(2, 10), name: file.name.replace(/\.[^.]+$/, '') || 'photo', url, src: sourceCanvas(im), ship: {}, out: [] };
        await build(ph);
        S.photos.push(ph);
      } catch (e) {
        toast(e.message || 'Could not open this photo.', true);
      }
      S.busy--;
      draw();
    }
  }

  // Makes the versions for one photo with the current options.
  async function build(ph) {
    ph.out.forEach((o) => URL.revokeObjectURL(o.url));
    // "Keep my background" still finds the product (to size it) but leaves its colours alone
    ph.prep = prepare(ph.src, S.strength, S.bg === 'white');
    const p = paintFor(ph.prep);
    ph.out = [];
    for (const v of variants(baseFill(), S.styles)) {
      const { c, k } = compose(ph.prep, v.fill, S.size, p, v.style);
      const blob = await jpeg(c);
      ph.out.push({ ...v, blob, url: URL.createObjectURL(blob), k });
      await new Promise((r) => setTimeout(r)); // keep the page responsive
    }
  }

  const fileName = (ph, key) => `${ph.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'photo'}-meesho-${key}.jpg`;

  const lowOf = (ph) => { const v = Object.values(ph.ship).filter((x) => x > 0); return v.length ? Math.min(...v) : 0; };
  const lowNote = (ph, low) => {
    if (!low) return '';
    const keys = Object.keys(ph.ship).filter((k) => ph.ship[k] === low);
    return `Lowest shipping: <b>₹${low}</b> with ${keys.map((k) => esc(keyLabel(k))).join(', ')}. Use that photo as the main image in Meesho.`;
  };
  function photoHtml(ph) {
    const best = bestFor(S.cat);
    const low = lowOf(ph);
    const a = ph.prep.a;
    const small = ph.out.length && Math.max(...ph.out.map((o) => o.k)) > 2.2;
    return `<section class="paper pls-photo" data-ph="${ph.id}">
      <div class="pls-photo__head"><img src="${ph.url}" alt=""><div><b>${esc(ph.name)}</b>
        <span>${a.mask ? `Plain background found. The product fills ${ph.prep.fill}% of the photo now.` : 'Busy background: the whole photo is used as it is, on white.'}</span></div>
        <button type="button" class="pls-x" data-del aria-label="Remove this photo">×</button></div>
      <div class="pls-grid">${ph.out.map((o) => {
        const v = ph.ship[o.key] || '';
        const isBest = low && Number(v) === low;
        const isTip = !low && best && best.key === o.key;
        return `<div class="pls-v${isBest ? ' is-best' : isTip ? ' is-tip' : ''}">${isBest ? '<span class="pls-tag">Cheapest ✓</span>' : isTip ? '<span class="pls-tag">Best last time</span>' : ''}
          <img src="${o.url}" alt="${esc(o.label)}" loading="lazy">
          <div class="pls-v__top"><span>${esc(o.label)}</span><a href="${o.url}" download="${esc(fileName(ph, o.key))}">Download</a></div>
          <label class="pls-v__ship"><span>₹</span><input type="number" inputmode="numeric" min="0" max="5000" step="1" placeholder="Meesho shipping" value="${esc(v)}" data-key="${esc(o.key)}" aria-label="Shipping Meesho shows for ${esc(o.label)}"></label>
        </div>`;
      }).join('')}</div>
      ${small ? '<p class="pls-warn">This photo is small, so the big versions are enlarged and may look soft. Use a bigger photo if you have one.</p>' : ''}
      <p class="pls-note" data-low${low ? '' : ' hidden'}>${lowNote(ph, low)}</p>
    </section>`;
  }

  // Cheapest / best-last-time marks on one photo's versions, and the prices in its boxes.
  function mark(card, ph) {
    const best = bestFor(S.cat), low = lowOf(ph);
    card.querySelectorAll('.pls-v').forEach((v) => {
      const inp = v.querySelector('input'), key = inp.dataset.key, isBest = !!low && ph.ship[key] === low, isTip = !low && !!best && best.key === key;
      if (document.activeElement !== inp) inp.value = ph.ship[key] || '';
      v.classList.toggle('is-best', isBest);
      v.classList.toggle('is-tip', isTip);
      v.querySelector('.pls-tag')?.remove();
      if (isBest || isTip) v.insertAdjacentHTML('afterbegin', `<span class="pls-tag">${isBest ? 'Cheapest ✓' : 'Best last time'}</span>`);
    });
    const n = card.querySelector('[data-low]');
    n.hidden = !low;
    n.innerHTML = lowNote(ph, low);
  }
  function hintHtml() {
    const best = bestFor(S.cat);
    return best ? `<p class="pls-note">For <b>${esc(S.cat)}</b>, ${esc(keyLabel(best.key))} gave you the lowest shipping so far (average ₹${best.avg} from ${best.tries} tr${best.tries === 1 ? 'y' : 'ies'}). It is marked "Best last time".</p>`
      : S.cat ? `<p class="pls-note">No results for ${esc(S.cat)} yet. Check the versions in Meesho; the shipping for each is saved here.</p>` : '';
  }

  function mineHtml() {
    const cats = Object.values(store().cats || {}).filter((c) => Object.values(c.fills).some((l) => l.length));
    if (!cats.length) return '';
    return `<section class="paper pls-card"><h2>What worked for you</h2>
      <table class="pls-mine"><thead><tr><th>Category</th><th>Best version</th><th>Average shipping</th><th>Tries</th></tr></thead><tbody>${cats.map((c) => {
        const b = bestOf(c.fills);
        const tries = Object.values(c.fills).reduce((n, l) => n + l.length, 0);
        return `<tr><td>${esc(c.name)}</td><td>${b ? esc(keyLabel(b.key)) : '–'}</td><td>${b ? '₹' + b.avg : '–'}</td><td>${tries}</td></tr>`;
      }).join('')}</tbody></table>
      <p class="pls-note">From the shipping Meesho showed for your versions. Saved on this device only.</p></section>`;
  }

  // The automatic check in Meesho runs in the PakkaBill Lens extension (laptop Chrome or Edge).
  function checkHtml() {
    if (!S.photos.length) return '';
    const n = S.photos.reduce((a, ph) => a + ph.out.length, 0);
    if (!S.ext) return `<section class="paper pls-card pls-auto"><h2>Check every version in Meesho automatically</h2>
      <p class="pls-note" style="margin-top:0">On a laptop, the free <b>PakkaBill Lens</b> extension (Chrome or Edge) puts each version into Meesho's catalogue upload, reads the shipping Meesho shows and sends it back here, so you see the exact charge for every photo.</p>
      <p><a class="pls-btn pls-btn--ghost" href="/pakkabill-lens.zip" download>⬇ Get PakkaBill Lens</a> <a class="pls-link" href="#/lens">How to install</a></p>
      <p class="pls-note">Already have Lens? Update it to version 2.1 or newer (download it again and load it the same way), then reload this page.</p></section>`;
    return `<section class="paper pls-card pls-auto"><h2>Check every version in Meesho automatically</h2>
      <ol class="pls-tips">
        <li>Tap <b>Send to Meesho check</b> (${n} versions).</li>
        <li>In this browser, open <a href="https://supplier.meesho.com/" target="_blank" rel="noopener">supplier.meesho.com</a> → Catalog Upload → Add Single Catalog. Pick the category and fill the details until Meesho shows a shipping charge.</li>
        <li>In the PakkaBill panel there, tap <b>Check all</b>. Each version goes into Meesho's photo box, and the shipping Meesho shows comes back here.</li>
      </ol>
      <p style="margin:12px 0 0"><button type="button" class="pls-btn" data-send>🔎 Send to Meesho check</button>${S.sent ? ` <span class="pls-note" data-sent>Sent ${S.sent} versions. Results appear here as Meesho shows them.</span>` : ''}</p></section>`;
  }

  let drawing = false;
  function draw() {
    if (!el || drawing) return;
    drawing = true;
    try { render(); } finally { drawing = false; }
  }
  function render() {
    const known = Object.values(store().cats || {}).map((c) => c.name);
    const cats = [...new Set([...known, ...CATS])];
    const per = FILLS.length + (S.styles ? STYLES.length : 0);
    el.innerHTML = `<div class="pls">
      <div class="page-head"><div><h1 class="page-title">Low shipping image</h1><p class="page-sub">Meesho shows a different shipping charge for the same product depending on its main photo. Make clean versions here, check them in Meesho, and keep the cheapest.</p></div></div>
      <section class="paper pls-card"><ol class="pls-steps">
        <li><b>Add your photos</b>PakkaBill finds the product, makes the background white and gives ${per} versions: 8 sizes${S.styles ? ', stickers, a frame and soft colours' : ''}.</li>
        <li><b>Check them in Meesho</b>Automatically with PakkaBill Lens on a laptop, or by hand: add a version as the first photo in catalogue upload and see the shipping.</li>
        <li><b>Keep the cheapest</b>The cheapest is marked, and PakkaBill remembers the best version for that category.</li>
      </ol></section>
      <section class="paper pls-card">
        <label class="pls-drop" tabindex="0"><input type="file" accept="image/*" multiple class="pls-sr" data-files><b>📷 Add product photos</b><span>Tap to choose, or drop photos here. Several at once is fine. Photos stay on your device.</span></label>
        <div class="pls-opts">
          <label>Category<input list="pls-cats" data-cat value="${esc(S.cat)}" placeholder="e.g. Blouse" maxlength="40"><datalist id="pls-cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
          <label>Background<select data-opt="bg"><option value="white"${S.bg === 'white' ? ' selected' : ''}>Clean white (recommended)</option><option value="keep"${S.bg === 'keep' ? ' selected' : ''}>Keep my background</option></select></label>
          <label>Cleaning<select data-opt="strength"><option value="gentle"${S.strength === 'gentle' ? ' selected' : ''}>Gentle (white or light products)</option><option value="normal"${S.strength === 'normal' ? ' selected' : ''}>Normal</option><option value="strong"${S.strength === 'strong' ? ' selected' : ''}>Strong (shadows, uneven light)</option></select></label>
          <label>Photo size<select data-opt="size"><option value="1000"${S.size === 1000 ? ' selected' : ''}>1000 × 1000</option><option value="1500"${S.size === 1500 ? ' selected' : ''}>1500 × 1500</option></select></label>
          <label>Versions<select data-opt="styles"><option value="1"${S.styles ? ' selected' : ''}>Sizes, stickers and colours</option><option value="0"${S.styles ? '' : ' selected'}>Sizes only</option></select></label>
        </div>
        <div data-hint>${hintHtml()}</div>
      </section>
      ${S.photos.length ? `<div class="pls-bar"><b>${S.photos.length} photo${S.photos.length > 1 ? 's' : ''} · ${S.photos.reduce((a, ph) => a + ph.out.length, 0)} versions</b><span><button type="button" class="pls-btn" data-zip>⬇ Download all (ZIP)</button> <button type="button" class="pls-btn pls-btn--ghost" data-clear>Clear</button></span></div>` : ''}
      ${S.busy ? `<p class="pls-busy">Making versions of ${S.busy} photo${S.busy > 1 ? 's' : ''}…</p>` : ''}
      <div data-check>${checkHtml()}</div>
      ${S.photos.map(photoHtml).join('')}
      <div data-mine>${mineHtml()}</div>
      <section class="paper pls-card"><h2>Good to know</h2><ul class="pls-tips">
        <li>Only Meesho's panel knows the real shipping charge; PakkaBill reads it from there (or you type it). It does not guess.</li>
        <li>Use the cheapest version as the <b>first (main) photo</b>. Your other photos can stay as they are.</li>
        <li>Enter the real weight and package size in Meesho. A lower weight than the real one can lead to weight disputes and penalties.</li>
        <li>Stickers are shapes only. Words, logos, prices or watermarks on the main photo can get a catalogue rejected.</li>
        <li>White or very light products: choose Gentle cleaning so the product's edges stay.</li>
      </ul></section>
    </div>`;
    wire();
  }

  // A result from Meesho (or typed in) for one version of one photo.
  function setShip(ph, key, v) {
    if (ph.ship[key] > 0) forget(S.cat, key, ph.ship[key]);
    if (v > 0 && v < 5000) { ph.ship[key] = v; remember(S.cat, key, v); } else delete ph.ship[key];
  }
  function refreshMarks() {
    S.photos.forEach((ph) => { const card = el && el.querySelector(`[data-ph="${ph.id}"]`); if (card) mark(card, ph); });
    if (!el) return;
    el.querySelector('[data-hint]').innerHTML = hintHtml();
    el.querySelector('[data-mine]').innerHTML = mineHtml();
  }

  const asDataUrl = (blob) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });

  function wireCheck() {
    el.querySelector('[data-send]')?.addEventListener('click', async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      b.textContent = 'Sending…';
      const items = [];
      for (const ph of S.photos) for (const o of ph.out) items.push({ id: `${ph.id}|${o.key}`, label: `${ph.name} · ${o.label}`, name: fileName(ph, o.key), data: await asDataUrl(o.blob) });
      window.postMessage({ type: 'pb-ship-queue', cat: S.cat, items }, location.origin);
      S.sent = items.length;
      el.querySelector('[data-check]').innerHTML = checkHtml();
      wireCheck();
      toast(`Sent ${items.length} versions. Open Meesho's catalogue upload in this browser and tap Check all in the PakkaBill panel.`);
    });
  }

  function wire() {
    const fileIn = el.querySelector('[data-files]');
    const drop = el.querySelector('.pls-drop');
    fileIn.addEventListener('change', () => { addFiles(fileIn.files); fileIn.value = ''; });
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
    drop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));
    const cat = el.querySelector('[data-cat]');
    cat.addEventListener('change', () => { S.cat = cat.value.trim(); draw(); });
    el.querySelectorAll('[data-opt]').forEach((s) => s.addEventListener('change', async () => {
      const k = s.dataset.opt;
      S[k] = k === 'size' ? Number(s.value) : k === 'styles' ? s.value === '1' : s.value;
      if (!S.photos.length) return draw();
      S.busy = S.photos.length;
      draw();
      for (const ph of S.photos) { await build(ph); S.busy--; }
      draw();
    }));
    el.querySelector('[data-clear]')?.addEventListener('click', () => {
      S.photos.forEach((ph) => { URL.revokeObjectURL(ph.url); ph.out.forEach((o) => URL.revokeObjectURL(o.url)); });
      S.photos = [];
      S.sent = 0;
      draw();
    });
    el.querySelector('[data-zip]')?.addEventListener('click', async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try {
        const files = [];
        for (const ph of S.photos) for (const o of ph.out) files.push({ name: fileName(ph, o.key), data: new Uint8Array(await o.blob.arrayBuffer()) });
        const url = URL.createObjectURL(new Blob(zipParts(files), { type: 'application/zip' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'meesho-low-shipping-photos.zip';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } finally { b.disabled = false; }
    });
    wireCheck();
    el.querySelectorAll('[data-ph]').forEach((card) => {
      const ph = S.photos.find((p) => p.id === card.dataset.ph);
      card.querySelector('[data-del]').addEventListener('click', () => {
        URL.revokeObjectURL(ph.url);
        ph.out.forEach((o) => URL.revokeObjectURL(o.url));
        S.photos = S.photos.filter((p) => p !== ph);
        draw();
      });
      card.querySelectorAll('input[data-key]').forEach((inp) => inp.addEventListener('change', () => {
        const v = Math.round(Number(inp.value));
        setShip(ph, inp.dataset.key, v);
        if (v > 0 && !S.cat) toast('Add a category above so PakkaBill can remember what works for it.');
        refreshMarks();
      }));
    });
  }

  // Messages from the PakkaBill Lens extension (its bridge runs on this site).
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('message', (e) => {
      if (e.source !== window || e.origin !== location.origin || !e.data || typeof e.data !== 'object') return;
      const m = e.data;
      if (m.type === 'pb-ship-state') {
        const had = !!S.ext;
        S.ext = String(m.version || '1');
        if (!had && el) { const box = el.querySelector('[data-check]'); if (box) { box.innerHTML = checkHtml(); wireCheck(); } }
      } else if (m.type === 'pb-ship-results' && m.results && typeof m.results === 'object') {
        let n = 0;
        for (const [id, v] of Object.entries(m.results)) {
          const [pid, key] = String(id).split('|');
          const ph = S.photos.find((p) => p.id === pid);
          const r = Math.round(Number(v));
          if (ph && key && r > 0 && ph.ship[key] !== r) { setShip(ph, key, r); n++; }
        }
        if (n) refreshMarks();
      }
    });
  }

  root.pbLowShipMount = function (target) {
    if (!document.getElementById('pls-css')) {
      const st = document.createElement('style');
      st.id = 'pls-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    el = target;
    draw();
    window.postMessage({ type: 'pb-ship-hello' }, location.origin); // PakkaBill Lens answers when installed
  };
})();
