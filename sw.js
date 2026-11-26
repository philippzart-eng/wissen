// Lern-Archiv Service Worker v2 – schneller Start.
// Die App selbst (index.html) kommt sofort aus dem Speicher; im Hintergrund wird
// die neueste Version geladen. Ist sie neu, meldet die App „Neue Version bereit“.
// Alles andere (Wikipedia-Bilder, Sync …): erst Netz, offline aus dem Speicher.
const CACHE_NAME = 'lern-archiv-cache-v2';
const APP_URLS = ['./', './index.html'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(APP_URLS)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isApp(req) {
  const u = new URL(req.url);
  return u.origin === self.location.origin && (req.mode === 'navigate' || /\/(index\.html)?$/.test(u.pathname));
}

async function notifyIfNew(oldRes, newRes) {
  try {
    if (!oldRes) return;
    const [a, b] = await Promise.all([oldRes.clone().text(), newRes.clone().text()]);
    const v = (t) => (t.match(/const APP_VERSION = '([^']*)'/) || [])[1] || t.length;
    if (v(a) !== v(b)) {
      const cs = await self.clients.matchAll({ type: 'window' });
      cs.forEach((c) => c.postMessage({ type: 'lern-update', version: String(v(b)).split(' ')[0] }));
    }
  } catch (e) {}
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (isApp(req)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match('./index.html');
      const update = fetch(req, { cache: 'no-store' }).then(async (res) => {
        if (res && res.ok) { await notifyIfNew(cached, res); await cache.put('./index.html', res.clone()); }
        return res;
      }).catch(() => null);
      event.waitUntil(update);
      if (cached) return cached;
      return (await update) || new Response('Offline', { status: 503 });
    })());
    return;
  }
  event.respondWith(
    fetch(req)
      .then((res) => { const copy = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {}); return res; })
      .catch(() => caches.match(req))
  );
});
