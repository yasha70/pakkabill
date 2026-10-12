// GST number (GSTIN) helpers: check a number, read what the number itself says (state, PAN, kind of
// business), and look up the registered name and address from a GST lookup service.
//
// The service is chosen in admin (Settings > GST number lookup) or with environment variables:
//   GSTIN API (gstinapi.in): GSTINAPI_KEY (free trial lookups, then paid credits)
//   Cashfree Verification:  CASHFREE_CLIENT_ID + CASHFREE_CLIENT_SECRET (CASHFREE_SANDBOX=1 for test keys)
//   Any other GSTIN API:    GST_LOOKUP_URL with {gstin} in it, and GST_LOOKUP_HEADER ("x-api-key: ...") if it needs one
// Most of these services pass on the GST portal's own record (lgnm, tradeNam, pradr...) or the same
// facts under longer names; normalize() reads either.
const core = require('./core');

const CH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const FORMAT = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const STATES = { '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan',
  '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
  '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra', '28': 'Andhra Pradesh (old)', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory', '99': 'Centre Jurisdiction' };
// The 4th letter of a PAN says what kind of taxpayer it is.
const ENTITY = { P: 'Individual / Proprietor', C: 'Company', H: 'Hindu Undivided Family', F: 'Firm / LLP', A: 'Association of Persons', T: 'Trust', B: 'Body of Individuals',
  L: 'Local Authority', J: 'Artificial Juridical Person', G: 'Government' };

function clean(g) { return String(g || '').toUpperCase().replace(/[^0-9A-Z]/g, ''); }
function checkDigit(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) { const p = CH.indexOf(first14[i]) * (i % 2 ? 2 : 1); sum += Math.floor(p / 36) + (p % 36); }
  return CH[(36 - (sum % 36)) % 36];
}
// { ok, message }
function check(raw) {
  const g = clean(raw);
  if (g.length !== 15) return { ok: false, message: 'A GST number has 15 letters and digits.' };
  if (!FORMAT.test(g)) return { ok: false, message: 'That does not look like a GST number.' };
  if (!STATES[g.slice(0, 2)]) return { ok: false, message: 'The first two digits are not a state code.' };
  if (checkDigit(g.slice(0, 14)) !== g[14]) return { ok: false, message: 'The last character does not match. Check the number for a typo.' };
  return { ok: true, gstin: g };
}
// What the number itself tells: state, PAN and kind of business.
function fromNumber(g) {
  const pan = g.slice(2, 12);
  return { gstin: g, stateCode: g.slice(0, 2), stateName: STATES[g.slice(0, 2)] || '', pan, entity: ENTITY[pan[3]] || '' };
}

/* ---------- reading any service's answer ---------- */
const key = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIAS = {
  legal: ['lgnm', 'legal_name', 'legalName', 'legal_name_of_business', 'legalNameOfBusiness', 'business_name', 'businessName'],
  trade: ['tradeNam', 'trade_name', 'tradeName', 'trade_name_of_business', 'tradeNameOfBusiness'],
  addr: ['adr', 'address', 'principal_place_address', 'principalPlaceAddress', 'full_address', 'fullAddress', 'principal_address', 'principalAddress'],
  status: ['sts', 'status', 'gst_in_status', 'gstin_status', 'gstinStatus', 'gstn_status'],
  reg: ['rgdt', 'registration_date', 'date_of_registration', 'dateOfRegistration', 'registrationDate'],
  type: ['dty', 'taxpayer_type', 'taxpayerType'],
  ctb: ['ctb', 'constitution_of_business', 'constitutionOfBusiness', 'business_constitution', 'constitution'],
  pin: ['pncd', 'pincode', 'pin_code', 'pinCode'],
  nba: ['nba', 'nature_of_business_activities', 'natureOfBusinessActivities', 'nature_of_business'],
  split: ['addr', 'principal_place_split_address', 'principalPlaceSplitAddress', 'split_address', 'address_split'],
};
Object.keys(ALIAS).forEach((k) => { ALIAS[k] = ALIAS[k].map(key); });
// First value found under any of the names, searching the answer level by level (the record, then inside it).
function find(obj, names, want) {
  const queue = [obj], seen = new Set();
  while (queue.length) {
    const o = queue.shift();
    if (!o || typeof o !== 'object' || seen.has(o)) continue;
    seen.add(o);
    for (const n of names) {
      for (const k of Object.keys(o)) {
        if (key(k) !== n) continue;
        const v = o[k];
        if (want === 'object' ? v && typeof v === 'object' && !Array.isArray(v) : want === 'list' ? Array.isArray(v) : (typeof v === 'string' || typeof v === 'number') && String(v).trim()) return v;
      }
    }
    Object.keys(o).forEach((k) => { if (o[k] && typeof o[k] === 'object') queue.push(o[k]); });
  }
  return want === 'list' ? [] : '';
}
// The address parts, in the order they are written on an envelope.
const PARTS = [['bno', 'building_number', 'buildingNumber', 'door_number'], ['flno', 'flat_number', 'flatNumber', 'floor_number'], ['bnm', 'building_name', 'buildingName'],
  ['st', 'street'], ['loc', 'location', 'locality'], ['city'], ['dst', 'district'], ['stcd', 'state'], ['pncd', 'pincode', 'pin_code']].map((a) => a.map(key));
