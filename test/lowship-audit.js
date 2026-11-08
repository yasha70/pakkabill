// Checks of the low shipping image engine (lowship.js, window.PBShip) on made-up photos whose answers
// are known: background colour, plain or busy, the product's box (specks dropped, pairs kept, shading
// and soft shadows treated as background, for the clean white version), the versions (all small,
// professional changes; the seller's own photo first), light and colour changes on pixels, the cover
// zoom for turned photos, results and savings, reading Meesho's price, and the ZIP of the photos.
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

/* 5. the versions: small changes, product full size */
const T = E.tweaks(40);
eq([E.tweaks(12).length, E.tweaks(24).length, T.length, T[0].key, T[0].label], [12, 24, 40, 'orig', 'Your photo'], '12 / 24 / 40 versions, your own photo first');
eq(new Set(T.map((t) => t.key)).size, 40, 'every version has its own name');
ok(T.every((t) => (t.zoom == null || (t.zoom >= 0.9 && t.zoom <= 1.1)) && Math.abs(t.rot || 0) <= 3 && Math.abs(t.dx || 0) <= 0.03 && Math.abs(t.dy || 0) <= 0.03
  && Math.abs(t.light || 0) <= 0.1 && (t.contrast == null || Math.abs(t.contrast - 1) <= 0.1 + 1e-9) && (t.sat == null || Math.abs(t.sat - 1) <= 0.1 + 1e-9) && (t.border || 0) <= 0.03 && (t.q == null || t.q >= 0.6)),
  'every change is small: zoom within 10%, turn within 3°, shift within 3%, light and colour within 10%, border within 3%');
ok(E.tweaks(24).every((t) => !t.flip), 'no mirror image in the usual 24 (writing on a product would flip)');
eq([E.keyLabel('zin3'), E.keyLabel('white'), E.keyLabel('old-key')], ['Zoom in 3%', 'Clean white background', 'An older version'], 'version names in plain words');
// turned photos are drawn a little bigger so no empty corners show
eq([E.coverScale(1000, 1000, 0), Math.round(E.coverScale(1000, 1000, 2) * 1000) / 1000, Math.round(E.coverScale(750, 1000, -2) * 1000) / 1000], [1, 1.034, 1.046], 'cover zoom for a turn: 2° needs about 3.4% (square), 4.6% (3:4 photo)');
const corner = (s, deg, w, h) => { const r = (deg * Math.PI) / 180, cx = w / 2, cy = h / 2; const x = cx * Math.cos(r) + cy * Math.sin(r), y = cx * Math.sin(r) + cy * Math.cos(r); return x <= (s * w) / 2 + 1e-9 && y <= (s * h) / 2 + 1e-9; };
ok([[1000, 1000, 2], [750, 1000, 3], [1200, 800, -3]].every(([w, h, d]) => corner(E.coverScale(w, h, d), Math.abs(d), w, h)), 'the frame corners stay inside the turned photo');
// sizes
eq([E.outSize(800, 1000, 'photo'), E.outSize(3000, 4000, 'photo'), E.outSize(1200, 1200, 'photo'), E.outSize(500, 700, 'square')], [{ w: 800, h: 1000 }, { w: 1125, h: 1500 }, { w: 1200, h: 1200 }, { w: 1000, h: 1000 }], 'same shape as the photo (1000-1500 px), or square');
// light and colour on pixels
const px = (...rgb) => new Uint8ClampedArray([...rgb, 255]);
eq([...E.adjustPixels(px(100, 150, 200), {})], [100, 150, 200, 255], 'no change asked: pixels untouched');
eq([...E.adjustPixels(px(100, 150, 200), { light: 0.05 })].slice(0, 3), [113, 163, 213], 'brighter: +5% of white');
eq([...E.adjustPixels(px(128, 128, 128), { contrast: 1.1, sat: 1.2 })].slice(0, 3), [128, 128, 128], 'grey stays grey with contrast and colour');
eq([...E.adjustPixels(px(200, 100, 50), { contrast: 1.1 })].slice(0, 3), [207, 97, 42], 'more contrast spreads from the middle');
const w0 = E.adjustPixels(px(150, 150, 150), { warm: 0.5 });
ok(w0[0] > 150 && w0[2] < 150, 'warmer: a little more red, a little less blue');
eq([...E.adjustPixels(px(250, 5, 128), { light: 0.1 })].slice(0, 3), [255, 30, 154], 'never past white or black');
const sh = new Uint8ClampedArray(3 * 3 * 4).fill(100); for (let i = 3; i < sh.length; i += 4) sh[i] = 255; sh[16] = sh[17] = sh[18] = 160;
E.sharpen(sh, 3, 3, 0.5);
eq([sh[16], sh[0]], [255, 100], 'sharpening lifts a bright centre, edges untouched');

