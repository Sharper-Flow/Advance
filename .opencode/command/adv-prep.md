---
name: adv-prep
description: "Analyze gaps and synthesize tasks from validated research findings"
phaseGoal: "Complete the flight-check: every gap closed, every dependency mapped, every task ready — ready for autonomous implementation."
---
<!-- manifest: adv-prep · gate: planning · requiresChangeId: true · prereqs: [adv-design] · scope: reads[specs, proposal, codebase] · modifies[tasks, proposal] -->
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
## Phase 0: Embedded Methodology

### Prep Methodology

#### Purpose

Reusable gap analysis and task synthesis methodology for ADV prep workflows. Provides the INVEST criteria, requirements smell detection, task sequencing rules, and cross-cutting concern checklist.

**Canonical source:** `docs/checklists/prep-checklist.md` — see that checklist for detailed INVEST checks, sequencing rules, absorption analysis, TDD ordering, dependency coherence, and cross-cutting concern templates. Do not duplicate its content here.

#### Gap Analysis Protocol

Every `/adv-prep` invocation must execute these steps:

| # | Step | Focus |
|---|------|-------|
| 1 | Requirements quality | INVEST criteria + smell detection |
| 2 | Task completeness | Atomic tasks, coverage, verification steps |
| 3 | Task sequencing | Absorption, TDD ordering, dependency coherence |
| 4 | Cross-cutting concerns | Error handling, logging, validation, security, performance, config, monitoring |
| 5 | Codebase impact | Key term search, missing files, undiscovered dependencies |
| 6 | Cross-spec consistency | Terminology, overlapping scope, conflicts |
| 7 | Cross-repo routing | Target metadata, related repos config, routing completeness |

All steps must be executed. Skipping requires explicit justification.

#### Constraints

- **Read-only guidance** — this methodology block does not mutate ADV state
- **No gate completion** — the command owns the planning gate
- **Canonical source** — defer to `docs/checklists/prep-checklist.md` for detailed rules
- **No architecture decisions** — those belong in `/adv-design`
- **No workflow sequencing** — the command owns phase ordering

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
<!-- rq-prep-synth1 -->
Run 4-Step Gap Analysis (desired state → current state → gap → action plan) using the loaded skill methodology:
1. **Requirements quality** — INVEST criteria + smell detection (from skill)
2. **Task sequencing** — absorption analysis, TDD ordering, dependency graph coherence (from skill)
3. **Cross-cutting concerns** — 12-item checklist, document N/A with rationale (from skill)
4. **Codebase impact** — search key terms, flag missing files/dependencies
5. **Cross-spec consistency** — `adv_spec search` for conflicts, terminology inconsistencies
6. **Cross-repo routing** — verify `related_repos` config, routing metadata, coverage

Prioritize gaps via MoSCoW. Proceed immediately — invocation is implicit approval.

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

### 3.1 Requirements Quality (INVEST)

| Criterion | Check | Gap if Missing |
|-----------|-------|----------------|
| **I**ndependent | Self-contained? | Decouple from X |
| **N**egotiable | Leaves solution flexibility? | Clarify intent vs impl |
| **V**aluable | Demonstrable value? | Define user benefit |
| **E**stimable | Can be sized? | Break into smaller pieces |
| **S**mall | Fits one iteration? | Split into phases |
| **T**estable | Can write test? | Add acceptance scenario |

### 3.2 Requirements Smells

| Smell | Pattern | Action |
|-------|---------|--------|
| Subjective | "user-friendly" | Add measurable criterion |
| Ambiguous | "efficiently" | Specify metric |
| Superlative | "best" | Define baseline |
| Totality | "all", "never" | Identify exceptions |
| Negative | "must not" | Convert to positive or add test |

### 3.3 Task Completeness

From `adv_task_list`: tasks atomic? cover all requirements? verification steps? dependencies explicit?

### 3.3.1 Task Sequencing (CRITICAL)

#### A. Absorption Analysis

| Signal | Action |
|--------|--------|
| 3-5 line change within larger function | Absorb into parent |
| Sub-behavior of another task | Absorb, update parent description |
| Would require retrofitting after dependency | Absorb into dependency |
| Cross-cutting behavior matching existing patterns | Cancel with rationale |

Red flags: "Add X to Y" where Y is another task's output, touches same file, blocked_by AND modifies same code, blocking task would leave obviously incomplete code without this.

Action: `adv_task_cancel` (with approval) → update parent description → redirect dependents.

#### B. TDD Ordering

Inline TDD is default. Use `metadata.tdd_intent`:

| Value | Meaning | Evidence? |
|-------|---------|-----------|
| `inline` (or unset) | Red/green within task | Yes |
| `separate_verification` | Cross-cutting test | No |
| `not_applicable` | Non-code (docs, config) | No |

Anti-pattern: same-scope test task blocked_by impl task (code-first, not test-first). Fix: merge test into impl, cancel test task.

Exception: cross-cutting tests spanning multiple impl tasks → mark `separate_verification`.

#### C. Dependency Graph Coherence

