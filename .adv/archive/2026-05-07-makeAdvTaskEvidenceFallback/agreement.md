# Agreement

## Objectives

1. Establish a value-vs-burden rubric for prescriptive ADV evidence/tool usage.
2. Apply the rubric to TDD/evidence tools as the first concrete case.
3. Slim or demote redundant `adv_task_evidence` usage that does not add durable value beyond `adv_run_test`.
4. Preserve high-value evidence paths for auditability, resumability, validation, recovery, and external/manual evidence attachment.
5. Make repeated/out-of-order evidence calls safe and non-confusing.
6. Avoid new default diagnostic/context output; logs remain queryable when investigation is needed.

## Acceptance Criteria

1. Prescriptive ADV evidence/tool calls have explicit value justification.
2. Normal TDD path uses minimum high-value calls only.
3. Redundant `adv_task_evidence` calls are removed from the required path, demoted to fallback/optional use, or made duplicate/no-op.
4. `adv_task_evidence` remains available only when it adds unique audit/recovery value, such as attaching externally obtained/manual evidence.
5. Duplicate/out-of-order evidence cannot silently overwrite useful evidence or regress `tdd_phase` state.
6. No new default context-token diagnostic bloat is added.
7. Specs/docs/tests encode the value-vs-burden rule for future ADV tool prescriptions.
8. The fix does not target or restrict an agent unless evidence shows that role caused the burden.

## Constraints

- Do not remove ADV evidence tracking entirely without replacing the value it provides.
- Do not optimize for fewer tool calls at the expense of auditability, safety, resumability, reproducibility, or recovery.
- Do not add default prompt/context diagnostic summaries for evidence logs.
- Preserve cross-project and external/manual evidence workflows when they add unique value.

## Avoidances

- Avoid blaming `adv-engineer` or removing its capabilities without evidence.
- Avoid adding another mandatory ceremony layer.
- Avoid broad ADV-wide tool austerity in this change; apply the rubric concretely to evidence/TDD tools and leave broader audits as follow-ups if warranted.

## Decisions

### User Decisions

- The core issue is prescriptive ADV tool usage without proven value, not simply `adv_task_evidence` misuse.
- Burdensome tool usage must provide equally heavy value.
- Do not add context-token-bloating diagnostics; logs can be queried when needed.
- `adv-engineer` was not the identified problem and should not be targeted as the main fix.

### Agent Decisions (LBP)

- Treat `adv_run_test` as the high-value normal path because it runs the command, records output/exit code, and contributes to ledger semantics.
- Treat `adv_task_evidence` as fallback attachment for externally obtained/manual evidence where it adds unique audit/recovery value.
- Make evidence writes idempotent/correction-aware so repeated calls are safe by default.
- Add a value-vs-burden spec/doc anchor so future prescriptive tool requirements must justify themselves.

## Deferred Questions

None.

## Investment Snapshot

Investment: 0 tasks / 0 retries / tier: auto.

## Sign-Off

User approved acceptance criteria with reply: `approve`.