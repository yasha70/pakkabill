// PakkaBill GST number lookup in the browser: window.pbGstFetch(gstin) -> { name, legalName, tradeName,
// address, pincode, stateCode, stateName, status, type, constitution, regDate, pan, entity, source, note }.
// Asks /api/config?gstin= (which uses the lookup service chosen in admin). Offline, or with no service, it still
// gives what the number itself says: the state, the PAN and the kind of business.
(function () {
  'use strict';
  var STATES = { '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan',
    '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
    '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli and Daman and Diu',
    '27': 'Maharashtra', '28': 'Andhra Pradesh (old)', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
    '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory', '99': 'Centre Jurisdiction' };
  var ENTITY = { P: 'Individual / Proprietor', C: 'Company', H: 'Hindu Undivided Family', F: 'Firm / LLP', A: 'Association of Persons', T: 'Trust', B: 'Body of Individuals',
    L: 'Local Authority', J: 'Artificial Juridical Person', G: 'Government' };
  function local(g, note) {
    var pan = g.slice(2, 12);
    return { gstin: g, stateCode: g.slice(0, 2), stateName: STATES[g.slice(0, 2)] || '', pan: pan, entity: ENTITY[pan.charAt(3)] || '', source: 'offline', note: note };
  }
  var saved = {};
  window.pbGstFetch = function (raw) {
    var g = String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (saved[g]) return Promise.resolve(saved[g]);
    if (navigator.onLine === false) return Promise.resolve(local(g, 'You are offline, so only the state is filled from the number. Type the name and address.'));
    return fetch('/api/config?gstin=' + encodeURIComponent(g), { headers: { Accept: 'application/json' } }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || 'Could not fetch the details. Try again.'); e.status = r.status; throw e; }
        return j;
      });
    }).then(function (j) {
      if (j.offline) return local(g, 'Name and address lookup is not switched on yet, so only the state is filled from the number. Type the name and address.');
      j.note = ''; saved[g] = j; return j;
    }, function (e) {
      if (e.status && e.status !== 502 && e.status !== 503 && e.status !== 504) throw e;
      return local(g, (e.status ? e.message + ' ' : 'Could not reach PakkaBill. ') + 'The state is filled from the number; type the name and address.');
    });
  };
})();
