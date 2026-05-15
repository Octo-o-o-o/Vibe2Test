#!/usr/bin/env node
/**
 * vibe2test — single-file business regression kanban generator.
 *
 * Reads a project's git history and renders one static `kanban.html` that a
 * non-engineer (PM / QA / business stakeholder) can open in a browser to:
 *   - see every commit grouped by date and module, with filters and search
 *   - know what to test, organized into a handful of business tasks
 *   - know which changes are user-visible vs. internal
 *
 * The script itself is a deterministic engine: classification, grouping,
 * HTML rendering. All project-specific knowledge (which directories are
 * which modules, which business tasks exist, which labels to show) comes
 * from a JSON config file. Defaults are conservative and English; agents
 * are expected to write a project-tailored config.
 *
 * Usage:
 *   node gen_kanban.js --config <path>                 # full control
 *   node gen_kanban.js --repo <path> --output kanban.html  # defaults only
 *
 * Config schema: see ../references/customization.md
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ---------- CLI parsing ----------

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { args[key] = next; i++; }
      else args[key] = true;
    } else {
      args._.push(a);
    }
  }
  return args;
}

const args = parseArgs(process.argv);

let config = {};
if (args.config) {
  config = JSON.parse(fs.readFileSync(args.config, 'utf8'));
}
if (args.repo) config.repo = args.repo;
if (args.output) config.output = args.output;

const REPO = path.resolve(config.repo || process.cwd());
const OUT = path.resolve(config.output || path.join(REPO, 'kanban.html'));

// ---------- Defaults ----------

const DEFAULT_LABELS = {
  pageTitle: 'Business Regression Kanban',
  branch: 'Branch',
  head: 'HEAD',
  totalCommits: 'commits in total',
  stagingWeb: 'Staging Web',
  stagingApi: 'Staging API',
  businessTasks: 'Business tasks',
  keyImpact: 'User-impact · key',
  supportImpact: 'User-impact · support',
  internalImpact: 'Internal / automation',
  quickStart: 'Quick start for testers',
  loginEntry: 'Login URL',
  loginInfo: 'Default login info',
  runOrder: 'Recommended run order',
  resultTemplate: 'Result-capture template',
  principles: 'Judgement principles',
  highlights: 'What changed recently (key user-facing items)',
  highlightsEmpty: 'No recent user-facing changes — a release smoke (T-smoke) is enough.',
  tasksHeading: 'Business regression tasks',
  fullLog: 'Full commit log',
  fullLogSubtitle: 'grouped by date, then by module',
  search: 'Search tasks / commit / module / goal',
  taskFilter: 'Task: all',
  impactFilter: 'User impact: all',
  monthFilter: 'Date: all',
  moduleFilter: 'Module: all',
  typeFilter: 'Type: all',
  reset: 'Reset filters',
  showing: 'Showing',
  of: 'of',
  commitsCounter: 'commits',
  tasksCounter: 'tasks',
  // task card
  taskPersona: 'Persona',
  taskEta: 'Time budget',
  taskMaterials: 'Materials',
  taskCost: 'Cost / fees',
  taskLinks: 'Links',
  taskGoal: 'Goal',
  taskHow: 'How to test',
  taskPass: 'Pass criteria',
  taskCaveats: 'Caveats',
  taskRefDoc: 'Reference doc',
  taskCommitsHeader: 'commits in this task',
  // commit row
  rowMergedTask: 'Merged into task',
  rowFiles: 'files',
  rowModule: 'Module',
  rowManualPoint: 'Manual test point',
  rowCaveats: 'Caveats',
  rowChangedFiles: 'Changed files',
  rowCommitBody: 'commit body',
  // type names (keys are normalized english types)
  typeNames: {
    feat: 'feat', fix: 'fix', refactor: 'refactor', test: 'test',
    docs: 'docs', perf: 'perf', chore: 'chore', init: 'init',
    update: 'update', revert: 'revert', other: 'other',
  },
  impactKey: 'Key: needs user-simulated test',
  impactSupport: 'Support: short smoke is enough',
  impactInternal: 'Internal / automation',
  // manual-point copy
  internalManualPoint: 'Rolls up into task {task}. A short smoke is enough; deeper correctness is covered by automation or code review.',
  internalCaveat: 'If the smoke shows no blank screen and the main path still works, no per-commit verification needed.',
  defaultManualPoint: 'Part of regression task {task}. Follow that task\'s "How to test" — no need to reproduce per commit.',
  // Optional per-impact-tier overrides for the manual-point line.
  // If unset, the renderer falls back to defaultManualPoint for both key and support.
  keyManualPoint: '',
  supportManualPoint: '',
  // Banner shown when a commit ends up unassigned (no task match + no fallback configured).
  unassignedTaskLabel: '(unassigned — configure `fallback.userImpactKey` / `fallback.internal`)',
};

const DEFAULT_TYPE_RULES = [
  { prefix: /^feat\b/, key: 'feat' },
  { prefix: /^fix\b/, key: 'fix' },
  { prefix: /^refactor\b/, key: 'refactor' },
  { prefix: /^test\b/, key: 'test' },
  { prefix: /^docs?\b/, key: 'docs' },
  { prefix: /^perf\b/, key: 'perf' },
  { prefix: /^chore\b/, key: 'chore' },
  { prefix: /^build\b/, key: 'chore' },
  { prefix: /^ci\b/, key: 'chore' },
  { prefix: /^style\b/, key: 'chore' },
  { prefix: /^init\b/, key: 'init' },
  { prefix: /initial commit/, key: 'init' },
  { prefix: /^revert\b/, key: 'revert' },
  { prefix: /^update\b/, key: 'update' },
];

const DEFAULT_MODULE_RULES = [
  { name: 'Auth & session', match: ['auth', 'signin', 'signup', 'session', 'login', 'logout'], notMatch: ['admin'] },
  { name: 'Admin / internal', match: ['admin/', '/admin', 'app/api/admin'] },
  { name: 'API routes', match: ['app/api/', 'pages/api/'] },
  { name: 'Frontend pages', match: ['app/(', 'app/dashboard', 'pages/', 'src/pages'] },
  { name: 'Components', match: ['components/', 'src/components'] },
  { name: 'Services (backend)', match: ['services/', 'src/services', 'server/'] },
  { name: 'Workers / queue', match: ['workers/', 'queue', 'jobs/'] },
  { name: 'Database / migrations', match: ['prisma/', 'migrations/', 'drizzle/', 'schema.sql'] },
  { name: 'Library / utilities', match: ['lib/', 'src/lib', 'utils/', 'src/utils'] },
  { name: 'Tests', match: ['__tests__/', '/test/', '/tests/', '.test.', '.spec.', 'e2e/'] },
  { name: 'Docs', match: ['docs/', 'README', '.md'] },
  { name: 'Scripts / deploy', match: ['scripts/', 'deploy', 'Dockerfile', 'docker-compose', '.sh'] },
  { name: 'Tooling / config', match: ['package.json', 'tsconfig', '.config.', '.env', '.eslint', '.prettier', 'biome', 'postcss', 'playwright', 'jest'] },
];

const DEFAULT_IMPACT_RULES = {
  // commit-type fast paths
  internalTypes: ['test', 'docs', 'chore'],
  // file path heuristics for "user-visible"
  userFacingPatterns: [
    'app/(marketing)',
    'app/(dashboard)',
    'app/dashboard',
    'app/page.',
    'app/layout.',
    'pages/',
    'components/',
  ],
  // keywords that strongly suggest user-touching work
  userCriticalRegex: 'auth|signin|login|signup|register|payment|credit|notification|upload|export|report|template|chat|knowledge|signal|brief|share|invite|onboarding|billing|search',
  supportPatterns: ['services/', 'src/services', 'lib/', 'src/lib', 'workers/', 'prisma/', 'server/'],
};

const DEFAULT_FALLBACK = {
  // task id to use when impact == key but no matchModules/keywords hit
  userImpactKey: null,
  // task id for internal-only commits that didn't match
  internal: null,
};

// Merge config over defaults (shallow merge for top-level objects; arrays from config replace defaults)
function pick(o, k, d) { return o[k] !== undefined ? o[k] : d; }
const projectName = pick(config, 'projectName', path.basename(REPO));
const language = pick(config, 'language', 'en');
const labels = Object.assign({}, DEFAULT_LABELS, config.labels || {});
labels.typeNames = Object.assign({}, DEFAULT_LABELS.typeNames, (config.labels && config.labels.typeNames) || {});
const moduleRules = Array.isArray(config.moduleRules) && config.moduleRules.length ? config.moduleRules : DEFAULT_MODULE_RULES;
const typeRules = Array.isArray(config.typeRules) && config.typeRules.length
  ? config.typeRules.map(r => ({ prefix: new RegExp(r.prefix), key: r.key }))
  : DEFAULT_TYPE_RULES;
const impactRules = Object.assign({}, DEFAULT_IMPACT_RULES, config.impactRules || {});
const fallback = Object.assign({}, DEFAULT_FALLBACK, config.fallback || {});
const staging = config.staging || {};
const manualDocDir = config.manualDocDir || '';
const businessTasks = Array.isArray(config.businessTasks) ? config.businessTasks : [];

// ---------- Git ----------

function git(argstr) {
  return execSync(`git ${argstr}`, { cwd: REPO, maxBuffer: 512 * 1024 * 1024, encoding: 'utf8' });
}

const HEAD = git('rev-parse HEAD').trim();
const BRANCH = (() => { try { return git('rev-parse --abbrev-ref HEAD').trim(); } catch { return '(detached)'; } })();
const COUNT_FROM_GIT = parseInt(git('rev-list --count HEAD').trim(), 10);

const SEP = '';
const REC = '';
const BODYSEP = '';
const fmt = ['%H', '%h', '%ai', '%an', '%s', '%b'].join(SEP);

const raw = git(`log --reverse --pretty=format:"${REC}${fmt}${BODYSEP}" --numstat`);
const blocks = raw.split(REC).slice(1);
const commits = [];
for (const block of blocks) {
  const idx = block.indexOf(BODYSEP);
  if (idx === -1) continue;
  const head = block.slice(0, idx);
  const after = block.slice(idx + 1);
  const [fullHash, shortHash, dateIso, author, subject, ...bodyParts] = head.split(SEP);
  const body = bodyParts.join(SEP);
  const lines = after.split('\n').map(s => s.trim()).filter(Boolean);
  const files = [];
  let ins = 0, del = 0;
  for (const ln of lines) {
    const parts = ln.split('\t');
    if (parts.length < 3) continue;
    const a = parts[0], d = parts[1], file = parts.slice(2).join('\t');
    if (a !== '-') ins += parseInt(a, 10) || 0;
    if (d !== '-') del += parseInt(d, 10) || 0;
    files.push(file);
  }
  commits.push({ fullHash, shortHash, dateIso, author, subject, body: body.trim(), files, insertions: ins, deletions: del });
}

// ---------- Classification ----------

function classifyType(subject) {
  const s = String(subject || '').toLowerCase();
  for (const r of typeRules) if (r.prefix.test(s)) return r.key;
  return 'other';
}

function pathHas(file, needles) {
  if (!Array.isArray(needles)) return false;
  for (const n of needles) if (file.includes(n)) return true;
  return false;
}

function detectModules(files) {
  const set = new Set();
  for (const f of files) {
    for (const rule of moduleRules) {
      if (pathHas(f, rule.match) && !pathHas(f, rule.notMatch || [])) { set.add(rule.name); break; }
    }
  }
  if (set.size === 0) set.add('Other');
  return Array.from(set);
}

function classifyImpact(c) {
  const t = classifyType(c.subject);
  if (impactRules.internalTypes.includes(t)) return 'internal';
  const files = c.files;
  const userCriticalRegex = impactRules.userCriticalRegex ? new RegExp(impactRules.userCriticalRegex, 'i') : null;
  const hasUserFacing = files.some(f =>
    pathHas(f, impactRules.userFacingPatterns) ||
    (userCriticalRegex && userCriticalRegex.test(f)));
  if (hasUserFacing) return 'key';
  const hasSupport = files.some(f => pathHas(f, impactRules.supportPatterns));
  if (hasSupport) return 'support';
  return 'internal';
}

function matchTask(c) {
  const modules = c._modules;
  const blob = (c.subject + ' ' + c.body).toLowerCase();
  let best = null, bestScore = 0;
  for (const t of businessTasks) {
    let score = 0;
    if (Array.isArray(t.matchModules)) {
      for (const m of t.matchModules) if (modules.includes(m)) score += 2;
    }
    if (Array.isArray(t.matchKeywords)) {
      for (const kw of t.matchKeywords) if (blob.includes(String(kw).toLowerCase())) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return bestScore > 0 ? best : null;
}

for (const c of commits) {
  c._type = classifyType(c.subject);
  c._modules = detectModules(c.files);
  c._impact = classifyImpact(c);
  c._task = matchTask(c);
}

// Fallback assignment
const taskById = Object.fromEntries(businessTasks.map(t => [t.id, t]));
let unassignedFallbackUsed = 0;
for (const c of commits) {
  if (!c._task) {
    if (c._impact === 'key' && fallback.userImpactKey && taskById[fallback.userImpactKey]) {
      c._task = taskById[fallback.userImpactKey];
    } else if (fallback.internal && taskById[fallback.internal]) {
      c._task = taskById[fallback.internal];
    } else {
      // No matching task and no fallback configured — leave unassigned rather than
      // silently dumping into businessTasks[0]. The renderer surfaces this as a
      // visible "(unassigned)" tag so the agent notices their config is incomplete.
      unassignedFallbackUsed += 1;
    }
  }
}

// ---------- Aggregations ----------

const taskStats = {};
for (const t of businessTasks) taskStats[t.id] = { task: t, commits: [] };
for (const c of commits) {
  if (c._task && taskStats[c._task.id]) taskStats[c._task.id].commits.push(c);
}

const byDate = {};
for (const c of commits) {
  const d = c.dateIso.slice(0, 10);
  (byDate[d] = byDate[d] || []).push(c);
}
const dates = Object.keys(byDate).sort().reverse();

const allModules = new Set();
for (const c of commits) c._modules.forEach(m => allModules.add(m));
const months = Array.from(new Set(commits.map(c => c.dateIso.slice(0, 7)))).sort().reverse();
const types = Array.from(new Set(commits.map(c => c._type))).sort();

const keyImpactCount = commits.filter(c => c._impact === 'key').length;
const supportCount = commits.filter(c => c._impact === 'support').length;
const internalCount = commits.filter(c => c._impact === 'internal').length;

// Recent highlights: scan most-recent commits (chronological end), pick first 8 key/support that map to distinct tasks
const recent = commits.slice(-50).reverse();
const highlights = [];
{
  const seen = new Set();
  for (const c of recent) {
    if (c._impact === 'internal') continue;
    if (!c._task) continue;
    if (seen.has(c._task.id)) continue;
    seen.add(c._task.id);
    highlights.push({ task: c._task, commit: c });
    if (highlights.length >= 8) break;
  }
}

// ---------- HTML rendering ----------

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

const impactLabel = imp => imp === 'key' ? labels.impactKey : imp === 'support' ? labels.impactSupport : labels.impactInternal;
const impactClass = imp => imp === 'key' ? 'imp-key' : imp === 'support' ? 'imp-sup' : 'imp-int';
const typeLabel = key => labels.typeNames[key] || labels.typeNames.other || key;

function renderTaskCard(t, count) {
  const ucount = (taskStats[t.id].commits.filter(c => c._impact === 'key')).length;
  return `
  <article class="task-card" data-task="${esc(t.id)}">
    <header class="task-head">
      <span class="task-id">${esc(t.id)}</span>
      <h3>${esc(t.name)}</h3>
      <span class="badge">${count} ${esc(labels.commitsCounter)}</span>
      <span class="badge badge-key">${ucount} key</span>
    </header>
    <dl class="task-meta">
      ${t.persona ? `<div><dt>${esc(labels.taskPersona)}</dt><dd>${esc(t.persona)}</dd></div>` : ''}
      ${t.eta ? `<div><dt>${esc(labels.taskEta)}</dt><dd>${esc(t.eta)}</dd></div>` : ''}
      ${t.materials ? `<div><dt>${esc(labels.taskMaterials)}</dt><dd>${esc(t.materials)}</dd></div>` : ''}
      ${t.cost ? `<div><dt>${esc(labels.taskCost)}</dt><dd>${esc(t.cost)}</dd></div>` : ''}
    </dl>
    ${Array.isArray(t.urls) && t.urls.length ? `<div class="task-section"><h4>${esc(labels.taskLinks)}</h4><ul class="link-list">${t.urls.map(u => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a></li>`).join('')}</ul></div>` : ''}
    ${t.goal ? `<div class="task-section"><h4>${esc(labels.taskGoal)}</h4><p>${esc(t.goal)}</p></div>` : ''}
    ${t.how ? `<div class="task-section"><h4>${esc(labels.taskHow)}</h4><p>${esc(t.how)}</p></div>` : ''}
    ${t.pass ? `<div class="task-section"><h4>${esc(labels.taskPass)}</h4><p>${esc(t.pass)}</p></div>` : ''}
    ${t.caveats ? `<div class="task-section"><h4>${esc(labels.taskCaveats)}</h4><p>${esc(t.caveats)}</p></div>` : ''}
    ${t.refDoc ? `<div class="task-section"><h4>${esc(labels.taskRefDoc)}</h4><p>${esc(t.refDoc)}</p></div>` : ''}
    <details class="task-commits">
      <summary>${count} ${esc(labels.taskCommitsHeader)}</summary>
      <ul class="commit-mini-list">
        ${taskStats[t.id].commits.slice().reverse().slice(0, 80).map(c =>
          `<li><code>${esc(c.shortHash)}</code> <span class="dim">${esc(c.dateIso.slice(0, 10))}</span> ${esc(c.subject)}</li>`
        ).join('')}
        ${count > 80 ? `<li class="dim">… +${count - 80} more (see full log)</li>` : ''}
      </ul>
    </details>
  </article>`;
}

function renderCommitRow(c) {
  const dateOnly = c.dateIso.slice(0, 10);
  const time = c.dateIso.slice(11, 16);
  const taskName = c._task ? `${c._task.id} · ${c._task.name}` : labels.unassignedTaskLabel;
  const internal = c._impact === 'internal';
  // Pick the most specific template available for this tier.
  const tierTemplate = c._impact === 'key' ? labels.keyManualPoint
                     : c._impact === 'support' ? labels.supportManualPoint
                     : labels.internalManualPoint;
  const taskTemplate = (tierTemplate && tierTemplate.length) ? tierTemplate
                     : (internal ? labels.internalManualPoint : labels.defaultManualPoint);
  const manualPoint = taskTemplate.replace('{task}', taskName);
  const caveat = internal ? labels.internalCaveat : (c._task && c._task.caveats) || '';
  return `
  <article class="commit-row" data-task="${c._task ? esc(c._task.id) : ''}" data-impact="${esc(c._impact)}" data-date="${esc(dateOnly)}" data-month="${esc(dateOnly.slice(0, 7))}" data-modules="${esc(c._modules.join('|'))}" data-type="${esc(c._type)}" data-keywords="${esc((c.subject + ' ' + c.shortHash + ' ' + (c._task ? c._task.name : '') + ' ' + c._modules.join(' ')).toLowerCase())}">
    <div class="commit-line">
      <span class="chip typ-${esc(c._type)}">${esc(typeLabel(c._type))}</span>
      <span class="chip ${impactClass(c._impact)}">${esc(impactLabel(c._impact))}</span>
      <code class="hash">${esc(c.shortHash)}</code>
      <span class="dim">${esc(dateOnly)} ${esc(time)} · ${esc(c.author)}</span>
    </div>
    <div class="commit-subject">${esc(c.subject)}</div>
    <div class="commit-meta">
      <span>${esc(labels.rowMergedTask)}: <strong>${esc(taskName)}</strong></span>
      <span>${c.files.length} ${esc(labels.rowFiles)} · +${c.insertions} / -${c.deletions}</span>
      <span>${esc(labels.rowModule)}: ${esc(c._modules.join(', '))}</span>
    </div>
    <div class="commit-extra">
      <div><strong>${esc(labels.rowManualPoint)}:</strong> ${esc(manualPoint)}</div>
      ${caveat ? `<div><strong>${esc(labels.rowCaveats)}:</strong> ${esc(caveat)}</div>` : ''}
    </div>
    ${c.files.length ? `<details class="commit-files"><summary>${esc(labels.rowChangedFiles)} (${c.files.length})</summary><ul>${c.files.slice(0, 200).map(f => `<li><code>${esc(f)}</code></li>`).join('')}${c.files.length > 200 ? `<li class="dim">… +${c.files.length - 200} more</li>` : ''}</ul></details>` : ''}
    ${c.body ? `<details class="commit-body"><summary>${esc(labels.rowCommitBody)}</summary><pre>${esc(c.body)}</pre></details>` : ''}
  </article>`;
}

function renderCommitLog() {
  let out = '';
  for (const d of dates) {
    const list = byDate[d].slice().reverse();
    const byMod = {};
    for (const c of list) { const m = c._modules[0] || 'Other'; (byMod[m] = byMod[m] || []).push(c); }
    const mods = Object.keys(byMod).sort();
    out += `<section class="day" data-date="${esc(d)}">
      <h3 class="day-title">${esc(d)} <span class="dim">· ${list.length}</span></h3>`;
    for (const m of mods) {
      out += `<details class="mod-block" open><summary>${esc(m)} (${byMod[m].length})</summary>`;
      for (const c of byMod[m]) out += renderCommitRow(c);
      out += `</details>`;
    }
    out += `</section>`;
  }
  return out;
}

const modules = Array.from(allModules).sort();

const html = `<!DOCTYPE html>
<html lang="${esc(language === 'zh' ? 'zh-CN' : 'en')}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(projectName)} · ${esc(labels.pageTitle)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; background: #f6f7f9; color: #1f2328; font-size: 14px; line-height: 1.55; }
  .wrap { max-width: 1200px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  h2 { font-size: 18px; margin: 24px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
  h3 { font-size: 15px; margin: 0; }
  h4 { font-size: 13px; margin: 8px 0 4px; color: #4b5563; }
  a { color: #1d4ed8; text-decoration: none; word-break: break-all; }
  a:hover { text-decoration: underline; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #f1f5f9; padding: 1px 5px; border-radius: 4px; font-size: 12px; }
  pre { background: #f1f5f9; padding: 8px; border-radius: 6px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; font-size: 12px; }
  .dim { color: #6b7280; font-size: 12px; }
  header.page { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; }
  .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin-top: 12px; }
  .summary-cell { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px; }
  .summary-cell .label { font-size: 11px; color: #6b7280; }
  .summary-cell .value { font-size: 16px; font-weight: 600; word-break: break-all; }
  .panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-top: 12px; }
  .panel ul { padding-left: 18px; margin: 4px 0; }
  .panel li { margin: 2px 0; }
  .quickstart { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .quickstart .qs-col { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; }
  .filter-bar { position: sticky; top: 0; z-index: 5; background: #f6f7f9; padding: 8px 0; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; border-bottom: 1px solid #e5e7eb; margin-top: 16px; }
  /* min-width:0 defends against the well-known intrinsic-min-content overflow when
   * a select's longest <option> text would otherwise force the flex item wider than
   * its share. Without this, a very long task name or module name can push the
   * filter bar past the viewport on narrow screens. */
  .filter-bar input, .filter-bar select, .filter-bar button { font: inherit; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; max-width: 100%; min-width: 0; }
  .filter-bar input[type=search] { flex: 1 1 200px; min-width: 140px; }
  .filter-bar button { background: #1f2937; color: #fff; border: none; cursor: pointer; }
  .filter-counter { font-size: 12px; color: #4b5563; margin-left: auto; }
  .tasks-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
  .task-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
  .task-head { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .task-id { font-size: 11px; background: #1f2937; color: #fff; padding: 2px 6px; border-radius: 4px; }
  .task-head h3 { flex: 1 1 100%; }
  .badge { font-size: 11px; background: #eef2ff; color: #3730a3; padding: 2px 6px; border-radius: 4px; }
  .badge-key { background: #fef3c7; color: #92400e; }
  .task-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 8px; font-size: 12px; margin: 4px 0; }
  .task-meta dt { color: #6b7280; }
  .task-meta dd { margin: 0; }
  .task-section { font-size: 13px; }
  .task-section p { margin: 2px 0; word-break: break-word; }
  .link-list { padding-left: 16px; margin: 4px 0; }
  .task-commits summary { cursor: pointer; font-size: 12px; color: #4b5563; }
  .commit-mini-list { padding-left: 16px; margin: 6px 0; font-size: 12px; }
  .commit-mini-list li { margin: 2px 0; word-break: break-word; }
  .day { margin-top: 20px; }
  .day-title { font-size: 14px; padding-bottom: 4px; border-bottom: 1px dashed #d1d5db; }
  .mod-block { background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; margin-top: 8px; padding: 6px 10px; }
  .mod-block > summary { font-size: 13px; cursor: pointer; padding: 4px 0; }
  .commit-row { padding: 8px 0; border-top: 1px solid #f1f5f9; }
  .commit-row:first-of-type { border-top: none; }
  .commit-line { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .commit-subject { font-weight: 600; margin: 4px 0; word-break: break-word; }
  .commit-meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: #4b5563; }
  .commit-extra { font-size: 12px; color: #374151; margin: 4px 0; }
  .commit-extra > div { margin: 2px 0; word-break: break-word; }
  .commit-files summary, .commit-body summary { cursor: pointer; color: #6b7280; font-size: 12px; margin-top: 4px; }
  .commit-files ul { padding-left: 18px; margin: 4px 0; font-size: 12px; }
  .commit-files li, .commit-mini-list li { word-break: break-all; }
  .chip { font-size: 11px; padding: 2px 6px; border-radius: 4px; background: #e5e7eb; color: #1f2937; }
  .imp-key { background: #fee2e2; color: #991b1b; }
  .imp-sup { background: #dbeafe; color: #1e40af; }
  .imp-int { background: #e5e7eb; color: #374151; }
  .typ-feat { background: #d1fae5; color: #065f46; }
  .typ-fix { background: #fef3c7; color: #92400e; }
  .typ-refactor { background: #ede9fe; color: #5b21b6; }
  .typ-test { background: #fce7f3; color: #9d174d; }
  .typ-docs { background: #e0f2fe; color: #075985; }
  .typ-perf { background: #fef3c7; color: #92400e; }
  .typ-chore { background: #f3f4f6; color: #374151; }
  .typ-init { background: #ccfbf1; color: #115e59; }
  .typ-update { background: #e5e7eb; color: #374151; }
  .typ-revert { background: #fee2e2; color: #991b1b; }
  .typ-other { background: #e5e7eb; color: #374151; }
  .hash { background: #1f2937; color: #f9fafb; }
  .highlight-list { padding-left: 16px; margin: 4px 0; }
  .highlight-list li { margin: 4px 0; }
  @media (max-width: 720px) {
    .wrap { padding: 10px; }
    h1 { font-size: 18px; }
    h2 { font-size: 15px; }
    .quickstart { grid-template-columns: 1fr; }
    .task-meta { grid-template-columns: 1fr; }
    .filter-counter { width: 100%; margin-left: 0; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header class="page">
    <h1>${esc(projectName)} · ${esc(labels.pageTitle)}</h1>
    <div class="dim">${esc(labels.branch)} <code>${esc(BRANCH)}</code> · ${esc(labels.head)} <code id="head-hash">${esc(HEAD.slice(0, 12))}</code> · <span id="total-commits">${COUNT_FROM_GIT}</span> ${esc(labels.totalCommits)}</div>
    <div class="summary-grid">
      ${staging.web ? `<div class="summary-cell"><div class="label">${esc(labels.stagingWeb)}</div><div class="value"><a href="${esc(staging.web)}" target="_blank" rel="noopener">${esc(staging.web)}</a></div></div>` : ''}
      ${staging.api ? `<div class="summary-cell"><div class="label">${esc(labels.stagingApi)}</div><div class="value"><a href="${esc(staging.api)}" target="_blank" rel="noopener">${esc(staging.api)}</a></div></div>` : ''}
      <div class="summary-cell"><div class="label">${esc(labels.businessTasks)}</div><div class="value">${businessTasks.length}</div></div>
      <div class="summary-cell"><div class="label">${esc(labels.keyImpact)}</div><div class="value">${keyImpactCount}</div></div>
      <div class="summary-cell"><div class="label">${esc(labels.supportImpact)}</div><div class="value">${supportCount}</div></div>
      <div class="summary-cell"><div class="label">${esc(labels.internalImpact)}</div><div class="value">${internalCount}</div></div>
    </div>
  </header>

  <section class="panel">
    <h2>${esc(labels.quickStart)}</h2>
    <div class="quickstart">
      <div class="qs-col">
        ${staging.loginUrl ? `<h4>${esc(labels.loginEntry)}</h4><p><a href="${esc(staging.loginUrl)}" target="_blank" rel="noopener">${esc(staging.loginUrl)}</a></p>` : ''}
        ${staging.loginMethod ? `<h4>${esc(labels.loginInfo)}</h4><p>${esc(staging.loginMethod)}</p>` : ''}
        <h4>${esc(labels.runOrder)}</h4>
        <ol>
          ${businessTasks.map(t => `<li><strong>${esc(t.id)}</strong> · ${esc(t.name)}</li>`).join('')}
        </ol>
      </div>
      <div class="qs-col">
        <h4>${esc(labels.resultTemplate)}</h4>
<pre>Task: T0X
Tester:
HEAD: ${esc(HEAD.slice(0, 12))}
Result: pass / fail
Key commit:
Observation (with screenshot / URL / time):
Scope of impact:
Blocks release: yes / no</pre>
        <h4>${esc(labels.principles)}</h4>
        <ul>
          <li>Describe symptoms, not feelings, in failed cases.</li>
          <li>Permission leaks (seeing data you should not) are high-priority — report immediately.</li>
          <li>Third-party / provider errors: record once, do not retrigger repeatedly.</li>
          <li>Do not test with real customer / unauthorised data on staging.</li>
          ${manualDocDir ? `<li>Manual testing docs: ${esc(manualDocDir)}</li>` : ''}
        </ul>
      </div>
    </div>
  </section>

  <section class="panel">
    <h2>${esc(labels.highlights)}</h2>
    <ul class="highlight-list">
      ${highlights.map(h => `<li><strong>${esc(h.task.id)} · ${esc(h.task.name)}</strong> — ${esc(h.commit.dateIso.slice(0, 10))} <code>${esc(h.commit.shortHash)}</code> ${esc(h.commit.subject)}</li>`).join('')}
      ${highlights.length === 0 ? `<li class="dim">${esc(labels.highlightsEmpty)}</li>` : ''}
    </ul>
  </section>

  <div class="filter-bar">
    <input id="f-search" type="search" placeholder="${esc(labels.search)}" autocomplete="off" />
    <select id="f-task"><option value="">${esc(labels.taskFilter)}</option>${businessTasks.map(t => `<option value="${esc(t.id)}">${esc(t.id)} · ${esc(t.name)}</option>`).join('')}</select>
    <select id="f-impact"><option value="">${esc(labels.impactFilter)}</option><option value="key">${esc(labels.impactKey)}</option><option value="support">${esc(labels.impactSupport)}</option><option value="internal">${esc(labels.impactInternal)}</option></select>
    <select id="f-month"><option value="">${esc(labels.monthFilter)}</option>${months.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}</select>
    <select id="f-module"><option value="">${esc(labels.moduleFilter)}</option>${modules.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}</select>
    <select id="f-type"><option value="">${esc(labels.typeFilter)}</option>${types.map(t => `<option value="${esc(t)}">${esc(typeLabel(t))}</option>`).join('')}</select>
    <button id="f-reset" type="button">${esc(labels.reset)}</button>
    <span class="filter-counter" id="filter-counter">${esc(labels.showing)} ${COUNT_FROM_GIT} ${esc(labels.of)} ${COUNT_FROM_GIT} ${esc(labels.commitsCounter)} · ${businessTasks.length} ${esc(labels.of)} ${businessTasks.length} ${esc(labels.tasksCounter)}</span>
  </div>

  <h2 id="tasks">${esc(labels.tasksHeading)}</h2>
  <div class="tasks-grid" id="tasks-grid">
    ${businessTasks.map(t => renderTaskCard(t, taskStats[t.id].commits.length)).join('')}
  </div>

  <h2 id="log">${esc(labels.fullLog)} (${COUNT_FROM_GIT}) — <span class="dim">${esc(labels.fullLogSubtitle)}</span></h2>
  <div id="commit-log">
    ${renderCommitLog()}
  </div>
</div>

<script>
const TOTAL_COMMITS = ${COUNT_FROM_GIT};
const TOTAL_TASKS = ${businessTasks.length};
const LABEL_SHOWING = ${JSON.stringify(labels.showing)};
const LABEL_OF = ${JSON.stringify(labels.of)};
const LABEL_COMMITS = ${JSON.stringify(labels.commitsCounter)};
const LABEL_TASKS = ${JSON.stringify(labels.tasksCounter)};
const $ = id => document.getElementById(id);
const fSearch = $('f-search'), fTask = $('f-task'), fImpact = $('f-impact'), fMonth = $('f-month'), fModule = $('f-module'), fType = $('f-type');
const counter = $('filter-counter');
const rows = Array.from(document.querySelectorAll('.commit-row'));
const days = Array.from(document.querySelectorAll('.day'));
const mods = Array.from(document.querySelectorAll('.mod-block'));
const taskCards = Array.from(document.querySelectorAll('.task-card'));
function applyFilters() {
  const q = (fSearch.value || '').trim().toLowerCase();
  const task = fTask.value, impact = fImpact.value, month = fMonth.value, mod = fModule.value, type = fType.value;
  let visibleCommits = 0;
  for (const row of rows) {
    const okTask = !task || row.dataset.task === task;
    const okImpact = !impact || row.dataset.impact === impact;
    const okMonth = !month || row.dataset.month === month;
    const okMod = !mod || (row.dataset.modules || '').split('|').includes(mod);
    const okType = !type || row.dataset.type === type;
    const okQ = !q || (row.dataset.keywords || '').includes(q) || (row.textContent || '').toLowerCase().includes(q);
    const visible = okTask && okImpact && okMonth && okMod && okType && okQ;
    row.style.display = visible ? '' : 'none';
    if (visible) visibleCommits++;
  }
  for (const m of mods) {
    const any = Array.from(m.querySelectorAll('.commit-row')).some(r => r.style.display !== 'none');
    m.style.display = any ? '' : 'none';
  }
  for (const d of days) {
    const any = Array.from(d.querySelectorAll('.commit-row')).some(r => r.style.display !== 'none');
    d.style.display = any ? '' : 'none';
  }
  let visibleTasks = 0;
  for (const card of taskCards) {
    const id = card.dataset.task;
    const okTask = !task || id === task;
    const okQ = !q || card.textContent.toLowerCase().includes(q);
    const visible = okTask && okQ;
    card.style.display = visible ? '' : 'none';
    if (visible) visibleTasks++;
  }
  counter.textContent = LABEL_SHOWING + ' ' + visibleCommits + ' ' + LABEL_OF + ' ' + TOTAL_COMMITS + ' ' + LABEL_COMMITS + ' · ' + visibleTasks + ' ' + LABEL_OF + ' ' + TOTAL_TASKS + ' ' + LABEL_TASKS;
}
[fSearch, fTask, fImpact, fMonth, fModule, fType].forEach(el => el.addEventListener('input', applyFilters));
$('f-reset').addEventListener('click', () => {
  fSearch.value = ''; fTask.value = ''; fImpact.value = ''; fMonth.value = ''; fModule.value = ''; fType.value = '';
  applyFilters();
});
</script>
</body>
</html>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');

// Re-read HEAD AFTER writing so an interactive session committing in parallel is
// detected. If it moved, the caller can re-run; we don't silently ship stale.
let postHead = HEAD;
try { postHead = git('rev-parse HEAD').trim(); } catch { /* ignore */ }
const headDriftedDuringRun = postHead !== HEAD;

console.log(JSON.stringify({
  output: OUT,
  commits: commits.length,
  expectedCommits: COUNT_FROM_GIT,
  head: HEAD,
  postRunHead: postHead,
  headDriftedDuringRun,
  branch: BRANCH,
  tasks: businessTasks.length,
  keyImpact: keyImpactCount,
  support: supportCount,
  internal: internalCount,
  unassignedCommits: unassignedFallbackUsed,
}));

if (headDriftedDuringRun) {
  // stderr — non-fatal, but visible
  process.stderr.write(`[vibe2test] WARNING: HEAD moved during run (was ${HEAD.slice(0, 12)}, now ${postHead.slice(0, 12)}). Re-run if you need an up-to-date snapshot.\n`);
}
if (unassignedFallbackUsed > 0) {
  process.stderr.write(`[vibe2test] WARNING: ${unassignedFallbackUsed} commit(s) did not match any business task AND no fallback was configured. Set fallback.userImpactKey and fallback.internal to absorb stragglers.\n`);
}
