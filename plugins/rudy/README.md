# RUDY plugin

A Claude Code plugin bundling the RUDY (chitipat-web/timetrack) project skills
into a single installable unit. After install, every skill is namespaced under
`rudy:` — `/rudy:deploy`, `/rudy:editing-html`, etc.

## What's inside

| Skill | Auto-triggers when… |
|---|---|
| `deploy` | About to commit, push, deploy, or release a RUDY change; sw.js touched; auto-update polling involved; "iPhone not updating" complaints |
| `editing-html` | Editing `index.html` (`paths: ["index.html"]`) |
| `theme-vars` | Editing `index.html` CSS, changing colors, dark-mode bugs |
| `sw-fetch` | Editing `sw.js` (`paths: ["sw.js"]`) |
| `bug-triage` | "my iPhone isn't updating", "still old version", "fix didn't work" |
| `firebase-data` | Reading/writing Firebase, adding record fields, schema questions |

Each skill encodes a rule that has been violated at least once in the project's
history. Reading and following them is the single highest-leverage thing Claude
Code can do when working on RUDY.

## Install

This plugin lives in this repo's marketplace at `.claude-plugin/marketplace.json`.

```text
/plugin marketplace add chitipat-web/timetrack
/plugin install rudy@rudy-marketplace
```

Or for local development, clone the repo and:

```bash
claude --plugin-dir ./plugins/rudy
```

## Use

Skills auto-activate when their `description` matches what you're doing — you
shouldn't usually need to invoke them by name. To force one:

```text
/rudy:deploy
/rudy:bug-triage
/rudy:firebase-data
```

`editing-html`, `theme-vars`, and `sw-fetch` are path-scoped (`paths: […]`):
they only load into context when Claude is touching the matching file. This
keeps the listing-budget free for the others.

## Relationship to the in-repo `.claude/skills/`

The same skills exist as **project skills** in `.claude/skills/` (added by PRs
#1 and #2). When working inside the timetrack repo itself, those project
skills take precedence — they use the un-namespaced names (`/rudy-deploy`
instead of `/rudy:deploy`). The plugin form is for **other** repos / Claude
sessions that want to install the same rules without copying files manually.

## Versioning

`version: "1.0.0"` is set explicitly in `plugin.json` and `marketplace.json`.
Users only receive updates when this string changes. Bump on every release
that adds or materially changes a skill.

## Why these are skills, not a single CLAUDE.md

CLAUDE.md is loaded into context on every session. These skills are loaded
**only when relevant** — `description`-matched, or `paths`-scoped. The
deploy / theme / fetch / data rules are too long to live in CLAUDE.md without
crowding out other context, but too important to forget. Skills let them sit
ready and load on demand.
