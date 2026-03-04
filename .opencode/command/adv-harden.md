---
name: adv-harden
description: Detect low-quality code, verify test coverage, clean up; block archive on open findings
agent: general
---

# ADV Harden — Post-Implementation Quality Analysis

Orchestrate multi-dimensional hardening analysis using sub-agents. **Blocks archive if any actionable `REVIEW_FINDINGS` are unresolved and not documented as accepted debt.**

## Exits

| Exit | Condition |
|------|-----------|
| ✅ READY | No blockers or high findings; harden gate marked complete |
| 🔁 NEEDS_WORK | High findings present; agent fixes then re-verifies |
| 🎤 BLOCKED | Blocker findings or unresolved review findings; user decides |

> **SUB-AGENT CONTEXT**: Return findings as JSON. Skip status markers.
>
> **CHECKLIST**: Follow [docs/checklists/harden-checklist.md](../../docs/checklists/harden-checklist.md) for minimum findings enforcement.

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
2. **If empty**: Call `adv_change_list`, select via the `question` tool

## Pre-flight

### Fetch Change Context

```
adv_change_show changeId: <target>
adv_task_list changeId: <target>
```

### Gate Prerequisite Check

```
adv_gate_status changeId: {change-id}
```

**If review gate is NOT complete (status != 'done' and status != 'legacy'):**

```
============================================================
            HARDEN BLOCKED - PREREQUISITE GATE INCOMPLETE
============================================================

The review gate must be completed before running harden.

GATE STATUS:
- [ ] Review: {status}

REQUIRED ACTION:
Run /adv-review {change-id} to complete code review and mark the gate.

============================================================
```
Stop execution.

### Cancellation & Cross-Repo Audit

Before proceeding to hardening, audit all cancelled and cross-repo tasks:

**Step 1: Check for unapproved cancellations**

From `adv_task_list`, find all tasks with `status: "cancelled"`.
For each, verify `task.cancellation.approved_by_user === true`.

**If ANY cancelled task lacks approval metadata:**

```
============================================================
        HARDEN BLOCKED - UNAPPROVED CANCELLATIONS
============================================================

The following cancelled tasks lack user approval records:

{for each unapproved task}
- {task.id}: {task.title}
  Status: cancelled (NO APPROVAL RECORD)
{end}

REQUIRED ACTION:
Re-open these tasks and complete them, or obtain user approval
via adv_task_cancel before re-running /adv-harden.

============================================================
```
Stop execution.

**Step 2: Check cross-repo task completion**

For tasks with `target_repo` or `target_path` set:
1. Verify the task status is `done` (not just `in_progress` or `pending`)
2. If a cross-repo task is cancelled, verify it has approval metadata (covered by Step 1)

**If ANY cross-repo task is incomplete (not done or approved-cancelled):**

```
============================================================
        HARDEN BLOCKED - INCOMPLETE CROSS-REPO TASKS
============================================================

The following cross-repo tasks are not completed:

{for each incomplete cross-repo task}
- {task.id}: {task.title}
  Target: {target_repo} ({target_path})
  Status: {status}
{end}

REQUIRED ACTION:
Complete these tasks in their target repositories before hardening.
Use workdir to switch to the target repo and execute.

============================================================
```
Stop execution.

### Review Findings Audit

Before running hardening scanners, verify all actionable review findings have been addressed.

**Step 1: Load stored review findings**

Check change notes and task completion evidence for a `REVIEW_FINDINGS` block emitted by `/adv-review`. If present in any task's `completed_by` notes or in the change proposal, extract the finding list.

If no stored findings are available, check the review gate completion timestamp and ask the agent to recall or re-read the review output. If truly unavailable, emit a warning but do not block.

**Step 2: Identify unresolved actionable findings**

Actionable findings are those labeled: `blocker:`, `issue:`, `suggestion:`, `question:`.
`nit:` findings are excluded — they are optional and do not block harden.

For each actionable finding, determine if it was:
- **Resolved**: Fixed in a subsequent task (verifiable in task `completed_by` notes mentioning the finding) ✅
- **Accepted as debt**: Documented in `proposal.md` with debt quadrant, interest rate, and payoff date ✅
- **Unresolved**: Not fixed and not documented as debt ❌

