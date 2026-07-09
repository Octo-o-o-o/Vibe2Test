# Live environment regression handoff

This reference covers the common follow-up after generating `kanban.html`:
the user opens the page, then asks the agent to "run the checklist against
staging/production".

Keep this separate from the generator loop. Vibe2Test creates a static,
auditable plan; executing that plan against a live system is a normal QA
activity with credentials, billing, data, browser-policy, and external-side
effect constraints.

## Operating model

1. Use the generated task cards as the test matrix.
2. Start with safe public checks that do not require login.
3. Move to authenticated flows only after the user supplies test credentials,
   OTP/SSO access, or an existing test session.
4. Ask for explicit approval before any action that can create real data,
   spend money/credits, send email, upload private files, publish, delete,
   invite users, purchase, or write to an external system.
5. Report each task as `passed`, `failed`, `blocked`, or `not run`.

## Existing signed-in sessions

If the user asks to test "the current online environment" and the controlled
browser is already signed in to that environment, treat that as an existing test
session for read-only verification. This is useful for SaaS apps where OTP, SSO,
or admin permissions are hard to recreate in a fresh browser.

Rules for using that session:

- Confirm the environment from the URL and the visible product/account state.
- Do not extract, print, replay, or store cookies, localStorage tokens, OTP
  codes, bearer tokens, or session headers.
- Use the session for navigation, read-only route checks, search/filter
  interactions, opening detail panes, and viewing existing records.
- Still require explicit approval before writes, uploads, paid actions,
  external notifications, deletes, imports, shares, task launches, or provider
  calls. A signed-in session is not blanket approval to mutate data.
- If the visible account is a real customer/user account rather than a test or
  admin account, keep screenshots and reports free of private data unless the
  user explicitly asks for that evidence.

## Non-destructive public smoke

These checks are usually safe before login:

- Health endpoint returns the expected service identity.
- Root page returns HTML and expected security headers.
- Static assets load and do not contain API keys, bearer tokens, obvious
  secrets, private hostnames, or raw local filesystem paths.
- Protected API routes return 401/403 when called without a session.
- Sensitive-looking paths such as `/.env`, `/.git/config`, `/__*`, `/Users/*`,
  `/opt/*`, `/var/*`, and backup/archive extensions do not expose real files.
  A SPA fallback body may mean "no leak", but returning `200` for these paths is
  still worth reporting because security scanners often treat it as suspicious.
- Public download/share endpoints expose only intentionally public content.

For static marketing/docs sites, add these safe checks:

- Every URL in `sitemap.xml` returns 200 and the expected content type.
- If the local repo contains deploy artifacts, compare deployed HTML/assets
  against local files by byte count or hash to detect stale deploys.
- Internal links and hash anchors resolve. A 200 page with a missing `#anchor`
  is still a navigation failure.
- Public external links are checked from an unauthenticated/public perspective;
  private GitHub or doc links that return 404 to the public should be reported.
- `robots.txt`, canonical links, hreflang alternates, Open Graph metadata,
  JSON-LD, and LLM-friendly alternates (`llms.txt`, `llms-full.txt`) agree with
  the product's stated crawl/AI policy. Managed CDN robots injections can change
  the effective policy even when the repo file looks correct.
- Desktop and mobile viewports have no horizontal page overflow. For lazy
  images, scroll them into view before treating `naturalWidth === 0` as broken.

## Authenticated read-only route sweep

When an existing test session is available, add a route sweep before trying
deeper task flows. This catches release-level breakage quickly and gives the
test report a clear coverage boundary.

Build the route list from:

- `kanban.html` task URLs and staging metadata.
- App navigation/menus visible in the browser.
- Route inventories in README, AGENTS.md, docs, sitemap, or router files.
- Admin/employer/internal areas only when the active session visibly has access.

For each route:

- Open the URL directly, not only through client-side navigation.
- Wait for the page to settle enough to distinguish a real empty state from a
  loading-only state.
