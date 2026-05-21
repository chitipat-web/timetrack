---
name: deploy
description: Deploy protocol for the RUDY PWA (chitipat-web/timetrack) — enforces the iron-clad 3-file rule (index.html + sw.js + version.json must ship together) and the cache-version bump across all three files. Use this skill whenever the user is about to commit, push, deploy, or release a change to RUDY — even if they only mention editing index.html, fixing a bug, "pushing this up", or any change that will reach GitHub Pages. Also use it whenever sw.js is touched, when cache versions are mentioned, when auto-update polling is involved, or when a user reports "the new version isn't showing on my iPhone." Missing one of these three files in a deploy is the single most common failure mode for this project.
---

# RUDY Deploy Protocol

## Why this exists

RUDY ships as a single-file PWA to GitHub Pages, used by 3 people on iOS PWA (added to home screen). Auto-update relies on `version.json` polling — but only works if **all three files ship together with synchronized version numbers**. Drift between them silently breaks updates: users keep seeing old code, debugging is hard because the repo looks fine, and the only symptom is "my iPhone won't update."

This skill exists because skipping or de-syncing any one file is the #1 deploy mistake on this project — it has happened multiple times and is easy to miss when only "fixing one small thing."

## The three-file rule (iron-clad)

**Every deploy must present these three files together:**

1. `index.html` — the actual app code
2. `sw.js` — the service worker (cache name controls what users get)
3. `version.json` — the auto-update beacon (clients poll this every few minutes)

If any one of these is missing from a commit, the deploy is broken. There are no exceptions. Even a "tiny CSS fix" requires all three to move forward together — otherwise the cache won't invalidate, and the fix won't reach users' phones.

## Cache version naming

Inside `sw.js`, three cache names must all bump to the **same** version number:

```js
const STATIC_CACHE  = 'rudy-static-vNNN';
const FIREBASE_CACHE = 'firebase-vNNN';
const RUNTIME_CACHE = 'rudy-runtime-vNNN';
```

And `version.json` must contain the matching version, e.g.:

```json
{ "version": "NNN" }
```

If the previous release was `v159`, the next release is `v160`. Never reuse a version. Never let the three cache names drift apart — they must all be the same `NNN`.

## Deploy checklist

Before claiming a deploy is done, walk through every item:

1. **Find the current version.** Read the current value of `rudy-static-vNNN` in `sw.js` and `version` in `version.json`. They must already match — if they don't, stop and flag the drift before doing anything else.
2. **Decide the new version.** Bump by 1: `v159 → v160`. Use the same integer everywhere.
3. **Edit `index.html`** with the actual code change.
4. **Edit `sw.js`** — bump all three cache constants to the new version. Do not change just one of the three.
5. **Edit `version.json`** — bump `version` to the new number.
6. **Verify the bypass list is still first in the fetch handler.** Service worker fetch handler must check the bypass list (`generativelanguage`, `firebaseinstallations`, `fcm`, `web.push.apple.com`, `identitytoolkit`, `securetoken`) **before** the method check. Reordering this breaks iOS Safari. If the deploy touches `sw.js` at all, double-check this hasn't moved.
7. **Stage all three files together.** A single commit, three files. Not three commits.
8. **Push to `main`.** GitHub Pages auto-deploys from there.
9. **Confirm with the user** what version was shipped and that all three files were included.

## Verification before declaring "done"

After editing, run a final check — do not skip this:

- [ ] `sw.js` contains exactly **three** occurrences of the new version string in the cache constants
- [ ] `version.json` `version` field equals the new number as a string
- [ ] No leftover references to the previous version anywhere in `sw.js`
- [ ] The bypass list in `sw.js` fetch handler is still positioned before the method check
- [ ] All three files appear in the commit

If any check fails, fix before pushing.

## Common mistakes to avoid

**Bumping `sw.js` but forgetting `version.json`.**
Symptom: users' phones never poll a new version → they stay on the old code forever even though sw.js changed. The cache is fresh in theory but no client knows to fetch it.

**Bumping `version.json` but forgetting `sw.js`.**
Symptom: clients detect a new version and reload, but the service worker still serves the old cached files. Reload loop with no actual update.

**Bumping only one of the three cache constants in `sw.js`.**
Symptom: partial cache invalidation. Some assets refresh, others don't. Hardest of all to debug because the app *seems* to update but behaves inconsistently.

**Changing the bypass list order in `sw.js` while bumping versions.**
Symptom: Gemini AI features, Firebase auth, or FCM stop working on iOS Safari specifically. Works fine in desktop Chrome. Always re-check bypass list position when touching `sw.js`.

**Squashing version changes into "miscellaneous" commits.**
The version bump should be visible in the commit. Don't hide it inside a 20-file refactor where it's easy to miss in review.

## When the user reports "my iPhone isn't updating"

Before assuming it's a Safari cache bug, check the deploy first:

1. Did the last commit include **all three** files?
2. Does `sw.js` cache version match `version.json` version?
3. Are all three cache constants in `sw.js` on the same version?

If any answer is no, the problem is the deploy, not the device. Fix the deploy, push again, then ask the user to force-quit Safari and reopen the PWA.

If all three checks pass, then it may genuinely be iOS Safari holding a stale cache — but rule out the deploy first.

## What this skill does NOT cover

- Editing app logic, Firebase schema, or UI itself
- The bypass list contents (covered by the `sw-fetch` skill)
- Cron-job.org / GitHub Actions email workflows
- Light/dark mode toggle behavior (covered by the `theme-vars` skill)

This skill is strictly about the mechanics of shipping a change to production correctly.
