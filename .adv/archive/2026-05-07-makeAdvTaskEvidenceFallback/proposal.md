## Problem

Agents call `adv_task_evidence` repeatedly even though `adv_run_test` already records red/green TDD evidence. The immediate symptom is noisy evidence-tool usage, but the deeper issue is broader: ADV has accumulated prescriptive tool usage patterns that may impose tool-call, context, and workflow burden without always proving equivalent value.

The real problem to solve is not "make one tool harder to call." It is to ensure ADV tool requirements are justified by concrete value: auditability, resumability, safety, reproducibility, coordination, validation, or recovery. Prescriptive tool use that does not provide value proportional to its burden should be removed, slimmed, demoted to optional/fallback, or consolidated.

## Scope

- Inspect logs/tool-call traces/task evidence records and command/agent instructions for `adv_run_test`, `adv_task_evidence`, and nearby ADV task/evidence commands.
- Define a value-vs-burden rubric for prescriptive ADV tool usage.
- Apply that rubric to the TDD/evidence command family as the concrete first target.
- Identify which evidence-related tool calls provide heavy value and which are busywork/noise.
- Change guidance/tool descriptions/runtime behavior/specs so tools are required only where value justifies burden.
- Preserve legitimate high-value evidence flows while slimming redundant or low-value requirements.
- Avoid new default diagnostic/context output; logs can be queried when investigation is needed.

Likely affected areas: `.opencode/agents/adv.md`, `.opencode/agents/build.md`, `.opencode/command/adv-apply.md`, `ADV_INSTRUCTIONS.md`, `docs/specs/tdd-contract.md`, `docs/specs/advance-delivery.md`, `plugin/src/tools/task.ts`, `plugin/src/tools/test.ts`, storage/Temporal evidence helpers, and related tests.

## Success Criteria

- We can explain, with evidence from logs/traces/current state, why agents over-call `adv_task_evidence`.
- We define a durable value-vs-burden rubric for prescriptive ADV tool usage.
- Each retained required evidence/tool call has an explicit value justification.
- Evidence-related tool calls without proportional value are removed from the required path, demoted to optional/fallback, or consolidated.
- Normal inline TDD has a low-friction path and does not require redundant evidence calls.
- Legitimate fallback/manual evidence remains possible where it provides audit/recovery value.
- Duplicate or repeated evidence calls are handled predictably: no silent confusing overwrites.
- Role/tool guidance matches observed reality; do not restrict a specific agent without evidence it caused the burden.
- No new default context/token-bloating diagnostic output is added.
- Regression tests protect against returning to noisy/burdensome evidence behavior.

## Out of Scope

- Removing ADV evidence tracking entirely without replacing the value it provides.
- A repo-wide audit of every ADV tool in this change; this change applies the rubric concretely to TDD/evidence tools.
- Redesigning the full durable task-run ledger unless discovery shows it is required.
- Changing archive, conformance, or gate sequencing behavior.
- Optimizing for fewer tool calls at the expense of useful auditability, resumability, or recovery.

## Discovery Findings

### Evidence Summary

- OpenCode DB aggregate: `adv_task_evidence` appeared 1,558 times vs `adv_run_test` 1,943 times.
- Top evidence-heavy sessions had 81–90 `adv_task_evidence` calls, often with zero `adv_run_test`; session titles/directories indicate primary ADV/build-style sessions across multiple projects, not `adv-engineer` as the identified cause.
- 74 task+phase pairs had duplicate `adv_task_evidence` calls; max duplicate count was 4.
- `makeAdvContextEmissionSingle` shows out-of-order fallback recording can leave misleading state: green evidence existed, later red evidence moved `tdd_phase` back to `red` on otherwise completed tasks.
- `fixSyncGlobalShProviderPrompt` shows clean normal behavior: primary implementation task records red/green via `adv_run_test`, with no need for extra fallback calls.

### Current State

- `tdd-contract/rq-TDD008path` already names `adv_run_test` as primary and `adv_task_evidence` as fallback.
- `advance-delivery/rq-ADVEXEC01` requires fallback framing in `/adv-apply`.
- `adv_task_evidence` tool description still says simply "Record TDD evidence...", which reads like a normal primary path.
- Evidence storage overwrites `task.tdd_evidence[phase]`; repeated calls can silently replace earlier evidence.
- `adv_run_test` records evidence and task-run ledger events; `adv_task_evidence` does not provide the same run lifecycle semantics.
- ADV has multiple prescriptive tool-use requirements; this change establishes that such requirements must earn their burden.

### Value-vs-Burden Rubric

A prescriptive ADV tool call is justified only when it provides at least one heavy value: executable proof, durable audit, resumability, safety boundary, coordination, reproducibility, or recovery/debug value.

Burden signals: extra tool calls without new state/proof, repeating data already captured by another tool, default context-token bloat, overlapping tools causing agent confusion, mutations that overwrite/regress state, or ceremony with little recovery/debug value.

Decision rule: if burden is high and value is not durable or unique, demote/remove/consolidate. If value is high, keep but make the path low-friction and idempotent.

### Edge Cases

| Gap | Failure mode |
|---|---|
| Duplicate same-phase evidence | Identical retry should no-op; different same-phase evidence should require explicit correction reason. |
| Out-of-order evidence | Red after green must not regress `tdd_phase` for a task that already has complete evidence. |
| Historical/manual evidence | Older/external test output may need attachment; fallback path must remain possible. |
| Cross-project evidence | `target_path` paths must keep working. |
| Over-restriction | Removing capabilities from the wrong agent does not solve top-level overuse and may add friction. |
| Over-prescription | Required tool calls that only restate already-captured state should be demoted or removed. |

### Draft Spec Deltas

- `rq-TDD009idem` — TDD evidence recording is idempotent per task+phase.
- `rq-TDD010phase` — fallback evidence cannot regress task TDD phase.
- `rq-ADVEXEC04` — ADV command guidance distinguishes run-and-record from attach-external-evidence.
- `rq-ADVEXEC05` — Prescriptive ADV tool-use requirements must state value justification.

### LBP Check

Best long-term design is explicit separation of responsibilities plus value-based tool governance: `adv_run_test` runs and records with ledger semantics; `adv_task_evidence` attaches externally obtained evidence when it adds unique audit/recovery value; runtime writes are idempotent; command docs avoid prescriptive tool calls without value justification; logs remain queryable without default context bloat.

No external solution applies.

### AMBIGUITY ANALYSIS

No blocking ambiguity findings.

Coverage: B:C F:C S:C M:C D:N/A X:N/A Q:C I:C E:P C:C T:N/A
