# vibe2test

> Turn a vibe-coded git history into a single static `kanban.html` that a PM, QA, or business owner can open and act on.

A Claude Code skill (also usable as a plain Node script). Given any git repo,
it produces one self-contained HTML file with:

- **8–15 business regression tasks** organised by user journey, written for a
  non-engineer (persona, time budget, materials, links, pass criteria, caveats).
- **The full commit log**, grouped by date and module, with search and filters
  (by task, user-impact tier, date, module, commit type).
- **User-impact tags** on every commit — `key` (needs user-simulated testing),
  `support` (short smoke is enough), `internal` (automation / docs / chores).
- A **Quick Start** panel with login URL, recommended run order, and a
  result-capture template testers can paste into Notion / Linear / Jira.

Single HTML file. No build step. No dev server. Works offline. Mobile-friendly.

## Who this is for

You shipped a sprint of commits and now someone non-technical has to sign off.
Reading 200 commit subjects teaches them nothing about whether the *product*
works. `kanban.html` translates the git timeline into a checklist they can
actually run.

## Install (Claude Code)

Drop the `vibe2test/` directory into your skills folder:

```sh
# user-level
cp -r vibe2test ~/.claude/skills/

# or project-level
cp -r vibe2test <your-repo>/.claude/skills/
```

Or build a single distributable `vibe2test.skill` archive:

```sh
zip -r vibe2test.skill vibe2test \
  -x '*/__pycache__/*' '*.pyc' '*.DS_Store' '*/node_modules/*' 'vibe2test/evals/*'
```

The resulting `.skill` is just a zip — Claude Code reads it the same way as
the bare directory. Hand it to a teammate, they unzip it into their skills
folder.

Then in Claude Code, ask for a regression kanban:

> Generate a business regression kanban for this repo.

The skill auto-triggers on phrases like "regression kanban", "QA dashboard",
"business test board", "test plan from commits", "回归测试看板",
"给业务的测试面板".

## Use as a plain script (no Claude)

You can run the generator yourself with a hand-written config:

```sh
node vibe2test/scripts/gen_kanban.js --config examples/sample-config.json
```

You'll get a `kanban.html` written to wherever `output` points. See
`examples/sample-config.json` for the schema and
`vibe2test/references/customization.md` for the full reference.

## What the page looks like

- Header with project name, branch, HEAD, staging URLs, and counts.
- "Quick start for testers" panel: login URL, run order, result template.
- "What changed recently" panel: 8 highlights from the most recent
  user-facing commits.
- A sticky filter bar (search, task, user-impact, date, module, type).
- A grid of business task cards.
- The full commit log, grouped by day and module, with collapsible file
  lists and commit bodies.

Mobile width tested at 390px. No horizontal overflow.

## How it works

The Node script is the deterministic part: it reads `git log` with numstat,
classifies each commit, groups commits into tasks, and renders one HTML file.
A config JSON tells it how to classify (module rules, impact rules, task
definitions).

The Claude skill is the smart part: it reads your CLAUDE.md / docs / package
layout, asks a couple of questions about your staging setup, and writes the
project-specific config. That config-design step is where the value lives.

If you want, you can skip Claude entirely and write the config by hand.

## Configuration

Everything is in one JSON file. The big sections:

- `staging` — URLs and login info shown in the Quick Start panel.
- `moduleRules` — substring-match rules that label each commit's files with a
  module name (first match wins).
- `impactRules` — heuristics for user-impact tier classification.
- `businessTasks` — the 8–15 tasks you want the tester to run.
- `labels` — UI strings (English by default; Chinese template included).

See [`vibe2test/references/customization.md`](vibe2test/references/customization.md)
for the full schema and patterns.

## Why we don't do per-commit test points

A test plan with 800 line items teaches a tester nothing. Tasks should be at
the user-journey level. The full commit log is the audit trail, not the
to-do list.

See [`vibe2test/references/design-notes.md`](vibe2test/references/design-notes.md)
for more design rationale.

## Requirements

- Node.js 18+ (the script uses zero npm dependencies).
- `git` on `$PATH`.
- A Python or other static HTTP server for browser-based verification (the
  skill instructions handle this).

## Status

Alpha. The output format and config schema may evolve. Pin a release if you
need stability.

## License

MIT — see [LICENSE](LICENSE).
