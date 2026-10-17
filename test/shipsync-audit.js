// Checks of the Lens shipping sync logic (lens/shipcore.js) on recorded requests shaped like the ways a
// supplier panel can upload a photo and ask for its shipping: a direct upload then a shipping request,
// an upload link handed out first (cloud storage) then the upload and the shipping request, and the
// shipping coming back with the upload itself. Also: finding the category, Meesho's category list,
// swapping values for a new photo and category, never touching risky requests, a report without values.
// Run: node test/shipsync-audit.js   (exits 1 on any failure)
'use strict';
const S = require('../lens/shipcore.js');

let fails = 0, checks = 0;
function ok(cond, what, detail) { checks++; if (!cond) { fails++; console.log('FAIL  ' + what + (detail ? '  ' + detail : '')); } }
function eq(a, b, what) { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, what, `expected ${B}, got ${A}`); }
const J = (o) => ({ kind: 'json', text: JSON.stringify(o) });

/* ---------- 1. direct upload, then a shipping request (JSON) ---------- */
const IMG = 'https://images.meesho.com/images/catalog/abc123def.jpg';
const A = [
  { method: 'GET', url: 'https://supplier.meesho.com/api/v1/supplier/profile', body: { kind: 'none' }, status: 200, resJson: { data: { supplier_id: 556677, name: 'Rangrez' } } },
  { method: 'GET', url: 'https://supplier.meesho.com/api/v1/categories/tree', body: { kind: 'none' }, status: 200, resJson: { data: { categories: [{ id: 10, name: 'Women Ethnic', children: [{ id: 1234, name: 'Blouses' }, { id: 1240, name: 'Sarees' }, { id: 1250, name: 'Kurtis' }] }, { id: 20, name: 'Home', children: [{ id: 2100, name: 'Bedsheets' }] }] } } },
  { method: 'POST', url: 'https://supplier.meesho.com/catalogingapi/api/image/upload', body: { kind: 'form', entries: [['file', { file: true, name: 'blouse.jpg', type: 'image/jpeg', size: 52341 }], ['supplier_id', '556677']] }, file: { size: 52341 }, status: 200, resJson: { data: { image_url: IMG, image_id: 98765432 } } },
  { method: 'POST', url: 'https://supplier.meesho.com/api/v1/log/event', body: J({ ev: 'upload', url: IMG }), status: 200, resJson: { ok: true } },
  { method: 'POST', url: 'https://supplier.meesho.com/catalogingapi/api/pricing/shipping', body: J({ sscat_id: 1234, supplier_id: 556677, images: [{ url: IMG, id: 98765432 }], price: 349, weight: 0.4 }), status: 200, resJson: { data: { shipping_charges: 85, transfer_price: 300, free_shipping: false, delivery_tat_days: 5, gst_percent: 5, weight_slab: '0.5' } } },
];
let sh = S.findShipping(A, 2, 85);
eq(sh && [sh.idx, sh.path, sh.n], [4, ['data', 'shipping_charges'], 85], 'finds the answer holding the ₹85 Meesho showed');
eq(S.findShipping(A, 2, null) && S.findShipping(A, 2, null).path, ['data', 'shipping_charges'], 'without the page number, still picks the shipping charge (not weight, GST, days or a flag)');
ok(S.findShipping(A, 2, 99) === null, 'a different number on the page: nothing learned from a wrong answer');
let p = S.plan(A, 2, sh);
eq(p.steps, [2, 4], 'sends again: the upload and the shipping request (not the log event; not the profile or category list read before, whose values stay the same)');
eq(p.cat && [p.cat.where, p.cat.path, p.cat.value], ['json', ['sscat_id'], '1234'], 'finds the category id in the shipping request');
// a new photo: Meesho answers the upload with a new address and id
const map = new Map([['52341', 61002]]);
S.align(A[2].resJson, { data: { image_url: 'https://images.meesho.com/images/catalog/zzz999.jpg', image_id: 11112222 } }, map);
eq([map.get(IMG), map.get('98765432')], ['https://images.meesho.com/images/catalog/zzz999.jpg', 11112222], 'old -> new address and id from the new upload answer');
let body = JSON.parse(S.swapBody(A[4].body, map).text);
eq([body.images[0].url, body.images[0].id, body.sscat_id, body.price], ['https://images.meesho.com/images/catalog/zzz999.jpg', 11112222, 1234, 349], 'shipping request with the new photo: address and id swapped, number stays a number, the rest unchanged');
const forCat = S.putAt({ ...A[4], body: S.swapBody(A[4].body, map) }, p.cat, '1240');
eq(JSON.parse(forCat.body.text).sscat_id, 1240, 'another category: only the category id changes, kept as a number');
eq(JSON.parse(A[4].body.text).sscat_id, 1234, 'the recorded request itself is not changed');

