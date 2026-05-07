# Design

## Architecture Overview

This change narrows ADV evidence tooling by separating two responsibilities that are currently easy for agents to conflate:

1. **Run and record** — `adv_run_test` is the normal inline-TDD path. It executes the command, records exit code/output as task evidence, and writes task-run ledger events used for resumability.
2. **Attach external evidence** — `adv_task_evidence` remains a fallback attachment path for evidence produced elsewhere. It should not be framed as a normal test-running or red/green execution substitute.

The implementation uses small local evidence-write policies at existing write sites rather than adding new default diagnostic surfaces or new broad abstractions. The policy makes repeated evidence writes safe: identical writes no-op, conflicting same-phase writes require an explicit correction reason, and red-after-green cannot regress `tdd_phase` from complete to red.

A second design thread adds a value-vs-burden contract to docs/specs: ADV command docs must not prescribe normal-path tool calls unless the call provides concrete durable value such as executable proof, audit, resumability, safety, coordination, reproducibility, or recovery/debug value.

## Key Decisions

### 1. Keep `adv_run_test`; slim `adv_task_evidence`

`adv_run_test` provides heavy value: it executes the test, captures result, stores evidence, and records task-run ledger events. It stays primary.

`adv_task_evidence` provides value only when evidence already exists outside `adv_run_test` (sub-agent report, manually captured output, legacy session, cross-project/out-of-band proof). It stays available but is described as fallback/manual attachment.

### 2. Enforce idempotency at existing write sites

Evidence is written through both Temporal (`recordTaskEvidenceInChangeState`) and disk test fallback (`store-disk.recordEvidence`). Both currently overwrite `task.tdd_evidence[phase]` and recalculate phase directly.

Design: colocate small deterministic policy logic in the two existing write sites rather than creating a new shared helper too early:

- detect same task+phase existing evidence;
- compare stable evidence fields (`test_file`, `command`, `output_snippet`, `exit_code`) while ignoring `recorded_at`;
- identical evidence returns duplicate/no-op and preserves existing evidence;
- different evidence without correction reason rejects;
- different evidence with correction reason replaces evidence and preserves audit in output/notes as available.

This intentionally favors local clarity over abstraction. If implementation finds duplication growing beyond a small pure block, refactor after tests are green.

### 3. Add correction metadata only where burden earns value

Do not require a new reason for every fallback evidence call. That would add ceremony to a legitimate fallback path.

Require an explicit correction reason only when replacing different existing evidence for the same task+phase. That is the high-risk case where audit value justifies burden.

Likely tool arg:

- `correctionReason?: string`

Optional first-call source/reason may be encouraged in description, but not required unless replacing existing evidence.

### 4. Preserve phase monotonicity

Current behavior can regress phase: if red evidence is recorded after green, `tdd_phase` becomes `red`. That is misleading and violates the value goal.

New phase calculation after every evidence write or correction:

- if red and green evidence exist → `complete`
- else if green exists → `green`
- else if red exists → `red`
- else preserve current/none

Duplicate no-op preserves both evidence and phase unchanged.

### 5. Do not solve with agent blame or diagnostic context bloat

The log sample showed evidence-heavy top sessions from primary/build-style contexts, not an `adv-engineer` root cause. Do not remove capabilities from `adv-engineer` as the main fix.

Also do not add a default diagnostic context block. Logs remain queryable when investigating. Regression tests and clearer tool descriptions are enough for this change.

### 6. Encode value-vs-burden as a spec/doc rule

Add a narrow requirement to `advance-delivery` (or a better execution-governance capability if identified during implementation): prescriptive normal-path ADV tool calls must state their value category. This prevents future tools from becoming mandatory ceremony without benefit.

### 7. Explicitly reject inline-context refusal for `adv_task_evidence`

Alternative considered: detect inline-TDD context and refuse `adv_task_evidence` outright. Rejected because context detection is brittle, risks blocking legitimate externally obtained evidence during inline work, and adds another policy branch. Idempotent fallback semantics solve the observed harm (churn/overwrite/regression) while preserving valid attachment workflows.

## Implementation Strategy

1. **Tests first — evidence policy**
   - Add failing tests for identical duplicate, conflicting duplicate, correction with reason, red-after-green phase monotonicity.
   - Add tool tests for `adv_task_evidence` output shape: duplicate/no-op, rejection, correction.
   - Add Temporal `change-state` tests and disk-store tests so both paths behave consistently.

