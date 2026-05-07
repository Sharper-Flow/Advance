# Archive: Make adv_task_evidence fallback-only and idempotent

**Change ID:** makeAdvTaskEvidenceFallback
**Archived:** 2026-05-03T23:56:45.769Z
**Created:** 2026-05-03T22:20:33.176Z

## Tasks Completed

- ✅ Implement evidence write idempotency and phase monotonicity in Temporal and disk state paths

Affected files: `plugin/src/temporal/change-state.ts`, `plugin/src/temporal/change-state.test.ts`, `plugin/src/storage/store-disk.ts`, relevant storage tests.

Purpose/value: safety + durable audit. Prevent repeated fallback evidence writes from silently overwriting useful evidence or regressing `tdd_phase`.

RED: Add failing tests for identical duplicate evidence, conflicting same-phase evidence without correction reason, correction with reason, and red-after-green preserving `tdd_phase: complete` in both Temporal and disk paths.

GREEN: Implement small local deterministic policy at existing evidence write sites. Compare stable evidence fields while ignoring `recorded_at`; identical duplicate no-ops; conflicting duplicate rejects unless correction reason is present; derive phase from evidence presence (`red+green => complete`).

Acceptance: AC3, AC5. No new default diagnostic output.
  > Implemented local deterministic evidence write policy for Temporal and disk paths: identical same-phase fallback evidence is idempotent, conflicting evidence requires correctionReason, correction overwrites intentionally, and tdd_phase derives from red/green presence so complete does not regress after red correction.
- ✅ Update `adv_task_evidence` tool API, descriptions, and outputs for fallback/correction semantics

Affected files: `plugin/src/tools/task.ts`, `plugin/src/tools/task.test.ts`, `plugin/src/tools/target-mutation-tools.test.ts` if cross-project cases need update.

Purpose/value: reduce tool confusion while preserving recovery/audit attachment path.

RED: Add failing tool tests showing: description includes fallback/manual wording; duplicate evidence returns `duplicate: true`; conflicting evidence without `correctionReason` returns structured error; conflicting evidence with `correctionReason` records correction; target_path behavior remains supported.

GREEN: Add optional `correctionReason` arg, pass it to the evidence write policy, update output messages, and keep existing exit-code validation. Do not require reason for first fallback evidence call.

Acceptance: AC2, AC3, AC4, AC5.
  > Updated adv_task_evidence as fallback/manual attachment: description names adv_run_test as normal path, correctionReason is accepted for conflicting same-phase evidence, duplicate/corrected metadata returns in outputs, conflicting writes return structured errors, and adv_run_test adapts to the new evidence-record result shape.
- ✅ Update ADV command guidance and specs with value-vs-burden rule and evidence command distinction

Affected files: `ADV_INSTRUCTIONS.md`, `.opencode/command/adv-apply.md`, `docs/specs/tdd-contract.md`, `.adv/specs/tdd-contract/spec.json`, `docs/specs/advance-delivery.md`, `.adv/specs/advance-delivery/spec.json`, `SETUP.md` if tool table wording needs update.

Purpose/value: prevent future prescriptive ADV tool calls from becoming ceremony without durable value.

RED: Add/adjust asset tests that fail when `adv_task_evidence` is described as normal path, when `adv_run_test` value justification is absent, or when prescriptive tool-use guidance lacks value categories.

GREEN: Add `rq-TDD009idem`, `rq-TDD010phase`, `rq-ADVEXEC04`, and `rq-ADVEXEC05` spec deltas. Update command/instruction wording to state `adv_run_test` is prescribed because it provides executable proof + durable evidence + ledger, while `adv_task_evidence` attaches externally obtained evidence only when it adds unique audit/recovery value.

Acceptance: AC1, AC2, AC4, AC6, AC7, AC8.
  > Added value-vs-burden evidence tooling specs and guidance: rq-TDD009idem/rq-TDD010phase for fallback evidence idempotency and phase derivation, rq-ADVEXEC04/rq-ADVEXEC05 for evidence tool value justification and prescriptive guidance value categories, plus ADV instructions, adv-apply, setup wording, and asset regression tests.
- ✅ Strengthen regression anchors for evidence recommendation surfaces without adding context bloat

Affected files: `plugin/src/adv-command-routing-assets.test.ts`, `plugin/src/validator/completeness.test.ts`, `plugin/src/validator/completeness.ts` if wording needs minor adjustment, `plugin/src/tools/test.test.ts` if adv_run_test description needs assertion.

Purpose/value: prevent recurring noisy fallback guidance and verify no new default diagnostic surface is introduced.

RED: Add failing assertions that (1) `validator/completeness.ts` continues to prefer `adv_run_test` and limit `adv_task_evidence` to externally obtained evidence, (2) `adv_run_test` description says it runs and records evidence, (3) no touched command/status/system-output docs introduce default evidence diagnostic context.

GREEN: Update tests and only minimal wording needed. Do not add new runtime diagnostics.

Acceptance: AC1, AC2, AC6, AC7.
  > Strengthened regression anchors without adding runtime diagnostic output: validator recommendation now limits adv_task_evidence to externally obtained evidence only, adv_run_test description names durable evidence, asset tests guard value-vs-burden specs and absence of default evidence diagnostic context.
- ✅ Run final value-vs-burden evidence tooling verification

Affected files: no direct implementation files expected; verification over touched scope.

Purpose/value: reproducibility + release confidence.

Verify after implementation tasks complete:
- focused tests for task evidence, Temporal change-state, disk storage, asset routing, validator completeness, and adv_run_test tool description;
- `pnpm run check` from `plugin/`;
- targeted `adv_change_validate strict:true` passes or only expected warnings are resolved before planning/execution completion;
- no default context/token diagnostic output was added in touched command/status/system-output paths;
- task evidence command-use model matches agreement: `adv_run_test` normal run+record; `adv_task_evidence` fallback/manual attachment with unique value.

Acceptance: all AC; tdd_intent separate_verification.
  > Verified value-vs-burden evidence tooling end-to-end: focused tests cover task evidence, adv_run_test, target mutation, Temporal state, disk storage, validator completeness, and asset routing; plugin check passes; strict ADV validation passes with expected warnings only; no default diagnostic context output was added.

## Specs Modified


## Wisdom Accumulated

- **[pattern]** Evidence write idempotency fits as a pure local helper in temporal/change-state.ts and can be reused by disk state paths; compare stable evidence fields while ignoring recorded_at, then derive tdd_phase from red/green presence to avoid phase regression.
- **[gotcha]** Changing Store.tasks.recordEvidence from Task to result metadata requires updating adv_run_test and target-store mocks; otherwise code that reads tdd_phase must use result.task.tdd_phase.
