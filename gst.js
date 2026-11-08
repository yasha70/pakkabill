// PakkaBill GST number and IFSC lookup in the browser.
//   window.pbGstFetch(gstin) -> { name, legalName, tradeName, address, pincode, stateCode, stateName, status, type,
//     composition, constitution, regDate, cancelDate, updated, centreOffice, stateOffice, eInvoice, business, places,
//     pan, entity, source, note }
//   window.pbIfscFetch(ifsc) -> { bank, branch, city, district, state, address, upi, neft, imps, rtgs }
// Asks /api/config (which uses the lookup service chosen in admin). Answers are kept on this device for 30 days,
// so a buyer billed again fills in at once, even offline, and no lookup credit is spent twice. A dropped
// connection is tried once more. Offline, or with no service, it still gives what the number itself says:
// the state, the PAN and the kind of business.
(function () {
  'use strict';
  var STATES = { '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan',
    '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
    '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli and Daman and Diu',
    '27': 'Maharashtra', '28': 'Andhra Pradesh (old)', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
    '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory', '99': 'Centre Jurisdiction' };
  var ENTITY = { P: 'Individual / Proprietor', C: 'Company', H: 'Hindu Undivided Family', F: 'Firm / LLP', A: 'Association of Persons', T: 'Trust', B: 'Body of Individuals',
    L: 'Local Authority', J: 'Artificial Juridical Person', G: 'Government' };
  var KEY = 'pb-gst-cache', DAYS = 30, MAX = 300;
  function local(g, note) {
    var pan = g.slice(2, 12);
    return { gstin: g, stateCode: g.slice(0, 2), stateName: STATES[g.slice(0, 2)] || '', pan: pan, entity: ENTITY[pan.charAt(3)] || '', source: 'offline', note: note };
  }
  // device cache: { gstin: { t: savedAt, d: answer } }, newest kept when it grows past MAX
  function readCache() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function remember(g, d) {
    try {
      var c = readCache(); c[g] = { t: Date.now(), d: d };
      var keys = Object.keys(c);
      if (keys.length > MAX) keys.sort(function (a, b) { return c[a].t - c[b].t; }).slice(0, keys.length - MAX).forEach(function (k) { delete c[k]; });
      localStorage.setItem(KEY, JSON.stringify(c));
    } catch (e) { /* storage full or blocked: the lookup still works */ }
  }
  function cached(g) {
    var hit = readCache()[g];
    return hit && Date.now() - hit.t < DAYS * 864e5 ? hit.d : null;
  }
  // GET with one more try when the connection drops or the server has a passing problem
  function getJson(url) {
    function once() {
      return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { var e = new Error(j.error || 'Could not fetch the details. Try again.'); e.status = r.status; throw e; }
          return j;
        });
      });
    }
    return once().catch(function (e) {
      if (e.status && e.status !== 502 && e.status !== 503 && e.status !== 504) throw e;
      return new Promise(function (ok) { setTimeout(ok, 800); }).then(once);
    });
  }
  window.pbGstFetch = function (raw) {
    var g = String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    var hit = cached(g);
    if (hit) return Promise.resolve(Object.assign({}, hit, { note: '', fromDevice: true }));
    if (navigator.onLine === false) return Promise.resolve(local(g, 'You are offline, so only the state is filled from the number. Type the name and address.'));
    return getJson('/api/config?gstin=' + encodeURIComponent(g)).then(function (j) {
      if (j.offline) return local(g, 'Name and address lookup is not switched on yet, so only the state is filled from the number. Type the name and address.');
      j.note = ''; remember(g, j); return j;
    }, function (e) {
      if (e.status && e.status !== 502 && e.status !== 503 && e.status !== 504) throw e;
      return local(g, (e.status ? e.message + ' ' : 'Could not reach PakkaBill. ') + 'The state is filled from the number; type the name and address.');
    });
  };
  var banks = {};
  window.pbIfscFetch = function (raw) {
    var c = String(raw || '').toUpperCase().replace(/\s/g, '');
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(c)) return Promise.reject(new Error('An IFSC has 11 characters, like SBIN0001234.'));
    if (banks[c]) return Promise.resolve(banks[c]);
    if (navigator.onLine === false) return Promise.reject(new Error('You are offline. Type the bank and branch.'));
    return getJson('/api/config?ifsc=' + encodeURIComponent(c)).then(function (j) { banks[c] = j; return j; });
  };
})();
