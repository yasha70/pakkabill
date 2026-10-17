// PakkaBill Lens: the shipping sync's logic, with no browser parts (tested in Node: test/shipsync-audit.js).
// Meesho's supplier panel works out a catalogue's shipping charge on its own servers. When the seller
// uploads one photo in Catalog Upload, the page sends the photo (upload request), and then asks Meesho
// for the shipping (shipping request); the charge comes back in the answer. The hook (shiphook.js)
// records those requests in the seller's own tab; this file finds them, and builds the same requests
// again for another photo and another category, so the shipping read is exactly Meesho's own number.
var PBShipSync = (function () {
  'use strict';

  /* ---------- JSON leaves ---------- */

  // Every leaf (string, number, boolean) of a JSON value, with its path of keys and indexes.
  function leaves(v, path, out) {
    path = path || []; out = out || [];
    if (v === null || v === undefined) return out;
    if (Array.isArray(v)) { for (let i = 0; i < v.length && i < 500; i++) leaves(v[i], path.concat(i), out); return out; }
    if (typeof v === 'object') { for (const k of Object.keys(v).slice(0, 400)) leaves(v[k], path.concat(k), out); return out; }
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out.push({ path, key: lastKey(path), value: v });
    return out;
  }
  function lastKey(path) { for (let i = path.length - 1; i >= 0; i--) if (typeof path[i] === 'string') return path[i]; return ''; }
  function get(obj, path) { let o = obj; for (const p of path || []) { if (o == null) return undefined; o = o[p]; } return o; }
  function setIn(obj, path, val) {
    if (!path.length) return val;
    let o = obj;
    for (let i = 0; i < path.length - 1; i++) { if (o == null) return obj; o = o[path[i]]; }
    if (o != null) o[path[path.length - 1]] = val;
    return obj;
  }
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  function parseJson(text) { if (typeof text !== 'string' || !/^\s*[[{]/.test(text)) return null; try { return JSON.parse(text); } catch (e) { return null; } }

  // "₹ 1,234", "85", 85, "85.50" -> number; anything else -> null
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    const m = v.replace(/ /g, ' ').trim().match(/^(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)$/i);
    return m ? Number(m[1].replace(/,/g, '')) : null;
  }

  // A value worth following from one request to the next: an id, an address, a key or a long number.
  // Short words and small numbers are left alone (they repeat by chance).
  function distinct(v) {
    if (typeof v === 'string') return v.length >= 6 && !/^(true|false|null|undefined|image\/\w+|application\/\w+|multipart\/[\w-]+)$/i.test(v);
    if (typeof v === 'number') return Number.isInteger(v) && Math.abs(v) >= 1000;
    return false;
  }

  /* ---------- requests: where values sit ---------- */

  // A request's parts that can carry values: the address (path pieces and query), and the body
  // ({ kind: 'json'|'urlenc'|'text'|'form'|'blob'|'none', text, entries: [[name, value]] }).
  function urlParts(url) {
    try { const u = new URL(url, 'https://supplier.meesho.com/'); return { u, segs: u.pathname.split('/').map(decodeURIComponent), query: [...u.searchParams.entries()] }; } catch (e) { return null; }
  }
  // Every value a request carries: [{ where, path|name, value }].
  function requestValues(req) {
    const out = [], p = urlParts(req.url);
    if (p) {
      out.push({ where: 'url', value: p.u.href.replace(/#.*$/, '') }); // a whole address handed out by an earlier answer (an upload link)
      p.segs.forEach((s, i) => { if (s) out.push({ where: 'seg', index: i, value: s }); });
      p.query.forEach(([k, v]) => out.push({ where: 'query', name: k, value: v }));
    }
    const b = req.body || { kind: 'none' };
    if (b.kind === 'json') { const j = parseJson(b.text); if (j != null) leaves(j).forEach((l) => out.push({ where: 'json', path: l.path, name: l.key, value: l.value })); }
    else if (b.kind === 'urlenc') new URLSearchParams(b.text || '').forEach((v, k) => out.push({ where: 'urlenc', name: k, value: v }));
    else if (b.kind === 'form') (b.entries || []).forEach(([k, v]) => { if (typeof v === 'string') { const j = parseJson(v); if (j != null) leaves(j).forEach((l) => out.push({ where: 'formjson', name: k, path: l.path, value: l.value })); else out.push({ where: 'form', name: k, value: v }); } });
    else if (b.kind === 'text' && b.text) out.push({ where: 'text', value: b.text });
    return out;
  }
  // Does a request carry this value (whole, or inside a longer text when the value is long)?
  function carries(req, value) {
    const s = String(value);
    return requestValues(req).some((x) => String(x.value) === s || (s.length >= 8 && typeof x.value === 'string' && x.value.indexOf(s) >= 0));
  }

  /* ---------- substitution: the same request with new values ---------- */

  // map: Map(oldString -> newValue). Whole values are swapped exactly (keeping numbers numbers);
  // long values (8+ characters, like an image address) are also swapped inside longer texts.
  function swapValue(v, map) {
    if (v === null || v === undefined || typeof v === 'boolean') return v;
    const s = String(v);
    if (map.has(s)) { const n = map.get(s); return typeof v === 'number' && num(n) != null ? num(n) : (typeof v === 'string' ? String(n) : n); }
    if (typeof v !== 'string') return v;
    let out = v;
    map.forEach((n, o) => { if (o.length >= 8 && out.indexOf(o) >= 0) out = out.split(o).join(String(n)); });
    return out;
  }
  function swapJson(j, map, only) {
    const c = clone(j);
    leaves(c).forEach((l) => {
      if (only && !only.some((p) => samePath(p, l.path))) return;
      const n = swapValue(l.value, map);
      if (n !== l.value) setIn(c, l.path, n);
    });
    return c;
  }
  const samePath = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  function swapUrl(url, map) {
    const p = urlParts(url);
    if (!p) return url;
    const whole = p.u.href.replace(/#.*$/, '');
    if (map.has(whole) && /^https?:/i.test(String(map.get(whole)))) return String(map.get(whole));
    const segs = p.u.pathname.split('/').map((s) => (s ? encodeURIComponent(String(swapValue(decodeURIComponent(s), map))).replace(/%40/g, '@').replace(/%3A/gi, ':') : s));
    p.u.pathname = segs.join('/');
    const q = new URLSearchParams();
    p.query.forEach(([k, v]) => q.append(k, String(swapValue(v, map))));
    p.u.search = q.toString() ? '?' + q.toString() : '';
    // a full address keeps its host; a path-only address stays path-only
    return /^https?:/i.test(url) ? p.u.toString() : p.u.pathname + p.u.search + p.u.hash;
  }
  // The body of a request with values swapped (file parts are left for the caller to replace).
  function swapBody(body, map) {
    const b = body || { kind: 'none' };
    if (b.kind === 'json') { const j = parseJson(b.text); return { ...b, text: j == null ? b.text : JSON.stringify(swapJson(j, map)) }; }
    if (b.kind === 'urlenc') { const q = new URLSearchParams(b.text || ''), o = new URLSearchParams(); q.forEach((v, k) => o.append(k, String(swapValue(v, map)))); return { ...b, text: o.toString() }; }
    if (b.kind === 'text') { let t = b.text || ''; map.forEach((n, o) => { if (o.length >= 8) t = t.split(o).join(String(n)); }); return { ...b, text: t }; }
    if (b.kind === 'form') return { ...b, entries: (b.entries || []).map(([k, v]) => [k, typeof v === 'string' ? (parseJson(v) != null ? JSON.stringify(swapJson(parseJson(v), map)) : String(swapValue(v, map))) : v]) };
    return b;
  }
  // Changes one value at a known place in a request (the category id): { where, path|name|index }.
  function putAt(req, at, value) {
    const r = { ...req, body: req.body ? { ...req.body } : req.body };
    if (at.where === 'json') { const j = parseJson(r.body.text); if (j != null) r.body.text = JSON.stringify(setIn(j, at.path, typeof get(j, at.path) === 'number' && num(value) != null ? num(value) : String(value))); }
    else if (at.where === 'urlenc') { const q = new URLSearchParams(r.body.text || ''); q.set(at.name, String(value)); r.body.text = q.toString(); }
    else if (at.where === 'form') r.body.entries = r.body.entries.map(([k, v]) => [k, k === at.name ? String(value) : v]);
    else if (at.where === 'formjson') r.body.entries = r.body.entries.map(([k, v]) => { if (k !== at.name) return [k, v]; const j = parseJson(v); return [k, j == null ? v : JSON.stringify(setIn(j, at.path, typeof get(j, at.path) === 'number' && num(value) != null ? num(value) : String(value)))]; });
    else if (at.where === 'query' || at.where === 'seg') {
      const p = urlParts(r.url);
      if (p) {
        if (at.where === 'query') p.u.searchParams.set(at.name, String(value));
        else { const s = p.u.pathname.split('/'); s[at.index] = encodeURIComponent(String(value)); p.u.pathname = s.join('/'); }
        r.url = /^https?:/i.test(r.url) ? p.u.toString() : p.u.pathname + p.u.search + p.u.hash;
      }
    }
    return r;
  }

  // Old -> new values from the same request answered twice: leaves at the same place that changed.
  function align(oldRes, newRes, map) {
    map = map || new Map();
    if (oldRes == null || newRes == null) return map;
    leaves(oldRes).forEach((l) => {
      const n = get(newRes, l.path);
      if (n === undefined || n === null || typeof n === 'object' || String(n) === String(l.value)) return;
      if (typeof l.value === 'string' ? l.value.length >= 3 : typeof l.value === 'number') map.set(String(l.value), n);
    });
    return map;
  }

  /* ---------- finding Meesho's shipping in the answers ---------- */

  const SHIP_KEY = /ship|deliver|logistic|courier/i;
  const NOT_SHIP = /free|discount|percent|pct|weight|gst|tax|tat|days?$|time|zone|eligib|flag|type|mode|_id$|^id$|count|rate_card|slab|is_|has_|enabled|partner|name|text|label|msg|message|url/i;
  // The shipping charges in an answer: numeric leaves whose key says shipping (not a weight, tax, id...).
  function shipLeaves(json) {
    return leaves(json).filter((l) => {
      const n = num(l.value);
      if (n == null || n < 0 || n > 5000 || typeof l.value === 'boolean') return false;
      const k = l.key, parent = l.path.filter((x) => typeof x === 'string').slice(-2).join('.');
      return (SHIP_KEY.test(k) || (SHIP_KEY.test(parent) && /charge|amount|value|price|fee|cost|total/i.test(k))) && !NOT_SHIP.test(k);
    }).map((l) => ({ ...l, n: num(l.value), score: (/charge/i.test(l.key) ? 3 : 0) + (/^shipping/i.test(l.key) ? 2 : 0) + (/final|total|net/i.test(l.key) ? 1 : 0) }));
  }
  // Which recorded answer holds the shipping Meesho showed (displayed: the ₹ on the page, or null),
  // after the photo upload at index fileIdx. -> { idx, path, n } or null
  function findShipping(calls, fileIdx, displayed) {
    let found = null;
    for (let i = fileIdx; i < calls.length; i++) {
      const c = calls[i];
      if (!c || c.mine || c.status >= 400) continue;
      const list = shipLeaves(c.resJson);
      if (!list.length) continue;
      const pick = displayed != null ? list.filter((l) => Math.abs(l.n - displayed) < 0.51).sort((a, b) => b.score - a.score)[0] : list.sort((a, b) => b.score - a.score)[0];
      if (pick) found = { idx: i, path: pick.path, n: pick.n, key: pick.key }; // the latest answer wins: Meesho asks again as the form fills
    }
    return found;
  }

  /* ---------- the category in the shipping request ---------- */

  const CAT_KEY = /(^|[_-])s{0,3}cat(egory)?([_-]?ids?)?$|sub[_-]?sub[_-]?cat|sscat|^category[_-]?id$|^categoryid$|^cat[_-]?id$/i;
  const intLike = (v) => (typeof v === 'number' && Number.isInteger(v) && v > 0) || (typeof v === 'string' && /^\d{1,9}$/.test(v));
  // Where the request names the category: { where, path|name|index, value } or null.
  function findCategory(req) {
    const list = requestValues(req).filter((x) => x.where !== 'text' && x.where !== 'seg' && x.where !== 'url' && intLike(x.value) && CAT_KEY.test(String(x.name || (x.path ? lastKey(x.path) : ''))));
    if (!list.length) return null;
    list.sort((a, b) => (/sub[_-]?sub|sscat/i.test(String(b.name || lastKey(b.path || []))) ? 1 : 0) - (/sub[_-]?sub|sscat/i.test(String(a.name || lastKey(a.path || []))) ? 1 : 0));
    const x = list[0];
    return { where: x.where, path: x.path, name: x.name, index: x.index, value: String(x.value) };
  }

  /* ---------- Meesho's category list, from any answer that lists categories ---------- */

  const ID_KEYS = ['sscat_id', 'sub_sub_category_id', 'subSubCategoryId', 'sscatId', 'category_id', 'categoryId', 'cat_id', 'id'];
  const NAME_KEYS = ['sscat_name', 'sub_sub_category_name', 'category_name', 'categoryName', 'display_name', 'displayName', 'name', 'title', 'label'];
  // [{ id, name, path: 'Women Ethnic > Blouses', leaf }] from one answer; url tells if it is about categories.
  function categoriesIn(json, url) {
    const out = [], about = /categor|sscat|taxonom|catalog/i.test(String(url || ''));
    const walk = (v, trail, depth) => {
      if (depth > 8 || v == null || typeof v !== 'object') return;
      if (Array.isArray(v)) { v.slice(0, 3000).forEach((x) => walk(x, trail, depth + 1)); return; }
      const idk = ID_KEYS.find((k) => intLike(v[k])), nk = NAME_KEYS.find((k) => typeof v[k] === 'string' && v[k].trim() && v[k].length <= 80);
      const looks = idk && nk && (about || /cat/i.test(idk) || /cat/i.test(nk) || Object.keys(v).some((k) => /cat/i.test(k)));
      const name = looks ? v[nk].trim() : null;
      const kids = Object.keys(v).filter((k) => Array.isArray(v[k]) && v[k].some((x) => x && typeof x === 'object'));
      if (looks) {
        const childCats = kids.some((k) => v[k].some((x) => x && typeof x === 'object' && ID_KEYS.some((ik) => intLike(x[ik])) && NAME_KEYS.some((nk2) => typeof x[nk2] === 'string')));
        out.push({ id: String(v[idk]), name, path: trail.concat(name).join(' > '), leaf: !childCats });
      }
      kids.forEach((k) => walk(v[k], looks ? trail.concat(name) : trail, depth + 1));
      Object.keys(v).filter((k) => v[k] && typeof v[k] === 'object' && !Array.isArray(v[k])).forEach((k) => walk(v[k], looks ? trail.concat(name) : trail, depth + 1));
    };
    walk(json, [], 0);
    // a list where only one thing looks like a category is not a category list
    return out.length >= 2 || about ? out.slice(0, 4000) : [];
  }
  // PakkaBill's chosen category name -> the best Meesho category ({ id, name, path }) or null.
  function matchCategory(name, list) {
    const n = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!n || !list || !list.length) return null;
    const leaves = list.filter((c) => c.leaf !== false);
    const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const sing = (s) => s.replace(/(ies)$/, 'y').replace(/(ses|xes)$/, (m) => m.slice(0, -2)).replace(/s$/, '');
    return leaves.find((c) => norm(c.name) === n) || leaves.find((c) => sing(norm(c.name)) === sing(n)) || leaves.find((c) => norm(c.path).endsWith(n)) || leaves.find((c) => norm(c.name).indexOf(n) >= 0) || leaves.find((c) => norm(c.path).indexOf(n) >= 0) || null;
  }

  /* ---------- the plan: which recorded requests to send again for a new photo ---------- */

  // Requests never sent again, whatever happens: they could change the seller's catalogue or account.
  const DANGER = /submit|publish|delete|remove|logout|sign[-_]?out|order|payment|payout|bank|kyc|password|draft\/save|save[-_]?draft|catalog(ue)?s?\/(create|add|save|update)|bulk|qc/i;
  const NOISE = /log|track|event|analytic|metric|beacon|telemetry|sentry|clevertap|mixpanel|amplitude|hotjar|collect|ping|heartbeat|notification|feature[-_]?flag|experiment/i;
  // calls: the recorded requests in order ({ method, url, body, resJson, status, file }), fileIdx: the
  // photo upload, ship: findShipping's answer. -> { steps: [indexes in order], cat, error }
  function plan(calls, fileIdx, ship) {
    if (fileIdx < 0 || !ship) return { error: 'nofile' };
    const shipIdx = ship.idx;
    if (DANGER.test(calls[shipIdx].url) || DANGER.test(calls[fileIdx].url)) return { error: 'danger' };
    const lo = Math.max(0, fileIdx - 6);
    const need = new Set([fileIdx, shipIdx]);
    const provider = (value, before) => {
      for (let j = before - 1; j >= lo; j--) {
        const c = calls[j];
        if (!c || c.status >= 400 || c.resJson == null) continue;
        if (leaves(c.resJson).some((l) => String(l.value) === String(value) || (String(value).length >= 8 && typeof l.value === 'string' && String(value).indexOf(l.value) >= 0 && l.value.length >= 8))) return j;
      }
      return -1;
    };
    let grew = true;
    while (grew) {
      grew = false;
      for (const i of [...need]) {
        requestValues(calls[i]).forEach((x) => {
          const vals = x.where === 'text' ? [] : [x.value];
          vals.filter(distinct).forEach((v) => {
            const p = provider(v, i);
            if (p < 0 || need.has(p) || NOISE.test(calls[p].url) || DANGER.test(calls[p].url)) return;
            // a read made before the upload (profile, category list) gives the same values every time; only
            // an upload link it hands out (a long, one-time address used by the upload) must be asked again
            if (p < fileIdx && calls[p].method === 'GET' && !(i === fileIdx && String(v).length >= 16)) return;
            need.add(p); grew = true;
          });
        });
      }
    }
    const steps = [...need].sort((a, b) => a - b);
    if (steps.length > 8) return { error: 'long' };
    return { steps, shipIdx, fileIdx, shipPath: ship.path, cat: findCategory(calls[shipIdx]) };
  }

  // A report that is safe to share: addresses without query values, value names, no values or tokens.
  function report(calls, p) {
    const shape = (c) => { const u = urlParts(c.url); return { m: c.method, url: u ? u.u.host + u.u.pathname.replace(/\d{3,}/g, ':n').replace(/[a-f0-9]{16,}/gi, ':h') : '?', status: c.status, body: c.body ? c.body.kind : 'none', file: !!c.file, names: requestValues(c).map((x) => x.name || (x.path ? x.path.join('.') : x.where)).filter(Boolean).slice(0, 30), answer: c.resJson ? leaves(c.resJson).map((l) => l.path.join('.')).slice(0, 40) : null }; };
    return { calls: calls.slice(-25).map(shape), plan: p ? { steps: p.steps, ship: p.shipPath && p.shipPath.join('.'), cat: p.cat ? (p.cat.name || (p.cat.path || []).join('.')) : null, error: p.error } : null };
  }

  const api = { leaves, get, setIn, parseJson, num, distinct, requestValues, carries, swapValue, swapJson, swapUrl, swapBody, putAt, align, shipLeaves, findShipping, findCategory, categoriesIn, matchCategory, plan, report, DANGER, NOISE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
