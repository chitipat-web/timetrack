#!/usr/bin/env node
// RUDY Code-Helper Agent
//
// Reads a GitHub issue, plans a fix using Claude (Opus 4.7 + adaptive thinking),
// edits files via tool use, then commits to a new branch and opens a PR back to
// main. Triggered by the .github/workflows/rudy-agent.yml workflow.
//
// Required env vars:
//   ANTHROPIC_API_KEY  - Claude API key (repo secret)
//   GITHUB_TOKEN       - GitHub token with contents:write + pull-requests:write
//   ISSUE_NUMBER       - The issue to investigate
//   ISSUE_TITLE        - Issue title
//   ISSUE_BODY         - Issue body
//   REPO_OWNER         - "chitipat-web"
//   REPO_NAME          - "timetrack"

import Anthropic from "@anthropic-ai/sdk";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd(), "..", "..");
const MAX_ITERATIONS = 60;
const MAX_FILE_BYTES = 800_000;
const GREP_MAX_MATCHES = 200;

const env = (k) => {
  const v = process.env[k];
  if (!v) {
    console.error(`Missing required env var: ${k}`);
    process.exit(1);
  }
  return v;
};

const ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY");
const GITHUB_TOKEN = env("GITHUB_TOKEN");
const ISSUE_NUMBER = env("ISSUE_NUMBER");
const ISSUE_TITLE = env("ISSUE_TITLE");
const ISSUE_BODY = process.env.ISSUE_BODY || "(no body)";
const REPO_OWNER = env("REPO_OWNER");
const REPO_NAME = env("REPO_NAME");

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ─── path safety ──────────────────────────────────────────────────────────
function resolvePath(rel) {
  if (typeof rel !== "string" || rel.length === 0) {
    throw new Error("path is required");
  }
  const full = path.resolve(REPO_ROOT, rel);
  if (!full.startsWith(REPO_ROOT + path.sep) && full !== REPO_ROOT) {
    throw new Error(`Path escapes repo root: ${rel}`);
  }
  return full;
}

// ─── tool implementations ─────────────────────────────────────────────────
const toolImpl = {
  read_file({ path: rel, offset, limit }) {
    const full = resolvePath(rel);
    const stat = fs.statSync(full);
    if (stat.size > MAX_FILE_BYTES && (!limit || limit > 2000)) {
      return `ERROR: ${rel} is ${stat.size} bytes — too large to read whole. Use offset+limit (max 2000 lines), or grep first.`;
    }
    const lines = fs.readFileSync(full, "utf8").split("\n");
    const start = offset ? Math.max(1, offset) - 1 : 0;
    const end = limit ? Math.min(lines.length, start + limit) : lines.length;
    const slice = lines.slice(start, end);
    const header = `--- ${rel} (lines ${start + 1}-${end} of ${lines.length}) ---\n`;
    return header + slice.map((l, i) => `${start + i + 1}\t${l}`).join("\n");
  },

  grep({ pattern, path: rel }) {
    const re = new RegExp(pattern, "g");
    const target = rel ? resolvePath(rel) : REPO_ROOT;
    const stat = fs.statSync(target);
    const files = stat.isFile()
      ? [target]
      : walkRepo(target).filter((f) => fs.statSync(f).size < MAX_FILE_BYTES * 2);
    const out = [];
    let total = 0;
    for (const f of files) {
      const content = fs.readFileSync(f, "utf8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
          out.push(`${path.relative(REPO_ROOT, f)}:${i + 1}:${lines[i].slice(0, 240)}`);
          total++;
          if (total >= GREP_MAX_MATCHES) {
            out.push(`... (truncated at ${GREP_MAX_MATCHES} matches)`);
            return out.join("\n");
          }
        }
        re.lastIndex = 0;
      }
    }
    return out.length ? out.join("\n") : "(no matches)";
  },

  list_files({ path: rel }) {
    const target = rel ? resolvePath(rel) : REPO_ROOT;
    const entries = fs.readdirSync(target, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith(".git"))
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .join("\n");
  },

  write_file({ path: rel, content }) {
    const full = resolvePath(rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
    return `Wrote ${content.length} bytes to ${rel}`;
  },

  edit_file({ path: rel, old_string, new_string }) {
    const full = resolvePath(rel);
    const content = fs.readFileSync(full, "utf8");
    const occurrences = content.split(old_string).length - 1;
    if (occurrences === 0) return `ERROR: old_string not found in ${rel}`;
    if (occurrences > 1) {
      return `ERROR: old_string appears ${occurrences} times in ${rel}. Add more context to make it unique.`;
    }
    fs.writeFileSync(full, content.replace(old_string, new_string), "utf8");
    return `Replaced 1 occurrence in ${rel}`;
  },
};