- Treat framework error boundaries, blank screens, infinite loading, and uncaught
  console errors as failures even if the HTTP status is 200.
- Record the actual URL after redirects, the visible page title or primary
  heading, and whether the page is public, authenticated, or role-gated.
- On desktop and one mobile viewport, check document-level horizontal overflow.
  Ignore intentional inner scroll regions only after noting that they are
  bounded controls such as tables, charts, carousels, or code blocks.

Route sweeps are smoke coverage, not proof that every business task passed. Keep
task-level statuses honest: a page can load while creation, payment, upload, or
notification flows remain blocked or not run.

## Cross-surface consistency probes

During the sweep, look for related pages that should agree:

- Dashboard counts vs list pages.
- Empty-state copy vs detail/eligibility/history pages that show records.
- Search result totals vs visible rows after filters settle.
- Admin health/status pages vs public feature availability.
- Download/preview links vs artifact lists.

Report inconsistencies as product findings with exact pages checked. Do not
force them into security or data-corruption language unless the evidence supports
that severity.

## Browser automation blockers

Browser tooling may refuse to visit a staging or production URL because of a
runtime URL policy, enterprise policy, auth wall, CAPTCHA, or browser permission
prompt. Treat those as valid blockers for UI verification:

- Do not bypass the block with another browser surface, raw CDP, local proxying,
  or a lower-level command path.
- Continue only with materially safer checks that do not require the blocked
  browser action, such as direct HTTP status checks for public endpoints.
- Mark the affected UI tasks as blocked and state exactly what would unblock
  them, for example "user logs in and provides an active test session" or "URL
  allowed by browser policy".

## Authenticated and costly flows

Most useful product checks need login and may create data. Before running them,
confirm:

- Which environment is being tested.
- Which test account/session to use.
- Whether creating one low-cost task/order/report is allowed.
- Whether emails, notifications, browser automation, or third-party providers
  are expected to fire.
- How to clean up test data, or whether it should be left for review.

If any of those are missing, do not invent credentials or mark the flow passed.
Report it as blocked with the missing prerequisite.

## Failure notes and source-code hints

When a UI failure is reproducible in the live environment and the local repo is
available, it is useful to include a likely source file/line. Keep that clearly
separate from observed evidence:

- Evidence: URL, visible error text, console error, status code, reproduction
  steps.
- Inference: probable local source location or data shape based on the current
  checkout.

Never overstate the inference. The deployed build may not match the local
checkout, sourcemaps may be absent, and minified stack traces can point to a
symptom rather than the root cause.

## Shell hygiene

When writing ad hoc smoke loops under zsh, do not use `path` as the loop
variable name:

```sh
# Bad in zsh: path is tied to command lookup.
for path in /healthz /v1/me; do
  curl "https://example.com$path"
done

# Good.
for url_path in /healthz /v1/me; do
  curl "https://example.com$url_path"
done
```

Accidentally assigning `path` can make commands like `curl`, `head`, or `awk`
look missing in the rest of that shell invocation, producing noisy false
failures.

## Report shape

Keep the final chat summary short, and write a durable report when the repo has
a manual testing directory (`manualDocDir`, `docs/manual-testing/`, or a similar
project convention). A timestamped Markdown file is usually enough.

The report should be evidence-backed:

- Environment and timestamp.
- Scope and safety boundary: public smoke only, authenticated read-only sweep,
  or explicitly approved write/cost flows.
- `passed`: checks with URLs/status codes or UI evidence.
- `failed`: real product or security failures, with reproduction steps.
- `blocked`: login/OTP/session/browser-policy/permission/cost prerequisites.
- `not run`: intentionally skipped areas and why.
- Side-effect skip list: payments, emails, uploads, task launches, imports,
  deletes, shares, provider calls, or anything else intentionally avoided.
- Risk note: whether the run covered end-to-end business flows or only proved
  that routes and read-only interactions work.

Do not include API keys, cookies, verification codes, raw access tokens, private
customer data, or screenshots that expose sensitive records unless explicitly
authorized.
