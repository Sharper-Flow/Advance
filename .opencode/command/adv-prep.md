---
name: adv-prep
description: "Analyze gaps and synthesize tasks from approved agreement plus validated design"
phaseGoal: "Complete the flight-check: every gap closed, every dependency mapped, every task ready — ready for autonomous implementation."
---

## <!-- manifest: adv-prep · gate: planning · requiresChangeId: true · prereqs: [adv-design] · scope: reads[specs, proposal, codebase] · modifies[tasks, proposal] -->

# ADV Prep — Pre-Implementation Gap Analysis

Analyze change for implementation-readiness gaps (tasks, sequencing, cross-cutting concerns, contract traceability) → add them via ADV tools. Uses 4-Step Gap Analysis to map approved criteria/design into tasks; prep does not firm criteria. Runs **inline** — no sub-agents.

<!-- rq-prep-out1 rq-prep-neg1 rq-prep-scope1 rq-stagePrepNoCriteriaFirming01 rq-prepArtifactExcerpt01 rq-PR007coc -->

## Command Boundary

**Produces:** Complete task graph via `adv_task_add` (sole pre-impl task creator per rq-prep-out1), gap analysis (rq-prep-scope1), task sequencing with dependencies.
**× MUST NOT:** Complete non-planning gates, make new architecture decisions, invent/rewrite acceptance criteria or success criteria, modify problem statement/agreement/design intent (per rq-prep-neg1 and rq-stagePrepNoCriteriaFirming01).
**Gate:** Completes `planning` only. `/adv-task` is exempt (fast-track bundles proposal+discovery+design+planning).
<UserRequest>
$ARGUMENTS
</UserRequest>

## Target Resolution

1. If change-id provided → use directly
2. If empty → `adv_change_list` → auto-select the only plausible change; ask via `question` only if multiple plausible targets remain

---

## Phase 0: Embedded Methodology

<!-- rq-noSourceChecklistReads01 -->

### Prep Methodology

#### Purpose

Reusable gap analysis and task synthesis methodology for ADV prep workflows. Provides agreement/design coverage checks, task sequencing rules, and cross-cutting concern checklist. Prep maps criteria to tasks; it does not firm criteria.

**Runtime source:** this embedded section provides the prep methodology needed during command execution.

#### Gap Analysis Protocol

Every `/adv-prep` invocation must execute these steps:

| #   | Step                      | Focus                                                                          |
| --- | ------------------------- | ------------------------------------------------------------------------------ |
| 1   | Agreement/design coverage | Approved criteria + validated design mapped to tasks                           |
| 2   | Task completeness         | Atomic tasks, coverage, verification steps                                     |
| 3   | Task sequencing           | Absorption, TDD ordering, dependency coherence                                 |
| 4   | Cross-cutting concerns    | Error handling, logging, validation, security, performance, config, monitoring |
| 5   | Codebase impact           | Key term search, missing files, undiscovered dependencies                      |
| 6   | Cross-spec consistency    | Terminology, overlapping scope, conflicts                                      |
| 7   | Cross-repo routing        | Target metadata, related repos config, routing completeness                    |

All steps must be executed. Skipping requires explicit justification.

#### Constraints

- **Read-only guidance** — this methodology block does not mutate ADV state
- **No gate completion** — command owns the planning gate
- **Runtime source** — use this embedded methodology during command execution
- **No architecture decisions** — those belong in `/adv-design`
- **No criteria firming** — acceptance criteria and success criteria belong in `/adv-discover`; design-derived technical criteria belong in `/adv-design`
- **No workflow sequencing** — command owns phase ordering

---

## Phase 1: Load Context

`adv_change_show changeId: <target> include: { snapshot: true, readyTasks: true }` collapses change + gate snapshot + ready-queue into one call. Add `include.ledger: true` only when picking up after a partial execution (re-entry path). When a fresh structured per-gate breakdown is needed (e.g. for prep methodology enforcement), fall back to `adv_gate_status changeId: <target>`.

If `change.contract` exists, load it as planning input. Contract items are the obligation source of truth; legacy `acceptanceCriteria` is only a projection.

Then `adv_spec action: "list"` + `adv_spec action: "show"` for each affected capability.

Stop if discovery or design gates are incomplete. `/adv-prep` analyzes validated design decisions — it must not backfill pre-implementation gates.

If change has tasks marked `done`, treat as draft implementation — run full gap analysis, add reconciliation tasks where gaps found. × Do NOT rubber-stamp completed tasks.

If zero tasks AND design gate complete → synthesize task graph from design findings, deltas, and proposal context. If design gate pending → warn: run `/adv-design` first.

### After Re-Entry

