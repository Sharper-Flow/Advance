---
name: adv-optimizer
description: Analyze code simplification opportunities and propose optimizer changes
---

<!-- manifest: adv-optimizer · requiresChangeId: false -->

# ADV Optimizer — Simplification Proposal Scout

Find bloated, overly verbose, overly complex, or under-optimized code and synthesize an evidence-backed simplification proposal. This command is read-only and does not replace `/adv-slop-scan`; slop-scan owns detector coverage and smell reporting, while optimizer owns proposal synthesis for long-term maintainability.

<UserRequest>
$ARGUMENTS
</UserRequest>

## Command Boundary

**Produces:** `OPTIMIZER PROPOSAL` with current-state evidence, ranked simplification opportunities, recommended long-term direction, risks, non-goals, and next ADV command.

ADV State Mutation: none.

**Gate:** None.

**× MUST NOT:** perform code edits, ADV state mutation, agenda creation, task creation, or automatic deletion. × MUST NOT auto-delete code based on heuristic or sub-agent judgment. × MUST NOT invoke `/adv-*` slash commands from worker prompts.

## Argument Parsing

Parse `$ARGUMENTS`:

| Input | Meaning | Default |
| --- | --- | --- |
| `<target>` | Repo, path, symbol, or concept to inspect | `.` |
| `--depth light\|standard\|deep` | Scanner breadth and report detail | `standard` |
| `--json` | Emit machine-readable proposal JSON | Text |

Ask via `question` only when target ambiguity would materially change scan scope. Otherwise choose the closest concrete target and state the assumption.

## Target Resolution

Resolve in order:

1. Existing file path → inspect directly.
2. Existing directory → inspect tree/outline and representative source files.
3. Symbol name → symbol search, then text fallback.
4. Concept → semantic search, then closest matching files/modules.
5. Unresolved target → clarify; do not fabricate scope.

## Phase 1: Context and Deterministic Evidence

1. Capture `WORKING DIRECTORY`.
2. Load project context and relevant specs when available.
3. Inspect local structure for the target.
4. Gather deterministic signals where practical: file/module boundaries, duplication cues, complexity/nesting hotspots, test adjacency, command/manifest ownership, and existing docs.
5. Preserve coverage notes: searched paths, unavailable tools, skipped dimensions.

Heuristics may discover or rank opportunities, but must not own correctness, safety, deletion, persistence, gate completion, or spec compliance.

## Phase 2: First-Level Scanner Fan-out

Use bounded first-level `explore` scanners for independent simplification perspectives. Add `adv-researcher` only when external best-practice/reference evidence is needed for a recommendation.

### No Nested Scanner Delegation

- Scanner workers must complete analysis inline with their own tools.
- Scanner workers must NOT spawn additional sub-agents, delegates, or worker agents.
- Scanner workers must NOT invoke any `/adv-*` slash commands.
- Deeper-analysis need → return gap to orchestrator.

### Scanner Packet

Inject this packet into every scanner prompt:

```text
WORKING DIRECTORY: {workdir}
TARGET: {resolved-target}
SCOPE: {files/modules/concept in scope}
DEPTH: {light|standard|deep}
IN_SCOPE:
  - simplification opportunities
  - bloated, verbose, duplicated, over-abstracted, or over-complex code
  - evidence that supports or rejects each opportunity
OUT_OF_SCOPE:
  - code edits
  - ADV state mutation
  - agenda/task/change creation
  - automatic deletion
STOP_WHEN:
  - requested target cannot be resolved
  - scanner needs nested delegation
  - finding lacks source evidence
EXPECTED OUTPUT: JSON findings with file:line/symbol/metric/source citation evidence, confidence, actionability, risk, and proposed simplification.
```

## Source Evidence Requirement

Actionable recommendations require source evidence: `file:line`, symbol, metric, source citation, or scoped source proof. Evidence-free findings are omitted; evidence-free findings are omitted before actionability sorting. Low-confidence findings must be separated from actionable findings and grouped as `low-confidence` or `user-review`.

Deletion candidates are never automatic actions. They require structural evidence and remain recommendations for tracked follow-up review.

## Phase 3: Aggregation

1. Merge deterministic evidence and scanner findings.
2. Deduplicate by source location and opportunity kind.
3. Reject evidence-free recommendations.
4. Classify each item:
   - `actionable` — source-backed and safe to propose.
   - `user-review` — potentially useful but needs human/domain judgment.
   - `low-confidence` — weak signal, advisory only.
5. Sort by expected long-term maintainability value, risk reduction, and implementation cost.

## Degraded Execution

- Some scanners fail or timeout → return a partial report with scanner coverage gaps.
- All scanners fail or timeout → return deterministic evidence only with retry guidance.
- External reference lookup unavailable → use local evidence only and state the gap.
- No actionable findings + adequate coverage → report no optimizer proposal needed for the target.

## Report Output

Text output MUST use this shape:

```text
OPTIMIZER PROPOSAL

Target: {target}
Depth: {depth}
Coverage: {deterministic checks + scanners run/skipped/failed}

## Current State
{source-backed summary}

## Ranked Simplification Opportunities
1. {title}
   Evidence: {file:line | symbol | metric | source citation}
   Current cost: {why this is bloated/verbose/complex/under-optimized}
   Proposed simplification: {direction}
   Actionability: actionable | user-review | low-confidence
   Risk: {risk and mitigation}

## Recommended Long-Term Direction
{proposal synthesis; target architecture or simplification principle}

## Risks
{implementation/review risks}

## Non-Goals
{explicitly excluded work, including no automatic deletion}

## Next ADV Command
{`/adv-proposal <summary>` or `/adv-task` with rationale}
```

JSON output MUST expose the same sections structurally and preserve `actionability` grouping.

## Constraints

- Read-only command.
- First-level scanner delegation only.
- No code edits.
- No ADV state mutation.
- No agenda, task, or change creation.
- No automatic deletion.
- Does not replace `/adv-slop-scan`; slop detector coverage remains slop-scan-owned.
- Proposal synthesis is the owning output.