/* 6. results and savings */
eq(E.bestOf({ zin3: [80, 70], white: [60], turn2: [60, 62] }), { key: 'white', avg: 60, tries: 1 }, 'lowest average shipping wins');
eq(E.bestOf({ zin3: [62, 62], white: [62] }), { key: 'zin3', avg: 62, tries: 2 }, 'a tie goes to the version tried more');
eq(E.bestOf({}), null, 'no results: no suggestion');
eq(E.summary({ orig: 82, zin3: 66, white: 66, turn2: 74 }), { low: 66, best: ['zin3', 'white'], own: 82, save: 16, checked: 4 }, 'saving against your own photo');
eq(E.summary({ zin3: 70 }), { low: 70, best: ['zin3'], own: null, save: null, checked: 1 }, 'own photo not checked yet: no saving shown');
eq(E.summary({ orig: 60, zin3: 64 }).save, 0, 'own photo already cheapest: saving 0');
eq(E.summary({}), null, 'nothing checked');

/* 7. reading the shipping Meesho shows */
eq(['Shipping Charges ₹ 72', 'Delivery charge: ₹1,234.50', 'Rs. 65', '₹\u00a058', '  89 ', 'Shipping charges will be calculated', '₹ 0'].map(E.rupeesIn), [72, 1234.5, 65, 58, 89, null, 0], 'rupees read from Meesho\'s text');