function walkRepo(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".git") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkRepo(full));
    else out.push(full);
  }
  return out;
}

// ─── tool schemas ─────────────────────────────────────────────────────────
const tools = [
  {
    name: "read_file",
    description:
      "Read a file from the repo. For index.html (~700KB), ALWAYS use offset+limit or grep first.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to repo root" },
        offset: { type: "integer", description: "1-based line number to start at" },
        limit: { type: "integer", description: "Max lines to read (max 2000)" },
      },
      required: ["path"],
    },
  },
  {
    name: "grep",
    description: "Search files with a JS regex. Returns up to 200 matches with file:line:text.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "JS regex (no surrounding slashes)" },
        path: { type: "string", description: "Optional: file or directory to limit search" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "list_files",
    description: "List files and directories at the given path (default: repo root).",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" } },
    },
  },
  {
    name: "write_file",
    description: "Overwrite a file with the given content. Creates the file if missing.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description:
      "Replace one occurrence of old_string with new_string in a file. old_string MUST be unique in the file.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        old_string: { type: "string" },
        new_string: { type: "string" },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  {
    name: "done",
    description:
      "Signal that the fix is complete (or that no change is needed). The agent loop ends.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["open_pr", "no_change"],
          description:
            "open_pr if files were edited and a PR should be created; no_change if the issue is unclear/off-scope/already-fixed",
        },
        title: { type: "string", description: "Short PR title (≤70 chars)" },
        summary: {
          type: "string",
          description: "PR body markdown — what changed, why, and how to test",
        },
        version_bumped: {
          type: "string",
          description: "New version vNNN (required if action=open_pr and the deploy 3-file rule applies)",
        },
      },
      required: ["action", "summary"],
    },
  },
];

// ─── system prompt (cacheable) ────────────────────────────────────────────
const SYSTEM_PROMPT = `You are RUDY's code-helper agent, running as a GitHub Action triggered by an issue.

# Project (chitipat-web/timetrack)

RUDY is a single-file PWA used by 3 people on iOS PWA at home screen. The hot code paths:
- index.html (~700KB / ~15k lines) — entire app, structured as Phase A→G IIFEs
- sw.js — service worker (cache strategy + bypass list)
- version.json — auto-update poll target (clients check every few minutes)
- CLAUDE.md, .claude/skills/*/SKILL.md — project rules

# Iron-clad rules — VIOLATING ANY OF THESE BREAKS PRODUCTION

## 1. Three-file deploy rule
Every code-change deploy MUST update all three of: index.html + sw.js + version.json.
Even a CSS-only fix needs the cache version bumped or iPhones never refresh.

Version bump must be CONSISTENT across:
- sw.js cache constants: STATIC_CACHE, FIREBASE_CACHE, RUNTIME_CACHE (3 lines)
- sw.js GET_VERSION message handler ('vNNN' string)
- sw.js Build comment + console.log
- version.json "version" field

Find the current version with: grep "rudy-static-v" sw.js
Bump by 1 (v199 → v200). Same integer everywhere.

## 2. Editing index.html safely
- NEVER read the whole file (700KB). Always grep first, then read with offset+limit.
- Phase A (home widgets), B (more widgets), C (leaderboard), D (liquid glass WebGL), E (check-in guard), F (health-check), G (auto-recovery)
- Before deleting any DOM element: grep for its id from JS first
- Never call preventDefault() in addEventListener on a button that ALSO has inline onclick (the onclick won't fire)
- Don't put <style> or <script> inside an existing <script> block
- Don't hardcode color:#fff except on solid-background buttons/badges — use var(--ink)
- Don't hardcode rgba() for theme-aware text — use var(--ink) / var(--ink-2) / var(--ink-3)

## 3. Editing sw.js safely
- The bypass check in fetch handler MUST come BEFORE the method check (iOS Safari fix)
- version.json must stay network-only (fetch with cache:'no-store', NEVER add to cache)
- All 3 cache constants share the same vNNN

## 4. Cards / CSS / theme
- Use var(--ink), var(--ink-2), var(--ink-3), var(--glass-bg), var(--accent)
- :root defines light theme; body.dark { ... } overrides for dark mode
- !important on inline CSS has broken light mode before — avoid

## 5. Firebase
- Region asia-southeast1, auth-based rules (never public)
- Records schema: empId / date (YYYY-MM-DD Israel time) / checkIn / checkOut / checkInTs / checkOutTs / isLate / otMin / note
- Workers are in Israel — IDT (UTC+3 summer) / IST (UTC+2 winter). Late cutoff 06:00 IDT, OT starts 16:30 IDT.

# Your task

1. Read the issue carefully.
2. Use grep + read_file to investigate the relevant code.
3. Plan the smallest possible change that addresses the issue.
4. Make the edits via edit_file (preferred) or write_file.
5. If you changed code that ships to users (index.html / sw.js / version.json), bump the version in ALL FOUR places listed in rule 1.
6. Call \`done\` with action=open_pr, a clear title and summary, and version_bumped=vNNN (if any).

If the issue is ambiguous, requires architectural decisions, or is off-scope for an automated agent: call \`done\` with action=no_change and a summary explaining what's blocking.

# Anti-patterns

- Don't refactor unrelated code.
- Don't add features beyond what the issue asks for.
- Don't bump the version unless you actually changed the 3 deploy files.
- Don't guess at requirements — if unclear, return no_change with a question.
- Don't commit secrets, .env files, or large binaries.
- Don't read the whole index.html. It WILL exceed the context window.

# Output style

Walk through your reasoning before making edits. After each batch of edits, briefly state what you changed. When done, call the \`done\` tool — do not also send a final text message.`;

