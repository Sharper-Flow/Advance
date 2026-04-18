---
name: adv-prep
description: Analyze gaps and synthesize tasks from validated design decisions
---
# ADV Prep — Pre-Implementation Gap Analysis
Analyze change for gaps (missing scenarios, tasks, cross-cutting concerns) → add them via ADV tools. Uses 4-Step Gap Analysis and IEEE completeness criteria. Runs **inline** — no sub-agents.
## Command Boundary
**Produces:** Complete task graph via `adv_task_add` (sole pre-impl task creator), gap analysis, task sequencing with dependencies.
**× MUST NOT:** Complete non-planning gates, make new architecture decisions, modify problem statement/agreement/design intent.
**Gate:** Completes `planning` only. `/adv-task` is exempt (fast-track bundles proposal+discovery+design+planning).
<UserRequest>
  $ARGUMENTS
</UserRequest>
## Target Resolution
1. If change-id provided → use directly
2. If empty → `adv_change_list` → auto-select the only plausible change; ask via `question` only if multiple plausible targets remain

---
## Phase 0: Load Skill
`skill("adv-prep-methodology")` → provides INVEST criteria, requirements smell detection, task sequencing (absorption, TDD ordering, dependency graph coherence), cross-cutting concerns checklist, and MoSCoW prioritization. If the skill is unavailable, use `docs/checklists/prep-checklist.md` as inline fallback.

---
## Phase 1: Load Context
`adv_change_show` + `adv_task_list` + `adv_gate_status` for target. Then `adv_spec action: "list"` + `adv_spec action: "show"` for each affected capability.

Stop if discovery or design gates are incomplete. `/adv-prep` analyzes validated design decisions — it must not backfill pre-implementation gates.

If change has tasks marked `done`, treat as draft implementation — run full gap analysis, add reconciliation tasks where gaps found. × Do NOT rubber-stamp completed tasks.

If zero tasks AND design gate complete → synthesize task graph from design findings, deltas, and proposal context. If design gate pending → warn: run `/adv-design` first.
### After Re-Entry
If this change was re-entered via `adv_change_reenter`, the planning gate has been reset to `pending` and new tasks can be added via `adv_task_add`. Existing tasks and completed work from prior execution are preserved. Run the full gap analysis against the expanded scope — treat previously completed tasks as evidence to validate, not as proof of acceptance. Add new tasks where the expanded scope introduces gaps.

Doctor-Lite: check cross-repo routing completeness — flag MUST gap if `target_repo`/`target_path` missing on cross-repo tasks.

---
## Phase 2: Gap Analysis + Task Synthesis
Run 4-Step Gap Analysis (desired state → current state → gap → action plan) using the loaded skill methodology:
1. **Requirements quality** — INVEST criteria + smell detection (from skill)
2. **Task sequencing** — absorption analysis, TDD ordering, dependency graph coherence (from skill)
3. **Cross-cutting concerns** — 12-item checklist, document N/A with rationale (from skill)
4. **Codebase impact** — search key terms, flag missing files/dependencies
5. **Cross-spec consistency** — `adv_spec search` for conflicts, terminology inconsistencies
6. **Cross-repo routing** — verify `related_repos` config, routing metadata, coverage

Prioritize gaps via MoSCoW. Emit CONTRACT ACTIVE banner. Proceed immediately — invocation is implicit approval.

Fix gaps: `adv_task_add` for missing tasks, `adv_task_cancel` (with approval) for absorption/merges, document N/A for non-applicable concerns. Assign `metadata.tdd_intent` to every task.

### Delegation Hints
When creating tasks, `/adv-prep` may set `metadata.delegation_hint` to signal execution routing:
- `inline_required` — task must execute inline (complex, multi-file, architectural)
- `delegate_allowed` — task may be delegated to a sub-agent (trivial, narrow scope)
- `delegate_preferred` — task should be delegated unless risk signals override

If omitted, `/adv-apply` determines routing from `tdd_intent`, title heuristics, and risk signals. See `ADV_INSTRUCTIONS.md § Delegation Routing`.

### Touched-Scope Quality Ownership
The task graph MUST include tasks covering touched-scope obligations:
1. **Directly touched implementation files** — code changed or added by the change
2. **Adjacent tests and docs** — test files and documentation needed for correctness and clarity of touched code
3. **Same-pattern local subsystem issues** — identical defect/quality patterns in the local touched subsystem that are cheap and clearly the same class of issue

