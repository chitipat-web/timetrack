---
name: rudy-workflows
description: Safety rules for RUDY's GitHub Actions workflows (.github/workflows/*.yml) and the Node scripts they invoke (scripts/*.js). Use whenever editing any workflow YAML, adding a new scheduled job, writing or modifying a script under scripts/, debugging "the workflow failed" / "the email didn't go out" / "the cron isn't firing", adjusting a cron schedule, or changing repo secrets. Enforces the workflow-↔-script naming match (every `run: node X.js` must have a corresponding scripts/X.js committed), the Israel timezone gotcha for cron (IDT 5:00 UTC summer, IST 6:00 UTC winter — clocks must be updated twice a year on DST switches), and the required-secrets-per-workflow contract.
---

# RUDY GitHub Actions — workflow + script rules

## Why this exists

RUDY has 7+ scheduled Actions that fan out emails and push notifications to the team. Each workflow runs a Node script from `scripts/`. When the workflow YAML and the script drift apart — wrong filename, missing secret, wrong cron time of year — the workflow fails silently on schedule. Users get no email. The repo looks fine. The only way to notice is to check the Actions tab.

The `notify-birthday.yml` workflow shipped pointing at a non-existent `notify-birthday.js` and failed on every run from day one until it was deleted in May 2026. This skill exists to prevent that class of bug.

## The workflow-↔-script consistency rule (iron-clad)

For every `run: node <name>.js` line in any `.github/workflows/*.yml`:

1. The file `scripts/<name>.js` MUST be committed to the repo.
2. The script MUST read every secret listed in the workflow's `env:` block (otherwise the secret was added speculatively and is dead config).
3. The script MUST `process.exit(1)` on any error so the workflow status reflects reality. Silent failures are worse than loud ones.

Before merging a PR that touches `.github/workflows/`, grep for the `run: node` lines and confirm every script exists:

```bash
grep -h "run: node" .github/workflows/*.yml | awk '{print $3}' | sort -u | while read s; do
  test -f "scripts/$s" && echo "OK  $s" || echo "MISSING  $s"
done
```

If anything prints `MISSING`, the workflow is broken before it ever runs. Fix or revert before merge.

## Cron schedules — Israel timezone gotcha

The RUDY team is in Israel. Cron in GitHub Actions runs in UTC. Israel observes **IDT (UTC+3) in summer, IST (UTC+2) in winter** — so the same "8 AM Israel time" cron needs different UTC values across seasons:

| Wall clock (Israel) | Summer cron (IDT)  | Winter cron (IST)  |
|---|---|---|
| 06:00 | `0 3 * * *`   | `0 4 * * *`   |
| 08:00 | `0 5 * * *`   | `0 6 * * *`   |
| 16:30 | `30 13 * * *` | `30 14 * * *` |

DST in Israel: clocks **spring forward last Friday of March, fall back last Sunday of October**. Update cron expressions on those dates — GitHub Actions does not handle DST automatically.

Every workflow with a cron should have a comment at the top noting the expected wall-clock time + a reminder for the seasonal switch, e.g.:

```yaml
# 8:00 IDT (Israel Summer Time) = 05:00 UTC
# ⚠️ Winter (IST, UTC+2): change to '0 6 * * *'
- cron: '0 5 * * *'
```

If the timezone in a workflow comment doesn't match the cron expression's current season, fix it before deploying — schedules can drift by 1 hour and quietly miss their window.

## Required secrets per workflow type

