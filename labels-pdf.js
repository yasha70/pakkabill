/* PakkaBill packing chart pages, in the doodle style of the P&L PDF: an indigo band with doodles, the
   PakkaBill mark, size cards, a size split bar, styled tables and a "PAKKA" stamp. Drawn with pdf-lib into
   any PDFDocument, on A4 or on a 4 x 6 inch label page. Uses PakkaBill's fonts (pnl-pdf-fonts.js through
   fontkit) when they have loaded, else the PDF's built-in fonts. Loaded by labels.html when it makes a PDF. */
(function () {
  'use strict';

  // The website's doodles (design/doodles.py) as path data in a 40 x 40 box; "@w" = own stroke width.
  var DOODLE = {
    bag: 'M8 13h24l-2 23H10z M14 13v-3a6 6 0 0 1 12 0v3 M15 20a5 5 0 0 0 10 0',
    cart: 'M3 6h5l4 20h20l3-14H10 M11.4 33a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0z M26.4 33a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0z',
    receipt: 'M9 4h22v32l-3.7-2.5-3.6 2.5-3.7-2.5-3.7 2.5-3.6-2.5L9 36z M14 12h12M14 18h12M14 24h7',
    tag: 'M22 4h13v13L18 34a3 3 0 0 1-4 0L6 26a3 3 0 0 1 0-4z M27 10.5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0z M13 25l8-8',
    box: 'M20 4 35 11v18L20 36 5 29V11z M5 11l15 7 15-7M20 18v18M12.5 7.5l15 7',
    truck: 'M3 11h20v16H3zM23 16h7l6 6v5H23z M6.8 30a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0z M25.8 30a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0z',
    qr: 'M6.5 5h8a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1 -1.5 1.5h-8a1.5 1.5 0 0 1 -1.5 -1.5v-8a1.5 1.5 0 0 1 1.5 -1.5z M25.5 5h8a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1 -1.5 1.5h-8a1.5 1.5 0 0 1 -1.5 -1.5v-8a1.5 1.5 0 0 1 1.5 -1.5z M6.5 24h8a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1 -1.5 1.5h-8a1.5 1.5 0 0 1 -1.5 -1.5v-8a1.5 1.5 0 0 1 1.5 -1.5z M24 24h4v4M35 24v4M24 33v2h5M33 31v4h2M29 29h2',
    barcode: 'M5 8v24M9 8v24M12 8v24M17 8v24M20 8v24M25 8v24M28 8v24M31 8v24M35 8v24',
    hanger: 'M20 12a4 4 0 1 1 4-4 M20 12v3L4 27a2 2 0 0 0 1 3.5h30A2 2 0 0 0 36 27L20 15',
    blouse: 'M14 5c1 3 3 5 6 5s5-2 6-5l9 5-4 7-4-2v18H11V15l-4 2-4-7z M17 5.5c1 2 2 2.8 3 2.8s2-.8 3-2.8',
    clip: 'M10 6h20a3 3 0 0 1 3 3v25a3 3 0 0 1 -3 3h-20a3 3 0 0 1 -3 -3v-25a3 3 0 0 1 3 -3z M15 3h10v6H15z M12 18l2 2 4-4M21 18h7M12 27l2 2 4-4M21 27h7',
    store: 'M4 15 7 5h26l3 10 M6 15v20h28V15 M4 15a4 4 0 0 0 8 0 4 4 0 0 0 8 0 4 4 0 0 0 8 0 4 4 0 0 0 8 0 M16 35v-9h8v9',
    star: 'M20 4l4.7 9.6 10.6 1.5-7.7 7.5 1.8 10.5L20 28.1l-9.4 5 1.8-10.5-7.7-7.5 10.6-1.5z',
    heart: 'M20 34S5 25 5 14.5A7.5 7.5 0 0 1 20 11a7.5 7.5 0 0 1 15 3.5C35 25 20 34 20 34z',
    invoice: 'M9 3h16l7 7v27H9z M25 3v7h7M14 17h13M14 22h13M14 27h8 @3 M26 30h1',
    scissor: 'M4.5 30a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0z M17.5 33a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0z M12 27 30 5M19 29 30 9',
    coin: 'M5 20a15 15 0 1 0 30 0a15 15 0 1 0 -30 0z M14 13h12M14 18h12M14 23h4c7 0 7-10 0-10M14 23l9 8',
    phone: 'M14 3h12a4 4 0 0 1 4 4v26a4 4 0 0 1 -4 4h-12a4 4 0 0 1 -4 -4v-26a4 4 0 0 1 4 -4z M17 32h6',
    mega: 'M5 16v8h6l14 8V8L11 16z M11 24l3 10h4l-2-10M30 14a6 6 0 0 1 0 12'
  };
  var NAMES = Object.keys(DOODLE);
  // PakkaBill colours; the size colours are the P&L's chart colours, checked for colour-blind separation
  var HEX = { indigo: '#2B3494', brand: '#5B3FE6', coral: '#FF7A59', ink: '#211E34', grey: '#6C6884', lav: '#D0CCFF', soft: '#F0ECFF', paper: '#FAF8FD',
    rule: '#DED8EE', pos: '#007628', warn: '#A33A10', gold: '#F5C453', white: '#FFFFFF', faint: '#BDB8CF' };
  var SIZE_HEX = ['#6250D6', '#EB6834', '#1BAF7A', '#EDA100', '#2A78D6', '#E87BA4', '#008300'];
  var RANGE = { L: '26-30', XL: '32-34', XXL: '36-40' };
  var SUB = { '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '−': '-', '…': '...', ' ': ' ', '→': '->', '×': 'x', '✓': 'ok' };

  function rng(seed) { return function () { seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function b64bytes(b64) { var s = atob(b64), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }

  /* ---------- fonts ---------- */
  // PakkaBill's fonts when pnl-pdf-fonts.js and fontkit are there, else the built-in ones
  function fonts(P, doc) {
    var std = function () {
      var S = P.StandardFonts;
      return Promise.all([S.HelveticaBold, S.Helvetica, S.TimesRoman, S.TimesRomanBold, S.TimesRomanItalic, S.HelveticaOblique].map(function (n) { return doc.embedFont(n); }))
        .then(function (f) { return { disp: f[0], dispR: f[1], serif: f[2], serifB: f[3], serifI: f[4], hand: f[5], ok: null, brand: false }; });
    };
    var H = window.HPF, fk = window.fontkit;
    if (!H || !H.fonts || !fk) return std();
    var by = {};
    H.fonts.forEach(function (f) { by[f.name + '/' + f.style] = f.b64; });
    try { doc.registerFontkit(fk); } catch (e) { return std(); }
    var emb = function (k) { return doc.embedFont(b64bytes(by[k]), { subset: false }); };
    return Promise.all([emb('PBDisplay/bold'), emb('PBDisplay/normal'), emb('PBSerif/normal'), emb('PBSerif/bold'), emb('PBSerif/italic'), emb('PBHand/normal')]).then(function (f) {
      var ok = {}; for (var i = 0; i < H.chars.length; i++) ok[H.chars.charAt(i)] = 1;
      return { disp: f[0], dispR: f[1], serif: f[2], serifB: f[3], serifI: f[4], hand: f[5], ok: ok, brand: true };
    }, function (e) { console.warn('PakkaBill fonts not used', e); return std(); });
  }

  /* ---------- a painter for one page, in top-down coordinates like a web page ---------- */
  function painter(P, page, F) {
    var H = page.getHeight(), col = {};
    Object.keys(HEX).forEach(function (k) { col[k] = hex(HEX[k]); });
    function hex(h) { return P.rgb(parseInt(h.substr(1, 2), 16) / 255, parseInt(h.substr(3, 2), 16) / 255, parseInt(h.substr(5, 2), 16) / 255); }
    function txt(s) {
      s = String(s == null ? '' : s); var o = '';
      for (var i = 0; i < s.length; i++) {
        var ch = s.charAt(i);
        if (F.ok ? F.ok[ch] : /[\x20-\x7e]/.test(ch)) o += ch;
        else if (SUB[ch]) o += SUB[ch];
        else if (ch === '·') o += F.ok && F.ok['·'] ? ch : '-';
        else o += '?';
      }
      return o;
    }
    function width(s, font, size, sp) { s = txt(s); return font.widthOfTextAtSize(s, size) + (sp || 0) * Math.max(0, s.length - 1); }
    function fit(s, font, size, max) {
      s = txt(s); if (font.widthOfTextAtSize(s, size) <= max) return s;
      while (s.length > 1 && font.widthOfTextAtSize(s + '...', size) > max) s = s.slice(0, -1);
      return s + '...';
    }
    // text with its baseline at top-down y; align left / center / right; sp = letter spacing
    function text(s, x, y, font, size, c, o) {
      o = o || {}; s = txt(s);
      var w = width(s, font, size, o.sp), x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
      if (o.rotate) { page.drawText(s, { x: x0, y: H - y, size: size, font: font, color: c, rotate: P.degrees(o.rotate), opacity: o.opacity }); return w; }
      if (!o.sp) { page.drawText(s, { x: x0, y: H - y, size: size, font: font, color: c, opacity: o.opacity }); return w; }
      for (var i = 0; i < s.length; i++) { page.drawText(s.charAt(i), { x: x0, y: H - y, size: size, font: font, color: c, opacity: o.opacity }); x0 += font.widthOfTextAtSize(s.charAt(i), size) + o.sp; }
      return w;
    }
    function rect(x, y, w, h, o) { page.drawRectangle({ x: x, y: H - y - h, width: w, height: h, color: o.fill, borderColor: o.stroke, borderWidth: o.stroke ? (o.lw || 0.6) : 0, opacity: o.opacity, borderOpacity: o.opacity }); }
    function rrect(x, y, w, h, r, o) {
      r = Math.min(r, w / 2, h / 2);
      var d = 'M' + r + ' 0H' + (w - r) + 'A' + r + ' ' + r + ' 0 0 1 ' + w + ' ' + r + 'V' + (h - r) + 'A' + r + ' ' + r + ' 0 0 1 ' + (w - r) + ' ' + h + 'H' + r + 'A' + r + ' ' + r + ' 0 0 1 0 ' + (h - r) + 'V' + r + 'A' + r + ' ' + r + ' 0 0 1 ' + r + ' 0Z';
      page.drawSvgPath(d, { x: x, y: H - y, color: o.fill, borderColor: o.stroke, borderWidth: o.stroke ? (o.lw || 0.6) : undefined, opacity: o.opacity, borderOpacity: o.opacity });
    }
    function line(x1, y1, x2, y2, c, lw, o) { page.drawLine({ start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y2 }, thickness: lw || 0.5, color: c, dashArray: o && o.dash, opacity: o && o.opacity, lineCap: o && o.round ? P.LineCapStyle.Round : undefined }); }
    function circle(cx, cy, r, o) { page.drawCircle({ x: cx, y: H - cy, size: r, color: o.fill, borderColor: o.stroke, borderWidth: o.stroke ? (o.lw || 0.6) : undefined, opacity: o.opacity, borderOpacity: o.opacity }); }
    // one doodle centred on (cx, cy), size in pt, turned by rot degrees
    function icon(name, cx, cy, size, rot, c, lw, opacity) {
      var str = DOODLE[name]; if (!str) return;
      // rot turns clockwise on the page, which is -rot in the PDF's own (upward) angles
      var s = size / 40, t = -(rot || 0) * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t);
      // the box's top-left corner, so that its middle lands on (cx, cy) after turning about the corner
      var x = cx - 20 * s * (cs + sn), y = (H - cy) + 20 * s * (cs - sn);
      str.split('@').forEach(function (part, k) {
        var w = lw || 1;
        if (k) { var m = part.match(/^([\d.]+)\s+/); w = w * (+m[1]) / 2.2; part = part.slice(m[0].length); }
        page.drawSvgPath(part, { x: x, y: y, scale: s, rotate: P.degrees(-(rot || 0)), borderColor: c, borderWidth: w / s, borderLineCap: P.LineCapStyle.Round, borderOpacity: opacity });
      });
    }
    // a field of doodles, evenly spread, with dots, rings and plus signs between
    function wallpaper(x0, y0, w, h, o) {
      var r = rng(o.seed || 11), pts = [], names = NAMES.slice(), i, j, t;
      for (i = names.length - 1; i > 0; i--) { j = Math.floor(r() * (i + 1)); t = names[i]; names[i] = names[j]; names[j] = t; }
      function free(px, py, g, list) { return list.every(function (q) { return (q[0] - px) * (q[0] - px) + (q[1] - py) * (q[1] - py) >= g * g; }); }
      for (i = 0; i < 1800; i++) { var px = x0 + o.pad + r() * (w - 2 * o.pad), py = y0 + o.pad + r() * (h - 2 * o.pad); if (free(px, py, o.gap, pts) && (!o.avoid || !o.avoid(px, py))) pts.push([px, py]); }
      pts.forEach(function (p, k) { icon(names[k % names.length], p[0], p[1], o.size * (0.86 + r() * 0.28), (r() - 0.5) * 46, o.color, o.lw, o.alpha); });
      var bits = [];
      for (i = 0; i < 900; i++) { var bx = x0 + 8 + r() * (w - 16), by = y0 + 8 + r() * (h - 16); if (free(bx, by, o.gap * 0.62, pts) && free(bx, by, o.gap * 0.5, bits) && (!o.avoid || !o.avoid(bx, by))) bits.push([bx, by]); }
      bits.forEach(function (b, k) {
        var kind = k % 3;
        if (kind === 0) circle(b[0], b[1], 1.1, { fill: o.color, opacity: o.alpha });
        else if (kind === 1) circle(b[0], b[1], 2, { stroke: o.color, lw: o.lw * 0.8, opacity: o.alpha });
        else { line(b[0] - 3, b[1], b[0] + 3, b[1], o.color, o.lw * 0.8, { opacity: o.alpha, round: true }); line(b[0], b[1] - 3, b[0], b[1] + 3, o.color, o.lw * 0.8, { opacity: o.alpha, round: true }); }
      });
    }
    // a hand-drawn wavy underline
    function squiggle(x, y, w, c, lw, amp) {
      var n = Math.max(2, Math.round(w / 8)), sw = w / n, d = 'M0 0'; amp = amp || 2.4;
      for (var i = 0; i < n; i++) { var a = i * sw, sg = i % 2 ? 1 : -1; d += 'C' + (a + sw / 3) + ' ' + (sg * amp) + ' ' + (a + 2 * sw / 3) + ' ' + (sg * amp) + ' ' + (a + sw) + ' 0'; }
      page.drawSvgPath(d, { x: x, y: H - y, borderColor: c, borderWidth: lw || 1.3, borderLineCap: P.LineCapStyle.Round });
    }
    // PakkaBill's mark: three bills, on an indigo tile
    function mark(x, y, s, tile) {
      if (tile) rrect(x, y, s, s, s * 0.22, { fill: col.indigo });
      var R = function (a, b, w, h, c) { rrect(x + s * a, y + s * b, s * w, s * h, s * 0.04, { fill: hex(c) }); };
      R(0.34, 0.2, 0.4, 0.52, '#FDE696'); R(0.3, 0.23, 0.4, 0.52, '#F8D4DE'); R(0.24, 0.26, 0.4, 0.52, '#FFFFFF');
      R(0.47, 0.32, 0.12, 0.06, '#D62430'); R(0.3, 0.46, 0.26, 0.035, '#5860AA'); R(0.3, 0.54, 0.18, 0.035, '#A0A6D4'); R(0.3, 0.62, 0.22, 0.035, '#A0A6D4');
    }
    // a round rubber stamp, turned by deg
    function stamp(cx, cy, r, c, deg, top, bottom, mid) {
      var b = (deg || 0) * Math.PI / 180, PY = H - cy, f = F.disp;
      circle(cx, cy, r, { stroke: c, lw: 1.8, opacity: 0.92 }); circle(cx, cy, r - 4, { stroke: c, lw: 0.7, opacity: 0.92 }); circle(cx, cy, r - 16, { stroke: c, lw: 0.7, opacity: 0.92 });
      function arc(s, rad, center, isTop, size, sp) {
        s = txt(s); var ws = [], tot = 0, acc = 0, i;
        for (i = 0; i < s.length; i++) { ws.push(f.widthOfTextAtSize(s.charAt(i), size)); tot += ws[i] + (i ? sp : 0); }
        for (i = 0; i < s.length; i++) {
          var off = acc + ws[i] / 2, phi = isTop ? center + tot / 2 / rad - off / rad : center - tot / 2 / rad + off / rad;
          var dx = isTop ? Math.sin(phi) : -Math.sin(phi), dy = isTop ? -Math.cos(phi) : Math.cos(phi);
          var px = cx + rad * Math.cos(phi) - dx * ws[i] / 2, py = PY + rad * Math.sin(phi) - dy * ws[i] / 2;
          page.drawText(s.charAt(i), { x: px, y: py, size: size, font: f, color: c, rotate: P.radians ? P.radians(isTop ? phi - Math.PI / 2 : phi + Math.PI / 2) : P.degrees((isTop ? phi - Math.PI / 2 : phi + Math.PI / 2) * 180 / Math.PI), opacity: 0.92 });
          acc += ws[i] + sp;
        }
      }
      arc(top, r - 12.4, Math.PI / 2 + b, true, 6.4, 1.1);
      arc(bottom, r - 7.6, -Math.PI / 2 + b, false, 6.4, 1.1);
      [0, Math.PI].forEach(function (a0) { circle(cx + Math.cos(a0 + b) * (r - 10), cy - Math.sin(a0 + b) * (r - 10), 1.3, { fill: c, opacity: 0.92 }); });
      var ms = 13, mw = f.widthOfTextAtSize(txt(mid), ms), cs = Math.cos(b), sn = Math.sin(b), ox = -mw / 2, oy = -4.5;
      page.drawText(txt(mid), { x: cx + ox * cs - oy * sn, y: PY + ox * sn + oy * cs, size: ms, font: f, color: c, rotate: P.degrees(deg || 0), opacity: 0.92 });
      // a tick under the word
      // path points are written downwards, so the PDF's upward y is turned round
      var T = function (x, y) { return (cx + x * cs - y * sn) + ' ' + -(PY + x * sn + y * cs); };
      page.drawSvgPath('M' + T(-7, -10) + 'L' + T(-2.5, -14) + 'L' + T(8, -5.5), { x: 0, y: 0, scale: 1, borderColor: c, borderWidth: 1.6, borderLineCap: P.LineCapStyle.Round, borderOpacity: 0.92 });
    }
    return { H: H, W: page.getWidth(), page: page, col: col, hex: hex, txt: txt, width: width, fit: fit, text: text, rect: rect, rrect: rrect, line: line, circle: circle,
      icon: icon, wallpaper: wallpaper, squiggle: squiggle, mark: mark, stamp: stamp };
  }

  /* ---------- the packing chart ---------- */
  /* data: { kicker, title, pill, sub, forName, forLine, date, blouse, main: chart, sections: [{title, sub, chart}],
     kpis: [{label, value, note, size}], notes: [{text, kind}], stamp: {top, bottom}, footer, end } */
  function draw(P, doc, data, W, H) {
    return fonts(P, doc).then(function (F) {
      var small = W < 400, M = small ? 14 : 40, CW = W - 2 * M, pages = [], pg = null, y = 0;
      var BOT = small ? 24 : 58, ROW = small ? 14 : 19.5, colorOf = sizeColors(P, data.main.cols, data.blouse);
      function newPage(first) {
        var page = doc.addPage([W, H]); pg = painter(P, page, F); pages.push(pg);
        if (first) y = cover(); else y = header();
      }
      // first page: indigo band with doodles, mark, title, stamp
      function cover() {
        var bh = small ? 74 : 232, c = pg.col;
        pg.rect(0, 0, W, bh, { fill: c.indigo });
        // wavy lower edge
        var n = Math.round(W / (small ? 36 : 60)), sw = W / n, d = 'M0 0H' + W + 'V' + bh;
        var up = small ? 4 : 7;
        for (var i = n - 1; i >= 0; i--) { var a = (i + 1) * sw; d += 'C' + (a - sw / 3) + ' ' + (bh + (i % 2 ? up : -1)) + ' ' + (a - 2 * sw / 3) + ' ' + (bh + (i % 2 ? up : -1)) + ' ' + (a - sw) + ' ' + bh; }
        pg.page.drawSvgPath(d + 'Z', { x: 0, y: H, color: c.indigo });
        var stampAt = data.stamp && !small ? { x: W - 104, y: 132, r: 46 } : null;
        pg.wallpaper(0, 0, W, bh, { seed: 7, size: small ? 13 : 22, gap: small ? 26 : 44, pad: small ? 8 : 16, color: c.lav, lw: small ? 0.7 : 0.9, alpha: 0.16,
          // keep doodles off the words and the stamp
          avoid: function (px, py) { return (px < M + (small ? 150 : 330) && py > (small ? 14 : 60) && py < bh - 6) || (stampAt && Math.hypot(px - stampAt.x, py - stampAt.y) < stampAt.r + 14) || (px < M + (small ? 150 : 240) && py < (small ? 30 : 74)); } });
        if (small) {
          pg.mark(M, 12, 20, false);
          pg.text('PakkaBill', M + 23, 24, F.disp, 9, c.white);
          var tw = pg.text(data.title, M, 54, F.disp, 18, c.white);
          pg.text(data.date || '', W - M, 24, F.serif, 7, c.lav, { align: 'right' });
          var g = data.main, sm = g.grand + ' pieces' + (g.parcels != null ? '  ·  ' + g.parcels + ' labels' : '');
          if (pg.width(sm, F.serif, 7) < CW - tw - 12) pg.text(sm, W - M, 54, F.serif, 7, c.white, { align: 'right' });
          return bh + 18;
        }
        pg.mark(M, 30, 30, false);
        pg.text('PakkaBill', M + 36, 45, F.disp, 16, c.white);
        pg.text(data.tagline || 'Packing chart from your Meesho manifest', M + 36, 57, F.serif, 7.5, c.lav);
        // coral pill
        var pt = data.pill || 'PACKING CHART', pw = pg.width(pt, F.disp, 6.8, 1.1) + 20;
        pg.rrect(W - M - pw, 33, pw, 17, 8.5, { fill: c.coral });
        pg.text(pt, W - M - pw / 2, 44.6, F.disp, 6.8, c.white, { align: 'center', sp: 1.1 });
        pg.text(data.kicker || 'Ready to pack,', M, 100, F.serifI, 15, c.lav);
        pg.text(data.title, M, 138, F.disp, 38, c.white);
        if (data.sub) pg.text(data.sub, M, 160, F.serif, 10, c.white, { opacity: 0.92 });
        if (data.forName) {
          pg.text('PREPARED FOR', M, 186, F.disp, 6.4, c.lav, { sp: 1.2 });
          pg.text(pg.fit(data.forName, F.disp, 14, CW * 0.62), M, 203, F.disp, 14, c.white);
        }
        if (data.forLine) pg.text(pg.fit(data.forLine, F.serif, 8, CW * 0.62), M, 216, F.serif, 8, c.lav);
        if (stampAt) pg.stamp(stampAt.x, stampAt.y, stampAt.r, pg.hex(HEX.gold), -12, data.stamp.top, data.stamp.bottom, 'PAKKA');
        return bh + 22;
      }
      // later pages: a slim header
      function header() {
        var c = pg.col;
        if (small) { pg.mark(M, 8, 16, true); pg.text('PakkaBill', M + 20, 19, F.disp, 8, c.indigo); pg.text(data.title + ' (continued)', W - M, 19, F.serif, 6.5, c.grey, { align: 'right' }); pg.line(M, 28, W - M, 28, c.rule, 0.5); return 42; }
        pg.mark(M, 20, 22, true);
        pg.text('PakkaBill', M + 28, 31, F.disp, 10.5, c.indigo);
        pg.text(data.title, M + 28, 41, F.serif, 7, c.grey);
        pg.text(pg.fit(data.forName || '', F.disp, 8.5, 170), W - M, 31, F.disp, 8.5, c.ink, { align: 'right' });
        pg.text(data.date || '', W - M, 41, F.serif, 7, c.grey, { align: 'right' });
        ['box', 'tag', 'truck', 'blouse', 'scissor'].forEach(function (n, i) { pg.icon(n, M + 190 + i * 30, 31, 13, (i % 2 ? 10 : -10), c.lav, 0.9, 0.9); });
        pg.line(M, 54, W - M, 54, c.rule, 0.6);
        return 76;
      }
      function room(h) { if (y + h > H - BOT) { newPage(false); return true; } return false; }
      function title(t, sub, iconName) {
        room(small ? 30 : 46);
        var c = pg.col, ts = small ? 10 : 13, w = pg.text(t, M, y, F.disp, ts, c.ink);
        pg.squiggle(M, y + (small ? 4 : 5.5), Math.min(w + 6, CW * 0.5), c.coral, small ? 1 : 1.3, small ? 1.6 : 2.2);
        if (iconName) pg.icon(iconName, W - M - (small ? 7 : 10), y - (small ? 4 : 5), small ? 14 : 20, -8, c.brand, small ? 0.8 : 1);
        y += small ? 13 : 18;
        if (sub) { pg.text(pg.fit(sub, F.serifI, small ? 6.5 : 8, CW - 30), M, y, F.serifI, small ? 6.5 : 8, c.grey); y += small ? 10 : 14; }
        else y += small ? 2 : 4;
      }
      function kpis(list) {
        if (!list || !list.length || small) return;
        var c = pg.col, n = list.length, gap = 10, w = (CW - gap * (n - 1)) / n, h = 72;
        list.forEach(function (k, i) {
          var x = M + i * (w + gap), sc = k.size ? colorOf(k.size) : null;
          pg.rrect(x, y, w, h, 8, { fill: c.white, stroke: c.rule, lw: 0.8 });
          if (sc) pg.rect(x + 8, y, w - 16, 3, { fill: sc });
          pg.text(k.label, x + 12, y + 18, F.disp, 6.4, c.grey, { sp: 1 });
          pg.text(String(k.value), x + 12, y + 46, F.disp, i === 0 ? 26 : 23, i === 0 ? c.indigo : c.ink);
          if (k.note) pg.text(pg.fit(k.note, F.serif, 7.4, w - 20), x + 12, y + 60, F.serif, 7.4, c.grey);
          if (i === 0) pg.text('pakka!', x + w - 10, y + 44, F.hand, 13, c.coral, { align: 'right', rotate: 8 });
          else pg.icon(k.size ? 'blouse' : (k.icon || 'box'), x + w - 18, y + 22, 16, 8, sc || c.lav, 0.9, 0.85);
        });
        y += h + 22;
      }
      // where the pieces go, by size, as one bar
      function splitBar(ch) {
        if (small || !ch.grand) return;
        var c = pg.col, cols = ch.cols.filter(function (k) { return ch.totals[k]; });
        if (cols.length < 2 || cols.length > SIZE_HEX.length) return;
        room(64);
        pg.text('How the pieces split', M, y, F.disp, 11, c.ink);
        pg.text('by size, ' + ch.grand + ' pieces', W - M, y, F.serifI, 8, c.grey, { align: 'right' });
        y += 10;
        var x = M, gap = 2, bw = CW - gap * (cols.length - 1), bh = 18;
        cols.forEach(function (k) {
          var w = bw * ch.totals[k] / ch.grand, lab = k + ' ' + ch.totals[k];
          pg.rrect(x, y, w, bh, Math.min(4, w / 2), { fill: colorOf(k) });
          if (w > pg.width(lab, F.disp, 7.4) + 8) pg.text(lab, x + w / 2, y + 12, F.disp, 7.4, c.white, { align: 'center' });
          x += w + gap;
        });
        y += bh + 12;
        x = M;
        cols.forEach(function (k) {
          var lab = k + (data.blouse && RANGE[k] ? ' (' + RANGE[k] + ')' : '') + '  ' + Math.round(1000 * ch.totals[k] / ch.grand) / 10 + '%';
          pg.circle(x + 3.5, y - 2.6, 3.5, { fill: colorOf(k) });
          x += 10 + pg.text(lab, x + 10, y, F.serif, 7.6, c.grey) + 16;
        });
        y += 22;
      }
      // the SKU x size table; keep = start a new page rather than split it, when it fits on one page
      function table(ch, keep) {
        var c = pg.col, n = ch.cols.length, mixW = small || n > SIZE_HEX.length ? 0 : 84;
        var minSku = small ? 84 : 130, numW = Math.min(small ? 34 : 50, (CW - mixW - minSku) / (n + 1)), totW = numW;
        if (numW < 26) { totW = 26; numW = (CW - mixW - minSku - totW) / n; }   // many sizes: keep room for the totals
        var skuW = CW - mixW - numW * n - totW, hh = small ? 15 : 20, dots = numW >= 24;
        var whole = hh + ROW * (ch.rows.length + 1) + 6, maxTot = ch.rows.reduce(function (m, r) { return Math.max(m, r.total); }, 1);
        if (keep && whole <= H - BOT - (small ? 42 : 76) && y + whole > H - BOT) newPage(false);
        var fs = small ? (numW < 22 ? 6.6 : 7.4) : 9.4, hs = small ? 5.4 : 6.6;
        function cx(i) { return i < n ? M + skuW + numW * i + numW / 2 : M + skuW + numW * n + totW / 2; }
        function head() {
          pg.rrect(M, y, CW, hh, 5, { fill: c.soft });
          var by = y + hh / 2 + hs * 0.36;
          pg.text('SKU', M + 8, by, F.disp, hs, c.grey, { sp: 0.8 });
          ch.cols.forEach(function (k, i) {
            var lab = k === 'Free Size' && numW < 44 ? 'FREE' : k.toUpperCase(), room = numW - (dots ? 10 : 3), q = pg.fit(lab, F.disp, hs, room), w = pg.width(q, F.disp, hs, dots ? 0.6 : 0);
            pg.text(q, cx(i) + (dots ? 3 : 0), by, F.disp, hs, c.grey, { align: 'center', sp: dots ? 0.6 : 0 });
            if (dots) pg.circle(cx(i) - w / 2 - 2.5, by - hs * 0.34, small ? 1.6 : 2.2, { fill: colorOf(k) });
            else pg.rect(cx(i) - numW / 2 + 2, y + hh - 2.5, numW - 4, 1.6, { fill: colorOf(k) });
          });
          pg.text('TOTAL', cx(n), by, F.disp, hs, c.indigo, { align: 'center', sp: totW < 30 ? 0 : 0.6 });
          if (mixW) pg.text('SIZE MIX', M + CW - mixW + 6, by, F.disp, hs, c.grey, { sp: 0.6 });
          y += hh + 2;
        }
        head();
        function row(label, cells, total, i, grand) {
          if (y + ROW > H - BOT) { newPage(false); head(); }
          var by = y + ROW / 2 + fs * 0.36;
          if (grand) pg.rrect(M, y + 1, CW, ROW, 5, { fill: c.indigo });
          else if (i % 2) pg.rect(M, y, CW, ROW, { fill: c.paper });
          var ink = grand ? c.white : c.ink;
          pg.text(pg.fit(label, F.disp, fs, skuW - 14), M + 8, by + (grand ? 1 : 0), F.disp, fs, ink);
          cells.concat([total]).forEach(function (v, k) {
            var last = k === cells.length, f = last || grand ? F.serifB : F.serif;
            pg.text(String(v), cx(k), by + (grand ? 1 : 0), f, last ? fs + 0.8 : fs + 0.4, grand ? c.white : v ? ink : c.faint, { align: 'center' });
          });
          if (mixW && !grand && total) {
            var x = M + CW - mixW + 6, full = (mixW - 14) * total / maxTot, bh = small ? 5 : 7, yy = y + (ROW - bh) / 2;
            pg.rrect(x, yy, mixW - 14, bh, bh / 2, { fill: c.soft });
            ch.cols.forEach(function (k) { var v = cells[ch.cols.indexOf(k)]; if (!v) return; var w = full * v / total; pg.rect(x, yy, w, bh, { fill: colorOf(k) }); x += w; });
          }
          if (!grand) pg.line(M, y + ROW, M + CW, y + ROW, c.rule, 0.4);
          y += ROW;
        }
        ch.rows.forEach(function (r, i) { row(r.sku, ch.cols.map(function (k) { return r.cells[k] || 0; }), r.total, i, false); });
        row('GRAND TOTAL', ch.cols.map(function (k) { return ch.totals[k] || 0; }), ch.grand, 0, true);
        y += small ? 12 : 18;
      }
      function notes(list) {
        (list || []).forEach(function (nt) {
          var c = pg.col, size = small ? 6 : 7.6, f = nt.kind === 'ok' || nt.kind === 'warn' ? F.serifB : F.serifI, color = nt.kind === 'ok' ? c.pos : nt.kind === 'warn' ? pg.hex(HEX.warn) : c.grey;
          var words = pg.txt(nt.text).split(' '), cur = '', lines = [], max = CW - (nt.kind === 'ok' ? 14 : 0);
          words.forEach(function (w) { var nx = cur ? cur + ' ' + w : w; if (cur && f.widthOfTextAtSize(nx, size) > max) { lines.push(cur); cur = w; } else cur = nx; });
          if (cur) lines.push(cur);
          lines.forEach(function (l, i) {
            room(size * 1.6);
            var x = M;
            if (nt.kind === 'ok' && i === 0) { pg.page.drawSvgPath('M0 4L3.5 7.5L10 0', { x: M, y: pg.H - y + 7, borderColor: c.pos, borderWidth: 1.5, borderLineCap: P.LineCapStyle.Round }); }
            if (nt.kind === 'ok') x += 14;
            pg.text(l, x, y, f, size, color);
            y += size * 1.55;
          });
          y += 3;
        });
        y += small ? 4 : 8;
      }
      // a courier's heading and table stay together when they fit on one page
      function sectionHead(s) {
        var whole = (small ? 30 : 46) + (small ? 15 : 22) + ROW * (s.chart.rows.length + 1) + 6, fresh = H - BOT - (small ? 42 : 76);
        if (y + whole + 12 > H - BOT && (whole <= fresh || y + 58 + ROW * 4 > H - BOT)) newPage(false);
        else y += small ? 6 : 12;
        title(s.title, s.sub, 'truck');
      }

      newPage(true);
      kpis(data.kpis);
      splitBar(data.main);
      title(data.tableTitle || 'Pieces by SKU', data.tableSub, data.blouse ? 'blouse' : 'box');
      table(data.main, false);
      notes(data.notes);
      (data.sections || []).forEach(function (s) { sectionHead(s); table(s.chart, false); });
      // a hand-written sign-off
      if (!small && data.end) {
        if (y + 40 > H - BOT) newPage(false);
        pg.text(data.end, W / 2, y + 18, F.hand, 15, pg.col.coral, { align: 'center', rotate: 2 });
        pg.icon('heart', W / 2 + pg.width(data.end, F.hand, 15) / 2 + 14, y + 12, 12, 10, pg.col.coral, 0.9);
      }
      // footers
      pages.forEach(function (p, i) {
        var c = p.col, fy = H - (small ? 10 : 32);
        p.line(M, fy - (small ? 8 : 14), W - M, fy - (small ? 8 : 14), c.rule, 0.6, { dash: [2, 2] });
        if (!small) p.icon('tag', M + 5, fy - 3, 10, -20, c.lav, 0.8);
        p.text(p.fit(data.footer || 'Made with PakkaBill', F.serif, small ? 5.6 : 6.6, CW - 80), M + (small ? 0 : 14), fy, F.serif, small ? 5.6 : 6.6, c.grey);
        p.text('Page ' + (i + 1) + ' of ' + pages.length, W - M, fy, F.disp, small ? 5.8 : 7, c.indigo, { align: 'right' });
      });
      return { pages: pages.length, brand: F.brand };
    });
  }
  // one colour per size column, the same in the cards, the split bar, the table and the size mix
  function sizeColors(P, cols, blouse) {
    var m = {};
    if (blouse) { m.L = SIZE_HEX[0]; m.XL = SIZE_HEX[1]; m.XXL = SIZE_HEX[2]; }
    var i = blouse ? 3 : 0;
    cols.forEach(function (k) { if (!m[k]) m[k] = SIZE_HEX[i++ % SIZE_HEX.length]; });
    return function (k) {
      var h = m[k] || '#9A96B0';
      return P.rgb(parseInt(h.substr(1, 2), 16) / 255, parseInt(h.substr(3, 2), 16) / 255, parseInt(h.substr(5, 2), 16) / 255);
    };
  }

  window.PBPDF = { draw: draw, fonts: fonts, painter: painter, DOODLE: DOODLE };
})();
