---
name: rudy-careful
description: Pre-flight + verify protocol for high-stakes RUDY work. Use whenever the user asks for a rewrite, redesign, refactor, or "do it again from scratch"; whenever a deploy is involved (index.html / sw.js / version.json); whenever a bug fix is requested for something the user just reported; whenever the user explicitly says "คิดให้ดี" / "รอบคอบ" / "อย่าเดา" / "ระวัง"; or whenever the change crosses architectural boundaries (Phase A-G layout, Firebase schema, sw.js fetch handler, repo secrets, .github/workflows). Enforces a 3-phase discipline — verify state before editing, trace impacts during editing, verify outcomes after editing — and forces uncertainty to be surfaced explicitly rather than guessed past. Encodes the lessons from session-history mistakes (committing to wrong branch, assuming OAuth flows, miscounting tag balance, skipping post-edit checks).
---

# RUDY careful-work protocol

## Why this exists

Speed kills correctness on a single-file 700KB PWA used by a 3-person team in production. Mistakes that look small — committing to the wrong branch, assuming a library does X, skipping a post-edit grep — cost more time to undo than they save. This skill encodes the discipline of slow-down-to-go-faster for any change where the cost of being wrong is high.

It exists because the maintainer's session log contains real instances of: a deploy commit landing on the wrong branch and needing a cherry-pick to recover; an OAuth flow assumed-to-work that didn't; a tag-balance count interpreted as "broken" when it was a pre-existing artifact of comments; and several "I'm pretty sure" claims that grep would have invalidated. All of those were preventable with the checklist below.

## When to engage this skill

Always when:
- The user asks for a rewrite / redesign / "ทำใหม่" / "เปลี่ยนใหม่"
- A deploy is happening (touches `index.html` / `sw.js` / `version.json`)
- A bug is being investigated based on a fresh user report
- The user uses the words "คิดให้ดี" / "รอบคอบ" / "อย่าเดา" / "ระวัง" / "ตรวจ" / "เช็คให้ดี"
- The change touches Phase A-G structure, Firebase schema, sw.js fetch handler, repo secrets, or `.github/workflows/`
- The change is large enough that one mistake won't be obvious from the diff

Skip only for trivial single-line edits where the impact is fully visible in the diff.

## Phase 1 — BEFORE editing (verify state)

1. **Read the request twice.** Parse what the user said two times before responding. Catch the things you skim past on the first read: implicit scope, constraints, "and X must still work".
2. **Confirm the current branch.** `git branch --show-current`. If it's not what you expect, stop and switch.
3. **Confirm the working tree is clean** (or that the uncommitted state is intentional). `git status --short`.
4. **Confirm origin/main is fully fetched and merged.** `git pull origin main` before branching off.
5. **Grep before reading.** Never `Read` `index.html` whole — grep for the symbol/selector/text, then `Read` with `offset`/`limit` around the match.
6. **List affected files explicitly.** Before any Edit/Write, state — in your message to the user — exactly which files will change.

## Phase 2 — DURING editing (trace impacts)

1. **Check ripple effects per edit.** For each file you touch:
   - Removing a DOM element? grep for `getElementById` / `querySelector` / `#id`
   - Changing a CSS rule? grep for the selector — duplicates exist
   - Adding `!important`? Check what `var(--*)` it might override
   - Renaming a JS function? grep for every call site
2. **Apply the matching skill rules.** If editing index.html → rudy-editing-html. If editing sw.js → rudy-sw-fetch. If touching colors → rudy-theme-vars. If deploying → rudy-deploy. If editing workflows → rudy-workflows. The other skills are not optional checks; they are the rules.
3. **Don't refactor while fixing.** If the bug fix is one line, the PR is one line. Cleanup happens in a separate PR.
4. **Don't bypass the 3-file deploy rule "just this once".** Bumping only sw.js or only version.json breaks the auto-update mechanism. There are no exceptions.

## Phase 3 — AFTER editing (verify outcomes)

1. **grep for the change.** Confirm the new string is actually in the file (Edit tool errors silently sometimes if the old_string match was ambiguous).
2. **Brace and tag balance** on touched blocks. For index.html: `grep -c '<script' index.html` and `grep -c '</script>'` should be equal (or differ by a known-stable amount — see `rudy-editing-html` for the baseline).
3. **Version sync** if it was a deploy. `grep -c "vNNN" sw.js` must equal 12. `version.json` must contain `vNNN`.
4. **Bypass list still first** if `sw.js` was touched. `grep -n "shouldBypass(url)" sw.js` must be a smaller line number than `grep -n "method !== " sw.js`.
5. **State the result.** In your message to the user, list what was checked and what was confirmed — not just "done".

## Surface uncertainty — don't guess

When you don't know something, **say so out loud and verify** before acting:

- **Bad:** "I'm pretty sure the Claude GitHub App auto-provisions the OAuth token" → wasn't true.
- **Good:** "I'm not sure if the Claude GitHub App auto-provisions the OAuth token. Let me check the docs before we proceed."
- **Bad:** Counting `<script` tags as evidence of a real imbalance.
- **Good:** Comparing the count against the pre-edit baseline (via `git stash`) to confirm the imbalance was already there.
- **Bad:** "Just push to main" while still on a branch.
- **Good:** "Checking branch first… I'm on `add-rudy-skills-suite`, switching to main before committing the deploy."

If two reasonable interpretations of the user's request exist, **ask before doing**, not after.

## Shortcuts to never take

- "Squash the deploy bump into a 'misc' commit" — bumps must be visible in their own commit body.
- "Skip the post-edit grep, the edit clearly worked" — Edit can silently miss when old_string is duplicated.
- "Use `git push --force` to clean up my mistake" — destructive; ask the user first (see system rules).
- "Assume the secret is in the repo because the workflow exists" — the birthday workflow shipped without its script for months. Always verify presence.
- "It looks fine on desktop, it'll work on iOS" — iOS Safari has dropped CSS classes silently before (CLAUDE.md §6). For mission-critical UI, prefer inline `style="…"` over class-based styling.

## When the user is unhappy with the result

Don't immediately re-do. First:
1. Ask what specifically is wrong — vibes-based rejection invites another vibes-based attempt that may also be wrong.
2. Confirm what the user *does* want, with concrete options if helpful.
3. Then redo.

If the user has rejected multiple attempts on the same area (e.g. the splash design iterated five times), **stop and ask whether the underlying technology is the limit** (e.g. CSS can't produce After Effects quality) rather than try a sixth variation.

## What this skill does NOT cover

- The specific rules per area (use the area-specific skills: rudy-editing-html / rudy-theme-vars / rudy-sw-fetch / rudy-firebase-data / rudy-deploy / rudy-workflows / rudy-bug-triage).

This skill is the meta-protocol that wraps them: when to slow down, what to verify, when to ask, when to refuse to guess.