| Issue | Detection | Fix |
|-------|-----------|-----|
| Retrofit chains | A creates code, B modifies same | Merge B into A |
| Orphan branches | No dependents, no requirement | Cancel or connect |
| False dependencies | blocked_by but could run parallel | Remove |
| Missing dependencies | Modifies code another creates, no blocked_by | Add or merge |
| Diamond dependencies | Two tasks modify same area | Merge or sequence |

### 3.4 Cross-Cutting Concerns

| Concern | Check | Gap Template |
|---------|-------|-------------|
| Error Handling | Failure scenarios? Recovery? | "Add error handling for X" |
| Logging | Audit trail? Debug info? | "Add structured logging for X" |
| Validation | Input/output verification? | "Add validation for X" |
| Security | Auth? AuthZ? Injection? | "Add security review for X" |
| Performance | Latency? N+1? | "Add performance test for X" |
| Caching | Optimization opportunity? | "Evaluate caching for X" |
| Config | New options needed? | "Document config for X" |
| Monitoring | Health checks? Metrics? | "Add observability for X" |
| Persistence | Data storage implications? | "Define data model for X" |
| Concurrency | Thread safety? Races? | "Add concurrency test for X" |
| i18n/L10n | Internationalization? | "Add i18n support for X" |
| Privacy | Data protection? GDPR? | "Review data handling for X" |

Document N/A with rationale for non-applicable concerns.

### 3.5 Codebase Impact

Search codebase for key terms → compare with affected files. Flag missing files, undiscovered dependencies.

### 3.6 Cross-Spec Consistency

`adv_spec action: "search" query: <term>` → flag conflicts, terminology inconsistencies, overlapping scope.

### 3.7 Cross-Repo Routing

**Check 1:** Task routing metadata — flag MUST gap if task mentions repo but lacks `target_repo`/`target_path`.

**Check 2:** Related repos config — verify `project.json` has `related_repos` if tasks target external repos.

**Check 3:** Routing completeness — every repo in proposal has ≥1 task targeting it.

**Check 4:** Cross-project coordination metadata — when a change depends on or contributes to another ADV-enabled project, ensure tasks or change metadata identify `cross_project_links` and `external_dependencies` explicitly.

**Check 5:** Advisory-only dependencies — `external_dependencies` are advisory-only dependencies. They may produce warnings, but prep MUST NOT model them as gate blockers unless the agreement explicitly requires blocking behavior.

**Check 6:** Target tool mode — planned target reads must use `snapshot-ok` ADV tools with `target_path`; planned target mutations must use `temporal-required` ADV tools and capture `target_confirmed`/`confirmationEvidence` for untrusted targets.

### 3.8 Multi-Worktree File-Overlap Scan

When 2+ worktrees are active for the same project, scan for file-path intersections between the current change's planned `touched_files` and peer worktrees' active changes' `touched_files`.

**How it works:**
1. Read `worktree_registry` from the project workflow state (via `listWorktrees`).
2. For each peer worktree (skipping the current branch), resolve its `changeId` and read `change_summaries[changeId].touched_files` from Temporal (via `getChangeSummaries`).
3. Compute the intersection with the current change's planned `touched_files`.
4. Flag non-empty intersections as "potential merge conflict" warnings.
5. Archived changes are skipped (their files are already merged).

**Cross-session reliability:** Temporal serializes `touched_files` writes from peer sessions; the snapshot read by the scan is consistent at read time.

**Surfacing:** Overlaps are surfaced in the vision banner (Phase 5.1) as advisory warnings. They do NOT block the prep gate — they inform the user of coordination risk before autonomous execution begins.

> **TODO:** Wire `scanFileOverlaps` from `plugin/src/validator/file-overlap.ts` into the prep validator. The validator is currently pure-sync over `Change` objects; integrating an async Temporal query requires refactoring the validator runner to accept async checks. Defer until the validator framework gains async I/O support.

---

## Phase 4: Prioritize Gaps (MoSCoW)

| Priority | Criteria | Action |
|----------|----------|--------|
| Must | Without it = failure | Blocking task |
| Should | Important, workarounds exist | Task |
| Could | Desirable, time permitting | Optional |
| Won't | Out of scope | Document in proposal.md |

---

## Phase 5: Contract & User Approval

### 5.1 Vision Document

Generate a compact vision banner (<30 lines) and present it **in chat only** (not stored as a file). Include:

