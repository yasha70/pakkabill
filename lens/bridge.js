// PakkaBill Lens bridge: runs only on PakkaBill. Hands the competitors you tracked on
// Meesho to PakkaBill's Meesho Lens page, and takes settings and removals back. Also carries the
// low shipping image check: photo versions to Meesho's supplier panel, and the shipping back.
(() => {
  const ORIGIN = location.origin;
  const send = () => chrome.storage.local.get(null, all => {
    const products = Object.keys(all).filter(k => k.startsWith('p:')).map(k => all[k]);
    window.postMessage({ type: 'pb-lens-sync', version: chrome.runtime.getManifest().version, products, settings: all.settings || null }, ORIGIN);
  });
  window.addEventListener('message', e => {
    if (e.source !== window || e.origin !== ORIGIN || !e.data || typeof e.data !== 'object') return;
    const m = e.data;
    if (m.type === 'pb-lens-hello') send();
    else if (m.type === 'pb-lens-settings' && m.settings && typeof m.settings === 'object') chrome.storage.local.set({ settings: PBLensCore.settings(m.settings) });
    else if (m.type === 'pb-lens-remove' && Array.isArray(m.ids)) chrome.storage.local.remove(m.ids.filter(id => /^[a-z0-9]{1,40}$/i.test(id)).map(id => 'p:' + id));
    else if (m.type === 'pb-lens-clear') chrome.storage.local.get(null, all => chrome.storage.local.remove(Object.keys(all).filter(k => k.startsWith('p:'))));
    // shipping check: PakkaBill's Image tab sends photo versions; ship.js tries them in Meesho's supplier panel
    else if (m.type === 'pb-ship-hello') chrome.storage.local.get('shipres', x => window.postMessage({ type: 'pb-ship-state', version: chrome.runtime.getManifest().version }, ORIGIN));
    else if (m.type === 'pb-ship-queue' && Array.isArray(m.items)) {
      const items = m.items.filter(it => it && typeof it.id === 'string' && it.id.length <= 80 && typeof it.data === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(it.data) && it.data.length < 4e6)
        .slice(0, 200).map(it => ({ id: it.id, label: String(it.label || '').slice(0, 80), name: String(it.name || 'photo.jpg').slice(0, 80), data: it.data }));
      const at = Date.now();
      chrome.storage.local.set({ shipq: { at, cat: String(m.cat || '').slice(0, 40), items }, shipres: { at, results: {} } });
    }
  });
  // auto listing: PakkaBill sends templates and products; list.js fills Meesho's form and reports back
  const listState = () => chrome.storage.local.get(['listtpl', 'liststat'], x => window.postMessage({ type: 'pb-list-state', version: chrome.runtime.getManifest().version, templates: x.listtpl || [], status: x.liststat || {} }, ORIGIN));
  const okTpl = t => t && typeof t.id === 'string' && t.id.length <= 60 && Array.isArray(t.fields) && Array.isArray(t.sizes) && JSON.stringify(t).length < 200000;
  window.addEventListener('message', e => {
    if (e.source !== window || e.origin !== ORIGIN || !e.data || typeof e.data !== 'object') return;
    const m = e.data;
    if (m.type === 'pb-list-hello') listState();
    else if (m.type === 'pb-list-templates' && Array.isArray(m.templates)) {
      // PakkaBill's templates, merged with the ones saved in Meesho: the newer copy of each wins
      chrome.storage.local.get('listtpl', x => {
        const by = new Map((x.listtpl || []).map(t => [t.id, t]));
        m.templates.filter(okTpl).forEach(t => { const o = by.get(t.id); if (!o || (t.updatedAt || 0) >= (o.updatedAt || 0)) by.set(t.id, { ...t, points: { ...((o && o.points) || {}), ...(t.points || {}) } }); });
        (m.removed || []).forEach(id => by.delete(id));
        chrome.storage.local.set({ listtpl: [...by.values()].slice(0, 200) });
      });
    } else if (m.type === 'pb-list-queue' && Array.isArray(m.items)) {
      const okPhoto = p => p && typeof p.data === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(p.data) && p.data.length < 6e6;
      const items = m.items.filter(it => it && typeof it.id === 'string' && it.id.length <= 80 && okTpl(it.tpl) && it.prod && typeof it.prod === 'object').slice(0, 300)
        .map(it => ({ id: it.id, tpl: it.tpl, prod: { ...it.prod, photos: (it.prod.photos || []).filter(okPhoto).slice(0, 10).map(p => ({ name: String(p.name || 'photo.jpg').slice(0, 80), data: p.data })) } }));
      chrome.storage.local.get('liststat', x => {
        const st = x.liststat || {};
        items.forEach(it => { if (m.fresh) delete st[it.id]; });
        chrome.storage.local.set({ listq: items.length ? { at: Date.now(), items } : null, liststat: st });
      });
    }
  });
  chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && (ch.listtpl || ch.liststat)) listState(); });
  // shipping read in Meesho goes straight back to the open Image tab
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === 'local' && ch.shipres && ch.shipres.newValue) window.postMessage({ type: 'pb-ship-results', results: ch.shipres.newValue.results || {}, current: ch.shipres.newValue.current || null }, ORIGIN);
  });
  send();
})();
