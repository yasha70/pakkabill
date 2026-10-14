// PakkaBill: GSTR-1 JSON checker.
// Reads any GSTR-1 JSON (made by PakkaBill or any other tool) and checks it the way the GST portal and
// a careful CA would before upload: GSTINs and their check digit, the return period, every table's
// fields, tax worked out from rate and value, intra or inter-state against the place of supply, state
// codes, rates, duplicates, Table 12 (HSN, split into B2B and B2C since 2025) and whether it ties to
// the other tables, Table 13 document ranges (overlaps, counts), Table 14 against Table 7, and what
// goes into GSTR-3B. Two files can be compared table by table and state by state. A cleaned copy can
// be downloaded with only safe fixes (zero rows dropped, overlapping document ranges of one series
// joined, document type names), never a change to an amount.
// The GSTR-1 page calls window.pbGstr1CheckMount(el, ownJson). window.PBG1 is the engine (tested in Node).
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;

  /* ======================================================= engine (no DOM) */

  const STATES = {
    '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
    '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland',
    '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
    '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu',
    '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
    '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory', '96': 'Other Country',
  };
  // codes that no longer exist: Daman and Diu joined Dadra and Nagar Haveli (26) in 2020, and old Andhra Pradesh (28) is now 37
  const OLD_STATES = { '25': '26', '28': '37' };
  const RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];
  const UQC = 'BAG BAL BDL BKL BOU BOX BTL BUN CAN CBM CCM CMS CTN DOZ DRM GGK GMS GRS GYD KGS KLR KME LTR MLT MTR MTS NOS OTH PAC PCS PRS QTL ROL SET SQF SQM SQY TBS TGM THD TON TUB UGS UNT YDS NA'.split(' ');
  const DOC_TYPES = {
    1: 'Invoices for outward supply', 2: 'Invoices for inward supply from unregistered person', 3: 'Revised Invoice', 4: 'Debit Note',
    5: 'Credit Note', 6: 'Receipt voucher', 7: 'Payment Voucher', 8: 'Refund voucher', 9: 'Delivery Challan for job work',
    10: 'Delivery Challan for supply on approval', 11: 'Delivery Challan in case of liquid gas',
    12: 'Delivery Challan in cases other than by way of supply (excluding at S no. 9 to 11)',
  };
  const TABLES = { b2b: '4A', b2cl: '5', exp: '6A', b2cs: '7', nil: '8', cdnr: '9B', cdnur: '9B', hsn: '12', doc_issue: '13', supeco: '14' };
  const TOL = 1; // the portal accepts tax up to Rs 1 away from rate × value
  const B2CL_LIMIT = 100000; // invoice value above which an inter-state B2C invoice is B2CL (from Aug 2024; Rs 2.5 lakh before)

  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
  const r2 = (v) => Math.round(v * 100) / 100;
  const paise = (v) => Math.round(num(v) * 100);
  const twoDp = (v) => typeof v !== 'number' || Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
  const nf = (n) => Number(n).toLocaleString('en-IN');
  const stateName = (c) => STATES[c] || (OLD_STATES[c] ? 'old code ' + c : 'code ' + c);

  // GSTIN: 2-digit state, PAN, entity number, Z (C for e-commerce TCS, D for TDS), check digit.
  const CH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function gstinCheckChar(first14) {
    let sum = 0;
    for (let i = 0; i < 14; i++) {
      const p = CH.indexOf(first14[i]) * (i % 2 ? 2 : 1);
      sum += Math.floor(p / 36) + (p % 36);
    }
    return CH[(36 - (sum % 36)) % 36];
  }
  function gstinOk(g) {
    g = String(g || '').toUpperCase();
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z][A-Z0-9][0-9A-Z]$/.test(g)) return false;
    return gstinCheckChar(g.slice(0, 14)) === g[14];
  }

  // An invoice or document number: up to 16 letters, digits, / and -, not all zeros.
  const docNoOk = (s) => /^[A-Za-z0-9/-]{1,16}$/.test(String(s || '')) && !/^[0/-]*$/.test(String(s));
  const dateOk = (s) => { const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(s || '')); if (!m) return null; const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])); return d.getUTCDate() === +m[1] && d.getUTCMonth() === +m[2] - 1 ? d : null; };

  // A document number split into its series and running number: the series is everything up to the
  // last digits that change across the series, so rsium274899 and rsium2712640 are series "rsium27"
  // with numbers 4899 and 12640, not "rsium" with 274899 and 2712640.
  function splitSeries(list) {
    const groups = new Map();
    list.forEach((s) => { const m = /^(.*?)(\d+)$/.exec(s); const k = m ? m[1] : s; (groups.get(k) || groups.set(k, []).get(k)).push(s); });
    const out = [];
    groups.forEach((items, base) => {
      let pre = base;
      if (items.length > 1) {
        let lcp = items[0];
        for (const s of items) { let i = 0; while (i < lcp.length && i < s.length && lcp[i] === s[i]) i++; lcp = lcp.slice(0, i); }
        while (lcp.length > base.length && !items.every((s) => s.length > lcp.length && /^\d+$/.test(s.slice(lcp.length)))) lcp = lcp.slice(0, -1);
        // keep a zero-padded number whole (INV0099, INV0100 stay INV + 0099, 0100)
        while (lcp.length > base.length && /0$/.test(lcp) && items.some((s) => s.length !== items[0].length)) lcp = lcp.slice(0, -1);
        pre = lcp.length >= base.length ? lcp : base;
      }
      items.forEach((s) => out.push({ s, prefix: pre, n: /^\d+$/.test(s.slice(pre.length)) ? parseInt(s.slice(pre.length), 10) : NaN, w: s.length - pre.length }));
    });
    return out;
  }
  function parseDocNo(s, prefixHint) {
    if (prefixHint && String(s).startsWith(prefixHint) && /^\d+$/.test(String(s).slice(prefixHint.length))) return { prefix: prefixHint, n: parseInt(String(s).slice(prefixHint.length), 10) };
    const m = /^(.*?)(\d+)$/.exec(String(s || ''));
    return m ? { prefix: m[1], n: parseInt(m[2], 10) } : null;
  }
  // The from-to ranges of one document type, read together: the series is found from all their
  // numbers at once (a single range like rsium2712495 to rsium2718596 cannot tell "rsium27" from "rsium271").
  function rangesOf(docs) {
    const vals = [];
    (docs || []).forEach((x) => { vals.push(String(x.from || ''), String(x.to || '')); });
    const sp = new Map(splitSeries([...new Set(vals)]).map((v) => [v.s, v]));
    return (docs || []).map((x) => {
      const a = sp.get(String(x.from || '')), b = sp.get(String(x.to || ''));
      if (!a || !b || a.prefix !== b.prefix || isNaN(a.n) || isNaN(b.n)) return null;
      return { prefix: a.prefix, lo: a.n, hi: b.n };
    });
  }
  const rangeOf = (from, to) => rangesOf([{ from, to }])[0];
  // How many numbers the ranges of each series cover together (overlaps counted once).
  function covered(ranges) {
    const by = new Map();
    ranges.filter(Boolean).forEach((r) => (by.get(r.prefix) || by.set(r.prefix, []).get(r.prefix)).push([Math.min(r.lo, r.hi), Math.max(r.lo, r.hi)]));
    let n = 0;
    by.forEach((list) => {
      list.sort((a, b) => a[0] - b[0]);
      let [lo, hi] = list[0];
      list.slice(1).forEach(([a, b]) => { if (a <= hi + 1) hi = Math.max(hi, b); else { n += hi - lo + 1; lo = a; hi = b; } });
      n += hi - lo + 1;
    });
    return n;
  }

  const tot = () => ({ n: 0, txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 });
  function add(t, r, sign = 1) { t.n++; t.txval += sign * num(r.txval); t.iamt += sign * num(r.iamt); t.camt += sign * num(r.camt); t.samt += sign * num(r.samt); t.csamt += sign * num(r.csamt); return t; }
  const roundTot = (t) => ({ ...t, txval: r2(t.txval), iamt: r2(t.iamt), camt: r2(t.camt), samt: r2(t.samt), csamt: r2(t.csamt), tax: r2(t.iamt + t.camt + t.samt + t.csamt) });

  function check(json, opts) {
    opts = opts || {};
    const issues = [];
    const say = (lvl, table, msg, fix, extra) => issues.push({ lvl, table, msg, fix: fix || '', ...(extra || {}) });
    const J = json && typeof json === 'object' ? json : null;
    if (!J) return { ok: false, issues: [{ lvl: 'error', table: 'file', msg: 'This is not a GSTR-1 JSON file.', fix: 'Download the JSON again from the tool that made it.' }], totals: {}, threeB: null };
    const known = ['gstin', 'fp', 'version', 'hash', 'b2b', 'b2cl', 'b2cs', 'exp', 'nil', 'cdnr', 'cdnur', 'hsn', 'doc_issue', 'supeco', 'at', 'txpd', 'b2ba', 'b2cla', 'b2csa', 'cdnra', 'cdnura', 'expa', 'ata', 'txpda', 'ecom', 'ecoma', 'supecoa'];
    const gstin = String(J.gstin || '').toUpperCase(), st = gstin.slice(0, 2);

    /* header */
    if (!J.gstin) say('error', 'header', 'The GSTIN is missing.', 'Add your 15-character GSTIN.');
    else if (!gstinOk(gstin)) say('error', 'header', `GSTIN ${gstin} is not valid (its last character, the check digit, does not match).`, 'Use the GSTIN exactly as on your registration certificate.');
    let fpMonth = 0, fpYear = 0;
    const fpm = /^(\d{2})(\d{4})$/.exec(String(J.fp || ''));
    if (!fpm || +fpm[1] < 1 || +fpm[1] > 12) say('error', 'header', `Return period "${J.fp || ''}" is not valid. It must be the month and year as MMYYYY, for example 092026.`, 'Pick the return period again.');
    else { fpMonth = +fpm[1]; fpYear = +fpm[2]; }
    const periodEnd = fpYear ? new Date(Date.UTC(fpYear, fpMonth, 0)) : null;
    if (opts.quarterly && fpMonth && fpMonth % 3) say('error', 'header', `A quarterly return is filed for the last month of the quarter, but the period is ${J.fp}.`, 'Use 03, 06, 09 or 12 as the month.');
    if (!J.version) say('warn', 'header', 'The file has no version. The portal’s offline tool writes one (for example GST3.1.6).', 'Add "version": "GST3.1.6".');
    Object.keys(J).forEach((k) => { if (!known.includes(k)) say('warn', 'header', `Unknown section "${k}" in the file. The portal may reject it.`, 'Remove it, or make the file again.'); });

    const T = { b2b: tot(), b2cl: tot(), exp: tot(), b2cs: tot(), nil: tot(), cdnr: tot(), cdnur: tot(), hsnB2B: tot(), hsnB2C: tot(), supeco: tot() };
    const amountsOk = (where, r, keys) => keys.forEach((k) => { if (r[k] != null && (typeof r[k] !== 'number' || !twoDp(r[k]))) say('error', where, `${k} ${JSON.stringify(r[k])} must be a number with at most 2 decimals.`, 'Round amounts to paise.'); });
    const taxMath = (where, label, inter, rt, txval, iamt, camt, samt) => {
      const want = (txval * rt) / 100;
      if (inter) {
        if (camt || samt) say('error', where, `${label}: inter-state, so only IGST is allowed, but CGST/SGST is filled.`, 'Move the tax to IGST.');
        const d = iamt - want;
        if (Math.abs(d) > TOL) say('warn', where, `${label}: IGST ${rs(iamt)} is ${rs(Math.abs(d))} ${d > 0 ? 'more' : 'less'} than ${rt}% of ${rs(txval)} (${rs(want)}).`, 'Check the rate and the taxable value. The portal accepts up to ₹1 of rounding.');
      } else {
        if (iamt) say('error', where, `${label}: within your state, so CGST and SGST are due, but IGST is filled.`, 'Split the tax into CGST and SGST.');
        if (paise(camt) !== paise(samt)) say('error', where, `${label}: CGST ${rs(camt)} and SGST ${rs(samt)} must be equal.`, 'Split the tax in two equal halves.');
        const d = camt + samt - want;
        if (Math.abs(d) > TOL) say('warn', where, `${label}: CGST + SGST ${rs(camt + samt)} is ${rs(Math.abs(d))} ${d > 0 ? 'more' : 'less'} than ${rt}% of ${rs(txval)} (${rs(want)}).`, 'Check the rate and the taxable value.');
      }
    };
    const rateOk = (where, label, rt) => {
      if (!RATES.includes(rt)) say('error', where, `${label}: ${rt}% is not a GST rate.`, 'Use one of ' + RATES.join(', ') + '%.');
      else if (rt === 12 && (fpYear > 2025 || (fpYear === 2025 && fpMonth >= 10))) say('info', where, `${label}: 12% after September 2025. Since 22 Sep 2025 most goods at 12% moved to 5% or 18% (garments: 5% up to ₹2,500 a piece, 18% above).`, 'Check that 12% is still the rate of this product.');
    };
    const posOk = (where, label, pos) => {
      if (OLD_STATES[pos]) { say('error', where, `${label}: state code ${pos} no longer exists. Use ${OLD_STATES[pos]} (${STATES[OLD_STATES[pos]]}).`, 'Change the place of supply code.'); return false; }
      if (!STATES[pos]) { say('error', where, `${label}: "${pos}" is not a state code.`, 'Use the two-digit state code, for example 27 for Maharashtra.'); return false; }
      return true;
    };
    const invSeen = new Map();
    const invCheck = (where, label, inum, idt) => {
      if (!docNoOk(inum)) say('error', where, `${label}: invoice number "${inum}" is not allowed. Use up to 16 letters, numbers, / or -.`, 'Fix the invoice number.');
      const k = String(inum || '').toUpperCase();
      if (invSeen.has(k)) say('error', where, `${label}: invoice number ${inum} is used twice (also in ${invSeen.get(k)}).`, 'Each invoice number can be reported once.');
      else invSeen.set(k, label);
      const d = dateOk(idt);
      if (!d) say('error', where, `${label}: date "${idt}" must be DD-MM-YYYY.`, 'Fix the invoice date.');
      else if (periodEnd && d > periodEnd) say('error', where, `${label}: dated ${idt}, after the return period ends.`, 'Report it in the return for its own month.');
    };

    /* Table 4A: B2B */
    (J.b2b || []).forEach((p, pi) => {
      const ctin = String(p.ctin || '').toUpperCase();
      if (!gstinOk(ctin)) say('error', 'b2b', `Buyer GSTIN ${ctin || '(blank)'} is not valid.`, 'Check the buyer’s GSTIN; a wrong one gives them no credit.');
      if (ctin && ctin === gstin) say('error', 'b2b', 'An invoice is made out to your own GSTIN.', 'Use the buyer’s GSTIN.');
      (p.inv || []).forEach((v) => {
        const label = `B2B invoice ${v.inum || '?'} (${ctin})`;
        invCheck('b2b', label, v.inum, v.idt);
        if (!posOk('b2b', label, v.pos)) return;
        if (!['N', 'Y'].includes(v.rchrg)) say('error', 'b2b', `${label}: reverse charge must be Y or N.`, '');
        if (!['R', 'SEWP', 'SEWOP', 'DE', 'CBW'].includes(v.inv_typ)) say('error', 'b2b', `${label}: invoice type "${v.inv_typ}" is not valid.`, 'Use R for a regular invoice.');
        const inter = v.pos !== st;
        let sum = 0;
        (v.itms || []).forEach((it) => {
          const d = it.itm_det || {};
          amountsOk('b2b', d, ['txval', 'iamt', 'camt', 'samt', 'csamt']);
          rateOk('b2b', label, d.rt);
          if (v.inv_typ === 'R' || !v.inv_typ) taxMath('b2b', label, inter, d.rt, num(d.txval), num(d.iamt), num(d.camt), num(d.samt));
          add(T.b2b, d);
          sum += num(d.txval) + num(d.iamt) + num(d.camt) + num(d.samt) + num(d.csamt);
        });
        if (!(v.itms || []).length) say('error', 'b2b', `${label}: no items.`, '');
        if (num(v.val) + TOL < sum) say('warn', 'b2b', `${label}: invoice value ${rs(v.val)} is less than its value plus tax ${rs(sum)}.`, 'Check the invoice value.');
      });
      void pi;
    });

    /* Table 5: B2C large */
    (J.b2cl || []).forEach((p) => {
      const label0 = `B2C large, ${stateName(p.pos)}`;
      if (!posOk('b2cl', label0, p.pos)) return;
      if (p.pos === st) say('error', 'b2cl', `${label0}: B2C large is only for sales to other states.`, 'Report it in B2C (Table 7).');
      (p.inv || []).forEach((v) => {
        const label = `B2C large invoice ${v.inum || '?'}`;
        invCheck('b2cl', label, v.inum, v.idt);
        if (num(v.val) <= B2CL_LIMIT) say('warn', 'b2cl', `${label}: value ${rs(v.val)} is not above ₹1,00,000, so it belongs in B2C (Table 7).`, 'Move it to Table 7.');
        (v.itms || []).forEach((it) => { const d = it.itm_det || {}; amountsOk('b2cl', d, ['txval', 'iamt', 'csamt']); rateOk('b2cl', label, d.rt); taxMath('b2cl', label, true, d.rt, num(d.txval), num(d.iamt), 0, 0); add(T.b2cl, d); });
      });
    });

    /* Table 6A: exports */
    (J.exp || []).forEach((p) => (p.inv || []).forEach((v) => { invCheck('exp', `Export invoice ${v.inum || '?'}`, v.inum, v.idt); (v.itms || []).forEach((d) => add(T.exp, d)); }));

    /* Table 7: B2C small */
    const b2csKey = new Map();
    let zero = 0, neg = [];
    (J.b2cs || []).forEach((r, i) => {
      const label = `B2C ${stateName(r.pos)} ${r.rt}%` + (r.etin ? ` (${r.etin})` : '');
      amountsOk('b2cs', r, ['txval', 'iamt', 'camt', 'samt', 'csamt']);
      if (!posOk('b2cs', label, r.pos)) return;
      rateOk('b2cs', label, r.rt);
      const inter = r.pos !== st;
      if (r.sply_ty !== (inter ? 'INTER' : 'INTRA')) say('error', 'b2cs', `${label}: supply type is ${r.sply_ty}, but a sale ${inter ? 'to another state is INTER' : 'within your state is INTRA'}.`, `Set sply_ty to ${inter ? 'INTER' : 'INTRA'}.`);
      if (!['OE', 'E'].includes(r.typ)) say('error', 'b2cs', `${label}: type must be OE or E.`, '');
      if (r.typ === 'E' && !gstinOk(r.etin)) say('error', 'b2cs', `${label}: type E needs the e-commerce operator’s GSTIN.`, '');
      if (r.typ === 'OE' && r.etin) say('error', 'b2cs', `${label}: type OE must not have an operator GSTIN.`, 'Use type E, or remove the GSTIN.');
      if (r.rt === 0) say('warn', 'b2cs', `${label}: a 0% line belongs in nil-rated and exempt supplies (Table 8), not Table 7.`, 'Move it to Table 8.');
      taxMath('b2cs', label, inter, r.rt, num(r.txval), num(r.iamt), num(r.camt), num(r.samt));
      const k = [r.pos, r.rt, r.typ, r.etin || ''].join('|');
      if (b2csKey.has(k)) say('error', 'b2cs', `${label}: the same state, rate and type appear twice. The portal takes one line each.`, 'Add the two lines together.');
      b2csKey.set(k, i);
      if (!num(r.txval) && !num(r.iamt) && !num(r.camt) && !num(r.samt)) zero++;
      if (num(r.txval) < 0) neg.push(label);
      add(T.b2cs, r);
    });
    if (zero) say('info', 'b2cs', `${zero} B2C ${zero === 1 ? 'line is' : 'lines are'} all zero (sales and returns cancel out). Harmless, but they can be left out.`, 'The cleaned copy drops them.', { fixable: 'zero' });
    if (neg.length) say('warn', 'b2cs', `Negative B2C lines (returns more than sales this period): ${neg.join(', ')}.`, 'This is how returns of earlier months are netted. Check with your CA before filing.');

    /* Table 8: nil rated, exempt, non-GST */
    (J.nil && J.nil.inv || []).forEach((r) => {
      if (!['INTRB2B', 'INTRAB2B', 'INTRB2C', 'INTRAB2C'].includes(r.sply_ty)) say('error', 'nil', `Nil-rated supply type "${r.sply_ty}" is not valid.`, '');
      T.nil.n++; T.nil.txval += num(r.nil_amt) + num(r.expt_amt) + num(r.ngsup_amt);
    });

    /* Table 9B: credit and debit notes */
    const noteSign = (t) => (t === 'D' ? 1 : -1);
    (J.cdnr || []).forEach((p) => (p.nt || []).forEach((n) => {
      const label = `Credit/debit note ${n.nt_num || '?'}`;
      if (!['C', 'D'].includes(n.ntty)) say('error', 'cdnr', `${label}: note type must be C or D.`, '');
      if (!gstinOk(p.ctin)) say('error', 'cdnr', `${label}: buyer GSTIN ${p.ctin} is not valid.`, '');
      (n.itms || []).forEach((it) => add(T.cdnr, it.itm_det || {}, noteSign(n.ntty)));
    }));
    (J.cdnur || []).forEach((n) => (n.itms || []).forEach((it) => add(T.cdnur, it.itm_det || {}, noteSign(n.ntty))));

    /* Table 12: HSN */
    const hasSupplies = T.b2b.n + T.b2cl.n + T.b2cs.n + T.exp.n + T.nil.n > 0;
    const hsnRows = (list, where, into) => {
      const seen = new Set();
      (list || []).forEach((h) => {
        const code = String(h.hsn_sc || '');
        const label = `HSN ${code || '(blank)'} ${h.rt}%`;
        amountsOk('hsn', h, ['txval', 'iamt', 'camt', 'samt', 'csamt', 'qty']);
        if (!/^\d+$/.test(code) || ![4, 6, 8].includes(code.length)) say('error', 'hsn', `${label}: an HSN code has 4, 6 or 8 digits.`, 'Use the code from the HSN list (the portal now picks it from a list).');
        else if (opts.bigTurnover && code.length < 6 && !code.startsWith('99')) say('error', 'hsn', `${label}: above ₹5 crore turnover, HSN needs 6 digits.`, '');
        if (!UQC.includes(String(h.uqc || ''))) say('error', 'hsn', `${label}: unit "${h.uqc}" is not a GST unit (UQC).`, 'Use PCS for pieces, NOS for numbers, KGS for kilograms.');
        if (code.startsWith('99') && h.uqc !== 'NA') say('warn', 'hsn', `${label}: services (SAC 99) use unit NA and no quantity.`, '');
        if (!code.startsWith('99') && !(num(h.qty) > 0) && num(h.txval) > 0) say('warn', 'hsn', `${label}: quantity is missing.`, 'Add the number of pieces sold.');
        if (num(h.txval) < 0 || num(h.qty) < 0) say('warn', 'hsn', `${label}: negative after returns. The portal may not accept a negative HSN line.`, 'Ask your CA how to report it.');
        rateOk('hsn', label, h.rt);
        const k = code + '|' + h.rt + '|' + h.uqc;
        if (seen.has(k)) say('error', 'hsn', `${label}: the same HSN, rate and unit appear twice in ${where}.`, 'Add them together.');
        seen.add(k);
        add(into, h);
      });
    };
    if (J.hsn) {
      if (Array.isArray(J.hsn.data) && !J.hsn.hsn_b2b && !J.hsn.hsn_b2c) say('error', 'hsn', 'Table 12 is in the old single list. Since 2025 the portal wants it split into B2B and B2C (hsn_b2b and hsn_b2c).', 'Make the file again with a tool that splits it.');
      hsnRows(J.hsn.hsn_b2b, 'B2B', T.hsnB2B);
      hsnRows(J.hsn.hsn_b2c, 'B2C', T.hsnB2C);
      hsnRows(J.hsn.data, 'Table 12', T.hsnB2C);
    } else if (hasSupplies) {
      say('error', 'hsn', 'Table 12 (HSN summary) is missing. It is required, split into B2B and B2C, and the portal checks it against your sales before you file.', 'Make the JSON with PakkaBill from your Meesho reports: it fills Table 12 from the HSN and quantity of every order.', { key: 'nohsn' });
    }
    // Table 12 should add up to the sales reported in the other tables (the portal compares them)
    const b2cWant = T.b2cs.txval + T.b2cl.txval + T.exp.txval + T.cdnur.txval;
    const b2bWant = T.b2b.txval + T.cdnr.txval;
    if (J.hsn && (J.hsn.hsn_b2c || J.hsn.data)) {
      const d = T.hsnB2C.txval - b2cWant;
      if (Math.abs(d) > TOL) say('warn', 'hsn', `Table 12 B2C adds up to ${rs(T.hsnB2C.txval)}, but B2C sales in Tables 5, 6, 7 and 9B are ${rs(b2cWant)} (${rs(Math.abs(d))} ${d > 0 ? 'more' : 'less'}).`, 'Every taxable sale needs an HSN line. Rows without HSN in the marketplace report are the usual cause.', { key: 'hsnb2c' });
    }
    if (J.hsn && J.hsn.hsn_b2b) {
      const d = T.hsnB2B.txval - b2bWant;
      if (Math.abs(d) > TOL) say('warn', 'hsn', `Table 12 B2B adds up to ${rs(T.hsnB2B.txval)}, but B2B sales in Tables 4 and 9B are ${rs(b2bWant)}.`, 'Add the HSN of every B2B invoice line.');
    }

    /* Table 13: documents issued */
    const docs = (J.doc_issue && J.doc_issue.doc_det) || [];
    if (!docs.length && hasSupplies) say('warn', 'doc_issue', 'Table 13 (documents issued) is empty. It is required and lists the invoice and credit note number ranges.', 'Add the tax invoice details report from Meesho.');
    const docTotals = {};
    docs.forEach((d) => {
      const name = DOC_TYPES[d.doc_num];
      if (!name) { say('error', 'doc_issue', `Document type number ${d.doc_num} does not exist (1 to 12).`, ''); return; }
      if (d.doc_typ && d.doc_typ !== name) say('info', 'doc_issue', `Document type ${d.doc_num} is named "${d.doc_typ}"; the portal calls it "${name}".`, 'The cleaned copy uses the portal’s name.', { fixable: 'doctyp' });
      const ranges = [], rr = rangesOf(d.docs);
      (d.docs || []).forEach((x, i) => {
        const label = `${name}, ${x.from} to ${x.to}`;
        if (x.num !== i + 1) say('info', 'doc_issue', `${label}: row number ${x.num} should be ${i + 1}.`, '', { fixable: 'docnum' });
        if (!docNoOk(x.from) || !docNoOk(x.to)) say('error', 'doc_issue', `${label}: a document number has more than 16 characters or a character that is not allowed.`, '');
        if (!(x.totnum >= 0) || !(x.cancel >= 0) || x.cancel > x.totnum) say('error', 'doc_issue', `${label}: cancelled (${x.cancel}) cannot be more than the total (${x.totnum}).`, '');
        if (x.net_issue !== x.totnum - x.cancel) say('error', 'doc_issue', `${label}: net issued ${x.net_issue} must be total ${x.totnum} minus cancelled ${x.cancel}.`, '');
        const r = rr[i];
        if (r) {
          if (r.lo > r.hi) say('error', 'doc_issue', `${label}: the first number is after the last.`, 'Swap From and To.');
          const size = Math.abs(r.hi - r.lo) + 1;
          if (x.totnum > size) say('error', 'doc_issue', `${label}: ${nf(x.totnum)} documents cannot fit in a range of ${nf(size)} numbers.`, 'Check the range and the count.');
          ranges.push({ ...r, i, x, label });
        }
        const t = docTotals[d.doc_num] || (docTotals[d.doc_num] = { name, totnum: 0, cancel: 0, net: 0 });
        t.totnum += num(x.totnum); t.cancel += num(x.cancel); t.net += num(x.net_issue);
      });
      // numbers in the ranges that are not counted, for the whole document type
      const t13 = docTotals[d.doc_num];
      const cov = covered(ranges);
      if (t13 && cov > t13.totnum) say('info', 'doc_issue', `${name}: the ranges cover ${nf(cov)} numbers and ${nf(t13.totnum)} documents are counted, so ${nf(cov - t13.totnum)} numbers are not listed.`, 'Usual with marketplaces: those numbers were cancelled or belong to orders of another period. If any were cancelled in this period, count them under Cancelled.');
      // overlapping ranges of one series
      const over = [];
      ranges.forEach((a, ai) => ranges.forEach((b, bi) => { if (bi > ai && a.prefix === b.prefix && a.lo <= b.hi && b.lo <= a.hi) over.push([a, b]); }));
      if (over.length) {
        const series = [...new Set(over.map(([a]) => a.prefix))];
        say('warn', 'doc_issue', `${name}: ${over.length} ${over.length === 1 ? 'pair of ranges overlaps' : 'pairs of ranges overlap'} (series ${series.join(', ')}). For example ${over[0][0].x.from}–${over[0][0].x.to} and ${over[0][1].x.from}–${over[0][1].x.to}. The same numbers look issued twice.`, 'Report one range per series for the period. The cleaned copy joins them, keeping every count.', { fixable: 'overlap' });
      }
    });

    /* Table 14: supplies through e-commerce operators */
    const eco = (J.supeco && J.supeco.clttx) || [];
    eco.forEach((e) => {
      const label = `Operator ${e.etin}`;
      if (!gstinOk(e.etin)) say('error', 'supeco', `${label}: the GSTIN is not valid.`, '');
      else if (String(e.etin)[13] !== 'C') say('error', 'supeco', `${label}: this is not an e-commerce TCS registration (its 14th character is C for those).`, 'Use the operator’s TCS GSTIN, for example Meesho’s for your state.');
      amountsOk('supeco', e, ['suppval', 'igst', 'cgst', 'sgst', 'cess']);
      if (paise(e.cgst) !== paise(e.sgst)) say('error', 'supeco', `${label}: CGST and SGST must be equal.`, '');
      T.supeco.n++; T.supeco.txval += num(e.suppval); T.supeco.iamt += num(e.igst); T.supeco.camt += num(e.cgst); T.supeco.samt += num(e.sgst);
    });
    if (eco.length) {
      // with type E rows, each operator's Table 7 lines must match its Table 14 line; otherwise Table 14 cannot be more than all sales
      const byE = {};
      (J.b2cs || []).filter((r) => r.typ === 'E').forEach((r) => { const t = byE[r.etin] || (byE[r.etin] = tot()); add(t, r); });
      if (Object.keys(byE).length) {
        eco.forEach((e) => { const t = byE[e.etin]; if (t && Math.abs(t.txval - num(e.suppval)) > TOL) say('warn', 'supeco', `Operator ${e.etin}: Table 14 shows ${rs(e.suppval)} but its Table 7 lines add up to ${rs(t.txval)}.`, 'They should match.'); });
      } else {
        const all = T.b2cs.txval + T.b2b.txval + T.b2cl.txval;
        const d = T.supeco.txval - all;
        if (d > TOL) say('warn', 'supeco', `Table 14 (${rs(T.supeco.txval)}) is more than all the sales in Tables 4, 5 and 7 (${rs(all)}).`, 'Sales through an operator are part of your sales, so Table 14 cannot be bigger.');
        else if (Math.abs(d) <= TOL) say('ok', 'supeco', `Table 14 matches Table 7${T.b2b.n || T.b2cl.n ? ', 4 and 5' : ''} (every sale went through the operator).`, '');
        const tx = T.supeco.iamt - T.b2cs.iamt - T.b2b.iamt - T.b2cl.iamt;
        if (Math.abs(d) <= TOL && Math.abs(tx) > TOL) say('warn', 'supeco', `Table 14 IGST ${rs(T.supeco.iamt)} differs from Table 7 IGST by ${rs(Math.abs(tx))}.`, 'Check both.');
      }
    } else if (opts.marketplace) say('warn', 'supeco', 'Table 14 is empty, but you sell through a marketplace that collects TCS.', 'Add the operator’s GSTIN and your sales through it.');

    /* what goes into GSTR-3B */
    const out = roundTot([T.b2b, T.b2cl, T.b2cs, T.exp, T.cdnr, T.cdnur].reduce((a, t) => ({ n: a.n + t.n, txval: a.txval + t.txval, iamt: a.iamt + t.iamt, camt: a.camt + t.camt, samt: a.samt + t.samt, csamt: a.csamt + t.csamt }), tot()));
    const unreg = {};
    (J.b2cs || []).filter((r) => r.pos !== st).forEach((r) => { const u = unreg[r.pos] || (unreg[r.pos] = { txval: 0, iamt: 0 }); u.txval += num(r.txval); u.iamt += num(r.iamt); });
    (J.b2cl || []).forEach((p) => (p.inv || []).forEach((v) => (v.itms || []).forEach((it) => { const u = unreg[p.pos] || (unreg[p.pos] = { txval: 0, iamt: 0 }); u.txval += num(it.itm_det.txval); u.iamt += num(it.itm_det.iamt); })));
    const threeB = {
      a31: out,
      a32: Object.entries(unreg).map(([pos, u]) => ({ pos, name: stateName(pos), txval: r2(u.txval), iamt: r2(u.iamt) })).filter((u) => u.txval || u.iamt).sort((a, b) => a.pos.localeCompare(b.pos)),
      nil: r2(T.nil.txval),
    };

    const totals = {};
    Object.keys(T).forEach((k) => { if (T[k].n) totals[k] = roundTot(T[k]); });
    const errors = issues.filter((x) => x.lvl === 'error').length, warns = issues.filter((x) => x.lvl === 'warn').length;
    return { ok: !errors, errors, warns, issues, totals, threeB, docs: docTotals, gstin, fp: String(J.fp || '') };
  }

  // Safe fixes only: never an amount. Returns { json, changes }.
  function clean(json) {
    const J = JSON.parse(JSON.stringify(json || {}));
    const changes = [];
    if (Array.isArray(J.b2cs)) {
      const before = J.b2cs.length;
      J.b2cs = J.b2cs.filter((r) => num(r.txval) || num(r.iamt) || num(r.camt) || num(r.samt) || num(r.csamt));
      if (J.b2cs.length < before) changes.push(`Dropped ${before - J.b2cs.length} all-zero B2C ${before - J.b2cs.length === 1 ? 'line' : 'lines'}.`);
    }
    const docs = J.doc_issue && J.doc_issue.doc_det;
    if (Array.isArray(docs)) {
      docs.forEach((d) => {
        const name = DOC_TYPES[d.doc_num];
        if (name && d.doc_typ !== name) { changes.push(`Named document type ${d.doc_num} "${name}".`); d.doc_typ = name; }
        const rr = rangesOf(d.docs);
        const list = (d.docs || []).map((x, i) => ({ x, r: rr[i] }));
        // join overlapping or touching ranges of the same series; counts add up, as each document is in one range only
        const keep = [];
        list.forEach((it) => {
          if (!it.r) { keep.push(it); return; }
          const hit = keep.find((k) => k.r && k.r.prefix === it.r.prefix && it.r.lo <= k.r.hi + 1 && k.r.lo <= it.r.hi + 1);
          if (!hit) { keep.push({ x: { ...it.x }, r: { ...it.r }, joined: 1 }); return; }
          if (it.r.lo < hit.r.lo) { hit.r.lo = it.r.lo; hit.x.from = it.x.from; }
          if (it.r.hi > hit.r.hi) { hit.r.hi = it.r.hi; hit.x.to = it.x.to; }
          hit.x.totnum += num(it.x.totnum); hit.x.cancel += num(it.x.cancel); hit.joined++;
        });
        // a join can make two kept ranges touch: repeat until stable
        for (let again = true; again;) {
          again = false;
          for (let a = 0; a < keep.length && !again; a++) for (let b = a + 1; b < keep.length && !again; b++) {
            const A = keep[a], B = keep[b];
            if (A.r && B.r && A.r.prefix === B.r.prefix && B.r.lo <= A.r.hi + 1 && A.r.lo <= B.r.hi + 1) {
              if (B.r.lo < A.r.lo) { A.r.lo = B.r.lo; A.x.from = B.x.from; }
              if (B.r.hi > A.r.hi) { A.r.hi = B.r.hi; A.x.to = B.x.to; }
              A.x.totnum += num(B.x.totnum); A.x.cancel += num(B.x.cancel); A.joined = (A.joined || 1) + (B.joined || 1);
              keep.splice(b, 1); again = true;
            }
          }
        }
        const joined = keep.filter((k) => k.joined > 1);
        joined.forEach((k) => {
          const size = k.r.hi - k.r.lo + 1;
          if (k.x.totnum > size) { k.x.totnum = size; } // never more documents than numbers
          changes.push(`${name || 'Documents'}: joined ${k.joined} ranges into ${k.x.from} to ${k.x.to} (${nf(k.x.totnum)} documents).`);
        });
        d.docs = keep.map((k, i) => ({ ...k.x, num: i + 1, net_issue: k.x.totnum - k.x.cancel }));
      });
    }
    return { json: J, changes };
  }

  // Two files side by side: totals per table, B2C per state and rate, HSN, documents, Table 14.
  function compare(a, b) {
    const A = check(a), B = check(b);
    const rows = [];
    const push = (group, label, x, y, unit) => { const d = r2(num(y) - num(x)); rows.push({ group, label, a: x == null ? null : r2(num(x)), b: y == null ? null : r2(num(y)), diff: d, same: Math.abs(d) < 0.005, unit: unit || 'rs' }); };
    const tabs = [['b2b', 'B2B (Table 4)'], ['b2cl', 'B2C large (Table 5)'], ['exp', 'Exports (Table 6)'], ['b2cs', 'B2C (Table 7)'], ['nil', 'Nil and exempt (Table 8)'], ['cdnr', 'Credit/debit notes, B2B (9B)'], ['cdnur', 'Credit/debit notes, B2C (9B)'], ['hsnB2B', 'HSN B2B (Table 12)'], ['hsnB2C', 'HSN B2C (Table 12)'], ['supeco', 'E-commerce (Table 14)']];
    tabs.forEach(([k, l]) => {
      const x = A.totals[k], y = B.totals[k];
      if (!x && !y) return;
      push('Totals', l + ': taxable value', x ? x.txval : 0, y ? y.txval : 0);
      push('Totals', l + ': tax', x ? x.tax : 0, y ? y.tax : 0);
    });
    const per = (J) => { const m = new Map(); (J.b2cs || []).forEach((r) => { const k = r.pos + '|' + r.rt; const t = m.get(k) || { txval: 0, tax: 0 }; t.txval += num(r.txval); t.tax += num(r.iamt) + num(r.camt) + num(r.samt); m.set(k, t); }); return m; };
    const pa = per(a || {}), pb = per(b || {});
    [...new Set([...pa.keys(), ...pb.keys()])].sort().forEach((k) => {
      const [pos, rt] = k.split('|'), x = pa.get(k), y = pb.get(k);
      push('B2C by state', `${stateName(pos)} ${rt}%: taxable value`, x ? x.txval : null, y ? y.txval : null);
      push('B2C by state', `${stateName(pos)} ${rt}%: tax`, x ? x.tax : null, y ? y.tax : null);
    });
    const hs = (J) => { const m = new Map(); const h = (J && J.hsn) || {}; [...(h.hsn_b2b || []).map((r) => ['B2B', r]), ...(h.hsn_b2c || []).map((r) => ['B2C', r]), ...(h.data || []).map((r) => ['', r])].forEach(([t, r]) => { const k = `${t} ${r.hsn_sc} ${r.rt}%`.trim(); const v = m.get(k) || { txval: 0, qty: 0 }; v.txval += num(r.txval); v.qty += num(r.qty); m.set(k, v); }); return m; };
    const ha = hs(a), hb = hs(b);
    [...new Set([...ha.keys(), ...hb.keys()])].sort().forEach((k) => {
      const x = ha.get(k), y = hb.get(k);
      push('HSN (Table 12)', `HSN ${k}: taxable value`, x ? x.txval : null, y ? y.txval : null);
      push('HSN (Table 12)', `HSN ${k}: quantity`, x ? x.qty : null, y ? y.qty : null, 'n');
    });
    [...new Set([...Object.keys(A.docs), ...Object.keys(B.docs)])].forEach((k) => {
      const x = A.docs[k], y = B.docs[k];
      push('Documents (Table 13)', `${(x || y).name}: issued`, x ? x.totnum : null, y ? y.totnum : null, 'n');
      push('Documents (Table 13)', `${(x || y).name}: cancelled`, x ? x.cancel : null, y ? y.cancel : null, 'n');
    });
    return { a: A, b: B, rows, differ: rows.filter((r) => !r.same) };
  }

  function rs(v) {
    const n = num(v), neg = n < 0, a = Math.abs(n);
    const [i, f] = a.toFixed(2).split('.');
    const last3 = i.slice(-3), rest = i.slice(0, -3);
    const grp = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
    return (neg ? '−' : '') + '₹' + grp + (f === '00' ? '' : '.' + f);
  }

  root.PBG1 = { check, clean, compare, gstinOk, gstinCheckChar, splitSeries, rangeOf, rangesOf, covered, parseDocNo, STATES, RATES, UQC, DOC_TYPES, TABLES, rs };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PBG1;
  if (typeof document === 'undefined') return;

  /* ======================================================= screen */

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STYLE = `
.g1c{margin-top:18px;padding:18px 20px 20px;min-width:0}
.g1c h2{font-family:var(--font-display);font-weight:500;font-size:24px;margin:0 0 4px;line-height:1.1}
.g1c .g1c-sub{margin:0 0 14px;color:var(--ink-2);font-size:14px}
.g1c-pick{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}
.g1c-pick label{display:inline-flex;align-items:center;gap:8px;cursor:pointer;border:1.5px dashed var(--rule);border-radius:10px;padding:10px 14px;font-weight:600;font-size:14px;background:var(--desk)}
.g1c-pick label:hover{border-color:var(--carbon)}
.g1c-pick input{position:absolute;opacity:0;width:1px;height:1px}
.g1c-card{border:1px solid var(--rule-soft);border-radius:10px;padding:14px;margin:12px 0 0;min-width:0}
.g1c-head{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin:0 0 8px}
.g1c-head b{font-size:16px;min-width:0;overflow-wrap:anywhere}
.g1c-card .fine-inline{overflow-wrap:anywhere}
.g1c-badge{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;padding:3px 10px;border-radius:999px}
.g1c-badge.ok{background:var(--green-soft);color:var(--green)}
.g1c-badge.bad{background:var(--red-soft);color:var(--red)}
.g1c-badge.warn{background:color-mix(in srgb,var(--amber,#d97706) 18%,transparent);color:var(--amber,#b45309)}
.g1c-list{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:8px}
.g1c-list li{display:grid;grid-template-columns:22px 1fr;gap:8px;font-size:14px;line-height:1.45;min-width:0}
.g1c-list .ic{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:800;color:#fff;margin-top:1px}
.g1c-list .error .ic{background:var(--red)} .g1c-list .warn .ic{background:var(--amber,#d97706)} .g1c-list .info .ic{background:var(--ink-3)} .g1c-list .ok .ic{background:var(--green)}
.g1c-list .t{min-width:0;overflow-wrap:anywhere}
.g1c-list small{display:block;color:var(--ink-2);font-size:13px}
.g1c-tab{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-3);margin-right:6px}
.g1c .table-wrap{overflow-x:auto;margin-top:8px}
.g1c .rtable td{padding:6px 8px;text-align:right;border-bottom:1px solid var(--rule-soft);font-size:13.5px;white-space:nowrap}
.g1c .rtable td.l,.g1c .rtable th.l{text-align:left;white-space:normal}
.g1c .rtable tr.dif td{background:var(--red-soft)}
.g1c-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.g1c-acts button{font:600 14px/1 inherit;padding:10px 14px;border-radius:10px;border:1.5px solid var(--rule);background:var(--paper);color:var(--ink);cursor:pointer}
.g1c-acts button.pri{background:var(--carbon);border-color:var(--carbon);color:var(--btn-fg,#fff)}
.g1c details{margin-top:10px} .g1c summary{cursor:pointer;font-weight:600;font-size:14px}
.g1c-err{color:var(--red);font-size:14px;margin:8px 0 0}
@media (max-width:560px){.g1c{padding:14px}.g1c h2{font-size:21px}}`;

  function loadStyle() {
    if (document.getElementById('g1c-style')) return;
    const s = document.createElement('style'); s.id = 'g1c-style'; s.textContent = STYLE; document.head.appendChild(s);
  }
  const ICON = { error: '!', warn: '!', info: 'i', ok: '✓' };
  const TABNAME = { header: 'File', b2b: 'Table 4', b2cl: 'Table 5', exp: 'Table 6', b2cs: 'Table 7', nil: 'Table 8', cdnr: 'Table 9B', cdnur: 'Table 9B', hsn: 'Table 12', doc_issue: 'Table 13', supeco: 'Table 14', file: 'File' };

  function reportHtml(title, R, opts) {
    const order = { error: 0, warn: 1, info: 2, ok: 3 };
    const list = R.issues.slice().sort((a, b) => order[a.lvl] - order[b.lvl]);
    const badge = R.errors ? `<span class="g1c-badge bad">${R.errors} ${R.errors === 1 ? 'problem' : 'problems'} to fix</span>` : R.warns ? `<span class="g1c-badge warn">Ready, ${R.warns} to check</span>` : '<span class="g1c-badge ok">✓ Ready to upload</span>';
    const t = R.totals, rowsT = [['b2b', 'B2B (Table 4)'], ['b2cl', 'B2C large (Table 5)'], ['exp', 'Exports (Table 6)'], ['b2cs', 'B2C (Table 7)'], ['nil', 'Nil and exempt (Table 8)'], ['cdnr', 'Notes, B2B (9B)'], ['cdnur', 'Notes, B2C (9B)'], ['hsnB2B', 'HSN B2B (Table 12)'], ['hsnB2C', 'HSN B2C (Table 12)'], ['supeco', 'E-commerce (Table 14)']].filter(([k]) => t[k]);
    const tt = rowsT.map(([k, l]) => `<tr><td class="l">${l}</td><td>${t[k].n}</td><td>${rs(t[k].txval)}</td><td>${rs(t[k].iamt)}</td><td>${rs(t[k].camt)}</td><td>${rs(t[k].samt)}</td></tr>`).join('');
    const b3 = R.threeB;
    const docRows = Object.values(R.docs).map((d) => `<tr><td class="l">${esc(d.name)}</td><td>${nf(d.totnum)}</td><td>${nf(d.cancel)}</td><td>${nf(d.net)}</td></tr>`).join('');
    return `<div class="g1c-card"><div class="g1c-head"><b>${esc(title)}</b>${badge}<span class="fine-inline">${esc(R.gstin)} · ${esc(R.fp.slice(0, 2))}/${esc(R.fp.slice(2))}</span></div>
      <ul class="g1c-list">${list.length ? list.map((x) => `<li class="${x.lvl}"><span class="ic" aria-hidden="true">${ICON[x.lvl]}</span><span class="t"><span class="g1c-tab">${TABNAME[x.table] || ''}</span>${esc(x.msg)}${x.fix ? `<small>${esc(x.fix)}</small>` : ''}</span></li>`).join('') : '<li class="ok"><span class="ic">✓</span><span class="t">Every check passed.</span></li>'}</ul>
      ${tt ? `<details${opts && opts.open ? ' open' : ''}><summary>Totals by table</summary><div class="table-wrap"><table class="rtable"><thead><tr><th class="l">Table</th><th>Lines</th><th>Taxable value</th><th>IGST</th><th>CGST</th><th>SGST</th></tr></thead><tbody>${tt}</tbody></table></div></details>` : ''}
      ${docRows ? `<details><summary>Documents issued (Table 13)</summary><div class="table-wrap"><table class="rtable"><thead><tr><th class="l">Document</th><th>Total</th><th>Cancelled</th><th>Net issued</th></tr></thead><tbody>${docRows}</tbody></table></div></details>` : ''}
      ${b3 && b3.a31.n ? `<details><summary>What goes into GSTR-3B</summary><p class="fine">3.1(a) outward taxable supplies: taxable ${rs(b3.a31.txval)}, IGST ${rs(b3.a31.iamt)}, CGST ${rs(b3.a31.camt)}, SGST ${rs(b3.a31.samt)}.${b3.nil ? ` 3.1(c) nil and exempt: ${rs(b3.nil)}.` : ''}</p>${b3.a32.length ? `<div class="table-wrap"><table class="rtable"><thead><tr><th class="l">3.2 sales to unregistered buyers in other states</th><th>Taxable value</th><th>IGST</th></tr></thead><tbody>${b3.a32.map((u) => `<tr><td class="l">${u.pos} ${esc(u.name)}</td><td>${rs(u.txval)}</td><td>${rs(u.iamt)}</td></tr>`).join('')}</tbody></table></div>` : ''}<p class="fine">GSTR-3B fills this in from GSTR-1 after you file. Check it there before paying.</p></details>` : ''}
    </div>`;
  }

  function compareHtml(C, la, lb) {
    if (!C.rows.length) return '';
    const fmt = (v, u) => (v == null ? '—' : u === 'n' ? nf(v) : rs(v));
    const diffs = C.differ;
    const body = C.rows.filter((r) => !r.same || r.group === 'Totals').map((r) => `<tr class="${r.same ? '' : 'dif'}"><td class="l">${esc(r.label)}</td><td>${fmt(r.a, r.unit)}</td><td>${fmt(r.b, r.unit)}</td><td>${r.same ? '✓' : (r.diff > 0 ? '+' : '') + fmt(r.diff, r.unit)}</td></tr>`).join('');
    return `<div class="g1c-card"><div class="g1c-head"><b>${esc(la)} vs ${esc(lb)}</b>${diffs.length ? `<span class="g1c-badge warn">${diffs.length} ${diffs.length === 1 ? 'difference' : 'differences'}</span>` : '<span class="g1c-badge ok">✓ Same numbers</span>'}</div>
      <p class="fine">Totals of every table, then only the lines that differ (B2C by state and rate, HSN, documents).</p>
      <div class="table-wrap"><table class="rtable"><thead><tr><th class="l">Line</th><th>${esc(la)}</th><th>${esc(lb)}</th><th>Difference</th></tr></thead><tbody>${body}</tbody></table></div></div>`;
  }

  function save(name, json) {
    const blob = new Blob([JSON.stringify(json)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // el: an empty element on the GSTR-1 page; own: the JSON this page made (or null). Called on every render.
  function mount(el, own) {
    loadStyle();
    const S = el.__g1c || (el.__g1c = { files: [], own: null, ownKey: '' });
    const ownKey = own ? JSON.stringify(own) : '';
    if (el.__g1cDone && ownKey === S.ownKey) return;
    S.own = own || null; S.ownKey = ownKey; el.__g1cDone = true;
    draw(el, S);
  }

  function draw(el, S) {
    let h = `<section class="paper g1c" aria-labelledby="g1c-h"><h2 id="g1c-h">Check before you upload</h2>
      <p class="g1c-sub">Every rule the GST portal checks, and the ones a careful CA checks: GSTINs, tax from rate and value, state codes, Table 12 against your sales, document ranges, Table 14 against Table 7. Add a JSON from any tool to check it, or two to compare them.</p>
      <div class="g1c-pick"><label><input type="file" accept=".json,application/json" multiple data-g1c-file>📄 Add GSTR-1 JSON files</label>${S.files.length ? '<button type="button" class="text-link" data-g1c-clear>Clear</button>' : ''}</div>
      ${S.err ? `<p class="g1c-err" role="alert">${esc(S.err)}</p>` : ''}`;
    const all = [];
    if (S.own) all.push({ name: 'PakkaBill’s JSON (this page)', json: S.own, own: true });
    S.files.forEach((f) => all.push(f));
    all.forEach((f, i) => {
      const R = check(f.json, { marketplace: true });
      f.R = R;
      h += reportHtml(f.name, R, { open: !f.own });
      const C = clean(f.json);
      if (!f.own && C.changes.length) h += `<div class="g1c-acts"><button type="button" data-g1c-clean="${i}">Download cleaned copy</button><span class="fine-inline">${esc(C.changes.join(' '))} Amounts are not changed.</span></div>`;
    });
    if (all.length >= 2) {
      for (let i = 1; i < all.length; i++) h += compareHtml(compare(all[0].json, all[i].json), short(all[0].name), short(all[i].name));
    }
    if (!all.length) h += '<p class="fine">Add your marketplace reports above to make the JSON, or add a JSON file here to check it.</p>';
    h += '</section>';
    el.innerHTML = h;
    const inp = el.querySelector('[data-g1c-file]');
    inp.addEventListener('change', async () => {
      S.err = '';
      for (const file of [...inp.files]) {
        try {
          const json = JSON.parse(await file.text());
          if (!json || typeof json !== 'object' || !('gstin' in json) || !('fp' in json)) throw new Error('not');
          S.files.push({ name: file.name, json });
        } catch (e) { S.err = `${file.name} is not a GSTR-1 JSON file.`; }
      }
      draw(el, S);
    });
    const clr = el.querySelector('[data-g1c-clear]');
    if (clr) clr.addEventListener('click', () => { S.files = []; S.err = ''; draw(el, S); });
    el.querySelectorAll('[data-g1c-clean]').forEach((b) => b.addEventListener('click', () => {
      const f = all[+b.dataset.g1cClean];
      save(f.name.replace(/\.json$/i, '') + '_checked.json', clean(f.json).json);
    }));
  }
  const short = (n) => (n.length > 34 ? n.slice(0, 31) + '…' : n);

  root.pbGstr1CheckMount = mount;
})();
