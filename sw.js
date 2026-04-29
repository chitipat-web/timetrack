// ===== TimeTrack Service Worker =====
const CACHE_NAME = 'timetrack-v2';
const STATIC_CACHE = 'timetrack-static-v2';
const FIREBASE_CACHE = 'timetrack-firebase-v2';

// Files to cache immediately
const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
];

// Firebase CDN files to cache
const FIREBASE_ASSETS = [
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
];

// Font files
const FONT_ASSETS = [
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap',
];

// ===== INSTALL: Cache all static assets =====
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    Promise.all([
      // Cache app files
      caches.open(STATIC_CACHE).then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS).catch(err => {
          console.log('[SW] Static cache error:', err);
        });
      }),
      // Cache Firebase SDK (most important for speed)
      caches.open(FIREBASE_CACHE).then(cache => {
        console.log('[SW] Caching Firebase SDK');
        return Promise.all(
          FIREBASE_ASSETS.map(url =>
            cache.add(url).catch(err => console.log('[SW] Firebase cache error:', url, err))
          )
        );
      }),
    ]).then(() => {
      console.log('[SW] All assets cached!');
      return self.skipWaiting(); // Activate immediately
    })
  );
});

// ===== ACTIVATE: Clean old caches =====
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== STATIC_CACHE && key !== FIREBASE_CACHE)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim()) // Take control immediately
  );
});

// ===== FETCH: Serve from cache, fallback to network =====
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip Firebase Database API calls (must be fresh)
  if (url.includes('firebasedatabase.app') ||
      url.includes('googleapis.com/identitytoolkit') ||
      url.includes('securetoken.googleapis.com')) {
    return; // Let Firebase handle auth/DB calls
  }

  // Firebase SDK & Chart.js → Cache First (very important for speed)
  if (url.includes('gstatic.com/firebasejs') ||
      url.includes('cdn.jsdelivr.net/npm/chart.js') ||
      url.includes('fonts.googleapis.com') ||
      url.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) {
          console.log('[SW] Serving from cache:', url.split('/').pop());
          return cached;
        }
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

  // App HTML → Stale While Revalidate (fast load + background update)
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

        // Return cached immediately, update in background
        return cached || fetchPromise;
      })
    );
    return;
  }
});

// ===== MESSAGE: Force update =====
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