If this change was re-entered via `adv_change_reenter`, the planning gate has been reset to `pending` and new tasks can be added via `adv_task_add`. Existing tasks and completed work from prior execution are preserved. Run the full gap analysis against the expanded scope — treat previously completed tasks as evidence to validate, not as proof of acceptance. Add new tasks where the expanded scope introduces gaps.

Doctor-Lite: check cross-repo routing completeness — flag MUST gap if `target_repo`/`target_path` missing on cross-repo tasks. Product-linked changes must also have structural `scope_repos`: default current repo for local work; explicit multi-entry `scope_repos` with `merge_order` for cross-cutting archive/merge order.

## Phase 2: Gap Analysis + Task Synthesis

<!-- rq-prep-synth1 -->

Run 4-Step Gap Analysis (desired state → current state → gap → action plan) using the embedded methodology above:

1. **Agreement/design coverage** — approved criteria + validated design mapped to tasks (from embedded methodology)
2. **Task sequencing** — absorption analysis, TDD ordering, dependency graph coherence (from embedded methodology)
3. **Cross-cutting concerns** — 12-item checklist, document N/A with rationale (from embedded methodology)
4. **Codebase impact** — search key terms, flag missing files/dependencies
5. **Cross-spec consistency** — `adv_spec search` for conflicts, terminology inconsistencies
6. **Cross-repo routing** — verify `related_repos` config, routing metadata, coverage

Prioritize gaps via MoSCoW. Proceed immediately — invocation is implicit approval.

Fix gaps: `adv_task_add` for missing tasks, `adv_task_cancel` (with approval) for absorption/merges, document N/A for non-applicable concerns. Assign `metadata.tdd_intent` to every task.

### Non-Code Deliverable Evidence Policy

<!-- rq-prepNonCodeEvidence01 -->

For tasks whose deliverable is non-code (`docs`, `research`, `approval`, `verification`, `ops`, writing, analysis, design improvement, competitive research), set a machine-readable `evidence_policy` and trace the task to approved contract items instead of forcing fake red/green TDD.

| Deliverable | Suggested evidence policy | TDD intent |
| --- | --- | --- |
| Research / competitive analysis | `source_citation` or `source_audit` | `not_applicable` |
| Documentation / writing | `artifact_reference` or `rubric_review` | `not_applicable` |
| Approval checkpoint | `stakeholder_acceptance` | `not_applicable` |
| Design critique / review | `rubric_review` | `not_applicable` |
| Ops / configuration | `artifact_reference` or `static_check` | `not_applicable` or `separate_verification` |
| Cross-cutting verification | `test`, `review`, or `static_check` | `separate_verification` |

Rules:

- Non-code tasks MUST NOT be forced through fake red/green TDD.
- `evidence_policy: not_applicable` is allowed only with `contract_refs.not_applicable_reason`.
- Every non-code task MUST have `contract_refs` (`implements`/`verifies`/`respects`) or a bounded `not_applicable_reason`.
- Use the shared `ContractEvidencePolicy` vocabulary: `source_citation`, `source_audit`, `rubric_review`, `stakeholder_acceptance`, `artifact_reference`, `static_check`, `review`, `test`, `design_proof`, `not_applicable`.

### Contract Traceability

When `ChangeContract` exists, `/adv-prep` must synthesize task refs alongside task graph decisions:

- Add `contract_refs.implements` for tasks that build behavior required by `AC*`, `SC*`, or `C*` items.
- Add `contract_refs.verifies` for tasks whose RED/GREEN or verification plan proves an item.
- Add `contract_refs.respects` for tasks that must preserve `DONT*`, `OOS*`, or constraint items.
- Add `contract_refs.not_applicable_reason` for mechanical tasks that do not implement, verify, or respect a contract item.
- Unknown IDs are invalid; copy exact IDs from `change.contract.items`.
- For `standard` and `strict` rigor, each code task needs contract refs or an explicit not-applicable reason.
- Every required `AC*` item needs at least one implementing or verifying task before planning gate completion.

When creating tasks, include the structured `contract_refs` payload in task mutation path supported by current tool layer. Do not rely on prose-only labels as the source of truth.

### Artifact Excerpts

For artifact-backed gates, prep must preserve enough context for execution and review to diagnose workflow readiness failures without reading ADV state files directly:

- Include a `problem-statement.md excerpt` or proposal summary when task scope depends on the confirmed problem.
- Include `agreement.md` acceptance/constraint excerpts in task verification notes when they drive `contract_refs.verifies` or `contract_refs.respects`.
- Include `design.md` decision excerpts for tasks implementing architecture-sensitive behavior.
- Do not create tasks that rely on manually editing `acceptance.md`; acceptance proof is generated from typed contract review state.

