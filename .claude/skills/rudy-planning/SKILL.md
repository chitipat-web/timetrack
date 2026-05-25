---
name: rudy-planning
description: Pre-work planning protocol for RUDY tasks. Use BEFORE the first Edit/Write whenever the request has more than one reasonable approach, touches multiple files, crosses Phase A-G boundaries, adds a new feature, will involve a version bump (deploy), or whenever the user said "วางแผน" / "ออกแบบ" / "คิดให้รอบคอบก่อน" / "ทำใหม่" / "redesign" / "refactor" / "rewrite" / "วิธีไหนดี" / "approach" / "plan first". Six-checkpoint discipline (goal / scope / choices / unknowns / done / rollback) plus decompose-into-smallest-step. Complements rudy-careful (which covers during-and-after) by handling the before — the framing failures that lead to 40+ rejected splash iterations, bloated diffs from scope creep, OAuth-flow assumptions that wasted afternoons, and silent picks between options the user wanted to choose.
---

# RUDY planning protocol

## Why this exists

Most RUDY mistakes that this codebase has seen weren't bugs in code — they were bugs in framing. Shipping a splash redesign before asking direction (40+ rejected iterations from v161-v204). Refactoring "while I'm here" inside a one-line bug fix (bloated diffs, hard to revert). Picking an OAuth library and integrating it before checking whether the GitHub App auto-provisions one (wasted afternoon). Committing to a `claude/...` branch when the user explicitly authorized `main` (cherry-pick recovery).

Every one of these would have been prevented by a 60-second written plan: what's the goal, what changes, what's already-decided vs. needs-user-input, what does "done" look like, where does the work land. This skill is that 60-second plan, made into a checklist.

It complements `rudy-careful` (which is the *during-and-after* discipline) by handling the *before*.

## When to engage this skill

Always when:

- The request has more than one reasonable approach (font choice, splash style, where to put a new feature, library selection)
- The change touches more than 2 files or crosses Phase A-G boundaries
- The user said "ทำใหม่" / "redesign" / "refactor" / "rewrite" / "ออกแบบ" / "วางแผน" / "วิธีไหนดี" / "approach" / "plan first"
- A new feature is being added (vs. a bug fix to existing code)
- The deploy will involve a version bump (so the rollback path matters)
- The user explicitly said "คิดให้รอบคอบก่อน" / "วางแผนก่อน" / "อย่ารีบ"

Skip for:

- One-line edits where the impact is fully in the diff
- Pure version bumps after a known-good change
- Reverting a single recent commit
- Mechanical follow-ups already scoped by an earlier plan in the same session

## The plan — six checkpoints

Write these to the user (or to yourself out loud) BEFORE the first Edit/Write. If you can't answer any of them, you don't have a plan yet — go gather info.

### 1. Goal — one sentence, in the user's words

What is the user trying to achieve? Quote them. If you're paraphrasing, you may have re-framed the request into something easier-to-solve but not actually-what-they-want.

- Bad: "Improve the splash." → too vague, will iterate forever.
- Good: "Replace the wordmark font with something more cinematic, keeping the v206 effect stack intact."

### 2. Scope — in / out / explicitly-out

