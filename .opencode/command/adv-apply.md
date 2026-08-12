---
name: adv-apply
description: "Implement change with TDD, retry on failure, and final verification"
phaseGoal: "Execute the approved plan autonomously. Add discovered tasks within scope. Escalate only on failure."
---

# ADV Apply — Produce Deliverables with Task-Appropriate Proof and Retry

Implement an ADV change using TDD. Produce agreed deliverables and pursue every task to completion.

## Task Completion Policy

| Exit             | Condition                                               |
| ---------------- | ------------------------------------------------------- |
| Done             | Implementation verified, tests pass                     |
| Doom Loop        | 3 genuine fix attempts failed with documented diagnosis |
| Environmental    | Missing external dependency → escalate immediately      |

Cross-repo tasks: respect `scope_repos`; record `origin_repo_id`, `origin_repo_project_id`, `origin_repo_path`, `product_id`. Cancellation: use `adv_task_cancel` with explicit user approval. `adv_task_update status: cancelled` is rejected.

| × Bad | ✓ Good |
|-------|--------|
| Skip or defer without retry | Apply retry protocol |
| Complete later if hard | Complete now or exhaust retries |
| "This targets another repo" | Switch `workdir` and execute |
| `adv_task_update status: cancelled` | `adv_task_cancel` with user approval |

<UserRequest>
$ARGUMENTS
</UserRequest>

## Target Resolution

1. If change-id provided → use directly
2. If empty → `adv_change_list` → confirm/select via `question` tool
3. If none → suggest `/adv-proposal`

## Gate Prerequisite Check

`adv_gate_status changeId: {change-id}`

- Discovery/design/planning incomplete → stop and require pre-implementation workflow
- All pre-implementation stages complete → proceed to Phase 0

× `/adv-apply` MUST NOT complete discovery, design, or planning gates.

## Phase 0: Embedded Methodology

### Apply Methodology

Provides the TDD work loop, retry protocol, context freshness, and completion criteria. Canonical sources:
- `ADV_INSTRUCTIONS.md § Context Freshness`
- `ADV_INSTRUCTIONS.md § TDD Protocol (RSTC)`
- `ADV_INSTRUCTIONS.md § Doom Loop Detection`
- `docs/apply-subagent-packets.md` for sub-agent packet templates

`adv_run_test phase` is descriptive metadata, not gate enforcement. Use `passed`, `classification`, `exitCode` as evidence. Inline TDD completions include `lastRedRunId` and `lastGreenRunId` from `adv_run_test` calls. When a task's `evidence_plan` selects a non-test route, record `proof_target`, bounded rationale, and `review_conclusion` before completion.

### Scope Expansion During Execution

If new objectives/AC emerge, do NOT silently fold them into the current task graph. Follow `docs/scope-discovery-protocol.md`:
1. Campsite-eligible (P23) → apply inline
2. Otherwise → Tier A prompt: `reenter {gate}`, `split` (fast-follow child), `keep`, `cancel`
3. After reentry with `adv_change_reenter`, walk reopened gates, then resume `/adv-apply` — new tasks will be available alongside existing completed work.

### Finding Routing

Out-of-scope findings surfaced mid-lifecycle MUST be routed to a durable backlog-status change with `adv_change_create status: "backlog"` — not reflexive active-change creation, not prose-only notes. Route the finding, then continue the current task.

## Phase 0.1: Worktree Isolation

If `adv_worktree_create` unavailable → `[ADV:BLOCKED] Worktree tools required`.

`git worktree list --porcelain` → find `change/{change-id}`:
- Exists → reuse, switch `workdir`
- Missing → `git worktree prune` then create

Create: `adv_worktree_create branch: "change/{change-id}"`. Capture path; use it for ALL subsequent calls. To delete later, first call `adv_worktree_delete branch: "change/{change-id}" dryRun: true`, retain the exact returned `planToken`, then apply with that token and nonblank approval evidence. A branch-only destructive call returns `PLAN_REQUIRED`.

