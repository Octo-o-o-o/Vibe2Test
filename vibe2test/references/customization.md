# Config schema and customisation

The generator (`scripts/gen_kanban.js`) is config-driven. This file is the
authoritative reference for the config shape.

## Top level

```jsonc
{
  "repo": "string  // absolute path to the git repo; defaults to cwd",
  "output": "string  // absolute path for kanban.html; defaults to <repo>/kanban.html",
  "projectName": "string  // shown in the page title",
  "language": "zh | en  // controls <html lang> only; UI strings come from `labels`",

  "labels": { /* see ./labels-en.md and ./labels-zh.md */ },

  "staging": {
    "web": "string  // optional",
    "api": "string  // optional",
    "loginUrl": "string  // optional",
    "loginMethod": "string  // free-form description"
  },

  "manualDocDir": "string  // optional; shown in 'Quick start' panel",

  "moduleRules": [
    {
      "name": "string  // module label shown in the page",
      "match": ["substring", "substring", "..."],
      "notMatch": ["substring", "..."]
    }
  ],

  "typeRules": [
    { "prefix": "regex string (case-insensitive)", "key": "feat|fix|..." }
  ],

  "impactRules": {
    "internalTypes": ["test", "docs", "chore"],
    "userFacingPatterns": ["app/(dashboard)", "components/"],
    "userCriticalRegex": "auth|signin|payment|...",
    "supportPatterns": ["services/", "lib/", "workers/"]
  },

  "businessTasks": [
    { "id": "T01", "name": "...", "...": "see Task schema below" }
  ],

  "fallback": {
    "userImpactKey": "T14  // task id for user-facing commits that didn't match anything",
    "internal": "T15  // task id for internal commits that didn't match anything"
  }
}
```

## Task schema

```jsonc
{
  "id": "T01  // short stable id; show in the page",
  "name": "Human task name in business language",
  "persona": "Who runs this — 'PM', 'BD', 'New user', 'On-call', etc.",
  "eta": "Time budget — '10 min', '30 min', '1 hour'",
  "materials": "What the tester needs ready before starting",
  "cost": "Will running this burn money? Be explicit — 'None', 'Low LLM cost', 'OCR fees, control frequency'",
  "urls": ["https://staging.example.com/path"],
  "goal": "One sentence on why this test exists",
  "how": "Steps in plain language a non-engineer can follow",
  "pass": "Concrete pass criteria — not vibes",
  "caveats": "Pitfalls / what NOT to do / safety notes",
  "refDoc": "Pointer to a manual-testing doc, or a note saying it was derived",
  "matchModules": ["module names from moduleRules; commits whose modules intersect this list score +2 toward this task"],
  "matchKeywords": ["words checked against commit subject+body; each match scores +1"]
}
```

The script assigns each commit to the highest-scoring task. Commits that match
nothing fall back to `fallback.userImpactKey` (if their impact is "key") or
`fallback.internal` (otherwise).

## Classifying commits

### Type (chip on each row)

Type is derived from the commit subject's leading keyword. Default mapping:

| subject prefix | type key | default label |
|---|---|---|
| `feat:` | `feat` | feat |
| `fix:` | `fix` | fix |
| `refactor:` | `refactor` | refactor |
| `test:` | `test` | test |
| `docs:` / `doc:` | `docs` | docs |
| `perf:` | `perf` | perf |
| `chore:` / `build:` / `ci:` / `style:` | `chore` | chore |
| `init:` / "Initial commit" | `init` | init |
| `revert:` | `revert` | revert |
| anything else | `other` | other |

Override via `typeRules` if your project uses different prefixes. Override the
visible labels via `labels.typeNames`.

### User-impact tier

Each commit gets one of three impact tiers:

- **`key`** — needs user-simulated testing. The change touches user-visible
  pages, public flows, or anything in `impactRules.userCriticalRegex`.
- **`support`** — short smoke is enough. The change is in services / lib /
  workers / db migrations and may affect user paths indirectly.
- **`internal`** — internal / automation. Tests, docs, chores. The business
  side doesn't need to verify these one-by-one.

Algorithm (see `gen_kanban.js#classifyImpact`):

1. If commit type is in `impactRules.internalTypes` → `internal`.
2. Else if any file matches `impactRules.userFacingPatterns` OR
   `impactRules.userCriticalRegex` → `key`.
3. Else if any file matches `impactRules.supportPatterns` → `support`.
4. Else → `internal`.

This heuristic is conservative — when in doubt the commit lands in `internal`.
Tune `userCriticalRegex` to add domain-specific signals (e.g.
`appointment|prescription` for a health app).

