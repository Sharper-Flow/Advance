---
name: adv-harden
description: Detect low-quality code, verify test coverage, clean up before release
---
# ADV Harden — Release-Stage Quality Analysis
Orchestrate multi-dimensional hardening via sub-agents. This command is part of the release stage and **blocks archive if actionable `REVIEW_FINDINGS` are unresolved and not documented as accepted debt.**
## Exits
| Exit | Condition |
|------|-----------|
| ✅ READY | No blockers/high findings; release stage ready for archive |
| 🔁 NEEDS_WORK | High findings → agent fixes → re-verifies |
| 🎤 BLOCKED | Blocker or unresolved review findings → user decides |

> **SUB-AGENT CONTEXT**: Return findings as JSON. Skip status markers.
> **CHECKLIST**: Follow [docs/checklists/harden-checklist.md](../../docs/checklists/harden-checklist.md).
<UserRequest>
  $ARGUMENTS
</UserRequest>
## Parse Flags
Extract from `$ARGUMENTS`:
- `change-id`: Target change (prompt if missing)
- `--no-cleanup`: Skip cleanup phase
- `--execute`: Delete cleanup files (default: preview)
- `--interactive`: Select individual files to delete
- `--force`: No prompts (requires --execute)
## Target Resolution
1. If change-id provided → use directly
2. If empty → `adv_change_list` → select via `question` tool
## Phase 0: Load Skill
`skill("adv-harden-methodology")` → provides 6-scanner framework, severity scoring, debt quadrant, documentation hygiene standard. If the skill is unavailable, continue with the embedded protocol in this command file.

## Pre-flight
### Fetch Change Context
`adv_change_show` + `adv_task_list` for target change.
### Gate Prerequisite Check
`adv_gate_status changeId: {change-id}`

If acceptance gate NOT complete (status != 'done' and status != 'legacy') → emit HARDEN BLOCKED banner citing incomplete acceptance gate → stop. Required action: `/adv-accept {change-id}`.
### Cancellation & Cross-Repo Audit
**Step 1: Unapproved cancellations** — From `adv_task_list`, find cancelled tasks. Verify each has `task.cancellation.approved_by_user === true`. If any lack approval → emit HARDEN BLOCKED banner listing unapproved tasks → stop.

**Step 2: Cross-repo completion** — For tasks with `target_repo`/`target_path`, verify status is `done` (or approved-cancelled). If incomplete → emit HARDEN BLOCKED banner listing incomplete cross-repo tasks → stop.
### Review Findings Audit
Verify all actionable review findings addressed before running scanners.

**Step 1:** Load stored `REVIEW_FINDINGS` from task notes or proposal. If unavailable, warn but don't block.

**Step 2:** Classify each finding:
- Actionable: `blocker:`, `issue:`, `suggestion:`, `question:` (NOT `nit:`)
- Resolved: fixed in subsequent task (evidence in `completed_by` notes) ✓
- Accepted debt: documented in `proposal.md` with quadrant, interest rate, payoff date ✓
- Unresolved: not fixed, not documented ✗

If unresolved actionable findings → emit HARDEN BLOCKED banner listing each with `[{label}] {file}:{line} — {what}` → stop. Required: fix or document as accepted debt.

If all resolved → emit REVIEW FINDINGS AUDIT: PASSED banner → proceed.
### Merge Compatibility Check
Dry-run merge of change branch into default branch. Non-destructive — nothing committed.

Skip if not in a worktree.
1. Detect default branch: `git rev-parse --verify main` || `trunk` || `git symbolic-ref refs/remotes/origin/HEAD`
2. Fetch: `git fetch origin {default-branch} 2>/dev/null || true`
3. Dry-run: `git merge --no-commit --no-ff origin/{default-branch}`
4. If clean → `git merge --abort` → PASSED banner → proceed
5. If conflicts → capture `git diff --name-only --diff-filter=U` → `git merge --abort` → HARDEN BLOCKED banner listing conflicting files → stop
### Extract Details
From change data: affected files, task completion status, spec deltas/scenarios.
### Worktree Context Propagation
Sub-agents inherit default project root, NOT current workdir. When in a worktree:
1. `pwd` → record as `{workdir}`
2. Include in every sub-agent prompt: `WORKING DIRECTORY: {workdir}` — all file paths relative to this directory

---
## Technical Debt Quadrant
Classify debt using Fowler's quadrant:
| | Prudent | Reckless |
|---|---------|----------|
| **Deliberate** | "Ship now, fix later" → Track | "No time for design" → Escalate |
| **Inadvertent** | "Now we know better" → Refactor | "What's layering?" → Train |

