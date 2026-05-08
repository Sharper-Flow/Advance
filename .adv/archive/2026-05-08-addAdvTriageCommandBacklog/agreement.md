## Agreement

### Objectives

1. **Single backlog reconciliation command** — `/adv-triage` scans all six sources, matches existing GH issues, and surfaces unrepresented items.
2. **GitHub Projects v2 as canonical store** — typed NUMBER fields for Value/TC/RROE/Effort/WSJF, SINGLE_SELECT for Type/Priority. ROADMAP.md is a deterministic mirror.
3. **WSJF-prioritized feature ranking** — full SAFe formula `(V + TC + RROE) / E` with modified Fibonacci 1-13 anchors.
4. **Bug priority via existing labels** — `priority:{critical,high,medium,low}`, no WSJF for bugs.
5. **Hybrid HITL** — agent fills RROE/TC/Effort autonomously with evidence trailers; user assigns Priority (bugs) and Value (features). Tier B inline approval at all mutation points.
6. **Durable git-tracked roadmap** — ROADMAP.md committed and pushed to default branch, single-file atomic stage.
7. **Local source deprecation** — after promotion, TODOs replaced, agenda items completed, notes struck through, wisdom annotated.

### Acceptance Criteria

Per problem statement AC 1-10 (see `_problemStatement`). Summarized:

| AC# | Criterion |
|-----|-----------|
| 1 | Reconciles all 6 backlog sources in a single invocation |
| 2 | First-run bootstrap: creates Projects v2 board + 7 custom fields + persists metadata |
| 3 | Unrepresented items → Tier B prompt → GH issues with source trailer + board membership |
| 4 | Every feature gets V/TC/RROE/Effort/WSJF; every bug gets priority label; deferred items surface explicitly |
| 5 | Agent-scored dimensions carry `<!-- adv-triage:scoring v1 -->` evidence trailer |
| 6 | ROADMAP.md: bugs by tier + features by WSJF + deprecation log + run summary; deterministic |
| 7 | Atomic commit: ROADMAP.md only, default branch, pull --rebase before push, dirty-tree abort |
| 8 | Per-source deprecation: TODO→`see #N`, agenda→complete, note→strikethrough, wisdom→annotate |
| 9 | Tier B parsing: whitelist + regex only, no LLM fallback |
| 10 | Refuses to run if gh auth scopes missing, remote unreachable, or token cannot create project |

### Scope (confirmed)

| Category | Items |
|----------|-------|
| Created | `.opencode/command/adv-triage.md` |
| Modified | `plugin/src/manifest.ts`, `plugin/src/manifest.test.ts`, `ADV_INSTRUCTIONS.md`, `README.md`, `SETUP.md` |
| Not touched | `plugin/src/tools/**`, `plugin/src/temporal/**`, `plugin/src/types.ts`, `plugin/schemas/**`, `.adv/specs/**`, `scripts/sync-global.sh` |
