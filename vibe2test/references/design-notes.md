# Design notes

Why the page looks the way it does, and what tradeoffs we picked. Read this
before changing the layout or the classification model — the page is small
on purpose.

## Audience

The page is for a *non-engineer* who got handed a commit log and a deadline.
They are skimming, not reading. Every design decision below follows from
this.

## Why a single static HTML file

- Sharable: drop it into a chat / email / drive without setup.
- Reproducible: the file is a snapshot of the repo at one HEAD; you can
  archive it next to the release.
- No drift: no live data means no "the dashboard says X but the API says Y"
  confusion.
- Offline: testers can open it on a flight or behind a corporate firewall.

The alternative — a hosted dashboard — was rejected because the operational
cost (auth, DB, deploys) destroys the "give me a test plan in 5 minutes"
loop this skill is built around.

## Why tasks aren't 1:1 with commits

A vibe-coder produces hundreds of commits a sprint. Reading 200 commit
messages teaches a tester nothing about whether the *product* works. The
business cares about user journeys, not refactors.

So the page has two views, deliberately:

- **Business tasks**: 8–15 cards organised by user journey. This is the
  executable test plan.
- **Full commit log**: chronological, filterable. This is the audit trail —
  for the engineer who wants to know exactly which commit broke a test, or
  for a sign-off doc.

A single task absorbs many commits; a single commit belongs to one task.
Tasks don't disappear when their commits are filtered out — the tester can
always see the full plan.

## Why user-impact is three tiers, not five

`key` / `support` / `internal` is the minimum number of tiers that lets the
tester actually filter. Adding a `critical` or `nice-to-have` tier sounded
useful for half a day, but in practice testers either run a task or they
don't — finer gradations just create decision fatigue.

The classification is heuristic and on purpose: better to over-tag than
under-tag. A `support` commit smoke-tested twice is fine; a `key` commit
that got hidden as `internal` and broke prod is not.

## Why we don't ask Claude to write per-commit test points

Two reasons:

1. **It doesn't scale.** 800 commits × even 30 seconds of LLM reasoning =
   hours. The whole skill should run in minutes.
2. **It's not useful.** Per-commit test points are noise — they tell the
   tester to "re-test the login flow" five times. The task-level plan is
   the actual instruction.

So commits get a *templated* per-row line ("rolls up into task X — follow
that task's how-to") and the heavy lifting is in task design.

## Why filters and not pagination

The full log can be 800 commits. Pagination would require state, navigation,
and a worse mobile experience. A single long page with `display:none`
filters lets:
- Browser find-in-page work across the whole log.
- The tester scroll the timeline naturally.
- The CSS-only filter UI work without any backend.

The cost is page weight (1–5 MB typical, ~10 MB upper bound). At that size
the page still opens instantly on a modern browser and renders within ~1s.

## Why no per-task checkbox / save state

Two reasons:
1. A static page can't save state across reloads without `localStorage`,
   and even then state would be per-browser per-machine. That's worse than
   nothing.
2. The result-capture template in the Quick Start panel is the intended
   capture flow — testers paste it into their own tracker (Notion, Linear,
   Jira). That's where state belongs.

If a future iteration adds optional `localStorage` checkboxes, it should be
purely additive and not change the "static, offline, reproducible" contract.

## Why we don't auto-detect business tasks

Static analysis of `app/` or `src/` can produce module names, but it can't
write a sentence about *why* a tester should care. That's a judgement call
that requires reading docs and product context. Defaulting to "auto-detected
test plan" would produce confident-sounding nonsense.

So the agent is in the loop. The script never hallucinates a task — only the
agent writes them, after reading the project. If the agent skips this step
the page falls back to a single "uncategorised" bucket, which is honest
about the failure.

## Why the script writes JSON to stdout

Easy to assert against in tests and CI without parsing HTML. The line is
small and stable; bumps would be a breaking change.

## Why we re-read HEAD after writing

A vibe-coded project's owner often types in another terminal while the agent
runs. That means HEAD can move between the moment we read `git log` and the
moment the agent reports "done". Without a post-write check, the kanban
silently lags by one or more commits — and the page itself prints what *was*
HEAD, hiding the drift.

The script now re-reads `git rev-parse HEAD` after writing the file and emits
`headDriftedDuringRun` in its JSON output. The agent uses that to decide
whether to re-run. This costs a millisecond and prevents the most common
silent failure mode we've actually seen in real handoffs.

## Things we deliberately don't do

- **Run the project.** This skill never starts a dev server, never executes
  test code. It only reads git history and writes one file.
- **Pretend live testing is part of generation.** The generated page is an
  executable plan, so a user may ask the agent to run it against staging or
  production next. That follow-on pass has different safety rules: credentials,
  OTP, browser-policy blocks, paid provider calls, uploads, emails, and external
  writes must be handled explicitly. See `live-regression.md`.
- **Make every verifier depend on one browser stack.** The bundled
  `verify_kanban.js` always provides static checks and only runs browser checks
  when Playwright is available. Agents can still use browser MCPs or app
  browsers for the visual pass without changing the generator contract.
- **Modify git history.** No rebases, no resets. The repo state is read-only.
- **Compare against a baseline.** "What's new since v1.2.0" is a fine
  feature; this skill's scope is the *current branch's* full history.
  Filtering by month and by commit hash is the workaround for now.
- **Include screenshots / images.** The page is text-only on purpose. A
  picture of staging would be out of date the moment it shipped.
