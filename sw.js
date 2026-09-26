// PakkaBill offline cache: when online, load the latest version from the server (so updates show
// straight away) and keep a copy; when offline or the network is very slow, use the saved copy.
const CACHE = 'pakkabill-v16';
const SHELL = ['./', './index.html', './pro.js', './listing.js', './lens.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;
  const saved = () => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'));
  const net = fetch(req).then((res) => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  });
  const slow = new Promise((resolve) => setTimeout(resolve, 5000)).then(() => caches.match(req, { ignoreSearch: true }));
  e.respondWith(
    Promise.race([net, slow])
      .then((res) => res || net)
      .catch(() => saved()),
  );
});
