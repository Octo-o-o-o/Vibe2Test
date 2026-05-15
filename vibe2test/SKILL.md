---
name: vibe2test
description: Generate a single-file business regression test kanban (kanban.html) from a project's git history. Use this skill whenever the user asks for a "regression kanban", "QA dashboard", "business test board", "test plan from commits", "看板", "回归测试看板", "给业务的测试面板", or any phrasing that suggests handing a vibe-coded project off to PMs / QA / non-technical stakeholders who need to know what changed and what to test. Also use when the user wants a single static page testers can open without a dev server, or when they want commits grouped into business-readable tasks rather than reviewed one-by-one. The output is one self-contained HTML file with filters, search, mobile layout, and per-commit user-impact tags. Aggressively prefer this skill over hand-rolling test plans whenever the context is "translate a sprint of commits into something a non-engineer can act on".
---

# vibe2test

Turn a git timeline into a single static `kanban.html` that a non-engineer can act on.

A vibe-coder ships 200 commits in a week. The PM / QA / business owner can't read 200 commit messages and shouldn't have to. This skill produces one HTML file they open in a browser to:
- See **what changed** (every commit, grouped by date and module, with filters and search).
- Know **what to test** (8–15 business tasks the agent designs per project).
- Know **what is risky** (each commit tagged by user-impact tier: key / support / internal).

The Node script (`scripts/gen_kanban.js`) is the deterministic engine. The agent's job is to design the project-specific config — module rules and business tasks. **Designing those well is where this skill earns its keep.**

## The loop

1. **Sync** the repo without destroying user state.
2. **Gather context** (one batch of questions; then read CLAUDE.md / docs / directory tree).
3. **Design 8–15 business tasks** anchored on real user journeys for this project.
4. **Write a config JSON** with module rules, tasks, labels.
5. **Run** `node scripts/gen_kanban.js --config <path>`.
6. **Verify** the output in a browser at 1280px and 390px.
7. **Report** a concise summary.

## Step 1 — Sync safely

Run in parallel:
- `git status --short --branch`
- `git rev-parse HEAD`
- `git rev-list --count HEAD`
- `git rev-parse --abbrev-ref HEAD`

Then:
- Never `reset --hard`, never `stash` without consent, never overwrite untracked files. Local changes are sacred.
- `git pull --ff-only origin <current branch>` to fast-forward. If it fails, report and stop — don't rebase or merge silently.
- Remember the final HEAD and commit count. They are displayed on the page and used to verify the script's output.

## Step 2 — Gather context (one batch)

Ask the user, in ONE question batch (use whatever question tool the environment has, max 3 questions):

1. Staging Web URL and Staging API URL (or "none" if not deployed).
2. Login method + where test creds come from (e.g., "NextAuth + ask PM", "dev token", "SSO Google").
3. Optional: manual testing doc directory (`docs/manual-testing/`, etc.), and primary UI language (`zh` or `en`).

