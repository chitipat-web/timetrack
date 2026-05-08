// ===== RUDY Service Worker =====
// v83 — bump cache + new VAPID PUBLIC key (verified valid P-256, copy-paste from log)
// v82 — bump cache + new VAPID PUBLIC key (matches new keypair)
// v81 — bump cache to force activation for index.html debug version
// v80 — bump cache to force activation for v79 (Auto-detect VAPID)
// v77 — fix: userEmail in fcm_subs (matches index.html v77)
// v76 — added AI Helper for announcements (Claude API integration)
const STATIC_CACHE = 'rudy-static-v83';
const FIREBASE_CACHE = 'rudy-firebase-v83';
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
  console.log('[SW v83] Installing...');
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache => {
        console.log('[SW v83] Caching static assets');
        return cache.addAll(STATIC_ASSETS).catch(err => {
          console.log('[SW v83] Static cache error:', err);
        });
      }),
      caches.open(FIREBASE_CACHE).then(cache => {
        console.log('[SW v83] Caching Firebase SDK + Fonts');
        return Promise.all(
          [...FIREBASE_ASSETS, ...FONT_ASSETS].map(url =>
            cache.add(url).catch(err => console.log('[SW v83] Cache error:', url, err))
          )
        );
      }),
    ]).then(() => {
      console.log('[SW v83] Installed — skipping waiting');
      return self.skipWaiting();
    })
  );
});

// ==================== ACTIVATE ====================
self.addEventListener('activate', event => {
  console.log('[SW v83] Activating — cleaning ALL old caches');
  event.waitUntil(
    (async () => {
      const allKeys = await caches.keys();
      console.log('[SW v83] Found caches:', allKeys);

      const deletions = allKeys
        .filter(key => !CURRENT_CACHES.includes(key))
        .map(key => {
          console.log('[SW v83]   x Deleting:', key);
          return caches.delete(key);
        });

      await Promise.all(deletions);
      console.log('[SW v83] Cache cleanup complete. Active:', CURRENT_CACHES);

      await self.clients.claim();

      const clients = await self.clients.matchAll({ type: 'window' });
      console.log('[SW v83] Notifying ' + clients.length + ' client(s) to reload');
      for (const client of clients) {
        client.postMessage({ type: 'SW_UPDATED', version: 'v83' });
      }
    })()
  );
});

// ==================== FETCH ====================
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // ⚠️ HARD BYPASS: APIs ที่ห้าม Service Worker แตะเด็ดขาด (ที่บรรทัดแรกสุด ก่อนเช็ค method)
  // Safari iOS PWA bug: SW intercept CORS preflight ทำให้ fail
  if (url.indexOf('generativelanguage.googleapis.com') !== -1 ||
      url.indexOf('firebaseinstallations.googleapis.com') !== -1 ||
      url.indexOf('fcm.googleapis.com') !== -1 ||
      url.indexOf('fcmregistrations.googleapis.com') !== -1 ||
      url.indexOf('web.push.apple.com') !== -1 ||
      url.indexOf('android.googleapis.com') !== -1 ||
      url.indexOf('updates.push.services.mozilla.com') !== -1) {
    return; // ไม่เรียก event.respondWith() = browser handle เอง
  }

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
        }).catch(() => cached); // เผื่อ offline และไม่มี cache → return undefined (browser จัดการ)
      })
    );
    return;
  }

  // Network-first with cache fallback for app shell
  if (url.includes('github.io') || url.endsWith('index.html') || url.endsWith('/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        try {
          const response = await fetch(event.request);
          if (response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        } catch (err) {
          // Network failed → fallback to cache
          const cached = await cache.match(event.request);
          if (cached) return cached;
          // No cache either → re-throw so browser shows offline page
          throw err;
        }
      })()
    );
    return;
  }
});

// ==================== MESSAGE ====================
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting' || (event.data && event.data.type === 'SKIP_WAITING')) {
    console.log('[SW v83] Manual skipWaiting');
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'PURGE_ALL') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      console.log('[SW v83] PURGE_ALL: deleted', keys.length, 'caches');
      if (event.source) {
        event.source.postMessage({ type: 'PURGE_DONE', deleted: keys });
      }
    })());
  }
});

// ==================== PUSH EVENT ====================
// รับ push จาก server (GitHub Actions) แล้วแสดง notification
self.addEventListener('push', event => {
  console.log('[SW v83] Push received');
  let data = { title: 'RUDY', body: 'มีการแจ้งเตือนใหม่', tag: 'rudy-default' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      try { data = { title: 'RUDY', body: event.data.text() }; } catch (e2) {}
    }
  }

  const title = data.title || 'RUDY';
  const options = {
    body: data.body || '',
    icon: data.icon || './icon-192.png',
    badge: data.badge || './icon-192.png',
    tag: data.tag || 'rudy-' + Date.now(),
    data: { url: data.url || './', tag: data.tag },
    requireInteraction: false,
    silent: false,
    vibrate: [200, 100, 200], // สั่นเป็นจังหวะ (Android เท่านั้น — iOS ignore)
    timestamp: Date.now()
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ==================== NOTIFICATION CLICK ====================
self.addEventListener('notificationclick', event => {
  console.log('[SW v83] Notification click');
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './';

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // ถ้ามี window เปิดอยู่ → focus
    for (const client of allClients) {
      if (client.url.includes(self.registration.scope)) {
        if ('focus' in client) return client.focus();
      }
    }
    // ไม่มี → เปิดใหม่
    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }
  })());
});
