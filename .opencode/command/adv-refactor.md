---
name: adv-refactor
description: Refresh a stale proposal to reflect current codebase state
agent: general
---

# ADV Refactor — Refresh Stale Proposals

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
2. **If empty**: Call `adv_change_list`, select via the `question` tool

## Pre-flight

### Fetch Change Context

```
adv_change_show changeId: <target>
adv_task_list changeId: <target>
```

Read proposal.md for affected files and scope.

### Worktree Context Propagation

Sub-agents inherit the default project root, NOT the current working directory. When running from a worktree, sub-agents will look for files in the wrong location unless explicitly told where to look.

**Step 1: Detect current working directory**

```bash
pwd
```

Record the result as `{workdir}`.

**Step 2: Include in every sub-agent prompt**

Every sub-agent spawned in Phase 1 MUST include:

```
WORKING DIRECTORY: {workdir}
All file paths are relative to this directory.
Use this as the base path for all read/glob/grep/lgrep operations.
```

**Why this matters:** When running from a git worktree (e.g., `~/.local/share/opencode/worktree/.../change/featureX`), the worktree has different file contents than the main repo. Sub-agents that don't know the working directory will read stale files from the wrong branch, report false positives, or fail to find files that only exist on the worktree branch.

---

## Phase 1: Staleness Analysis (Parallel Sub-Agents)

Spawn **3 parallel sub-agents** with `subagent_type: "explore"`. These cover the three independent dimensions of staleness: file drift, requirement obsolescence, and archive conflicts.

> **Design note:** The former "Task Validator" and "Dependency Scanner" sub-agents were absorbed. Task validation (checking file/function paths in tasks) is now part of the Drift Scanner since it uses the same file-existence checks. Dependency scanning required Context7 (unavailable to `explore` agents) and is now handled inline by the orchestrator after sub-agents return.

### Sub-Agent 1: Drift Scanner (includes task validation)

```
Compare file references in change AND tasks to actual codebase.

WORKING DIRECTORY: {workdir}
All file paths are relative to this directory.
Use this as the base path for all read/glob/grep/lgrep operations.

CHANGE FILES: {list of files referenced in proposal.md and deltas}
TASK FILES: {list of files/functions referenced in task descriptions}

TASK (3-pass detection):
1. EXACT: Map missing paths via SHA-256 content hash (100% confidence)
2. METADATA: Match by filename + size + first 1KB (70% confidence)
3. FUZZY: Use similarity distance for renamed files (80-90%)
4. TASK REFS: For each task, verify referenced files/functions exist.
   Flag orphaned tasks (reference deleted code) and invalid paths.

RETURN JSON:
{
  "dimension": "drift",
  "items": [{
    "old": "path/old.ts",
    "new": "path/new.ts",
    "confidence": "HIGH",
    "evidence": "hash_match"
  }],
  "task_validation": {
    "valid": [...],
    "invalid": [...],
    "orphaned": [...]
  }
}
```

### Sub-Agent 2: Obsolescence Detector

```
Detect requirements already implemented elsewhere.

WORKING DIRECTORY: {workdir}
All file paths are relative to this directory.
Use this as the base path for all read/glob/grep/lgrep operations.

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

### Sub-Agent 3: Conflict Scanner

```
Find overlaps with archived changes.

WORKING DIRECTORY: {workdir}
All file paths are relative to this directory.
Use this as the base path for all read/glob/grep/lgrep operations.

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

### Inline: Dependency Check (Orchestrator)

After sub-agents return, the orchestrator checks for stale dependencies inline using Context7:

```
context7_resolve-library-id libraryName: "{library}"
context7_query-docs libraryId: "{id}" query: "breaking changes between {current} and {latest}"
```

This runs inline because `explore` agents lack Context7 access.

---

## Phase 2: Synthesis & Intent Verification

> **Anti-Loop Protocol**: After sub-agents return:
> `>>> SYNTHESIS COMPLETE <<<`
> Aggregate immediately.

### Aggregate Results

Combine drift, deps, conflicts, tasks, obsolescence findings.

### Intent Verification Gate

**If code contradicts a requirement:**

Emit `[ADV:MIC]` and use the `question` tool:

```json
{
  "questions": [{
    "header": "Intent Check",
    "question": "Code does [X] but requirement says [Y]. Is code a new requirement or bug?",
    "options": [
      { "label": "New requirement", "description": "Update spec to match code" },
      { "label": "Bug in code", "description": "Keep spec, flag code as incorrect" },
      { "label": "Other", "description": "Use custom text area for a different interpretation" }
    ]
  }]
}
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
adv_change_validate changeId: <target> strict: true
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

  ⚡ Recommended next step (Refine agent):
     /adv-review {change-id}
  If implementation work is now ready (Build agent):
     /adv-apply {change-id}
============================================================
```

---

## Key Tools

| Purpose | Tool |
|---------|------|
| Load change | `adv_change_show` |
| List tasks | `adv_task_list` |
| Spawn analysis | Task tool (explore × 3) |
| Add task | `adv_task_add` |
| Validate | `adv_change_validate` |
| Inline dep check | `context7_resolve-library-id`, `context7_query-docs` |
