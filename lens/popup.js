const C = PBLensCore;
const rs = n => n == null ? '—' : '₹' + Math.round(n).toLocaleString('en-IN');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let rows = [];
chrome.storage.local.get(null, all => {
  const s = C.settings(all.settings);
  rows = Object.keys(all).filter(k => k.startsWith('p:')).map(k => all[k]).map(h => {
    const first = h.snaps[0], last = h.snaps[h.snaps.length - 1], v = C.velocity(h, s.ratingRatio);
    return { ...h, first, last, v, perDay: v && v.ordersPerDay != null ? v.ordersPerDay : null };
  }).sort((a, b) => (b.perDay ?? -1) - (a.perDay ?? -1) || b.lastSeen - a.lastSeen);
  const el = document.getElementById('list');
  if (!rows.length) { el.innerHTML = '<p class="empty">Nothing tracked yet. Open any Meesho product page and the Lens panel will start tracking it.</p>'; return; }
  el.innerHTML = `<table><thead><tr><th>Product</th><th>Price</th><th>Ratings</th><th>Est. orders/day</th></tr></thead><tbody>${rows.map(r => `
    <tr><td><a href="${esc(r.url)}" target="_blank">${esc((r.name || r.id).slice(0, 38))}</a><small>${esc(r.seller || '')}${r.snaps.length > 1 ? `, ${r.snaps.length} days of readings` : ', seen once'}</small></td>
    <td>${rs(r.last.price)}${r.first.price && r.first.price !== r.last.price ? `<small>was ${rs(r.first.price)}</small>` : ''}</td>
    <td>${r.last.ratings == null ? '—' : r.last.ratings.toLocaleString('en-IN')}${r.v && r.v.gained > 0 ? `<small class="up">+${r.v.gained.toLocaleString('en-IN')}</small>` : ''}</td>
    <td>${r.perDay != null ? Math.round(r.perDay) : '—'}</td></tr>`).join('')}</tbody></table>`;
});
document.getElementById('pb').onclick = () => chrome.tabs.create({ url: 'https://pakkabill1.vercel.app/#/lens' });
document.getElementById('csv').onclick = () => {
  const head = ['Product', 'Seller', 'URL', 'Price now', 'Price first seen', 'Ratings now', 'Ratings first seen', 'Days of readings', 'Est orders per day'];
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = [head.map(q).join(',')].concat(rows.map(r => [r.name, r.seller, r.url, r.last.price, r.first.price, r.last.ratings, r.first.ratings, r.snaps.length, r.perDay == null ? '' : Math.round(r.perDay)].map(q).join(',')));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' }));
  a.download = 'meesho-competitors.csv'; a.click();
};
document.getElementById('clear').onclick = () => {
  if (!confirm('Remove all tracked products? Your settings are kept.')) return;
  chrome.storage.local.get(null, all => chrome.storage.local.remove(Object.keys(all).filter(k => k.startsWith('p:')), () => location.reload()));
};