| In                                                  | Out                                | Explicitly out (tempting but no)                          |
|-----------------------------------------------------|------------------------------------|-----------------------------------------------------------|
| Change `font-family` in `.apx-text` and `.apx-aberr`| Backwards compat with v205         | Touching status text font (it's Sarabun, fine as-is)      |
| Adjust letter-spacing + size for Cinzel proportions | Re-tune chrome gradient            | Cleanup of legacy `dm-*` keyframes (separate task)        |
| Bump version per CLAUDE.md                          | New `MIN_LOADING_MS`               | Anything else "while I'm in there"                        |

The **Explicitly out** column is the most important. It blocks scope creep mid-edit. Write it before starting, or you'll discover it as regret.

### 3. Choices — surface before deciding

If multiple reasonable approaches exist, list them with tradeoffs and **ask the user**, via `AskUserQuestion`, before picking.

The wrong move is to pick silently and ship — even if your pick is good, you've spent the user's trust budget on a decision they wanted to make. Most rejections of "the wrong design" came from this exact failure mode.

Examples from this codebase that needed asking, not guessing:

- Which font? (Cinzel vs Playfair vs Didot vs Bodoni)
- Self-host or Google Fonts? (offline / cache tradeoff)
- v205 with new font, or v206 from scratch? (scope size)
- Push to `claude/...` branch or `main`? (branch policy)
- Lottie / video / pure CSS? (CSS ceiling tradeoff — see `rudy-splash-design`)

Rule of thumb: if you can articulate a tradeoff between two options, you need to ask, not pick.

### 4. Unknowns — what needs verification first

List every assumption that, if wrong, would change the plan. Then verify each one before any Edit. Don't write "I'm pretty sure X" — go check.

Common RUDY unknowns to check up front:

- Does this file/element already exist? (`grep` it before assuming)
- Which branch is current? (`git branch --show-current`)
- Is the working tree clean? (`git status --short`)
- Is `origin/main` ahead/behind? (`git fetch origin main && git status`)
- Does the SW bypass list need a new entry for an added external domain?
- Does the change touch a Phase A-G IIFE that has dependencies elsewhere?
- Does the user actually want it on `main` this session, or did the system spec say otherwise?

If verification turns up something unexpected, **the plan changes**. Don't push through.

### 5. Done — the success condition, written in advance

What does "this worked" look like? Write the exact check now, before the work, so you can't be tempted to declare success early.

Examples (good — concrete, verifiable):

- "After deploy, `version.json` returns v207 on GitHub Pages, sw.js cache constants all read v207, and on a fresh PWA install the splash shows Cinzel font."
- "After fix, on iPhone Safari, tapping the check-in button at 06:01 IDT records `isLate: false`."
- "After refactor, `grep -c "old-class-name"` returns 0 across the repo, and the splash still renders identical pixel-for-pixel."

Examples (bad — no termination):

- "Looks better."
- "Feels cleaner."
- "Splash is more polished."

If the success condition is vague, the work has no termination — that's the same trap as the v161-v204 splash loop.

### 6. Rollback — how to undo, in one step

If this lands and turns out wrong, what's the recovery? Be specific:

- **Single commit on `main`** → `git revert <sha>` + push. Quick. Acceptable.
- **Multiple commits on `main`** → harder to revert cleanly; consider squashing or branching.
- **Branch + PR** → close the PR or revert the merge commit. Slow but isolated.
- **Touches `sw.js` cache version** → you can't roll back to `vNNN-1` cleanly because clients have already cached it; revert AND bump to `vNNN+1` in the same recovery commit.

If the rollback is "we'll have to debug forward because we can't undo this," the first step is too big — decompose further.

## Decompose into the smallest reversible step

CLAUDE.md §3.4: *"ห้ามแก้รวดเดียว ให้แก้ทีละจุด ทดสอบ แล้วจึงไปจุดถัดไป"*. The plan should produce a sequence of edits, each of which:

- Is independently meaningful (a coherent commit message could describe it)
- Leaves the app in a working state if you stop after it
- Could be reverted without unrelated damage

If a step requires "and also change X, Y, Z" to make sense, decompose further.

Bad plan: "Rewrite the splash + bump version + delete legacy keyframes + add Cinzel font + adjust status timing." → 5 changes, one revert undoes all.

Good plan, ordered:

1. Replace splash HTML+CSS (one commit, deploy-able alone).
2. Bump version trio (same commit if minor, separate if larger).
3. Cleanup of legacy keyframes (separate task entirely — don't include).

## Parallel vs. sequential — flag dependencies

Once you have the steps, identify which can be batched (independent tool calls in one message) and which must be sequential (later steps need earlier outputs).

- Independent → batch: `grep` for class A, `grep` for class B, read `sw.js` bypass list, check current branch.
- Sequential → must be in order: `Read` file → `Edit` file → `grep` to verify edit landed.

Wasting tokens on serialized reads of independent files is the #2 token sink after re-reading whole `index.html`. Plan parallelism explicitly.

## When the user gives a vague request

If the request is too vague to plan ("ทำหน้าโหลดสวยๆ"), the FIRST step of the plan is `AskUserQuestion` to narrow it. Not "start drafting and see what sticks." See `rudy-splash-design` for the 40+ rejections that came from skipping this step.

A good clarifying question presents 2-4 options with **concrete tradeoffs**, not "what do you want?" The user picks faster when the picking is between specifics, not between abstractions.

## Anti-patterns

| Pattern                                          | Why it fails                                                                                  |
|--------------------------------------------------|-----------------------------------------------------------------------------------------------|
| Skip planning, just start editing                | Hits an unknown halfway, has to backtrack, the partial edit is now in the way                |
| Plan with "I think" assumptions, not verified facts | "I think bypass is at line 40" → it's at 99 → edit lands in wrong place                    |
| Pick between options silently                    | User wanted to pick — now they have to either accept your pick or reject and re-spend tokens |
| Bundle unrelated cleanup into the feature commit | Revert undoes the feature AND the cleanup — both have to be redone                            |
| Skip the "done" definition                       | Work has no end state; the iteration loop opens                                               |
| Treat planning as separate from execution        | Plan goes stale by step 3 because reality differs from assumptions — re-plan inline           |
| State the plan only inside thinking, never to user | User can't course-correct what they can't see                                              |

## How to present the plan to the user

If the plan is short (one obvious step, no choices to surface), one sentence is enough: *"I'm going to change `.apx-text` and `.apx-aberr` to Cinzel, drop size to 78px for fit, and bump v206→v207. Going."*

If the plan involves choices, surface them via `AskUserQuestion` BEFORE listing the rest of the plan — otherwise the user is reading a plan that may not survive their answer.

If the plan involves a deploy or non-trivial scope, write the six checkpoints out (briefly) and let the user nod before the first Edit.

## What this skill does NOT cover

- The during-edit verification discipline (use `rudy-careful`)
- The deploy version-bump rules (use `rudy-deploy`)
- Area-specific rules (use the matching `rudy-*` skill: editing-html / theme-vars / sw-fetch / firebase-data / workflows / bug-triage / splash-design)

This skill is strictly about the 60 seconds BEFORE the first Edit/Write — figuring out *what to do, in what order, with what success criterion*, before doing it.
