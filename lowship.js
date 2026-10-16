// PakkaBill: low shipping images for Meesho.
// Meesho works out a product's shipping charge from its main catalogue photo, so the same product can
// show a different charge for photos that look almost the same. Tools that cut this charge make many
// versions of the seller's own photo with small changes and test each one in Meesho's catalogue
// upload, keeping the cheapest. This does the same, professionally: the product stays full size and
// every version looks like the seller's photo: a slight zoom or crop, a 1-3° turn, a small shift,
// a little more light or warmth, a clean white background, a thin border, sharpening, JPEG quality.
// The seller's own photo is version 1, so the saving is clear. With PakkaBill Lens on a laptop each
// version is checked in Meesho and the real shipping shows here live; on a phone the seller types it.
// Everything runs in the browser: photos never leave the device.
// The app calls window.pbLowShipMount(el) when #/lowship opens. window.PBShip is the engine (tested in Node).
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;

  /* ======================================================= engine (no DOM) */

  // The versions, most useful first: 12, 24 or 40 of them are made. Every change is small enough that
  // the photo still looks the same to a buyer. zoom > 1 crops in, < 1 leaves a thin margin; rot in
  // degrees; dx, dy as a share of the photo; light -1..1 (share of full white); contrast and sat as
  // multipliers; warm -1..1; sharp 0..1; white: plain white background; border: share of the photo;
  // q: JPEG quality.
  const TWEAKS = [
    { key: 'orig', label: 'Your photo' },
    { key: 'zin3', label: 'Zoom in 3%', zoom: 1.03 },
    { key: 'zout3', label: 'Zoom out 3%', zoom: 0.97 },
    { key: 'white', label: 'Clean white background', white: true },
    { key: 'turn2', label: 'Turned 2°', rot: 2 },
    { key: 'turn-2', label: 'Turned −2°', rot: -2 },
    { key: 'zin6', label: 'Zoom in 6%', zoom: 1.06 },
    { key: 'zout6', label: 'Zoom out 6%', zoom: 0.94 },
    { key: 'bright', label: 'Brighter', light: 0.05 },
    { key: 'border', label: 'Thin white border', border: 0.025 },
    { key: 'up', label: 'Moved up a little', dy: -0.03 },
    { key: 'warm', label: 'Warmer colour', warm: 0.6 },
    { key: 'sharp', label: 'Sharper', sharp: 0.45 },
    { key: 'q78', label: 'Lighter file', q: 0.78 },
    { key: 'down', label: 'Moved down a little', dy: 0.03 },
    { key: 'left', label: 'Moved left a little', dx: -0.03 },
    { key: 'right', label: 'Moved right a little', dx: 0.03 },
    { key: 'contrast', label: 'More contrast', contrast: 1.08 },
    { key: 'rich', label: 'Richer colour', sat: 1.1 },
    { key: 'cool', label: 'Cooler colour', warm: -0.6 },
    { key: 'soft', label: 'Softer light', light: -0.04 },
    { key: 'white-zin4', label: 'White background, zoom in 4%', white: true, zoom: 1.04 },
    { key: 'turn1-zin3', label: 'Turned 1°, zoom in 3%', rot: 1, zoom: 1.03 },
    { key: 'white-bright', label: 'White background, brighter', white: true, light: 0.04 },
    { key: 'zin9', label: 'Zoom in 9%', zoom: 1.09 },
    { key: 'zout9', label: 'Zoom out 9%', zoom: 0.91 },
    { key: 'turn3', label: 'Turned 3°', rot: 3 },
    { key: 'turn-3', label: 'Turned −3°', rot: -3 },
    { key: 'grey-border', label: 'Thin light grey border', border: 0.02, borderColor: [236, 236, 238] },
    { key: 'q65', label: 'Lightest file', q: 0.65 },
    { key: 'muted', label: 'Softer colour', sat: 0.92 },
    { key: 'flat', label: 'Less contrast', contrast: 0.94 },
    { key: 'warm-bright', label: 'Warmer and brighter', warm: 0.5, light: 0.04 },
    { key: 'turn-1-zout3', label: 'Turned −1°, zoom out 3%', rot: -1, zoom: 0.97 },
    { key: 'up-zin3', label: 'Moved up, zoom in 3%', dy: -0.025, zoom: 1.03 },
    { key: 'down-zout3', label: 'Moved down, zoom out 3%', dy: 0.025, zoom: 0.97 },
    { key: 'sharp-contrast', label: 'Sharper, more contrast', sharp: 0.35, contrast: 1.05 },
    { key: 'white-border', label: 'White background and border', white: true, border: 0.025 },
    { key: 'brighter', label: 'Much brighter', light: 0.09 },
    { key: 'mirror', label: 'Mirror image', flip: true },
  ];
  const LEVELS = { quick: 12, normal: 24, deep: 40 };

  // The first n versions (the seller's own photo is always first).
  const tweaks = (n) => TWEAKS.slice(0, Math.max(1, Math.min(TWEAKS.length, n || LEVELS.normal)));
  const keyLabel = (key) => (TWEAKS.find((t) => t.key === key) || { label: 'An older version' }).label;

  // How much bigger a w×h photo must be drawn, turned by deg, so its corners still fill the frame.
  function coverScale(w, h, deg) {
    const r = (Math.abs(deg) * Math.PI) / 180;
    return Math.cos(r) + Math.max(w / h, h / w) * Math.sin(r);
  }

  // Light, contrast, colour and warmth on RGBA pixels, in place. Leaves pixels unchanged when t has none.
  function adjustPixels(d, t) {
    const light = (t.light || 0) * 255, con = t.contrast || 1, sat = t.sat == null ? 1 : t.sat, warm = (t.warm || 0) * 12;
    if (!light && con === 1 && sat === 1 && !warm) return d;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i + 1], b = d[i + 2];
      if (sat !== 1) { const y = 0.299 * r + 0.587 * g + 0.114 * b; r = y + (r - y) * sat; g = y + (g - y) * sat; b = y + (b - y) * sat; }
      if (con !== 1) { r = (r - 128) * con + 128; g = (g - 128) * con + 128; b = (b - 128) * con + 128; }
      r += light + warm; g += light + warm * 0.25; b += light - warm;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; // Uint8ClampedArray rounds and clamps
    }
    return d;
  }

  // Sharpening (unsharp mask with the 4 neighbours) on RGBA pixels of a w-wide image, in place.
  function sharpen(d, w, h, amount) {
    if (!(amount > 0)) return d;
    const src = new Uint8ClampedArray(d);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v = src[i + c], n = src[i + c - w * 4] + src[i + c + w * 4] + src[i + c - 4] + src[i + c + 4];
        d[i + c] = v + amount * (4 * v - n);
      }
    }
    return d;
  }

  // Output size: "photo" keeps the photo's shape (longer side 1000-1500 px), "square" is 1000×1000.
  function outSize(w, h, shape) {
    if (shape === 'square') return { w: 1000, h: 1000 };
    const long = Math.max(w, h), target = Math.min(1500, Math.max(1000, long)), k = target / long;
    return { w: Math.round(w * k), h: Math.round(h * k) };
  }

  // Best version for a category from the seller's Meesho results: lowest average shipping
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

  // One photo's results: its own price, the cheapest version and the saving per order.
  function summary(ship) {
    const keys = Object.keys(ship || {}).filter((k) => ship[k] > 0);
    if (!keys.length) return null;
    const low = Math.min(...keys.map((k) => ship[k]));
    const best = keys.filter((k) => ship[k] === low);
    const own = ship.orig > 0 ? ship.orig : null;
    return { low, best, own, save: own != null ? own - low : null, checked: keys.length };
  }

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

  const engine = { TWEAKS, LEVELS, STRENGTH, tweaks, keyLabel, coverScale, adjustPixels, sharpen, outSize, borderColor, backgroundMask, productBox, analyze, bestOf, summary, rupeesIn, crc32, zipParts };
  root.PBShip = engine;
  if (typeof document === 'undefined') return;

  /* ======================================================= browser: photos in, versions out */

  const SMALL = 600; // analysis size
  const MAX_SRC = 2400; // bigger photos are scaled down first
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

  // The photo's background colour, and a copy with the background made plain white (product untouched,
  // same size and place). null when the photo has a busy background.
  function study(src, strength) {
    const s = Math.min(1, SMALL / Math.max(src.width, src.height));
    const sm = canvas(Math.max(1, Math.round(src.width * s)), Math.max(1, Math.round(src.height * s)));
    const sx = sm.getContext('2d', { willReadFrequently: true });
    sx.drawImage(src, 0, 0, sm.width, sm.height);
    const a = analyze(sx.getImageData(0, 0, sm.width, sm.height), { strength });
    if (!a.mask) return { bg: a.bg, white: null };
    const w = canvas(src.width, src.height), wx = w.getContext('2d', { willReadFrequently: true });
    wx.drawImage(src, 0, 0);
    const id = wx.getImageData(0, 0, w.width, w.height), d = id.data, m = a.mask, W = sm.width, H = sm.height;
    const fx = src.width / W, fy = src.height / H;
    const at = (x, y) => m[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
    for (let y = 0; y < w.height; y++) {
      const fyv = (y + 0.5) / fy - 0.5, y0 = Math.floor(fyv), ty = fyv - y0;
      for (let x = 0; x < w.width; x++) {
        const fxv = (x + 0.5) / fx - 0.5, x0 = Math.floor(fxv), tx = fxv - x0;
        const v = (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
        if (v <= 0) continue;
        const i = (y * w.width + x) * 4; // blend towards white across the soft edge
        d[i] += (255 - d[i]) * v; d[i + 1] += (255 - d[i + 1]) * v; d[i + 2] += (255 - d[i + 2]) * v;
      }
    }
    wx.putImageData(id, 0, 0);
    return { bg: a.bg, white: w };
  }

  // One version of the photo, full size, with the tweak t.
  function render(ph, t, shape) {
    const src = t.white && ph.white ? ph.white : ph.src;
    const { w: W, h: H } = outSize(src.width, src.height, shape);
    const c = canvas(W, H), x = c.getContext('2d', { willReadFrequently: true });
    const bg = t.white && ph.white ? [255, 255, 255] : ph.bg;
    x.fillStyle = `rgb(${(t.borderColor || bg).join(',')})`;
    x.fillRect(0, 0, W, H);
    const border = t.border || 0;
    if (border) { x.fillStyle = `rgb(${bg.join(',')})`; }
    // fit the photo in (same shape: fills it; square: as big as fits), then the tweak
    const fit = Math.min(W / src.width, H / src.height);
    let k = fit * (t.zoom || 1) * (1 - 2 * border);
    const zoomIn = (t.zoom || 1) >= 1 && !border;
    if (zoomIn && t.rot) k *= coverScale(src.width, src.height, t.rot); // turned: no empty corners
    if (zoomIn && (t.dx || t.dy)) k *= 1 + 2 * Math.max(Math.abs(t.dx || 0), Math.abs(t.dy || 0)); // moved: no empty edge
    x.save();
    if (border) { const b = Math.round(Math.min(W, H) * border); x.beginPath(); x.rect(b, b, W - 2 * b, H - 2 * b); x.clip(); x.fillRect(b, b, W - 2 * b, H - 2 * b); }
    x.translate(W / 2 + (t.dx || 0) * W, H / 2 + (t.dy || 0) * H);
    if (t.rot) x.rotate((t.rot * Math.PI) / 180);
    if (t.flip) x.scale(-1, 1);
    x.scale(k, k);
    x.imageSmoothingQuality = 'high';
    x.drawImage(src, -src.width / 2, -src.height / 2);
    x.restore();
    if (t.light || t.contrast || t.sat != null || t.warm || t.sharp) {
      const id = x.getImageData(0, 0, W, H);
      adjustPixels(id.data, t);
      if (t.sharp) sharpen(id.data, W, H, t.sharp);
      x.putImageData(id, 0, 0);
    }
    return c;
  }
  async function jpeg(c, q0) {
    for (const q of [q0 || 0.92, 0.86, 0.8, 0.72, 0.64]) {
      if (q > (q0 || 0.92)) continue;
      const b = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', q));
      if (b && (b.size <= MAX_BYTES || q <= 0.64)) return b;
    }
    return null;
  }

  /* ---------- the seller's results: which version gave the lowest shipping, per category */
  const KEY = 'pb-lowship2';
  const store = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
  const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } };
  const catKey = (c) => String(c || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40);
  function remember(cat, key, rupees) {
    const k = catKey(cat);
    if (!k || !(rupees > 0)) return;
    const s = store();
    s.cats = s.cats || {};
    const c = (s.cats[k] = s.cats[k] || { name: String(cat).trim(), results: {} });
    const list = (c.results[key] = c.results[key] || []);
    list.push(Math.round(rupees));
    if (list.length > 20) list.shift();
    save(s);
  }
  function forget(cat, key, rupees) {
    const s = store(), c = s.cats && s.cats[catKey(cat)];
    const list = c && c.results[key];
    if (!list) return;
    const i = list.lastIndexOf(Math.round(rupees));
    if (i >= 0) list.splice(i, 1);
    save(s);
  }
  const bestFor = (cat) => { const c = (store().cats || {})[catKey(cat)]; return c ? bestOf(Object.fromEntries(Object.entries(c.results).filter(([k]) => k !== 'orig'))) : null; };

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
.pls-sum{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;background:var(--carbon-tint);border-radius:12px;padding:10px 14px;margin:0 0 12px;font-size:14px}
.pls-sum b{font-size:18px}
.pls-sum .pls-save{color:var(--green,#12714b);font-weight:700}
.pls-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
.pls-v{position:relative;border:1.5px solid var(--rule);border-radius:14px;padding:8px;display:grid;gap:6px;background:var(--paper)}
.pls-v img{width:100%;aspect-ratio:1;object-fit:contain;border-radius:8px;background:#f6f6f6;border:1px solid var(--rule-soft,#eee)}
.pls-v__top{display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:12.5px;font-weight:700;min-height:2.6em}
.pls-v__top a{font-size:12px;color:var(--carbon);text-decoration:none;font-weight:700;flex:none}
.pls-v__ship{display:flex;align-items:center;gap:4px;font-size:12.5px;color:var(--ink-3)}
.pls-v__ship input{width:100%;min-width:0;font:inherit;font-size:15px;font-weight:700;padding:6px 8px;border:1.5px solid var(--rule);border-radius:8px;background:var(--paper);color:var(--ink)}
.pls-v__ship input.is-live{border-color:var(--green,#12714b)}
.pls-v.is-best{border-color:var(--green);box-shadow:inset 0 0 0 1px var(--green)}
.pls-v.is-tip{border-color:var(--carbon)}
.pls-v.is-now{border-color:var(--amber,#b26a00);box-shadow:inset 0 0 0 1px var(--amber,#b26a00)}
.pls-tag{position:absolute;top:-9px;left:10px;font-size:11px;font-weight:700;color:#fff;background:var(--carbon);padding:2px 8px;border-radius:999px;white-space:nowrap}
.pls-v.is-best .pls-tag{background:var(--green)}
.pls-v.is-now .pls-tag{background:var(--amber,#b26a00)}
.pls-v.is-orig .pls-tag{background:#555}
.pls-note{font-size:13px;color:var(--ink-3);margin:10px 0 0}
.pls-tips{margin:0;padding-left:20px;display:grid;gap:6px;font-size:14px;color:var(--ink-2)}
.pls-mine{width:100%;border-collapse:collapse;font-size:14px}
.pls-mine td,.pls-mine th{padding:7px 6px;border-bottom:1px solid var(--rule);text-align:left}
.pls-mine th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3)}
.pls-busy{color:var(--ink-3);font-size:14px;padding:6px 0}
.pls-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
.pls-auto{border:1.5px solid var(--carbon)}
.pls-link{color:var(--carbon);font-weight:700;margin-left:8px}
.pls-live{margin-top:12px;display:grid;gap:6px}
.pls-prog{height:8px;border-radius:999px;background:var(--rule);overflow:hidden}
.pls-prog i{display:block;height:100%;background:var(--green,#12714b);transition:width .3s}
.pls-live p{margin:0;font-size:14px}
`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const CATS = ['Blouse', 'Saree', 'Kurti', 'Kurta set', 'Dupatta', 'Lehenga', 'Top', 'Dress', 'Jewellery', 'Bag', 'Footwear', 'Home decor'];
  const toast = (m, bad) => { if (window.pbToast) return window.pbToast(m, bad); const t = document.createElement('div'); t.className = 'pbp-toast' + (bad ? ' is-bad' : ''); t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); };

  let el = null;
  // live: what PakkaBill Lens reports while it checks in Meesho ({ current, done, total })
  const S = { shape: 'photo', level: 'normal', strength: 'normal', cat: '', photos: [], busy: 0, ext: null, sent: 0, live: null };

  async function addFiles(files) {
    const list = [...files].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
    if (!list.length) return toast('Choose photos (JPG, PNG or WebP).', true);
    S.busy += list.length;
    draw();
    for (const file of list) {
      try {
        const { im, url } = await loadImage(file);
        const ph = { id: Math.random().toString(36).slice(2, 10), name: file.name.replace(/\.[^.]+$/, '') || 'photo', url, src: sourceCanvas(im), ship: {}, live: {}, out: [] };
        await build(ph);
        S.photos.push(ph);
      } catch (e) {
        toast(e.message || 'Could not open this photo.', true);
      }
      S.busy--;
      draw();
    }
  }

  // Makes the versions of one photo with the current options.
  async function build(ph) {
    ph.out.forEach((o) => URL.revokeObjectURL(o.url));
    const st = study(ph.src, S.strength);
    ph.bg = st.bg;
    ph.white = st.white;
    ph.out = [];
    for (const t of tweaks(LEVELS[S.level])) {
      if (t.white && !ph.white) continue; // busy background: no clean white version
      const blob = await jpeg(render(ph, t, S.shape), t.q);
      ph.out.push({ ...t, blob, url: URL.createObjectURL(blob) });
      await new Promise((r) => setTimeout(r)); // keep the page responsive
    }
  }

  const fileName = (ph, key) => `${ph.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'photo'}-meesho-${key}.jpg`;

  function sumHtml(ph) {
    const s = summary(ph.ship);
    if (!s) return '';
    const names = s.best.map((k) => esc(keyLabel(k))).join(', ');
    return `<div class="pls-sum"><span>Cheapest: <b>₹${s.low}</b> · ${names}</span>${s.own != null ? `<span>Your photo: <b>₹${s.own}</b></span>${s.save > 0 ? `<span class="pls-save">You save ₹${s.save} on every order</span>` : '<span>Your own photo is already the cheapest.</span>'}` : ''}<span class="pls-note" style="margin:0">${s.checked} of ${ph.out.length} checked</span></div>`;
  }
  function photoHtml(ph) {
    const best = bestFor(S.cat), s = summary(ph.ship);
    return `<section class="paper pls-photo" data-ph="${ph.id}">
      <div class="pls-photo__head"><img src="${ph.url}" alt=""><div><b>${esc(ph.name)}</b>
        <span>${ph.out.length} versions, product kept full size. ${ph.white ? 'Plain background found, so a clean white version is included.' : 'Busy background: no white-background version.'}</span></div>
        <button type="button" class="pls-x" data-del aria-label="Remove this photo">×</button></div>
      <div data-sum>${sumHtml(ph)}</div>
      <div class="pls-grid">${ph.out.map((o) => tileHtml(ph, o, s, best)).join('')}</div>
    </section>`;
  }
  function tileState(ph, key, s, best) {
    const now = S.live && S.live.current === `${ph.id}|${key}`;
    const isBest = !!s && ph.ship[key] === s.low;
    const tip = !s && best && best.key === key;
    const tag = now ? 'Checking in Meesho…' : isBest ? 'Cheapest ✓' : key === 'orig' ? 'Your photo' : tip ? 'Best last time' : '';
    return { cls: now ? 'is-now' : isBest ? 'is-best' : key === 'orig' ? 'is-orig' : tip ? 'is-tip' : '', tag };
  }
  function tileHtml(ph, o, s, best) {
    const v = ph.ship[o.key] || '';
    const st = tileState(ph, o.key, s, best);
    return `<div class="pls-v ${st.cls}" data-key="${esc(o.key)}">${st.tag ? `<span class="pls-tag">${st.tag}</span>` : ''}
      <img src="${o.url}" alt="${esc(o.label)}" loading="lazy">
      <div class="pls-v__top"><span>${esc(o.label)}</span><a href="${o.url}" download="${esc(fileName(ph, o.key))}">Download</a></div>
      <label class="pls-v__ship"><span>₹</span><input type="number" inputmode="numeric" min="0" max="5000" step="1" placeholder="Meesho shipping" value="${esc(v)}" class="${ph.live[o.key] ? 'is-live' : ''}" data-key="${esc(o.key)}" aria-label="Shipping Meesho shows for ${esc(o.label)}"></label>
    </div>`;
  }

  // Updates marks, prices and the summary of one photo without redrawing the page.
  function mark(card, ph) {
    const best = bestFor(S.cat), s = summary(ph.ship);
    card.querySelectorAll('.pls-v').forEach((v) => {
      const key = v.dataset.key, inp = v.querySelector('input'), st = tileState(ph, key, s, best);
      if (document.activeElement !== inp) inp.value = ph.ship[key] || '';
      inp.classList.toggle('is-live', !!ph.live[key]);
      v.className = `pls-v ${st.cls}`;
      v.querySelector('.pls-tag')?.remove();
      if (st.tag) v.insertAdjacentHTML('afterbegin', `<span class="pls-tag">${st.tag}</span>`);
    });
    card.querySelector('[data-sum]').innerHTML = sumHtml(ph);
  }
  function hintHtml() {
    const best = bestFor(S.cat);
    return best ? `<p class="pls-note">For <b>${esc(S.cat)}</b>, "${esc(keyLabel(best.key))}" gave you the lowest shipping so far (average ₹${best.avg} from ${best.tries} tr${best.tries === 1 ? 'y' : 'ies'}). It is marked "Best last time".</p>`
      : S.cat ? `<p class="pls-note">No results for ${esc(S.cat)} yet.</p>` : '';
  }
  function mineHtml() {
    const cats = Object.values(store().cats || {}).filter((c) => Object.values(c.results).some((l) => l.length));
    if (!cats.length) return '';
    return `<section class="paper pls-card"><h2>What worked for you</h2>
      <table class="pls-mine"><thead><tr><th>Category</th><th>Best version</th><th>Average shipping</th><th>Your photo</th></tr></thead><tbody>${cats.map((c) => {
        const b = bestOf(Object.fromEntries(Object.entries(c.results).filter(([k]) => k !== 'orig')));
        const o = c.results.orig && c.results.orig.length ? Math.round(c.results.orig.reduce((a, x) => a + x, 0) / c.results.orig.length) : null;
        return `<tr><td>${esc(c.name)}</td><td>${b ? esc(keyLabel(b.key)) : '–'}</td><td>${b ? '₹' + b.avg : '–'}</td><td>${o != null ? '₹' + o : '–'}</td></tr>`;
      }).join('')}</tbody></table>
      <p class="pls-note">From the shipping Meesho showed. Saved on this device only.</p></section>`;
  }

  // The live check in Meesho runs in the PakkaBill Lens extension (laptop Chrome or Edge).
  function liveHtml() {
    const total = S.photos.reduce((a, ph) => a + ph.out.length, 0);
    const done = S.photos.reduce((a, ph) => a + Object.keys(ph.live).length, 0);
    if (!S.sent) return '';
    const all = S.photos.map((ph) => summary(ph.ship)).filter(Boolean);
    const low = all.length ? Math.min(...all.map((s) => s.low)) : null;
    const busy = S.live && S.live.current;
    return `<div class="pls-live"><div class="pls-prog" aria-hidden="true"><i style="width:${total ? Math.round((done / total) * 100) : 0}%"></i></div>
      <p><b>${done} of ${total}</b> checked in Meesho${low != null ? ` · cheapest so far <b>₹${low}</b>` : ''}${busy ? ' · checking now…' : done && done >= total ? ' · all done' : done ? '' : ' · open Meesho\'s catalogue upload and tap Check all in the PakkaBill panel'}</p></div>`;
  }
  function checkHtml() {
    if (!S.photos.length) return '';
    const n = S.photos.reduce((a, ph) => a + ph.out.length, 0);
    if (!S.ext) return `<section class="paper pls-card pls-auto"><h2>See Meesho's real shipping for every version</h2>
      <p class="pls-note" style="margin-top:0">On a laptop, the free <b>PakkaBill Lens</b> extension (Chrome or Edge) puts each version into Meesho's catalogue upload, reads the shipping Meesho shows and sends it here live. On a phone, upload a version in Meesho and type the shipping under it.</p>
      <p><a class="pls-btn pls-btn--ghost" href="/pakkabill-lens.zip" download>⬇ Get PakkaBill Lens</a> <a class="pls-link" href="#/lens">How to install</a></p>
      <p class="pls-note">Already have Lens? Update it to version 2.2 (download it again and load it the same way), then reload this page.</p></section>`;
    return `<section class="paper pls-card pls-auto"><h2>See Meesho's real shipping for every version</h2>
      <ol class="pls-tips">
        <li>Tap <b>Check in Meesho</b> (${n} versions).</li>
        <li>In this browser, open <a href="https://supplier.meesho.com/" target="_blank" rel="noopener">supplier.meesho.com</a> → Catalog Upload → Add Single Catalog. Pick the category and fill the details until Meesho shows a shipping charge.</li>
        <li>In the PakkaBill panel there, tap <b>Check all</b>. Each version's shipping appears here as Meesho shows it.</li>
      </ol>
      <p style="margin:12px 0 0"><button type="button" class="pls-btn" data-send>🔎 Check in Meesho</button></p>
      <div data-live>${liveHtml()}</div></section>`;
  }

  let drawing = false;
  function draw() {
    if (!el || drawing) return;
    drawing = true;
    try { paint(); } finally { drawing = false; }
  }
  function paint() {
    const known = Object.values(store().cats || {}).map((c) => c.name);
    const cats = [...new Set([...known, ...CATS])];
    el.innerHTML = `<div class="pls">
      <div class="page-head"><div><h1 class="page-title">Low shipping image</h1><p class="page-sub">Meesho can show a different shipping charge for photos that look almost the same. PakkaBill makes professional versions of your photo, checks each one's real shipping in Meesho, and shows you the cheapest.</p></div></div>
      <section class="paper pls-card"><ol class="pls-steps">
        <li><b>Add your photo</b>Your product stays full size. PakkaBill makes ${LEVELS[S.level]} versions with small changes: a slight zoom, a small turn, light, colour, a clean white background.</li>
        <li><b>Check in Meesho</b>With PakkaBill Lens on a laptop, each version goes into Meesho's catalogue upload and its real shipping shows here live.</li>
        <li><b>Use the cheapest</b>Download it and use it as the main photo. PakkaBill remembers what worked for each category.</li>
      </ol></section>
      <section class="paper pls-card">
        <label class="pls-drop" tabindex="0"><input type="file" accept="image/*" multiple class="pls-sr" data-files><b>📷 Add product photos</b><span>Your normal catalogue photo. Several at once is fine. Photos stay on your device.</span></label>
        <div class="pls-opts">
          <label>Category<input list="pls-cats" data-cat value="${esc(S.cat)}" placeholder="e.g. Blouse" maxlength="40"><datalist id="pls-cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
          <label>Versions<select data-opt="level"><option value="quick"${S.level === 'quick' ? ' selected' : ''}>12 (quick)</option><option value="normal"${S.level === 'normal' ? ' selected' : ''}>24 (recommended)</option><option value="deep"${S.level === 'deep' ? ' selected' : ''}>40 (most savings)</option></select></label>
          <label>Shape<select data-opt="shape"><option value="photo"${S.shape === 'photo' ? ' selected' : ''}>Same as my photo</option><option value="square"${S.shape === 'square' ? ' selected' : ''}>Square 1000 × 1000</option></select></label>
          <label>White background<select data-opt="strength"><option value="gentle"${S.strength === 'gentle' ? ' selected' : ''}>Gentle (white or light products)</option><option value="normal"${S.strength === 'normal' ? ' selected' : ''}>Normal</option><option value="strong"${S.strength === 'strong' ? ' selected' : ''}>Strong (shadows, uneven light)</option></select></label>
        </div>
        <div data-hint>${hintHtml()}</div>
      </section>
      ${S.photos.length ? `<div class="pls-bar"><b>${S.photos.length} photo${S.photos.length > 1 ? 's' : ''} · ${S.photos.reduce((a, ph) => a + ph.out.length, 0)} versions</b><span><button type="button" class="pls-btn pls-btn--ghost" data-best>⬇ Cheapest of each</button> <button type="button" class="pls-btn pls-btn--ghost" data-zip>⬇ All (ZIP)</button> <button type="button" class="pls-btn pls-btn--ghost" data-clear>Clear</button></span></div>` : ''}
      ${S.busy ? `<p class="pls-busy">Making versions of ${S.busy} photo${S.busy > 1 ? 's' : ''}…</p>` : ''}
      <div data-check>${checkHtml()}</div>
      ${S.photos.map(photoHtml).join('')}
      <div data-mine>${mineHtml()}</div>
      <section class="paper pls-card"><h2>Good to know</h2><ul class="pls-tips">
        <li>The shipping is Meesho's own number, read from Meesho's catalogue upload. PakkaBill never guesses it.</li>
        <li>Use the cheapest version as the <b>first (main) photo</b>. Your other photos can stay as they are.</li>
        <li>Every version keeps your product full size and true to life, so buyers see what they get.</li>
        <li>Enter the real weight and package size in Meesho. A lower weight than the real one can lead to weight disputes and penalties.</li>
        <li>"Mirror image" (in 40 versions) flips the photo: skip it if your product has writing or a logo.</li>
      </ul></section>
    </div>`;
    wire();
  }

  // A result for one version of one photo: from Meesho (live) or typed in.
  function setShip(ph, key, v, live) {
    if (ph.ship[key] > 0) forget(S.cat, key, ph.ship[key]);
    if (v > 0 && v < 5000) { ph.ship[key] = v; remember(S.cat, key, v); if (live) ph.live[key] = true; else delete ph.live[key]; } else { delete ph.ship[key]; delete ph.live[key]; }
  }
  function refresh() {
    if (!el) return;
    S.photos.forEach((ph) => { const card = el.querySelector(`[data-ph="${ph.id}"]`); if (card) mark(card, ph); });
    el.querySelector('[data-hint]').innerHTML = hintHtml();
    el.querySelector('[data-mine]').innerHTML = mineHtml();
    const live = el.querySelector('[data-live]');
    if (live) live.innerHTML = liveHtml();
  }

  const asDataUrl = (blob) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
  function download(name, blob) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    if (window.pbNudge) window.pbNudge('image');
  }

  function wireCheck() {
    el.querySelector('[data-send]')?.addEventListener('click', async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      b.textContent = 'Sending…';
      const items = [];
      for (const ph of S.photos) for (const o of ph.out) items.push({ id: `${ph.id}|${o.key}`, label: `${ph.name} · ${o.label}`, name: fileName(ph, o.key), data: await asDataUrl(o.blob) });
      window.postMessage({ type: 'pb-ship-queue', cat: S.cat, items }, location.origin);
      S.sent = items.length;
      S.live = { current: null };
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
      S[s.dataset.opt] = s.value;
      if (!S.photos.length) return draw();
      S.busy = S.photos.length;
      S.sent = 0;
      draw();
      for (const ph of S.photos) { ph.ship = {}; ph.live = {}; await build(ph); S.busy--; }
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
        download('meesho-photo-versions.zip', new Blob(zipParts(files), { type: 'application/zip' }));
      } finally { b.disabled = false; }
    });
    el.querySelector('[data-best]')?.addEventListener('click', async () => {
      const files = [];
      for (const ph of S.photos) {
        const s = summary(ph.ship);
        if (!s) continue;
        const o = ph.out.find((x) => x.key === s.best[0]);
        if (o) files.push({ name: fileName(ph, o.key), data: new Uint8Array(await o.blob.arrayBuffer()), blob: o.blob });
      }
      if (!files.length) return toast('Check the versions in Meesho first (or type their shipping), so PakkaBill knows the cheapest.', true);
      if (files.length === 1) download(files[0].name, files[0].blob);
      else download('meesho-cheapest-photos.zip', new Blob(zipParts(files), { type: 'application/zip' }));
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
        setShip(ph, inp.dataset.key, Math.round(Number(inp.value)), false);
        if (inp.value && !S.cat) toast('Add a category above so PakkaBill can remember what works for it.');
        refresh();
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
        for (const [id, v] of Object.entries(m.results)) {
          const [pid, key] = String(id).split('|');
          const ph = S.photos.find((p) => p.id === pid);
          const r = Math.round(Number(v));
          if (ph && key && r > 0 && ph.ship[key] !== r) setShip(ph, key, r, true);
        }
        S.live = { current: typeof m.current === 'string' ? m.current : null };
        refresh();
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
