const CACHE_NAME = 'fahrzeug-service-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/bootstrap.min.css',
  './css/bootstrap-icons.css',
  './css/fonts/bootstrap-icons.woff2',
  './css/fonts/bootstrap-icons.woff',
  './js/app.js',
  './js/db.js',
  './js/crypto.js',
  './js/githubsync.js',
  './js/auth.js',
  './js/bootstrap.bundle.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// App-Shell-Strategie: Cache first, danach Netzwerk-Fallback + Cache-Update.
// Cross-Origin-Requests (z. B. an die GitHub-API für den Sync) laufen ungecacht direkt durch,
// damit dort immer der aktuelle Stand abgefragt wird.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