Post-creation: verify task-referenced paths exist in worktree. Distinguish read-reference from create-target paths. For MISSING read-reference: discover with `glob`/`bash`; if essential and absent, check main checkout and note discrepancy. Emit: `Path verification: {N} OK, {M} corrected, {K} advisory-skipped, {L} to-create`.

Multi-change switch: find/create worktree for change B, switch `workdir`, resume.

## Phase 0.2: Overlap Warning (Conditional)

Check `adv_change_list` for active changes. Compare affected files.

- 3+ changes touching same file → `COORDINATION REQUIRED`, **halt**
- 2 changes touching same file → advisory warning
- No overlap → proceed

## Phase 0.5: Pre-Execution Rebase (per-worktree)

Run `preExecutionRebase` from `apply-helpers/pre-rebase.ts` against worktree.

Outcomes: `up_to_date` / `rebased` → proceed; `conflict` / `no_remote` / `default_branch_unresolvable` / `not_a_worktree` / `rebase_failed` → halt and surface.

× Local-only, no push. Requires clean worktree.

---

## Cross-Repo Execution

Tasks may target other repositories. See `ADV_INSTRUCTIONS.md § Cross-Repo Execution`.

1. Detect: `target_repo`/`target_path` or path hints
2. Resolve: `related_repos` config or `target_path`; confirm if ambiguous
3. Execute: switch `workdir` → TDD workflow → switch back

× Prohibited cancellation reasons: "out of scope", "different repository", "cannot modify external code", "backend/API changes needed", "would need database changes".

## Cross-Project Coordination

When task contributes to another ADV-enabled project, use ADV tools with explicit `target_path`.

| Operation | Required behavior |
| --- | --- |
| Target reads | `adv_change_show`, task/gate/status reads with `target_path`; inspect `_projectContext` |
| Target mutations | `authoritative` tools with `target_path`; fail closed if unavailable |
| Untrusted target mutations | `target_confirmed: true` + `confirmationEvidence` |

`cross_project_links` records provenance. `external_dependencies` are advisory.

---

## Cancellation Policy (Inline — Tier B)

All cancellations require explicit user approval via `adv_task_cancel`. Irreversible. Strict regex parsing per `docs/command-voice-standard.md`.

Collect reasons per task. Emit numbered list:

```
Cancellation requested:
1. {tk-id} — "{title}" — Reason: {reason}

Reply EXACTLY one of:
- approve all
- reject all
- keep N (or keep N,M)
- cancel N (or cancel N,M)
- stop / abort
```

Parse reply (no LLM fallback):

| Pattern | Action |
|---|---|
| `^approve all$` | Cancel all |
| `^reject all$` | Keep all |
| `^keep ([\d,\s]+)$` | Cancel inverse |
| `^cancel ([\d,\s]+)$` | Cancel listed |
| `^(stop\|abort)$` | Halt; cancel nothing |
| Else | Re-prompt |

Anchor: `approve all`. On approval: `adv_task_checkpoint mode: 'cancel'` then `adv_task_cancel approvedByUser: true`.

× Do NOT use `question` tool for cancellation.

---

## Phase 1: Load Change Context

Single phase-start call:

```
adv_change_show changeId: <target> include: { ledger: true, snapshot: true, readyTasks: true, briefingPacket: true }
```

Returns tasks, `_contextSnapshot`, `_ledger`, `_readyTasks`, `_readyTasksMeta`, `_briefingPacket`. Fallback to legacy trio only if a specific call needs more than the included slice.

## Phase 1.5: Prep Gate Approval Verification

- Prep gate complete with `userApproved` → proceed immediately
- Prep gate complete without `userApproved` → advisory, ask via `question`
- Planning gate pending → complete planning with `adv_gate_complete changeId: {change-id} gateId: planning userApproved: true`; `/adv-apply {change-id}` counts as approval
- Prep gate not complete (and not planning pending) → stop; require `/adv-prep`