---
## Sub-Agent Resilience
Sub-agents may return empty/failed results. Detection: empty string, missing `"dimension"` key, error-only output.

Protocol: retry once → if still fails → inline fallback analysis → never skip a dimension.
| Dimension | Inline Fallback |
|-----------|----------------|
| Test Coverage | Check test files alongside source; verify TDD evidence in task notes |
| AI Slop | Scan for generic names, copy-paste, placeholder comments |
| Doc Hygiene | Cross-reference docs against changed files/behaviors |
| Production Readiness | TODO/FIXME in critical paths, functions >50 lines, security gaps |
| Cleanup | .bak/.orig/.tmp files, debug prints, commented-out code |
| Deployment | New env vars, migrations, config changes, CI/CD updates |

---
## Phase 1: Spawn Analysis Sub-Agents
**CHANGE CONTEXT (inject into every sub-agent spawn prompt):**
```
CHANGE CONTEXT: {change-id} | {objective-first-60-chars} | {n} criteria | gate: release
```
This closes context starvation for explore agents that have no ADV tools. Inject verbatim — do NOT give explore agents ADV tool access.

Spawn **6 parallel sub-agents** (`subagent_type: "explore"`). Each receives: `WORKING DIRECTORY: {workdir}`, affected files, change-id, and the CHANGE CONTEXT block above.
### Sub-Agent 1: Test Coverage Scanner
Analyze test coverage: for each source file check for test file, calculate coverage ratio, check TDD adherence (red/green evidence), report test runner availability.

Return JSON with: `dimension: "test_coverage"`, `files_with_tests`, `files_without_tests`, `coverage_percent`, `tdd_audit`, `issues`.
### Sub-Agent 2: AI-Slop Detection Scanner
Detect AI slop patterns in affected files:
| Category | Patterns |
|----------|----------|
| Placeholders | TODO/FIXME in impl, `throw new Error('not implemented')`, `pass # placeholder` |
| Error handling | catch-log-ignore, useless re-throw, silent swallow, `except: pass` |
| Type erosion | Excessive `: any` (>1/100 lines), `as any`, `@ts-ignore` without reason, `!` without justification |
| Structural | God classes (>20 methods), god functions (>100 lines), deep nesting (>4 levels), magic numbers, copy-paste (>10 lines) |
| Naive impl | Manual JSON parse vs schema, string concat SQL, sync I/O in async, polling vs events, global mutable state |
| Comments | Ratio >0.3, explaining obvious code, stale comments |

Severity: BLOCKER (security/data loss) > HIGH (silent failures) > MEDIUM (debt) > LOW (style).

Return JSON with: `dimension: "ai_slop"`, `summary` (total, blockers, high, by_category), `issues` (severity, category, file, line, pattern, code_snippet, message, fix_suggestion), `debt_quadrant`.
### Sub-Agent 3: Documentation Hygiene Scanner
Analyze doc quality for affected files:
1. **Conflicts** — docs describing behavior differently than code, referencing deleted/renamed items, duplicates across files, contradictions
2. **Staleness** — references to removed features/APIs, non-compiling examples, outdated generated files
3. **Verbosity** — prose that should be tables, info repeated from code, misplaced sections
4. **Updates needed** — new behaviors agents need to know, succinct additions to canonical locations, inline docs for public APIs
5. **Deletion candidates** — >80% stale or superseded docs, non-regenerated reports

Severity: BLOCKER (contradicts impl) > HIGH (stale refs to deleted code) > MEDIUM (duplicates, verbose) > LOW (missing inline docs).

Return JSON with: `dimension: "documentation_hygiene"`, `conflicts`, `stale`, `deletions`, `updates_needed`, `verbose`, `inline_docs`, `issues`.
### Sub-Agent 4: Cleanup Scanner
Find cleanup candidates: temp files (*.bak, *.tmp, *.orig, *~, *.swp), marked files (ONETIME-*, DELETE-AFTER-*), dev directories (poc/, scratch/, temp/), dead imports, orphaned tests, debug code (console.log, debugger, print()). Preserve: scripts/, tools/, migrations.

Return JSON with: `dimension: "cleanup"`, `extension_based`, `explicitly_marked`, `dev_directories`, `dead_imports`, `debug_code`, `total_candidates`.
### Sub-Agent 5: Production Readiness Scanner
Check quality gates for affected files:
| Area | Checks |
|------|--------|
| Security | No critical CVEs, no hardcoded secrets, auth tested, input validation |
| Reliability | Error handling covers failure modes, graceful degradation, health checks, logging |
| Performance | No N+1 queries, no bottlenecks, bounded memory |
| Maintainability | No TODO/FIXME in critical paths, test coverage on business logic, public API docs |

