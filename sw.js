// PortePortal — Service Worker (Cache-First, Offline-fähig)
// Strategie: App-Shell wird beim Install gecached, Tools werden beim ersten Besuch on-demand gecached.

const CACHE_VERSION = 'porteportal-v1.2.0';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './offline.html',
  './assets/logo-porteportal.png',
  './assets/logo-tiefbauporte.png',
  './assets/logo-kalkuporte.png',
  './assets/logo-aushubporte.png'
];

// Install — App-Shell vorab cachen
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate — alte Caches löschen
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch — Cache-First mit Network-Update (Stale-While-Revalidate für gleiche Origin)
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Nur GET, gleiche Origin
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML-Navigation: Network first, Fallback Cache, Fallback offline.html
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match('./offline.html'))
        )
    );
    return;
  }

  // Statische Assets: Cache-First, Network-Update
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
