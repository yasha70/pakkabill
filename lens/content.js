// PakkaBill Lens panel on Meesho product pages. Reads only the page you have open:
// no crawling, no server. Uses PBLensCore from core.js (loaded first).
(() => {
  const C = PBLensCore;
  const PB_URL = 'https://pakkabill1.vercel.app/#/lens';
  const rs = n => n == null || isNaN(n) ? '—' : (n < 0 ? '−₹' : '₹') + Math.abs(Math.round(n)).toLocaleString('en-IN');
  const int = n => n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('en-IN');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const get = k => new Promise(r => chrome.storage.local.get(k, r));
  const set = o => new Promise(r => chrome.storage.local.set(o, r));
  async function settings() { const x = await get('settings'); return C.settings(x.settings); }
  async function track(d) {
    if (!d.id) return null;
    const key = 'p:' + d.id, x = await get(key);
    const h = C.remember(x[key], d);
    await set({ [key]: h });
    return h;
  }

  let host, root, open = true;
  function mount() {
    if (host && document.body.contains(host)) return;
    host = document.createElement('div'); host.id = 'pakkabill-lens';
    host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647';
    root = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
  }
  const CSS = `
  :host{all:initial}
  *{box-sizing:border-box}
  .card{width:350px;max-height:78vh;overflow:auto;background:#fff;color:#1C2340;font:14px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;border:1px solid #DCD6F5;border-radius:12px;box-shadow:0 10px 30px rgba(40,24,90,.25)}
  .hd{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(120deg,#6d4aff,#c04fd0 60%,#ff7a59);color:#fff;padding:10px 12px}
  .hd b{font-size:15px}
  .hd button{background:none;border:0;color:#fff;font:inherit;font-weight:700;cursor:pointer;padding:2px 8px;font-size:18px}
  .mini{background:linear-gradient(120deg,#6d4aff,#c04fd0);color:#fff;border:0;border-radius:999px;padding:10px 16px;font:700 14px system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(40,24,90,.3)}
  h3{margin:0;padding:10px 12px 4px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#6b6880;font-weight:700}
  ul{list-style:none;margin:0;padding:0 0 4px}
  li{display:flex;justify-content:space-between;gap:10px;padding:5px 12px;border-top:1px solid #F0EDF8}
  li:first-child{border-top:0}
  li span{color:#3a3f55}
  li b{color:#2b1f6b;font-variant-numeric:tabular-nums;text-align:right}
  li b.bad{color:#B42318} li b.good{color:#1f7a4d}
  .tag{font-size:10.5px;font-weight:700;border-radius:4px;padding:0 5px;margin-left:5px;vertical-align:1px}
  .real{background:#e3f5ea;color:#1f7a4d} .est{background:#fff1d6;color:#8a5a00} .ok{background:#e7e1ff;color:#4b35c9}
  .big{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #F0EDF8}
  .big div{padding:10px 12px}
  .big div+div{border-left:1px solid #F0EDF8}
  .big strong{display:block;font-size:22px;color:#2b1f6b;line-height:1.15}
  .big small,.note{color:#6b6880;font-size:12px}
  .note{padding:6px 12px 10px;margin:0}
  .sizes{display:flex;flex-wrap:wrap;gap:6px;padding:6px 12px 10px}
  .sizes span{border:1px solid #DCD6F5;border-radius:6px;padding:2px 6px;font-size:12px}
  details{border-top:1px solid #F0EDF8}
  summary{padding:9px 12px;cursor:pointer;font-weight:700;color:#4b35c9}
  label{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 12px;font-size:13px}
  input{width:80px;font:inherit;padding:3px 6px;border:1px solid #CFC8EE;border-radius:6px;text-align:right}
  .row{display:flex;gap:8px;padding:8px 12px 12px}
  .btn{flex:1;font:inherit;font-weight:700;border:1.5px solid #6d4aff;background:#fff;color:#4b35c9;border-radius:8px;padding:6px;cursor:pointer;text-align:center;text-decoration:none}
  .btn.pri{background:#6d4aff;color:#fff}
  button:focus-visible,input:focus-visible,summary:focus-visible,a:focus-visible{outline:3px solid #ffb13d;outline-offset:1px}
  .empty{padding:14px 12px}`;
  const tag = (src, checked) => checked ? '<span class="tag ok">checked</span>' : src ? '<span class="tag real">real</span>' : '';

  async function render() {
    mount();
    if (!C.productId(location)) { root.innerHTML = ''; return; }
    if (!open) { root.innerHTML = `<style>${CSS}</style><button class="mini" id="o">Lens</button>`; root.getElementById('o').onclick = () => { open = true; render(); }; return; }
    const d = C.extract(document, location);
    if (d.price == null && d.ratings == null) { root.innerHTML = `<style>${CSS}</style><div class="card"><div class="hd"><b>PakkaBill Lens</b></div><p class="empty">Reading this product… If this stays, Meesho may have changed its page layout. Scroll down once and press Refresh.</p></div>`; return 'retry'; }
    const s = await settings(); const h = await track(d);
    const c = C.money(d.price, d, s), v = C.velocity(h, s.ratingRatio);
    const lvl = C.risk(d.lowShare), cls = lvl === 'High' ? 'bad' : lvl === 'Low' ? 'good' : '';
    const est = '<span class="tag est">estimate</span>';
    root.innerHTML = `<style>${CSS}</style>
    <div class="card" role="region" aria-label="PakkaBill Lens">
      <div class="hd"><b>PakkaBill Lens</b><button id="x" aria-label="Minimise">–</button></div>
      <div class="big">
        <div><small>Bank settlement ${est}</small><strong>${rs(c.settlement)}</strong><small>per order${d.pack > 1 ? `, pack of ${d.pack}` : ''}</small></div>
        <div><small>Orders / day ${est}</small><strong>${v && v.ordersPerDay != null ? int(v.ordersPerDay) : '—'}</strong><small>${v ? (v.dropped ? 'ratings went down, can\'t tell' : `over the last ${v.days.toFixed(1)} days`) : 'open it again tomorrow'}</small></div>
      </div>
      <h3>Price</h3><ul>
        <li><span>Meesho price${d.onwards ? ' (lowest size)' : ''}${tag(d.src.price, d.src.priceChecked)}</span><b>${rs(d.price)}</b></li>
        ${d.mrp ? `<li><span>Crossed-out price</span><b>${rs(d.mrp)} (${d.off}% off)</b></li>` : ''}
        <li><span>Delivery to buyer</span><b>${d.freeDelivery === false ? rs(d.deliveryCharge) : d.freeDelivery ? 'Free (inside price)' : '—'}</b></li>
        <li><span>Seller's price ${est}</span><b>${rs(c.sellerPrice)}</b></li>
        <li><span>TCS 0.5% + TDS 0.1%</span><b class="bad">${rs(-(c.tcs + c.tds))}</b></li>
        <li><span>Earning after ${s.gst}% GST</span><b>${rs(c.earning)}</b></li>
        ${d.pack > 1 ? `<li><span>Earning per piece</span><b>${rs(c.perPiece)}</b></li>` : ''}
        ${c.myMargin != null ? `<li><span>Your margin at this price</span><b class="${c.myMargin < 0 ? 'bad' : 'good'}">${rs(c.myMargin)}</b></li><li><span>After ${s.returnPct}% returns</span><b class="${c.expected < 0 ? 'bad' : 'good'}">${rs(c.expected)}</b></li>` : ''}
      </ul>
      <p class="note">TCS and TDS are cut from the payout but come back to the seller as tax credits, so the earning line doesn't subtract them.</p>
      ${d.sizes ? `<h3>Price by size</h3><div class="sizes">${d.sizes.slice(0, 24).map(x => `<span>${esc(x.size)} ${rs(x.price)}</span>`).join('')}</div>` : ''}
      <h3>Demand</h3><ul>
        <li><span>Rating</span><b>${d.rating ?? '—'}</b></li>
        <li><span>Ratings / reviews${tag(d.src.ratings, d.src.ratingsChecked)}</span><b>${int(d.ratings)} / ${int(d.reviews)}</b></li>
        <li><span>Lifetime orders ${est}</span><b>~${int(d.ratings == null ? null : d.ratings * s.ratingRatio)}</b></li>
        ${v && v.ratingsPerDay != null ? `<li><span>New ratings per day</span><b>${v.ratingsPerDay.toFixed(1)}</b></li>` : ''}
        ${h && h.firstSeen ? `<li><span>You first tracked it</span><b>${new Date(h.firstSeen).toLocaleDateString('en-IN')}</b></li>` : ''}
      </ul>
      <h3>Quality</h3><ul>
        ${d.breakdown ? `<li><span>Poor + average ratings</span><b class="${cls}">${d.lowShare.toFixed(1)}%</b></li><li><span>Return risk ${est}</span><b class="${cls}">${lvl}</b></li>` : `<li><span>Rating breakdown</span><b>scroll down to the ratings</b></li>`}
      </ul>
      <h3>Seller</h3><ul>
        <li><span>Sold by</span><b>${esc(d.seller || '—')}</b></li>
        ${d.sellerRating ? `<li><span>Seller rating</span><b>${d.sellerRating}</b></li>` : ''}
        ${d.sellerFollowers != null ? `<li><span>Followers</span><b>${int(d.sellerFollowers)}</b></li>` : ''}
        ${d.sellerProducts != null ? `<li><span>Products listed</span><b>${int(d.sellerProducts)}</b></li>` : ''}
        ${d.fabric ? `<li><span>Fabric</span><b>${esc(d.fabric)}</b></li>` : ''}
        ${d.packText ? `<li><span>Pack</span><b>${esc(d.packText)}</b></li>` : ''}
      </ul>
      <details><summary>Settings for estimates</summary>
        <label>Shipping inside price (₹)<input id="shipping" type="number" value="${s.shipping}"></label>
        <label>Product GST %<input id="gst" type="number" value="${s.gst}"></label>
        <label>Orders per 1 rating<input id="ratingRatio" type="number" value="${s.ratingRatio}"></label>
        <label>My cost per piece (₹)<input id="myCost" type="number" value="${s.myCost}" placeholder="optional"></label>
        <label>My returns %<input id="returnPct" type="number" value="${s.returnPct}"></label>
        <label>Loss per return (₹)<input id="returnLoss" type="number" value="${s.returnLoss}"></label>
        <p class="note">PakkaBill's Meesho Lens page uses the same settings.</p>
      </details>
      <div class="row"><a class="btn pri" href="${PB_URL}" target="_blank" rel="noopener">All competitors</a><button class="btn" id="re">Refresh</button><button class="btn" id="copy">Copy data</button></div>
    </div>`;
    root.getElementById('x').onclick = () => { open = false; render(); };
    root.getElementById('re').onclick = () => render();
    root.getElementById('copy').onclick = e => { navigator.clipboard.writeText(JSON.stringify({ d, c }, null, 1)); e.target.textContent = 'Copied'; };
    for (const k of ['shipping', 'gst', 'ratingRatio', 'myCost', 'returnPct', 'returnLoss']) {
      root.getElementById(k).onchange = async ev => {
        const x = await get('settings'); const cur = Object.assign({}, x.settings);
        cur[k] = k === 'myCost' ? ev.target.value : (+ev.target.value || 0);
        await set({ settings: C.settings(cur) }); render();
      };
    }
  }

  // Meesho is a single-page app: watch for URL changes and retry while the page loads.
  let lastUrl = '', tries = 0;
  async function tick() {
    if (location.href !== lastUrl) { lastUrl = location.href; tries = 0; }
    if (tries < 8) { tries++; const r = await render(); if (r !== 'retry') tries = 99; }
  }
  setInterval(tick, 1500);
  tick();
})();