× MUST NOT ask "Begin work?" when prep has `userApproved`.

## Phase 2: Display Contract

Emit: `Working on: {change-id}`. State visible via `adv_change_show include.snapshot:true`.

Proceed directly to Phase 3. Execution-start approval is not a sanctioned checkpoint.

---

## Retry Protocol

| Type | Examples | Action |
|---|---|---|
| SEMANTIC | Type errors, test failures | Diagnose → fix → retry (3×) |
| TRANSIENT | Timeout, flaky test | Wait 5s → retry once |
| ENVIRONMENTAL | Missing dep, config | Escalate immediately |

Before any SEMANTIC fix, emit:

```
[ADV:BLOCKED] RETRY {n}/3
DIAGNOSIS: {root cause}
FIX: {planned approach}
```

Each attempt must differ. After each failed attempt: `adv_task_update` with `error_recovery` payload.

Budget exhaustion: emit banner with 3 attempts, classify SEMANTIC/KNOWLEDGE/ENVIRONMENTAL. Ask via `question`: Provide hint, Take over task, Void contract. × "Skip task" is NOT an option.

### AC5 Delegation-Recovery Inline Diagnosis

When same-scope delegation is blocked because of exhausted empty/malformed recovery (`delegation_recovery.narrower_retry_count > 0` and `inline_diagnosis_evidence: false`), do **not** re-delegate to the same agent/scope. Clear the block only by recording typed inline diagnosis evidence:

```
adv_task_update
  taskId: <task-id>
  status: in_progress
  error_recovery: {
    error_class: "SEMANTIC",
    attempts: [{
      attempt_number: <n>,
      error: "<concise failure>",
      diagnosis: "<root cause>",
      fix_tried: "<approach>",
      outcome: "failed",
      attempted_at: "<ISO8601>"
    }]
  }
```

A valid `adv_subagent_report_submit` retry after a single empty/malformed incident resolves the recovery state to clean; it does **not** record inline diagnosis evidence. Malformed/empty worker output stays in `delegation_recovery`, never in `error_recovery.attempts`.

---

## Phase 3: TDD Work Loop

### Context Freshness (MANDATORY)

Two tiers:
- **Phase start:** `adv_change_show` → full context + `epic_membership` and EPIC CONTEXT from the briefing packet
- **Per task:** `adv_task_show` → task details; `adv_wisdom_list` → learnings

× Do NOT call `adv_change_show` before every task.

### Worktree Context for Sub-Agents

Include `WORKING DIRECTORY: {workdir}` in every sub-agent prompt. Detect via `pwd`.

### TodoWrite Rules

TodoWrite is a projection over ADV tasks. Copy `_todoProjection` rows from `adv_task_ready` or `adv_change_show include.readyTasks:true`. Unknown `tk-*` IDs, other-change IDs, and premature `completed` are blocked during top-level ADV execution; subagent scratchpads remain allowed.

### Ops Runbook Execution

For `ops` tasks or contract refs requiring production ops evidence, use `adv_ops_run_upsert` with env, action, bounds, evidence policy, rollback plan, and execute step approval. Runs are either `bounded_low_risk_autonomous` or `approval_required`. Append evidence with `adv_ops_run_evidence_add`. Missing approval/evidence → keep task `in_progress`, surface blocker.

### Anti-Patterns (PROHIBITED)

| × Anti-Pattern | ✓ Correct |
|---|---|---|
| Skip or defer without retry | Apply retry protocol |
| Assume manual work is needed | Try 3 times first |
| "I'm not sure how to proceed" | Research, diagnose, attempt |
| Offer to skip | Never offer skip |
| Mark flaky tests done without fixing | Fix or document as environmental |
| Mark blocked after 1 try | Attempt 3 distinct fixes |
| "This targets another repo" | Switch workdir and execute |
| Shell-authored test files | Use `edit`/`write`/`morph_edit` |
| Silent fold of non-campsite scope | Use scope-discovery protocol |
| "We'll handle this later" | Surface via scope-discovery protocol |
| Quietly trim planned task | Use scope-discovery protocol |