// ─── agent loop ───────────────────────────────────────────────────────────
console.log(`[agent] Starting on issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}`);

const userPrompt = `Please investigate and fix this GitHub issue.

**Title:** ${ISSUE_TITLE}
**Number:** #${ISSUE_NUMBER}

**Body:**
${ISSUE_BODY}

Start by orienting yourself: list the repo root, then grep for relevant terms from the issue. Investigate before editing.`;

const messages = [{ role: "user", content: userPrompt }];
let doneInput = null;
let edited = false;
let iteration = 0;
let totalInputTokens = 0;
let totalOutputTokens = 0;
let totalCacheRead = 0;
let totalCacheWrite = 0;

while (iteration < MAX_ITERATIONS && !doneInput) {
  iteration++;
  console.log(`\n[agent] Iteration ${iteration}/${MAX_ITERATIONS}`);

  let response;
  try {
    response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      cache_control: { type: "ephemeral" },
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      console.error("[agent] Rate limited. Waiting 30s and retrying...");
      await new Promise((r) => setTimeout(r, 30_000));
      iteration--;
      continue;
    }
    if (err instanceof Anthropic.OverloadedError) {
      console.error("[agent] API overloaded. Waiting 60s and retrying...");
      await new Promise((r) => setTimeout(r, 60_000));
      iteration--;
      continue;
    }
    throw err;
  }

  totalInputTokens += response.usage.input_tokens ?? 0;
  totalOutputTokens += response.usage.output_tokens ?? 0;
  totalCacheRead += response.usage.cache_read_input_tokens ?? 0;
  totalCacheWrite += response.usage.cache_creation_input_tokens ?? 0;

  if (response.stop_reason === "refusal") {
    console.error("[agent] Refused:", response.stop_details);
    process.exit(2);
  }

  for (const block of response.content) {
    if (block.type === "text" && block.text.trim()) {
      console.log(`[claude] ${block.text}`);
    } else if (block.type === "thinking") {
      // Adaptive thinking content is omitted by default on Opus 4.7;
      // only summary text appears here if display=summarized is set.
    } else if (block.type === "tool_use") {
      const argsPreview = JSON.stringify(block.input).slice(0, 160);
      console.log(`[tool ] ${block.name}(${argsPreview}${argsPreview.length === 160 ? "..." : ""})`);
    }
  }

  messages.push({ role: "assistant", content: response.content });

  if (response.stop_reason === "end_turn") {
    console.log("[agent] Stop reason: end_turn. Agent finished without calling done — treating as no_change.");
    doneInput = { action: "no_change", summary: "Agent ended turn without calling the `done` tool. No changes were committed." };
    break;
  }

  if (response.stop_reason === "pause_turn") {
    // Server-side tool iteration limit; just continue the loop
    continue;
  }

  if (response.stop_reason !== "tool_use") {
    console.error("[agent] Unexpected stop_reason:", response.stop_reason);
    break;
  }

  const toolUses = response.content.filter((b) => b.type === "tool_use");
  const toolResults = [];
  for (const tu of toolUses) {
    if (tu.name === "done") {
      doneInput = tu.input;
      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: "Acknowledged." });
      continue;
    }
    try {
      const result = toolImpl[tu.name](tu.input);
      if (tu.name === "write_file" || tu.name === "edit_file") edited = true;
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: typeof result === "string" ? result.slice(0, 50_000) : JSON.stringify(result),
      });
    } catch (err) {
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: `Error: ${err.message}`,
        is_error: true,
      });
    }
  }
  messages.push({ role: "user", content: toolResults });
}