```
╔══════════════════════════════════════════════════════════════════╗
║  PREP VISION — {change title}                                    ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Objective: {1-line summary from problem statement}              ║
║                                                                  ║
║  Success Criteria:                                               ║
║    • {criterion 1}                                               ║
║    • {criterion 2}                                               ║
║    • ...                                                         ║
║                                                                  ║
║  Task Summary: {N} tasks ({M} ready, {K} blocked)                ║
║    • {highest priority task summary}                             ║
║    • {next priority task summary}                                ║
║    • ...                                                         ║
║                                                                  ║
║  Gaps Fixed: {count} (Must: {n}, Should: {n}, Could: {n})        ║
║                                                                  ║
║  HITL Boundary:                                                  ║
║    ✓ Proposal approved | ✓ Research approved | → PREP APPROVAL   ║
║    After this: autonomous implementation via /adv-apply          ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

### 5.2 User Approval Gate (Inline)

Present the vision document banner inline, then emit the **Inline Approval prompt (Tier A)** per `docs/command-voice-standard.md` § Inline Approval Voice. The prep gate is the last human checkpoint before autonomous execution.

After the vision banner:

```
Reply `approve` (or `continue`, `go`, `yes`, `ok`, `proceed`, `lgtm`) to approve the plan and proceed inline to /adv-apply,
or run `/adv-apply {change-id}`.
Want changes? Reply with what to adjust (loops back to gap analysis).
Want to abandon prep? Reply `cancel` or `stop`.
```

**Reply parsing (Tier A):**

| Reply | Action |
|---|---|
| Tier A whitelist match | Call `adv_gate_complete gateId: 'planning' userApproved: true`, then begin `/adv-apply` inline |
| `/adv-apply {change-id}` | Counts as explicit approval. The agent completes planning with `userApproved: true` and proceeds to execution inline — no second approval prompt |
| Free-form text | Treat as revision request; collect feedback → loop back to Phase 4 (re-analyze gaps) → regenerate vision → re-prompt |
| `cancel` / `stop` | Halt; do not complete prep gate |
| Ambiguous | LLM judgment classifies into approve / revise / redirect / stop / unclear |

**Anchor phrase:** `Reply `approve``

**Machine contract (CRITICAL):** when the user replies with a Tier A whitelist word (or LLM classifies as `approve`), the agent MUST pass `userApproved: true` to `adv_gate_complete gateId: 'planning'`. The machine contract enforced by `handlePlanningGateCompletion` is independent of the UX surface — inline approval is the upstream signal source.

**× MUST NOT proceed past Phase 5 without an explicit user reply matching the Tier A whitelist, LLM-classified `approve`, or exact shown continuation command invocation.** The prep gate is the last human checkpoint before autonomous execution.

---

## Phase 6: Fix Gaps

> Anti-Loop: after contract → `>>> SYNTHESIS COMPLETE - FIXING GAPS <<<` → first tool call.

- Missing tasks → `adv_task_add` (with `blockedBy` if needed)
- Absorption/merge → `adv_task_cancel` (with user approval) → update parent → redirect dependents
- TDD ordering → cancel test task → update impl task with "TDD: write tests first"
- Missing scenarios → document the gap in proposal/problem statement, add follow-up task(s), and stop for explicit delta editing support rather than writing `change.json` directly
- Cross-cutting → add task or document N/A
- Smells → record required wording changes in proposal/problem notes or add follow-up task(s); don't rewrite requirement text inline during prep
- Cross-spec conflicts → document resolution in proposal.md

---

## Phase 7: Progress Tracking

After EACH fix, keep progress in ADV state (`adv_task_list`, `_contextSnapshot`). Emit no `CONTRACT STATUS` block.

---

## Phase 8: Validation

`adv_change_validate changeId: <target> strict: true` → fix errors → re-validate.

---

## Phase 8.5: Readiness Report

`adv_gate_complete changeId: <target> gateId: planning userApproved: true`

| Result | Action |
|--------|--------|
| Must-failures | Fix per remediation hint → re-run gate |
| Warnings only | Surface as follow-up, don't block |
| Clean pass | Proceed to Phase 9 |

Failure codes: `SCENARIO_MISSING` → add Given/When/Then, `TASK_TDD_INVERSION` → merge test into impl, `CROSS_REPO_MISSING_METADATA` → set both fields.

---

## Phase 9: Completion

### Verify

`adv_task_list` + `adv_change_validate` for target.

### Readiness Self-Assessment

Agent self-evaluates confidence across: requirements clarity, technical approach, dependency knowledge, codebase context, edge cases, cross-cutting concerns.

For each gap: resolve inline (read code, query docs, ask specific question). Re-validate after resolving. If unresolvable alone → ask user a specific targeted question.

### Mark Gate

`adv_gate_complete changeId: {change-id} gateId: planning userApproved: true` (no-op if Phase 8.5 already passed).

### Completion

Use the Gate Handoff Voice spine (see `docs/command-voice-standard.md § Gate Handoff Voice`):

```
## Problem
{One-line restatement of the problem this change addresses.}

## Chosen direction
Firm plan shape (task structure, approach, not task list).

## Delivered
- Gaps fixed, tasks created/absorbed/cancelled
- Task graph with dependencies
- TDD intent assigned per task

---

> **{change-id}**
> planning ✓ → execution
>
> → `/adv-apply {change-id}`
```

**Auto-continue:** After user approval, immediately begin `/adv-apply` inline. This is the last human checkpoint before autonomous execution — the user's "approve and continue" is the go-ahead to start implementation without any further confirmation.

---
## Key Tools

| Purpose | Tool |
|---------|------|
| Load change | `adv_change_show` |
| List tasks | `adv_task_list` |
| Add task | `adv_task_add` |
| Cancel tasks | `adv_task_cancel` (requires user approval) |
| List/show/search specs | `adv_spec` |
| Validate | `adv_change_validate` |
| Planning gate | `adv_gate_complete gateId: planning userApproved: true` |