`adv_run_test` for ordinary inline red/green. Durable proof recorded on `taskCompletedSignal.verification`.

### Delegation Routing

Evaluate before TDD:

| Priority | Check | Result |
|---|---|---|
| 1 | `metadata.delegation_hint` | Use directly |
| 2 | `tdd_intent == "not_applicable"` or trivial title | `delegate_allowed` to `adv-engineer` |
| 3 | Risk signals: multi-file, cross-repo, architecture, failing-test diagnosis, behavioral-authority diagnosis | Any present → `inline_required` |
| 4.5 | Context-shed test passes? (4-question AND, floor ~5 files or ~50 lines) | `delegate_allowed` to `adv-engineer` |
| 5 | Default | `inline_required` |

`metadata.frontend == "true"` is structural classification. Classified UI/component implementation is engineer-first: it starts with `adv-engineer` when delegated, or inline when risk forces inline. After successful same-cycle implementation, ADV dispatches a matching-cycle `adv-designer` follow-up with its `IMPLEMENTATION_RECEIPT`. Priority 1 (`metadata.delegation_hint`) remains the explicit user override; it cannot select `adv-designer` as initial implementation for a classified frontend task. Step 4 risk signals still force inline. Step 4.5 does not override Step 1 or Step 4.

`adv-designer` remediates in scope (UI/a11y/polish fixes, then verifies) — it is **not** review-only; review/harden ownership remains with `adv-reviewer`.

Hint semantics: `inline_required` → never delegate; `delegate_allowed` → delegate unless risk signals; `delegate_preferred` → delegate unless precondition blocks.

**Verify-burst delegation:** Heavy verification (output >200 lines, >30s, combined lint/typecheck/tests) may use `adv-verifier`. Inline for focused `adv_run_test`. Packet templates in `docs/apply-subagent-packets.md`.

**If `inline_required`:** standard TDD flow.

Emit routing summary: `tk-{id} → {inline|adv-engineer|adv-designer|adv-verifier|general} ({reason})`

#### Verify-Burst Delegation

Task-level delegation covers implementation. Heavy verification bursts — full lint, project-wide typecheck, broad test suites — are candidates for `adv-verifier` even during inline work. Use general unavailable-runtime fallback only if `adv-verifier` cannot be spawned.

When to delegate: output expected >200 lines, runtime >30s, combined lint/typecheck/tests, or timeout isolation needed.
When to keep inline: focused `adv_run_test` red/green, single-file lint, short expected output.

#### Verification Triage Packet

Spawn adv-verifier via subagent_type: "adv-verifier"; general unavailable-runtime fallback only.

```
WORKING DIRECTORY: {workdir}
CHANGE: {change-id} | {title}
SCOPE KEY: verifier:{local-verify|ci-check|short-slug}
PHASE: local_verify | ci_check
ATTEMPT: {attempt-number, starting at 1}
TASK_SCOPE: verify-only — command/check identity, bounded evidence, classification, recommendation
IN_SCOPE:
  - local command failures and CI/check-run failures already observed by main ADV
OUT_OF_SCOPE:
  - code edits, ADV state mutation, gate completion, scope changes, final user-facing conclusions
DONE_WHEN:
  - return one strict Verification Triage Result JSON object
STOP_WHEN:
  - missing command/check evidence, unsafe credential exposure, or insufficient identity for stale-safe CI evidence
VERIFICATION:
  - cite command output, logs, check metadata, or test evidence
COMMANDS:
  - {cmd 1}
  - {cmd 2}
CI CHECKS (when PHASE=ci_check):
  - repo: {owner/repo}
  - check_name: {check or job name}
  - head_sha: {commit SHA}
  - run_url: {optional URL}
RULES:
  - Do not edit files.
  - Do not call adv_subagent_report_submit.
  - Do not complete gates, mutate ADV state, change scope, or publish final conclusions.
```