console.log(
  `\n[agent] Done after ${iteration} iterations. Tokens: input=${totalInputTokens}, output=${totalOutputTokens}, cache_read=${totalCacheRead}, cache_write=${totalCacheWrite}`,
);

if (!doneInput) {
  console.error("[agent] Hit MAX_ITERATIONS without completing.");
  process.exit(3);
}

if (doneInput.action === "no_change" || !edited) {
  console.log("[agent] No code changes to ship. Posting comment on issue and exiting.");
  await postIssueComment(
    `⚠️ Agent did not make code changes for this issue.\n\n**Why:** ${doneInput.summary}`,
  );
  process.exit(0);
}

// ─── git: branch + commit + push ──────────────────────────────────────────
const branch = `ai/issue-${ISSUE_NUMBER}`;
const title = doneInput.title || `Fix issue #${ISSUE_NUMBER}`;
const body =
  `${doneInput.summary}\n\n` +
  `---\n` +
  `Closes #${ISSUE_NUMBER}\n\n` +
  `Auto-generated by [rudy-agent](.github/workflows/rudy-agent.yml). ` +
  `Tokens used: input=${totalInputTokens}, output=${totalOutputTokens}, cache_read=${totalCacheRead}.`;

git(["checkout", "-b", branch]);
git(["add", "-A"]);
const status = git(["status", "--porcelain"]);
if (!status.trim()) {
  console.log("[agent] No working-tree changes after edits. Skipping commit.");
  await postIssueComment(
    `⚠️ Agent reported a fix but no files actually changed. Skipping PR.\n\n**Summary:** ${doneInput.summary}`,
  );
  process.exit(0);
}
git(["commit", "-m", title + "\n\n" + doneInput.summary.slice(0, 4000)]);
git(["push", "-u", "origin", branch]);

// ─── open PR ──────────────────────────────────────────────────────────────
const prUrl = await openPullRequest({ branch, title, body });
console.log(`[agent] PR opened: ${prUrl}`);
await postIssueComment(`🤖 Opened PR ${prUrl} for this issue.`);

// ─── helpers ──────────────────────────────────────────────────────────────
function git(args) {
  const res = spawnSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed with code ${res.status}`);
  }
  return res.stdout;
}

async function gh(method, urlPath, body) {
  const res = await fetch(`https://api.github.com${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${method} ${urlPath} failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function openPullRequest({ branch, title, body }) {
  const pr = await gh("POST", `/repos/${REPO_OWNER}/${REPO_NAME}/pulls`, {
    title,
    head: branch,
    base: "main",
    body,
  });
  return pr.html_url;
}

async function postIssueComment(body) {
  try {
    await gh("POST", `/repos/${REPO_OWNER}/${REPO_NAME}/issues/${ISSUE_NUMBER}/comments`, {
      body,
    });
  } catch (err) {
    console.warn("[agent] Failed to post issue comment:", err.message);
  }
}
