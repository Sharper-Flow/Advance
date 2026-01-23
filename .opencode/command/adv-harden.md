---
name: adv-harden
description: Post-implementation hardening - AI-slop detection, tech debt scoring, quality gates
agent: general
---

# ADV Harden - Post-Implementation Quality Analysis

Orchestrate multi-dimensional hardening analysis using sub-agents for AI-slop detection, technical debt assessment, and production readiness verification.

> **SUB-AGENT CONTEXT**: Return findings as JSON. Skip status markers.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Parse Flags

Extract from `$ARGUMENTS`:
- `change-id`: Target change (optional - will prompt if missing)
- `--no-cleanup`: Skip cleanup phase
- `--execute`: Actually delete cleanup files (default: preview)
- `--interactive`: Select individual files to delete
- `--force`: No prompts (requires --execute)

## Target Resolution

1. **If change-id provided**: Use directly
2. **If empty**: Call `adv_change_list`, select via `mcp_question`

## Pre-flight

### Fetch Change Context

```
adv_change_show change_id: <target>
adv_task_list change_id: <target>
```

### Extract Details

From change data:
- Affected files (from proposal.md)
- Task completion status
- Spec deltas and scenarios

---

## Technical Debt Quadrant

Classify any debt found using Fowler's quadrant:

| | Prudent | Reckless |
|---|---------|----------|
| **Deliberate** | "Ship now, fix later" → Track | "No time for design" → Escalate |
| **Inadvertent** | "Now we know better" → Refactor | "What's layering?" → Train |

---

## Phase 1: Spawn Analysis Sub-Agents

Spawn **5 parallel sub-agents** with `subagent_type: "explore"`:

### Sub-Agent 1: Test Coverage Scanner

```
Analyze TEST COVERAGE for change: {change-id}

Affected files: {files}

TASK:
1. For each source file, check for corresponding test file
2. Calculate coverage: files_with_tests / total_files
3. Check TDD adherence (Red/Green evidence)
4. Report test runner availability

RETURN JSON:
{
  "dimension": "test_coverage",
  "files_with_tests": [...],
  "files_without_tests": [...],
  "coverage_percent": N,
  "tdd_audit": {...},
  "issues": [...]
}
```

### Sub-Agent 2: AI-Slop Detection Scanner

```
Analyze AI-SLOP PATTERNS for change: {change-id}

Affected files: {files}

DETECTION PATTERNS:

1. PLACEHOLDER INDICATORS:
   - TODO/FIXME in implementation (not comments)
   - "// ..." or "/* ... */" indicating skipped code
   - "throw new Error('not implemented')"
   - "pass # placeholder" (Python)
   - NotImplementedError, undefined functions

2. OVER-GENERIC ERROR HANDLING:
   - catch (error) { console.log(error) } - log and ignore
   - catch (e) { throw e } - useless re-throw
   - catch (error: any) { } - silent swallow
   - except: pass (Python)
   - Overly broad catches without specific handling

3. TYPE EROSION (TypeScript):
   - Excessive ": any" usage (>1 per 100 lines)
   - "as any" type assertions
   - @ts-ignore without explanation
   - Non-null assertions (!) without justification
   - Record<string, any> patterns

4. STRUCTURAL ISSUES:
   - God classes (>20 methods)
   - God functions (>100 lines, cyclomatic >20)
   - Deep nesting (>4 levels)
   - Magic numbers without constants
   - Copy-paste duplication (>10 lines repeated)

5. NAIVE IMPLEMENTATIONS:
   - Manual JSON parsing instead of schema validation
   - String concatenation for SQL (injection risk!)
   - Synchronous file I/O in async contexts
   - Polling instead of event-driven
   - Global mutable state

6. EXCESSIVE COMMENTS:
   - Comment-to-code ratio > 0.3 in business logic
   - Comments explaining obvious code
   - Stale comments that don't match code

SEVERITY:
- BLOCKER: Security risk, data loss, crashes
- HIGH: Silent failures, maintainability crisis
- MEDIUM: Technical debt accumulation
- LOW: Style issues, minor inefficiencies

RETURN JSON:
{
  "dimension": "ai_slop",
  "summary": {
    "total": N,
    "blockers": N,
    "high": N,
    "by_category": {...}
  },
  "issues": [{
    "severity": "BLOCKER|HIGH|MEDIUM|LOW",
    "category": "placeholder|error_handling|type_erosion|structural|naive|comments",
    "file": "...",
    "line": N,
    "pattern": "...",
    "code_snippet": "...",
    "message": "...",
    "fix_suggestion": "..."
  }],
  "debt_quadrant": "deliberate_prudent|deliberate_reckless|inadvertent_prudent|inadvertent_reckless"
}
```