/* ---------- categories ---------- */
const cats = S.categoriesIn(A[1].resJson, A[1].url);
const blouse = cats.find((c) => c.id === '1234');
eq(blouse && [blouse.name, blouse.path, blouse.leaf], ['Blouses', 'Women Ethnic > Blouses', true], 'category list: name, path and leaf');
eq(cats.find((c) => c.id === '10').leaf, false, 'a parent category is not a leaf');
eq(S.categoriesIn({ data: { name: 'Rangrez', id: 5 } }, '/api/profile').length, 0, 'a profile is not a category list');
eq((S.matchCategory('Blouse', cats) || {}).id, '1234', 'PakkaBill "Blouse" -> Meesho "Blouses"');
eq((S.matchCategory('saree', cats) || {}).id, '1240', '"saree" -> "Sarees"');
eq((S.matchCategory('Bedsheets', cats) || {}).id, '2100', 'exact name in another branch');
eq(S.matchCategory('Laptops', cats), null, 'no match: none');

/* ---------- 2. upload link first (cloud storage), XHR, form-encoded shipping request ---------- */
const PUT = 'https://meesho-uploads.s3.ap-south-1.amazonaws.com/tmp/k1a2b3.jpg?X-Amz-Signature=aaa111bbb222&X-Amz-Expires=600';
const FILE = 'https://images.meesho.com/tmp/k1a2b3.jpg';
const B = [
  { method: 'POST', url: 'https://supplier.meesho.com/api/upload/presign', body: J({ file_name: 'blouse.jpg', content_type: 'image/jpeg', size: 52341 }), status: 200, resJson: { upload_url: PUT, file_url: FILE } },
  { method: 'PUT', url: PUT, body: { kind: 'blob', type: 'image/jpeg', size: 52341 }, file: { size: 52341 }, status: 200, resJson: null },
  { method: 'GET', url: 'https://supplier.meesho.com/api/notifications/count', body: { kind: 'none' }, status: 200, resJson: { count: 3 } },
  { method: 'POST', url: 'https://supplier.meesho.com/api/catalog/shipping-estimate', body: { kind: 'urlenc', text: 'category_id=4321&image=' + encodeURIComponent(FILE) + '&mrp=999' }, status: 200, resJson: { result: { delivery: { charge: '₹72', eta: '4-6 days' } } } },
];
sh = S.findShipping(B, 1, 72);
eq(sh && [sh.idx, sh.path, sh.n], [3, ['result', 'delivery', 'charge'], 72], '"₹72" under delivery.charge is the shipping');
p = S.plan(B, 1, sh);
eq(p.steps, [0, 1, 3], 'sends again: the upload link request, the upload, the shipping request (not the notification count)');
eq(p.cat && [p.cat.where, p.cat.name, p.cat.value], ['urlenc', 'category_id', '4321'], 'category in a form-encoded request');
const m2 = new Map([['52341', 48000]]);
eq(JSON.parse(S.swapBody(B[0].body, m2).text).size, 48000, 'the upload link request gets the new photo size');
S.align(B[0].resJson, { upload_url: PUT.replace('k1a2b3', 'q9w8e7').replace('aaa111bbb222', 'ccc333ddd444'), file_url: FILE.replace('k1a2b3', 'q9w8e7') }, m2);
eq(S.swapUrl(B[1].url, m2), PUT.replace('k1a2b3', 'q9w8e7').replace('aaa111bbb222', 'ccc333ddd444'), 'the upload goes to the new upload link');
const q = new URLSearchParams(S.swapBody(B[3].body, m2).text);
eq([q.get('image'), q.get('category_id'), q.get('mrp')], [FILE.replace('k1a2b3', 'q9w8e7'), '4321', '999'], 'form-encoded shipping request: new photo address');
eq(new URLSearchParams(S.putAt({ ...B[3], body: S.swapBody(B[3].body, m2) }, p.cat, '4400').body.text).get('category_id'), '4400', 'category swapped in a form-encoded request');

