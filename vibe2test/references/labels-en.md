# English labels (default)

These are the values the script ships with when `labels` is omitted. Copy and
edit if you want to override one or two strings while keeping the rest as is.

```json
{
  "labels": {
    "pageTitle": "Business Regression Kanban",
    "branch": "Branch",
    "head": "HEAD",
    "totalCommits": "commits in total",
    "stagingWeb": "Staging Web",
    "stagingApi": "Staging API",
    "businessTasks": "Business tasks",
    "keyImpact": "User-impact · key",
    "supportImpact": "User-impact · support",
    "internalImpact": "Internal / automation",
    "quickStart": "Quick start for testers",
    "loginEntry": "Login URL",
    "loginInfo": "Default login info",
    "runOrder": "Recommended run order",
    "resultTemplate": "Result-capture template",
    "principles": "Judgement principles",
    "highlights": "What changed recently (key user-facing items)",
    "highlightsEmpty": "No recent user-facing changes — a release smoke is enough.",
    "tasksHeading": "Business regression tasks",
    "fullLog": "Full commit log",
    "fullLogSubtitle": "grouped by date, then by module",
    "search": "Search tasks / commit / module / goal",
    "taskFilter": "Task: all",
    "impactFilter": "User impact: all",
    "monthFilter": "Date: all",
    "moduleFilter": "Module: all",
    "typeFilter": "Type: all",
    "reset": "Reset filters",
    "showing": "Showing",
    "of": "of",
    "commitsCounter": "commits",
    "tasksCounter": "tasks",
    "taskPersona": "Persona",
    "taskEta": "Time budget",
    "taskMaterials": "Materials",
    "taskCost": "Cost / fees",
    "taskLinks": "Links",
    "taskGoal": "Goal",
    "taskHow": "How to test",
    "taskPass": "Pass criteria",
    "taskCaveats": "Caveats",
    "taskRefDoc": "Reference doc",
    "taskCommitsHeader": "commits in this task",
    "rowMergedTask": "Merged into task",
    "rowFiles": "files",
    "rowModule": "Module",
    "rowManualPoint": "Manual test point",
    "rowCaveats": "Caveats",
    "rowChangedFiles": "Changed files",
    "rowCommitBody": "commit body",
    "typeNames": {
      "feat": "feat",
      "fix": "fix",
      "refactor": "refactor",
      "test": "test",
      "docs": "docs",
      "perf": "perf",
      "chore": "chore",
      "init": "init",
      "update": "update",
      "revert": "revert",
      "other": "other"
    },
    "impactKey": "Key: needs user-simulated test",
    "impactSupport": "Support: short smoke is enough",
    "impactInternal": "Internal / automation",
    "internalManualPoint": "Rolls up into task {task}. A short smoke is enough; deeper correctness is covered by automation or code review.",
    "internalCaveat": "If the smoke shows no blank screen and the main path still works, no per-commit verification needed.",
    "defaultManualPoint": "Part of regression task {task}. Follow that task's \"How to test\" — no need to reproduce per commit.",
    "keyManualPoint": "Rolls up into task {task}. Run that task's \"How to test\" end-to-end — this change touches user-visible behaviour.",
    "supportManualPoint": "Rolls up into task {task}. Short smoke is enough; do not reproduce per commit. Watch the main path.",
    "unassignedTaskLabel": "(unassigned — configure `fallback.userImpactKey` / `fallback.internal`)"
  }
}
```

`{task}` placeholders are substituted with the task id + name at render time.
Keep the placeholder or the per-row guidance will read as a generic line.

`keyManualPoint` and `supportManualPoint` are optional. Leave both empty to fall back to `defaultManualPoint` for both tiers. Fill them in (recommended) to give testers differentiated copy: `key` should sound more urgent than `support`.

`unassignedTaskLabel` only appears when `fallback.userImpactKey` / `fallback.internal` weren't set or pointed at missing ids — fix the config and re-run.