### Sub-Agent 3: Documentation Scanner

```
Analyze DOCUMENTATION for change: {change-id}

Affected files: {files}

TASK:
1. Check README for new features
2. Check inline docs (JSDoc, docstrings)
3. Check CHANGELOG entry
4. Check API documentation

RETURN JSON:
{
  "dimension": "documentation",
  "readme": {"updated": bool, "needs_update": bool},
  "inline_docs": {"documented": N, "undocumented": N, "coverage_percent": N},
  "changelog": {"entry_exists": bool},
  "issues": [...]
}
```

### Sub-Agent 4: Cleanup Scanner

```
Analyze CLEANUP candidates for change: {change-id}

TASK:
1. Find temp files: *.bak, *.tmp, *.orig, *~, *.swp
2. Find marked files: ONETIME-*, DELETE-AFTER-*
3. Find dev directories: poc/, scratch/, temp/
4. Find dead imports
5. Find orphaned tests (tests for deleted code)
6. Find debug code: console.log, debugger, print()

Preserve: scripts/, tools/, migrations

RETURN JSON:
{
  "dimension": "cleanup",
  "extension_based": [...],
  "explicitly_marked": [...],
  "dev_directories": [...],
  "dead_imports": [...],
  "debug_code": [...],
  "total_candidates": N
}
```

### Sub-Agent 5: Production Readiness Scanner

```
Analyze PRODUCTION READINESS for change: {change-id}

Affected files: {files}

QUALITY GATE CHECKLIST:

Security:
- [ ] No critical/high CVEs in dependencies
- [ ] No hardcoded secrets
- [ ] Authentication/authorization tested
- [ ] Input validation on all user inputs

Reliability:
- [ ] Error handling covers all failure modes
- [ ] Graceful degradation for external dependencies
- [ ] Health check endpoint exists (if applicable)
- [ ] Logging sufficient for debugging

Performance:
- [ ] No N+1 queries
- [ ] No obvious bottlenecks
- [ ] Bounded memory usage

Maintainability:
- [ ] No TODO/FIXME in critical paths
- [ ] Test coverage on business logic
- [ ] Documentation for public APIs

COMPLEXITY THRESHOLDS:
- 1-10: Low risk (acceptable)
- 11-20: Moderate (review)
- 21-50: High (refactor required)
- 51+: Very high (block, redesign)

RETURN JSON:
{
  "dimension": "production_readiness",
  "security": {"pass": bool, "issues": [...]},
  "reliability": {"pass": bool, "issues": [...]},
  "performance": {"pass": bool, "issues": [...]},
  "maintainability": {"pass": bool, "issues": [...]},
  "complexity_hotspots": [{
    "file": "...",
    "function": "...",
    "complexity": N,
    "risk": "low|moderate|high|very_high"
  }],
  "overall_status": "READY|NEEDS_WORK|BLOCKED"
}
```

---

## Phase 2: Synthesis

> **Anti-Loop Protocol**: After sub-agents return:
> `>>> SYNTHESIS COMPLETE <<<`
> Proceed to aggregation.

### Aggregate Issues

Combine by severity: BLOCKER > HIGH > MEDIUM > LOW

### Severity Scoring (Impact × Effort)

For each issue:
```
Impact (1-5): Security=5, Production=4, Friction=3, Debt=2, Style=1
Effort (1-5): <1hr=5, <1day=4, <1week=3, <1sprint=2, >1sprint=1
Priority = Impact × Effort
  20-25: Critical (fix immediately)
  12-19: High (this sprint)
  6-11: Medium (next sprint)
  1-5: Low (backlog)
```