Complexity thresholds: 1-10 low, 11-20 moderate, 21-50 high (refactor), 51+ very high (block).

Return JSON with: `dimension: "production_readiness"`, `security`, `reliability`, `performance`, `maintainability` (each with pass/issues), `complexity_hotspots`, `overall_status`.
### Sub-Agent 6: Deployment & Operational Readiness Scanner
Check deployment readiness for affected files:
| Area | Checks |
|------|--------|
| Environment | New env vars, missing from .env.example, removed vars still in prod |
| Migrations | Schema changes with migration files, destructive ops (BLOCKER), rollback paths |
| External services | New API clients/SDKs, webhook endpoints, queue subscriptions, credentials needed |
| CI/CD | New build steps, Dockerfile changes, CI config coverage, deployment targets |
| Infrastructure | New cron jobs, ports, storage/cache/CDN, memory/CPU requirements, monitoring |
| Feature flags | Should change be flagged, gradual rollout, breaking API changes, cache invalidation |
| Documentation | Deployment steps documented, runbooks for new ops concerns, manual steps automated |

Severity: BLOCKER (missing migration, hardcoded secret, destructive without rollback) > HIGH (new env var not in .env.example, unprovisioned service) > MEDIUM (missing feature flag, missing runbook) > LOW (minor config docs).

Return JSON with: `dimension: "deployment_readiness"`, `environment`, `migrations`, `external_services`, `ci_cd`, `infrastructure`, `feature_flags`, `deployment_steps`, `overall_status`, `issues`.

---
## Phase 2: Synthesis
> **Anti-Loop**: After sub-agents return → `>>> SYNTHESIS COMPLETE <<<` → proceed.
### Aggregate Issues
Combine by severity: BLOCKER > HIGH > MEDIUM > LOW.
### Severity Scoring
```
Impact (1-5): Security=5, Production=4, Friction=3, Debt=2, Style=1
Effort (1-5): <1hr=5, <1day=4, <1week=3, <1sprint=2, >1sprint=1
Priority = Impact × Effort
  20-25: Critical | 12-19: High | 6-11: Medium | 1-5: Low
```
### Minimum Findings Enforcement
Count non-nit findings. If <3 → require genuinely-clean justification with scanner-level evidence per [harden-checklist.md](../../docs/checklists/harden-checklist.md).
### Status Determination
| Status | Criteria |
|--------|----------|
| READY | No BLOCKER, no HIGH, ≤3 MEDIUM |
| NEEDS_WORK | No BLOCKER but HIGH or >3 MEDIUM |
| BLOCKED | Any BLOCKER |

---
## Phase 3: Remediation
If READY → skip to cleanup.

If NEEDS_WORK or BLOCKED → ask via `question` tool: Fix all (Recommended), Fix blockers only, Report only, Accept current (document as debt).

If fixing → establish CONTRACT ACTIVE banner listing issues grouped by category → spawn fix sub-agents → verify → update status.

---
## Phase 4: Cleanup
Skip if `--no-cleanup`.

Aggregate cleanup candidates from scanner + session artifacts. Display preview listing temp files, debug code, marked files with sizes.
| Flag | Behavior |
|------|----------|
| (none) | Preview only, suggest `--execute` |
| `--execute` | Delete all candidates |
| `--interactive` | Select via `question` tool |
| `--force` | Delete without prompts |

---
## Final Report
### Mark Harden Gate
If READY → do **not** complete a gate here; `/adv-archive` owns the `release` gate.
### Report Display
Emit HARDENING REPORT banner with per-dimension results:
| Dimension | Metrics |
|-----------|---------|
| Test Coverage | files with tests / total, TDD evidence |
| AI-Slop | issue count by severity, categories, debt quadrant |
| Doc Hygiene | conflicts, stale, deletions, inline doc coverage |
| Production Readiness | security/reliability/performance/maintainability pass/fail |
| Deployment Readiness | new env vars, migrations, external services, CI/CD, infrastructure |
| Complexity | Top 3 hotspots with file:function, complexity, risk |
| Cleanup | candidates count, action taken |

Include: fixes applied, gate status, next steps (`/adv-archive`), remaining items, debt tracking guidance.
### Completion Banner
```
/adv-harden {change-id} COMPLETE
Result: release stage ready for archive
Next: /adv-archive {change-id}
Result: {READY | N fixed | Report only}
Harden Gate: {MARKED COMPLETE | pending}
Next: /adv-archive {change-id}
```

---
## Key Tools
| Purpose | Tool |
|---------|------|
| Load change | `adv_change_show` |
| List tasks | `adv_task_list` |
| Show spec | `adv_spec action: "show" capability: <name>` |