### Delegation Hints

When creating tasks, `/adv-prep` may set `metadata.delegation_hint` to signal execution routing:

- `inline_required` — task must execute inline (complex, multi-file, architectural)
- `delegate_allowed` — task may be delegated to a sub-agent (trivial, narrow scope)
- `delegate_preferred` — task should be delegated unless risk signals override

If omitted, `/adv-apply` determines routing from `tdd_intent`, title heuristics, and risk signals. See `ADV_INSTRUCTIONS.md § Delegation Routing`.

### Frontend Routing Metadata

When creating tasks whose owned scope is frontend/view/component UI work, `/adv-prep` MUST set `metadata.frontend = "true"` to give `/adv-apply` a structural routing signal for `adv-designer` (the apply-phase frontend worker). When the task scope is not frontend, omit the key (or set `"false"`).

Classification rule:

- Set `metadata.frontend = "true"` when the task implements or modifies HTML/CSS/JS/TSX components, view/page templates, design tokens, layout, responsive behavior, accessibility, or visual polish.
- Keep `metadata.frontend` unset (or `"false"`) for backend logic, storage, APIs, Temporal behavior, business rules, schemas, and infra tasks. `adv-engineer` owns these.
- For mixed UI/backend work, **split into separate tasks** — a UI task with `metadata.frontend = "true"` and a backend task without. Use `blockedBy` to sequence them. Do not bundle both concerns in one task.

`/adv-apply` reads `metadata.frontend` at Priority 1.5 in the delegation routing table (after `metadata.delegation_hint` Priority 1 explicit user override). See `.opencode/command/adv-apply.md § Delegation Routing` and `.opencode/agents/adv-designer.md` for the worker contract.

× MUST NOT rely on title or path heuristics as the sole authority for frontend routing — set the metadata key structurally. Heuristics may assist discovery, never own correctness.

× MUST NOT route review/harden work to `adv-designer` — `adv-reviewer` remains the review/harden owner. When review scope includes design/frontend work, the orchestrator supplies a frontend/design skill or checklist anchor to the reviewer packet (see `.opencode/command/adv-review.md` and `.opencode/command/adv-harden.md`).

### Touched-Scope Quality Ownership

Task graph MUST include tasks covering touched-scope obligations:

1. **Directly touched implementation files** — code changed or added by change
2. **Adjacent tests and docs** — test files and documentation needed for correctness and clarity of touched code
3. **Same-pattern local subsystem issues** — identical defect/quality patterns in the local touched subsystem that are cheap and clearly same class of issue

× Do NOT expand ownership into implicit repo-wide refactors. Keep ownership bounded to the local touched subsystem.

---

## Phase 3: Validation + Completion

`adv_change_validate strict: true` → fix errors → re-validate. `adv_gate_complete gateId: planning` → handle failure codes (`SCENARIO_MISSING`, `TASK_TDD_INVERSION`, `CROSS_REPO_MISSING_METADATA`).

If contract validation returns `CONTRACT_*` issues, fix task graph or contract refs before completing planning. Do not downgrade missing refs into future work.

Agent self-assesses readiness (requirements clarity, technical approach, edge cases). Resolve gaps inline or ask user.

### 3.1 Agreement/Design Coverage

| Source                            | Check                                   | Gap if Missing                                    |
| --------------------------------- | --------------------------------------- | ------------------------------------------------- |
| `AC*` / `SC*` contract items      | Implemented or verified by tasks?       | Add task/refs, or re-enter discovery if invalid   |
| Constraints / avoidances          | Respected by task graph?                | Add respecting task/refs or adjust design         |
| Design-derived technical criteria | Covered by implementation/verification? | Add task, or re-enter design if criteria conflict |
| Proposal User Outcomes            | Reflected by approved agreement/design? | Surface upstream mismatch; do not rewrite in prep |

If criteria are missing, contradictory, implementation-derived, or invalidated, route to the earliest affected gate. Prep does not repair criteria inline.

### 3.2 Task Readiness Smells

| Smell                  | Pattern                           | Action                                   |
| ---------------------- | --------------------------------- | ---------------------------------------- |
| Unmapped contract item | No task implements/verifies it    | Add task or contract refs                |
| Ambiguous task         | "handle X" without behavior       | Clarify task scope from agreement/design |
| Unsupported design     | Task contradicts design.md        | Re-enter design or revise task           |
| Over-broad task        | Multiple independent outcomes     | Split or sequence tasks                  |
| Missing proof          | No RED/GREEN or verification plan | Add TDD/verification detail              |

