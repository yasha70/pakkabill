// PakkaBill Lens bridge: runs only on PakkaBill. Hands the competitors you tracked on
// Meesho to PakkaBill's Meesho Lens page, and takes settings and removals back.
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
  });
  send();
})();