/* ---------- 3. shipping in the upload answer ---------- */
const Cc = [
  { method: 'POST', url: '/api/v2/catalog/front-image?sscat=777', body: { kind: 'form', entries: [['image', { file: true }], ['meta', JSON.stringify({ sscat_id: 777 })]] }, file: { size: 9000 }, status: 200, resJson: { image: { url: 'https://img.example/x1y2z3.jpg' }, logistics: { shippingCharges: 64, weightGrams: 400 } } },
];
sh = S.findShipping(Cc, 0, 64);
eq(sh && [sh.idx, sh.path], [0, ['logistics', 'shippingCharges']], 'shipping in the upload answer itself');
p = S.plan(Cc, 0, sh);
eq(p.steps, [0], 'only the upload is sent again');
ok(p.cat && (p.cat.name === 'sscat' || (p.cat.path && p.cat.path.join('.') === 'sscat_id')), 'category found in the query or the form JSON', JSON.stringify(p.cat));
eq(S.swapUrl('/api/v2/catalog/front-image?sscat=777', new Map()), '/api/v2/catalog/front-image?sscat=777', 'a path-only address stays path-only');
eq(S.putAt({ url: '/api/v2/catalog/front-image?sscat=777', body: { kind: 'none' } }, { where: 'query', name: 'sscat' }, '888').url, '/api/v2/catalog/front-image?sscat=888', 'category swapped in the query');
eq(JSON.parse(S.putAt(Cc[0], { where: 'formjson', name: 'meta', path: ['sscat_id'] }, '888').body.entries[1][1]).sscat_id, 888, 'category swapped inside a JSON form field');

/* ---------- safety ---------- */
const D = A.map((c) => ({ ...c }));
D[4] = { ...D[4], url: 'https://supplier.meesho.com/catalogingapi/api/catalog/submit' };
eq(S.plan(D, 2, S.findShipping(D, 2, 85)).error, 'danger', 'never sends a catalogue submit again');
eq(S.plan(A, -1, null).error, 'nofile', 'no upload seen: nothing to send');
['https://x/api/payout/details', 'https://x/api/orders/list', 'https://x/api/catalogs/create', 'https://x/api/logout', 'https://x/api/bulk/upload'].forEach((u) => ok(S.DANGER.test(u), 'risky address refused: ' + u));
['https://x/catalogingapi/api/image/upload', 'https://x/api/pricing/shipping', 'https://x/api/upload/presign'].forEach((u) => ok(!S.DANGER.test(u), 'normal address allowed: ' + u));
const rep = JSON.stringify(S.report(A, S.plan(A, 2, S.findShipping(A, 2, 85))));
ok(rep.indexOf('abc123def') < 0 && rep.indexOf('556677') < 0 && rep.indexOf('98765432') < 0 && rep.indexOf('Rangrez') < 0, 'the support report has no photo address, ids or names');
ok(/shipping_charges/.test(rep) && /sscat_id/.test(rep), 'the support report shows the shape (value names)');

/* ---------- small parts ---------- */
eq([S.num('₹ 1,234'), S.num('85'), S.num(85.5), S.num('free'), S.num(true)], [1234, 85, 85.5, null, null], 'reading amounts');
eq(S.shipLeaves({ free_shipping: 1, shipping_weight: 400, delivery_tat_days: 5, shipping_charges_gst: 9, shippingFee: 70 }).map((l) => l.key), ['shippingFee'], 'only real shipping charges count');
eq([S.distinct('abc'), S.distinct('abc123'), S.distinct(42), S.distinct(556677), S.distinct('image/jpeg')], [false, true, false, true, false], 'which values are followed between requests');
ok(S.carries(A[4], IMG) && !S.carries(A[4], 'zzz'), 'a request carries the photo address');

console.log(`${checks - fails}/${checks} shipping sync checks passed`);
process.exit(fails ? 1 : 0);
