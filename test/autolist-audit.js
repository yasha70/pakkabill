// Checks of the auto listing logic (lens/listcore.js), shared by the Lens extension and PakkaBill's
// Auto listing page: labels, options, sizes, patterns, the fill plan, templates saved from a Meesho form.
// The form filling itself is checked in a browser against a React + MUI stand-in for Meesho's form.
// Run: node test/autolist-audit.js   (exits 1 on any failure)
'use strict';
const C = require('../lens/listcore.js');

let fails = 0, checks = 0;
function ok(cond, what, detail) { checks++; if (!cond) { fails++; console.log('FAIL  ' + what + (detail ? '  ' + detail : '')); } }
function eq(a, b, what) { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, what, `expected ${B}, got ${A}`); }

/* labels */
eq(C.norm('Net Weight (gms) *'), 'net weight gms', 'labels: brackets, star and case');
eq(C.norm('Colour'), 'color', 'labels: colour and color are one');
eq(C.canon('Stock'), 'inventory', 'labels: stock is Meesho\'s Inventory');
eq(C.canon('Selling Price'), 'meesho price', 'labels: selling price is Meesho Price');
eq(C.canon('Wrong/Defective Returns Price *'), 'wrong defective returns price', 'labels: the returns price');
eq(C.labelScore('Fabric', 'Fabric *'), 1, 'labels: the same field');
eq(C.labelScore('HSN', 'HSN Code'), 0.9, 'labels: a known other name');
eq(C.labelScore('Fabric', 'Pattern'), 0, 'labels: different fields');
ok(C.labelScore('Sleeve Length', 'Sleeve Length Type') > 0.6, 'labels: most words shared');
ok(C.labelScore('Blouse', 'Blouse Fabric') < 0.62, 'labels: Blouse is not Blouse Fabric');

/* options */
eq(C.matchOption(['0', '3', '5', '12', '18'], '5'), 2, 'options: GST 5');
eq(C.matchOption(['0%', '3%', '5%', '12%'], '5'), 2, 'options: 5 matches 5%');
eq(C.matchOption(['620630 - Blouses of cotton', '620640 - Blouses of man-made fibres'], '620630'), 0, 'options: HSN code starts the option');
eq(C.matchOption(['Navy Blue', 'Blue', 'Sky Blue'], 'Navy'), 0, 'options: part of a name');
eq(C.matchOption(['Navy Blue', 'Blue', 'Sky Blue'], 'blue'), 1, 'options: exact beats contains');
eq(C.matchOption(['Short Sleeves', 'Sleeveless'], 'short sleeves'), 0, 'options: any case');
eq(C.matchOption(['Free Size', 'S'], 'freesize'), 0, 'options: without spaces');
eq(C.matchOption(['Cotton', 'Silk'], 'Velvet'), -1, 'options: nothing fits');
eq(C.matchOption(['S', 'M', 'L'], 'XL'), -1, 'options: L is not XL');

/* sizes */
eq(C.splitMulti('S, M ; L|XL'), ['S', 'M', 'L', 'XL'], 'sizes: split on comma, semicolon and bar');
eq(C.sortSizes(['XL', 'S', 'Free Size', 'M', '3XL', 'XXL']), ['Free Size', 'S', 'M', 'XL', 'XXL', '3XL'], 'sizes: Meesho order');

/* templates and products */
const TPL = {
  id: 't1', name: 'Blouse', category: 'Women Fashion > Ethnic Wear > Blouses', title: '{color} {Fabric} Blouse',
  desc: '{color} {Fabric} blouse with {Ornamentation} work. Sizes {sizes}.',
  fields: [{ label: 'Fabric', value: 'Cotton' }, { label: 'Ornamentation', value: 'Zari' }, { label: 'Color', value: 'Red' }, { label: 'Occasion', value: 'Festive, Wedding', multi: true }, { label: 'GST', value: '5' }],
  sizes: [{ size: 'XL', price: '369', rprice: '', mrp: '1099', stock: '15' }, { size: 'M', price: '349', rprice: '349', mrp: '999', stock: '20' }],
};
const PROD = { name: 'Maroon blouse', color: 'Maroon', sku: 'BL-MRN', photos: ['p1'] };
eq(C.render(TPL.title, TPL, PROD), 'Maroon Cotton Blouse', 'patterns: product colour and template Fabric');
eq(C.render('{name} ({sizes})', TPL, PROD), 'Maroon blouse (M, XL)', 'patterns: name and sizes in Meesho order');
eq(C.render('{Missing} {name}', TPL, PROD), 'Maroon blouse', 'patterns: an unknown token is left out');
eq(C.sizesOf(TPL, PROD).map((s) => [s.size, s.price, s.rprice]), [['M', '349', '349'], ['XL', '369', '369']], 'sizes: sorted, return price defaults to the price');
eq(C.sizesOf(TPL, { ...PROD, price: '399', stock: '5' }).map((s) => [s.size, s.price, s.stock, s.mrp]), [['M', '399', '5', '999'], ['XL', '399', '5', '1099']], 'sizes: product price and stock for every size, MRP kept');
eq(C.sizesOf(TPL, { ...PROD, sizes: ['xl'] }).map((s) => s.size), ['XL'], 'sizes: a product can use some of the sizes');

