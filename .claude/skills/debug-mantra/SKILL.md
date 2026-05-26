---
name: debug-mantra
description: Four-step debug discipline (reproduce → trace → falsify → cross-reference) for any bug investigation. Use whenever the user reports something is broken — "พัง" / "ไม่ทำงาน" / "เสีย" / "broken" / "error" / "doesn't work" / "the fix didn't fix it" / "regressed" — or whenever investigating a defect or unexpected behavior. Forces verification before patching, prevents symptom-fixes that re-break next week, and stops the "looks like X so it must be X" trap. Complements rudy-bug-triage (which handles the RUDY-specific deploy-first / cache-vs-bug check) by enforcing the generic debugging hygiene that applies to all defects.
---

# Debug mantra — four steps before you touch the code

## Why this exists

Most "fixes" that get re-opened in two weeks didn't fix the bug — they patched the symptom. The bug was still there, and the next time the trigger fired, it came back. Or worse: the patch covered the bug, which then exploded somewhere else.

The 4-step debug mantra is the discipline that prevents that. It is slower than "I see the error message, I know what's wrong, fix it" — but it is the difference between closing a ticket and burying it.

## When to engage

- Any bug report — yours, the user's, or one inherited from a ticket
- Any unexpected behavior in test, dev, or prod
- Any regression ("it used to work")
- Any "the fix didn't fix it" follow-up
- Any error log or stack trace whose cause isn't fully obvious from the line that threw

## When to skip

- A typo with no behavioral consequence (single-character edit, no flow impact)
- A trivially-obvious one-line revert to a known-good state
- Cosmetic-only changes with no logic

## The four steps

### 1. Reproduce — make the bug happen on demand

Until you can make the bug happen at will, you don't have a bug; you have a story about a bug. You can't fix what you can't trigger, and you can't verify a fix you can't trigger again afterward.

- If it's intermittent, find the trigger. Time of day? Specific input? Particular browser? After a specific other action? Under load?
- Reduce to the smallest input that still triggers it. Half the work of debugging is shrinking the test case.
- If you genuinely cannot reproduce, that itself is a finding — note it, then decide whether to spend time hunting, add instrumentation and wait, or document the unknown and move on.

A fix shipped without reproduction is a guess shipped without verification.

### 2. Trace — follow the breadcrumbs

Find out what is *actually* happening, not what you think is happening. Logs, console output, network tab, breakpoints, print statements, `git log`, `git blame`.

The question is: at the moment the bug fires, what is the system actually doing? Not "what should it do," not "what does the code suggest it does" — what does the running system show?

If the breadcrumb trail goes cold halfway, add more breadcrumbs. Re-run. Trace again.

### 3. Falsify — try to disprove your hypothesis

This is the step everyone skips. You have a theory. The natural urge is to fix the thing your theory points to and ship. Don't.

Ask: "What would prove my theory wrong?" Then test that.

- "I think it's a race condition" → can you make it happen single-threaded? If yes, it's not the race.
- "I think it's the new code in PR #423" → does reverting PR #423 actually fix it?
- "I think the cache is stale" → does it still break with cache disabled?
- "I think it's the timezone" → does it still break with the device set to UTC?

A theory that survives a real falsification attempt is worth trusting. A theory you just like is not.

### 4. Cross-reference — check every breadcrumb

Before you fix, check the surroundings. Have similar bugs been reported before? Are there other places where the same pattern exists? Did a recent commit touch this area? Are there callers of this function that will be affected by your fix?

This is where you discover that the symptom in one place has a root cause that affects three other places — and where you avoid the "fix" that creates two new bugs.

## Anti-patterns

| Pattern | Why it fails |
|---|---|
| "I see the error, I know what it is" → patch | The error message is a symptom, not the root cause. The actual bug is often upstream of where it surfaced. |
| Skip reproduction because "it's obvious" | If you didn't reproduce, you can't verify the fix |
| Believe the first hypothesis | First hypotheses are wrong about half the time. Falsification beats confirmation. |
| Fix the surface and close the ticket | Bug returns; trust in your fixes erodes; team starts re-validating your work |
| Trust `git blame` as the cause | The line shown by blame may be the latest *touched* line, not where the bug was introduced |
| Treat the stack trace as the cause | The stack trace is where it threw. The cause is often several frames up, or in upstream data |

## For RUDY specifically

- "iPhone ยังเห็นเวอร์ชั่นเก่า" — reproduce first (did the SW actually try to update? did `version.json` polling fire?), then trace (`version.json` in repo vs sw.js cache constants vs deployed version on GitHub Pages), then falsify (is it really iOS cache, or is `version.json` simply not updated?), then cross-reference (see `rudy-bug-triage`).
- "check-in บันทึกเวลาผิด" — reproduce (which user, which date, which browser), trace (Firebase node, schema field, timezone), falsify (is it really a timezone bug, or is the device clock wrong?), cross-reference (other timestamps in `records/`, similar paths in `saveRec`).
- "ปุ่ม OT ไม่ทำงาน" — reproduce first (which device, which mode), then trace (is the click handler firing? is the inline `onclick` clobbered by an `addEventListener` with `preventDefault()`? — see CLAUDE.md §6 lesson 2), then falsify, then cross-reference other buttons in the same Phase.
