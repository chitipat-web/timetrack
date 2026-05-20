---
description: Safety protocol for editing index.html (RUDY's ~700KB single-file PWA). Use whenever editing index.html, adding/modifying UI, fixing a bug in the app code, changing layout, or working in Phase A/B/C/D/E/F/G IIFE blocks. Enforces grep-first reading, brace-balance checks, DOM id-reference tracing before deletion, and avoidance of the 8 recurring bug patterns from CLAUDE.md section 6 (most common: preventDefault on inline-onclick buttons, duplicate CSS selectors where last !important wins, hardcoded rgba breaking theme).
paths: ["index.html"]
---

# Editing index.html safely

## Before you read or edit

**Never `Read` the whole file.** index.html is ~700KB / ~15000 lines and will burn the context window. Use `grep -n` for the symbol/selector/text you need, then `Read` with `offset`/`limit` around the match.

The file is structured as Phase A → G IIFEs, each wrapped in try/catch and isolated:
- **A** home widgets (countdown, quote, today-vs-average)
- **B** widgets (goal tracker, reminders, break reminder)
- **C** leaderboard
- **D** liquid glass WebGL effect
- **E** check-in readiness guard (`ckg`)
- **F** health-check + Firebase `errorlogs`
- **G** auto-recovery

New features go inside the relevant Phase. Don't add top-level scripts outside a Phase — they bypass the try/catch isolation and a single error can take down the whole app.

## Pre-edit checks

For every change, grep first to discover ripple effects:

- **Deleting a DOM element?** First `grep -n 'getElementById.*id-here\|querySelector.*id-here\|#id-here'` — if JS references the id by any name, deletion crashes.
- **Editing a CSS rule?** `grep -n` the selector. If it appears more than once, the *last* declaration (especially one with `!important`) wins. Edit them all consistently or consolidate.
- **Adding `!important`?** Search for any `var(--*)` being overridden — `!important` on inline CSS has broken light mode before.
- **Changing colors/backgrounds?** Use the rudy-theme-vars skill — every hardcoded `color:#fff` or `rgba()` is a future dark-mode bug.

## During edit

Don't do these (each has caused a real bug):

- **Don't call `preventDefault()` in `addEventListener`** on a button that also has an inline `onclick=` — the onclick won't fire.
- **Don't hardcode `color:#fff`** except on buttons or badges with a solid background. Use `var(--ink)`.
- **Don't hardcode `rgba(…)`** for theme-aware text or borders. Use a CSS variable so dark/light switch works.
- **Don't insert `<style>…</style>` or `<script>` tags inside an existing `<script>` block.** Inject CSS via `document.head.appendChild` instead.
- **Don't remove `var(--ink-3)` aliases** in `body.dark` — they keep ghost text visible in dark mode.

## Post-edit verification

After any edit, run these checks:

1. **JS brace balance** in the edited block. Quick check around the edit window with grep.
2. **CSS brace balance** — same, in the `<style>` blocks you touched.
3. **Tag balance** — `grep -c '<script' index.html` should equal `grep -c '</script>' index.html`.
4. **Trace one logical path mentally** (e.g. "if user is admin, what happens when they click X?").

## iOS-specific gotchas

- A CSS class may silently fail to apply on real iPhone Safari even when it works on desktop. For mission-critical elements (anything that gates check-in), prefer inline `style="…"` over class-based styling.
- Firebase IndexedDB cold-start takes 3-8s on iOS PWA. If a new feature reads Firebase, gate the UI on the loading state — don't render half a widget.

## Before pushing

Run the rudy-deploy skill. The three-file rule (index.html + sw.js + version.json) is iron-clad.
