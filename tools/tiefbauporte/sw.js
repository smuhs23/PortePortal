// v6/sw.js — Service Worker für TiefbauPorte
// Strategie:
//  - App-Shell: Cache-First (alle HTML/CSS/JS-Dateien der App)
//  - Map-Tiles (CARTO + Esri): Stale-While-Revalidate (online frisch, offline Cache)
//  - CDN-Libraries: Cache-First

const APP_VERSION = 'v6.4.2-2026-04-26';
const APP_CACHE = `tbp-app-${APP_VERSION}`;
const TILE_CACHE = `tbp-tiles-v1`;
const LIB_CACHE = `tbp-libs-v1`;

// Dateien der App-Shell — werden beim Install vorgeladen
const APP_SHELL = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.json',
  './modules/calc.js',
  './modules/catalog.js',
  './modules/cableTypes.js',
  './modules/bom.js',
  './modules/constants.js',
  './modules/exportDialog.js',
  './modules/exportExcel.js',
  './modules/exportOther.js',
  './modules/exportPdf.js',
  './modules/kalk.js',
  './modules/links.js',
  './modules/mode.js',
  './modules/objects.js',
  './modules/render.js',
  './modules/storage.js',
  './modules/traces.js',
  './modules/ui.js',
  './modules/undo.js'
];

// CDN-Library-Hosts
const LIB_HOSTS = ['unpkg.com', 'cdnjs.cloudflare.com'];

// Map-Tile-Hosts
const TILE_HOSTS = [
  'basemaps.cartocdn.com',
  'server.arcgisonline.com',
  'tile.openstreetmap.de',
  'tile.openstreetmap.org'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then(cache => {
      return cache.addAll(APP_SHELL).catch(err => {
        console.warn('[SW] App-Shell cache failed:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith('tbp-app-') && k !== APP_CACHE).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Nominatim (Adress-Suche): nicht cachen
  if (url.hostname === 'nominatim.openstreetmap.org') return;

  // Map-Tiles: Stale-While-Revalidate
  if (TILE_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) {
    event.respondWith(staleWhileRevalidate(req, TILE_CACHE));
    return;
  }

  // CDN-Libraries: Cache-First
  if (LIB_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) {
    event.respondWith(cacheFirst(req, LIB_CACHE));
    return;
  }

  // App-Shell (same-origin): Cache-First
  if (url.origin === location.origin) {
    event.respondWith(cacheFirst(req, APP_CACHE));
    return;
  }
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const resp = await fetch(req);
    if (resp && resp.ok) cache.put(req, resp.clone());
    return resp;
  } catch (e) {
    return new Response('Offline · Ressource nicht verfügbar', { status: 503 });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const networkFetch = fetch(req).then(resp => {
    if (resp && resp.ok) cache.put(req, resp.clone());
    return resp;
  }).catch(() => null);
  return cached || (await networkFetch) || new Response('Tile offline', { status: 503 });
}