## Module rules — practical patterns

```json
[
  { "name": "Auth & session",      "match": ["auth", "signin", "session"], "notMatch": ["admin"] },
  { "name": "Admin / internal",    "match": ["admin/", "/admin", "app/api/admin"] },
  { "name": "API routes",          "match": ["app/api/", "pages/api/"] },
  { "name": "Frontend pages",      "match": ["app/(", "pages/", "src/pages"] },
  { "name": "Components",          "match": ["components/", "src/components"] },
  { "name": "Backend services",    "match": ["services/", "src/services", "server/"] },
  { "name": "Workers / queue",     "match": ["workers/", "queue", "jobs/"] },
  { "name": "Database",            "match": ["prisma/", "migrations/", "drizzle/", "schema.sql"] },
  { "name": "Library / utilities", "match": ["lib/", "src/lib", "utils/"] },
  { "name": "Tests",               "match": ["__tests__/", "/test/", "/tests/", ".test.", ".spec.", "e2e/"] },
  { "name": "Docs",                "match": ["docs/", ".md", "README"] },
  { "name": "Scripts / deploy",    "match": ["scripts/", "deploy", "Dockerfile", ".sh"] },
  { "name": "Tooling",             "match": ["package.json", "tsconfig", ".config.", "eslint", "prettier"] }
]
```

Rules are evaluated in order; first match wins, so put **more specific rules
first**. The `Admin / internal` rule above must come before `API routes`,
otherwise admin commits get classified as plain API.

## When to add a project-specific rule

The defaults work for typical Next.js / Vite / Express layouts. Add custom
rules when:
- The project has a domain-specific top-level dir (`mobile/`, `extension/`,
  `bot/`, `ml/`).
- A single domain spans multiple directories that should appear as one module
  (e.g. `services/payment` + `app/(dashboard)/billing` → "Billing").
- A directory contains both user-facing and internal code that you want to
  split.

## Labels (i18n)

`labels` is a flat object. Defaults are English (`labels-en.md`). To switch to
Chinese, copy `labels-zh.md` into the config. To switch to anything else,
translate `labels-en.md` and put it under `labels`.

`labels.typeNames` maps type *keys* (`feat`, `fix`, …) to visible strings.

`labels.impactKey`, `labels.impactSupport`, `labels.impactInternal` are the
three impact tier names. They appear both as chips on each commit row and as
options in the impact filter.

`labels.internalManualPoint` and `labels.defaultManualPoint` are templates;
the placeholder `{task}` is replaced with the task name. Keep that placeholder
or per-row guidance will break.

## Output

The script writes a single self-contained HTML file. No JS dependencies, no
network requests at view time. The page works offline.

The script prints a single JSON line on stdout summarising what it did:

```json
{"output":"/path/kanban.html","outputExistedBefore":false,"outputGitState":"untracked","outputGitStatus":"??","outputGitRelativePath":"kanban.html","outputGitTracked":false,"commits":793,"expectedCommits":793,"head":"...","postRunHead":"...","headDriftedDuringRun":false,"branch":"main","tasks":15,"keyImpact":483,"keyImpactRatio":0.6091,"support":65,"internal":245,"unassignedCommits":0}
```

- `outputGitState` describes the generated file after the run:
  - `untracked` — typical new generated handoff in a repo that does not commit `kanban.html`.
  - `tracked-modified` — the repo already tracks this output; report it clearly and stage/commit only on explicit user request.
  - `tracked-clean` — the regenerated file is identical to the committed copy.
  - `ignored`, `outside-repo`, or `not-a-git-repo` — valid for custom output paths, but mention it if it affects handoff.
- `outputExistedBefore` helps distinguish a brand-new handoff from overwriting a previous generated file.
- `commits` is what the script parsed; `expectedCommits` is `git rev-list --count HEAD`. They should match. If they don't, something in git's output format changed — open an issue.
- `postRunHead` is re-read after the file is written. If `headDriftedDuringRun` is `true`, the user committed during the run and the page is already one or more commits behind — re-run.
- `keyImpactRatio` is rounded to four decimals. Ratios above `0.70` usually mean the global `userCriticalRegex` or `userFacingPatterns` are too broad.
- `unassignedCommits > 0` means at least one commit matched no business task AND `fallback.userImpactKey` / `fallback.internal` weren't set or pointed to non-existent ids. The renderer surfaces these as `(unassigned)`; fix the config and re-run.

The script also writes warnings or notes to stderr for HEAD drift, unassigned commits, tracked/overwritten output files, and suspiciously high key-impact ratios. Pipe to `2>/dev/null` to suppress, but don't suppress them by default — they're cheap, and silence has cost the agent a stale-kanban handoff at least once already.