| Workflow type | Secrets needed | Why |
|---|---|---|
| Email (Gmail SMTP) | `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `FIREBASE_SERVICE_KEY` | nodemailer auth + RTDB read |
| Push (FCM web-push) | `FIREBASE_SERVICE_KEY`, `VAPID_PRIVATE`, `VAPID_PUBLIC`, `VAPID_SUBJECT` | RTDB read + web-push send |
| AI-augmented email | All email secrets above + `GEMINI_API_KEY` | calls generativelanguage.googleapis.com |

If a workflow lists a secret in `env:` that the script never reads, the secret was added speculatively — either the script is missing a feature or the env declaration is dead config. Audit and reconcile.

## When you add a new workflow

1. Pick a `<name>.js` that doesn't already exist in `scripts/`.
2. **Write the script first.** Test it locally:
   ```bash
   cd scripts && GMAIL_USER=... GMAIL_APP_PASSWORD=... node <name>.js
   ```
   Send to a test inbox first, not the team's real address.
3. Then write the workflow YAML pointing at that script.
4. Commit both files in the same PR.
5. Trigger manually via `workflow_dispatch` once to verify it works in CI before relying on the cron.
6. Add the cron with the IDT comment block from the timezone section.

## When you delete a workflow

If you delete `.github/workflows/X.yml`, check whether the corresponding `scripts/X.js` is used by any other workflow before deleting it too:

```bash
grep -l "node X.js" .github/workflows/*.yml
```

Some shared helpers in `scripts/lib/` (e.g. `firebase.js`, `notify.js`, `ai-content.js`) are used by every script — never delete those.

## When a workflow fails

Run this before assuming the app code is broken:

1. Open the failed run, click the failed step, read the error verbatim.
2. **`Error: Cannot find module './X.js'`** → workflow points at a missing script. Either commit the script or fix the YAML to point at the right script. Same root cause as the birthday-workflow bug.
3. **`❌ Missing required secrets`** → a secret in the workflow's `env:` is unset or empty. Add it via repo Settings → Secrets and variables → Actions.
4. **`FATAL:` followed by a Firebase auth error** → `FIREBASE_SERVICE_KEY` is malformed. It must be the **raw JSON** service-account key on a single line (no surrounding quotes, no escaped newlines — paste the JSON contents directly).
5. **`Invalid login: 535-5.7.8 Username and Password not accepted`** → `GMAIL_APP_PASSWORD` is wrong or the Gmail account has 2FA without an app password. Generate a new app password.
6. If everything looks right but it still fails on schedule — check the `cron` against the current Israel season per the timezone table above.

## Scripts that exist (catalog, last audited 2026-05-21)

| Script | Purpose | Used by workflow |
|---|---|---|
| `notify-checkin-email.js`  | Smart check-in reminder, Gemini-generated copy   | `notify-checkin-email.yml`  |
| `notify-checkout-email.js` | Smart check-out reminder, Gemini-generated copy  | `notify-checkout-email.yml` |
| `check-no-checkout.js`     | Late-evening "did you forget to check out?" push | `notify-checkout.yml`       |
| `check-early-reminder.js`  | Early-morning ping before check-in cutoff        | `notify-early.yml`          |
| `check-birthday.js`        | Push notification for birthday person(s) of day  | *(orphan — `notify-birthday.yml` was deleted)* |
| `weekly-summary-email.js`  | Weekly summary email                             | `weekly-summary-email.yml`  |
| `test-email.js`            | Manual email smoke test                          | `test-email.yml`            |
| `test-push.js`             | Manual push smoke test                           | `test-push.yml`             |
| `lib/firebase.js`          | Firebase Admin SDK init (shared)                 | *(library, no workflow)*    |
| `lib/notify.js`            | web-push fan-out helper (shared)                 | *(library, no workflow)*    |
| `lib/ai-content.js`        | Gemini-powered email body generation (shared)    | *(library, no workflow)*    |

If you add or remove a script, **update this table in this skill file**. The catalog is the source of truth for what RUDY's automation actually does.

## What this skill does NOT cover

- App-side runtime code (use `rudy-editing-html` / `rudy-deploy`)
- Firebase RTDB schema (use `rudy-firebase-data`)
- Service worker fetch rules (use `rudy-sw-fetch`)
- The detailed Gemini API integration (`lib/ai-content.js` internals — read the file)

This skill is strictly about keeping the GitHub Actions automation layer correct: workflow YAML, the Node scripts it invokes, the secrets it needs, and the cron timing.
