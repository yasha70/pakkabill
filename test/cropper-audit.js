// Checks of the label cropper engine (cropper.js, window.PBCrop): finding the label on a page,
// ignoring specks, blank pages, the gap and "all sides" options, the minimum size, and turning the
// visual box into PDF coordinates for pages turned 0, 90, 180 and 270 degrees (same maths as PDF.js).
// Run: node test/cropper-audit.js   (exits 1 on any failure)
'use strict';
global.window = global;
require('../cropper.js');
const E = global.PBCrop;

let fails = 0, checks = 0;
function ok(cond, what, detail) { checks++; if (!cond) { fails++; console.log('FAIL  ' + what + (detail ? '  ' + detail : '')); } }
function eq(a, b, what) { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, what, `expected ${B}, got ${A}`); }

function page(w, h, rects) {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (const r of rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = r.c == null ? 0 : r.c;
  }
  return data;
}

// content box
eq(E.contentBox(page(100, 200, []), 100, 200), null, 'blank page is null');
eq(E.contentBox(page(100, 200, [{ x: 10, y: 5, w: 80, h: 90 }]), 100, 200), { top: 5, bottom: 95, left: 10, right: 90 }, 'label at the top');
eq(E.contentBox(page(100, 200, [{ x: 10, y: 5, w: 80, h: 90 }, { x: 50, y: 180, w: 1, h: 1 }]), 100, 200), { top: 5, bottom: 95, left: 10, right: 90 }, 'single speck below is ignored');
eq(E.contentBox(page(100, 200, [{ x: 10, y: 5, w: 80, h: 90 }, { x: 20, y: 150, w: 30, h: 2 }]), 100, 200).bottom, 152, 'a real line below is kept');
eq(E.contentBox(page(100, 200, [{ x: 0, y: 0, w: 100, h: 200, c: 245 }]), 100, 200), null, 'very light grey counts as white');
eq(E.contentBox(page(100, 200, [{ x: 10, y: 10, w: 20, h: 20, c: 200 }]), 100, 200), { top: 10, bottom: 30, left: 10, right: 30 }, 'mid grey counts as content');

// cut box
eq(E.cutBox(288, 842, { top: 10, bottom: 400, left: 20, right: 260 }, 8, false), { x0: 0, y0: 0, x1: 288, y1: 408 }, 'bottom only');
eq(E.cutBox(288, 842, { top: 10, bottom: 400, left: 20, right: 260 }, 8, true), { x0: 12, y0: 2, x1: 268, y1: 408 }, 'all sides');
eq(E.cutBox(288, 842, { top: 10, bottom: 838, left: 20, right: 260 }, 8, false).y1, 842, 'never past the page');
eq(E.cutBox(288, 842, { top: 2, bottom: 4, left: 100, right: 102 }, 0, true), { x0: 92, y0: 2, x1: 110, y1: 20 }, 'tiny content: at least the minimum size');

// PDF coordinates, checked against PDF.js's viewport transform
function pdfjsInverse(view, rot, vx, vy) {
  const [a, b, c, d] = view, cx = (a + c) / 2, cy = (b + d) / 2;
  let A, B, C, D;
  switch (rot) { case 90: A = 0; B = 1; C = 1; D = 0; break; case 180: A = -1; B = 0; C = 0; D = 1; break; case 270: A = 0; B = -1; C = -1; D = 0; break; default: A = 1; B = 0; C = 0; D = -1; }
  let ox, oy;
  if (A === 0) { ox = Math.abs(cy - b); oy = Math.abs(cx - a); } else { ox = Math.abs(cx - a); oy = Math.abs(cy - b); }
  const t = [A, B, C, D, ox - A * cx - C * cy, oy - B * cx - D * cy];
  const det = t[0] * t[3] - t[1] * t[2];
  const x = vx - t[4], y = vy - t[5];
  return [(x * t[3] - y * t[2]) / det, (y * t[0] - x * t[1]) / det];
}
const view = [15, 30, 303, 872]; // offset box, 288 x 842
for (const rot of [0, 90, 180, 270]) {
  const [vw, vh] = E.visualSize(view, rot);
  for (const [vx, vy] of [[0, 0], [vw, vh], [37, 121], [vw - 5, 9]]) {
    const got = E.toPdf(view, rot, vx, vy), want = pdfjsInverse(view, rot, vx, vy);
    ok(Math.abs(got[0] - want[0]) < 1e-9 && Math.abs(got[1] - want[1]) < 1e-9, `toPdf rot ${rot} (${vx},${vy})`, `expected ${want}, got ${got}`);
  }
  const full = E.pdfRect(view, rot, { x0: 0, y0: 0, x1: vw, y1: vh });
  eq(full, [15, 30, 288, 842], `full page rot ${rot} is the whole box`);
}
// rot 0: cut the bottom half → keeps the top half of user space
eq(E.pdfRect(view, 0, { x0: 0, y0: 0, x1: 288, y1: 421 }), [15, 451, 288, 421], 'rot 0 keeps the top');
// rot 90: visual is 842 wide x 288 tall; cut visual bottom at 100 → user x from 15 to 115
eq(E.pdfRect(view, 90, { x0: 0, y0: 0, x1: 842, y1: 100 }), [15, 30, 100, 842], 'rot 90 keeps the visual top');
eq(E.pdfRect(view, 180, { x0: 0, y0: 0, x1: 288, y1: 421 }), [15, 30, 288, 421], 'rot 180 keeps the visual top');
eq(E.pdfRect(view, 270, { x0: 0, y0: 0, x1: 842, y1: 100 }), [203, 30, 100, 842], 'rot 270 keeps the visual top');


