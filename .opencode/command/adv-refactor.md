---
name: adv-refactor
description: Refresh stale change proposals by aligning with current codebase via bidirectional reconciliation
agent: general
---

# ADV Refactor - Refresh Stale Proposals

Orchestrate bidirectional reconciliation to update stale change proposals to match current codebase reality.

> **SUB-AGENT CONTEXT**: Return findings as JSON. Skip status markers.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Parse Flags

Extract from `$ARGUMENTS`:
- `change-id`: Target change (required)
- `--execute`: Apply changes (default: dry-run)
- `--interactive`: Approve each fix category
- `--force`: Skip recent-modification warnings

## Target Resolution

1. **If change-id provided**: Use directly
2. **If empty**: Call `adv_change_list`, select via `mcp_question`

## Pre-flight

### Fetch Change Context

```
adv_change_show change_id: <target>
adv_task_list change_id: <target>
```

Read proposal.md for affected files and scope.

---

## Phase 1: Staleness Analysis (Parallel Sub-Agents)

Spawn sub-agents in tiered order due to dependencies.

### Sub-Agent 1: Codebase Drift Scanner

```
Compare file references in change to actual codebase.

TASK (3-pass detection):
1. EXACT: Map missing paths via SHA-256 content hash (100% confidence)
2. METADATA: Match by filename + size + first 1KB (70% confidence)
3. FUZZY: Use similarity distance for renamed files (80-90%)

RETURN JSON:
{
  "dimension": "drift",
  "items": [{
    "old": "path/old.ts",
    "new": "path/new.ts", 
    "confidence": "HIGH",
    "evidence": "hash_match"
  }]
}
```

### Sub-Agent 2: Dependency Scanner

```
Detect stale library patterns.

TASK:
1. Check for outdated dependencies
2. Use Context7 to find breaking changes between versions
3. Flag deprecated API patterns

RETURN JSON:
{
  "dimension": "deps",
  "updates": [{
    "library": "react",
    "current": "17.0",
    "latest": "18.0",
    "breaking_changes": ["..."]
  }]
}
```

### Sub-Agent 3: Conflict Scanner

```
Find overlaps with archived changes.

TASK:
1. Filter archives matching capabilities in proposal
2. Focus on recent archives (last 20%)
3. Compare requirement intent

RETURN JSON:
{
  "dimension": "conflicts",
  "overlaps": [{
    "archived_id": "...",
    "requirement": "...",
    "reason": "superseded"
  }]
}
```

### Sub-Agent 4: Task Validator

```
Verify task references exist.

TASK:
1. Check file/function paths in tasks
2. Flag orphaned or invalid tasks

RETURN JSON:
{
  "dimension": "tasks",
  "valid": [...],
  "invalid": [...],
  "orphaned": [...]
}
```

### Sub-Agent 5: Obsolescence Detector

```
Detect requirements already implemented elsewhere.

TASK:
1. Exclude tests, mocks, legacy paths
2. Prioritize passing tests as evidence
3. Verify code satisfies ALL scenarios

Confidence: HIGH (green) | MEDIUM (yellow) | LOW (red)

RETURN JSON:
{
  "dimension": "obsolescence",
  "findings": [{
    "requirement_id": "...",
    "confidence": "HIGH",
    "implemented_at": "file:line",
    "evidence": "..."
  }]
}
```

---

## Phase 2: Synthesis & Intent Verification

> **Anti-Loop Protocol**: After sub-agents return:
> `>>> SYNTHESIS COMPLETE <<<`
> Aggregate immediately.

### Aggregate Results

Combine drift, deps, conflicts, tasks, obsolescence findings.

### Intent Verification Gate

**If code contradicts a requirement:**

Emit `[ADV:MIC]` and use `mcp_question`:

```
header: "Intent Check"
question: "Code does [X] but requirement says [Y]. Is code a new requirement or bug?"
options:
  - label: "New requirement"
    description: "Update spec to match code"
  - label: "Bug in code"
    description: "Keep spec, flag code as incorrect"
```

---

## Phase 3: Refactoring (Under Contract)

**Skip if dry-run (no --execute)**

### Establish Contract

```
============================================================
                    CONTRACT ACTIVE
============================================================

OBJECTIVE: Refactor {change-id} to align with codebase

SUCCESS CRITERIA:
{for each fix category}
- [ ] (R{n}) {category}: {count} items
{end}
- [ ] adv_change_validate passes

============================================================
```

### Update Patterns

1. **Path Alignment**: Update ALL occurrences of moved files
2. **Intent Guard**: Add comment when requirement updated:
   ```
   > Refactored: aligned with implementation in {file}
   ```
3. **Obsolescence**: Mark as `[OBSOLETE]` but don't delete:
   ```
   > Note: Implementation found at {file:line}
   ```
4. **Task Derivation**: Add validation tasks for refactored requirements

### Apply Updates

For path changes, update:
- proposal.md affected files section
- change.json deltas (file references)
- Any task descriptions

Use `adv_task_add` for new validation tasks.

---

## Phase 4: Validation

```
adv_change_validate change_id: <target> strict: true
```

If fails due to formatting, fix and retry once.

---

## Final Report

```
============================================================
          REFACTOR REPORT: {change-id}
============================================================

STALENESS SUMMARY:
- Age: {days} days since creation
- Drift: {count} files moved/renamed
- Deps: {count} libraries outdated
- Obsolete: {count} requirements implemented elsewhere

{If dry-run}
DRY RUN - No changes applied

WOULD UPDATE:
{for each}
- {category}: {description}
{end}

Run with --execute to apply changes.
{end}

{If executed}
CHANGES APPLIED:

HIGH CONFIDENCE:
{for each HIGH confidence change}
- {file}: {change} (reason: {evidence})
{end}

MANUAL REVIEW RECOMMENDED:
{for each MEDIUM/LOW confidence}
- {file}: {change} (confidence: {level})
{end}

VALIDATION: {pass/fail}
{end}

------------------------------------------------------------
ROLLBACK:
  git restore .

============================================================
```

### Completion Banner

```
============================================================
      /adv-refactor {change-id} COMPLETE
============================================================
Result: {Dry run | N changes applied | Failed}
============================================================
```

---

## Key Tools

| Purpose | Tool |
|---------|------|
| Load change | `adv_change_show` |
| List tasks | `adv_task_list` |
| Add task | `adv_task_add` |
| Validate | `adv_change_validate` |
| Context7 | `resolve-library-id`, `query-docs` |
