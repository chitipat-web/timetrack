---
name: post-mortem
description: Post-mortem writeup discipline for completed bug fixes — REFUSES to produce a post-mortem unless there is (a) a reliable reproduction, (b) an identified root cause (not just "the change made it stop"), and (c) a validated fix (re-run the repro with the fix in place and confirm it no longer triggers). Use after fixing nontrivial bugs, before closing a ticket, when the user says "เขียนสรุป" / "post-mortem" / "writeup" / "อธิบายว่ามันเกิดอะไรขึ้น" / "incident summary" / "explain what happened". A post-mortem written from assumptions is worse than no post-mortem, because it teaches the wrong lesson and gets enshrined as institutional truth.
---

# Post-mortem — only when you actually understand the bug

## Why this exists

The future-you in six months will forget every detail of this bug. So will every teammate. The post-mortem is the only document that survives the institutional amnesia. So it has to be *correct*.

A post-mortem written from assumptions ("we think the cause was X") gets quoted as established fact six months later. The wrong lesson gets encoded. The fix-pattern from a misdiagnosed bug gets applied to unrelated bugs and makes them worse. The honest "I'm not sure why this fixed it" gets excluded from the writeup because it sounds bad. Then the bug returns and nobody remembers that the original fix wasn't understood.

The fix for this is the refusal discipline: this skill **refuses to produce a post-mortem** until the prerequisites are met.

## When to engage

- After any nontrivial bug fix, before the ticket closes
- After an incident (outage, data corruption, customer-visible failure)
- When the user says "post-mortem" / "เขียนสรุป" / "writeup" / "อธิบายว่ามันเกิดอะไรขึ้น" / "incident summary"

## When to skip

- One-line typo fixes with no behavioral impact
- Pure refactors that didn't fix anything
- Doc-only changes

## The three prerequisites — all must be true

If any is false, **do not produce a post-mortem**. Instead, surface to the user which prerequisite is missing and why.

### 1. Reliable reproduction

Before the fix: can you make the bug happen on demand? The exact steps, on the exact environment, with the exact inputs. If "it was intermittent and we don't know what triggered it," you do not have reproduction.

A "we think it stopped happening" is not reproduction; that is observation.

### 2. Identified root cause

The mechanism — the actual chain of events that produced the bug. Not "we changed the timeout and it went away." Not "we added a null check and the error stopped." Those are the *fix*; they are not the *cause*.

Root cause sounds like: *"Function X was called with input Y that had property Z set to null, which the assumed-non-null cast on line N tried to dereference, throwing the error observed on line M of the stack trace. The null-Z input arose because the upstream consumer started receiving messages from a producer running schema v3.2, which dropped Z as optional."*

If you can't write a paragraph like that, you don't have root cause. You have a fix that works for unknown reasons.

### 3. Validated fix

Re-run the reproduction (prereq 1) with the fix applied. Verify the bug no longer fires. Verify nothing else broke.

A code change that *should* fix the bug is not a validated fix.

## When you cannot produce a post-mortem — write this instead

A one-paragraph admission, surfaced explicitly:

> "I cannot write a post-mortem yet. I have a code change that appears to fix the symptom, but [I do not have a reliable way to reproduce the original bug / I do not know why the change works / I did not re-run the repro with the fix in place]. Closing this ticket without those is risky — the bug may return. Recommended next step: [reproduce on staging / add a regression test / instrument logging and wait / leave the ticket open]."

This is more useful than a fabricated post-mortem, because it tells the team what is and is not actually known. The honest unknown is recoverable; the wrong "known" is not.

## The template — when all prerequisites are met

```
## Summary
[Two sentences: what broke, who was affected.]

## Reproduction
[Exact steps. Environment, inputs, expected output, actual output.]

## Root cause
[The mechanism. What chain of events produced the observed failure?]

## Why detection was late
[Why didn't CI catch it? Why didn't existing tests catch it? Why didn't earlier review catch it?]

## Fix
[Commit/PR link. What the change does. Why it addresses the root cause (not just the symptom).]

## Validation
[Re-ran reproduction with fix in place. Result. Other affected paths checked.]

## Prevention
[Test added? Lint rule? Schema constraint? Doc updated? Monitoring alert added? "Nothing" is a valid answer but state it explicitly.]
```

## Anti-patterns

| Pattern | Why it fails |
|---|---|
| Write the post-mortem as you fix, before validating | The mid-fix narrative becomes the official record, including the wrong dead-ends |
| Use the fix as the "root cause" | "We added a defensive null check" is not why null appeared |
| Skip the "why detection was late" section | The whole point is to improve detection; skipping this skips the improvement |
| Say "no further action needed" without considering test/monitor coverage | The bug will re-occur until detection improves |
| Write a post-mortem because process requires it, not because you understand the bug | Future readers can't tell — they'll trust the doc |
| Round up uncertainty to confidence so the writeup sounds clean | The bug will return and the writeup will be quoted as having been wrong |

## For RUDY specifically

For RUDY's scale (3 users, solo dev), a "post-mortem" can be as small as a paragraph in the commit message or an entry in CHANGELOG-style markdown. The discipline still applies: don't write *"fixed cache issue"* when you actually mean *"I added a SW unregister call and it stopped happening, but I'm not sure if that was the actual problem."* The latter is the honest entry; the former rots into a false lesson.

The most common RUDY incident class is a **3-file deploy miss** (index.html bumped but sw.js or version.json forgotten). The honest one-line post-mortem for that class:

> "Missed sw.js cache-version bump in v203 → auto-update silently failed for all users. Detected only when team reported old version on iPhone. Now adding pre-commit check for version-trio sync; see `rudy-deploy`."

That's a complete post-mortem for RUDY's scale: symptom, root cause, detection gap, prevention.
