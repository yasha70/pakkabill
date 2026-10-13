// Checks of the low shipping image engine (lowship.js, window.PBShip) on made-up photos whose answers
// are known: background colour, plain or busy, the product's box (specks dropped, pairs kept, shading
// and soft shadows treated as background), placing the product at a size, the best size from the
// seller's results, and the ZIP of the photos.
// Run: node test/lowship-audit.js   (exits 1 on any failure)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
global.window = global;
require('../lowship.js');
const E = global.PBShip;

let fails = 0, checks = 0;
function ok(cond, what, detail) { checks++; if (!cond) { fails++; console.log('FAIL  ' + what + (detail ? '  ' + detail : '')); } }
function eq(a, b, what) { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, what, `expected ${B}, got ${A}`); }
const near = (a, b, t) => Math.abs(a - b) <= t;
function boxNear(got, want, t, what) { ok(got && ['x', 'y', 'w', 'h'].every((k) => near(got[k], want[k], t)), what, `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); }

// A made-up photo: background colour or function(x, y) -> [r,g,b], then shapes drawn on top.
function photo(w, h, bg, shapes = []) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = typeof bg === 'function' ? bg(x, y) : bg, i = (y * w + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
  for (const s of shapes) for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) {
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const c = typeof s.c === 'function' ? s.c(x, y) : s.c;
    if (!c) continue;
    const i = (y * w + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2];
  }
  return { width: w, height: h, data };
}
const W = [255, 255, 255];
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

/* 1. background colour */
let a = E.analyze(photo(300, 400, W, [{ x: 60, y: 80, w: 150, h: 220, c: [180, 30, 60] }]));
eq([a.bg, a.plain], [[255, 255, 255], true], 'white background found, plain');
boxNear(a.box, { x: 60, y: 80, w: 150, h: 220 }, 0, 'product box exact on white');
eq(E.fillOf(a.box, 300, 400), 55, 'product fills 55% of the longer side');
a = E.analyze(photo(300, 300, [236, 236, 238], [{ x: 100, y: 50, w: 90, h: 200, c: [20, 20, 90] }]));
eq([a.bg, a.plain], [[236, 236, 238], true], 'light grey background found');
boxNear(a.box, { x: 100, y: 50, w: 90, h: 200 }, 0, 'product box on grey');

/* 2. what counts as product */
a = E.analyze(photo(400, 400, W, [{ x: 120, y: 100, w: 160, h: 200, c: [40, 120, 40] }, { x: 20, y: 20, w: 2, h: 2, c: [0, 0, 0] }, { x: 370, y: 350, w: 3, h: 3, c: [90, 90, 90] }]));
boxNear(a.box, { x: 120, y: 100, w: 160, h: 200 }, 0, 'dust and specks are not the product');
a = E.analyze(photo(400, 300, W, [{ x: 60, y: 100, w: 80, h: 120, c: [200, 160, 20] }, { x: 260, y: 100, w: 80, h: 120, c: [200, 160, 20] }]));
boxNear(a.box, { x: 60, y: 100, w: 280, h: 120 }, 0, 'a pair (earrings) stays together');
// a white product with a visible outline: its inside is not background
const outline = (x, y) => (x === 100 || x === 219 || y === 60 || y === 259 ? [120, 120, 120] : [255, 255, 255]);
a = E.analyze(photo(320, 320, W, [{ x: 100, y: 60, w: 120, h: 200, c: outline }]));
boxNear(a.box, { x: 100, y: 60, w: 120, h: 200 }, 0, 'white product with an edge: kept whole');
ok(a.mask[(160) * 320 + 160] === 0, 'inside of a white product is not turned into background');
// product touching the edge of the photo
a = E.analyze(photo(300, 300, W, [{ x: 0, y: 120, w: 140, h: 180, c: [10, 10, 10] }]));
boxNear(a.box, { x: 0, y: 120, w: 140, h: 180 }, 0, 'product touching the edges');

/* 3. shading and shadows */
const grad = (x, y) => { const v = Math.round(250 - (y / 400) * 40); return [v, v, v + 2]; }; // studio sweep 250 -> 210
a = E.analyze(photo(300, 400, grad, [{ x: 90, y: 120, w: 120, h: 160, c: [150, 20, 20] }]));
ok(a.plain, 'studio gradient counts as plain');
boxNear(a.box, { x: 90, y: 120, w: 120, h: 160 }, 1, 'product box on a gradient background');
const shadow = (x, y) => { const d = y - 279; return d > 0 && d <= 14 ? [255 - Math.round(30 * (1 - d / 15)), 255 - Math.round(30 * (1 - d / 15)), 255 - Math.round(30 * (1 - d / 15))] : null; };
a = E.analyze(photo(300, 400, W, [{ x: 80, y: 280, w: 140, h: 15, c: shadow }, { x: 90, y: 100, w: 120, h: 180, c: [30, 60, 160] }]));
boxNear(a.box, { x: 90, y: 100, w: 120, h: 180 }, 2, 'soft shadow under the product is background');
a = E.analyze(photo(300, 300, [214, 214, 214], [{ x: 90, y: 90, w: 120, h: 120, c: [40, 40, 40] }]), { strength: 'gentle' });
boxNear(a.box, { x: 90, y: 90, w: 120, h: 120 }, 0, 'gentle cleaning still finds the product');

/* 4. busy photos are used whole */
seed = 11;
a = E.analyze(photo(200, 200, () => [rnd() * 255, rnd() * 255, rnd() * 255].map(Math.round), [{ x: 50, y: 50, w: 100, h: 100, c: [255, 0, 0] }]));
eq([a.plain, a.mask, a.box], [false, null, { x: 0, y: 0, w: 200, h: 200 }], 'busy background: whole photo, nothing cleaned');
a = E.analyze(photo(200, 200, W, []));
eq([a.plain, a.box], [false, { x: 0, y: 0, w: 200, h: 200 }], 'empty white photo: whole photo');
a = E.analyze(photo(200, 200, W, [{ x: 40, y: 40, w: 100, h: 100, c: [0, 0, 0] }]), { strength: 'off' });
eq(a.mask, null, 'cleaning off: no mask');

/* 5. placing the product */
const p55 = E.place({ w: 300, h: 200 }, 55, 1000);
eq([p55.w, Math.round(p55.h * 100) / 100, p55.x, Math.round(p55.y * 100) / 100], [550, 366.67, 225, 316.67], 'longer side is 55% of 1000, centred');
const p = E.place({ w: 120, h: 480 }, 80, 1000);
eq([Math.round(p.h), Math.round(p.w), Math.round(p.y), Math.round(p.x)], [800, 200, 100, 400], 'tall product at 80%: 800 high, centred');
ok(E.FILLS.length === 8 && E.FILLS[0] === 40 && E.FILLS[7] === 80, 'eight sizes from 40% to 80%');

/* 6. the seller's results */
eq(E.bestFill({ 50: [80, 70], 55: [60], 60: [60, 62], 70: [] }), { fill: 55, avg: 60, tries: 1 }, 'lowest average shipping wins');
eq(E.bestFill({ 50: [62, 62], 55: [62] }), { fill: 50, avg: 62, tries: 2 }, 'a tie goes to the size tried more');
eq(E.bestFill({}), null, 'no results: no suggestion');

/* 7. ZIP */
eq(E.crc32(new TextEncoder().encode('123456789')).toString(16), 'cbf43926', 'CRC-32 check value');
const files = [{ name: 'blouse-meesho-55.jpg', data: new Uint8Array([1, 2, 3, 4, 5]) }, { name: 'साड़ी-60.jpg', data: new TextEncoder().encode('hello') }];
const zipPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pbs-')), 'x.zip');
fs.writeFileSync(zipPath, Buffer.concat(E.zipParts(files).map((u) => Buffer.from(u))));
let zipOut = '';
try {
  zipOut = execFileSync('python3', ['-I', '-c', 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print("|".join(n+":"+z.read(n).hex() for n in z.namelist()))', zipPath]).toString().trim();
} catch (e) { zipOut = 'error ' + e.message; }
eq(zipOut, 'blouse-meesho-55.jpg:0102030405|साड़ी-60.jpg:68656c6c6f', 'ZIP opens, names (Hindi too) and contents intact');

console.log(`${checks - fails}/${checks} low shipping image checks passed`);
if (fails) process.exit(1);