**If ANY unresolved actionable findings exist:**

```
============================================================
        HARDEN BLOCKED - UNRESOLVED REVIEW FINDINGS
============================================================

The following review findings were not addressed:

{for each unresolved finding}
- [{label}] {file}:{line} — {what}
  Why: {why}
  Status: UNRESOLVED (not fixed, not documented as accepted debt)
{end}

REQUIRED ACTIONS (choose one per finding):
a) Fix the issue and update task notes with evidence
b) Document as accepted debt in proposal.md:
   - Debt type and Fowler quadrant
   - Interest rate (cost of not fixing)
   - Planned payoff date

Once resolved or documented, re-run /adv-harden {change-id}.

============================================================
```
Stop execution.

**If all actionable findings are resolved or accepted:**

```
============================================================
           REVIEW FINDINGS AUDIT: PASSED
============================================================

Actionable findings from /adv-review: {total}
  Resolved: {resolved_count}
  Accepted as debt: {debt_count}
  Unresolved: 0 ✓

nit: findings (not required): {nit_count}

============================================================
```

Proceed to Phase 1 scanners.

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

## Sub-Agent Resilience Protocol

> **IMPORTANT**: Before spawning sub-agents, read and follow this protocol.

### What Can Go Wrong

Sub-agents may return empty results or be interrupted due to context size or recursion.
An empty result is **not a success** — treat it as a transient failure.

### Detection

A sub-agent result is considered **empty/failed** if:
- The result string is empty, whitespace-only, or `null`
- The result does not contain the expected `"dimension"` JSON key
- The result contains only an error message with no findings

### Retry Protocol

**If ANY sub-agent returns an empty/failed result:**

1. **Retry once** — re-spawn that specific sub-agent with the same prompt
2. **If retry also fails** — fall back to **inline analysis** for that dimension:
   - Read the affected files directly using the `read` tool
   - Perform the analysis yourself inline (no sub-agent)
   - Emit findings in the same JSON structure the sub-agent would have returned
3. **Never skip a dimension** — every dimension must produce findings or an explicit "no issues found" result

### Inline Fallback Scanner

When falling back inline, use this checklist per dimension:

| Dimension | Inline Check |
|-----------|-------------|
| Test Coverage | Check for test files alongside source files; verify TDD evidence in task notes |
| AI Slop Detection | Scan for generic variable names, copy-paste blocks, placeholder comments |
| Doc Hygiene | Check README/AGENTS.md for stale references to changed files or behaviors |
| Tech Debt | Identify TODO/FIXME comments, functions > 50 lines, duplicated logic |
| Cleanup | Find .bak/.orig/.tmp files, debug print statements, commented-out code |

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

### Sub-Agent 3: Documentation Hygiene Scanner

