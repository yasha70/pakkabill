// PakkaBill: Meesho Lens page. Built by lens/build.py from lens/core.js and lens/page.js; edit those.
(function () {
// PakkaBill Lens core: reads a Meesho product page and works out the estimates.
// Shared by the Chrome extension, the phone bookmark and PakkaBill's Meesho Lens page,
// so all three always show the same numbers. No network calls.
var PBLensCore = (function () {
  var DEFAULTS = { shipping: 70, gst: 5, ratingRatio: 8, myCost: '', returnPct: 20, returnLoss: 70 };
  var TCS = 0.005; // GST TCS by e-commerce operators, 0.5% of taxable value (from 10 July 2024)
  var TDS = 0.001; // Income-tax TDS u/s 194-O, 0.1% (from 1 October 2024)
  var DAY = 864e5;

  // "1,23,456" -> 123456, "12.5k" -> 12500, "1.2L" -> 120000, "₹ 299" -> 299
  function num(s) {
    if (s == null) return null;
    if (typeof s === 'number') return isFinite(s) ? s : null;
    var m = String(s).replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(k|K|l|L|lakh|Lakh|cr|Cr)?/);
    if (!m) return null;
    var n = parseFloat(m[1]), u = (m[2] || '').toLowerCase();
    if (u === 'k') n *= 1e3; else if (u === 'l' || u === 'lakh') n *= 1e5; else if (u === 'cr') n *= 1e7;
    return Math.round(n * 100) / 100;
  }
  function productId(loc) { return ((loc.pathname || '').match(/\/p\/([a-z0-9]+)/i) || [])[1] || null; }
  function clean(s, max) { return s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, max || 120) || null; }

  function jsonLd(doc) {
    var list = doc.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < list.length; i++) {
      try {
        var j = JSON.parse(list[i].textContent);
        var arr = Array.isArray(j) ? j : (j['@graph'] || [j]);
        for (var k = 0; k < arr.length; k++) if (arr[k] && /Product/i.test(String(arr[k]['@type']))) return arr[k];
      } catch (e) { /* skip */ }
    }
    return null;
  }

  // Next.js page data. Only trusted when it belongs to this exact product id, because
  // Meesho is a single-page app and the data can be left over from the first page opened.
  var JKEYS = {
    price: ['min_product_price', 'product_price', 'final_price', 'selling_price', 'discounted_price'],
    mrp: ['original_price', 'mrp', 'max_retail_price', 'strike_price'],
    ratings: ['rating_count', 'ratings_count', 'total_rating_count', 'total_ratings', 'ratingCount'],
    reviews: ['review_count', 'reviews_count', 'total_review_count', 'reviewCount'],
    rating: ['average_rating', 'avg_rating', 'averageRating'],
    seller: ['supplier_name', 'seller_name', 'shop_name']
  };
  function findKey(o, keys, depth) {
    if (!o || typeof o !== 'object' || depth < 0) return null;
    for (var i = 0; i < keys.length; i++) {
      var v = o[keys[i]];
      if (v != null && typeof v !== 'object' && String(v).trim() !== '') return v;
    }
    for (var k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k) || !o[k] || typeof o[k] !== 'object') continue;
      if (/similar|recommend|widget|related|other_products|catalogs$/i.test(k)) continue; // other products' numbers
      var r = findKey(o[k], keys, depth - 1);
      if (r != null) return r;
    }
    return null;
  }
  function pageData(doc, id) {
    var el = doc.getElementById('__NEXT_DATA__');
    if (!el || !id) return {};
    var root; try { root = JSON.parse(el.textContent); } catch (e) { return {}; }
    var want = [String(id).toLowerCase(), String(parseInt(id, 36))];
    var best = null, seen = 0;
    (function walk(o, depth) {
      if (!o || typeof o !== 'object' || depth > 14 || ++seen > 60000) return;
      if (!Array.isArray(o)) {
        var ks = ['product_id', 'productId', 'id', 'product_code'];
        for (var i = 0; i < ks.length; i++) if (o[ks[i]] != null && want.indexOf(String(o[ks[i]]).toLowerCase()) >= 0 && (!best || depth < best.depth)) best = { o: o, depth: depth };
      }
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) walk(o[k], depth + 1);
    })(root, 0);
    if (!best) return {};
    var out = {};
    for (var f in JKEYS) { var v = findKey(best.o, JKEYS[f], 4); if (v != null) out[f] = f === 'seller' ? clean(v) : num(v); }
    return out;
  }

  // Value on the line after a label, e.g. "Sold By\nKavya Fashion".
  function after(text, label) {
    var m = text.match(new RegExp('(?:^|\\n)\\s*' + label + '\\s*:?\\s*\\n+\\s*([^\\n]+)', 'i'));
    return m ? clean(m[1]) : null;
  }
  var CNT = '(\\d[\\d,]*(?:\\.\\d+)?\\s*[kKlL]?)';

  function extract(doc, loc) {
    var text = doc.body ? doc.body.innerText || doc.body.textContent || '' : '';
    var ld = jsonLd(doc);
    var id = productId(loc);
    var d = { v: 2, id: id, url: loc.origin + loc.pathname, src: {} };
    d.name = clean((ld && ld.name) || (doc.querySelector('h1') && doc.querySelector('h1').textContent) || doc.title.replace(/\s*[|\-–]\s*Meesho.*$/i, ''), 160);
    var at = d.name ? text.indexOf(d.name.slice(0, 25)) : -1;
    var seg = at >= 0 ? text.slice(at, at + 1500) : text.slice(0, 3000);
    var J = pageData(doc, id);

    // price the buyer sees (the lowest size when it says "onwards")
    var pm = seg.match(/₹\s?([\d,]+)/);
    if (pm) { d.price = num(pm[1]); d.src.price = 'page'; }
    var mm = seg.match(/₹\s?[\d,]+\s*(?:onwards\s*)?₹\s?([\d,]+)\s*(\d+)\s*%\s*off/i);
    if (mm) { d.mrp = num(mm[1]); d.off = +mm[2]; }
    d.onwards = /onwards/i.test(seg.slice(0, 300));
    if (d.price == null && J.price != null) { d.price = J.price; d.src.price = 'data'; }
    if (d.price == null && ld && ld.offers) { var o = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers; d.price = num(o.price || o.lowPrice); d.src.price = 'data'; }
    if (d.mrp == null && J.mrp != null && d.price != null && J.mrp > d.price) { d.mrp = J.mrp; d.off = Math.round((1 - d.price / J.mrp) * 100); }
    if (d.price != null && J.price != null) d.src.priceChecked = Math.abs(J.price - d.price) < 1;

    // product rating: "4.1 ★ 12,345 Ratings, 2,345 Reviews" (the star and line breaks vary)
    var rm = text.match(new RegExp('(?:(?:^|[^\\d.,])([1-5](?:\\.\\d)?)(?![\\d.,])[\\s★☆\\u2605]*)?(?<![\\d.,])' + CNT + '\\s*Ratings?\\s*(?:,|&|and|\\||•|·)?\\s*' + CNT + '\\s*Reviews?', 'i'));
    if (rm) { d.rating = rm[1] ? +rm[1] : null; d.ratings = num(rm[2]); d.reviews = num(rm[3]); d.src.ratings = 'page'; }
    if (d.ratings == null && J.ratings != null) { d.ratings = J.ratings; d.reviews = J.reviews != null ? J.reviews : null; d.src.ratings = 'data'; }
    if (d.ratings == null && ld && ld.aggregateRating) {
      d.ratings = num(ld.aggregateRating.ratingCount); d.reviews = num(ld.aggregateRating.reviewCount); d.src.ratings = 'data';
    }
    if (d.rating == null) d.rating = J.rating != null ? J.rating : (ld && ld.aggregateRating ? num(ld.aggregateRating.ratingValue) : null);
    if (d.ratings != null && J.ratings != null) d.src.ratingsChecked = Math.abs(J.ratings - d.ratings) <= Math.max(2, d.ratings * 0.02);

    // rating breakdown (Excellent … Poor)
    var bd = {}, tot = 0;
    ['Excellent', 'Very Good', 'Good', 'Average', 'Poor'].forEach(function (lab) {
      var m = text.match(new RegExp('^\\s*' + lab + '\\s*[\\n\\s]*' + CNT + '\\s*$', 'm'));
      if (m) { bd[lab] = num(m[1]); tot += bd[lab]; }
    });
    if (tot) {
      d.breakdown = bd;
      d.lowShare = ((bd.Average || 0) + (bd.Poor || 0)) / tot * 100;
      d.poorShare = (bd.Poor || 0) / tot * 100;
      if (d.rating == null) d.rating = Math.round(((bd.Excellent || 0) * 5 + (bd['Very Good'] || 0) * 4 + (bd.Good || 0) * 3 + (bd.Average || 0) * 2 + (bd.Poor || 0)) / tot * 10) / 10;
    }

    // price by size, when Meesho lists it
    var sz = text.match(/Select Size([\s\S]{0,900}?)(Product Highlights|Add to Cart|Buy Now|Product Details)/i);
    if (sz) {
      var list = [], re = /([^\n₹]{1,30}?)\s*₹\s*([\d,]+)/g, m2;
      while ((m2 = re.exec(sz[1]))) if (clean(m2[1])) list.push({ size: clean(m2[1], 30), price: num(m2[2]) });
      if (list.length) d.sizes = list.slice(0, 30);
      else { var chips = sz[1].split('\n').map(function (s) { return clean(s, 30); }).filter(function (s) { return s && s.length <= 22; }); if (chips.length) d.sizeList = chips.slice(0, 30); }
    }
    var pack = after(text, 'Net Quantity \\(N\\)');
    d.packText = pack;
    d.pack = pack ? (/single/i.test(pack) ? 1 : (num((pack.match(/(\d+)/) || [])[1]) || 1)) : 1;
    d.fabric = after(text, 'Fabric');
    d.brand = after(text, 'Brand');

    // seller card: "Sold By\nShop name\n3.9 ★\n12,345 Ratings\n2,100 Followers\n150 Products"
    d.seller = after(text, 'Sold By') || J.seller || null;
    var sb = text.search(/(?:^|\n)\s*Sold By/i);
    if (sb >= 0) {
      var ss = text.slice(sb, sb + 400);
      var f = ss.match(new RegExp(CNT + '\\s*Followers', 'i')); if (f) d.sellerFollowers = num(f[1]);
      var p = ss.match(/(\d[\d,]*)\s*Products/i); if (p) d.sellerProducts = num(p[1]);
      var sr = ss.match(/\n\s*([1-5]\.\d)\s*[★☆★]?\s*\n/); if (sr) d.sellerRating = +sr[1];
    }

    // delivery: Meesho puts the shipping inside the price when delivery is free
    d.freeDelivery = /Free Delivery/i.test(seg) ? true : null;
    var dm = seg.match(/₹\s?([\d,]+)\s*Delivery/i); if (dm) { d.freeDelivery = false; d.deliveryCharge = num(dm[1]); }
    var sp = text.match(/(\d[\d,]*)\s*Similar Products/i); d.similar = sp ? num(sp[1]) : null;
    var img = (ld && (Array.isArray(ld.image) ? ld.image[0] : ld.image)) || (doc.querySelector('meta[property="og:image"]') || {}).content;
    if (img && /^https:\/\//.test(img)) d.image = String(img).slice(0, 400);
    return d;
  }

  function settings(s) {
    var o = {}; for (var k in DEFAULTS) o[k] = s && s[k] !== undefined && s[k] !== null && s[k] !== '' ? s[k] : DEFAULTS[k];
    ['shipping', 'gst', 'ratingRatio', 'returnPct', 'returnLoss'].forEach(function (k) { o[k] = +o[k]; if (!isFinite(o[k]) || o[k] < 0) o[k] = DEFAULTS[k]; });
    return o;
  }

  // What the seller gets for one order at this price.
  function money(price, d, s) {
    s = settings(s);
    if (price == null) return {};
    var c = {}, pack = (d && d.pack) || 1;
    c.sellerPrice = Math.max(0, d && d.freeDelivery === false ? price : price - s.shipping);
    c.taxable = c.sellerPrice / (1 + s.gst / 100);
    c.gstAmt = c.sellerPrice - c.taxable;
    c.tcs = c.taxable * TCS;
    c.tds = c.taxable * TDS;
    c.settlement = c.sellerPrice - c.tcs - c.tds; // reaches the bank
    c.earning = c.taxable;                        // after paying GST; TCS and TDS come back as tax credits
    c.perPiece = c.earning / pack;
    if (s.myCost !== '' && isFinite(+s.myCost)) {
      c.myMargin = c.earning - (+s.myCost) * pack;
      var r = Math.min(95, s.returnPct) / 100;
      c.expected = (1 - r) * c.myMargin - r * s.returnLoss; // per order, after returns
    }
    return c;
  }

  // One reading per Indian calendar day, the latest of the day.
  function dayKey(t) { var x = new Date(t + 5.5 * 36e5); return x.getUTCFullYear() + '-' + (x.getUTCMonth() + 1) + '-' + x.getUTCDate(); }
  function addSnap(h, snap) {
    h.snaps = (h.snaps || []).filter(function (x) { return dayKey(x.t) !== dayKey(snap.t); });
    h.snaps.push(snap);
    h.snaps.sort(function (a, b) { return a.t - b.t; });
    if (h.snaps.length > 120) h.snaps = [h.snaps[0]].concat(h.snaps.slice(-119));
    return h;
  }
  function snapOf(d, t) { return { t: t || Date.now(), price: d.price == null ? null : d.price, mrp: d.mrp == null ? null : d.mrp, ratings: d.ratings == null ? null : d.ratings, reviews: d.reviews == null ? null : d.reviews, rating: d.rating == null ? null : d.rating }; }
  function remember(h, d, t) {
    h = h || { id: d.id, snaps: [] };
    ['name', 'url', 'seller', 'pack', 'packText', 'fabric', 'brand', 'image', 'freeDelivery', 'deliveryCharge', 'breakdown', 'lowShare', 'poorShare',
      'sizes', 'sizeList', 'onwards', 'off', 'sellerFollowers', 'sellerProducts', 'sellerRating', 'similar'].forEach(function (k) { if (d[k] != null) h[k] = d[k]; });
    h.id = d.id; h.lastSeen = t || Date.now();
    if (!h.firstSeen) h.firstSeen = h.lastSeen;
    return addSnap(h, snapOf(d, t));
  }
  // Two histories of the same product (the extension's and PakkaBill's) joined.
  function merge(a, b) {
    if (!a) return b; if (!b) return a;
    var newer = (b.lastSeen || 0) >= (a.lastSeen || 0) ? b : a, older = newer === a ? b : a;
    var h = {}; var k;
    for (k in older) h[k] = older[k];
    for (k in newer) if (newer[k] != null) h[k] = newer[k];
    h.firstSeen = Math.min(a.firstSeen || a.lastSeen || Infinity, b.firstSeen || b.lastSeen || Infinity);
    h.snaps = [];
    (older.snaps || []).concat(newer.snaps || []).forEach(function (x) { addSnap(h, x); });
    return h;
  }

  // Sales speed from how fast ratings grow. Uses about the last week when there is one.
  function velocity(h, ratio, now) {
    var s = ((h && h.snaps) || []).filter(function (x) { return x.ratings != null; }).sort(function (a, b) { return a.t - b.t; });
    if (s.length < 2) return null;
    var last = s[s.length - 1], cands = s.filter(function (x) { return last.t - x.t >= 20 * 36e5; });
    if (!cands.length) return null;
    var week = cands.filter(function (x) { return last.t - x.t >= 6 * DAY; });
    var base = week.length ? week[week.length - 1] : cands[0];
    var days = (last.t - base.t) / DAY, gained = last.ratings - base.ratings;
    var out = { days: days, gained: gained, from: base, to: last, dropped: gained < 0 };
    out.ratingsPerDay = gained < 0 ? null : gained / days;
    out.ordersPerDay = out.ratingsPerDay == null ? null : out.ratingsPerDay * (ratio || DEFAULTS.ratingRatio);
    var first = s[0], all = (last.t - first.t) / DAY;
    if (all >= 0.8 && last.ratings >= first.ratings) out.overallPerDay = (last.ratings - first.ratings) / all * (ratio || DEFAULTS.ratingRatio);
    return out;
  }
  function risk(lowShare) { return lowShare == null ? null : lowShare >= 25 ? 'High' : lowShare >= 15 ? 'Medium' : 'Low'; }

  return { DEFAULTS: DEFAULTS, TCS: TCS, TDS: TDS, num: num, productId: productId, extract: extract, settings: settings, money: money,
    remember: remember, merge: merge, velocity: velocity, risk: risk, dayKey: dayKey };
})();
if (typeof module !== 'undefined') module.exports = PBLensCore;

