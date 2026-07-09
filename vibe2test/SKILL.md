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
- `git pull --ff-only origin <current branch>` to fast-forward. If it fails (e.g. detached HEAD, no upstream, diverged), report and stop — don't rebase or merge silently.
- Remember the final HEAD and commit count. They are displayed on the page and used to verify the script's output.

**HEAD-drift hazard.** If the user is actively coding in another window — a common case for vibe-coded projects — HEAD can move between the moment you read it and the moment the script renders. The script (step 5) now reports `headDriftedDuringRun: true` when this happens. If it does, re-run the generator and re-verify. Do not ship a kanban whose HEAD doesn't match `git rev-parse HEAD` at the moment you hand it off.

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

`${CLAUDE_SKILL_DIR}` below is this skill's own directory (Claude Code substitutes it automatically; in other hosts, use the absolute path of the folder containing this SKILL.md):

```
node ${CLAUDE_SKILL_DIR}/scripts/gen_kanban.js --config /tmp/vibe2test-config.json
```

The script prints a JSON line summarising what it wrote:
```
{"output":"...","outputExistedBefore":false,"outputGitState":"untracked","outputGitTracked":false,"commits":793,"expectedCommits":793,"head":"...","postRunHead":"...","headDriftedDuringRun":false,"tasks":15,"keyImpact":483,"keyImpactRatio":0.6091,"support":65,"internal":245,"unassignedCommits":0}
```

Sanity checks before declaring success:
- `commits === expectedCommits` — the script counts what it parsed; mismatch means git output format changed or the run was interrupted.
- `headDriftedDuringRun === false` — if `true`, the user committed during the run; re-run before reporting.
- `unassignedCommits === 0` — if non-zero, your `fallback.userImpactKey` / `fallback.internal` is unset or wrong, and the page shows raw `(unassigned)` tags. Fix the config and re-run.
- `outputGitState` is understood. Normal new handoffs are usually `untracked`; `tracked-modified` means the repo already tracks `kanban.html`, so report that explicitly instead of assuming it is a disposable generated file.
- The output file exists and is reasonable size (typical 1–5 MB; warn the user if over 10 MB).
- `keyImpactRatio` is **roughly** 0.30–0.60 on a typical sprint. If it's >0.70 your `userCriticalRegex` is too broad — almost every commit matches the regex against file paths, defeating the point of the tier. Tighten it (see `references/customization.md → Pitfalls`).

## Step 6 — Verify in a browser

First run the bundled verifier for deterministic checks:

```
node ${CLAUDE_SKILL_DIR}/scripts/verify_kanban.js --config /tmp/vibe2test-config.json --json
```

If Playwright is available to normal Node resolution, run the full browser
pass:

```
node ${CLAUDE_SKILL_DIR}/scripts/verify_kanban.js --config /tmp/vibe2test-config.json --browser --json
```

If `--browser` reports that Playwright is unavailable, continue with whichever
browser automation the environment provides and mirror the same checks below.

`file://` is often blocked by browser MCPs. Start a tiny local server:

```
cd <repo>
python3 -m http.server 8765 --bind 127.0.0.1 &
```

If `8765` is already in use, pick any free local port; don't leave a failed or
background server around. Then with whichever browser automation is available
(Playwright preferred):

**Desktop 1280×900**
- title matches `${projectName} · ${labels.pageTitle}`
- `#head-hash` element shows the HEAD short hash
- `#total-commits` matches the git count
- `.task-card` count matches `businessTasks.length`
- `.commit-row` count matches the git commit count
- `document.documentElement.scrollWidth === clientWidth` (no horizontal overflow)
- Quick Start panel is visible (`.quickstart` / `.quick-start`)
- Exercise one filter (e.g., `#f-impact` → `key`) and confirm the counter changes.
  The page listens for `input`, so browser snippets must dispatch an `input`
  event, not only `change`. If all rows share that impact, choose another impact
  or a task filter whose count is smaller than the total.

