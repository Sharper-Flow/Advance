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

After task synthesis is complete AND before Phase 3 validation, load
`skill("adv-cost-governance-methodology")` and **apply the Identification
Protocol**. Persist identified calls to `change.judgment_calls[]` (or `[]`
if none) via `adv_change_update`.

**Cheatsheet (3 in-scope categories):**

| Category | Example |
|----------|---------|
| `non_functional_tradeoff` | "Favor latency or consistency for this new endpoint?" |
| `extensibility` | "Hardcode this value or make it config-driven?" |
| `scope_boundary` | "Handle edge case X here or defer?" |

**Out of scope** (agent resolves autonomously — surfacing creates decision fatigue): `defaults`, `naming`, `error_semantics`.

**Scoping boundary:** gap surfacing (rq-prep-scope1.1), NOT task creation (rq-prep-out1), NOT architectural reopening (rq-prep-neg1). See skill for full protocol, cap rationale (≤5), worked example, and rq-autonomy01 escape-clause citation.

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