/* 8. ZIP */
eq(E.crc32(new TextEncoder().encode('123456789')).toString(16), 'cbf43926', 'CRC-32 check value');
const files = [{ name: 'blouse-meesho-55.jpg', data: new Uint8Array([1, 2, 3, 4, 5]) }, { name: 'साड़ी-60.jpg', data: new TextEncoder().encode('hello') }];
const zipPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pbs-')), 'x.zip');
fs.writeFileSync(zipPath, Buffer.concat(E.zipParts(files).map((u) => Buffer.from(u))));
let zipOut = '';
try {
  zipOut = execFileSync('python3', ['-I', '-c', 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print("|".join(n+":"+z.read(n).hex() for n in z.namelist()))', zipPath]).toString().trim();
} catch (e) { zipOut = 'error ' + e.message; }
eq(zipOut, 'blouse-meesho-55.jpg:0102030405|साड़ी-60.jpg:68656c6c6f', 'ZIP opens, names (Hindi too) and contents intact');

// Looks: natural only, natural with coloured frames, frames with stickers (like other tools make).
const looks = ['natural', 'mix', 'stickers'].map((l) => E.tweaks(40, l));
looks.forEach((list, i) => {
  const name = ['natural', 'mix', 'stickers'][i];
  eq([list[0].key, list.length], ['orig', 40], `${name}: your own photo first, 40 versions`);
  eq(new Set(list.map((t) => t.key)).size, list.length, `${name}: no version twice`);
});
ok(!looks[0].some((t) => t.frame || t.sticker), 'natural: no frames or stickers');
ok(E.tweaks(12, 'mix').filter((t) => t.frame).length >= 4 && !looks[1].some((t) => t.sticker), 'natural and frames: frames among the first 12, no stickers');
ok(E.tweaks(12, 'stickers').filter((t) => t.sticker).length >= 3, 'frames and stickers: stickers among the first 12');
ok(E.FRAMES.every((t) => t.frame > 0 && t.frame <= 0.04 && t.frameColor.length === 3), 'frames are thin (at most 4% of the photo) with a colour');
ok(E.STICKERS.every((t) => /^(tl|tr|bl|br)$/.test(t.corner)), 'every sticker sits in a corner');
eq(new Set(E.STICKERS.map((t) => t.corner)).size, 4, 'stickers use all four corners across versions');
eq([E.keyLabel('frame-maroon'), E.keyLabel(E.STICKERS[0].key)], ['Maroon frame', 'Hot sale sticker, navy blue frame'], 'frame and sticker names in plain words');
eq(Object.keys(E.LOOKS), ['smart', 'natural', 'mix', 'stickers'], 'four looks, smart first');
// results per category: { version: { category: rupees } }
const per = E.byCategory({ orig: { 1234: 85, 1240: 90 }, zin3: { 1234: 72, 1240: 95 }, 'frame-teal': { 1234: 72 }, white: { 1240: 88 } });
eq([per[1234].low, per[1234].best, per[1234].own, per[1234].save], [72, ['zin3', 'frame-teal'], 85, 13], 'per category: cheapest, ties, your photo, saving (Blouses)');
eq([per[1240].low, per[1240].best, per[1240].save], [88, ['white'], 2], 'per category: a different winner in another category (Sarees)');
eq(E.byCategory({}), {}, 'nothing checked: no summaries');


/* 9. smart: product size in the frame and studio backgrounds (what other low-shipping tools change) */
const smart = E.order('smart');
eq([smart[0].key, new Set(smart.map((t) => t.key)).size === smart.length], ['orig', true], 'smart: your photo first, no version twice');
ok(E.tweaks(12, 'smart').filter((t) => t.fill).length >= 3 && E.tweaks(12, 'smart').some((t) => t.frame) && E.tweaks(12, 'smart').some((t) => t.zoom && !t.fill), 'smart: product sizes, small zooms and frames all among the first 12');
ok(E.FILLS.every((t) => t.fill >= 0.5 && t.fill <= 0.92), 'product sizes stay between 50% and 92% of the square');
ok(E.STUDIO.every((t) => E.BACKDROPS[t.bd] && E.BACKDROPS[t.bd].every((v) => v >= 230)), 'studio backgrounds are all soft and light');
eq([E.needsCut({ fill: 0.8 }), E.needsCut({ bd: 'cream' }), E.needsCut({ white: true }), E.needsCut({ zoom: 1.03 }), E.needsCut({ frame: 0.03 })], [true, true, true, false, false], 'which versions need the product cut out');
// busy photo: the versions needing a cut-out are skipped and others take their place, so the count stays
const busy24 = E.pick(smart, 24, false), plain24 = E.pick(smart, 24, true);
eq([busy24.length, plain24.length, busy24.some(E.needsCut)], [24, 24, false], 'busy photo still gets 24 versions, none needing a cut-out');
eq(plain24.map((t) => t.key), E.tweaks(24, 'smart').map((t) => t.key), 'plain photo: the usual first 24');
// past winners come first, right after your photo
const led = E.pick(smart, 12, true, ['frame-teal', 'fill65', 'orig', 'gone-key']);
eq([led[0].key, led[1].key, led[2].key, led.length, new Set(led.map((t) => t.key)).size], ['orig', 'frame-teal', 'fill65', 12, 12], 'cheapest before goes first; unknown keys ignored');
eq(E.pick(smart, 6, false, ['fill65', 'turn2']).map((t) => t.key).slice(0, 2), ['orig', 'turn2'], 'a past winner that needs a cut-out is skipped on a busy photo');

/* 10. product placement for "fills" versions */
let pf = E.placeFill({ x: 100, y: 50, w: 200, h: 400 }, 600, 600, 1000, 1000, 0.8);
ok(near(pf.dh * 400 / pf.sh, 800, 1) && near(pf.dy + (50 + 200 - pf.sy) * pf.dh / pf.sh, 500, 1) && near(pf.dx + (100 + 100 - pf.sx) * pf.dw / pf.sw, 500, 1), 'product fills 80% of the square, centred', JSON.stringify(pf));
pf = E.placeFill({ x: 0, y: 0, w: 300, h: 100 }, 300, 100, 1000, 1000, 0.6, 0.04);
ok(near(pf.dw, 600, 1) && near(pf.dy + 50 * pf.dh / pf.sh, 540, 1) && pf.sx === 0 && pf.sw === 300, 'wide product touching the edges: 60% wide, sitting a little low, crop kept inside the photo', JSON.stringify(pf));
eq([E.fillOf({ x: 0, y: 0, w: 50, h: 80 }, 100, 100), E.fillOf(null, 1, 1)], [0.8, 1], 'how much of the photo the product fills');

/* 11. versions around the cheapest ("Try more like this"), with names that survive a reload */
const rt = { fill: 0.68, bd: 'cream', rot: -1, light: 0.03 };
const k = E.encode(rt), back = E.decode(k);
eq([k, back.fill, back.bd, back.rot, back.light], ['x-f68_rm1_l3_bdcream', 0.68, 'cream', -1, 0.03], 'settings kept in the version key');
eq(E.keyLabel(k), 'Product fills 68%, cream background, turned −1°, brighter', 'its name in plain words after a reload');
const fr = E.decode(E.encode({ fc: 'teal', frame: 0.03, frameColor: [14, 112, 114], zoom: 1.02 }));
eq([fr.fc, fr.frame, fr.frameColor, fr.zoom], ['teal', 0.03, [14, 112, 114], 1.02], 'frame colour comes back from the key');
eq([E.decode('zin3'), E.decode('x-'), E.keyLabel('x-zzz')], [null, null, 'Your photo again'], 'odd keys are safe');
const ar = E.around(E.FILLS[0], 12, ['x-f84_bdwhite']);
eq([ar.length, new Set(ar.map((t) => t.key)).size], [12, 12], '12 new versions around the cheapest, none twice');
ok(ar.every((t) => t.key !== 'fill80' && t.key !== 'x-f84_bdwhite' && t.key.length <= 60 && /^x-[\w-]+$/.test(t.key)), 'none repeats what was already made; keys are short and safe');
ok(ar.every((t) => t.fill >= 0.45 && t.fill <= 0.95 && Math.abs(t.rot || 0) <= 3 && Math.abs(t.light || 0) <= 0.1), 'every step stays small');
ok(ar.some((t) => t.fill === 0.76) && ar.some((t) => t.bd && t.bd !== 'white'), 'steps in product size and in background colour');
const af = E.around(E.FRAMES[3], 12);
ok(af.some((t) => t.fc && t.fc !== 'teal') && af.some((t) => t.zoom), 'around a frame: other frame colours and zooms');
ok(E.around({ key: 'orig', label: 'Your photo' }, 12).length >= 8, 'around your own photo when it was already the cheapest');
ok(af.every((t) => E.decode(t.key) && E.decode(t.key).label === t.label), 'every new version can be named again from its key');

/* 12. learning from past results */
eq(E.ranking([{ results: { orig: [80], fill65: [70, 72], zin3: [78], white: [85] } }, { results: { orig: [60], 'frame-teal': [55], fill65: [61] } }]), ['fill65', 'frame-teal', 'zin3'], 'versions cheaper than your photo, best first, across categories');
eq(E.ranking([{ results: { zin3: [70], white: [66] } }]), ['white'], 'own photo never checked: the cheapest only');
eq(E.ranking([]), [], 'no history: nothing brought forward');

/* 13. Meesho's photo rules */
eq(E.photoCheck(1000, 1000, 300000, 0.8), [], 'a good 1000×1000 photo passes');
eq(E.photoCheck(400, 600, 300000, null).map((n) => n.bad), [true, false], 'too small (and tall) is flagged');
ok(E.photoCheck(1000, 1000, 3e6, 0.3).some((n) => /2 MB/.test(n.text)) && E.photoCheck(1000, 1000, 1, 0.3).some((n) => /fills 30%/.test(n.text)), 'heavy files and a tiny product are flagged');

console.log(`${checks - fails}/${checks} low shipping image checks passed`);
if (fails) process.exit(1);
