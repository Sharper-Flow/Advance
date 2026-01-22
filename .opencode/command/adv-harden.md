---
name: adv-harden
description: Post-implementation hardening - AI-slop detection, test coverage, documentation, cleanup
agent: general
---

# ADV Harden - Post-Implementation Quality Analysis

Orchestrate multi-dimensional hardening analysis using sub-agents for test coverage, AI-slop detection, documentation, and cleanup.

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

CATEGORIES:
1. INCOMPLETE: pass, NotImplementedError, placeholder values, TODO/FIXME
2. EXCEPTION: except pass, overly broad catches, missing error handling
3. TYPING: excessive Any, undocumented kwargs, type bypasses
4. STRUCTURAL: god classes (>20 methods), god functions (>100 lines), deep nesting, magic numbers
5. DOCUMENTATION: stale comments, noqa without reason, dead docs
6. ASYNC: blocking in async, thread safety, missing await

SEVERITY: BLOCKER > HIGH > MEDIUM > LOW

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
    "severity": "...",
    "category": "...",
    "file": "...",
    "line": N,
    "code_snippet": "...",
    "message": "...",
    "fix_suggestion": "..."
  }],
  "patterns_detected": [...]
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
Analyze CLEANUP for change: {change-id}

TASK:
1. Find temp files: *.bak, *.tmp, *.orig, *~, *.swp
2. Find marked files: ONETIME-*, DELETE-AFTER-*
3. Find dev directories: poc/, scratch/, temp/
4. Find dead imports
5. Find orphaned tests

Preserve: scripts/, tools/, migrations

RETURN JSON:
{
  "dimension": "cleanup",
  "extension_based": [...],
  "explicitly_marked": [...],
  "dev_directories": [...],
  "dead_imports": [...],
  "total_candidates": N
}
```

### Sub-Agent 5: Spec Alignment Scanner

```
Analyze SPEC ALIGNMENT for change: {change-id}

TASK:
1. Verify completed tasks have evidence
2. Check scenario coverage in tests
3. Detect scope creep (files outside stated scope)

RETURN JSON:
{
  "dimension": "spec_alignment",
  "tasks": {"total": N, "verified": N, "unverified": [...]},
  "scenarios": {"total": N, "covered": N, "uncovered": [...]},
  "scope": {"clean": bool, "out_of_scope": [...]}
}
```

---

## Phase 2: Synthesis

> **Anti-Loop Protocol**: After sub-agents return:
> `>>> SYNTHESIS COMPLETE <<<`
> Proceed to aggregation.

### Aggregate Issues

Combine by severity: BLOCKER > HIGH > MEDIUM > LOW

### Identify Root Causes

| Root Cause | Indicators | Remediation |
|------------|------------|-------------|
| Incomplete work | TODO, placeholder | Complete |
| AI-slop | Silent catches, Any types | Refactor |
| Testing gap | Low coverage | Add tests |
| Doc debt | Missing docs | Document |
| Cleanup needed | Temp files | Remove |

### Determine Status

- **READY**: No BLOCKER, no HIGH, ≤3 MEDIUM
- **NEEDS_WORK**: No BLOCKER but HIGH or >3 MEDIUM
- **BLOCKED**: Any BLOCKER

---

## Phase 3: Remediation

**If READY**: Skip to cleanup.

**If NEEDS_WORK or BLOCKED**: Use `mcp_question`:

```
header: "Fix Issues"
question: "Found {count} issues. How to proceed?"
options:
  - label: "Fix all"
  - label: "Fix blockers and high only"
  - label: "Report only"
  - label: "Accept current"
```

If fixing, establish contract:

```
============================================================
                    CONTRACT ACTIVE
============================================================

OBJECTIVE: Fix hardening issues in {change-id}

SUCCESS CRITERIA:
{for each issue}
- [ ] (H{n}) {description} - {file:line}
{end}
- [ ] All fixes verified

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

EXTENSION-BASED:
1. path/to/file.bak (1.2 KB)

EXPLICITLY MARKED:
2. ONETIME-fix.sh (0.5 KB)

Total: N files, X KB
============================================================
```

### Execute Based on Flags

- **No flags (preview)**: Show preview, suggest `--execute`
- **`--execute`**: Delete all candidates
- **`--interactive`**: Use `mcp_question` to select
- **`--force`**: Delete without prompts

---

## Final Report

```
============================================================
             HARDENING REPORT: {change-id}
============================================================

STATUS: {READY | NEEDS_WORK | BLOCKED}

TEST COVERAGE                              [{status}]
  Files: {with_tests}/{total} ({percent}%)

AI-SLOP DETECTION                          [{status}]
  Issues: {total} ({blockers} blocker, {high} high)
  By Category: {breakdown}

DOCUMENTATION                              [{status}]
  README: {status} | Inline: {percent}% | CHANGELOG: {status}

CLEANUP                                    [{status}]
  Candidates: {count}

SPEC ALIGNMENT                             [{status}]
  Tasks: {verified}/{total} | Scenarios: {percent}%

------------------------------------------------------------
{If fixes applied}
FIXES APPLIED:
{for each}
- [x] {issue} - fixed in {file}
{end}

------------------------------------------------------------
CLEANUP ACTIONS:
{based on flags - preview/executed/skipped}

------------------------------------------------------------
{If READY}
NEXT STEPS: Ready to ship! Run /adv-archive {change-id}

{If issues remain}
REMAINING:
1. {action}
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
