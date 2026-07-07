// Forma Service Worker - v7
// Strategy: network-first for app HTML + schede.json (get fresh code), cache-first for static CDN assets
const CACHE_NAME = 'forma-v7';
const APP_SHELL = [
  './',
  './index.html'
];
const STATIC_ASSETS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.mini.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => 
      Promise.all([
        cache.addAll(APP_SHELL).catch(()=>{}),
        cache.addAll(STATIC_ASSETS).catch(()=>{})
      ])
    )
  );
  // Don't skipWaiting automatically - wait for user acknowledgment
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// Message handler: allow app to trigger skipWaiting
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const req = event.request;
  if (req.method !== 'GET') return;

  // NETWORK-FIRST for the app HTML and schede.json (so updates are picked up immediately)
  const isAppShell = url.origin === location.origin && 
    (url.pathname === '/' || url.pathname === '/index.html' || 
     url.pathname.endsWith('/index.html') || url.pathname === '' ||
     url.pathname.endsWith('/schede.json') || url.pathname === '/schede.json');
  
  if (isAppShell) {
    event.respondWith(
      fetch(req, {cache: 'no-store'}).then(resp => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone)).catch(()=>{});
        }
        return resp;
      }).catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // CACHE-FIRST for static CDN assets (Leaflet, SheetJS, fonts)
  const isStaticCDN = 
    url.hostname === 'unpkg.com' ||
    url.hostname === 'cdn.sheetjs.com' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com';
  
  if (isStaticCDN) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(resp => {
          if (resp && resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone)).catch(()=>{});
          }
          return resp;
        }).catch(() => cached);
      })
    );
    return;
  }

  // NETWORK-FIRST with cache fallback for map tiles
  if (url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      fetch(req).then(resp => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone)).catch(()=>{});
        }
        return resp;
      }).catch(() => caches.match(req))
    );
    return;
  }
});