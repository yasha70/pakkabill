// PakkaBill Lens shipping sync, inside Meesho's supplier panel page (runs in the page itself, before
// Meesho's own code, so it can see the requests the page sends). It keeps the page's last requests in
// memory only (nothing is saved or sent anywhere), learns from them how Meesho uploads a catalogue photo
// and works out its shipping, and on the PakkaBill panel's request sends those same requests for another
// photo and category from this tab: the shipping read back is Meesho's own answer.
// Talks to the PakkaBill panel (ship.js) with window messages marked pbsh. Logic: shipcore.js.
(() => {
  if (window.__pbShipHook) return;
  window.__pbShipHook = true;
  const C = window.PBShipSync;
  if (!C) return;
  const ofetch = window.fetch;
  const X = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  const xOpen = X && X.open, xSend = X && X.send, xHeader = X && X.setRequestHeader;
  const calls = []; // { via, method, url, headers, credentials, withCredentials, body, raw, status, resJson, file, t }
  const MAX = 90;
  const lastHeaders = {}; // host -> the latest headers the page itself sent there (tokens refresh)
  let tpl = null, learned = null, cats = new Map(), catsSent = 0, quietT = 0;
  let shown = null; // the latest ₹ the panel read on Meesho's page: Meesho's reply often lands after it

  const post = (m) => window.postMessage({ pbsh: 1, to: 'panel', ...m }, location.origin);
  const hostOf = (u) => { try { return new URL(u, location.href).host; } catch (e) { return ''; } };
  const STATIC = /\.(js|mjs|css|png|jpe?g|webp|gif|svg|woff2?|ttf|ico|map)(\?|$)/i;
  const isFile = (v) => typeof Blob !== 'undefined' && v instanceof Blob && (/^image\//.test(v.type) || v.size > 20000);

  function headerObj(h) {
    const o = {};
    if (!h) return o;
    try {
      if (typeof Headers !== 'undefined' && h instanceof Headers) h.forEach((v, k) => { o[k.toLowerCase()] = v; });
      else if (Array.isArray(h)) h.forEach(([k, v]) => { o[String(k).toLowerCase()] = String(v); });
      else Object.keys(h).forEach((k) => { o[k.toLowerCase()] = String(h[k]); });
    } catch (e) { /* odd headers: none */ }
    return o;
  }
  // What a body is (for the logic) and the body itself (kept here, to send again).
  function describe(body, headers) {
    if (body == null) return { body: { kind: 'none' }, raw: null, file: null };
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      const entries = [], raw = [];
      let file = null;
      body.forEach((v, k) => {
        raw.push([k, v]);
        if (typeof v === 'string') entries.push([k, v]);
        else { entries.push([k, { file: true, name: v.name || '', type: v.type || '', size: v.size }]); if (isFile(v)) file = v; }
      });
      return { body: { kind: 'form', entries }, raw, file };
    }
    if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return { body: { kind: 'urlenc', text: body.toString() }, raw: null, file: null };
    if (typeof body === 'string') {
      const ct = headers['content-type'] || '';
      const kind = C.parseJson(body) != null ? 'json' : /x-www-form-urlencoded/i.test(ct) || /^[\w.%-]+=[^&]*(&[\w.%-]+=[^&]*)*$/.test(body) ? 'urlenc' : 'text';
      return { body: { kind, text: body }, raw: null, file: null };
    }
    if (typeof Blob !== 'undefined' && body instanceof Blob) return { body: { kind: 'blob', type: body.type, size: body.size }, raw: body, file: isFile(body) ? body : null };
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) { const b = new Blob([body]); return { body: { kind: 'blob', type: '', size: b.size }, raw: b, file: b.size > 20000 ? b : null }; }
    return { body: { kind: 'none' }, raw: null, file: null };
  }
  function record(c) {
    // PakkaBill's own requests go straight to the browser's fetch / XMLHttpRequest, so only Meesho's are seen here
    if (!c.url || /^(data|blob|chrome-extension):/i.test(c.url)) return null;
    if (c.method === 'GET' && STATIC.test(c.url)) return null;
    c.t = Date.now();
    calls.push(c);
    if (calls.length > MAX) calls.splice(0, calls.length - MAX);
    const h = hostOf(c.url);
    if (h) lastHeaders[h] = { ...(lastHeaders[h] || {}), ...c.headers };
    return c;
  }
  function answered(c, status, text) {
    c.status = status;
    c.resJson = C.parseJson(text && text.length < 3e6 ? text : '');
    if (c.resJson != null) {
      const found = C.categoriesIn(c.resJson, c.url);
      if (found.length) { found.forEach((x) => cats.set(x.id, x)); clearTimeout(catsSent); catsSent = setTimeout(() => post({ type: 'cats', list: [...cats.values()].slice(0, 4000) }), 400); }
    }
    const fi = lastFileIdx();
    if (fi >= 0 && c.t >= calls[fi].t) { clearTimeout(quietT); quietT = setTimeout(() => learn(null, true), 60); }
  }

  /* ---------- watching the page's own requests ---------- */

  if (ofetch) {
    window.fetch = function (input, init) {
      let c = null;
      try {
        const req = typeof Request !== 'undefined' && input instanceof Request ? input : null;
        const url = req ? req.url : String((input && input.url) || input);
        const method = String((init && init.method) || (req && req.method) || 'GET').toUpperCase();
        const headers = { ...headerObj(req && req.headers), ...headerObj(init && init.headers) };
        const d = describe(init && 'body' in init ? init.body : null, headers);
        c = record({ via: 'fetch', method, url, headers, credentials: (init && init.credentials) || (req && req.credentials) || 'same-origin', body: d.body, raw: d.raw, file: d.file });
      } catch (e) { c = null; }
      const p = ofetch.apply(this, arguments);
      if (c) p.then((res) => { const ct = res.headers.get('content-type') || ''; if (/json|text/i.test(ct) || !ct) res.clone().text().then((t) => answered(c, res.status, t)).catch(() => answered(c, res.status, '')); else answered(c, res.status, ''); }).catch(() => answered(c, 0, ''));
      return p;
    };
  }
  if (X) {
    X.open = function (method, url) { this.__pb = { via: 'xhr', method: String(method || 'GET').toUpperCase(), url: String(url), headers: {} }; return xOpen.apply(this, arguments); };
    X.setRequestHeader = function (k, v) { if (this.__pb) this.__pb.headers[String(k).toLowerCase()] = String(v); return xHeader.apply(this, arguments); };
    X.send = function (body) {
      const m = this.__pb;
      if (m) {
        try {
          const d = describe(body, m.headers);
          const c = record({ ...m, url: new URL(m.url, location.href).href, withCredentials: this.withCredentials, body: d.body, raw: d.raw, file: d.file });
          if (c) this.addEventListener('loadend', () => { let t = ''; try { t = this.responseType === '' || this.responseType === 'text' ? this.responseText : this.responseType === 'json' ? JSON.stringify(this.response) : ''; } catch (e) { t = ''; } answered(c, this.status, t); });
        } catch (e) { /* never get in the page's way */ }
      }
      return xSend.apply(this, arguments);
    };
  }

  /* ---------- learning from the seller's own upload ---------- */

  const lastFileIdx = () => { for (let i = calls.length - 1; i >= 0; i--) if (calls[i].file) return i; return -1; };
  // displayed: the ₹ Meesho shows on the page (from the panel), or null: then Meesho's latest answer after
  // the upload. quiet: no message when nothing changed.
  function learn(displayed, quiet) {
    const fi = lastFileIdx();
    if (fi < 0) { if (!quiet) post({ type: 'status', learned: false, why: 'nofile' }); return; }
    // a quiet look (a reply came in) prefers the answer that matches what the page shows
    const ship = (quiet && shown != null && C.findShipping(calls, fi, shown)) || C.findShipping(calls, fi, displayed);
    if (!ship) { if (!quiet) post({ type: 'status', learned: false, why: displayed != null ? 'noanswer' : 'waiting' }); return; }
    const p = C.plan(calls, fi, ship);
    if (p.error) { post({ type: 'status', learned: false, why: p.error, report: C.report(calls, p) }); return; }
    const snap = p.steps.map((i) => calls[i]);
    const want = displayed != null ? displayed : shown;
    const confirmed = want != null && Math.abs(want - ship.n) < 0.51;
    const was = tpl, wasOk = !!(learned && learned.confirmed);
    tpl = { calls: snap, fileAt: p.steps.indexOf(p.fileIdx), shipAt: p.steps.indexOf(p.shipIdx), shipPath: p.shipPath, cat: p.cat, n: ship.n, key: ship.key };
    learned = { n: ship.n, confirmed: confirmed || !!(learned && learned.confirmed && learned.n === ship.n && learned.fileT === calls[fi].t), fileT: calls[fi].t };
    if (quiet && was && was.n === tpl.n && was.calls.length === tpl.calls.length && wasOk === learned.confirmed) return;
    const catName = p.cat && cats.get(p.cat.value) ? cats.get(p.cat.value).name : null;
    post({ type: 'status', learned: true, confirmed: learned.confirmed, ship: ship.n, key: ship.key, steps: snap.length, cat: p.cat ? { id: p.cat.value, name: catName } : null, report: C.report(calls, p) });
  }

  /* ---------- sending the same requests for another photo ---------- */

  const FRESH = /request[-_]?id|trace|nonce|correlation|x-amzn|timestamp/i;
  const SKIP = /^(content-length|content-type|host|cookie|origin|referer|user-agent|accept-encoding|connection)$/i;
  function freshValue(v) {
    if (/^\d{10,13}$/.test(v)) return String(v.length === 13 ? Date.now() : Math.floor(Date.now() / 1000));
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) && crypto.randomUUID) return crypto.randomUUID();
    return v;
  }
  function headersFor(c, isForm) {
    const h = {}, latest = lastHeaders[hostOf(c.url)] || {};
    Object.keys(c.headers || {}).forEach((k) => {
      if (SKIP.test(k) && !(k === 'content-type' && !isForm)) return;
      let v = k in latest && !/content-type/i.test(k) ? latest[k] : c.headers[k];
      if (FRESH.test(k)) v = freshValue(v);
      h[k] = v;
    });
    return h;
  }
  function bodyFor(c, swapped, file) {
    const b = swapped;
    if (b.kind === 'json' || b.kind === 'text' || b.kind === 'urlenc') return b.text;
    if (b.kind === 'blob') return c.file && file ? file : c.raw;
    if (b.kind === 'form') {
      const fd = new FormData();
      (c.raw || []).forEach(([k, v], i) => {
        const e = b.entries[i];
        if (typeof v === 'string') fd.append(k, typeof e[1] === 'string' ? e[1] : v);
        else if (v === c.file && file) fd.append(k, file, file.name);
        else fd.append(k, v, v.name);
      });
      return fd;
    }
    return undefined;
  }
  async function send(c, url, body) {
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const headers = headersFor(c, isForm);
    if (c.via === 'xhr') {
      return new Promise((resolve) => {
        const x = new XMLHttpRequest();
        xOpen.call(x, c.method, url, true);
        x.withCredentials = !!c.withCredentials;
        Object.keys(headers).forEach((k) => { try { xHeader.call(x, k, headers[k]); } catch (e) { /* forbidden header */ } });
        x.onloadend = () => resolve({ status: x.status, text: x.responseType === '' || x.responseType === 'text' ? x.responseText : '' });
        xSend.call(x, c.method === 'GET' || c.method === 'HEAD' ? null : body);
      });
    }
    const res = await ofetch.call(window, url, { method: c.method, headers, body: c.method === 'GET' || c.method === 'HEAD' ? undefined : body, credentials: c.credentials || 'same-origin' });
    return { status: res.status, text: await res.text().catch(() => '') };
  }
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));

  // file: the new photo (null: the seller's own photo again, to check PakkaBill gets Meesho's number).
  // cats: [{ key, id }] (id null: the category the seller picked in Meesho). -> { values, errors }
  async function run(file, catList) {
    if (!tpl) throw new Error('notlearned');
    const T = tpl, own = T.calls[T.fileAt].file;
    const f = file ? new File([file], (own && own.name) || 'photo.jpg', { type: (own && own.type) || 'image/jpeg', lastModified: Date.now() }) : null;
    const map = new Map();
    if (f && own && own.size) map.set(String(own.size), f.size);
    const values = {}, errors = {};
    try {
      // everything up to the shipping request, once
      for (let i = 0; i < T.shipAt; i++) {
        const c = T.calls[i];
        const sw = C.swapBody(c.body, map);
        const r = await send(c, C.swapUrl(c.url, map), bodyFor(c, sw, i === T.fileAt ? f : null));
        if (r.status >= 400 || r.status === 0) throw new Error((i === T.fileAt ? 'upload' : 'step') + ':' + r.status);
        C.align(c.resJson, C.parseJson(r.text), map);
        await pause(150);
      }
      // the shipping request, once per category
      const s = T.calls[T.shipAt];
      for (const cat of catList) {
        let req = { ...s, url: C.swapUrl(s.url, map), body: C.swapBody(s.body, map) };
        const id = cat.id && cat.id !== 'picked' ? String(cat.id) : null;
        if (id && T.cat && id !== String(T.cat.value)) req = C.putAt(req, T.cat, id);
        else if (id && !T.cat) { errors[cat.key] = 'nocat'; continue; } // Meesho's request names no category: only the one picked in Meesho
        const r = await send(s, req.url, bodyFor(s, req.body, T.shipAt === T.fileAt ? f : null));
        const v = C.num(C.get(C.parseJson(r.text), T.shipPath));
        if (r.status >= 400 || v == null) errors[cat.key] = 'ship:' + r.status; else values[cat.key] = v;
        await pause(250);
      }
    } catch (err) { if (!Object.keys(values).length) throw err; errors.rest = String(err.message || err); }
    return { values, errors };
  }

  async function fromDataUrl(d) { return (await ofetch.call(window, d)).blob(); }

  window.addEventListener('message', async (e) => {
    const m = e.data;
    if (e.source !== window || !m || m.pbsh !== 1 || m.to !== 'hook') return;
    if (m.type === 'learn') { if (typeof m.displayed === 'number') shown = m.displayed; learn(typeof m.displayed === 'number' ? m.displayed : null, false); }
    else if (m.type === 'hello') { post({ type: 'hello', calls: calls.length }); if (cats.size) post({ type: 'cats', list: [...cats.values()].slice(0, 4000) }); learn(null, false); }
    else if (m.type === 'run') {
      try {
        const out = await run(m.data ? await fromDataUrl(m.data) : null, Array.isArray(m.cats) && m.cats.length ? m.cats : [{ key: 'picked', id: null }]);
        post({ type: 'done', req: m.req, ...out });
      } catch (err) { post({ type: 'done', req: m.req, values: {}, errors: { all: String((err && err.message) || err) } }); }
    } else if (m.type === 'report') post({ type: 'report', req: m.req, report: C.report(calls, tpl ? { steps: tpl.calls.map((_, i) => i), shipPath: tpl.shipPath, cat: tpl.cat } : null) });
  });
})();
