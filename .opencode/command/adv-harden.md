---
name: adv-harden
description: "Detect low-quality code, verify test coverage, clean up; block archive on open findings"
phaseGoal: "Verify production-readiness. Auto-fix scoped issues. Stop on drift."
---
# ADV Harden — Release-Stage Quality Analysis
Orchestrate multi-dimensional hardening via sub-agents. This command is part of the release stage and **blocks archive if actionable `REVIEW_FINDINGS` are unresolved.**
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
`skill("adv-slop-detection")` → provides shared slop-detection methodology used by both `/adv-slop-scan` and this command's AI-slop scanner. If the skill is unavailable, continue with the embedded scanner contract below.

### Harden Methodology

#### Purpose

Reusable hardening methodology for ADV harden workflows. Provides the 6-scanner framework overview.

**Canonical source:** `docs/checklists/harden-checklist.md` — see that checklist for severity scoring, priority matrix, status determination, minimum findings threshold, documentation hygiene standard, and technical debt classification. Do not duplicate its content here.

#### 6-Scanner Framework

Every hardening pass must run all 6 scanners:

| Scanner | Focus |
|---------|-------|
| Test Coverage | File-level coverage ratio, TDD evidence audit |
| AI-Slop Detection | Placeholders, type erosion, naive patterns, structural issues |
| Documentation Hygiene | Conflict detection, staleness audit, deletion of superseded docs |
| Cleanup | Temp files, debug code, dead imports, orphaned tests |
| Production Readiness | Security, reliability, performance, maintainability |
| Deployment Readiness | Env vars, migrations, external services, CI/CD, infrastructure |

All 6 must be executed. Skipping requires explicit justification.

#### Constraints

- **Read-only guidance** — this methodology block does not mutate ADV state
- **No gate completion** — the command owns the harden gate
- **Canonical source** — defer to `docs/checklists/harden-checklist.md` for detailed rules
- **No workflow sequencing** — the command owns phase ordering and sub-agent orchestration

## Pre-flight
### Fetch Change Context
`adv_change_show` + `adv_task_list` for target change.
### Gate Prerequisite Check
`adv_gate_status changeId: {change-id}`

If acceptance gate NOT complete (status != 'done' and status != 'legacy') → emit HARDEN BLOCKED banner citing incomplete acceptance gate → stop. Required action: `/adv-review {change-id}`.
### Cancellation & Cross-Repo Audit
**Step 1: Unapproved cancellations** — From `adv_task_list`, find cancelled tasks. Verify each has `task.cancellation.approved_by_user === true`. If any lack approval → emit HARDEN BLOCKED banner listing unapproved tasks → stop.

**Step 2: Cross-repo completion** — For tasks with `target_repo`/`target_path`, verify status is `done` (or approved-cancelled). If incomplete → emit HARDEN BLOCKED banner listing incomplete cross-repo tasks → stop.
### Review Findings Audit
Verify all actionable review findings addressed before running scanners.

**Step 1:** Load stored `REVIEW_FINDINGS` from task notes or proposal. If unavailable, warn but don't block.

**Step 2:** Classify each finding:
- Actionable: `blocker:`, `issue:`, `suggestion:`, `question:` (NOT `nit:`)
- Resolved: fixed in subsequent task (evidence in `completed_by` notes) ✓
- Rejected with evidence: documented evidence shows the finding is invalid or out of scope ✓
- Unresolved: not fixed and not rejected with evidence ✗

If unresolved actionable findings → emit HARDEN BLOCKED banner listing each with `[{label}] {file}:{line} — {what}` → stop. Required: fix or reject with documented evidence showing the finding is invalid or out of scope.

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
**Harden Context Packet (inject into every sub-agent spawn prompt):**
```
WORKING DIRECTORY: {workdir}
CHANGE: {change-id} | {title} | gate: release
AFFECTED FILES:
  - {file}: {one-line change summary}
  - ...
ACCEPTANCE CRITERIA:
  - AC1: {text}
  - ...
TASK EVIDENCE SUMMARY:
  - {task-id}: {title} | {status} | tdd: {phase}
  - ...
EXPECTED OUTPUT: {dimension-specific JSON schema}
```
Build packet from `adv_task_list` and `adv_change_show` outputs at spawn time. Inject verbatim — do NOT give explore agents ADV tool access.

