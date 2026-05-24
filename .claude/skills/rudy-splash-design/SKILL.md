---
name: rudy-splash-design
description: Design protocol for the RUDY splash/intro animation (the `#init-overlay` block in index.html that shows during cold-start). Use whenever the user asks to "ทำหน้าโหลด" / "ทำ intro" / "ทำ splash" / "เปลี่ยน splash" / "ออกแบบอนิเมชั่น" / "redesign the loading screen", whenever editing the `#init-overlay` markup, whenever changing `MIN_LOADING_MS`, or whenever a previous splash design has been rejected. Encodes the hard lessons from v161-v204 (40+ splash iterations): ask before designing, respect CSS ceilings, follow the cleanup discipline, coordinate MIN_LOADING_MS with the animation timeline, and know when to stop iterating and route to Lottie / pre-rendered video instead.
---

# RUDY splash design protocol

## Why this exists

The RUDY splash was rebuilt 40+ times between v161 and v204 — Dime-style spiral, minimalist hero, AAA cinematic, Liquid Glass blobs, glass shatter, Cosmic Genesis. Most rebuilds were rejected. The pattern was: ship something elaborate → "ไม่ชอบ ทำใหม่" → ship something else elaborate → repeat. The lesson is that splash design is a taste decision the maintainer holds, not a problem to optimize. Better to ask the right question once than to ship five answers nobody wanted.

This skill exists so future Claude sessions don't repeat that loop.

## Before you design — ask

If the user said anything broader than "change line X to Y", ask which direction first. Don't guess between:

- **Minimal** (Apple/Linear/Stripe) — single hero element + fade. ~1.5s.
- **Cinematic** (Hollywood / sci-fi) — multi-scene with particles, beams, flash, etc. ~3-5s.
- **Liquid / organic** (iOS 26 Liquid Glass) — fluid morphing, glass material, soft.
- **Typography-only** — no icon, animated wordmark. Very current.
- **Pre-rendered video / Lottie** — anything that needs After Effects quality.

A single AskUserQuestion with 3-4 distinct options costs nothing and saves 3 rejected redesigns.

## Hard CSS ceiling — know when to route out

Pure CSS in the browser **cannot** do:
- True particle physics (collisions, gravity, wind)
- Realistic light raytracing, volumetric fog with depth
- Hand-drawn frame-by-frame animation (anime style)
- Real motion blur, depth of field
- Anything that looks like a YouTube intro or After Effects render

If the user uses words like "เหมือน YouTube / อนิเมะ / สมจริง / ภาพยนตร์ระดับ Hollywood / After Effects" — **stop and explain the ceiling**. Don't attempt another CSS variation. Route them to one of:

1. **Lottie** (lottiefiles.com) — vector animations exported from After Effects. Free assets. ~50KB JSON. Cmd: integrate via `lottie-web` library.
2. **MP4 video** — generated via Hailuo / Kling / Pixverse AI (free trial credits, no card). User provides the file.
3. **Static SVG with simple CSS** — accept the minimal aesthetic.

Don't oversell what CSS can deliver. Iteration #5 of "more spectacular" is still CSS.

## Cleanup discipline (mandatory)

The splash has accumulated dead code across versions (rudy-l*, rudy-splash-wm, cn-*, lg-*, sh-*, cg-*). When you write a new splash:

1. **Replace the entire HTML inside `#init-overlay`** — don't add on top of existing.
2. **Delete the entire previous CSS namespace** — if previous was `sh-*`, remove every `.sh-*` rule and every `shXxx` keyframe before adding your `cg-*` block.
3. **Keep the rudyStatusIn keyframe** (used by the always-present status text).
4. **Keep the Legacy dm-* keyframes** (referenced by `.dm-droplet` elsewhere in the app — DO NOT remove).
5. After rewrite, grep for the old namespace: `grep -c "\.OLD-\|OLD-stage\|OLD-blob" index.html` — must be 0 (or only matches unrelated to the splash, like a different `.lg-canvas` feature).

Net diff should be **deletion-heavy** (old splash removed, new splash added). If your diff is "+200 lines −20 lines", you skipped step 2 and the file is bloating.

## Timing budget — coordinate with MIN_LOADING_MS

The splash must finish before the overlay fades. Three numbers must agree:

