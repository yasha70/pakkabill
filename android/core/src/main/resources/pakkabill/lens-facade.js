/* PakkaBill native app: Meesho Lens. PBLensCore (the website's lens/core.js, shared with the Lens
   extension) reads a Meesho product page and works out the estimates. This is the website Lens
   page's list (lens/page.js rows, sorted, summary, details) with the page's state passed in. ES5. */
var PBLens = (function () {
  'use strict';
  var C = PBLensCore;
  var median = function (a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  function S(set) { var s = C.settings(set); s.myPrice = set && set.myPrice != null ? set.myPrice : ''; return s; }

  // A product page read (PBLensCore.extract) added to its history: one reading per day.
  function track(prev, d, now) { return C.remember(prev || null, d, now); }

  function row(p, s, now) {
    var last = p.snaps[p.snaps.length - 1], first = p.snaps[0];
    var price = last.price != null ? last.price : null;
    var v = C.velocity(p, s.ratingRatio, now), m = C.money(price, p, s);
    return {
      id: p.id, name: p.name || 'Meesho product ' + p.id, url: p.url, image: p.image || null, seller: p.seller || null, packText: p.packText || null, pack: p.pack || 1,
      lastSeen: p.lastSeen, firstSeen: p.firstSeen, readings: p.snaps.length, price: price, firstPrice: first.price != null ? first.price : null, mrp: last.mrp != null ? last.mrp : null,
      onwards: !!p.onwards, rating: last.rating != null ? last.rating : null, ratings: last.ratings != null ? last.ratings : null, reviews: last.reviews != null ? last.reviews : null,
      speed: v && v.ordersPerDay != null ? v.ordersPerDay : null, days: v ? v.days : null, dropped: !!(v && v.dropped), overall: v && v.overallPerDay != null ? v.overallPerDay : null,
      money: m, lowShare: p.lowShare != null ? p.lowShare : null, poorShare: p.poorShare != null ? p.poorShare : null, risk: C.risk(p.lowShare),
      freeDelivery: p.freeDelivery, deliveryCharge: p.deliveryCharge != null ? p.deliveryCharge : null, fabric: p.fabric || null, brand: p.brand || null,
      sizes: p.sizes || null, sizeList: p.sizeList || null, sellerFollowers: p.sellerFollowers != null ? p.sellerFollowers : null,
      sellerProducts: p.sellerProducts != null ? p.sellerProducts : null, sellerRating: p.sellerRating != null ? p.sellerRating : null,
      breakdown: p.breakdown || null, off: p.off != null ? p.off : null
    };
  }

  // The Lens page: every competitor with its estimates, sorted, and the summary tiles.
  function view(products, settings, sort, now) {
    var s = S(settings), list = Object.keys(products || {}).map(function (id) { return row(products[id], s, now); });
    var by = {
      fast: function (a, b) { return (b.speed == null ? -1 : b.speed) - (a.speed == null ? -1 : a.speed) || (b.ratings || 0) - (a.ratings || 0); },
      cheap: function (a, b) { return (a.price == null ? 1e9 : a.price) - (b.price == null ? 1e9 : b.price); },
      ratings: function (a, b) { return (b.ratings || 0) - (a.ratings || 0); },
      recent: function (a, b) { return b.lastSeen - a.lastSeen; }
    };
    list.sort(by[sort] || by.fast);
    var prices = list.map(function (r) { return r.price; }).filter(function (x) { return x != null; });
    var fast = list.filter(function (r) { return r.speed != null; }).sort(function (a, b) { return b.speed - a.speed; })[0];
    var tiles = { count: list.length, multi: list.filter(function (r) { return r.readings > 1; }).length,
      low: prices.length ? Math.min.apply(null, prices) : null, high: prices.length ? Math.max.apply(null, prices) : null, middle: median(prices),
      fastest: fast ? { speed: fast.speed, name: fast.name } : null };
    var myP = +s.myPrice;
    if (s.myPrice !== '' && myP > 0 && prices.length) tiles.mine = { price: myP, cheaper: prices.filter(function (x) { return x < myP; }).length, of: prices.length };
    return { rows: list, tiles: tiles, settings: s };
  }

  // The panel on a product page in the app's Meesho view (the extension's panel).
  function panel(d, prev, settings, now) {
    var s = S(settings), h = d && d.id ? C.remember(prev || null, d, now) : null;
    return { h: h, money: C.money(d.price, d, s), v: h ? C.velocity(h, s.ratingRatio, now) : null, risk: C.risk(d.lowShare), d: d };
  }

  function csv(products, settings, now) {
    var s = S(settings), q = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var head = ['Product', 'Link', 'Seller', 'Price', 'MRP', 'Rating', 'Ratings', 'Reviews', 'Orders per day (estimate)', 'Bank settlement (estimate)', 'Earning (estimate)', 'Poor + average %', 'Return risk', 'Readings', 'Last opened'];
    var rows = Object.keys(products || {}).map(function (id) {
      var r = row(products[id], s, now);
      return [r.name, r.url, r.seller, r.price, r.mrp, r.rating, r.ratings, r.reviews, r.speed == null ? '' : Math.round(r.speed), r.money.settlement == null ? '' : Math.round(r.money.settlement),
        r.money.earning == null ? '' : Math.round(r.money.earning), r.lowShare == null ? '' : r.lowShare.toFixed(1), r.risk || '', r.readings, new Date(r.lastSeen).toISOString().slice(0, 10)];
    });
    return String.fromCharCode(0xFEFF) + [head].concat(rows).map(function (r) { return r.map(q).join(','); }).join('\r\n') + '\r\n';
  }

  return { track: track, view: view, panel: panel, csv: csv, defaults: C.DEFAULTS, productId: function (url) { var m = String(url || '').match(/\/p\/([a-z0-9]+)/i); return m ? m[1] : null; } };
})();