### 3.3 Task Completeness

From `adv_task_list`: tasks atomic? cover all requirements? verification steps? dependencies explicit?

### 3.3.1 Task Sequencing (CRITICAL)

#### A. Absorption Analysis

| Signal                                            | Action                            |
| ------------------------------------------------- | --------------------------------- |
| 3-5 line change within larger function            | Absorb into parent                |
| Sub-behavior of another task                      | Absorb, update parent description |
| Would require retrofitting after dependency       | Absorb into dependency            |
| Cross-cutting behavior matching existing patterns | Cancel with rationale             |

Red flags: "Add X to Y" where Y is another task's output, touches same file, blocked_by AND modifies same code, blocking task would leave obviously incomplete code without this.

Action: `adv_task_cancel` (with approval) → update parent description → redirect dependents.

#### B. TDD Ordering

Inline TDD is default. Use `metadata.tdd_intent` and a concrete `evidence_policy`:

| Value                   | Meaning                 | Evidence policy | Evidence? |
| ----------------------- | ----------------------- | --------------- | --------- |
| `inline` (or unset)     | Red/green within task   | `test` or `review` | Yes       |
| `separate_verification` | Cross-cutting test      | `test`, `review`, or `static_check` | No        |
| `not_applicable`        | Non-code (docs, config, research, approval, ops) | `source_citation`, `source_audit`, `rubric_review`, `stakeholder_acceptance`, `artifact_reference`, `static_check`, `review`, or `not_applicable` with rationale | No        |

For non-code tasks, use `evidence_policy` instead of fake TDD. See **Non-Code Deliverable Evidence Policy** above.

Anti-pattern: same-scope test task blocked_by impl task (code-first, not test-first). Fix: merge test into impl, cancel test task.

Exception: cross-cutting tests spanning multiple impl tasks → mark `separate_verification`.

#### C. Dependency Graph Coherence

| Issue                | Detection                                    | Fix               |
| -------------------- | -------------------------------------------- | ----------------- |
| Retrofit chains      | A creates code, B modifies same              | Merge B into A    |
| Orphan branches      | No dependents, no requirement                | Cancel or connect |
| False dependencies   | blocked_by but could run parallel            | Remove            |
| Missing dependencies | Modifies code another creates, no blocked_by | Add or merge      |
| Diamond dependencies | Two tasks modify same area                   | Merge or sequence |

### 3.4 Cross-Cutting Concerns

| Concern        | Check                        | Gap Template                   |
| -------------- | ---------------------------- | ------------------------------ |
| Error Handling | Failure scenarios? Recovery? | "Add error handling for X"     |
| Logging        | Audit trail? Debug info?     | "Add structured logging for X" |
| Validation     | Input/output verification?   | "Add validation for X"         |
| Security       | Auth? AuthZ? Injection?      | "Add security review for X"    |
| Performance    | Latency? N+1?                | "Add performance test for X"   |
| Caching        | Optimization opportunity?    | "Evaluate caching for X"       |
| Config         | New options needed?          | "Document config for X"        |
| Monitoring     | Health checks? Metrics?      | "Add observability for X"      |
| Persistence    | Data storage implications?   | "Define data model for X"      |
| Concurrency    | Thread safety? Races?        | "Add concurrency test for X"   |
| i18n/L10n      | Internationalization?        | "Add i18n support for X"       |
| Privacy        | Data protection? GDPR?       | "Review data handling for X"   |

Document N/A with rationale for non-applicable concerns.

### 3.5 Codebase Impact

Search codebase for key terms → compare with affected files. Flag missing files, undiscovered dependencies.

### 3.6 Cross-Spec Consistency

`adv_spec action: "search" query: <term>` → flag conflicts, terminology inconsistencies, overlapping scope.

### 3.7 Cross-Repo Routing

**Check 1:** Task routing metadata — flag MUST gap if task mentions repo but lacks `target_repo`/`target_path`.

**Check 2:** Related repos config — verify `project.json` has `related_repos` if tasks target external repos.

**Check 3:** Routing completeness — every repo in proposal has ≥1 task targeting it.

**Check 4:** Cross-project coordination metadata — when change depends on or contributes to another ADV-enabled project, ensure tasks or change metadata identify `cross_project_links` and `external_dependencies` explicitly.

**Check 5:** Advisory-only dependencies — `external_dependencies` are advisory-only dependencies. They may produce warnings, but prep MUST NOT model them as gate blockers unless the agreement explicitly requires blocking behavior.

**Check 6:** Target tool mode — planned target reads must use `snapshot-ok` ADV tools with `target_path`; planned target mutations must use `temporal-required` ADV tools and capture `target_confirmed`/`confirmationEvidence` for untrusted targets.