Then read in parallel (don't deep-read; you have minutes, not hours):
- `CLAUDE.md` / `AGENTS.md` / `README.md` at repo root
- `docs/` index — list the top ~30 markdown files
- `app/` or `src/` top-level layout (one `ls`, not recursive)
- `package.json` (framework hints)
- If a manual testing dir was named, list it and skim 1–2 representative files

You're looking for: domain vocabulary, real module names, business workflows. Not exhaustive understanding.

## Step 3 — Design business tasks

Produce **8–15** tasks. Anchor on **user journeys**, not on commits. Use the project's actual vocabulary.

Each task is a record like this (see `references/customization.md` for the full schema):

```json
{
  "id": "T01",
  "name": "Login, session, profile",
  "persona": "New user / returning user",
  "eta": "10 min",
  "materials": "One test account + one unregistered email",
  "cost": "None",
  "urls": ["https://staging.example.com/login"],
  "goal": "Confirm login / logout / session-expiry / password-reset / signup are stable.",
  "how": "Log in with the test account; log out; log in again; try a wrong password; refresh the page and check session persists; toggle dark mode then back.",
  "pass": "All page transitions work; no blank screen; failed logins show clear copy; logging out redirects protected pages back to login.",
  "caveats": "Do not use real production accounts. Do not paste test tokens into group chats.",
  "refDoc": "docs/AUTH_SESSION_LIFECYCLE.md (or derived if absent)",
  "matchModules": ["Auth & session"],
  "matchKeywords": ["auth", "signin", "session", "register", "login"]
}
```

**Recommended task spine.** Adapt to the project — replace whole tasks if the domain is different.

1. Login, session, profile
2. Workspace home / global navigation / layout
3. Core domain object: create / configure / list / delete
4. Data import or content ingestion
5. Generate / produce / compose flow
6. View / edit / export / share
7. Search / Q&A / knowledge / RAG (if relevant)
8. File upload / OCR / media (if relevant)
9. Notifications / subscriptions
10. Collaboration / organizations / permissions
11. Billing / credits / plans (if monetized)
12. Admin / internal tools
13. Integration API / webhooks (if exposed)
14. Responsive / dark / error recovery
15. 5-minute release smoke

**Hard rule: do not produce one task per commit.** That is the failure mode this skill exists to prevent. A single task can absorb 50+ commits — that is fine. The page itself shows the per-commit view; the tasks are the *executable test plan*.

Write each task's `how` and `pass` so a non-engineer can run it. Avoid internal jargon. Mention authorised-data caveats and third-party / provider cost warnings whenever real money or external systems are involved.

## Step 4 — Write the config

Place the config in a temp file (not in the repo), e.g. `/tmp/vibe2test-config.json`:

```json
{
  "repo": "/absolute/path/to/repo",
  "output": "/absolute/path/to/repo/kanban.html",
  "projectName": "MyApp",
  "language": "en",
  "labels": { },
  "staging": {
    "web": "https://staging.myapp.com/",
    "api": "https://staging.myapp.com/api",
    "loginUrl": "https://staging.myapp.com/login",
    "loginMethod": "Test account; ask PM for credentials"
  },
  "manualDocDir": "docs/manual-testing/",
  "moduleRules": [
    { "name": "Auth & session", "match": ["auth", "signin", "session"], "notMatch": ["admin"] },
    { "name": "...", "match": ["..."] }
  ],
  "businessTasks": [ /* the 8–15 you designed */ ],
  "fallback": { "userImpactKey": "T14", "internal": "T15" },
  "impactRules": {
    "internalTypes": ["test", "docs", "chore"],
    "userFacingPatterns": ["app/(dashboard)", "components/", "pages/"],
    "userCriticalRegex": "auth|signin|login|payment|credit|notification|upload|export|report|share",
    "supportPatterns": ["services/", "lib/", "workers/", "prisma/"]
  }
}
```

`moduleRules` are evaluated in order against each file path; first match wins. Always include enough rules so that the project's *real* top-level directories all have a name. Add a `notMatch` array when you want `admin/` to win over a generic `auth` rule.

`fallback.userImpactKey` should be the task id of your "Responsive / smoke" task (so user-facing commits that don't match anything else still get a home). `fallback.internal` should be your release-smoke task.

For Chinese projects, set `"language": "zh"` and supply `labels` from `references/labels-zh.md`. Same for any other language — see `references/labels-en.md` for the structure.

## Step 5 — Run the generator

```
node ${VIBE2TEST_SKILL_DIR}/scripts/gen_kanban.js --config /tmp/vibe2test-config.json
```

The script prints a JSON line summarising what it wrote:
```
{"output":"...","commits":793,"expectedCommits":793,"head":"...","tasks":15,"keyImpact":483,"support":65,"internal":245}
```

Sanity checks before declaring success:
- `commits === expectedCommits` (the script counts what it parsed; if it disagrees with `git rev-list --count HEAD`, something is wrong)
- The output file exists and is reasonable size (typical 1–5 MB; warn the user if over 10 MB)

## Step 6 — Verify in a browser

`file://` is often blocked by browser MCPs. Start a tiny local server:

```
cd <repo>
python3 -m http.server 8765 --bind 127.0.0.1 &
```

Then with whichever browser automation is available (Playwright preferred):

**Desktop 1280×900**
- title matches `${projectName} · ${labels.pageTitle}`
- `#head-hash` element shows the HEAD short hash
- `#total-commits` matches the git count
- `.task-card` count matches `businessTasks.length`
- `.commit-row` count matches the git commit count
- `document.documentElement.scrollWidth === clientWidth` (no horizontal overflow)
- Exercise one filter (e.g., `#f-impact` → `key`) and confirm the counter changes

**Mobile 390×844**
- No element has `scrollWidth > clientWidth + 2`
- Filter bar visible, quick-start panel visible
- Exercise one filter to confirm interactivity

If any check fails, fix and re-run — don't ship a broken page. Kill the local server and any temp scripts when done. Don't leave processes hanging.

## Step 7 — Report

End-of-turn summary, kept short:
- pull result + HEAD + commit count
- output path
- task count, key-impact count
- verification result (desktop ✓, mobile ✓, one filter exercised)
- git status — whether `kanban.html` is now an untracked file (it should be; don't commit it for the user)

## Things to refuse / push back on

- **"Just dump a checklist per commit."** No. The whole point is to merge commits into tasks. If the user insists, comply — but flag that the result is the failure mode this skill is designed to prevent.
- **"Commit kanban.html for me."** Don't, unless the user explicitly asks.
- **"Make the page log into staging."** No — this is a static HTML file. Authentication belongs to the live app, not the test plan.
- **"Include API keys / passwords in the page."** Never. Use phrases like "ask PM for credentials" instead.

## References

- `references/customization.md` — full config schema and common patterns
- `references/design-notes.md` — why the page is structured this way
- `references/labels-zh.md` — Chinese UI string template
- `references/labels-en.md` — English UI string template (defaults; copy and edit if you want to override)