#### Verification Triage Result

Strict JSON returned by the verify worker; main ADV wraps with `schema_version: "1.0"`, `change_id`, `attempt`, `workdir_used`, and `scope: { kind: "change", scope_key: "verifier:<slug>" }` before submitting `adv-verification-triage-bundle`.

```json
{
  "agent": "adv-verification-triage-bundle",
  "phase": "local_verify | ci_check",
  "targets": [
    { "kind": "command", "command": "exact command", "exit_code": 1, "duration_ms": 1234 },
    { "kind": "ci_check", "repo": "owner/repo", "check_name": "test", "head_sha": "0123456789abcdef0123456789abcdef01234567", "run_url": "https://...", "conclusion": "failure" }
  ],
  "status": "pass | fail | inconclusive",
  "error_class": "SEMANTIC | TRANSIENT | ENVIRONMENTAL | FATAL | UNKNOWN",
  "confidence": "high | medium | low",
  "evidence_basis": "bounded source-backed reason",
  "findings": [{ "id": "...", "severity": "blocker|issue|suggestion|info", "summary": "...", "evidence": [{ "label": "test output", "locator": "command/check/log URL", "summary": "bounded excerpt or cited signal" }] }],
  "recommended_next_action": "continue | retry_narrower | route_adv_engineer | ask_user | block_environment | wait_ci | no_action",
  "scope_risk": false,
  "suggested_handoff": { "summary": "...", "in_scope": [], "out_of_scope": [], "done_when": [], "verification": [] },
  "failure_attribution": {
    "assertion": "exact failed assertion text or expectation",
    "test_locator": { "label": "test", "locator": "file:line or test name", "summary": "bounded test location" },
    "production_locator": { "label": "production", "locator": "file:line", "summary": "bounded production location" },
    "branch_result": "pass | fail | inconclusive | not_run",
    "base_result": "pass | fail | inconclusive | not_run",
    "comparison_status": "compared_clean | base_failed_branch_fail | base_unavailable | not_compared",
    "failure_mode": "assertion_mismatch | exception | timeout | missing_coverage | contract_conflict | order_sensitive | unknown",
    "owner_task": "tk-...",
    "evidence_refs": [{ "label": "...", "locator": "...", "summary": "..." }]
  },
  "required_main_agent_actions": [],
  "follow_ups": []
}
```

#### Apply Context Packet

Spawn `adv-engineer` for delegated implementation tasks.

```
WORKING DIRECTORY: {workdir}
CHANGE: {change-id} | {title}
TASK: {task-id} | {task-title} | type: {type} | tdd_intent: {intent}
ATTEMPT: {attempt-number, starting at 1}
TASK_SCOPE: {one-line implementation objective}
IN_SCOPE:
  - {owned files/findings/contract refs for this task}
OUT_OF_SCOPE:
  - {boundaries, DONT/OOS refs, unrelated subsystems}
DONE_WHEN:
  - {task acceptance condition}
STOP_WHEN:
  - contract/security/release blocker, unsafe edit, or impossible verification
VERIFICATION:
  required_when_possible:
    - {task-specific test/lint/typecheck command}
  optional_additional_checks: true
BRIEFING PACKET: inject generated `_briefingPacket` (lane: engineer) with identity, scope, contract, tasks, affected files, verification expectations, EPIC CONTEXT, durable facts, unavailable state
PROJECT STRUCTURE: {brief ls or glob output showing relevant directories/files in workdir}
DESIGN EXCERPT: {relevant section if task references design}
EXPECTED OUTPUT: implement the task, run tests, then call adv_subagent_report_submit with ENGINEER_REPORT per .opencode/agents/adv-engineer.md; use evidence_binding_version: typed-v1 and bind every verification row's test_run_id to the same-task runId returned by adv_run_test
```

