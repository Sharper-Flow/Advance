---
name: adv-proposal
description: Extract problem statement and confirm with user before proceeding
---

# ADV Proposal — Establish the Problem Statement

Lead with problem statement agreement, then create the initial change scaffold. This command owns the `proposal` gate and hands off to `/adv-discover`.

## Command Boundary

**Produces:** Confirmed problem statement, initial change scaffold, and the proposal artifact needed to begin discovery.

**× MUST NOT:** Create tasks (`adv_task_add`), complete gates (`adv_gate_complete`), make impl decisions, decompose work into tasks.

**Gate:** Completes `proposal`.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Pre-flight

### Step 1: Resolve Summary

`$ARGUMENTS` is optional. × Never stop or print usage error when empty.

| Invocation | Behavior |
|------------|----------|
| No args | Derive 2-5 word summary from conversation. × Never ask "what do you want to build?" |
| With args | Use provided text verbatim |

### Step 2: Check Existing Changes

`adv_change_list` → if similar exists, ask via `question`: Create new (Recommended), Show existing, Cancel.

### Step 3: Brainstorm Context

Check `./temp/brainstorm-*.md` → if found, read and use to inform proposal.

---

## Phase 1: Problem Statement Agreement

Establish shared understanding before creating artifacts. No scaffold until user confirms.

### Extract Prior Discussion Context

Scan conversation history. Extract concrete facts into these categories (write "None identified" if empty — × do NOT invent content):

| Category | Extract |
|----------|---------|
| Agreed facts | Statements user confirmed or agent/user converged on |
| Decisions made | Explicit choices (libraries, patterns, APIs, naming) |
| Rejected approaches | Dismissed solutions with reasons |
| Open questions | Unresolved points |
| Constraints | Hard requirements user specified |

× Do NOT fabricate prior context. Empty categories are correct for short/vague conversations.

### Synthesize Problem Statement

Using extracted context as ground truth (must not contradict any item), synthesize:

```
============================================================
              PROBLEM STATEMENT
============================================================

PROBLEM
  {1-3 sentences}

DESIRED OUTCOME
  {1-2 sentences}

PRIOR DECISIONS (from our conversation)
  - {decision} (or "None")

REJECTED APPROACHES (from our conversation)
  - {approach} (or "None")

OPEN QUESTIONS
  - {question} (or "None")

SCOPE
  Files / modules expected to change:
  - {file or module}

============================================================
```

### Confirmation

Ask via `question`: "Does this match what we discussed? Check Prior Decisions and Rejected Approaches."
Options: Confirmed — proceed (Recommended), Drift detected, Adjust statement, Abort.

- **Drift detected** → ask what drifted → re-extract → re-show → re-confirm
- **Adjust** → re-synthesize from corrections → re-show → re-confirm
- **Abort** → stop, × no artifacts
- **Confirmed** → Phase 2. Problem statement persisted as `## Why` in proposal.md and as standalone `problem-statement.md`

---

## Phase 2: Full Proposal

### Step 4: Create Change Scaffold

Only after Phase 1 confirmation. Build initial proposal carrying forward discussion context:

```markdown
# <summary>

## Why
<confirmed problem statement>

## Constraints from Discussion
Prior decisions and rejected approaches are binding.

### Decisions Made
- <from Phase 1>

### Rejected Approaches
- <from Phase 1>

### Open Questions
- <from Phase 1>

## What Changes
<!-- To be filled -->

## Success Criteria
<!-- To be filled -->
```

Call `adv_change_create summary: "<summary>" proposal: "<content>" problemStatement: "<raw problem statement text>"`. Creates change.json, proposal.md, problem-statement.md.

### Step 5: Gather Requirements

Ask via `question`: "What type of change?" Options: New feature, Enhancement, Bug fix, Refactor.

### Step 6: Identify Affected Specs

`adv_spec action: "list"` → ask via `question` (multiple selection): list capabilities + "New capability".

---

## Requirements Quality

### INVEST Criteria

| Criterion | Check | If Missing |
|-----------|-------|------------|
| **I**ndependent | Self-contained? | Decouple |
| **N**egotiable | Solution flexibility? | Focus on intent |
| **V**aluable | Demonstrable value? | State user benefit |
| **E**stimable | Can be sized? | Break down |
| **S**mall | Fits one iteration? | Split phases |
| **T**estable | Can write test? | Add scenario |

### Smell Detection

| Smell | Example | Fix |
|-------|---------|-----|
| Subjective | "user-friendly" | "Loads in <2s" |
| Ambiguous | "efficiently" | "Uses <100MB" |
| Superlative | "best performance" | "p95 <200ms" |
| Totality | "handles all errors" | List specific types |
| Negative only | "must not crash" | "Returns error code" |

---

## Step 7: Fill Proposal Template

Build full proposal → persist via `adv_change_update`. `## Why` and `## Constraints from Discussion` already populated from Phase 1. Fill remaining:

- **What Changes** — high-level change list
- **Success Criteria** — specific, measurable, testable, independent (INVEST)
- **Affected Code** — files to modify (discoverable via `/adv-prep`)
- **Related Repositories** — table if cross-repo (Repo ID, Path, Changes)
- **Constraints** — MUST/MUST NOT/SHOULD
- **Impact** — affected specs, breaking changes, dependencies, cross-repo
- **Context** — brainstorm reference if applicable

Persist: `adv_change_update changeId: "<id>" proposal: "<content>"`

> × Do NOT call `adv_change_create` again — creates duplicate. Use `adv_change_update`.

---

## Step 7.5: Cross-Repo Routing

Ask via `question`: "Does this change require modifications to other repositories?" If yes → gather repo paths → add to Related Repositories table.

---

## Step 8: Quality Check

Verify: each criterion testable, no subjective language, requirements independent, scope achievable. If any fail → refine via `question`.

---

## Output

Emit CHANGE CREATED block: Change ID, Title, Status (draft), files created, and confirmed problem framing.

```
/adv-proposal COMPLETE
Result: Change <change-id> created
Next: /adv-discover <change-id>
```