2. **Local policy implementation**
   - Update `recordTaskEvidenceInChangeState` with local pure logic; keep workflow-safe imports unchanged.
   - Update `store-disk.recordEvidence` with matching local logic.
   - Use helper functions local to each file if needed, but avoid a cross-layer helper unless duplication becomes larger than expected.

3. **Tool API and output**
   - Update `adv_task_evidence` args with `correctionReason?: string`.
   - Update description to say fallback/manual attachment only; normal executable TDD should use `adv_run_test`.
   - Return `{ success: true, duplicate: true, message: ... }` for identical duplicate.
   - Return structured error for conflicting evidence without correction reason.

4. **Phase calculation**
   - Replace direct `if phase === red then red` logic with derived phase from evidence presence.
   - Ensure red-after-green stays `complete` when both exist.

5. **Docs/specs**
   - Update `tdd-contract` with idempotency and phase-monotonicity requirements.
   - Update `advance-delivery` with value-vs-burden requirement for prescriptive tool calls and evidence command distinction.
   - Update `ADV_INSTRUCTIONS.md` and `/adv-apply` wording to emphasize value: `adv_run_test` is required because it provides executable proof + durable evidence + ledger; `adv_task_evidence` is fallback only when evidence was created elsewhere.

6. **Regression anchors**
   - Strengthen `adv-command-routing-assets.test.ts` so tool descriptions/command docs do not regress to treating `adv_task_evidence` as normal path.
   - Include `validator/completeness.ts` recommendation as a stable assertion: it should continue to prefer `adv_run_test` and limit `adv_task_evidence` to externally obtained evidence.
   - Add tests covering no new default diagnostic/context output only if a stable output surface exists; otherwise rely on absence of new context-injection code in touched files.

## LBP Analysis

The long-term best design is not fewer calls by default; it is fewer required calls that lack durable value. `adv_run_test` earns its normal-path prescription because it performs the test and creates durable state used later. `adv_task_evidence` does not execute anything and can duplicate/overwrite state, so its required-path use should be removed and its fallback use made safe.

This preserves ADV's core value — auditable, resumable, validated work — while reducing ceremony and agent confusion.

## Affected Components

- `plugin/src/tools/task.ts` — `adv_task_evidence` schema, description, correction reason handling, duplicate/conflict output.
- `plugin/src/tools/test.ts` — description wording may be strengthened to state it is the normal run+record path.
- `plugin/src/temporal/change-state.ts` — evidence write idempotency and phase calculation for Temporal state.
- `plugin/src/storage/store-disk.ts` — same behavior for disk/test fallback.
- `plugin/src/types.ts` — only if correction metadata is stored on evidence; avoid schema growth unless needed.
- `.opencode/command/adv-apply.md` and `ADV_INSTRUCTIONS.md` — clarify value justification and fallback-only behavior.
- `docs/specs/tdd-contract.md` / `.adv/specs/tdd-contract/spec.json` — new evidence idempotency and phase monotonicity requirements.
- `docs/specs/advance-delivery.md` / `.adv/specs/advance-delivery/spec.json` — value-vs-burden rule for prescriptive tool calls.
- Tests: `plugin/src/tools/task.test.ts`, `plugin/src/temporal/change-state.test.ts`, `plugin/src/storage/*test.ts`, relevant asset tests.

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Legitimate manual correction gets blocked | Allow replacement with explicit `correctionReason`; burden only applies to high-risk overwrite. |
| Schema growth adds complexity | Prefer tool arg + output semantics; store correction metadata only if necessary for audit. |
| Temporal workflow boundary violation | Keep logic local to `temporal/change-state.ts`; avoid imports from tools/storage. |
| Disk and Temporal behavior diverge | Add tests for both paths with the same cases. |
| Agents still attempt noisy fallback calls | Duplicate no-op prevents state churn; wording/asset tests reduce future prompting pressure. |
| Value-vs-burden rule becomes vague | Encode concrete categories and require docs/tests to cite them for prescriptive normal-path tool calls. |

## Validator Result

Validator: CAUTION.

Findings addressed:

- Prefer colocating idempotency/phase policy directly in `change-state.ts` and `store-disk.ts` rather than introducing a shared helper prematurely. Incorporated.
- Explicitly reject the alternative of refusing `adv_task_evidence` in detected inline-TDD contexts. Incorporated.
- Add `validator/completeness.ts` recommendation as a regression anchor. Incorporated.

No unresolved conflicts.