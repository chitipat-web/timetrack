---
description: Safety rules for the RUDY service worker's fetch handler (sw.js). Use whenever editing sw.js, adding a cache strategy, modifying the bypass list, debugging "iOS Safari can't reach Gemini or Firebase auth", or changing how a resource is cached. Enforces the bypass-list-first rule, the network-only treatment of version.json, and the host list that must never be intercepted. Misordering the bypass list has broken AI + Firebase Auth on iOS Safari before.
paths: ["sw.js"]
---

# RUDY service worker — fetch handler rules

## The non-negotiable order

The `fetch` event handler must check things in this exact order:

```js
self.addEventListener('fetch', (event) => {
  // 1. HARD BYPASS FIRST — before anything else (iOS Safari fix)
  if (shouldBypass(event.request.url)) return;
  // 2. Non-GET → bypass
  if (event.request.method !== 'GET') return;
  // 3. Skip non-http(s) → bypass
  // 4. version.json → network-only, never cache
  // 5. Navigation/HTML → network-first
  // 6. Firebase Realtime → network-only
  // 7. CDN / Fonts → cache-first
  // 8. Same-origin → cache-first + background update
});
```

**The bypass check MUST come before the method check.** Reversing them has re-broken iOS Safari twice. The CORS preflight `OPTIONS` request to Gemini / Firebase Auth fails as "TypeError: Type error" if the SW intercepts it.

## Hosts that must be in BYPASS_HOSTS

These must never be intercepted by the SW. Adding a new third-party domain to the app means adding it here too:

- `generativelanguage.googleapis.com` (Gemini API)
- `firebaseinstallations.googleapis.com`
- `fcm.googleapis.com`
- `fcmregistrations.googleapis.com`
- `web.push.apple.com`
- `android.googleapis.com`
- `updates.push.services.mozilla.com`
- `autopush.mozilla.services`
- `identitytoolkit.googleapis.com` (Firebase Auth)
- `securetoken.googleapis.com`
- `www.googleapis.com`
- `googletagmanager.com`
- `google-analytics.com`

`shouldBypass()` matches by hostname *or* `endsWith('.' + host)` *or* `includes(host)`, so subdomains and bare hosts are both covered. Don't change the matching logic without re-testing all hosts.

## version.json is sacred

`version.json` must be fetched with `{ cache: 'no-store' }` and never written to any cache. The auto-update poller in index.html relies on it being fresh — if the SW serves a cached copy, the app can never detect a new deploy. Don't add it to `PRECACHE_URLS`. Don't let it fall through to the same-origin cache-first branch.

## Cache name discipline

The three constants — `STATIC_CACHE`, `FIREBASE_CACHE`, `RUNTIME_CACHE` — must all share the same `vNNN` suffix. The activate handler deletes any cache whose name doesn't match all three current names, so a typo in one bricks the cleanup logic for that release.

## When you touch this file

1. Re-read the bypass-first ordering before committing — even if your change is unrelated to fetch logic.
2. Run the rudy-deploy skill (any sw.js change is a deploy).
3. Remind the user to clear iOS Safari data — SW updates are slow to propagate on iOS PWAs even with the update banner.

## Diagnosing "Gemini AI broke" or "login fails on iPhone but works on Mac"

Almost always one of:
- A host got removed from `BYPASS_HOSTS`
- The bypass check moved below the method check
- A new third-party domain was added without being added to bypass

Open sw.js. Verify the bypass block is the first thing in the fetch handler. Verify the host list is intact.
