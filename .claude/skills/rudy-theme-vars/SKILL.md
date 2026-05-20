---
description: Light/dark mode theming rules for RUDY's CSS. Use whenever editing CSS, adding UI components, changing colors/backgrounds/borders, fixing "text invisible in dark mode" bugs, or modifying the toggleDark() flow. Enforces var(--ink) for all text, no hardcoded #fff or rgba() except specific solid-bg buttons/badges, and the :root vs body.dark override pattern. Prevents the recurring "dark mode unreadable" bug from CLAUDE.md section 6.
paths: ["index.html"]
---

# RUDY theme — keep light/dark mode working

## The rule

Every text colour, border, or background that should follow the theme **must** use a CSS variable. Hardcoded colors silently break theme switching — the change works in one mode and disappears in the other. This has happened multiple times.

## Allowed hardcoded colors (the only exceptions)

- Text on a **solid-color button** (white text on a blue button — the button background doesn't shift with theme)
- Text on a **badge with a solid background**
- The dot accent in the splash wordmark (`#5AC8FA` — brand colour, not theme-aware text)

Anything else with hardcoded `color:` is a future bug.

## Variable reference

| Variable | Purpose |
|---|---|
| `var(--ink)` | Primary body text |
| `var(--ink-2)` | Secondary / muted text |
| `var(--ink-3)` | Tertiary text. Often aliased in `body.dark` — don't remove the alias |
| `var(--glass-bg)` | Frosted card background |
| `var(--glass-border)` | Card border |
| `var(--accent)` | Brand cyan (#5AC8FA — same in both modes) |

`:root { … }` defines the light theme.
`body.dark { … }` overrides for dark.

## Anti-patterns (each has caused a real bug)

- **`color:#fff`** on body text → invisible on light mode.
- **`background:#001020 !important`** in inline CSS → forces dark bg in light mode too. `!important` over a theme variable is almost always wrong.
- **`rgba(255,255,255,0.6)`** for borders/dividers → only readable in dark mode.
- **Duplicate selectors across multiple `<style>` blocks** → the last `!important` wins, often hiding the variable-based one. Always grep for the selector before adding a rule.

## Verifying a CSS change is theme-safe

After editing, before committing:

1. `grep -n "color:#fff\|color:#ffffff\|color: white" index.html` — every new occurrence must satisfy the "solid background button" exception.
2. `grep -n "rgba(0,0,0\|rgba(255,255,255" index.html` near the edit. If used for theme-aware text/border, replace with `var(--ink-*)` or add a new variable.
3. **Toggle dark mode** in the running app and look at the changed element. If contrast drops below ~3:1, fix before pushing.

## When you need a new theme-aware colour

Add a variable to `:root` *and* the corresponding override in `body.dark`, then reference via `var(--name)`. Don't introduce a new inline hex inside the component — keeping the variable list central is what makes the theme toggle reliable.
