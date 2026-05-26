---
name: management-talk
description: Translate engineer-to-engineer content into language for non-engineer audiences (VP, Director, PM, customer success, business stakeholders) and adapt the format to the destination channel (JIRA / Slack / standup / email / status page). Use whenever a status update, escalation, incident summary, weekly report, or customer-facing message is being written for an audience that is not the engineer who caused or fixed the issue. Keeps product/component/JIRA-key references; cuts function-level detail. Engages on "report" / "อัปเดต" / "summary" / "เขียนสรุปให้หัวหน้า" / "status" / "incident note" / "explain to PM" / "ส่งให้ทีม" / "ประกาศให้ผู้ใช้".
---

# Management-talk — translate, don't dump

## Why this exists

Engineers default to writing the way they think: stack traces, function names, code paths, mechanism-first. Non-engineers don't read that and don't care. They care about: *who is affected, how badly, who owns it, when it'll be fixed, what they need to do*.

When an engineer dumps their thinking into a JIRA ticket meant for the PM or an email meant for the VP, three things happen:

1. The audience skips the body and replies "what's the impact?"
2. The actual decision-relevant facts get buried under mechanism
3. The engineer looks like they don't understand the audience

The skill is translation, not omission. The technical facts are still relevant; they just have a different presentation contract.

## When to engage

- Status updates going up the org chart
- Incident summaries for non-engineer audiences (CS, support, PM, exec)
- Customer-facing messages about an outage or bug
- Weekly progress reports
- Escalation notes
- Standup updates when leadership is in the room
- In-app announcements to end-users

## When to skip

- Engineer-to-engineer comms (code reviews, debug threads in #dev-channel)
- Technical RFCs and design docs aimed at engineers
- Commit messages and PR descriptions written for engineer reviewers

## The translation rules

### Keep

- Product name, component name, JIRA/ticket key
- Customer impact (which segment, what %, severity)
- Owner (name + team)
- ETA / current status / blockers
- Action requested (and "nothing needed from you" is a valid action)

### Cut

- Function names, variable names, file paths
- Stack trace contents
- Code snippets
- Logs (link to them, don't paste them)
- Internal jargon ("the v3 consumer", "the kafka rebalance event") unless the audience already uses those terms

### Convert

| Engineer phrasing | Management translation |
|---|---|
| "Hit a race condition in `processOrder()`" | "Intermittent failure on the Orders service; ~3% of checkouts affected" |
| "We added a null check on the response" | "Mitigation deployed; underlying issue under investigation" |
| "The Kafka consumer was lagging" | "Order updates were delayed by ~5 minutes" |
| "Cache wasn't invalidated" | "Customers saw stale data for ~10 minutes after edits" |
| "Pushed a patch to main, awaiting CI" | "Fix in progress; will be live by [time]" |

The pattern: convert *mechanism* into *user-observable consequence + business impact*.

## Format per channel

### JIRA (PM-facing)

- One-line summary at the top: **"Status: [color] — [user-impact in 10 words] — ETA [time]"**
- Owner, component, environment as structured fields
- Description: 2-3 sentences of user-visible impact + current state
- Comments for ongoing progress, newest first
- Link to technical detail (Slack thread, runbook) — don't inline

### Slack (mixed audience)

- One-paragraph TL;DR in the channel
- Thread for technical detail
- Use 🔴 / 🟡 / 🟢 status emoji at the top of the TL;DR for skimmability
- Tag owner once, not repeatedly
- If asking for action, put it in **bold** so skim-readers see it

### Standup (verbal, ~30 seconds)

- One sentence on what happened
- One sentence on current state
- One sentence on next step + blocker (if any)
- Stop. Don't narrate the debug session.

### Email (exec)

- Subject line is the headline: **"[Severity] [Product] — [one-line impact]"**
- First paragraph is the entire summary; assume they read only that
- Second paragraph: what was done, what's next, ETA
- Third paragraph (optional): context, links to detail
- No code blocks. No log paste. Link out.

### Status page (customer-facing)

- Plain language. Past-tense for resolved, present-tense for ongoing
- State customer impact clearly ("users were unable to check out")
- Avoid blame, avoid jargon, avoid promising specific RCA timelines
- Update when state changes, not on a fixed cadence

## Anti-patterns

| Pattern | Why it fails |
|---|---|
| Paste the stack trace in the PM ticket | PM doesn't read it; the actual impact line never gets read because the stack trace is in the way |
| Lead with the cause, bury the impact | Audience needs impact first to decide whether to keep reading |
| Use code identifiers in exec emails | The exec doesn't know what `processOrder()` is and can't ask without seeming uninformed |
| Same message body across all channels | A standup line doesn't fit in JIRA; an email body doesn't fit in Slack |
| Hedge everything ("might be," "could be," "investigating") with no commitment | Leadership needs to make decisions; pure hedging gives them nothing actionable |
| Forget the ask | Every upward comm should make clear what (if anything) is needed from the reader |
| Apologize without facts | "Sorry for the issue" without "X% of users from Y to Z UTC, fixed at W, prevention in PR #N" is empty calories |

## For RUDY specifically

RUDY has no PMs or execs — Pat is the engineer, the admin, and the team's primary user. But the principle applies to **Pat-to-team** updates via the in-app `announces` node:

- When announcing a bug fix to the 3-person team, the message should say *what they should do* ("เคลียร์ cache แล้วเปิดใหม่"), not *what Pat fixed in the code* ("แก้ Phase A try/catch ที่จับ exception ของ FCM init")
- When reporting a past outage in retro, the relevant facts are user-visible: *"ลงเวลาไม่ได้ระหว่าง 14:00-14:35 IDT, สาเหตุ Firebase region outage"* — not *"Realtime Database connection got into a backoff loop on the `records` listener"*
- When the team reports a new feature is live, lead with what the user can do, not the implementation: *"กดที่ icon นาฬิกาเพื่อดูสถิติ OT รายสัปดาห์ได้แล้ว"* not *"shipped Phase C leaderboard with weekly OT aggregation"*

Same skill, smaller audience.