function joinAddress(o) {
  const out = [];
  PARTS.forEach((names) => {
    const k = Object.keys(o).find((x) => names.includes(key(x)));
    const v = k ? String(o[k] == null ? '' : o[k]).trim() : '';
    if (v && !out.some((p) => p.toLowerCase() === v.toLowerCase())) out.push(v);
  });
  return out.join(', ');
}
function tidy(s) { return String(s || '').replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').replace(/(, )+/g, ', ').replace(/^, |, $/g, '').trim(); }

// The service's answer -> one shape. Throws when it says the number is not registered.
function normalize(json, g) {
  if (!json || typeof json !== 'object') throw new core.HttpError(502, 'The GST lookup service sent back nothing we can read.');
  const said = String(find(json, ['message', 'msg', 'error', 'errormessage'].map(key)) || '');
  const falsy = ['valid', 'flag', 'success', 'status_cd'].map(key).some((n) => Object.keys(json).some((k) => key(k) === n && (json[k] === false || json[k] === 0 || json[k] === '0')));
  let legal = tidy(find(json, ALIAS.legal)), trade = tidy(find(json, ALIAS.trade));
  let address = '';
  const split = find(json, ALIAS.split, 'object');
  if (split) address = joinAddress(split.addr && typeof split.addr === 'object' ? split.addr : split);
  if (!address) { const a = find(json, ALIAS.addr); address = typeof a === 'string' ? a : ''; }
  address = tidy(address);
  if (!legal && !trade && !address) {
    throw new core.HttpError(404, falsy || /invalid|not found|does not exist|no record/i.test(said) ? 'No GST registration found for this number. Check it for a typo.' : 'The GST lookup service did not send the name or address for this number.');
  }
  const pin = String(find(json, ALIAS.pin) || (address.match(/\b\d{6}\b/) || [''])[0]);
  if (address && /^\d{6}$/.test(pin) && address.indexOf(pin) < 0) address += ', ' + pin; // some services keep the PIN apart
  const nba = find(json, ALIAS.nba, 'list').filter((x) => typeof x === 'string').slice(0, 6);
  return Object.assign(fromNumber(g), {
    legalName: legal, tradeName: trade, name: trade || legal, address, pincode: pin,
    status: tidy(find(json, ALIAS.status)), type: tidy(find(json, ALIAS.type)), constitution: tidy(find(json, ALIAS.ctb)),
    regDate: tidy(find(json, ALIAS.reg)), business: nba, source: 'online',
  });
}

/* ---------- the service ---------- */
const GSTINAPI = 'https://www.gstinapi.in/v1/gstin/{gstin}';
// Which service to use: admin settings first, then environment variables. null when none.
function config(settings) {
  const s = (settings && settings.gst) || {};
  const env = process.env;
  if (s.provider === 'gstinapi' && s.apiKey) return { provider: 'url', url: GSTINAPI, header: 'x-api-key: ' + s.apiKey };
  if (s.provider === 'cashfree' && s.clientId && s.clientSecret) return { provider: 'cashfree', clientId: s.clientId, clientSecret: s.clientSecret, sandbox: !!s.sandbox };
  if (s.provider === 'url' && /^https:\/\/.+\{gstin\}/.test(s.url || '')) return { provider: 'url', url: s.url, header: s.header || '' };
  if (s.provider === 'off') return null;
  if (env.GSTINAPI_KEY) return { provider: 'url', url: GSTINAPI, header: 'x-api-key: ' + env.GSTINAPI_KEY };
  if (env.CASHFREE_CLIENT_ID && env.CASHFREE_CLIENT_SECRET) return { provider: 'cashfree', clientId: env.CASHFREE_CLIENT_ID, clientSecret: env.CASHFREE_CLIENT_SECRET, sandbox: env.CASHFREE_SANDBOX === '1' };
  if (/^https:\/\/.+\{gstin\}/.test(env.GST_LOOKUP_URL || '')) return { provider: 'url', url: env.GST_LOOKUP_URL, header: env.GST_LOOKUP_HEADER || '' };
  return null;
}
// Calls the service and returns its JSON answer.
async function ask(cfg, g, fetchFn) {
  const f = fetchFn || fetch, ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 9000);
  try {
    let res;
    if (cfg.provider === 'cashfree') {
      res = await f(`https://${cfg.sandbox ? 'sandbox' : 'api'}.cashfree.com/verification/gstin`, {
        method: 'POST', signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', 'x-client-id': cfg.clientId, 'x-client-secret': cfg.clientSecret },
        body: JSON.stringify({ GSTIN: g }),
      });
    } else {
      const headers = { Accept: 'application/json' };
      const m = String(cfg.header || '').match(/^\s*([A-Za-z0-9-]+)\s*:\s*(.+)$/);
      if (m) headers[m[1]] = m[2].trim();
      res = await f(cfg.url.replace(/\{gstin\}/g, encodeURIComponent(g)), { headers, signal: ctl.signal });
    }
    let json = null;
    try { json = await res.json(); } catch { json = null; }
    if (res.status === 401 || res.status === 403) throw new core.HttpError(502, 'The GST lookup service refused the key. Check it in admin settings.');
    if (res.status === 404 || res.status === 422 || res.status === 400) return json || { valid: false, message: 'not found' };
    if (res.status === 402) throw new core.HttpError(502, 'The GST lookup service has no credits left. Add credits at the service, or type the address.');
    if (res.status === 429) throw new core.HttpError(429, 'The GST lookup service is busy. Try again in a minute.');
    if (!res.ok && !json) throw new core.HttpError(502, 'The GST lookup service is not answering. Try again later.');
    return json;
  } catch (e) {
    if (e instanceof core.HttpError) throw e;
    throw new core.HttpError(504, e && e.name === 'AbortError' ? 'The GST lookup service took too long. Try again.' : 'Could not reach the GST lookup service. Try again.');
  } finally { clearTimeout(timer); }
}
async function lookup(cfg, g, fetchFn) { return normalize(await ask(cfg, g, fetchFn), g); }