```
Analyze DOCUMENTATION HYGIENE for change: {change-id}

Affected files: {files}

PURPOSE: Documentation is agent infrastructure. Stale, conflicting, or verbose
docs poison every future session. This scanner aggressively identifies docs that
must be deleted, corrected, or consolidated.

TASK:

1. CONFLICT DETECTION (highest priority):
   - Cross-reference ALL doc files (README.md, SETUP.md, CHANGELOG.md,
     ADV_INSTRUCTIONS.md, docs/*.md, AGENTS.md) against actual implementation
   - Flag any doc that describes behavior differently than the code implements it
   - Flag any doc that references deleted/renamed files, functions, or commands
   - Flag duplicate information across multiple files (pick one canonical source)
   - Flag docs that contradict each other

2. STALENESS DETECTION:
   - Identify docs referencing features, APIs, or patterns removed by this change
   - Identify docs whose code examples no longer compile or match current signatures
   - Identify generated files (*.html reports, comparison docs) that are now outdated
   - Check that command descriptions in manifests/READMEs match actual command behavior

3. VERBOSITY AUDIT:
   - Flag docs with excessive prose that could be a table or bullet list
   - Flag docs that repeat information available in code (e.g., re-listing all
     function params when JSDoc already covers them)
   - Flag README sections that belong in dedicated docs (and vice versa)
   - Ideal: an agent should get what it needs in <30 seconds of reading

4. ACTIONABLE UPDATES:
   - For each affected file, check if the change introduces behavior an agent
     would need to know about long-term (new commands, changed defaults,
     new constraints, new patterns)
   - Propose succinct additions (1-3 lines) to the canonical doc location
   - Inline docs (JSDoc/docstrings) MUST exist for public APIs; keep them
     to purpose + params + return, no filler

5. DELETION CANDIDATES:
   - Any doc file that is >80% stale or superseded → recommend deletion
   - Any generated report that's not auto-regenerated → recommend deletion
   - Prefer fewer, accurate docs over many outdated ones

SEVERITY:
- BLOCKER: Doc actively contradicts implementation (will mislead agents)
- HIGH: Stale doc references deleted code/features (will cause confusion)
- MEDIUM: Duplicate info across files, verbose sections
- LOW: Missing inline docs, minor formatting

RETURN JSON:
{
  "dimension": "documentation_hygiene",
  "conflicts": [{
    "file": "...",
    "line": N,
    "claims": "what the doc says",
    "reality": "what the code does",
    "severity": "BLOCKER|HIGH"
  }],
  "stale": [{
    "file": "...",
    "reason": "references deleted X",
    "action": "delete|update",
    "severity": "HIGH|MEDIUM"
  }],
  "deletions": [{
    "file": "...",
    "reason": "superseded by X / >80% stale",
    "severity": "MEDIUM"
  }],
  "updates_needed": [{
    "file": "...",
    "what": "new command /foo added",
    "proposed_addition": "1-3 line succinct text",
    "severity": "MEDIUM"
  }],
  "verbose": [{
    "file": "...",
    "section": "...",
    "current_lines": N,
    "suggested_lines": N,
    "severity": "LOW"
  }],
  "inline_docs": {"documented": N, "undocumented": N, "coverage_percent": N},
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

### Minimum Findings Enforcement

Count non-nit findings (`BLOCKER`, `HIGH`, `MEDIUM`, or any actionable finding).

**If >= 3 non-nit findings**: Proceed to status determination.

**If < 3 non-nit findings**: The hardening pass MUST include a genuinely-clean justification with scanner-level evidence per [harden-checklist.md](../../docs/checklists/harden-checklist.md). Without this justification, the harden gate cannot be marked complete.

### Determine Status

| Status | Criteria |
|--------|----------|
| **READY** | No BLOCKER, no HIGH, ≤3 MEDIUM (with justification if < 3 non-nit) |
| **NEEDS_WORK** | No BLOCKER but HIGH or >3 MEDIUM |
| **BLOCKED** | Any BLOCKER |

---

## Phase 3: Remediation

**If READY**: Skip to cleanup.

**If NEEDS_WORK or BLOCKED**: Use the `question` tool:

```json
{
  "questions": [{
    "header": "Fix Issues",
    "question": "Found {count} issues. How to proceed?",
    "options": [
      { "label": "Fix all (Recommended)", "description": "Address all blocking and high items" },
      { "label": "Fix blockers only", "description": "Minimum to unblock" },
      { "label": "Report only", "description": "Review findings, fix manually" },
      { "label": "Accept current", "description": "Document as known debt" },
      { "label": "Other", "description": "Use custom text area for a different hardening plan" }
    ]
  }]
}
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
| `--interactive` | Use the `question` tool to select |
| `--force` | Delete without prompts |

---

## Final Report

### Mark Harden Gate (if READY)

If status is READY, mark the harden gate as complete:

```
adv_gate_complete changeId: {change-id} gateId: harden
```

### Final Report Display

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

DOCUMENTATION HYGIENE                      [{pass|warn|fail}]
  Conflicts: {count} | Stale: {count} | Deletions: {count}
  Inline Docs: {percent}% | Updates Needed: {count}

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
GATE STATUS:
- Harden gate: COMPLETE ✓

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
{if READY}Harden Gate: MARKED COMPLETE{end}

  ⚡ Recommended next step (Plan agent):
     /adv-archive {change-id}
============================================================
```

---

## Key Tools

| Purpose | Tool |
|---------|------|
| Load change | `adv_change_show` |
| List tasks | `adv_task_list` |
| Show spec | `adv_spec_show` |