Spawn **6 parallel sub-agents** (`subagent_type: "explore"`). Each receives the Harden Context Packet above plus dimension-specific instructions.
### Sub-Agent 1: Test Coverage Scanner
Analyze test coverage: for each source file check for test file, calculate coverage ratio, check TDD adherence (red/green evidence via `adv_run_test`; `adv_task_evidence` is fallback only), report test runner availability.

Return JSON with: `dimension: "test_coverage"`, `files_with_tests`, `files_without_tests`, `coverage_percent`, `tdd_audit`, `issues`.
### Sub-Agent 2: AI-Slop Detection Scanner
Use the methodology from `adv-slop-detection` loaded in Phase 0 for this scanner dimension. Preserve the same severity ladder as the dedicated slop-scan workflow: BLOCKER (security/data loss) > HIGH (silent failures) > MEDIUM (debt) > LOW (style).

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

If NEEDS_WORK or BLOCKED → fix all validated in-scope findings. × No report-only, future-work, or accepted-debt path for validated in-scope findings. Proceed with fixes.

### Drift Detection Rule (CRITICAL)

Before applying ANY fix, evaluate: **"If I apply this fix, will proposal.md's Success Criteria, Acceptance Criteria, or Out-of-Scope sections need to change?"**

- **NO** → auto-remediate (proceed with fix)
- **YES** → **STOP** — present the finding and proposed fix to the user via `question` tool:
  - **Approve fix and update scope** — user agrees the scope should expand
  - **Skip fix, document as accepted debt** — finding is valid but out of scope
  - **Cancel hardening** — user wants to reconsider

This is the single declarative drift detection rule. It applies to every finding, every fix, every auto-remediation action.

If fixing → establish CONTRACT ACTIVE banner listing issues grouped by category → spawn fix sub-agents → verify → update status.

---
## Phase 3.5: Post-Remediation Re-Verification
After remediation fixes, re-verify affected dimensions before status determination:
1. For each dimension with fixed findings, spawn a **targeted** `explore` scanner with the Harden Context Packet plus:
   - `PRIOR FINDINGS: [{finding_id, original_issue, fix_applied}]`
   - `SCOPE: evaluate only whether the listed findings are resolved`
   - `EXPECTED OUTPUT: { finding_id, status: "resolved"|"unresolved", evidence }`
2. If resolved → update finding status to `fixed`.
3. If unresolved → retry fix or escalate.
4. **New findings** during re-scan → queue for next harden cycle, NOT current verdict.

× Only re-scan dimensions with fixed findings. Do NOT re-run all 6 scanners.

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
### Completion

Use the Gate Handoff Voice spine (see `docs/command-voice-standard.md § Gate Handoff Voice`):

```
## Problem
{One-line restatement of the problem this change addresses.}

## Chosen direction
What was cleaned, hardened, and verified for release.

## Delivered
- Status: {READY | N fixed}
- Per-dimension results summarized
- Cleanup actions taken

---
**{change-id}** · release ✓ → archive · `/adv-archive {change-id}`
```

**Auto-continue:** If status is READY, immediately begin `/adv-archive` inline. The archive command itself will stop at the sign-off boundary for user approval of the final release. Do not add an extra "shall I proceed?" before starting archive.

---
## Key Tools
| Purpose | Tool |
|---------|------|
| Load change | `adv_change_show` |
| List tasks | `adv_task_list` |
| Show spec | `adv_spec action: "show" capability: <name>` |
