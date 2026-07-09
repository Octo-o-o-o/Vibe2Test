#!/usr/bin/env node
/**
 * Static + optional browser verifier for vibe2test kanban.html.
 *
 * Default mode uses only Node built-ins and catches stale HEAD/counts,
 * missing key DOM hooks, missing task assignment, and wrong filter event
 * wiring. Pass --browser when Playwright is available to also exercise the
 * page at 1280x900 and 390x844.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

function parseArgs(argv) {
  const out = { browser: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--browser') out.browser = true;
    else if (a === '--json') out.json = true;
    else if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) out[k] = true;
      else { out[k] = v; i += 1; }
    }
  }
  return out;
}

function fail(message, extra) {
  const err = new Error(message);
  err.extra = extra;
  throw err;
}

function readConfig(configPath) {
  if (!configPath) return {};
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function git(repo, args) {
  return execSync(`git ${args}`, { cwd: repo, encoding: 'utf8' }).trim();
}

function textById(html, id) {
  const re = new RegExp(`<[^>]+id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`);
  const m = html.match(re);
  return m ? m[1].replace(/<[^>]*>/g, '').trim() : '';
}

function count(re, html) {
  return (html.match(re) || []).length;
}

function staticVerify(opts) {
  const config = readConfig(opts.config);
  const repo = path.resolve(opts.repo || config.repo || process.cwd());
  const file = path.resolve(opts.file || opts.output || config.output || path.join(repo, 'kanban.html'));
  const html = fs.readFileSync(file, 'utf8');
  const expectedHead = String(opts['expected-head'] || (fs.existsSync(path.join(repo, '.git')) ? git(repo, 'rev-parse HEAD') : '')).trim();
  const expectedCommits = Number(opts['expected-commits'] || (fs.existsSync(path.join(repo, '.git')) ? git(repo, 'rev-list --count HEAD') : 0));
  const expectedTasks = Number(opts['expected-tasks'] || (Array.isArray(config.businessTasks) ? config.businessTasks.length : 0));

  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
  const head = textById(html, 'head-hash');
  const commitsText = textById(html, 'total-commits');
  const taskCards = count(/class=["'][^"']*\btask-card\b/g, html);
  const commitRows = count(/class=["'][^"']*\bcommit-row\b/g, html);
  const hasQuickStart = /\bquickstart\b/.test(html) || /\bquick-start\b/.test(html);
  const hasFilterBar = /\bfilter-bar\b/.test(html);
  const filterUsesInput = /addEventListener\(['"]input['"]\s*,\s*applyFilters\)/.test(html);
  const unassignedRows = count(/class=["'][^"']*\bcommit-row\b[^>]*\bdata-task=["']["']/g, html);

  const errors = [];
  if (!title) errors.push('missing <title>');
  if (expectedHead && head !== expectedHead.slice(0, 12)) errors.push(`HEAD mismatch: page=${head} expected=${expectedHead.slice(0, 12)}`);
  if (expectedCommits && Number(commitsText) !== expectedCommits) errors.push(`commit counter mismatch: page=${commitsText} expected=${expectedCommits}`);
  if (expectedCommits && commitRows !== expectedCommits) errors.push(`commit row count mismatch: page=${commitRows} expected=${expectedCommits}`);
  if (expectedTasks && taskCards !== expectedTasks) errors.push(`task card count mismatch: page=${taskCards} expected=${expectedTasks}`);
  if (!hasQuickStart) errors.push('missing quickstart/quick-start panel');
  if (!hasFilterBar) errors.push('missing filter bar');
  if (!filterUsesInput) errors.push('filter listeners are not wired to input events');
  if (unassignedRows > 0) errors.push(`${unassignedRows} commit rows have no task assignment`);

  return {
    ok: errors.length === 0,
    mode: 'static',
    file,
    repo,
    title,
    head,
    expectedHead: expectedHead || null,
    commits: Number(commitsText),
    expectedCommits: expectedCommits || null,
    commitRows,
    taskCards,
    expectedTasks: expectedTasks || null,
    hasQuickStart,
    hasFilterBar,
    filterUsesInput,
    unassignedRows,
    errors,
  };
}

function loadPlaywright() {
  for (const base of [process.cwd(), __dirname]) {
    try {
      const resolved = require.resolve('playwright', { paths: [base] });
      return require(resolved);
    } catch {
      // Try the next lookup root.
    }
  }
  fail('Playwright is not available. Run the static check, or install/provide Playwright before using --browser.');
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  return 'application/octet-stream';
}

function startServer(root) {
  const safeRoot = path.resolve(root);
  const safeRootPrefix = safeRoot.endsWith(path.sep) ? safeRoot : `${safeRoot}${path.sep}`;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const requested = path.normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '').replace(/^(\.\.[/\\])+/, '');
    // After stripping leading slashes the root request becomes '' (not '/').
    const filePath = path.resolve(safeRoot, requested === '' ? 'kanban.html' : requested);
    if ((!filePath.startsWith(safeRootPrefix) && filePath !== safeRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': contentType(filePath) });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function browserVerify(staticResult) {
  const playwright = loadPlaywright();
  const root = path.dirname(staticResult.file);
  const server = await startServer(root);
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/${encodeURIComponent(path.basename(staticResult.file))}`;
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const desktop = await checkViewport(browser, url, { width: 1280, height: 900 }, 'key');
    const mobile = await checkViewport(browser, url, { width: 390, height: 844 }, 'internal');
    const errors = [];
    for (const [name, result] of [['desktop', desktop], ['mobile', mobile]]) {
      if (result.title !== staticResult.title) errors.push(`${name}: title mismatch`);
      if (result.head !== staticResult.head) errors.push(`${name}: HEAD mismatch`);
      if (result.totalCommits !== String(staticResult.expectedCommits || staticResult.commits)) errors.push(`${name}: commit counter mismatch`);
      if (result.taskCards !== staticResult.taskCards) errors.push(`${name}: task card count mismatch`);
      if (result.commitRows !== staticResult.commitRows) errors.push(`${name}: commit row count mismatch`);
      if (result.overflow) errors.push(`${name}: horizontal overflow`);
      if (!result.hasQuickStart) errors.push(`${name}: quickstart panel missing`);
      if (!result.hasFilterBar) errors.push(`${name}: filter bar missing`);
      if (!result.filterChanged) errors.push(`${name}: filter did not change visible row count`);
    }
    if (mobile.offenders.length) errors.push(`mobile: ${mobile.offenders.length} overflowing elements`);
    return { ok: errors.length === 0, mode: 'browser', url, desktop, mobile, errors };
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function checkViewport(browser, url, viewport, preferredImpact) {
  const page = await browser.newPage({ viewport });
  await page.goto(url, { waitUntil: 'load' });
  const result = await page.evaluate(async (preferred) => {
    const txt = (sel) => document.querySelector(sel)?.textContent?.trim() || '';
    const rows = () => Array.from(document.querySelectorAll('.commit-row')).filter((el) => el.style.display !== 'none').length;
    const before = rows();
    const impact = document.querySelector('#f-impact');
    const options = Array.from(document.querySelectorAll('.commit-row')).reduce((acc, row) => {
      const key = row.dataset.impact || '';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    let selected = preferred;
    if (!options[selected] || options[selected] === before) {
      selected = Object.keys(options).find((k) => k && options[k] > 0 && options[k] < before) || '';
    }
    if (impact && selected) {
      impact.value = selected;
      impact.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const offenders = Array.from(document.querySelectorAll('body *'))
      .filter((el) => el.scrollWidth > el.clientWidth + 2)
      .slice(0, 10)
      .map((el) => ({ tag: el.tagName, id: el.id, className: String(el.className), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    return {
      title: document.title,
      head: txt('#head-hash'),
      totalCommits: txt('#total-commits'),
      taskCards: document.querySelectorAll('.task-card').length,
      commitRows: document.querySelectorAll('.commit-row').length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2 || document.body.scrollWidth > document.body.clientWidth + 2,
      hasQuickStart: Boolean(document.querySelector('.quickstart, .quick-start')),
      hasFilterBar: Boolean(document.querySelector('.filter-bar')),
      filterBefore: before,
      filterAfter: rows(),
      filterChanged: selected ? rows() !== before : true,
      selectedImpact: selected,
      offenders,
    };
  }, preferredImpact);
  await page.close();
  return result;
}

(async () => {
  const opts = parseArgs(process.argv);
  const staticResult = staticVerify(opts);
  const result = { static: staticResult };
  if (opts.browser) result.browser = await browserVerify(staticResult);
  result.ok = staticResult.ok && (!result.browser || result.browser.ok);
  if (opts.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`${result.ok ? 'ok' : 'failed'}: ${staticResult.file}`);
    if (!result.ok) {
      for (const e of staticResult.errors) console.error(`static: ${e}`);
      if (result.browser) for (const e of result.browser.errors) console.error(`browser: ${e}`);
    }
  }
  process.exit(result.ok ? 0 : 1);
})().catch((err) => {
  const payload = { ok: false, error: err.message || String(err), extra: err.extra };
  console.error(JSON.stringify(payload, null, 2));
  process.exit(2);
});