// exact label sizes: the label fits inside the page with the margin, upright, centred; turned only when much bigger
eq(E.SIZES['4x4'], [288, 288], '4x4 inch is 288 x 288 pt');
eq(E.SIZES['4x6'], [288, 432], '4x6 inch is 288 x 432 pt');
const close = (a, b) => Math.abs(a - b) < 1e-6;
for (const rot of [0, 90, 180, 270]) {
  const [vw, vh] = E.visualSize(view, rot);
  // a tall label in the top part of the page as shown
  const cut = { x0: 10, y0: 12, x1: Math.min(vw, 10 + 260), y1: 12 + 380 };
  for (const [OW, OH, name] of [[288, 288, '4x4'], [288, 432, '4x6']]) {
    const f = E.fitMatrix(view, rot, cut, OW, OH, 6);
    const pts = [[cut.x0, cut.y0], [cut.x1, cut.y0], [cut.x0, cut.y1], [cut.x1, cut.y1]].map(([x, y]) => E.apply(f.m, ...E.toPdf(view, rot, x, y)));
    ok(pts.every(([x, y]) => x > 6 - 1e-6 && x < OW - 6 + 1e-6 && y > 6 - 1e-6 && y < OH - 6 + 1e-6), `${name} rot ${rot}: label inside the margin`, JSON.stringify(pts));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    ok(close((Math.min(...xs) + Math.max(...xs)) / 2, OW / 2) && close((Math.min(...ys) + Math.max(...ys)) / 2, OH / 2), `${name} rot ${rot}: centred`);
    ok(close(Math.max(...xs) - Math.min(...xs), OW - 12) || close(Math.max(...ys) - Math.min(...ys), OH - 12), `${name} rot ${rot}: as big as fits`);
    eq(f.turned, false, `${name} rot ${rot}: tall label is not turned`);
    // upright: the label's top-left (as shown) is at the top-left of the new page
    const tl = pts[0], br = pts[3];
    ok(tl[0] < br[0] && tl[1] > br[1], `${name} rot ${rot}: label stays upright`, JSON.stringify([tl, br]));
    const m = f.m; ok(m[0] * m[3] - m[1] * m[2] > 0, `${name} rot ${rot}: not mirrored`);
  }
  // a wide label on a 4x6 page is turned a quarter, and still not mirrored
  const wide = { x0: 0, y0: 0, x1: Math.min(vw, 280), y1: 120 };
  const fw = E.fitMatrix(view, rot, wide, 288, 432, 0);
  eq(fw.turned, true, `rot ${rot}: wide label turned on 4x6`);
  ok(fw.m[0] * fw.m[3] - fw.m[1] * fw.m[2] > 0, `rot ${rot}: turned label not mirrored`);
  const c = [[wide.x0, wide.y0], [wide.x1, wide.y1]].map(([x, y]) => E.apply(fw.m, ...E.toPdf(view, rot, x, y)));
  ok(c.every(([x, y]) => x > -1e-6 && x < 288 + 1e-6 && y > -1e-6 && y < 432 + 1e-6), `rot ${rot}: turned label inside the page`, JSON.stringify(c));
}

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