#### Designer Apply Context Packet

Mandatory follow-up after a successful same-cycle `adv-engineer` report or classified inline implementation for `metadata.frontend == "true"`. `adv-designer` remediates in scope; review/harden ownership stays with `adv-reviewer`.

```
WORKING DIRECTORY: {workdir}
CHANGE: {change-id} | {title}
TASK: {task-id} | {task-title} | type: {type} | tdd_intent: {intent}
ATTEMPT: {attempt-number, starting at 1}
IMPLEMENTATION_RECEIPT:
  implementation_cycle_id: {active cycle id}
  provenance: {engineer_report:{stable report key} | inline:{baseline head SHA, diff reference}}
  validation: {successful same-task/same-cycle implementation evidence}
TASK_SCOPE: {one-line frontend/component objective}
IN_SCOPE:
  - {owned UI/component files/findings for this task}
OUT_OF_SCOPE:
  - backend logic, storage, APIs, persistence/state-store changes to the change record, business rules, unrelated subsystems, review/harden
DONE_WHEN:
  - {task acceptance condition; UI verified}
STOP_WHEN:
  - contract/security/release blocker, unsafe edit, impossible verification, or BACKEND BOUNDARY hit
VERIFICATION:
  required_when_possible:
    - {task-specific component/lint/typecheck/a11y command}
  optional_additional_checks: true
BRIEFING PACKET: inject generated `_briefingPacket` (lane: designer) with identity, scope, contract, tasks, affected files, verification expectations, EPIC CONTEXT, durable facts, unavailable state
VISUAL_CONTEXT:
  surface_type: {tool | dashboard | form | docs | marketing | component | unknown | unavailable: reason}
  existing_patterns:
    - {relevant primitives/components/layout patterns, or unavailable: reason}
  tokens_and_style_rules:
    - {known design tokens/style constraints, or unavailable: reason}
  viewport_targets:
    - {viewport/breakpoint expectations, or unavailable: reason}
  forbidden_patterns:
    - {agreement avoidances, project avoidances, and design anti-patterns}
  evidence_expectation: {browser/design proof with exact affected route/state, post-hydration readiness, and viewport context, or fallback rationale when unavailable}
DESIGN QUALITY BAR: component correctness, semantic HTML/accessibility, responsive behavior, visual polish, matching site design, finer details
NEIGHBORING RECOMMENDATIONS: finish owned UI scope if safe; surface adjacent UI inconsistencies via DESIGNER_REPORT.neighboring_recommendations[] and required_main_agent_actions
BACKEND BOUNDARY: if the UI task requires changing storage, APIs, persistence/state-store changes to the change record, or business logic, stop and report. Populate scope_drift.recommendation: "stop_and_report" and required_main_agent_actions with a handoff to `adv-engineer`. Do NOT edit backend files.
PROJECT STRUCTURE: {brief ls or glob output showing relevant directories/files in workdir}
DESIGN EXCERPT: {relevant section if task references design}
EXPECTED OUTPUT: implement the UI/component task, run tests, then call adv_subagent_report_submit with DESIGNER_REPORT per .opencode/agents/adv-designer.md; use evidence_binding_version: typed-v1 and bind every verification row's test_run_id to the same-task runId returned by adv_run_test
```

The active cycle is bound in the designer report under `apply_context.implementation_cycle_id`, not as a top-level key:

```json
"apply_context": {
  "implementation_cycle_id": "ic_<active-cycle-id>",
  "implementation_provenance": {
    "kind": "engineer_report",
    "report_key": "<stable engineer report key>"
  }
}
```

`implementation_provenance.kind` may be `engineer`, `engineer_report`, or `inline`. A top-level `implementation_cycle_id` is rejected by the strict schema.

### Task Flow

For each ready task from `adv_task_ready`:

