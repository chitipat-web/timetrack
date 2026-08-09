// =============================================================
// RUDY · Service Worker v251
// Cache: rudy-static-v251, firebase-v251
// Build: 2026-08-02 · v251 — Warm Sand theme: pale cream light mode + warm charcoal dark, gold accent replaces blue, clock seconds hand rides --accent
// =============================================================

const STATIC_CACHE  = 'rudy-static-v251';
const FIREBASE_CACHE = 'firebase-v251';
const RUNTIME_CACHE = 'rudy-runtime-v251';

// Files to precache (small static assets only — NEVER cache index.html aggressively)
const PRECACHE_URLS = [
  './',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
  // NOTE: splash.mp4 intentionally NOT precached (v251). iOS Safari needs
  // 206 Range responses to play video; a cached full-200 body breaks it.
  // The video is fetched from network so the browser negotiates ranges.
];

// =============================================================
// HARD BYPASS LIST — CRITICAL for iOS Safari PWA
// These domains MUST NEVER be intercepted by SW or fetch fails
// with "TypeError: Type error" (CORS preflight broken on iOS)
// =============================================================
const BYPASS_HOSTS = [
  'generativelanguage.googleapis.com',  // Gemini API
  'firebaseinstallations.googleapis.com',
  'fcm.googleapis.com',
  'fcmregistrations.googleapis.com',
  'web.push.apple.com',                  // Apple push
  'android.googleapis.com',
  'updates.push.services.mozilla.com',   // Mozilla push
  'autopush.mozilla.services',
  'identitytoolkit.googleapis.com',      // Firebase Auth
  'securetoken.googleapis.com',
  'www.googleapis.com',
  'googletagmanager.com',
  'google-analytics.com'
];

function shouldBypass(url) {
  try {
    const u = new URL(url);
    for (const host of BYPASS_HOSTS) {
      // v251: exact or subdomain match only. The old `.includes(host)` substring
      // clause could bypass unrelated hosts that merely embed the string.
      if (u.hostname === host || u.hostname.endsWith('.' + host)) {
        return true;
      }
    }
    return false;
  } catch (e) {
    return true;
  }
}

// =============================================================
// INSTALL — Precache static assets, skipWaiting immediately
// =============================================================
self.addEventListener('install', (event) => {
  console.log('[SW v251] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        return cache.addAll(PRECACHE_URLS).catch(err => {
          console.warn('[SW v251] Precache partial fail (ok):', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// =============================================================
// ACTIVATE — Clear old caches, claim clients
// =============================================================
self.addEventListener('activate', (event) => {
  console.log('[SW v251] Activating...');
  event.waitUntil(
    Promise.all([
      caches.keys().then((names) => {
        return Promise.all(
          names
            .filter((name) => name !== STATIC_CACHE && name !== FIREBASE_CACHE && name !== RUNTIME_CACHE)
            .map((name) => {
              console.log('[SW v251] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      }),
      self.clients.claim()
    ])
  );
});

// =============================================================
// FETCH — Smart routing with hard bypass
// =============================================================
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // STEP 1: HARD BYPASS (must be FIRST — iOS Safari fix)
  if (shouldBypass(url)) {
    return;
  }

  // STEP 2: Non-GET → bypass
  if (event.request.method !== 'GET') {
    return;
  }

  // STEP 3: Skip non-http(s)
  if (!url.startsWith('http')) {
    return;
  }

  const reqUrl = new URL(url);

  // STEP 3.4: VIDEO / RANGE REQUESTS → BYPASS (v251 iOS splash fix).
  // iOS Safari plays <video> only when the server answers its
  // `Range:` request with a 206 Partial Content + Content-Range.
  // A Service Worker that serves a cached FULL 200 body (which a
  // cache-first match does) makes iOS refuse to render the video —
  // the splash goes black. Let the browser fetch media itself so it
  // negotiates ranges natively. Covers any Range request and .mp4.
  if (event.request.headers.has('range') ||
      reqUrl.pathname.endsWith('.mp4') ||
      event.request.destination === 'video') {
    return;
  }

  // STEP 3.5: version.json → NETWORK ONLY, never cached.
  // The auto-update poller relies on this being fresh; if the SW
  // served a cached copy the app could never detect a new deploy.
  if (reqUrl.pathname.endsWith('version.json')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => new Response('{}', {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }))
    );
    return;
  }

  // STEP 4: HTML / Document → NETWORK FIRST
  if (event.request.mode === 'navigate' ||
      event.request.destination === 'document' ||
      reqUrl.pathname.endsWith('.html') ||
      reqUrl.pathname === '/' ||
      reqUrl.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then(cached => {
            return cached || caches.match('./');
          });
        })
    );
    return;
  }

  // STEP 5: Firebase realtime → NETWORK ONLY
  if (reqUrl.hostname.includes('firebaseio.com') ||
      reqUrl.hostname.includes('firebasedatabase.app')) {
    event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // STEP 6: CDN / Fonts → CACHE FIRST
  if (reqUrl.hostname.includes('gstatic.com') ||
      reqUrl.hostname.includes('googleapis.com') ||
      reqUrl.hostname.includes('jsdelivr.net') ||
      reqUrl.hostname.includes('fonts.googleapis.com') ||
      reqUrl.hostname.includes('fonts.gstatic.com') ||
      reqUrl.hostname.includes('cdn.jsdelivr.net') ||
      reqUrl.hostname.includes('unpkg.com') ||
      reqUrl.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(FIREBASE_CACHE).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // STEP 7: Same-origin assets → CACHE FIRST + background update
  if (reqUrl.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // DEFAULT: Network with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// =============================================================
// MESSAGE — Force update, clear cache, version
// =============================================================
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys()
        .then(names => Promise.all(names.map(n => caches.delete(n))))
        .then(() => {
          if (event.ports[0]) event.ports[0].postMessage({ ok: true });
        })
    );
    return;
  }

  if (event.data.type === 'GET_VERSION') {
    if (event.ports[0]) event.ports[0].postMessage({ version: 'v251' });
    return;
  }
});

// =============================================================
// PUSH — Compatibility (using email now, but kept for safety)
// =============================================================
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const title = data.title || 'RUDY';
    const options = {
      body: data.body || '',
      icon: data.icon || './icon-192.png',
      badge: './icon-192.png',
      tag: data.tag || 'rudy-notify',
      data: data.url || './',
      requireInteraction: false
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (e) {
    console.warn('[SW v251] Push parse fail:', e);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        for (const client of list) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});

console.log('[SW v251] Loaded — AI quota-friendly retry');