**Mobile 390×844**
- No element has `scrollWidth > clientWidth + 2`
- Filter bar visible, quick-start panel visible
- Exercise one filter to confirm interactivity

If any check fails, fix and re-run — don't ship a broken page. Kill the local server and any temp scripts when done. Don't leave processes hanging.

## Step 7 — Report

Before reporting, re-check `git rev-parse HEAD` one last time. If it doesn't match the HEAD baked into the page, the user committed during your run — re-run the generator. The script's `postRunHead` field flags this automatically; do not skip the check.

End-of-turn summary, kept short:
- pull result + HEAD + commit count
- output path
- task count, key-impact count, internal count (and warn explicitly if `key` is >70% of total — see step 5)
- verification result (desktop ✓, mobile ✓, one filter exercised)
- whether HEAD drifted during the run (re-ran if yes)
- git status — include `outputGitState` / tracked vs untracked. Do not commit it for the user unless explicitly asked.

## Follow-on live regression

Sometimes the user asks you to run the generated checklist against staging or
production. That is a **separate execution pass**, not part of generating the
static page. Use `kanban.html` as the source of truth for the test plan, but
keep the same safety posture as any live environment test:

- Start with non-destructive smoke checks: health endpoint, root page headers,
  protected APIs return 401/403 when logged out, static bundles do not contain
  secrets, and sensitive-looking paths such as `/.env`, `/.git/config`,
  `/__*`, `/Users/*`, or `/opt/*` do not expose real files.
- If the controlled browser is already signed in to the target environment,
  treat it as an existing test session for read-only checks only. Do not extract
  cookies, tokens, OTP codes, or session headers.
- With an existing session, run a read-only route sweep before deeper task
  flows: direct-open public/user/admin routes that the session can access,
  capture error boundaries, blank screens, infinite loading states, uncaught
  console errors, redirects, and desktop/mobile overflow.
- Compare related surfaces for obvious count/data mismatches, such as dashboard
  totals vs list pages, empty-state copy vs detail pages with records, and search
  result counts vs visible rows.
- If a browser automation policy blocks the staging/production URL, treat that
  as a real blocker for UI verification. Do not work around it with another
  browser surface, raw CDP, or lower-level automation. Continue only with safer
  HTTP/API checks that do not bypass the policy, and report the UI tasks as
  blocked.
- Do not create accounts, submit forms, upload private files, trigger paid
  work, send emails, publish, delete, purchase, or otherwise cause external
  side effects unless the user explicitly authorised that exact action and
  supplied test credentials/materials.
- Authenticated flows that need OTP, SSO, a test session, or billing credits
  are blocked until the user provides those. Report them as blocked rather than
  pretending the run is complete.
- For shell smoke loops, avoid `path` as a variable name under zsh because it
  shadows the command search path. Use names like `url_path` or `route_path`.
- When the repo has a manual testing directory, write a timestamped Markdown
  report there. Keep observed evidence separate from inferred local source-code
  hints.
- In the final report, separate **passed**, **failed**, **blocked**, and
  **not run** tasks. Include exact URLs/endpoints checked, status codes, and
  any safety-relevant findings.

## Things to refuse / push back on

- **"Just dump a checklist per commit."** No. The whole point is to merge commits into tasks. If the user insists, comply — but flag that the result is the failure mode this skill is designed to prevent.
- **"Commit kanban.html for me."** Don't, unless the user explicitly asks.
- **"Make the page log into staging."** No — this is a static HTML file. Authentication belongs to the live app, not the test plan.
- **"Include API keys / passwords in the page."** Never. Use phrases like "ask PM for credentials" instead.

## References

- `references/customization.md` — full config schema and common patterns
- `references/design-notes.md` — why the page is structured this way
- `references/live-regression.md` — how to use the generated page as a safe live-environment test plan
- `references/labels-zh.md` — Chinese UI string template
- `references/labels-en.md` — English UI string template (defaults; copy and edit if you want to override)