## Pitfalls

Things the script will not save you from, and patterns to avoid.

### Substring matching is greedy

`moduleRules.match` and `businessTasks[*].matchKeywords` use `String.prototype.includes` — no word boundaries, no case-sensitivity. So:

- `"auth"` matches `oauth`, `authentication`, `unauthorized`, `authorized` — far beyond just "login auth code".
- `"chat"` matches `chatbot`, `wechat`, `purchased`.
- `"ppt"` matches no real word — fine. But `"image"` matches `images`, `imager`, `imagery`.

Prefer **3+ character anchors** unique to the domain — `signin`, `imap`, `presenton`, `ocr-pipeline` — over short generic stems. When you must use a short token, lean on `notMatch` to exclude the false positives.

Empty or whitespace-only strings in `match` / `notMatch` / `matchKeywords` are ignored by the script (an empty needle would otherwise match everything). Duplicate or missing task `id`s produce a stderr warning — fix the config rather than suppressing it.

### `userCriticalRegex` runs against file paths, not commit subjects

`impactRules.userCriticalRegex` is tested against each commit's file paths, not the commit's subject text. So `mail` in the regex matches `server/src/api/mail.ts` and `__tests__/mail-route.test.ts` equally — even though only the first one is genuinely "user-facing".

Symptoms when this is misconfigured: the **key-impact ratio** climbs above ~70% of total commits. That makes the `key` tier meaningless — testers can no longer use it to prioritise. Fix:

- Anchor the regex on path prefixes you actually care about (`src/activities/`, `app/(dashboard)/`) rather than keywords that match deep file names.
- Move the broad domain keywords into `matchKeywords` of the relevant business task, not the global regex.

A healthy spread is roughly 30–60% key, 10–30% support, 20–50% internal. Wide ranges, but the >70% key case is almost always a config bug.

### Task ties go to the task declared first

`matchTask` picks the highest-scoring task. On equal scores, the task that appears earlier in `businessTasks` wins. So if commit `feat(mobile): mobile.preview.image` gets `score=2` from both T02 ("Workspace / preview") and T08 ("Mobile companion"), whichever you wrote first will absorb it.

Order your tasks by priority — the more specific, business-prominent task should come first.

### `fallback` is required if you want a clean page

If a commit matches no task and `fallback.userImpactKey` / `fallback.internal` are missing or point to ids not in `businessTasks`, the row renders with the `(unassigned — configure fallback…)` label. That's deliberate — silent dump-to-T01 hides config bugs.

Always include a "responsive / smoke" task and a "release smoke" task at the end of your task list and reference them from `fallback`.

### `userCriticalRegex` is a normal RegExp string

It's case-insensitive (the script appends `i`), but otherwise raw. So `auth|signin|payment` is fine; `^auth$` will match nothing because file paths don't equal that. If you want word boundaries, write `(?:^|/)auth(?:[/.-]|$)` — and verify with a quick smoke run.

### `internalManualPoint` / `keyManualPoint` / `supportManualPoint`

The label keys for the per-row "Manual test point" line are tier-specific:

- `keyManualPoint` (optional) — used when the commit is impact=`key`.
- `supportManualPoint` (optional) — used when the commit is impact=`support`.
- `internalManualPoint` — used when the commit is impact=`internal`.
- `defaultManualPoint` — used for `key` and `support` if their dedicated template is empty.

If you want a single line for both `key` and `support`, leave the dedicated templates empty and only set `defaultManualPoint`. If you want differentiated copy (recommended for handoffs to non-technical testers — `key` should sound more urgent than `support`), provide all three.

`{task}` is substituted with `<task-id> · <task-name>`. Keep the placeholder.

### Filter bar CSS gotcha

The filter bar uses `display: flex; flex-wrap: wrap`. Long `<option>` text inside a `<select>` can intrinsically push the select past its share — historically this caused horizontal overflow at 390px. The script's CSS includes `min-width: 0` on `.filter-bar input, .filter-bar select, .filter-bar button` to defend against this. Do not strip it. (If you switch the layout to CSS grid, also use `grid-template-columns: repeat(N, minmax(0, 1fr))` for the same reason.)

### File size scales with commit count × files-per-commit

Each commit row's expanded file list is in the DOM (collapsed by default). A 1500-commit repo with a few large feature commits can easily hit 8–10 MB of HTML. The script doesn't trim files past 200 per commit (it shows "+N more"). If your repo regularly produces giant commits, consider lowering that cap or skipping the file list for `internal`-tier commits.
