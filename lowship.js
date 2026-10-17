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

  // Coloured frames, as other low-shipping tools make: a solid frame round the photo with a thin white
  // line inside it; the product stays whole, a little smaller. Stickers: a small badge in one corner.
  const FRAME_COLORS = [
    ['maroon', 'Maroon', [128, 24, 44]], ['mustard', 'Mustard', [196, 150, 38]], ['navy', 'Navy blue', [28, 46, 112]],
    ['teal', 'Teal', [14, 112, 114]], ['purple', 'Purple', [104, 40, 134]], ['olive', 'Olive', [118, 130, 36]],
    ['brown', 'Brown', [112, 70, 40]], ['pink', 'Pink', [204, 68, 132]], ['green', 'Green', [28, 122, 62]],
    ['grey', 'Grey', [112, 112, 122]], ['red', 'Red', [190, 32, 42]], ['blue', 'Blue', [38, 92, 196]],
  ];
  const FRAMES = FRAME_COLORS.map(([k, name, c], i) => ({ key: 'frame-' + k, label: name + ' frame', frame: 0.03, frameColor: c, zoom: [1, 0.98, 1.02][i % 3] }));
  const STICKERS = [
    ['hot', 'Hot sale'], ['tick', 'Green tick'], ['new', 'New'], ['star', 'Star'], ['best', 'Best seller'], ['trend', 'Trending'],
    ['sale', 'Sale'], ['premium', 'Premium'], ['offer', 'Offer'], ['heart', 'Heart'], ['top', 'Top quality'], ['fast', 'Fast selling'],
  ].map(([k, name], i) => {
    const f = FRAME_COLORS[(i * 5 + 2) % FRAME_COLORS.length];
    return { key: `sticker-${k}-${f[0]}`, label: `${name} sticker, ${f[1].toLowerCase()} frame`, frame: 0.03, frameColor: f[2], sticker: k, corner: ['tr', 'tl', 'br', 'bl'][i % 4] };
  });
  // Looks: natural (the photo only), mix (natural and coloured frames), stickers (frames with stickers).
  const LOOKS = { natural: 'Natural', mix: 'Natural and coloured frames', stickers: 'Frames and stickers' };
  const ALL = [...TWEAKS, ...FRAMES, ...STICKERS];
  // Takes turns from the lists given, skipping repeats, after the seller's own photo.
  function weave(lists) {
    const out = [TWEAKS[0]], seen = new Set(['orig']), pos = lists.map(() => 0);
    for (let more = true; more;) {
      more = false;
      lists.forEach((l, i) => { while (pos[i] < l.length && seen.has(l[pos[i]].key)) pos[i]++; if (pos[i] < l.length) { out.push(l[pos[i]]); seen.add(l[pos[i]].key); pos[i]++; more = true; } });
    }
    return out;
  }
  const ORDER = { natural: TWEAKS, mix: weave([TWEAKS.slice(1), FRAMES]), stickers: weave([STICKERS, FRAMES, TWEAKS.slice(1)]) };
  // The first n versions of a look (the seller's own photo is always first).
  const tweaks = (n, look) => { const l = ORDER[look] || TWEAKS; return l.slice(0, Math.max(1, Math.min(l.length, n || LEVELS.normal))); };
  const keyLabel = (key) => (ALL.find((t) => t.key === key) || { label: 'An older version' }).label;

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

  // Results per category: ship = { versionKey: { categoryKey: rupees } } -> { categoryKey: summary }
  function byCategory(ship) {
    const out = {}, cats = new Set();
    Object.values(ship || {}).forEach((r) => Object.keys(r || {}).forEach((c) => cats.add(c)));
    cats.forEach((c) => { const one = {}; Object.keys(ship).forEach((k) => { if (ship[k] && ship[k][c] > 0) one[k] = ship[k][c]; }); const sm = summary(one); if (sm) out[c] = sm; });
    return out;
  }

  const engine = { TWEAKS, FRAMES, STICKERS, LOOKS, LEVELS, STRENGTH, tweaks, keyLabel, byCategory, coverScale, adjustPixels, sharpen, outSize, borderColor, backgroundMask, productBox, analyze, bestOf, summary, rupeesIn, crc32, zipParts };
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
    const m = Math.min(W, H);
    // a coloured frame: the frame colour all round, a thin white line inside it, the photo inside that
    const border = t.frame ? t.frame + 0.007 : t.border || 0;
    x.fillStyle = `rgb(${(t.frameColor || t.borderColor || bg).join(',')})`;
    x.fillRect(0, 0, W, H);
    if (t.frame) { const f = Math.round(m * t.frame); x.fillStyle = '#fff'; x.fillRect(f, f, W - 2 * f, H - 2 * f); }
    // fit the photo in (same shape: fills it; square: as big as fits), then the tweak
    const fit = Math.min(W / src.width, H / src.height);
    let k = fit * (t.zoom || 1) * (1 - 2 * border);
    const zoomIn = (t.zoom || 1) >= 1 && !border;
    if (zoomIn && t.rot) k *= coverScale(src.width, src.height, t.rot); // turned: no empty corners
    if (zoomIn && (t.dx || t.dy)) k *= 1 + 2 * Math.max(Math.abs(t.dx || 0), Math.abs(t.dy || 0)); // moved: no empty edge
    x.save();
    if (border) { const b = Math.round(m * border); x.beginPath(); x.rect(b, b, W - 2 * b, H - 2 * b); x.clip(); x.fillStyle = `rgb(${bg.join(',')})`; x.fillRect(b, b, W - 2 * b, H - 2 * b); }
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
    if (t.sticker) sticker(x, W, H, t.sticker, t.corner, Math.round(m * border));
    return c;
  }

  // A small badge in one corner, inside the frame.
  function sticker(x, W, H, kind, corner, edge) {
    const m = Math.min(W, H), s = Math.round(m * 0.17), pad = edge + Math.round(m * 0.02);
    const cx = /r/.test(corner) ? W - pad - s / 2 : pad + s / 2, cy = /b/.test(corner) ? H - pad - s / 2 : pad + s / 2;
    const font = (k) => `800 ${Math.round(s * k)}px Arial, Helvetica, sans-serif`;
    const text = (lines, color, k, dy = 0) => {
      x.fillStyle = color; x.font = font(k); x.textAlign = 'center'; x.textBaseline = 'middle';
      lines.forEach((l, i) => x.fillText(l, 0, dy + (i - (lines.length - 1) / 2) * s * k * 1.08));
    };
    const round = (w, h, r) => { x.beginPath(); x.moveTo(-w / 2 + r, -h / 2); x.arcTo(w / 2, -h / 2, w / 2, h / 2, r); x.arcTo(w / 2, h / 2, -w / 2, h / 2, r); x.arcTo(-w / 2, h / 2, -w / 2, -h / 2, r); x.arcTo(-w / 2, -h / 2, w / 2, -h / 2, r); x.closePath(); };
    const burst = (n, r1, r2) => { x.beginPath(); for (let i = 0; i < n * 2; i++) { const a = (Math.PI * i) / n - Math.PI / 2, r = i % 2 ? r2 : r1; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); };
    const shadow = () => { x.shadowColor = 'rgba(0,0,0,.28)'; x.shadowBlur = s * 0.08; x.shadowOffsetY = s * 0.03; };
    const noShadow = () => { x.shadowColor = 'transparent'; x.shadowBlur = 0; x.shadowOffsetY = 0; };
    x.save();
    x.translate(cx, cy);
    shadow();
    if (kind === 'hot' || kind === 'fast' || kind === 'trend') {
      x.rotate(-0.14);
      round(s * 1.25, s * 0.62, s * 0.14);
      x.fillStyle = kind === 'hot' ? '#e0262f' : kind === 'fast' ? '#f26a1b' : '#6a3fd8'; x.fill(); noShadow();
      text(kind === 'hot' ? ['HOT', 'SALE'] : kind === 'fast' ? ['FAST', 'SELLING'] : ['TRENDING'], '#fff', kind === 'trend' ? 0.2 : 0.21);
    } else if (kind === 'tick') {
      x.beginPath(); x.arc(0, 0, s * 0.42, 0, Math.PI * 2); x.fillStyle = '#18a558'; x.fill(); noShadow();
      x.strokeStyle = '#fff'; x.lineWidth = s * 0.1; x.lineCap = 'round'; x.lineJoin = 'round';
      x.beginPath(); x.moveTo(-s * 0.18, s * 0.01); x.lineTo(-s * 0.04, s * 0.15); x.lineTo(s * 0.2, -s * 0.13); x.stroke();
    } else if (kind === 'new' || kind === 'sale') {
      burst(12, s * 0.48, s * 0.38); x.fillStyle = kind === 'new' ? '#18a558' : '#ffcc1f'; x.fill(); noShadow();
      text([kind === 'new' ? 'NEW' : 'SALE'], kind === 'new' ? '#fff' : '#d1202a', 0.26);
    } else if (kind === 'star') {
      burst(5, s * 0.5, s * 0.21); x.fillStyle = '#ffc21a'; x.fill(); noShadow(); x.lineWidth = s * 0.04; x.strokeStyle = '#fff'; x.stroke();
    } else if (kind === 'heart') {
      x.beginPath(); const h = s * 0.42;
      x.moveTo(0, h * 0.9); x.bezierCurveTo(-h * 1.3, 0, -h * 0.6, -h * 1.05, 0, -h * 0.35); x.bezierCurveTo(h * 0.6, -h * 1.05, h * 1.3, 0, 0, h * 0.9);
      x.fillStyle = '#e8304a'; x.fill();
    } else if (kind === 'offer') {
      x.rotate(0.12); x.beginPath(); x.moveTo(-s * 0.55, -s * 0.26); x.lineTo(s * 0.38, -s * 0.26); x.lineTo(s * 0.58, 0); x.lineTo(s * 0.38, s * 0.26); x.lineTo(-s * 0.55, s * 0.26); x.closePath();
      x.fillStyle = '#ff7a1a'; x.fill(); noShadow(); text(['OFFER'], '#fff', 0.23, 0);
    } else {
      // rosettes: best seller, premium, top quality
      burst(16, s * 0.5, s * 0.44); x.fillStyle = kind === 'premium' ? '#1d2453' : kind === 'top' ? '#2459c4' : '#c9961c'; x.fill(); noShadow();
      x.beginPath(); x.arc(0, 0, s * 0.37, 0, Math.PI * 2); x.lineWidth = s * 0.03; x.strokeStyle = kind === 'premium' ? '#e2b84c' : '#fff'; x.stroke();
      text(kind === 'premium' ? ['PREMIUM'] : kind === 'top' ? ['TOP', 'QUALITY'] : ['BEST', 'SELLER'], kind === 'premium' ? '#e2b84c' : '#fff', kind === 'premium' ? 0.16 : 0.17);
    }
    x.restore();
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
  const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or private */ } };

  // Common Meesho categories, until PakkaBill Lens brings the seller's own list from Meesho.
  const COMMON = ['Sarees', 'Blouses', 'Kurtis', 'Kurta Sets', 'Dupattas', 'Lehengas', 'Dress Materials', 'Gowns', 'Ethnic Bottomwear', 'Tops & Tunics', 'Dresses', 'Jeans', 'Leggings', 'Palazzos',
    'Night Suits', 'Nightdresses', 'Bras', 'Briefs', 'Shapewear', 'Jumpsuits', 'Co-ord Sets', 'Women T-shirts', 'Shrugs', 'Men T-shirts', 'Men Shirts', 'Men Kurtas', 'Men Jeans', 'Track Pants',
    'Men Shorts', 'Men Innerwear', 'Kids Frocks & Dresses', 'Kids Clothing Sets', 'Kids T-shirts', 'Baby Rompers', 'Earrings & Studs', 'Necklaces & Chains', 'Jewellery Sets', 'Bangles & Bracelets',
    'Rings', 'Anklets', 'Mangalsutras', 'Hair Accessories', 'Handbags', 'Clutches', 'Wallets', 'Watches', 'Sunglasses', 'Belts', 'Women Flats', 'Women Heels', 'Sandals', 'Flip Flops',
    'Men Casual Shoes', 'Sports Shoes', 'Bedsheets', 'Curtains', 'Cushion Covers', 'Doormats', 'Kitchen Tools', 'Storage & Organisers', 'Home Decor', 'Wall Stickers', 'Bath Towels',
    'Makeup', 'Skin Care', 'Hair Care', 'Phone Cases', 'Mobile Accessories', 'Toys', 'Stationery', 'Fitness'];
  const MAX_CATS = 5;
  const NEED = '3.0.0'; // PakkaBill Lens with Meesho's exact shipping
  const verLess = (a, b) => { const x = String(a || '0').split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) < y[i]) return true; if ((x[i] || 0) > y[i]) return false; } return false; };

  /* ---------- page */
  const CSS = `
.pls{max-width:1120px}
.pls .pls-card{padding:18px;margin-bottom:16px}
.pls h2{font-family:var(--font-display);font-size:26px;font-weight:600;line-height:1;margin:0 0 12px;padding-top:4px}
.pls-gen h2{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.pls-lbl{display:flex;justify-content:space-between;align-items:baseline;font-size:14px;font-weight:700;margin:4px 0 8px}
.pls-lbl small{font-weight:600;color:var(--ink-3);font-size:12.5px}
.pls-cats{position:relative}
.pls-chosen{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.pls-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 6px 5px 12px;border-radius:999px;background:var(--carbon-tint);color:var(--carbon);font-size:13.5px;font-weight:700}
.pls-chip button{border:0;background:none;color:inherit;font-size:16px;line-height:1;cursor:pointer;padding:0 4px}
.pls-search{width:100%;font:inherit;font-size:15px;padding:11px 12px;border:1.5px solid var(--rule);border-radius:12px;background:var(--paper);color:var(--ink)}
.pls-search:focus{outline:2px solid var(--focus);outline-offset:1px}
.pls-list{position:absolute;left:0;right:0;top:100%;z-index:20;margin:4px 0 0;padding:6px;list-style:none;background:var(--paper);border:1.5px solid var(--rule);border-radius:12px;box-shadow:var(--shadow-pop);max-height:280px;overflow:auto}
.pls-list li button{display:block;width:100%;text-align:left;border:0;background:none;font:inherit;font-size:14.5px;padding:8px 10px;border-radius:8px;color:var(--ink);cursor:pointer}
.pls-list li button:hover,.pls-list li button:focus{background:var(--carbon-tint);outline:none}
.pls-list small{color:var(--ink-3);margin-left:6px}
.pls-src{font-size:12.5px;color:var(--ink-3);margin:6px 0 0}
.pls-drop{display:grid;place-items:center;gap:6px;text-align:center;border:2px dashed var(--rule);border-radius:16px;padding:26px 16px;cursor:pointer;background:var(--paper);transition:border-color .12s,background .12s;margin-top:16px}
.pls-drop:hover,.pls-drop.is-over{border-color:var(--carbon);background:var(--carbon-tint)}
.pls-drop b{font-size:17px}
.pls-drop span{color:var(--ink-3);font-size:13.5px}
.pls-pend{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}
.pls-pend figure{margin:0;position:relative;width:92px}
.pls-pend img{width:92px;height:92px;object-fit:contain;border-radius:10px;border:1px solid var(--rule);background:#fff;display:block}
.pls-pend figcaption{font-size:11.5px;color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pls-pend button{position:absolute;top:-8px;right:-8px;width:24px;height:24px;border-radius:50%;border:1px solid var(--rule);background:var(--paper);color:var(--ink-2);cursor:pointer;line-height:1}
.pls-opts{display:flex;flex-wrap:wrap;gap:10px 18px;margin-top:14px;align-items:flex-end}
.pls-opts label{display:grid;gap:4px;font-size:12.5px;font-weight:700;color:var(--ink-2)}
.pls-opts select{font:inherit;font-size:15px;padding:8px 10px;border:1.5px solid var(--rule);border-radius:var(--r-ctl,9px);background:var(--paper);color:var(--ink);min-width:150px}
.pls-go{margin-top:16px;width:100%;justify-content:center;font-size:16.5px;padding:14px 18px}
.pls-btn{font:inherit;font-weight:700;font-size:15px;border:0;border-radius:10px;padding:10px 16px;cursor:pointer;color:var(--btn-fg,#fff);background:var(--btn-bg,#6c4dff);background-image:var(--btn-grad,none);text-decoration:none;display:inline-flex;align-items:center;gap:6px}
.pls-btn--ghost{background:var(--carbon-tint);background-image:none;color:var(--carbon);border:1.5px solid var(--carbon)}
.pls-btn:disabled{opacity:.55;cursor:not-allowed}
.pls-btn--sm{font-size:13.5px;padding:7px 12px}
.pls-prog{display:grid;gap:14px}
.pls-step{display:flex;gap:12px;align-items:center;font-size:15.5px;font-weight:600;color:var(--ink-3)}
.pls-step i{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-weight:700;border:2px solid var(--rule);flex:none;font-size:14px}
.pls-step.is-on{color:var(--ink)}.pls-step.is-on i{border-color:var(--carbon);color:var(--carbon);animation:pls-pulse 1.2s ease-in-out infinite}
.pls-step.is-done{color:var(--ink)}.pls-step.is-done i{border-color:var(--green);background:var(--green);color:#fff;animation:none}
.pls-step small{display:block;font-weight:500;color:var(--ink-3);font-size:13px}
@keyframes pls-pulse{50%{box-shadow:0 0 0 6px var(--carbon-tint)}}
@media (prefers-reduced-motion:reduce){.pls-step.is-on i{animation:none}}
.pls-bar{height:8px;border-radius:999px;background:var(--rule);overflow:hidden;margin-top:6px}
.pls-bar i{display:block;height:100%;background:var(--green,#12714b);transition:width .3s}
.pls-elapsed{font-size:13px;color:var(--ink-3)}
.pls-res{padding:16px;margin-bottom:16px}
.pls-res__head{display:flex;gap:14px;align-items:center;margin-bottom:12px}
.pls-res__head img{width:64px;height:64px;object-fit:contain;border-radius:10px;border:1px solid var(--rule);background:#fff;flex:none}
.pls-res__head b{display:block;font-size:16px;overflow-wrap:anywhere}
.pls-res__head span{display:block;font-size:13px;color:var(--ink-3)}
.pls-res__head .pls-x{margin-left:auto;align-self:flex-start;border:0;background:none;font-size:22px;color:var(--ink-3);cursor:pointer;padding:2px 6px}
.pls-sums{display:grid;gap:8px;margin:0 0 12px}
.pls-sum{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;background:var(--carbon-tint);border-radius:12px;padding:10px 14px;font-size:14px}
.pls-sum b{font-size:17px}
.pls-sum .pls-save{color:var(--green,#12714b);font-weight:700}
.pls-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin:0 0 12px}
.pls-seg{display:inline-flex;gap:2px;padding:3px;border-radius:10px;background:var(--desk)}
.pls-seg button{border:0;background:none;font:inherit;font-size:13.5px;font-weight:600;padding:6px 10px;border-radius:8px;color:var(--ink-2);cursor:pointer}
.pls-seg button[aria-pressed=true]{background:var(--paper);color:var(--carbon);box-shadow:0 1px 2px #0002}
.pls-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(186px,1fr));gap:14px}
.pls-v{position:relative;border:1.5px solid var(--rule);border-radius:16px;padding:8px;display:flex;flex-direction:column;gap:8px;background:var(--paper)}
.pls-v img{width:100%;aspect-ratio:1;object-fit:contain;border-radius:10px;background:#f6f6f6;border:1px solid var(--rule-soft,#eee)}
.pls-v__name{font-size:12.5px;font-weight:700;min-height:2.5em;line-height:1.25}
.pls-ship{display:grid;gap:4px;border-top:1px solid var(--rule-soft);padding-top:6px}
.pls-ship__h{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)}
.pls-rate{display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:13px}
.pls-rate span{color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.pls-rate b{font-variant-numeric:tabular-nums;font-size:15px}
.pls-rate.is-low b{color:var(--green)}
.pls-rate.is-low span:after{content:" ✓";color:var(--green)}
.pls-rate .pls-dash{color:var(--ink-3);font-weight:500}
.pls-v__ship{display:flex;align-items:center;gap:4px;font-size:12.5px;color:var(--ink-3)}
.pls-v__ship input{width:100%;min-width:0;font:inherit;font-size:14.5px;font-weight:700;padding:6px 8px;border:1.5px solid var(--rule);border-radius:8px;background:var(--paper);color:var(--ink)}
.pls-dl{justify-content:center;width:100%;margin-top:auto}
.pls-v.is-best{border-color:var(--green);box-shadow:inset 0 0 0 1px var(--green)}
.pls-v.is-tip{border-color:var(--carbon)}
.pls-v.is-now{border-color:var(--amber,#b26a00);box-shadow:inset 0 0 0 1px var(--amber,#b26a00)}
.pls-tag{position:absolute;top:-9px;left:10px;font-size:11px;font-weight:700;color:#fff;background:var(--carbon);padding:2px 8px;border-radius:999px;white-space:nowrap;max-width:calc(100% - 20px);overflow:hidden;text-overflow:ellipsis}
.pls-v.is-best .pls-tag{background:var(--green)}
.pls-v.is-now .pls-tag{background:var(--amber,#b26a00)}
.pls-v.is-orig .pls-tag{background:#555}
.pls-note{font-size:13px;color:var(--ink-3);margin:10px 0 0}
.pls-tips{margin:0;padding-left:20px;display:grid;gap:6px;font-size:14px;color:var(--ink-2)}
.pls-mine{width:100%;border-collapse:collapse;font-size:14px}
.pls-mine td,.pls-mine th{padding:7px 6px;border-bottom:1px solid var(--rule);text-align:left}
.pls-mine th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3)}
.pls-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
.pls-auto{border:1.5px solid var(--carbon)}
.pls-link{color:var(--carbon);font-weight:700;margin-left:8px}
.pls-ok{color:var(--green);font-weight:700}
@media (max-width:520px){.pls-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 10px}.pls-v{padding:6px;border-radius:14px;gap:6px}.pls-v__name{font-size:12px}.pls-rate{font-size:12px;gap:4px}.pls-rate b{font-size:14px}.pls-ship__h{font-size:10px;letter-spacing:.05em}.pls-dl{font-size:12.5px;padding-left:6px;padding-right:6px}.pls-tag{left:8px;font-size:10.5px}}
`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const toast = (m, bad) => { if (window.pbToast) return window.pbToast(m, bad); const t = document.createElement('div'); t.className = 'pbp-toast' + (bad ? ' is-bad' : ''); t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 3600); };
  const rs = (v) => '₹' + (Math.round(v * 100) / 100).toLocaleString('en-IN');

  let el = null;
  // cats: chosen categories [{ name, id }] (id: Meesho's, when picked from the list Lens brought);
  // names: category key -> name (keys are Meesho ids from Lens, or 'typed' for numbers typed in);
  // live: what PakkaBill Lens reports while it checks in Meesho; lens: what it learned in Meesho.
  const S = {
    shape: 'photo', level: lsGet('pb-lowship-level', 'normal'), strength: 'normal', look: lsGet('pb-lowship-look', 'mix'),
    cats: lsGet('pb-lowship-cats', []), mcats: lsGet('pb-ship-mcats', []), names: {}, sort: 'cheap', q: '',
    pending: [], photos: [], busy: 0, made: 0, total: 0, ext: null, sent: 0, live: null, lens: null, started: 0,
  };

  function addPending(files) {
    const list = [...files].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
    if (!list.length) return toast('Choose a photo (JPG, PNG or WebP).', true);
    list.slice(0, 10).forEach((f) => S.pending.push({ file: f, url: URL.createObjectURL(f) }));
    draw();
  }
  async function generate() {
    const list = S.pending.splice(0);
    if (!list.length) return toast('Add your product photo first.', true);
    S.started = Date.now();
    S.busy = list.length;
    S.made = 0;
    S.total = list.length * LEVELS[S.level];
    S.sent = 0;
    draw();
    for (const p of list) {
      try {
        const { im, url } = await loadImage(p.file);
        const ph = { id: Math.random().toString(36).slice(2, 10), name: p.file.name.replace(/\.[^.]+$/, '') || 'photo', url, src: sourceCanvas(im), file: p.file, ship: {}, live: {}, out: [] };
        await build(ph);
        S.photos.unshift(ph);
      } catch (e) {
        toast(e.message || 'Could not open this photo.', true);
      }
      URL.revokeObjectURL(p.url);
      S.busy--;
      draw();
    }
    // with PakkaBill Lens 3, the versions go straight to the Meesho check
    if (S.ext && !verLess(S.ext, NEED) && S.photos.length) sendToLens(true);
    setTimeout(() => el && el.querySelector('[data-results]') && el.querySelector('[data-results]').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  // Makes the versions of one photo with the current options.
  async function build(ph) {
    ph.out.forEach((o) => URL.revokeObjectURL(o.url));
    const st = study(ph.src, S.strength);
    ph.bg = st.bg;
    ph.white = st.white;
    ph.out = [];
    for (const t of tweaks(LEVELS[S.level], S.look)) {
      if (t.white && !ph.white) continue; // busy background: no clean white version
      // "Your photo" is the seller's own file, byte for byte, so its shipping is what Meesho charges today
      const own = t.key === 'orig' && ph.file && /^image\/(jpeg|png|webp)$/.test(ph.file.type) && ph.file.size <= 8 * 1024 * 1024;
      const blob = own ? ph.file : await jpeg(render(ph, t, S.shape), t.q);
      ph.out.push({ ...t, blob, url: URL.createObjectURL(blob) });
      S.made++;
      const bar = el && el.querySelector('[data-made]');
      if (bar) bar.style.width = Math.min(100, Math.round((S.made / Math.max(1, S.total)) * 100)) + '%';
      await new Promise((r) => setTimeout(r)); // keep the page responsive
    }
  }

  const fileName = (ph, key) => `${ph.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'photo'}-meesho-${key}.jpg`;

  /* ---------- results */
  // Category keys in order: the ones Lens checked (in the chosen order), then numbers typed in.
  function catOrder() {
    const keys = Object.keys(S.names);
    S.photos.forEach((ph) => Object.values(ph.ship).forEach((r) => Object.keys(r || {}).forEach((k) => { if (!keys.includes(k)) keys.push(k); })));
    return keys.filter((k) => k !== 'typed').concat(keys.includes('typed') ? ['typed'] : []);
  }
  const catName = (k) => S.names[k] || (k === 'typed' ? (S.cats[0] ? S.cats[0].name + ' (typed)' : 'Typed by you') : k === 'picked' ? 'Category picked in Meesho' : (S.mcats.find((c) => c.id === k) || {}).name || 'Category ' + k);
  function sums(ph) { return byCategory(ph.ship); }
  function sumHtml(ph) {
    const all = sums(ph), order = catOrder().filter((k) => all[k]);
    if (!order.length) return '';
    return `<div class="pls-sums">${order.map((k) => {
      const s = all[k], names = s.best.map((x) => esc(keyLabel(x))).join(', ');
      return `<div class="pls-sum"><span><b>${esc(catName(k))}</b></span><span>Cheapest <b>${rs(s.low)}</b> · ${names}</span>${s.own != null ? `<span>Your photo ${rs(s.own)}</span>${s.save > 0 ? `<span class="pls-save">Save ${rs(s.save)} on every order</span>` : '<span>Your photo is already the cheapest.</span>'}` : ''}<span class="pls-note" style="margin:0">${s.checked} of ${ph.out.length} checked</span></div>`;
    }).join('')}</div>`;
  }
  function tileState(ph, key, all, first) {
    const now = S.live && S.live.current === `${ph.id}|${key}`;
    const lowIn = Object.keys(all).filter((k) => ph.ship[key] && ph.ship[key][k] === all[k].low);
    const tip = !Object.keys(all).length && S.cats[0] && (bestFor(S.cats[0].name) || {}).key === key;
    const tag = now ? 'Checking in Meesho…' : lowIn.length ? (lowIn.length === 1 && catOrder().length > 1 ? `Cheapest in ${catName(lowIn[0])}` : 'Cheapest ✓') : key === 'orig' ? 'Your photo' : tip ? 'Best last time' : '';
    return { cls: now ? 'is-now' : lowIn.includes(first) || (lowIn.length && !first) ? 'is-best' : key === 'orig' ? 'is-orig' : tip ? 'is-tip' : '', tag };
  }
  function ratesHtml(ph, o, all) {
    const order = catOrder();
    const r = ph.ship[o.key] || {};
    const rows = order.map((k) => `<div class="pls-rate${all[k] && r[k] === all[k].low ? ' is-low' : ''}"><span title="${esc(catName(k))}">${esc(catName(k))}</span>${r[k] != null ? `<b>${rs(r[k])}</b>` : '<b class="pls-dash">–</b>'}</div>`).join('');
    const typing = !S.ext || verLess(S.ext, NEED) || order.includes('typed');
    return `<div class="pls-ship"><span class="pls-ship__h">Shipping rate</span>${rows || (typing ? '' : '<div class="pls-rate"><span>Not checked yet</span><b class="pls-dash">–</b></div>')}
      ${typing ? `<label class="pls-v__ship"><span>₹</span><input type="number" inputmode="numeric" min="0" max="5000" step="1" placeholder="Type Meesho's shipping" value="${esc(r.typed || '')}" data-key="${esc(o.key)}" aria-label="Shipping Meesho shows for ${esc(o.label)}"></label>` : ''}</div>`;
  }
  function tileHtml(ph, o, all) {
    const first = catOrder()[0], st = tileState(ph, o.key, all, first);
    return `<div class="pls-v ${st.cls}" data-key="${esc(o.key)}">${st.tag ? `<span class="pls-tag">${esc(st.tag)}</span>` : ''}
      <img src="${o.url}" alt="${esc(o.label)}" loading="lazy">
      <div class="pls-v__name">${esc(o.label)}</div>
      <div data-rates>${ratesHtml(ph, o, all)}</div>
      <a class="pls-btn pls-btn--ghost pls-btn--sm pls-dl" href="${o.url}" download="${esc(fileName(ph, o.key))}">⬇ Download image</a>
    </div>`;
  }
  function sorted(ph) {
    if (S.sort !== 'cheap') return ph.out;
    const k = catOrder()[0];
    if (!k) return ph.out;
    const v = (o) => (ph.ship[o.key] && ph.ship[o.key][k] != null ? ph.ship[o.key][k] : Infinity);
    return [...ph.out].sort((a, b) => v(a) - v(b) || (a.key === 'orig' ? -1 : b.key === 'orig' ? 1 : 0));
  }
  function photoHtml(ph) {
    const all = sums(ph);
    return `<section class="paper pls-res" data-ph="${ph.id}">
      <div class="pls-res__head"><img src="${ph.url}" alt=""><div><b>${esc(ph.name)}</b>
        <span>${ph.out.length} versions · ${esc(LOOKS[S.look] || '')}. ${ph.white ? 'Plain background found: a clean white version is included.' : 'Busy background: no white-background version.'}</span></div>
        <button type="button" class="pls-x" data-del aria-label="Remove this photo">×</button></div>
      <div data-sum>${sumHtml(ph)}</div>
      <div class="pls-grid">${sorted(ph).map((o) => tileHtml(ph, o, all)).join('')}</div>
    </section>`;
  }
  // Updates prices, marks and the summary of one photo without redrawing the page.
  function mark(card, ph) {
    const all = sums(ph), first = catOrder()[0];
    const grid = card.querySelector('.pls-grid');
    if (grid && S.sort === 'cheap' && !grid.contains(document.activeElement)) sorted(ph).forEach((o) => { const v = grid.querySelector(`.pls-v[data-key="${o.key}"]`); if (v) grid.appendChild(v); });
    card.querySelectorAll('.pls-v').forEach((v) => {
      const key = v.dataset.key, o = ph.out.find((x) => x.key === key), st = tileState(ph, key, all, first);
      if (!o) return;
      const box = v.querySelector('[data-rates]'), inp = box.querySelector('input');
      if (!(inp && document.activeElement === inp)) { box.innerHTML = ratesHtml(ph, o, all); wireInputs(box, ph); }
      v.className = `pls-v ${st.cls}`;
      v.querySelector('.pls-tag')?.remove();
      if (st.tag) v.insertAdjacentHTML('afterbegin', `<span class="pls-tag">${esc(st.tag)}</span>`);
    });
    card.querySelector('[data-sum]').innerHTML = sumHtml(ph);
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
      <p class="pls-note">From the shipping Meesho gave. Saved on this device only.</p></section>`;
  }

  /* ---------- progress, like a queue: made, checked in Meesho, ready */
  function progressHtml() {
    const versions = S.photos.reduce((a, ph) => a + ph.out.length, 0);
    const lens = S.ext && !verLess(S.ext, NEED);
    if (!S.busy && !S.sent) return '';
    const done = S.photos.reduce((a, ph) => a + ph.out.filter((o) => Object.keys(ph.ship[o.key] || {}).some((k) => k !== 'typed')).length, 0);
    const making = S.busy > 0, checking = !making && S.sent && done < versions, ready = !making && (!S.sent || done >= versions);
    const learned = S.lens && S.lens.learned;
    const secs = Math.max(0, Math.round((Date.now() - (S.started || Date.now())) / 1000));
    return `<section class="paper pls-card pls-prog" aria-live="polite">
      <h2>${ready ? 'Your images are ready' : making ? 'Making your images' : 'Getting Meesho\'s shipping'}</h2>
      <div class="pls-step is-done"><i>✓</i><span>Queued</span></div>
      <div class="pls-step ${making ? 'is-on' : 'is-done'}"><i>${making ? '2' : '✓'}</i><span>Making versions<small>${making ? `${S.made} of ${S.total}` : `${versions} versions made on this device`}</small>${making ? `<div class="pls-bar"><i data-made style="width:${Math.round((S.made / Math.max(1, S.total)) * 100)}%"></i></div>` : ''}</span></div>
      ${lens ? `<div class="pls-step ${checking ? 'is-on' : ready && S.sent ? 'is-done' : ''}"><i>${ready && S.sent ? '✓' : '3'}</i><span>Checking shipping in Meesho<small>${!S.sent ? 'Waiting' : learned ? `${done} of ${versions} priced by Meesho${S.lens.verified ? ' · checked against your photo ✓' : ''}` : 'Upload your photo once in Meesho\'s Add Single Catalog form (see below)'}</small>${checking && learned ? `<div class="pls-bar"><i style="width:${Math.round((done / Math.max(1, versions)) * 100)}%"></i></div>` : ''}</span></div>` : ''}
      <div class="pls-step ${ready ? 'is-done' : ''}"><i>${ready ? '✓' : lens ? '4' : '3'}</i><span>Ready</span></div>
      <p class="pls-elapsed">Elapsed: ${secs}s · updates by itself, no need to refresh</p>
    </section>`;
  }

  // The live check in Meesho runs in the PakkaBill Lens extension (laptop Chrome or Edge).
  function checkHtml() {
    if (!S.photos.length) return '';
    const n = S.photos.reduce((a, ph) => a + ph.out.length, 0);
    if (!S.ext) return `<section class="paper pls-card pls-auto"><h2>Get Meesho's real shipping for every version</h2>
      <p class="pls-note" style="margin-top:0">On a laptop, the free <b>PakkaBill Lens</b> extension (Chrome or Edge) asks Meesho for the shipping of every version, in every category you chose, from your own Meesho supplier account. The numbers are Meesho's own, read from Meesho's answer. On a phone, upload a version in Meesho and type the shipping under it.</p>
      <p><a class="pls-btn pls-btn--ghost" href="/pakkabill-lens.zip" download>⬇ Get PakkaBill Lens</a> <a class="pls-link" href="#/lens">How to install</a></p></section>`;
    if (verLess(S.ext, NEED)) return `<section class="paper pls-card pls-auto"><h2>Update PakkaBill Lens for exact shipping</h2>
      <p class="pls-note" style="margin-top:0">Your PakkaBill Lens is version ${esc(S.ext)}. Version ${NEED} gets the shipping straight from Meesho's answer, for up to 5 categories at once, and checks it against your own photo first.</p>
      <p><a class="pls-btn pls-btn--ghost" href="/pakkabill-lens.zip" download>⬇ Update PakkaBill Lens</a> <span class="pls-note">Unzip it over the old folder, tap Reload on the extension, then reload this page.</span></p></section>`;
    const learned = S.lens && S.lens.learned;
    return `<section class="paper pls-card pls-auto"><h2>Check in Meesho</h2>
      <ol class="pls-tips">
        <li>In this browser, open <a href="https://supplier.meesho.com/" target="_blank" rel="noopener">supplier.meesho.com</a> → Catalog Upload → Add Single Catalog. Pick a category and upload <b>your own photo</b> once. Fill price and weight if Meesho asks, until it shows the shipping charge. ${learned ? `<span class="pls-ok">✓ Done: Meesho priced your photo at ₹${esc(S.lens.ship)}</span>` : ''}</li>
        <li>PakkaBill learns how Meesho works it out. In the PakkaBill panel there, tap <b>Check all</b>. Meesho prices all ${n} versions${S.cats.length > 1 ? ` in your ${S.cats.length} categories` : ''} and the numbers appear here.</li>
      </ol>
      <p style="margin:12px 0 0"><button type="button" class="pls-btn" data-send>${S.sent ? '🔁 Send again to Meesho check' : '🔎 Check in Meesho'}</button></p></section>`;
  }

  /* ---------- the new generation card */
  function catOptions() {
    const q = S.q.trim().toLowerCase();
    const chosen = new Set(S.cats.map((c) => (c.id || c.name).toLowerCase()));
    const fromMeesho = S.mcats.filter((c) => c.leaf !== false);
    const pool = fromMeesho.length ? fromMeesho.map((c) => ({ name: c.name, id: c.id, path: c.path })) : COMMON.map((name) => ({ name, id: null, path: '' }));
    return pool.filter((c) => !chosen.has((c.id || c.name).toLowerCase()) && (!q || c.name.toLowerCase().includes(q) || (c.path || '').toLowerCase().includes(q))).slice(0, 40);
  }
  function catsHtml() {
    const list = S.q || S.open ? catOptions() : [];
    const typed = S.q.trim();
    return `<div class="pls-chosen">${S.cats.map((c, i) => `<span class="pls-chip">${esc(c.name)}<button type="button" data-uncat="${i}" aria-label="Remove ${esc(c.name)}">×</button></span>`).join('')}</div>
      ${S.cats.length < MAX_CATS ? `<input class="pls-search" data-catq placeholder="Search and select categories…" value="${esc(S.q)}" autocomplete="off" aria-label="Search Meesho categories">` : ''}
      ${list.length || typed ? `<ul class="pls-list" role="listbox">${list.map((c) => `<li><button type="button" data-addcat="${esc(c.name)}" data-id="${esc(c.id || '')}">${esc(c.name)}${c.path && c.path !== c.name ? `<small>${esc(c.path.split(' > ').slice(0, -1).join(' › '))}</small>` : ''}</button></li>`).join('')}${typed && !list.some((c) => c.name.toLowerCase() === typed.toLowerCase()) ? `<li><button type="button" data-addcat="${esc(typed)}" data-id="">Use "${esc(typed)}"</button></li>` : ''}</ul>` : ''}`;
  }

  let drawing = false;
  function draw() {
    if (!el || drawing) return;
    drawing = true;
    try { paint(); } finally { drawing = false; }
  }
  function paint() {
    const fromMeesho = S.mcats.some((c) => c.leaf !== false);
    el.innerHTML = `<div class="pls">
      <div class="page-head"><div><h1 class="page-title">Low shipping image</h1><p class="page-sub">Meesho can charge a different shipping for photos that look almost the same. PakkaBill makes versions of your photo and gets Meesho's real shipping for each one, in up to 5 categories. Use the cheapest as your main photo.</p></div></div>
      <section class="paper pls-card pls-gen"><h2>Create new generation</h2>
        <div class="pls-lbl"><span>Select categories</span><small>Max ${MAX_CATS}</small></div>
        <div class="pls-cats" data-cats>${catsHtml()}</div>
        <p class="pls-src">${fromMeesho ? `✓ Your categories from Meesho (${S.mcats.filter((c) => c.leaf !== false).length})` : 'Common Meesho categories. With PakkaBill Lens, your exact Meesho categories show here after you open Meesho\'s category picker once.'}</p>
        <label class="pls-drop" tabindex="0"><input type="file" accept="image/*" multiple class="pls-sr" data-files><b>📷 Upload image</b><span>Your normal catalogue photo. It stays on your device.</span></label>
        ${S.pending.length ? `<div class="pls-pend">${S.pending.map((p, i) => `<figure><img src="${p.url}" alt=""><figcaption>${esc(p.file.name)}</figcaption><button type="button" data-unpend="${i}" aria-label="Remove">×</button></figure>`).join('')}</div>` : ''}
        <div class="pls-opts">
          <label>Look<select data-opt="look">${Object.entries(LOOKS).map(([k, v]) => `<option value="${k}"${S.look === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
          <label>Versions<select data-opt="level"><option value="quick"${S.level === 'quick' ? ' selected' : ''}>12 (quick)</option><option value="normal"${S.level === 'normal' ? ' selected' : ''}>24 (recommended)</option><option value="deep"${S.level === 'deep' ? ' selected' : ''}>40 (most chances)</option></select></label>
          <label>Shape<select data-opt="shape"><option value="photo"${S.shape === 'photo' ? ' selected' : ''}>Same as my photo</option><option value="square"${S.shape === 'square' ? ' selected' : ''}>Square 1000 × 1000</option></select></label>
          <label>White background<select data-opt="strength"><option value="gentle"${S.strength === 'gentle' ? ' selected' : ''}>Gentle (white or light products)</option><option value="normal"${S.strength === 'normal' ? ' selected' : ''}>Normal</option><option value="strong"${S.strength === 'strong' ? ' selected' : ''}>Strong (shadows, uneven light)</option></select></label>
        </div>
        <button type="button" class="pls-btn pls-go" data-generate${S.pending.length && !S.busy ? '' : ' disabled'}>⚡ Generate images</button>
      </section>
      <div data-prog>${progressHtml()}</div>
      <div data-check>${checkHtml()}</div>
      <div data-results>${S.photos.length ? `<div class="pls-tools"><h2 style="margin:0">Generation results</h2><span><span class="pls-seg" role="group" aria-label="Order"><button type="button" data-sort="cheap" aria-pressed="${S.sort === 'cheap'}">Cheapest first</button><button type="button" data-sort="made" aria-pressed="${S.sort === 'made'}">As made</button></span>
        <button type="button" class="pls-btn pls-btn--ghost pls-btn--sm" data-best>⬇ Cheapest</button> <button type="button" class="pls-btn pls-btn--ghost pls-btn--sm" data-zip>⬇ All (ZIP)</button> <button type="button" class="pls-btn pls-btn--ghost pls-btn--sm" data-more>＋ Generate more</button> <button type="button" class="pls-btn pls-btn--ghost pls-btn--sm" data-clear>Clear</button></span></div>` : ''}
      ${S.photos.map(photoHtml).join('')}</div>
      <div data-mine>${mineHtml()}</div>
      <section class="paper pls-card"><h2>Good to know</h2><ul class="pls-tips">
        <li>The shipping is Meesho's own number for your account, from Meesho's answer. PakkaBill never guesses it, and first checks that it gets back the same number Meesho showed for your photo.</li>
        <li>Use the cheapest version as the <b>first (main) photo</b> of the catalogue. Your other photos can stay as they are.</li>
        <li>Coloured frames keep the product whole. Stickers with words ("Hot sale", "Best seller") can be refused in Meesho's photo check; frames without words are safer.</li>
        <li>Enter the real weight and package size in Meesho. A lower weight than the real one can lead to weight disputes and penalties.</li>
        <li>"Mirror image" (in 40 versions) flips the photo: skip it if your product has writing or a logo.</li>
      </ul></section>
    </div>`;
    wire();
  }

  // A result for one version of one photo, in one category: from Meesho (live) or typed in.
  function setShip(ph, key, cat, v, live) {
    const r = (ph.ship[key] = ph.ship[key] || {});
    const name = catName(cat);
    if (r[cat] > 0) forget(name, key, r[cat]);
    if (v > 0 && v < 5000) { r[cat] = v; remember(name, key, v); if (live) ph.live[key] = true; } else delete r[cat];
  }
  let ticker = 0;
  function refresh() {
    if (!el) return;
    S.photos.forEach((ph) => { const card = el.querySelector(`[data-ph="${ph.id}"]`); if (card) mark(card, ph); });
    const pr = el.querySelector('[data-prog]');
    if (pr) pr.innerHTML = progressHtml();
    el.querySelector('[data-mine]').innerHTML = mineHtml();
    clearInterval(ticker);
    if (S.busy || S.sent) ticker = setInterval(() => { const p = el && el.isConnected && el.querySelector('[data-prog]'); if (!p) return clearInterval(ticker); const e = p.querySelector('.pls-elapsed'); if (e) e.textContent = `Elapsed: ${Math.round((Date.now() - S.started) / 1000)}s · updates by itself, no need to refresh`; }, 1000);
  }

  const asDataUrl = (blob) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
  function download(name, blob) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    if (window.pbNudge) window.pbNudge('image');
  }

  async function sendToLens(auto) {
    const items = [];
    for (const ph of S.photos) for (const o of ph.out) items.push({ id: `${ph.id}|${o.key}`, label: `${ph.name} · ${o.label}`, name: fileName(ph, o.key), data: await asDataUrl(o.blob) });
    window.postMessage({ type: 'pb-ship-queue', gen: S.photos[0] ? S.photos[0].id : '', cats: S.cats.map((c) => ({ name: c.name, id: c.id || null })), items }, location.origin);
    S.sent = items.length;
    S.live = { current: null };
    if (!S.started) S.started = Date.now();
    draw();
    toast(auto ? `Sent ${items.length} versions to PakkaBill Lens. In Meesho's Add Single Catalog, upload your photo once, then tap Check all in the PakkaBill panel.` : `Sent ${items.length} versions. Open Meesho's catalogue upload in this browser and tap Check all in the PakkaBill panel.`);
  }

  function wireInputs(root, ph) {
    root.querySelectorAll('input[data-key]').forEach((inp) => inp.addEventListener('change', () => {
      setShip(ph, inp.dataset.key, 'typed', Math.round(Number(inp.value)), false);
      if (inp.value && !S.cats.length) toast('Choose a category above so PakkaBill can remember what works for it.');
      refresh();
    }));
  }
  function wireCats() {
    const box = el.querySelector('[data-cats]');
    const redraw = (focus) => { box.innerHTML = catsHtml(); wireCats(); if (focus) { const i = box.querySelector('[data-catq]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } } };
    const q = box.querySelector('[data-catq]');
    if (q) {
      q.addEventListener('input', () => { S.q = q.value; S.open = true; redraw(true); });
      q.addEventListener('focus', () => { if (!S.open) { S.open = true; redraw(true); } });
      q.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { S.open = false; S.q = ''; redraw(false); }
        if (e.key === 'Enter') { e.preventDefault(); const first = box.querySelector('[data-addcat]'); if (first) first.click(); }
        if (e.key === 'ArrowDown') { e.preventDefault(); box.querySelector('[data-addcat]')?.focus(); }
      });
    }
    box.querySelectorAll('[data-addcat]').forEach((b) => b.addEventListener('click', () => {
      if (S.cats.length >= MAX_CATS) return toast(`Up to ${MAX_CATS} categories.`, true);
      S.cats.push({ name: b.dataset.addcat.slice(0, 80), id: b.dataset.id || null });
      lsSet('pb-lowship-cats', S.cats);
      S.q = ''; S.open = S.cats.length < MAX_CATS;
      redraw(S.cats.length < MAX_CATS);
    }));
    box.querySelectorAll('[data-uncat]').forEach((b) => b.addEventListener('click', () => { S.cats.splice(Number(b.dataset.uncat), 1); lsSet('pb-lowship-cats', S.cats); redraw(false); }));
  }

  function wire() {
    wireCats();
    if (!closeList.on) { document.addEventListener('click', closeList, true); closeList.on = true; }
    const fileIn = el.querySelector('[data-files]');
    const drop = el.querySelector('.pls-drop');
    fileIn.addEventListener('change', () => { addPending(fileIn.files); fileIn.value = ''; });
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
    drop.addEventListener('drop', (e) => addPending(e.dataTransfer.files));
    el.querySelectorAll('[data-unpend]').forEach((b) => b.addEventListener('click', () => { const p = S.pending.splice(Number(b.dataset.unpend), 1)[0]; if (p) URL.revokeObjectURL(p.url); draw(); }));
    el.querySelector("[data-generate]").addEventListener("click", generate);
    el.querySelectorAll('[data-opt]').forEach((s) => s.addEventListener('change', async () => {
      S[s.dataset.opt] = s.value;
      if (s.dataset.opt === 'look') lsSet('pb-lowship-look', s.value);
      if (s.dataset.opt === 'level') lsSet('pb-lowship-level', s.value);
      if (!S.photos.length) return draw();
      S.busy = S.photos.length; S.made = 0; S.total = S.photos.length * LEVELS[S.level]; S.sent = 0; S.started = Date.now();
      draw();
      for (const ph of S.photos) { ph.ship = {}; ph.live = {}; await build(ph); S.busy--; }
      draw();
      if (S.ext && !verLess(S.ext, NEED)) sendToLens(true);
    }));
    el.querySelector('[data-send]')?.addEventListener('click', (e) => { e.currentTarget.disabled = true; sendToLens(false); });
    el.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => { S.sort = b.dataset.sort; draw(); }));
    el.querySelector('[data-more]')?.addEventListener('click', () => { el.querySelector('.pls-gen').scrollIntoView({ behavior: 'smooth' }); el.querySelector('[data-files]').click(); });
    el.querySelector('[data-clear]')?.addEventListener('click', () => {
      S.photos.forEach((ph) => { URL.revokeObjectURL(ph.url); ph.out.forEach((o) => URL.revokeObjectURL(o.url)); });
      S.photos = []; S.sent = 0; S.names = {};
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
      const files = [], seen = new Set();
      for (const ph of S.photos) {
        const all = sums(ph);
        for (const k of catOrder()) {
          const s = all[k];
          if (!s) continue;
          const o = ph.out.find((x) => x.key === s.best[0]);
          if (o && !seen.has(ph.id + o.key)) { seen.add(ph.id + o.key); files.push({ name: fileName(ph, o.key), data: new Uint8Array(await o.blob.arrayBuffer()), blob: o.blob }); }
        }
      }
      if (!files.length) return toast('Check the versions in Meesho first (or type their shipping), so PakkaBill knows the cheapest.', true);
      if (files.length === 1) download(files[0].name, files[0].blob);
      else download('meesho-cheapest-photos.zip', new Blob(zipParts(files), { type: 'application/zip' }));
    });
    el.querySelectorAll('[data-ph]').forEach((card) => {
      const ph = S.photos.find((p) => p.id === card.dataset.ph);
      card.querySelector('[data-del]').addEventListener('click', () => {
        URL.revokeObjectURL(ph.url);
        ph.out.forEach((o) => URL.revokeObjectURL(o.url));
        S.photos = S.photos.filter((p) => p !== ph);
        draw();
      });
      wireInputs(card, ph);
    });
    refresh();
  }
  function closeList(e) {
    if (!el || !el.isConnected) { closeList.on = false; return document.removeEventListener('click', closeList, true); }
    const box = el.querySelector('[data-cats]');
    if (S.open && box && !box.contains(e.target)) { S.open = false; S.q = ''; box.innerHTML = catsHtml(); wireCats(); }
  }

  // Messages from the PakkaBill Lens extension (its bridge runs on this site).
  if (typeof window !== 'undefined' && window.addEventListener) {
    const setCats = (list) => {
      if (!Array.isArray(list) || !list.length) return;
      S.mcats = list.filter((c) => c && /^\d{1,12}$/.test(String(c.id)) && c.name).slice(0, 5000).map((c) => ({ id: String(c.id), name: String(c.name).slice(0, 80), path: String(c.path || c.name).slice(0, 200), leaf: c.leaf !== false }));
      lsSet('pb-ship-mcats', S.mcats);
      // chosen categories by name get Meesho's id when it is now known
      S.cats.forEach((c) => { if (!c.id) { const m = S.mcats.find((x) => x.leaf !== false && x.name.toLowerCase() === c.name.toLowerCase()); if (m) c.id = m.id; } });
      lsSet('pb-lowship-cats', S.cats);
    };
    window.addEventListener('message', (e) => {
      if (e.source !== window || e.origin !== location.origin || !e.data || typeof e.data !== 'object') return;
      const m = e.data;
      if (m.type === 'pb-ship-state') {
        const had = S.ext;
        S.ext = String(m.version || '1');
        setCats(m.cats);
        if (m.lens) S.lens = m.lens;
        if (had !== S.ext && el) draw();
      } else if (m.type === 'pb-ship-cats') {
        setCats(m.cats);
        if (el && !S.open) { const box = el.querySelector('[data-cats]'); if (box) { box.innerHTML = catsHtml(); wireCats(); } }
      } else if (m.type === 'pb-ship-results' && m.results && typeof m.results === 'object') {
        if (m.cats && typeof m.cats === 'object') Object.entries(m.cats).forEach(([k, v]) => { if (/^[\w-]{1,20}$/.test(k) && typeof v === 'string') S.names[k] = v.slice(0, 80); });
        if (m.lens) S.lens = m.lens;
        for (const [id, val] of Object.entries(m.results)) {
          const [pid, key] = String(id).split('|');
          const ph = S.photos.find((p) => p.id === pid);
          if (!ph || !key) continue;
          // Lens 3: { category: rupees }; Lens 2: one number for the category picked in Meesho
          const per = typeof val === 'number' ? { picked: val } : val && typeof val === 'object' ? val : {};
          Object.entries(per).forEach(([cat, v]) => { const r = Math.round(Number(v) * 100) / 100; if (/^[\w-]{1,20}$/.test(cat) && r > 0 && (!ph.ship[key] || ph.ship[key][cat] !== r)) setShip(ph, key, cat, r, true); });
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
