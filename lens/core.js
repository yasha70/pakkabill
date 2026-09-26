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
