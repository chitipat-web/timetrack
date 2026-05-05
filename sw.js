// ===== RUDY Service Worker =====
// v36 — self-cleaning: deletes ALL old caches and force-reloads clients
const STATIC_CACHE = 'rudy-static-v36';
const FIREBASE_CACHE = 'rudy-firebase-v36';
const CURRENT_CACHES = [STATIC_CACHE, FIREBASE_CACHE];

const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-180.png',
  './icon-167.png',
  './icon-152.png',
  './icon-120.png',
];

const FIREBASE_ASSETS = [
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
];

const FONT_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@300;400;500&display=swap',
];

// ==================== INSTALL ====================
self.addEventListener('install', event => {
  console.log('[SW v36] Installing...');
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache => {
        console.log('[SW v36] Caching static assets');
        return cache.addAll(STATIC_ASSETS).catch(err => {
          console.log('[SW v36] Static cache error:', err);
        });
      }),
      caches.open(FIREBASE_CACHE).then(cache => {
        console.log('[SW v36] Caching Firebase SDK + Fonts');
        return Promise.all(
          [...FIREBASE_ASSETS, ...FONT_ASSETS].map(url =>
            cache.add(url).catch(err => console.log('[SW v36] Cache error:', url, err))
          )
        );
      }),
    ]).then(() => {
      console.log('[SW v36] Installed — skipping waiting');
      return self.skipWaiting();
    })
  );
});

// ==================== ACTIVATE ====================
// On activation, NUKE every cache that is not in CURRENT_CACHES.
// Any old caches from previous versions get wiped automatically.
self.addEventListener('activate', event => {
  console.log('[SW v36] Activating — cleaning ALL old caches');
  event.waitUntil(
    (async () => {
      const allKeys = await caches.keys();
      console.log('[SW v36] Found caches:', allKeys);

      const deletions = allKeys
        .filter(key => !CURRENT_CACHES.includes(key))
        .map(key => {
          console.log('[SW v36]   x Deleting:', key);
          return caches.delete(key);
        });

      await Promise.all(deletions);
      console.log('[SW v36] Cache cleanup complete. Active:', CURRENT_CACHES);

      await self.clients.claim();

      const clients = await self.clients.matchAll({ type: 'window' });
      console.log('[SW v36] Notifying ' + clients.length + ' client(s) to reload');
      for (const client of clients) {
        client.postMessage({ type: 'SW_UPDATED', version: 'v36' });
      }
    })()
  );
});

// ==================== FETCH ====================
self.addEventListener('fetch', event => {
  const url = event.request.url;

  if (event.request.method !== 'GET') return;

  // Never cache live Firebase realtime/auth traffic
  if (url.includes('firebasedatabase.app') ||
      url.includes('googleapis.com/identitytoolkit') ||
      url.includes('securetoken.googleapis.com')) {
    return;
  }

  // Cache-first for SDK + fonts
  if (url.includes('gstatic.com/firebasejs') ||
      url.includes('cdn.jsdelivr.net/npm/') ||
      url.includes('fonts.googleapis.com') ||
      url.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(FIREBASE_CACHE).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first with cache fallback for app shell
  if (url.includes('github.io') || url.endsWith('index.html') || url.endsWith('/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async cache => {
        const cached = await cache.match(event.request);
        const fetchPromise = fetch(event.request)
          .then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          })
          .catch(() => cached);
        return fetchPromise.catch(() => cached) || cached;
      })
    );
    return;
  }
});

// ==================== MESSAGE ====================
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting' || (event.data && event.data.type === 'SKIP_WAITING')) {
    console.log('[SW v36] Manual skipWaiting');
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'PURGE_ALL') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      console.log('[SW v36] PURGE_ALL: deleted', keys.length, 'caches');
      if (event.source) {
        event.source.postMessage({ type: 'PURGE_DONE', deleted: keys });
      }
    })());
  }
});