var PBL_BM_CORE = "\"use strict\"; var PBLensCore = (function () { var DEFAULTS = { shipping: 70, gst: 5, ratingRatio: 8, myCost: '', returnPct: 20, returnLoss: 70 }; var TCS = 0.005; var TDS = 0.001; var DAY = 864e5; function num(s) { if (s == null) return null; if (typeof s === 'number') return isFinite(s) ? s : null; var m = String(s).replace(/,/g, '').match(/(\\d+(?:\\.\\d+)?)\\s*(k|K|l|L|lakh|Lakh|cr|Cr)?/); if (!m) return null; var n = parseFloat(m[1]), u = (m[2] || '').toLowerCase(); if (u === 'k') n *= 1e3; else if (u === 'l' || u === 'lakh') n *= 1e5; else if (u === 'cr') n *= 1e7; return Math.round(n * 100) / 100; } function productId(loc) { return ((loc.pathname || '').match(/\\/p\\/([a-z0-9]+)/i) || [])[1] || null; } function clean(s, max) { return s == null ? null : String(s).replace(/\\s+/g, ' ').trim().slice(0, max || 120) || null; } function jsonLd(doc) { var list = doc.querySelectorAll('script[type=\"application/ld+json\"]'); for (var i = 0; i < list.length; i++) { try { var j = JSON.parse(list[i].textContent); var arr = Array.isArray(j) ? j : (j['@graph'] || [j]); for (var k = 0; k < arr.length; k++) if (arr[k] && /Product/i.test(String(arr[k]['@type']))) return arr[k]; } catch (e) { } } return null; } var JKEYS = { price: ['min_product_price', 'product_price', 'final_price', 'selling_price', 'discounted_price'], mrp: ['original_price', 'mrp', 'max_retail_price', 'strike_price'], ratings: ['rating_count', 'ratings_count', 'total_rating_count', 'total_ratings', 'ratingCount'], reviews: ['review_count', 'reviews_count', 'total_review_count', 'reviewCount'], rating: ['average_rating', 'avg_rating', 'averageRating'], seller: ['supplier_name', 'seller_name', 'shop_name'] }; function findKey(o, keys, depth) { if (!o || typeof o !== 'object' || depth < 0) return null; for (var i = 0; i < keys.length; i++) { var v = o[keys[i]]; if (v != null && typeof v !== 'object' && String(v).trim() !== '') return v; } for (var k in o) { if (!Object.prototype.hasOwnProperty.call(o, k) || !o[k] || typeof o[k] !== 'object') continue; if (/similar|recommend|widget|related|other_products|catalogs$/i.test(k)) continue; var r = findKey(o[k], keys, depth - 1); if (r != null) return r; } return null; } function pageData(doc, id) { var el = doc.getElementById('__NEXT_DATA__'); if (!el || !id) return {}; var root; try { root = JSON.parse(el.textContent); } catch (e) { return {}; } var want = [String(id).toLowerCase(), String(parseInt(id, 36))]; var best = null, seen = 0; (function walk(o, depth) { if (!o || typeof o !== 'object' || depth > 14 || ++seen > 60000) return; if (!Array.isArray(o)) { var ks = ['product_id', 'productId', 'id', 'product_code']; for (var i = 0; i < ks.length; i++) if (o[ks[i]] != null && want.indexOf(String(o[ks[i]]).toLowerCase()) >= 0 && (!best || depth < best.depth)) best = { o: o, depth: depth }; } for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) walk(o[k], depth + 1); })(root, 0); if (!best) return {}; var out = {}; for (var f in JKEYS) { var v = findKey(best.o, JKEYS[f], 4); if (v != null) out[f] = f === 'seller' ? clean(v) : num(v); } return out; } function after(text, label) { var m = text.match(new RegExp('(?:^|\\\\n)\\\\s*' + label + '\\\\s*:?\\\\s*\\\\n+\\\\s*([^\\\\n]+)', 'i')); return m ? clean(m[1]) : null; } var CNT = '(\\\\d[\\\\d,]*(?:\\\\.\\\\d+)?\\\\s*[kKlL]?)'; function extract(doc, loc) { var text = doc.body ? doc.body.innerText || doc.body.textContent || '' : ''; var ld = jsonLd(doc); var id = productId(loc); var d = { v: 2, id: id, url: loc.origin + loc.pathname, src: {} }; d.name = clean((ld && ld.name) || (doc.querySelector('h1') && doc.querySelector('h1').textContent) || doc.title.replace(/\\s*[|\\-–]\\s*Meesho.*$/i, ''), 160); var at = d.name ? text.indexOf(d.name.slice(0, 25)) : -1; var seg = at >= 0 ? text.slice(at, at + 1500) : text.slice(0, 3000); var J = pageData(doc, id); var pm = seg.match(/₹\\s?([\\d,]+)/); if (pm) { d.price = num(pm[1]); d.src.price = 'page'; } var mm = seg.match(/₹\\s?[\\d,]+\\s*(?:onwards\\s*)?₹\\s?([\\d,]+)\\s*(\\d+)\\s*%\\s*off/i); if (mm) { d.mrp = num(mm[1]); d.off = +mm[2]; } d.onwards = /onwards/i.test(seg.slice(0, 300)); if (d.price == null && J.price != null) { d.price = J.price; d.src.price = 'data'; } if (d.price == null && ld && ld.offers) { var o = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers; d.price = num(o.price || o.lowPrice); d.src.price = 'data'; } if (d.mrp == null && J.mrp != null && d.price != null && J.mrp > d.price) { d.mrp = J.mrp; d.off = Math.round((1 - d.price / J.mrp) * 100); } if (d.price != null && J.price != null) d.src.priceChecked = Math.abs(J.price - d.price) < 1; var rm = text.match(new RegExp('(?:(?:^|[^\\\\d.,])([1-5](?:\\\\.\\\\d)?)(?![\\\\d.,])[\\\\s★☆\\\\u2605]*)?(?<![\\\\d.,])' + CNT + '\\\\s*Ratings?\\\\s*(?:,|&|and|\\\\||•|·)?\\\\s*' + CNT + '\\\\s*Reviews?', 'i')); if (rm) { d.rating = rm[1] ? +rm[1] : null; d.ratings = num(rm[2]); d.reviews = num(rm[3]); d.src.ratings = 'page'; } if (d.ratings == null && J.ratings != null) { d.ratings = J.ratings; d.reviews = J.reviews != null ? J.reviews : null; d.src.ratings = 'data'; } if (d.ratings == null && ld && ld.aggregateRating) { d.ratings = num(ld.aggregateRating.ratingCount); d.reviews = num(ld.aggregateRating.reviewCount); d.src.ratings = 'data'; } if (d.rating == null) d.rating = J.rating != null ? J.rating : (ld && ld.aggregateRating ? num(ld.aggregateRating.ratingValue) : null); if (d.ratings != null && J.ratings != null) d.src.ratingsChecked = Math.abs(J.ratings - d.ratings) <= Math.max(2, d.ratings * 0.02); var bd = {}, tot = 0; ['Excellent', 'Very Good', 'Good', 'Average', 'Poor'].forEach(function (lab) { var m = text.match(new RegExp('^\\\\s*' + lab + '\\\\s*[\\\\n\\\\s]*' + CNT + '\\\\s*$', 'm')); if (m) { bd[lab] = num(m[1]); tot += bd[lab]; } }); if (tot) { d.breakdown = bd; d.lowShare = ((bd.Average || 0) + (bd.Poor || 0)) / tot * 100; d.poorShare = (bd.Poor || 0) / tot * 100; if (d.rating == null) d.rating = Math.round(((bd.Excellent || 0) * 5 + (bd['Very Good'] || 0) * 4 + (bd.Good || 0) * 3 + (bd.Average || 0) * 2 + (bd.Poor || 0)) / tot * 10) / 10; } var sz = text.match(/Select Size([\\s\\S]{0,900}?)(Product Highlights|Add to Cart|Buy Now|Product Details)/i); if (sz) { var list = [], re = /([^\\n₹]{1,30}?)\\s*₹\\s*([\\d,]+)/g, m2; while ((m2 = re.exec(sz[1]))) if (clean(m2[1])) list.push({ size: clean(m2[1], 30), price: num(m2[2]) }); if (list.length) d.sizes = list.slice(0, 30); else { var chips = sz[1].split('\\n').map(function (s) { return clean(s, 30); }).filter(function (s) { return s && s.length <= 22; }); if (chips.length) d.sizeList = chips.slice(0, 30); } } var pack = after(text, 'Net Quantity \\\\(N\\\\)'); d.packText = pack; d.pack = pack ? (/single/i.test(pack) ? 1 : (num((pack.match(/(\\d+)/) || [])[1]) || 1)) : 1; d.fabric = after(text, 'Fabric'); d.brand = after(text, 'Brand'); d.seller = after(text, 'Sold By') || J.seller || null; var sb = text.search(/(?:^|\\n)\\s*Sold By/i); if (sb >= 0) { var ss = text.slice(sb, sb + 400); var f = ss.match(new RegExp(CNT + '\\\\s*Followers', 'i')); if (f) d.sellerFollowers = num(f[1]); var p = ss.match(/(\\d[\\d,]*)\\s*Products/i); if (p) d.sellerProducts = num(p[1]); var sr = ss.match(/\\n\\s*([1-5]\\.\\d)\\s*[★☆★]?\\s*\\n/); if (sr) d.sellerRating = +sr[1]; } d.freeDelivery = /Free Delivery/i.test(seg) ? true : null; var dm = seg.match(/₹\\s?([\\d,]+)\\s*Delivery/i); if (dm) { d.freeDelivery = false; d.deliveryCharge = num(dm[1]); } var sp = text.match(/(\\d[\\d,]*)\\s*Similar Products/i); d.similar = sp ? num(sp[1]) : null; var img = (ld && (Array.isArray(ld.image) ? ld.image[0] : ld.image)) || (doc.querySelector('meta[property=\"og:image\"]') || {}).content; if (img && /^https:\\/\\//.test(img)) d.image = String(img).slice(0, 400); return d; } function settings(s) { var o = {}; for (var k in DEFAULTS) o[k] = s && s[k] !== undefined && s[k] !== null && s[k] !== '' ? s[k] : DEFAULTS[k]; ['shipping', 'gst', 'ratingRatio', 'returnPct', 'returnLoss'].forEach(function (k) { o[k] = +o[k]; if (!isFinite(o[k]) || o[k] < 0) o[k] = DEFAULTS[k]; }); return o; } function money(price, d, s) { s = settings(s); if (price == null) return {}; var c = {}, pack = (d && d.pack) || 1; c.sellerPrice = Math.max(0, d && d.freeDelivery === false ? price : price - s.shipping); c.taxable = c.sellerPrice / (1 + s.gst / 100); c.gstAmt = c.sellerPrice - c.taxable; c.tcs = c.taxable * TCS; c.tds = c.taxable * TDS; c.settlement = c.sellerPrice - c.tcs - c.tds; c.earning = c.taxable; c.perPiece = c.earning / pack; if (s.myCost !== '' && isFinite(+s.myCost)) { c.myMargin = c.earning - (+s.myCost) * pack; var r = Math.min(95, s.returnPct) / 100; c.expected = (1 - r) * c.myMargin - r * s.returnLoss; } return c; } function dayKey(t) { var x = new Date(t + 5.5 * 36e5); return x.getUTCFullYear() + '-' + (x.getUTCMonth() + 1) + '-' + x.getUTCDate(); } function addSnap(h, snap) { h.snaps = (h.snaps || []).filter(function (x) { return dayKey(x.t) !== dayKey(snap.t); }); h.snaps.push(snap); h.snaps.sort(function (a, b) { return a.t - b.t; }); if (h.snaps.length > 120) h.snaps = [h.snaps[0]].concat(h.snaps.slice(-119)); return h; } function snapOf(d, t) { return { t: t || Date.now(), price: d.price == null ? null : d.price, mrp: d.mrp == null ? null : d.mrp, ratings: d.ratings == null ? null : d.ratings, reviews: d.reviews == null ? null : d.reviews, rating: d.rating == null ? null : d.rating }; } function remember(h, d, t) { h = h || { id: d.id, snaps: [] }; ['name', 'url', 'seller', 'pack', 'packText', 'fabric', 'brand', 'image', 'freeDelivery', 'deliveryCharge', 'breakdown', 'lowShare', 'poorShare', 'sizes', 'sizeList', 'onwards', 'off', 'sellerFollowers', 'sellerProducts', 'sellerRating', 'similar'].forEach(function (k) { if (d[k] != null) h[k] = d[k]; }); h.id = d.id; h.lastSeen = t || Date.now(); if (!h.firstSeen) h.firstSeen = h.lastSeen; return addSnap(h, snapOf(d, t)); } function merge(a, b) { if (!a) return b; if (!b) return a; var newer = (b.lastSeen || 0) >= (a.lastSeen || 0) ? b : a, older = newer === a ? b : a; var h = {}; var k; for (k in older) h[k] = older[k]; for (k in newer) if (newer[k] != null) h[k] = newer[k]; h.firstSeen = Math.min(a.firstSeen || a.lastSeen || Infinity, b.firstSeen || b.lastSeen || Infinity); h.snaps = []; (older.snaps || []).concat(newer.snaps || []).forEach(function (x) { addSnap(h, x); }); return h; } function velocity(h, ratio, now) { var s = ((h && h.snaps) || []).filter(function (x) { return x.ratings != null; }).sort(function (a, b) { return a.t - b.t; }); if (s.length < 2) return null; var last = s[s.length - 1], cands = s.filter(function (x) { return last.t - x.t >= 20 * 36e5; }); if (!cands.length) return null; var week = cands.filter(function (x) { return last.t - x.t >= 6 * DAY; }); var base = week.length ? week[week.length - 1] : cands[0]; var days = (last.t - base.t) / DAY, gained = last.ratings - base.ratings; var out = { days: days, gained: gained, from: base, to: last, dropped: gained < 0 }; out.ratingsPerDay = gained < 0 ? null : gained / days; out.ordersPerDay = out.ratingsPerDay == null ? null : out.ratingsPerDay * (ratio || DEFAULTS.ratingRatio); var first = s[0], all = (last.t - first.t) / DAY; if (all >= 0.8 && last.ratings >= first.ratings) out.overallPerDay = (last.ratings - first.ratings) / all * (ratio || DEFAULTS.ratingRatio); return out; } function risk(lowShare) { return lowShare == null ? null : lowShare >= 25 ? 'High' : lowShare >= 15 ? 'Medium' : 'Low'; } return { DEFAULTS: DEFAULTS, TCS: TCS, TDS: TDS, num: num, productId: productId, extract: extract, settings: settings, money: money, remember: remember, merge: merge, velocity: velocity, risk: risk, dayKey: dayKey }; })();";
// PakkaBill's Meesho Lens page (#/lens): every competitor you looked at on Meesho, side by side.
// Products come from the Lens extension (laptop) or the Lens bookmark (phone) and are kept on
// this device only. Uses PBLensCore (core.js) and PBL_BM_CORE (the bookmark's copy of it).
var C = PBLensCore;
var STORE = 'pb-lens', SETS = 'pb-lens-settings';
var ID_RE = /^[a-z0-9]{1,40}$/i;
var state = { products: {}, settings: null, ext: null, sort: 'fast', open: {}, el: null, note: null };