### 3.8 Multi-Worktree File-Overlap Scan

When 2+ worktrees are active for same project, scan for file-path intersections between current change's planned `touched_files` and peer worktrees' active changes' `touched_files`.

**How it works:**

1. Read `worktree_registry` from project workflow state (via `listWorktrees`).
2. For each peer worktree (skipping current branch), resolve its `changeId` and read `change_summaries[changeId].touched_files` from Temporal (via `getChangeSummaries`).
3. Compute the intersection with current change's planned `touched_files`.
4. Flag non-empty intersections as "potential merge conflict" warnings.
5. Archived changes are skipped (their files are already merged).

**Cross-session reliability:** Temporal serializes `touched_files` writes from peer sessions; the snapshot read by the scan is consistent at read time.

**Surfacing:** Overlaps are surfaced in the vision banner (Phase 5.1) as advisory warnings. They do NOT block the prep gate — they inform user of coordination risk before autonomous execution begins.

> **TODO:** Wire `scanFileOverlaps` from `plugin/src/validator/file-overlap.ts` into the prep validator. The validator is currently pure-sync over `Change` objects; integrating an async Temporal query requires refactoring the validator runner to accept async checks. Defer until the validator framework gains async I/O support.

---

## Phase 4: Prioritize Gaps (MoSCoW)

| Priority | Criteria                     | Action                  |
| -------- | ---------------------------- | ----------------------- |
| Must     | Without it = failure         | Blocking task           |
| Should   | Important, workarounds exist | Task                    |
| Could    | Desirable, time permitting   | Optional                |
| Won't    | Out of scope                 | Document in proposal.md |

---

## Phase 5: Contract & User Approval

### 5.1 Vision Document

Generate a compact vision banner (<30 lines) and present it **in chat only** (not stored as file). Include:

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

| Reply                    | Action                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tier A whitelist match   | Call `adv_gate_complete gateId: 'planning' userApproved: true`, then begin `/adv-apply` inline                                                   |
| `/adv-apply {change-id}` | Counts as explicit approval. The agent completes planning with `userApproved: true` and proceeds to execution inline — no second approval prompt |
| Free-form text           | Treat as revision request; collect feedback → loop back to Phase 4 (re-analyze gaps) → regenerate vision → re-prompt                             |
| `cancel` / `stop`        | Halt; do not complete prep gate                                                                                                                  |
| Ambiguous                | LLM judgment classifies into approve / revise / redirect / stop / unclear                                                                        |

**Anchor phrase:** `Reply `approve``

**Machine contract (CRITICAL):** when user replies with a Tier A whitelist word (or LLM classifies as `approve`), the agent MUST pass `userApproved: true` to `adv_gate_complete gateId: 'planning'`. The machine contract enforced by `handlePlanningGateCompletion` is independent of the UX surface — inline approval is the upstream signal source.

**× MUST NOT proceed past Phase 5 without an explicit user reply matching the Tier A whitelist, LLM-classified `approve`, or exact shown continuation command invocation.** The prep gate is the last human checkpoint before autonomous execution.

---

## Phase 6: Fix Gaps

> Anti-Loop: after contract → `>>> SYNTHESIS COMPLETE - FIXING GAPS <<<` → first tool call.

- Missing tasks → `adv_task_add` (with `blockedBy` if needed)
- Absorption/merge → `adv_task_cancel` (with user approval) → update parent → redirect dependents
- TDD ordering → cancel test task → update impl task with "TDD: write tests first"
- Missing scenarios → document the gap in proposal/problem statement, add follow-up task(s), and stop for explicit delta editing support not writing `change.json` directly
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

| Result        | Action                                 |
| ------------- | -------------------------------------- |
| Must-failures | Fix per remediation hint → re-run gate |
| Warnings only | Surface as follow-up, don't block      |
| Clean pass    | Proceed to Phase 9                     |

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

**Auto-continue:** After user approval, immediately begin `/adv-apply` inline. This is the last human checkpoint before autonomous execution — user's "approve and continue" is the go-ahead to start implementation without any further confirmation.

---

## Key Tools

| Purpose                | Tool                                                    |
| ---------------------- | ------------------------------------------------------- |
| Load change            | `adv_change_show`                                       |
| List tasks             | `adv_task_list`                                         |
| Add task               | `adv_task_add`                                          |
| Cancel tasks           | `adv_task_cancel` (requires user approval)              |
| List/show/search specs | `adv_spec`                                              |
| Validate               | `adv_change_validate`                                   |
| Planning gate          | `adv_gate_complete gateId: planning userApproved: true` |