const P = C.plan(TPL, PROD);
const at = (label, row) => P.find((x) => x.label === label && (x.row || '') === (row || ''));
eq(at('Product Name').value, 'Maroon Cotton Blouse', 'plan: name from the pattern');
eq([at('Size').value, at('Size').multi], ['M, XL', true], 'plan: sizes as one multi-choice');
eq(at('Color').value, 'Maroon', 'plan: the product colour wins over the template');
ok(!P.some((x) => x.label === 'Color' && x.value === 'Red'), 'plan: the template colour is not used too');
eq(at('Occasion').multi, true, 'plan: multi-choice details stay multi');
eq(at('Product Description').value, 'Maroon Cotton blouse with Zari work. Sizes M, XL.', 'plan: description from the pattern');
eq([at('Meesho Price', 'XL').value, at('MRP', 'XL').value, at('Inventory', 'XL').value, at('Supplier SKU ID', 'XL').value], ['369', '1099', '15', 'BL-MRN-XL'], 'plan: the XL row');
eq(at('Supplier SKU ID', 'M').value, 'BL-MRN-M', 'plan: SKU per size');
eq(C.plan({ ...TPL, sizes: [TPL.sizes[1]] }, PROD).find((x) => x.col === 'sku').value, 'BL-MRN', 'plan: one size keeps the plain SKU');
eq(P.filter((x) => x.label === 'Product Name').length, 1, 'plan: no field twice');
eq(C.plan(TPL, { ...PROD, fields: [{ label: 'Fabric', value: 'Silk' }] }).find((x) => x.label === 'Fabric').value, 'Silk', 'plan: a product field wins over the template');

/* finding the form field for a value */
const FIELDS = [
  { i: 0, label: 'Product Name', row: '' }, { i: 1, label: 'Size', row: '' }, { i: 2, label: 'Meesho Price', row: 'M' }, { i: 3, label: 'Meesho Price', row: 'XL' },
  { i: 4, label: 'MRP', row: 'M' }, { i: 5, label: 'Colour', row: '' }, { i: 6, label: 'HSN Code', row: '' }, { i: 7, label: 'Blouse Fabric', row: '' },
];
eq(C.bestField(at('Meesho Price', 'XL'), FIELDS).i, 3, 'fields: a size row cell by size and column');
eq(C.bestField(at('Color'), FIELDS).i, 5, 'fields: Color finds Colour');
eq(C.bestField({ label: 'HSN', value: '6206' }, FIELDS).i, 6, 'fields: HSN finds HSN Code');
eq(C.bestField({ label: 'Fabric', value: 'Cotton' }, FIELDS), null, 'fields: Fabric does not land in Blouse Fabric');
eq(C.bestField(at('Meesho Price', 'XL'), FIELDS, { 3: true }), null, 'fields: a field filled once is not used again');
eq(C.bestField({ label: 'Meesho Price', value: '1' }, FIELDS), null, 'fields: a value without a size does not go into a size row');

/* a template saved from a form filled in Meesho */
const L = C.learn([
  { label: 'Product Name', value: 'One blouse', kind: 'text' }, { label: 'Size', value: ['M', 'L'], kind: 'pick', multi: true },
  { label: 'Meesho Price', row: 'L', value: '349', kind: 'text' }, { label: 'MRP', row: 'L', value: '999', kind: 'text' }, { label: 'Inventory', row: 'L', value: '30', kind: 'text' },
  { label: 'Meesho Price', row: 'M', value: '339', kind: 'text' }, { label: 'Supplier SKU ID', row: 'M', value: 'X-M', kind: 'text' },
  { label: 'Fabric', value: 'Cotton', kind: 'pick' }, { label: 'Occasion', value: ['Festive', 'Wedding'], kind: 'combo', multi: true },
  { label: 'Front Image', value: '', kind: 'file' }, { label: 'Fabric', value: 'Silk', kind: 'pick' },
], 'Women Fashion > Blouses', 'Cotton blouse');
eq(L.fields, [{ label: 'Fabric', value: 'Cotton' }, { label: 'Occasion', value: 'Festive, Wedding', multi: true }], 'learn: details kept, product name, sizes and photos left out, first of a label wins');
eq(L.sizes, [{ size: 'M', price: '339' }, { size: 'L', price: '349', mrp: '999', stock: '30' }], 'learn: size rows become sizes, SKU left out');
eq([L.name, L.category, L.source], ['Cotton blouse', 'Women Fashion > Blouses', 'meesho'], 'learn: name and category');
eq(C.plan(L, { name: 'Next blouse' }).filter((x) => x.row === 'L').map((x) => x.value), ['349', '349', '999', '30'], 'learn: a learned template fills the size rows');

/* what stops a product */
eq(C.problems(null, PROD), ['Pick a template.'], 'problems: no template');
eq(C.problems(TPL, PROD), [], 'problems: a complete product');
ok(C.problems(TPL, { ...PROD, photos: [] }).some((x) => /photo/.test(x)), 'problems: no photo');
ok(C.problems({ ...TPL, title: '{name}' }, { ...PROD, name: '' }).some((x) => /name/.test(x)), 'problems: no name');
ok(C.problems(TPL, { ...PROD, price: '1200' }).some((x) => /above MRP/.test(x)), 'problems: price above MRP');
ok(C.problems({ ...TPL, sizes: [{ size: 'M', price: '', mrp: '', stock: '' }] }, PROD).some((x) => /Price is missing/.test(x)), 'problems: no price');
ok(C.problems({ ...TPL, sizes: [] }, PROD).some((x) => /no sizes/.test(x)), 'problems: no sizes');

console.log(`${checks - fails}/${checks} auto listing checks passed`);
process.exit(fails ? 1 : 0);