### Determine Status

| Status | Criteria |
|--------|----------|
| **READY** | No BLOCKER, no HIGH, ≤3 MEDIUM |
| **NEEDS_WORK** | No BLOCKER but HIGH or >3 MEDIUM |
| **BLOCKED** | Any BLOCKER |

---

## Phase 3: Remediation

**If READY**: Skip to cleanup.

**If NEEDS_WORK or BLOCKED**: Use `mcp_question`:

```
header: "Fix Issues"
question: "Found {count} issues. How to proceed?"
options:
  - label: "Fix all (Recommended)"
    description: "Address all blocking and high items"
  - label: "Fix blockers only"
    description: "Minimum to unblock"
  - label: "Report only"
    description: "Review findings, fix manually"
  - label: "Accept current"
    description: "Document as known debt"
```

If fixing, establish contract:

```
============================================================
                    CONTRACT ACTIVE
============================================================

OBJECTIVE: Fix hardening issues in {change-id}

SUCCESS CRITERIA:
{for each issue, grouped by category}

AI-SLOP:
- [ ] (H{n}) {category}: {message} - {file}:{line}

PRODUCTION READINESS:
- [ ] (H{n}) {category}: {message}

- [ ] All fixes verified
- [ ] No new issues introduced

============================================================
```

Spawn fix sub-agents, verify, update status.

---

## Phase 4: Cleanup

**Skip if `--no-cleanup`**

### Aggregate Cleanup Candidates

From scanner + any session artifacts.

### Display Preview

```
============================================================
              CLEANUP CANDIDATES
============================================================

TEMP FILES:
1. path/to/file.bak (1.2 KB)

DEBUG CODE:
2. src/utils.ts:45 - console.log(...)

EXPLICITLY MARKED:
3. ONETIME-fix.sh (0.5 KB)

Total: N items

============================================================
```

### Execute Based on Flags

| Flag | Behavior |
|------|----------|
| (none) | Preview only, suggest `--execute` |
| `--execute` | Delete all candidates |
| `--interactive` | Use `mcp_question` to select |
| `--force` | Delete without prompts |

---

## Final Report

```
============================================================
             HARDENING REPORT: {change-id}
============================================================

STATUS: {READY | NEEDS_WORK | BLOCKED}

TEST COVERAGE                              [{pass|warn|fail}]
  Files: {with_tests}/{total} ({percent}%)
  TDD Evidence: {present|missing}

AI-SLOP DETECTION                          [{pass|warn|fail}]
  Issues: {total} ({blockers} blocker, {high} high)
  Categories: {breakdown}
  Debt Quadrant: {classification}

DOCUMENTATION                              [{pass|warn|fail}]
  README: {status} | Inline: {percent}% | CHANGELOG: {status}

PRODUCTION READINESS                       [{pass|warn|fail}]
  Security: {pass|fail} | Reliability: {pass|fail}
  Performance: {pass|fail} | Maintainability: {pass|fail}

COMPLEXITY HOTSPOTS:
{for top 3}
  - {file}:{function} - complexity {N} ({risk})
{end}

CLEANUP                                    [{status}]
  Candidates: {count} ({action taken})

------------------------------------------------------------
{If fixes applied}
FIXES APPLIED:
{for each}
- [x] {issue} - fixed in {file}
{end}

------------------------------------------------------------
{If READY}
NEXT STEPS: Ready to ship! Run /adv-archive {change-id}

{If issues remain}
REMAINING:
1. {highest priority action}
2. {next action}

DEBT TRACKING:
If accepting debt, document in proposal.md with:
- Debt type and quadrant
- Interest rate estimate (cost of not fixing)
- Planned payoff date

============================================================
```

### Completion Banner

```
============================================================
       /adv-harden {change-id} COMPLETE
============================================================
Result: {READY | N fixed | Report only}
============================================================
```

---

## Key Tools

| Purpose | Tool |
|---------|------|
| Load change | `adv_change_show` |
| List tasks | `adv_task_list` |
| Show spec | `adv_spec_show` |