function load() {
  try { var s = JSON.parse(localStorage.getItem(STORE) || 'null'); if (s && s.products) state.products = s.products; } catch (e) { /* storage off */ }
  try { var t = JSON.parse(localStorage.getItem(SETS) || 'null'); if (t) state.settings = t; } catch (e) { /* storage off */ }
  try { var so = localStorage.getItem('pb-lens-sort'); if (so) state.sort = so; } catch (e) { /* storage off */ }
}
function save() { try { localStorage.setItem(STORE, JSON.stringify({ products: state.products })); } catch (e) { /* full or off */ } }
function S() { var s = C.settings(state.settings); s.myPrice = state.settings && state.settings.myPrice != null ? state.settings.myPrice : ''; return s; }

// Only keep what we expect, whatever the source.
function safeProduct(h) {
  if (!h || typeof h !== 'object' || !ID_RE.test(String(h.id || ''))) return null;
  var url = String(h.url || '');
  if (!/^https:\/\/www\.meesho\.com\/[^\s"'<>]*$/.test(url)) url = 'https://www.meesho.com/p/' + h.id;
  var str = function (v, n) { return v == null ? null : String(v).slice(0, n || 120); };
  var nr = function (v) { return typeof v === 'number' && isFinite(v) ? v : null; };
  var o = {
    id: String(h.id), url: url, name: str(h.name, 160), seller: str(h.seller), packText: str(h.packText, 40), pack: nr(h.pack) || 1,
    fabric: str(h.fabric, 60), brand: str(h.brand, 60), image: /^https:\/\/[^\s"'<>]+$/.test(String(h.image || '')) ? String(h.image).slice(0, 400) : null,
    freeDelivery: typeof h.freeDelivery === 'boolean' ? h.freeDelivery : null, deliveryCharge: nr(h.deliveryCharge), onwards: !!h.onwards, off: nr(h.off),
    lowShare: nr(h.lowShare), poorShare: nr(h.poorShare), sellerFollowers: nr(h.sellerFollowers), sellerProducts: nr(h.sellerProducts), sellerRating: nr(h.sellerRating),
    lastSeen: nr(h.lastSeen) || Date.now(), firstSeen: nr(h.firstSeen) || nr(h.lastSeen) || Date.now()
  };
  if (h.breakdown && typeof h.breakdown === 'object') { o.breakdown = {}; ['Excellent', 'Very Good', 'Good', 'Average', 'Poor'].forEach(function (k) { if (nr(h.breakdown[k]) != null) o.breakdown[k] = h.breakdown[k]; }); }
  if (Array.isArray(h.sizes)) o.sizes = h.sizes.slice(0, 30).filter(function (x) { return x && nr(x.price) != null; }).map(function (x) { return { size: str(x.size, 30), price: x.price }; });
  if (Array.isArray(h.sizeList)) o.sizeList = h.sizeList.slice(0, 30).map(function (x) { return str(x, 30); });
  o.snaps = (Array.isArray(h.snaps) ? h.snaps : []).slice(-120).filter(function (x) { return x && nr(x.t) != null; }).map(function (x) {
    return { t: x.t, price: nr(x.price), mrp: nr(x.mrp), ratings: nr(x.ratings), reviews: nr(x.reviews), rating: nr(x.rating) };
  });
  return o.snaps.length ? o : null;
}
function put(h) {
  var p = safeProduct(h); if (!p) return false;
  state.products[p.id] = safeProduct(C.merge(state.products[p.id], p)) || p;
  return true;
}

// A product sent by the phone bookmark: https://…/?lens=<page reading>#/lens
function importFromUrl() {
  var q; try { q = new URLSearchParams(location.search).get('lens'); } catch (e) { q = null; }
  if (!q) return;
  var ok = false, d = null;
  try { d = JSON.parse(q); ok = d && ID_RE.test(String(d.id || '')) && put(C.remember(null, d)); } catch (e) { ok = false; }
  save();
  state.note = ok ? { level: 'ok', text: 'Added "' + (d.name || d.id) + '". Open it again on another day to see how fast it sells.' } : { level: 'warn', text: 'That Meesho page could not be read. Open a product page (its link has /p/ in it) and tap the bookmark again.' };
  try { history.replaceState(null, '', location.pathname + '#/lens'); } catch (e) { location.hash = '#/lens'; }
}

// The Lens extension answers from its bridge script on this site.
function listenToExtension() {
  window.addEventListener('message', function (e) {
    if (e.source !== window || e.origin !== location.origin || !e.data || e.data.type !== 'pb-lens-sync') return;
    var list = Array.isArray(e.data.products) ? e.data.products.slice(0, 2000) : [];
    list.forEach(put);
    if (e.data.settings && !state.settings) { state.settings = C.settings(e.data.settings); try { localStorage.setItem(SETS, JSON.stringify(state.settings)); } catch (x) { /* off */ } }
    save();
    state.ext = { version: String(e.data.version || '').slice(0, 12), count: list.length };
    render();
  });
  window.postMessage({ type: 'pb-lens-hello' }, location.origin);
}
function tellExtension(msg) { if (state.ext) window.postMessage(msg, location.origin); }

/* ------------------------------------------------------------------ helpers */
function h(tag, attrs) {
  var el = document.createElement(tag);
  if (attrs) for (var k in attrs) {
    var v = attrs[k]; if (v == null || v === false) continue;
    if (k === 'class') el.className = v; else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v); else if (k === 'style') el.setAttribute('style', v); else el.setAttribute(k, v === true ? '' : v);
  }
  for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
  return el;
}
function add(el, c) { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(function (x) { add(el, x); }); else el.append(c.nodeType ? c : document.createTextNode(String(c))); }
var rs = function (n) { return n == null || isNaN(n) ? '—' : (n < 0 ? '−₹' : '₹') + Math.abs(Math.round(n)).toLocaleString('en-IN'); };
var int = function (n) { return n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('en-IN'); };
var ago = function (t) { var d = Math.floor((Date.now() - t) / 864e5); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'; };
var median = function (a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function btn(label, onclick, kind, attrs) { return h('button', Object.assign({ type: 'button', class: 'pb-btn ' + (kind || 'pb-btn--secondary'), onclick: onclick }, attrs || {}), label); }
function tag(kind, text) { return h('span', { class: 'lns-tag is-' + kind }, text); }

function rows() {
  var s = S();
  return Object.keys(state.products).map(function (id) {
    var p = state.products[id], last = p.snaps[p.snaps.length - 1], first = p.snaps[0];
    var price = last.price != null ? last.price : null;
    var v = C.velocity(p, s.ratingRatio);
    return { p: p, last: last, first: first, price: price, v: v, money: C.money(price, p, s), speed: v && v.ordersPerDay != null ? v.ordersPerDay : null };
  });
}
function sorted(list) {
  var by = {
    fast: function (a, b) { return (b.speed == null ? -1 : b.speed) - (a.speed == null ? -1 : a.speed) || (b.last.ratings || 0) - (a.last.ratings || 0); },
    cheap: function (a, b) { return (a.price == null ? 1e9 : a.price) - (b.price == null ? 1e9 : b.price); },
    ratings: function (a, b) { return (b.last.ratings || 0) - (a.last.ratings || 0); },
    recent: function (a, b) { return b.p.lastSeen - a.p.lastSeen; }
  };
  return list.sort(by[state.sort] || by.fast);
}

/* ------------------------------------------------------------------- render */
var rendering = false;
function render() {
  var el = state.el; if (!el || !el.isConnected) return;
  // Replacing a focused input fires its change event, which asks for another render.
  if (rendering) { setTimeout(render, 0); return; }
  rendering = true;
  try { draw(el); } finally { rendering = false; }
}
function draw(el) {
  var list = sorted(rows()), s = S();
  var out = [];
  out.push(h('div', { class: 'page-head' },
    h('div', null, h('h1', { class: 'page-title' }, 'Meesho Lens'), h('p', { class: 'page-sub' }, 'What competitors charge, earn and sell on Meesho, from the product pages you open.')),
    h('span', { class: 'pill' + (state.ext ? ' pill--paid' : ' pill--void') }, state.ext ? 'Extension connected' : list.length + ' tracked')));
  if (state.note) out.push(h('div', { class: 'banner lns-note is-' + state.note.level, role: 'status' }, state.note.text));
  if (list.length) out.push(summary(list, s), cards(list, s));
  else out.push(h('section', { class: 'paper lns-sec lns-empty' }, h('h2', { class: 'form-sec__title' }, 'No competitors yet'),
    h('p', null, 'Open competitors\' products on Meesho with the Lens. Each one you open lands here, and opening it again on later days shows how fast it is selling.')));
  out.push(getLens(), settingsCard(s));
  el.replaceChildren.apply(el, [h('div', { class: 'lns' }, out)]);
}

function summary(list, s) {
  var prices = list.map(function (r) { return r.price; }).filter(function (x) { return x != null; });
  var fast = list.filter(function (r) { return r.speed != null; }).sort(function (a, b) { return b.speed - a.speed; })[0];
  var tiles = [
    ['Competitors', int(list.length), list.filter(function (r) { return r.p.snaps.length > 1; }).length + ' with more than one day of readings'],
    ['Price range', prices.length ? rs(Math.min.apply(null, prices)) + ' – ' + rs(Math.max.apply(null, prices)) : '—', prices.length ? 'middle ' + rs(median(prices)) : ''],
    ['Selling fastest', fast ? '~' + int(fast.speed) + '/day' : '—', fast ? (fast.p.name || fast.p.id).slice(0, 48) : 'open products again on later days']
  ];
  var myP = +s.myPrice;
  if (s.myPrice !== '' && myP > 0 && prices.length) {
    var cheaper = prices.filter(function (x) { return x < myP; }).length;
    tiles.push(['Your price ' + rs(myP), cheaper + ' of ' + prices.length, 'competitors are cheaper than you']);
  }
  return h('section', { class: 'lns-tiles', 'aria-label': 'Summary' }, tiles.map(function (t) {
    return h('div', { class: 'paper lns-tile' }, h('span', { class: 'lns-tile__k' }, t[0]), h('b', { class: 'lns-tile__v' }, t[1]), h('span', { class: 'lns-tile__s' }, t[2]));
  }));
}

function cards(list, s) {
  var opts = [['fast', 'Selling fastest'], ['cheap', 'Cheapest'], ['ratings', 'Most ratings'], ['recent', 'Recently opened']];
  var seg = h('div', { class: 'pb-seg pb-seg--sm', role: 'radiogroup', 'aria-label': 'Sort' }, opts.map(function (o) {
    return h('button', { type: 'button', role: 'radio', 'aria-checked': String(state.sort === o[0]), class: 'pb-seg__opt' + (state.sort === o[0] ? ' is-on' : ''), onclick: function () { state.sort = o[0]; try { localStorage.setItem('pb-lens-sort', o[0]); } catch (e) { /* off */ } render(); } }, o[1]);
  }));
  return h('section', { class: 'lns-sec', 'aria-labelledby': 'lns-h' },
    h('div', { class: 'lns-bar' }, h('h2', { id: 'lns-h', class: 'form-sec__title' }, 'Competitors'), seg),
    h('ul', { class: 'lns-list' }, list.map(function (r) { return card(r, s); })),
    h('div', { class: 'lns-actions' }, btn('Download CSV', csv), clearBtn()));
}

function card(r, s) {
  var p = r.p, v = r.v, m = r.money, lvl = C.risk(p.lowShare);
  var moved = r.first.price != null && r.price != null && r.first.price !== r.price;
  var body = h('div', { class: 'lns-card__main' },
    h('a', { class: 'lns-card__name', href: p.url, target: '_blank', rel: 'noopener noreferrer' }, p.name || 'Meesho product ' + p.id),
    h('span', { class: 'lns-card__seller' }, [p.seller ? 'Sold by ' + p.seller : 'Seller not read', p.packText ? ' · ' + p.packText : '', ' · opened ' + ago(p.lastSeen)].join('')),
    h('dl', { class: 'lns-kv' },
      kv('Price' + (p.onwards ? ' (from)' : ''), rs(r.price), moved ? (r.price < r.first.price ? '▼ was ' : '▲ was ') + rs(r.first.price) : (r.last.mrp ? 'MRP ' + rs(r.last.mrp) : '')),
      kv('Bank settlement', rs(m.settlement), 'estimate'),
      kv('Rating', r.last.rating != null ? r.last.rating + ' ★' : '—', int(r.last.ratings) + ' ratings'),
      kv('Orders / day', r.speed != null ? '~' + int(r.speed) : '—', v ? (v.dropped ? 'ratings went down' : 'over ' + v.days.toFixed(1) + ' days') : 'open again tomorrow'),
      kv('Poor + average', p.lowShare != null ? p.lowShare.toFixed(1) + '%' : '—', lvl ? lvl + ' return risk' : 'scroll to ratings on Meesho', lvl === 'High' ? 'bad' : lvl === 'Low' ? 'good' : '')));
  var more = h('details', { class: 'lns-more' }, h('summary', null, 'Details and history'), details(r, s));
  if (state.open[p.id]) more.open = true;
  more.addEventListener('toggle', function () { state.open[p.id] = more.open; });
  return h('li', { class: 'paper lns-card' },
    h('div', { class: 'lns-card__top' },
      p.image ? h('img', { class: 'lns-card__img', src: p.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : h('span', { class: 'lns-card__img is-blank', 'aria-hidden': 'true' }),
      body,
      h('button', { type: 'button', class: 'lns-x', 'aria-label': 'Remove ' + (p.name || p.id), title: 'Remove', onclick: function () { remove(p.id); } }, '×')),
    more);
}
function kv(k, v, sub, cls) { return h('div', { class: 'lns-kv__i' }, h('dt', null, k), h('dd', { class: cls ? 'is-' + cls : null }, v), sub ? h('dd', { class: 'lns-kv__s' }, sub) : null); }

function details(r, s) {
  var p = r.p, m = r.money, out = [];
  var line = function (k, v, cls) { return h('li', null, h('span', null, k), h('b', { class: cls ? 'is-' + cls : null }, v)); };
  out.push(h('div', { class: 'lns-cols' },
    h('div', null, h('h3', { class: 'lns-h3' }, 'Money per order ', tag('est', 'estimate')), h('ul', { class: 'lns-lines' },
      line('Meesho price', rs(r.price)),
      line(p.freeDelivery === false ? 'Delivery paid by buyer' : 'Shipping inside the price', p.freeDelivery === false ? rs(p.deliveryCharge) : '−' + rs(s.shipping)),
      line('Seller\'s price', rs(m.sellerPrice)),
      line('TCS 0.5% + TDS 0.1% held back', rs(-(m.tcs + m.tds)), 'bad'),
      line('Bank settlement', rs(m.settlement)),
      line('GST ' + s.gst + '% to pay', rs(-m.gstAmt), 'bad'),
      line('Earning (TCS/TDS come back as credit)', rs(m.earning)),
      p.pack > 1 ? line('Earning per piece', rs(m.perPiece)) : null,
      m.myMargin != null ? line('Your margin at their price', rs(m.myMargin), m.myMargin < 0 ? 'bad' : 'good') : null,
      m.expected != null ? line('After ' + s.returnPct + '% returns', rs(m.expected), m.expected < 0 ? 'bad' : 'good') : null)),
    h('div', null, h('h3', { class: 'lns-h3' }, 'Seller and product'), h('ul', { class: 'lns-lines' },
      line('Sold by', p.seller || '—'),
      p.sellerRating != null ? line('Seller rating', p.sellerRating + ' ★') : null,
      p.sellerFollowers != null ? line('Followers', int(p.sellerFollowers)) : null,
      p.sellerProducts != null ? line('Products listed', int(p.sellerProducts)) : null,
      p.fabric ? line('Fabric', p.fabric) : null,
      p.packText ? line('Pack', p.packText) : null,
      line('Lifetime orders', r.last.ratings != null ? '~' + int(r.last.ratings * s.ratingRatio) : '—'),
      line('First opened', new Date(p.firstSeen).toLocaleDateString('en-IN'))))));
  if (p.breakdown) {
    var tot = 0; for (var k in p.breakdown) tot += p.breakdown[k];
    out.push(h('h3', { class: 'lns-h3' }, 'Rating breakdown'), h('ul', { class: 'lns-bars' }, ['Excellent', 'Very Good', 'Good', 'Average', 'Poor'].map(function (k) {
      var n = p.breakdown[k] || 0, pc = tot ? n / tot * 100 : 0;
      return h('li', { class: /Average|Poor/.test(k) ? 'is-low' : null }, h('span', null, k), h('span', { class: 'lns-bar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + pc.toFixed(1) + '%' })), h('b', null, pc.toFixed(0) + '%'));
    })));
  }
  if (p.sizes && p.sizes.length) out.push(h('h3', { class: 'lns-h3' }, 'Price by size'), h('div', { class: 'lns-chips' }, p.sizes.map(function (x) { return h('span', null, x.size + ' ' + rs(x.price)); })));
  else if (p.sizeList && p.sizeList.length) out.push(h('h3', { class: 'lns-h3' }, 'Sizes'), h('div', { class: 'lns-chips' }, p.sizeList.map(function (x) { return h('span', null, x); })));
  if (p.snaps.length > 1) {
    out.push(h('h3', { class: 'lns-h3' }, 'Readings'), h('div', { class: 'table-wrap' }, h('table', { class: 'rtable lns-hist' },
      h('thead', null, h('tr', null, h('th', { class: 'l' }, 'Day'), h('th', null, 'Price'), h('th', null, 'Ratings'), h('th', null, 'New'))),
      h('tbody', null, p.snaps.slice().reverse().slice(0, 30).map(function (x, i, arr) {
        var prev = arr[i + 1], gain = prev && x.ratings != null && prev.ratings != null ? x.ratings - prev.ratings : null;
        return h('tr', null, h('td', { class: 'l' }, new Date(x.t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })), h('td', null, rs(x.price)), h('td', null, int(x.ratings)), h('td', null, gain == null ? '' : (gain >= 0 ? '+' : '') + int(gain)));
      })))));
  }
  return h('div', { class: 'lns-more__body' }, out);
}

function getLens() {
  var bm = bookmarklet();
  var copyBtn = btn('Copy the Lens bookmark', function () {
    var done = function () { copyBtn.textContent = 'Copied. Now paste it as a bookmark\'s address'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(bm).then(done, function () { area.hidden = false; area.select(); });
    else { area.hidden = false; area.select(); }
  }, 'pb-btn--primary');
  var area = h('textarea', { class: 'pb-input lns-code', readonly: true, rows: 3, hidden: true, 'aria-label': 'Lens bookmark address' });
  area.value = bm;
  var drag = h('a', { class: 'pb-btn pb-btn--secondary lns-drag', title: 'Drag me to your bookmarks bar' }, '⤓ Lens'); drag.setAttribute('href', bm);
  drag.addEventListener('click', function (e) { e.preventDefault(); state.note = { level: 'warn', text: 'Drag the "Lens" button to your bookmarks bar, then click it on a Meesho product page.' }; render(); });
  return h('section', { class: 'paper lns-sec lns-get', 'aria-labelledby': 'lns-get-h' },
    h('h2', { id: 'lns-get-h', class: 'form-sec__title' }, state.ext ? 'Lens extension' : 'Get the Lens'),
    state.ext ? h('p', { class: 'banner lns-ok' }, 'Connected (version ' + state.ext.version + '). ' + state.ext.count + ' products came in from it. Open products on meesho.com and come back here.') : null,
    h('div', { class: 'lns-cols' },
      h('div', null, h('h3', { class: 'lns-h3' }, 'Laptop: Chrome or Edge'),
        h('p', { class: 'fine' }, 'A panel on every Meesho product page with price, settlement, sales speed and quality, and everything you open lands here.'),
        h('a', { class: 'pb-btn pb-btn--primary lns-dl', href: 'pakkabill-lens.zip', download: 'pakkabill-lens.zip' }, 'Download the extension'),
        h('ol', { class: 'steps' },
          h('li', null, 'Unzip the file.'),
          h('li', null, 'Open chrome://extensions and turn on Developer mode (top right).'),
          h('li', null, 'Click "Load unpacked" and choose the pakkabill-lens folder.'),
          h('li', null, 'Open products on meesho.com, then come back to this page.'))),
      h('div', null, h('h3', { class: 'lns-h3' }, 'Phone: the Lens bookmark'),
        h('p', { class: 'fine' }, 'Phone Chrome can\'t run extensions, so use a bookmark that reads the Meesho page and brings it here.'),
        h('div', { class: 'lns-actions' }, copyBtn, drag), area,
        h('ol', { class: 'steps' },
          h('li', null, 'In Chrome, bookmark any page (⋮ then ☆), then edit that bookmark.'),
          h('li', null, 'Name it Lens and paste the copied text as its address (URL). Save.'),
          h('li', null, 'Open a competitor\'s product on meesho.com in Chrome (not the Meesho app).'),
          h('li', null, 'Tap the address bar, type Lens and tap the bookmark. The product opens here.')))));
}

function settingsCard(s) {
  var field = function (key, label, hint, ph) {
    var inp = h('input', { class: 'pb-input', type: 'number', inputmode: 'decimal', min: '0', step: 'any', value: s[key] === '' ? '' : String(s[key]), placeholder: ph || '', id: 'lns-' + key });
    inp.addEventListener('change', function () {
      var cur = Object.assign({}, S()); cur[key] = inp.value;
      state.settings = Object.assign(C.settings(cur), { myPrice: cur.myPrice });
      try { localStorage.setItem(SETS, JSON.stringify(state.settings)); } catch (e) { /* off */ }
      tellExtension({ type: 'pb-lens-settings', settings: C.settings(state.settings) });
      render();
    });
    return h('div', { class: 'pb-field' }, h('label', { class: 'pb-field__label', for: 'lns-' + key }, label), inp, hint ? h('div', { class: 'pb-field__msg' }, hint) : null);
  };
  var box = h('details', { class: 'paper lns-sec lns-settings', open: !!state.settingsOpen }, h('summary', null, h('span', { class: 'form-sec__title' }, 'Settings for estimates')),
    h('div', { class: 'lns-grid' },
      field('shipping', 'Shipping inside the price (₹)', 'What Meesho adds for delivery on a free-delivery product. See your own supplier panel for your weight.'),
      field('gst', 'Product GST %', 'Clothes: 5% up to ₹2,500 a piece, 18% above (from 22 Sep 2025).'),
      field('ratingRatio', 'Orders per 1 rating', 'Only a share of buyers rate. Check yours: your orders ÷ your ratings.'),
      field('myCost', 'My cost per piece (₹)', 'To see your margin if you sold at their price.', 'optional'),
      field('myPrice', 'My Meesho price (₹)', 'To see how many competitors are cheaper.', 'optional'),
      field('returnPct', 'My returns %', 'Returns and RTO as a share of orders.'),
      field('returnLoss', 'Loss per return (₹)', 'Return shipping and damage, on average.')),
    h('p', { class: 'fine' }, 'Real from the page: prices, delivery, ratings, reviews, rating breakdown, seller details. Estimates: seller price, settlement, orders and return risk; Meesho does not publish anyone\'s orders or return %.'));
  box.addEventListener('toggle', function () { state.settingsOpen = box.open; });
  return box;
}

function bookmarklet() {
  var go = 'var d=PBLensCore.extract(document,location);if(!d.id||!/meesho\\.com$/.test(location.hostname)){alert("Open a product page on meesho.com first, then tap the Lens bookmark.");return;}'
    + 'location.href=' + JSON.stringify(location.origin + location.pathname + '?lens=') + '+encodeURIComponent(JSON.stringify(d))+"#/lens";';
  return 'javascript:' + encodeURIComponent('(function(){' + PBL_BM_CORE + go + '})()');
}

function remove(id) {
  delete state.products[id]; save();
  tellExtension({ type: 'pb-lens-remove', ids: [id] });
  render();
}
function clearBtn() {
  var armed = false;
  var b = btn('Remove all', function () {
    if (!armed) { armed = true; b.textContent = 'Tap again to remove all'; b.classList.add('lns-armed'); setTimeout(function () { armed = false; b.textContent = 'Remove all'; b.classList.remove('lns-armed'); }, 4000); return; }
    state.products = {}; save(); tellExtension({ type: 'pb-lens-clear' }); render();
  }, 'pb-btn--ghost');
  return b;
}
function csv() {
  var s = S(), q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
  var head = ['Product', 'Seller', 'Link', 'Price now', 'Price first seen', 'MRP', 'Est. bank settlement', 'Est. earning after GST', 'Rating', 'Ratings', 'Reviews', 'Est. orders per day', 'Days measured', 'Poor + average %', 'Pack', 'Followers', 'Products listed', 'First opened', 'Last opened'];
  var lines = [head.map(q).join(',')].concat(sorted(rows()).map(function (r) {
    var p = r.p;
    return [p.name, p.seller, p.url, r.price, r.first.price, r.last.mrp, r.money.settlement == null ? '' : Math.round(r.money.settlement), r.money.earning == null ? '' : Math.round(r.money.earning), r.last.rating, r.last.ratings, r.last.reviews,
      r.speed == null ? '' : Math.round(r.speed), r.v ? r.v.days.toFixed(1) : '', p.lowShare == null ? '' : p.lowShare.toFixed(1), p.packText, p.sellerFollowers, p.sellerProducts,
      new Date(p.firstSeen).toLocaleDateString('en-IN'), new Date(p.lastSeen).toLocaleDateString('en-IN')].map(q).join(',');
  }));
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' }));
  a.download = 'meesho-competitors.csv'; document.body.append(a); a.click(); a.remove();
}

var CSS = '.lns{min-width:0}.lns .page-head{align-items:flex-end}.lns-note{margin:0 0 14px}.lns-note.is-ok,.lns-ok{background:var(--green-soft)}'
  + '.lns-sec{margin:0 0 16px;padding:18px 22px}.lns-sec.lns-empty p{color:var(--ink-2);max-width:62ch;margin:6px 0 0}'
  + '.lns-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(150px,100%),1fr));gap:12px;margin:0 0 16px}'
  + '.lns-tile{padding:14px 16px;display:grid;gap:2px;min-width:0}.lns-tile__k{font-size:13px;color:var(--ink-2);font-weight:600}.lns-tile__v{font-family:var(--font-display);font-size:28px;font-weight:500;color:var(--ink);line-height:1.1}.lns-tile__s{font-size:12.5px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
  + '.lns-sec:not(.paper){padding:0}.lns-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}.lns-bar .form-sec__title{margin:0}'
  + '.lns-list{list-style:none;margin:0;padding:0;display:grid;gap:12px}.lns-card{padding:14px 16px 6px;min-width:0}'
  + '.lns-card__top{display:grid;grid-template-columns:64px minmax(0,1fr) 34px;gap:14px;align-items:start}'
  + '.lns-card__img{width:64px;height:84px;border-radius:8px;object-fit:cover;background:var(--desk-2);display:block}.lns-card__img.is-blank{background:repeating-linear-gradient(135deg,var(--desk-2) 0 7px,var(--rule) 7px 8px)}'
  + '.lns-card__main{min-width:0}.lns-card__name{font-weight:700;font-size:15.5px;color:var(--ink);text-decoration:none;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.lns-card__name:hover{color:var(--carbon);text-decoration:underline}'
  + '.lns-card__seller{display:block;font-size:13px;color:var(--ink-2);margin-top:2px}'
  + '.lns-kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:10px 16px;margin:12px 0 4px}.lns-kv__i{min-width:0}.lns-kv dt{font-size:12px;color:var(--ink-2);font-weight:600}.lns-kv dd{margin:0;font-size:18px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums}.lns-kv dd.lns-kv__s{font-size:12px;font-weight:500;color:var(--ink-3)}'
  + '.is-bad{color:var(--red)!important}.is-good{color:var(--green)!important}'
  + '.lns-x{width:34px;height:34px;border-radius:50%;border:1.5px solid var(--rule);background:var(--paper);color:var(--ink-3);font-size:19px;line-height:1;display:grid;place-items:center;cursor:pointer}.lns-x:hover{color:var(--red);border-color:var(--red)}'
  + '.lns-more{border-top:1px solid var(--rule-soft);margin-top:8px}.lns-more summary{cursor:pointer;padding:9px 0;font-weight:600;color:var(--carbon);font-size:14px}.lns-more__body{padding:0 0 12px}'
  + '.lns-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:8px 28px}'
  + '.lns-h3{font-size:13px;letter-spacing:.03em;text-transform:uppercase;color:var(--ink-2);margin:14px 0 6px;font-weight:700}'
  + '.lns-lines{list-style:none;margin:0;padding:0}.lns-lines li{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid var(--rule-soft);font-size:14px}.lns-lines li span{color:var(--ink-2)}.lns-lines li b{color:var(--ink);text-align:right;font-variant-numeric:tabular-nums}'
  + '.lns-tag{font-size:10.5px;font-weight:700;border-radius:4px;padding:1px 5px;text-transform:none;letter-spacing:0;vertical-align:1px}.lns-tag.is-est{background:var(--carbon-tint);color:var(--carbon);border:1px solid var(--rule)}'
  + '.lns-bars{list-style:none;margin:0;padding:0;display:grid;gap:5px;max-width:480px}.lns-bars li{display:grid;grid-template-columns:84px 1fr 40px;gap:10px;align-items:center;font-size:13.5px}.lns-bars b{text-align:right;font-variant-numeric:tabular-nums}'
  + '.lns-bar{height:9px;border-radius:9px;background:var(--desk-2);overflow:hidden}.lns-bar i{display:block;height:100%;background:var(--green)}.lns-bars li.is-low .lns-bar i{background:var(--red)}'
  + '.lns-chips{display:flex;flex-wrap:wrap;gap:6px}.lns-chips span{border:1px solid var(--rule);border-radius:6px;padding:2px 8px;font-size:13px;background:var(--paper)}'
  + '.lns-hist{max-width:460px}.lns-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:12px 0 4px}.lns-actions .pb-btn,.lns-dl{display:inline-flex}.lns-dl{margin:8px 0 4px}'
  + '.lns-armed{background:var(--red)!important;color:#fff!important}.lns-code{width:100%;font-family:ui-monospace,monospace;font-size:12px;height:auto!important}'
  + '.lns-settings summary{cursor:pointer;list-style:none}.lns-settings summary::-webkit-details-marker{display:none}.lns-settings summary .form-sec__title::after{content:" ▾";color:var(--ink-3)}'
  + '.lns-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(230px,100%),1fr));gap:16px 22px;margin-top:14px}'
  + '@media (width < 720px){.lns-sec.paper{padding:16px 14px}.lns-card{padding:12px 12px 4px}.lns-card__top{grid-template-columns:52px minmax(0,1fr) 30px;gap:10px}.lns-card__img{width:52px;height:68px}.lns-kv{grid-template-columns:repeat(2,minmax(0,1fr))}.lns-x{width:30px;height:30px}}';

load();
importFromUrl();
listenToExtension();

window.pbLensMount = function (el) {
  if (!el) return;
  if (!document.getElementById('lns-css')) { var st = document.createElement('style'); st.id = 'lns-css'; st.textContent = CSS; document.head.append(st); }
  load();
  state.el = el;
  render();
  if (!state.ext) window.postMessage({ type: 'pb-lens-hello' }, location.origin);
};

})();
