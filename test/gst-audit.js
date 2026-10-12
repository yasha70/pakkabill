// Checks of the GST number lookup (api/_lib/gst.js, answered by api/config.js?gstin=): number checks, what the number
// itself says, reading answers in the shapes GSTIN services use, choosing the service, and the endpoint.
// Run: node test/gst-audit.js   (exits 1 on any failure)
'use strict';
process.env.PB_DEV_MEMORY_DB = '1'; // the in-memory database, for the saved answers and limits
const gst = require('../api/_lib/gst');

let fails = 0, checks = 0;
function ok(cond, what, detail) { checks++; if (!cond) { fails++; console.log('FAIL  ' + what + (detail ? '  ' + detail : '')); } }
function eq(a, b, what) { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, what, `expected ${B}, got ${A}`); }

(async () => {
  /* 1. the number */
  eq(['27AAPFU0939F1ZV', '29AAGCB7383J1Z4', '24AAACC1206D1ZM'].map((g) => gst.check(g).ok), [true, true, true], 'real-format numbers pass the check digit');
  eq(gst.check(' 27aapfu0939f1zv ').gstin, '27AAPFU0939F1ZV', 'spaces and small letters are fine');
  ok(/typo/.test(gst.check('27AAPFU0939F1ZX').message), 'wrong last character is caught');
  ok(/15/.test(gst.check('27AAPFU0939F1Z').message), 'too short');
  ok(/state code/.test(gst.check('40AAPFU0939F1ZV').message), 'unknown state code');
  ok(/does not look/.test(gst.check('27AAPF00939F1ZV').message), 'wrong pattern');
  eq(gst.fromNumber('27AAPFU0939F1ZV'), { gstin: '27AAPFU0939F1ZV', stateCode: '27', stateName: 'Maharashtra', pan: 'AAPFU0939F', entity: 'Firm / LLP' }, 'state, PAN and kind of business from the number');
  eq(gst.fromNumber('24ABCPK1234L1Z5').entity, 'Individual / Proprietor', 'P in the PAN: proprietor');

  /* 2. answers from services */
  const G = '27AAPFU0939F1ZV';
  // the GST portal's own record, as many services pass it on (sometimes wrapped)
  const portal = { flag: true, data: { gstin: G, lgnm: 'KAVYA FASHIONS PRIVATE LIMITED', tradeNam: 'Kavya Fashions', sts: 'Active', dty: 'Regular', ctb: 'Private Limited Company', rgdt: '01/07/2017',
    nba: ['Retail Business', 'Wholesale Business'], pradr: { addr: { bno: '12', flno: '2nd Floor', bnm: 'Silk House', st: 'Ring Road', loc: 'Udhna', city: '', dst: 'Surat', stcd: 'Gujarat', pncd: '395002' } } } };
  let r = gst.normalize(portal, G);
  eq([r.name, r.legalName, r.tradeName, r.address, r.pincode, r.status, r.type, r.constitution, r.regDate, r.business, r.stateCode, r.source],
    ['Kavya Fashions', 'KAVYA FASHIONS PRIVATE LIMITED', 'Kavya Fashions', '12, 2nd Floor, Silk House, Ring Road, Udhna, Surat, Gujarat, 395002', '395002', 'Active', 'Regular', 'Private Limited Company', '01/07/2017',
      ['Retail Business', 'Wholesale Business'], '27', 'online'], 'GST portal record: name, address in envelope order, status, type');
  // Cashfree Verification style
  r = gst.normalize({ reference_id: 1, GSTIN: G, legal_name_of_business: 'RAMESH KUMAR', trade_name_of_business: '', gst_in_status: 'Active', taxpayer_type: 'Regular', constitution_of_business: 'Proprietorship',
    date_of_registration: '2019-04-12', principal_place_address: 'Shop 4, MG Road, Jaipur, Rajasthan, 302001', valid: true, message: 'GSTIN Exists' }, G);
  eq([r.name, r.address, r.pincode, r.status, r.constitution, r.regDate], ['RAMESH KUMAR', 'Shop 4, MG Road, Jaipur, Rajasthan, 302001', '302001', 'Active', 'Proprietorship', '2019-04-12'], 'Cashfree-style answer');
  r = gst.normalize({ GSTIN: G, legal_name_of_business: 'X', principal_place_split_address: { building_number: '9', street: 'Main Road', district: 'Pune', state: 'Maharashtra', pincode: '411001' }, principal_place_address: 'old text' }, G);
  eq(r.address, '9, Main Road, Pune, Maharashtra, 411001', 'split address is used before the one-line address');
  // other common shapes
  r = gst.normalize({ result: { legalName: 'ABC', tradeName: 'ABC', status: 'Cancelled', address: ' Plot 7 ,  GIDC ,Vapi , Gujarat 396195 ' } }, G);
  eq([r.name, r.legalName, r.status, r.address, r.pincode], ['ABC', 'ABC', 'Cancelled', 'Plot 7, GIDC, Vapi, Gujarat 396195', '396195'], 'camelCase answer, address tidied, cancelled status kept');
  let err = null;
  try { gst.normalize({ flag: false, message: 'Invalid GSTIN / UID' }, G); } catch (e) { err = e; }
  ok(err && err.status === 404 && /No GST registration/.test(err.message), 'service says not found: clear message');
  err = null; try { gst.normalize({ valid: false, message: 'GSTIN Doesnt Exist' }, G); } catch (e) { err = e; }
  ok(err && err.status === 404, 'valid:false is not found');

  /* 3. choosing the service */
  const env = process.env; ['CASHFREE_CLIENT_ID', 'CASHFREE_CLIENT_SECRET', 'GST_LOOKUP_URL', 'GST_LOOKUP_HEADER', 'CASHFREE_SANDBOX'].forEach((k) => delete env[k]);
  eq(gst.config({}), null, 'nothing set: no service');
  eq(gst.config({ gst: { provider: 'cashfree', clientId: 'id', clientSecret: 'sec' } }), { provider: 'cashfree', clientId: 'id', clientSecret: 'sec', sandbox: false }, 'Cashfree from admin settings');
  eq(gst.config({ gst: { provider: 'url', url: 'http://x/{gstin}' } }), null, 'plain http address is refused');
  env.GST_LOOKUP_URL = 'https://api.example.com/v1/{gstin}'; env.GST_LOOKUP_HEADER = 'x-api-key: abc';
  eq(gst.config({ gst: { provider: '' } }), { provider: 'url', url: 'https://api.example.com/v1/{gstin}', header: 'x-api-key: abc' }, 'environment variables when admin has none');
  eq(gst.config({ gst: { provider: 'off' } }), null, 'admin can switch it off');

  /* 4. what each service is asked */
  const calls = [];
  const fake = (status, body) => (url, opt) => { calls.push({ url, opt }); return Promise.resolve({ status, ok: status < 400, json: () => Promise.resolve(body) }); };
  r = await gst.lookup({ provider: 'cashfree', clientId: 'cid', clientSecret: 'csec', sandbox: true }, G, fake(200, { legal_name_of_business: 'A', principal_place_address: 'B 1, Surat 395002' }));
  eq([calls[0].url, calls[0].opt.method, calls[0].opt.headers['x-client-id'], calls[0].opt.headers['x-client-secret'], JSON.parse(calls[0].opt.body)], ['https://sandbox.cashfree.com/verification/gstin', 'POST', 'cid', 'csec', { GSTIN: G }], 'Cashfree: POST with the keys in headers');
  r = await gst.lookup({ provider: 'url', url: 'https://api.example.com/v1/{gstin}?k=1', header: 'x-api-key: abc' }, G, fake(200, portal));
  eq([calls[1].url, calls[1].opt.headers['x-api-key'], r.name], ['https://api.example.com/v1/27AAPFU0939F1ZV?k=1', 'abc', 'Kavya Fashions'], 'other API: number in the address, key in the header');
  err = null; try { await gst.lookup({ provider: 'url', url: 'https://a.b/{gstin}' }, G, fake(401, { error: 'bad key' })); } catch (e) { err = e; }
  ok(err && /refused the key/.test(err.message), 'wrong key: says so');
  err = null; try { await gst.lookup({ provider: 'url', url: 'https://a.b/{gstin}' }, G, fake(404, null)); } catch (e) { err = e; }
  ok(err && err.status === 404, 'service 404: not found');
  err = null; try { await gst.lookup({ provider: 'url', url: 'https://a.b/{gstin}' }, G, () => Promise.reject(new Error('net'))); } catch (e) { err = e; }
  ok(err && err.status === 504, 'service unreachable: 504 with a message');

  /* 5. the endpoint: checks, offline answer, lookup once then the saved answer */
  delete env.GST_LOOKUP_URL; delete env.GST_LOOKUP_HEADER;
  const handler = require('../api/config');
  const call = (q) => new Promise((resolve) => {
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve({ status: this.statusCode, body: JSON.parse(b) }); } };
    handler({ method: 'GET', url: '/api/config?gstin=' + q, headers: { 'x-forwarded-for': '1.2.3.4' }, socket: {} }, res);
  });
  let a = await call('27AAPFU0939F1ZX');
  eq([a.status, /typo/.test(a.body.error)], [400, true], 'endpoint: bad number is refused before any lookup');
  a = await call(G);
  eq([a.status, a.body.offline, a.body.stateName, a.body.pan], [200, true, 'Maharashtra', 'AAPFU0939F'], 'endpoint without a service: what the number says');
  env.GST_LOOKUP_URL = 'https://api.example.com/v1/{gstin}';
  let hits = 0;
  global.fetch = (url) => { hits++; return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve(portal) }); };
  a = await call(G);
  eq([a.status, a.body.name, a.body.address.slice(0, 13), hits], [200, 'Kavya Fashions', '12, 2nd Floor', 1], 'endpoint: looks the number up');
  a = await call(G);
  eq([a.body.cached, a.body.name, hits], [true, 'Kavya Fashions', 1], 'endpoint: second time uses the saved answer, no new paid lookup');

  console.log(`${checks - fails}/${checks} GST lookup checks passed`);
  if (fails) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