× Do NOT expand ownership into implicit repo-wide refactors. Keep ownership bounded to the local touched subsystem.

---
## Phase J: Identify Judgment Calls (addCostTimeInvestment)

After task synthesis is complete AND before Phase 3 validation, review the
task graph + proposal scope and identify upcoming decisions that need
**user intuition, preference, or context** rather than autonomous agent
judgment. This is **gap surfacing** (consistent with `rq-prep-scope1.1`) —
NOT task creation (`rq-prep-out1`) and NOT architectural reopening
(`rq-prep-neg1`).

### In-Scope Categories (v1)

Only surface judgment calls in these three categories:

| Category | Example |
|----------|---------|
| `non_functional_tradeoff` | "Favor latency or consistency for this new endpoint?" |
| `extensibility` | "Hardcode this value or make it config-driven?" |
| `scope_boundary` | "Handle edge case X here or defer to a follow-up?" |

Explicitly **out of scope** (agent resolves autonomously — surfacing them
creates decision fatigue): defaults, public API naming, error semantics.
See `cost-governance.md` for rationale.

### Cap and Identification

- **Cap at ≤5 judgment calls** per change. Research: developers experience
  measurable cognitive decline after ~8-12 non-trivial decisions per session.
- For each identified call, construct an entry matching `JudgmentCallSchema`:
  - `id` — `jc-<6char>` (nanoid-style)
  - `category` — one of the three in-scope values
  - `question` — framed around outcome/behavior/priority, NOT tech choice
  - `agent_recommendation` — the agent's best default, with rationale
  - `rationale` — why user intuition matters here (what the agent can't see)
  - `options` — array of 3-4 `{ label, description }` pairs, one flagged
    `(Recommended)` matching `agent_recommendation`
- **If no judgment calls identified**, initialize `judgment_calls: []`.
  This distinguishes new-generation changes from legacy changes where
  `judgment_calls === undefined`. `/adv-apply` Phase 0 silently proceeds
  for both but records `batch_surfaced_at` on the empty-array case.

### Persistence

Persist the calls by writing them directly to `change.judgment_calls` via
an extended `adv_change_update` (if the MCP signature supports it) OR via
the proposal metadata section. For v1, the simplest path is to include the
identified calls in the proposal metadata; the change state can be
backfilled by `/adv-apply` Phase 0 on first surfacing.

### Example

For a change adding a new caching layer, typical calls might be:

```
jc-a7f2b1
  category: non_functional_tradeoff
  question: "Cache TTL for the new endpoint — favor freshness or hit rate?"
  agent_recommendation: "5 minute TTL (balanced)"
  rationale: "TTL choice depends on your tolerance for stale data vs p99
             improvement. Typical web workloads accept 5min; realtime apps
             need <1min; static content can cache 1h+."
  options:
    - label: "1 minute TTL (fresh, lower hit rate)"
    - label: "5 minute TTL — balanced (Recommended)"
    - label: "15 minute TTL (high hit rate, staler)"
```

### Composition with Autonomy Contract

This phase does **not** introduce a new human checkpoint. Judgment
surfacing is covered by the existing `rq-autonomy01` escape clause
(unresolved user-value tradeoff). See `ADV_INSTRUCTIONS.md` §
Investment Check-In for the full citation.

---
## Phase 3: Validation + Completion
`adv_change_validate strict: true` → fix errors → re-validate. `adv_gate_complete gateId: planning` → handle failure codes (`SCENARIO_MISSING`, `TASK_TDD_INVERSION`, `CROSS_REPO_MISSING_METADATA`).

Agent self-assesses readiness (requirements clarity, technical approach, edge cases). Resolve gaps inline or ask user.

Emit: `/adv-prep {change-id} COMPLETE` — gaps fixed, tasks created/absorbed/cancelled, gate status, next: `/adv-apply`.

---
## Key Tools
| Purpose                | Tool                                       |
| ---------------------- | ------------------------------------------ |
| Load change            | `adv_change_show`                          |
| List tasks             | `adv_task_list`                            |
| Add task               | `adv_task_add`                             |
| Cancel tasks           | `adv_task_cancel` (requires user approval) |
| List/show/search specs | `adv_spec`                                 |
| Validate               | `adv_change_validate`                      |
| Planning gate          | `adv_gate_complete gateId: planning`       |
