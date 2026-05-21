---
name: bug-triage
description: Diagnostic protocol for RUDY user-reported bugs. Use when the user reports "my iPhone isn't updating", "still showing old version", "the fix didn't work", "feature broken on phone", "I cleared cache and it's still wrong", or any "the new version isn't showing." Forces a deploy-first check (3-file presence, version sync) before assuming iOS Safari cache. About 80% of "didn't update" reports are actually a deploy miss, not a cache miss.
---

# RUDY bug triage — check the deploy first, not the device

## The rule

When the user reports the latest change isn't appearing on their iPhone, **do not** suggest "clear Safari cache" first. That makes the user do work that may not fix anything. Always rule out the deploy first.

## Order of investigation

Run these in sequence. Stop at the first failure — that's the bug.

### 1. Is the last commit actually on `main` and pushed?

```bash
git log -1 --oneline origin/main
git diff main origin/main
```

If local `main` is ahead of `origin/main`, the push was forgotten.

### 2. Does the deployed `version.json` match `sw.js`?

Read both. The three cache constants in `sw.js` (`STATIC_CACHE`, `FIREBASE_CACHE`, `RUNTIME_CACHE`) and the `version` field in `version.json` must all be the same `vNNN`. If they differ — that's the bug.

### 3. Were all three files in the most recent deploy commit?

```bash
git show --stat HEAD
```

Look for `index.html`, `sw.js`, `version.json` together. If only one or two are present, the deploy was incomplete — even if all three files happen to be on the same version, the cache won't invalidate without a `sw.js` change.

### 4. Did the actual code change land?

```bash
git show HEAD -- index.html | grep -A 2 "thing-you-changed"
```

Confirm the change is in the commit body, not just the commit message.

### 5. Only now, if all four checks pass, suspect iOS Safari cache.

The user may need to:
- Tap the in-app update banner (added in v164), or
- Delete the PWA from home screen → clear Safari website data → re-add the PWA.

CLAUDE.md: *"อาการ 'แก้แล้วไม่เปลี่ยน' เกือบทุกครั้งคือ cache ไม่ใช่บั๊กในโค้ด"* — once you've confirmed the deploy is correct, cache is the most likely cause. But never skip the check.

## What to ask the user

Before diving in:
- What version do they see in Settings → "เวอร์ชัน vNNN" (added in v187)?
- Have they tried the update banner if it's showing?
- What was the most recent push supposed to change?

Knowing the version they're stuck on tells you whether the deploy reached them at all.

## If you find a deploy mistake

Run the `deploy` skill. Bump version, push all three files, then ask the user to clear cache. **Don't** try to patch a broken deploy with a partial commit — bump the version again and ship all three files cleanly.
