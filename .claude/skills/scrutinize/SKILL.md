---
name: scrutinize
description: Outsider-perspective review for plans, PRs, code changes, or proposed approaches. Use BEFORE writing a new feature, when reviewing someone else's change, when evaluating an approach, or whenever the user says "review" / "ตรวจ" / "ดูให้หน่อย" / "คิดว่าโอเคไหม" / "approach ไหนดี" / "วิธีนี้โอเคไหม" / "มีวิธีที่ง่ายกว่านี้ไหม". Forces the painful early questions ("does this need to exist?", "is there a simpler way?", "which layer is the right place?", "does the system already do this?") before commitment, and requires tracing the call graph through the system instead of just reading the diff. Catches bugs that hide in unchanged code that now gets called differently, and prevents work that didn't need to happen at all.
---

# Scrutinize — review like an outsider, not a teammate

## Why this exists

The fastest way to ship a bad change is to skip the painful questions because they're uncomfortable to ask. "Does this even need to be built?" is uncomfortable when someone already wants to build it. "Is there a simpler way?" is uncomfortable when an approach is already half-designed. "Are we sure this is the right layer?" is uncomfortable when the wrong layer is where the existing code lives.

Outsiders ask these questions because they have no investment in the existing direction. You need to bring that outsider mindset on purpose — to your own plans, to PRs you're reviewing, to designs in progress.

The second failure is reviewing the diff instead of the system. The diff shows what changed. The bugs are in what didn't change but is now called differently.

## When to engage

- BEFORE starting a new feature — pause and ask the painful questions
- When reviewing someone else's plan, PR, or design doc
- When evaluating "should we use library X or library Y"
- When a refactor is proposed — "is the refactor necessary, or am I just uncomfortable with the existing code?"
- When the user says "review" / "ตรวจ" / "ดูที" / "approach ไหนดี" / "วิธีนี้โอเคไหม"

## When to skip

- Single-line typo fixes
- Mechanical follow-ups already scoped by an earlier-agreed plan
- Reverts of a known-bad commit

## The painful questions — ask BEFORE writing code

### 1. Does this need to exist?

Often the right answer is "no, the existing thing covers this." Or "no, no user actually asked for this." Or "yes, but the version we're imagining is 10x bigger than what's actually needed."

Don't skip this question because it feels like an attack on the work. It is protection from unnecessary work.

### 2. Does the system already do this somewhere?

Codebases accumulate. The function you're about to write may already exist with a different name. The middleware you're about to add may already run for a different reason. The cache layer you're proposing may be a re-invention of one three modules over.

`grep` first. Always.

### 3. Which layer is the right place?

A bug in component X may be caused by component X, but the right fix may be in the data passed to X by component Y, or in the validator that should have rejected the data at the API boundary. The right layer is the one closest to the root cause that you control, not the one closest to where the symptom shows.

Wrong-layer fixes accumulate as scar tissue: workarounds in views that should have been validation in models that should have been schema constraints in the DB.

### 4. Is there a simpler version?

Half the proposed designs have a 5-line version hiding in them. Often the 5-line version is identical in user-observable behavior to the 50-line version. The 50-line version exists because it was the first idea, not the simplest one.

Ask: "What's the smallest thing that would satisfy the actual requirement?"

## The verification discipline — trace, don't skim

When reviewing a change (yours or someone else's), don't stop at the diff. Trace the call graph.

For every function the diff touches:

- Who calls it? Are those callers compatible with the new behavior?
- What does it return now vs. before? Does any caller depend on the old return?
- Are there tests for it? Do those tests actually exercise the changed path, or do they pass for unrelated reasons?
- Are there other implementations of the same interface that should change too, or callers that expected uniformity?
- Are there *consumers* (frontend, downstream services, other devs' work-in-progress) that read this surface and will see the new behavior?

The bug-finding rate of "read the diff" reviews is much lower than "trace the call graph" reviews. The latter catches change-at-a-distance bugs that the diff itself does not show.

## Anti-patterns

| Pattern | Why it fails |
|---|---|
| "LGTM" without tracing the call graph | Misses the unchanged code that now behaves differently |
| Read PR description, scan diff, approve | The description says what the author *thinks* changed; the code is what *actually* changed |
| Skip "does this need to exist" because it feels rude | The rude thing is letting unnecessary work waste team time |
| Trust the test pass | Tests pass for many reasons unrelated to the change being correct |
| Confuse "I would have written it differently" with "this is wrong" | Style preferences ≠ defects. Save the bullets for actual bugs. |
| Pick library/approach without checking what the system already has | Re-invention is the most expensive form of "I didn't grep" |
| Review only the happy path | The bugs are almost always in the error path or the edge case |

## For RUDY specifically

- A "small fix" in Phase A that calls into Phase B helpers — trace Phase B too, because a change to Phase A behavior may surface dormant Phase B bugs
- A new field added to Firebase `records` schema — grep every reader (`renderHistory`, exports, leaderboard, reports, OT calc), not just the writer (`saveRec`)
- A "let's add a new IIFE" instinct — first check whether Phase A-G already has the right home for it (see file structure in CLAUDE.md §5)
- A proposed splash redesign — ask first "does the user actually want this redesigned, or did they want something specific tweaked?" (see `rudy-splash-design` — there are 40+ rejected iterations behind that warning)
- A CSS rule that "isn't taking effect" — before adding `!important`, `grep` for the selector across the whole file; an earlier rule with `!important` further down is the cause (CLAUDE.md §6 lesson 3)