1. **Final primary animation end time** — when the last main element settles (logo, wordmark — not infinite idle pulses).
2. **Status text delay** — must be slightly **after** the final animation end time (so it doesn't compete for attention while wordmark is settling).
3. **`MIN_LOADING_MS` in the script section** — must be slightly **after** the status text appears, so the user sees the settled state before the 0.5s fade begins.

Reference table from past designs:

| Style        | Final anim ends | Status delay | MIN_LOADING_MS |
|--------------|-----------------|--------------|----------------|
| Minimal      | ~1.3s           | 1.5s         | 2000           |
| Medium       | ~2.5s           | 2.7s         | 3500           |
| Cinematic    | ~4.0s           | 4.5s         | 5000           |

If you rewrite the splash, **always update all three together**. Skipping `MIN_LOADING_MS` means the gate fires mid-animation and the wordmark gets cut off — looks broken.

## Performance budgets for iOS Safari PWA

Tested on iPhone 12+. Approximate ceilings before noticeable jank:

- DOM elements during splash: < **100** (cosmic genesis was 90, ok; don't go to 200)
- `filter: blur()` on **persistently animated elements**: < 3 at any moment (expensive — use sparingly, prefer static blur)
- `backdrop-filter` blur: < 2 concurrent elements (very expensive)
- `mix-blend-mode`: ok for ~5 elements; lots more starts to lag
- `clip-path: polygon(...)` static: fine
- `clip-path` **animated**: avoid (re-rasters every frame)

Stick to `transform` + `opacity` for the bulk of the animation — both GPU-accelerated. Anything that animates `width`/`height`/`top`/`left` triggers layout and tanks frame rate.

## Color palette (don't drift)

The whole app is built around two accents:

- Primary brand cyan: `#5AC8FA` (matches iOS systemBlue)
- Background dark: `#0A1F4C` / `#0A1430` / `#04081E` ranges
- White: `#fff` for hero text

Splash designs can introduce one or two **complementary accents** (purple `#B19CFF`, pink `#FF8CC8`, warm `#FFA888`) for variety. But the cyan must dominate. Don't introduce green, red, or yellow as primary — they fight the rest of the UI.

## Anti-patterns from past iterations

| Pattern | Version | Why it failed |
|---|---|---|
| Stack 15+ effect layers all firing at once | v191 maximalist | Visual chaos, no hierarchy |
| Particles + spiral + chromatic + sparkle simultaneously | v188 logo spiral | Felt cluttered, eye couldn't focus |
| Inserting new splash without deleting old CSS namespace | (multiple) | File bloat, dead code keeps growing |
| Cinematic 5s when MIN_LOADING_MS stayed at 2s | v179 era | Animation cut off mid-reveal |
| Putting `<style>` or `<script>` inside an existing `<script>` block | v171 long-press preview | Broke JS syntax, app crashed |
| Hardcoded `color:#fff` for body text in splash | (multiple) | Light-mode broke — splash bg is always dark, so use is debatable, but follow the project convention via `rudy-theme-vars` |
| Animating `clip-path` shape | (skipped) | Heavy on iOS; static `clip-path` is fine but don't tween its vertices |

## The iteration trap — stop after 3 rejections

If the user has rejected the same general category of splash 3 times running ("too busy" / "ไม่ชอบ ทำใหม่"), **stop iterating**. The problem is no longer in the design; it's that:

- The user wants something CSS can't deliver (route to Lottie/video — see ceiling section), OR
- The user can't articulate what they want (ask for a reference: "send a screenshot/video of one you DO like"), OR
- The user is bored with the work and any further iteration just costs time.

A 4th attempt without diagnosis is wasted tokens. Use `AskUserQuestion` to surface the meta-question.

## Markup hygiene

`#init-overlay` lives at the top of `<body>` in index.html (around line 3138). Inside it, after the always-present `#dm-bubbles` / `#dm-sparkles` (hidden, referenced by Phase D — don't remove them), put the splash markup, then `#overlay-status`, then `#overlay-skip`. Don't reorder or remove the outer wrapper — the JS that hides the overlay reads it by id.

## What this skill does NOT cover

- The `hideInitOverlay` JS logic (around line 4690) and `MIN_LOADING_MS` (around line 4750) — read those if you need to change fade timing
- App-side UI/CSS outside the splash (use `rudy-editing-html` / `rudy-theme-vars`)
- The PWA manifest icon (separate file `icon-192.png` — splash design can use it but shouldn't redefine it)

This skill is strictly about designing and shipping the splash/intro animation inside `#init-overlay` without re-living the v161-v204 iteration loop.
