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
{"output":"/path/kanban.html","commits":793,"expectedCommits":793,"head":"...","branch":"main","tasks":15,"keyImpact":483,"support":65,"internal":245}
```

`commits` is what the script parsed; `expectedCommits` is `git rev-list
--count HEAD`. They should match. If they don't, something in git's output
format changed — open an issue.