1. **Start:** `adv_task_show` + `adv_wisdom_list` → `adv_task_update status: "in_progress"`
2. **Route:** Evaluate delegation. If delegated and verified → skip to complete.
3. **Clean baseline:** `git status --porcelain` clean; capture `baselineHeadSha` and `baselineBranch`.
4. **Red:** Failing test with `edit`/`write`/`morph_edit` → `adv_run_test phase:'red'`.
5. **Green:** Implement → `adv_run_test phase:'green'`. If fails: retry protocol.
6. **Verify (optional):** `adv_run_test phase:'verify'` when distinct from green.
7. **Incremental verification:** After each task run build/tests/lint for scope. Must pass before checkpoint.
8. **Checkpoint:** `adv_task_checkpoint` with `taskId`, `workdir`, `changeId`, `expectedBranch`, `expectedHeadSha`, `verification`. If `checkpointRecorded:true` → done. If `failed` SEMANTIC → retry; ENVIRONMENTAL → escalate; TRANSIENT → surface as SEMANTIC/ENVIRONMENTAL.
9. **Post-delegation P23 scan:** Diff sub-agent touched files; check same-pattern local issues. Fix small/safe/local; document broader scope in `follow_ups`.
10. **Complete:** assert `checkpointRecorded:true`; do NOT call `adv_task_update status: "done"`.
11. **Loop:** `adv_task_ready` → if ready tasks remain, repeat.

You MUST continue to the next ready task without pausing. Auto-continue is mandatory.

#### Allowed exit conditions

1. Ready queue empty → Phase 5
2. Doom-loop (3 failed SEMANTIC retries) → `[ADV:BLOCKED]` + `question`
3. ENVIRONMENTAL blocker → escalate
4. User-requested cancellation → `adv_task_cancel` flow
5. Scope expansion requiring reentry → `adv_change_reenter`
6. Checkpoint failure with ENVIRONMENTAL or unresolved SEMANTIC → escalate

#### Invalid stop reasons

- "Task complete" / "Section complete" / "Phase complete"
- "Progress update" / "Status report" / "Let me summarize"
- Asking whether to continue
- "Good stopping point"

---

## Phase 4: Progress Tracking

Task state visible via `adv_task_list`. Use `include.snapshot:true` on mutation tools or `adv_change_show include.snapshot:true` to request `_contextSnapshot`. TodoWrite projection is exempt.

## Phase 5: Global Final Loop

Before handoff: run full build + all tests + lint + type check. If fail → retry protocol → continue until pass or budget exhausted.

## Phase 6: Completion

### Pre-Completion Checklist

Verify: all tasks done or properly cancelled, no skipped/deferred tasks, all trivial skips have rationale, touched-scope quality/test obligations met.

### Cancelled Task Verification

If cancelled tasks exist → verify each has `cancellation.approved_by_user: true`. If any lack approval → ask via `question`.

### Final Validation

`adv_change_show changeId: <target> validate: true` → must pass.

### Mark Gate

`adv_gate_complete changeId: {change-id} gateId: execution`

### Handoff

Use Gate Handoff Voice spine (`docs/command-voice-standard.md`):

```
## Problem
{One-line restatement}

## Chosen direction
What was built and how it was verified.

## Delivered
- {completed}/{total} tasks done
- Build, tests, lint pass
- {Completion mode}
- {Cancelled tasks with reasons}

---

> **{change-id}**
> execution ✓ → acceptance
>
> → `/adv-review {change-id}`
```

---

## Trivial Tasks

For `metadata.tdd_intent: "not_applicable"` (docs, config, non-code): skip Red/Green, verify manually, include rationale in status.

---

## Key Principle

All state lives in ADV tools. Contract banners are views, not source of truth.

| State | Tool |
|---|---|
| Task status | `adv_task_update` |
| Task list | `adv_task_list` |
| Ready tasks | `adv_task_ready` |
| Change data | `adv_change_show` |
| Validation | `adv_change_show validate: true` |
