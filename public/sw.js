// ============================================================
// SERVICE WORKER (P3-25) — caches the app shell (HTML/CSS/JS) so the app
// installs and opens instantly, with an offline fallback. Deliberately never
// caches /api/* or /ws/* — market data is only ever meaningful live.
// ============================================================
const CACHE = 'cpc-shell-v1';
const SHELL = [
  '/', '/css/style.css', '/favicon.svg', '/manifest.json',
  '/js/main.js', '/js/charts.js', '/js/data.js', '/js/constants.js',
  '/js/indicators.js', '/js/indicator-client.js', '/js/indicator-worker.js',
  '/js/drawings.js', '/js/ui.js', '/js/utils.js', '/js/state.js',
  '/js/watchlist.js', '/js/persistence.js', '/js/scanner.js', '/js/settings.js',
  '/js/events.js', '/js/orderbook.js', '/js/auth.js', '/js/alerts.js',
  '/js/derivatives.js', '/js/replay.js', '/js/paper.js', '/js/snapshot.js', '/js/palette.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Only ever manage same-origin, GET, app-shell requests — never live data.
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => {
        if (cached) return cached;
        // Only the page navigation itself falls back to the cached shell —
        // a missing JS/CSS asset should fail loudly, not silently serve HTML.
        if (req.mode === 'navigate') return caches.match('/');
        return Response.error();
      })),
  );
});
