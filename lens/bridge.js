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
  // shipping read in Meesho goes straight back to the open Image tab
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === 'local' && ch.shipres && ch.shipres.newValue) window.postMessage({ type: 'pb-ship-results', results: ch.shipres.newValue.results || {} }, ORIGIN);
  });
  send();
})();