// GET /api/config?gstin=27AAPFU0939F1ZV -> registered name, address, status and type of a GST number.
// (Answered by the config endpoint, so it needs no serverless function of its own.)
// Without a lookup service it answers with what the number itself says and offline: true. Answers are
// kept for 30 days, so a number is paid for once.
async function handle(req, res, raw) {
  const db = require('./db');
  const v = check(raw);
  if (!v.ok) throw new core.HttpError(400, v.message);
  const g = v.gstin;
  // paid lookups need the database: for the saved answers and the limits that protect the credits
  const cfg = db.configured() ? config(await core.getSettings()) : null;
  if (!cfg) return core.send(res, 200, Object.assign(fromNumber(g), { offline: true }));
  const hit = await db.getJSON(`gst:${g}`);
  if (hit) return core.send(res, 200, Object.assign(hit, { cached: true }));
  await core.rateLimit(`gst:${core.clientIp(req) || 'anon'}`, 30, 3600);
  await core.rateLimit('gst:day', 2000, 86400);
  const data = await lookup(cfg, g);
  await db.setJSON(`gst:${g}`, data, 30 * 86400);
  core.send(res, 200, data);
}

module.exports = { clean, check, checkDigit, fromNumber, normalize, config, lookup, handle, STATES, ENTITY };
