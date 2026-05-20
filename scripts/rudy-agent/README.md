# RUDY Code Agent

Claude-powered code-helper agent for the RUDY repo. Reads a GitHub issue, plans
a fix using Claude Opus 4.7, edits files via tool use, then opens a PR back to
`main`.

## How to trigger

Either of these:

1. **Label an issue with `claude-fix`** — the workflow fires on the `labeled`
   event.
2. **Comment `@claude fix` on an issue** (not a PR) — fires on the
   `issue_comment` event.

The agent reads the issue title + body, investigates the codebase, makes the
smallest possible edit, and opens a PR. A comment is posted back on the issue
linking to the PR (or explaining why no change was made).

## Setup (one-time, by the repo owner)

Add a repo secret named `ANTHROPIC_API_KEY` containing your Claude API key.
Repo Settings → Secrets and variables → Actions → New repository secret.

`GITHUB_TOKEN` is provided automatically by Actions — no setup needed.

The workflow at `.github/workflows/rudy-agent.yml` declares
`permissions: contents:write, pull-requests:write, issues:write` so the bot
can push a branch, open a PR, and comment back on the issue.

## What the agent knows about RUDY

The system prompt at the top of `agent.mjs` bakes in:

- The **three-file deploy rule** — every code-change deploy must bump version
  in `sw.js` (3 cache constants + `GET_VERSION` + build comment + log) **and**
  `version.json`, all to the same `vNNN`.
- **`index.html` safety** — never read the whole 700KB file; always grep first.
- **Service worker rules** — bypass list must precede the method check; never
  cache `version.json`.
- **Theme variables** — `var(--ink)` not `color:#fff`; no hardcoded `rgba()`
  for theme-aware text.
- **Firebase schema** — record fields, region, Israel timezone for `date`.

These mirror the in-repo `CLAUDE.md` and `.claude/skills/*/SKILL.md` so a fresh
agent run lands with the same context the maintainer (Claude Code session) has.

## Tool surface (what the agent can do)

| Tool | Effect |
|---|---|
| `read_file` | Read a file with optional `offset`+`limit`. Refuses to dump large files whole. |
| `grep` | JS regex search across the repo (or a subtree). Capped at 200 matches. |
| `list_files` | List entries at a path. |
| `write_file` | Overwrite a file. |
| `edit_file` | Replace one occurrence of `old_string` with `new_string`. Errors if `old_string` isn't unique. |
| `done` | End the loop. `action: open_pr` triggers branch+commit+push+PR; `action: no_change` posts an explanation comment instead. |

The agent runs against the GitHub-Actions checkout — there's no shell access,
no network beyond Anthropic and the GitHub API, no package install during a
run. Path resolution is sandboxed to the repo root.

## What the workflow runner is allowed to do

- Push to any branch under `ai/issue-<n>` (never to `main` directly).
- Open a PR to `main`.
- Comment on the issue.
- Read the repository contents.

It cannot merge PRs. The maintainer reviews and merges as normal.

## Cost notes

- Model: `claude-opus-4-7` with `effort: "high"` and adaptive thinking — chosen
  per the [`claude-api` skill][skill] recommendation for coding tasks. The
  system prompt is cached (`cache_control: ephemeral`) so iterations after the
  first hit the cached prefix at ~10% of base input pricing.
- The agent caps at `MAX_ITERATIONS = 60` rounds per issue. A typical small
  fix completes in 5–15 rounds.
- Token usage is logged at the end of each run.

[skill]: https://code.claude.com/docs/en/skills

## Failure modes (intentional)

- **Issue is ambiguous** — agent calls `done` with `action: no_change` and a
  question. No PR, just a comment.
- **Issue is too large** — agent hits `MAX_ITERATIONS`, exits non-zero. Workflow
  marks as failed; maintainer can split the issue.
- **Refusal** — agent stops, workflow exits non-zero. Rare for code tasks.

## Disabling

Two ways:

1. Remove the `claude-fix` label from any open issues. The workflow only fires
   on the `labeled` event — old labels don't replay.
2. Delete or rename `.github/workflows/rudy-agent.yml`. No more runs.

Or temporarily: set the `ANTHROPIC_API_KEY` secret to an empty value — the
agent exits at startup with a missing-env-var error.
