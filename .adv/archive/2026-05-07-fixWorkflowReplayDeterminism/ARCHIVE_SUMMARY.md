# Archive: Fix workflow replay determinism: remove non-deterministic seeds + recover poisoned histories

**Change ID:** fixWorkflowReplayDeterminism
**Archived:** 2026-05-07T22:21:11.755Z
**Created:** 2026-05-07T18:44:40.556Z

## Tasks Completed

- ✅ T01 — Add RED tests for Temporal poisoned-history classification, then implement narrow fallback classification in `plugin/src/temporal/retry-wrapper.ts`. Cover TMPRL1100, `Nondeterminism error`, `No command scheduled for event`, and negative case: bare `WorkflowExecutionUpdateAccepted` text without TMPRL/no-command context must not classify as fallback. TDD inline: red tests first, green implementation second.
  > Added retry-wrapper classification tests for TMPRL1100/nondeterminism/no-command replay errors and negative bare accepted-update text. Implemented narrow fallback classification in classifyTemporalError.
- ✅ T02 — Add RED tests for direct `store.changes.get` projection recovery, then implement active-disk/archive-bundle fallback in `plugin/src/storage/store-temporal/index.ts`. When Temporal query throws poisoned-history fallback error, return active disk projection with `_source: "disk"` or archive bundle with `_source: "archive"` plus recovery marker; do not reseed archived/closed terminal projections. TDD inline.
  > Added projection fallback tests for poisoned workflow histories and implemented disk/archive projection recovery markers in store-temporal changes.get path.
- ✅ T03 — Add RED tests for `store.gates.get` / `adv_gate_status` recovery, then update `plugin/src/storage/store-temporal/gates.ts` so direct gate queries catch fallback-class Temporal errors, route through `deps.getTemporalChange(changeId)`, and return recovered `change.gates` when a projection exists. Preserve original error when no projection exists. TDD inline.
  > Added a gate fallback regression test and updated store-temporal gates.get to recover gates through getTemporalChange on fallback-class Temporal query errors.
- ✅ T04 — Add RED tests for `adv_status` first-call TMPRL/bootstrap handling, then implement bounded retry/degrade in `plugin/src/tools/status.ts`. First fallback-class status failure retries once after a short non-interactive delay; repeated failure returns structured diagnostic such as `bootstrap_in_progress` instead of crashing the tool. TDD inline.
  > Added adv_status bootstrap retry regression coverage and implemented one-shot fallback-class retry with structured bootstrap_in_progress diagnostic on repeated fallback failure.
- ✅ T05 — Add RED static guardrail test for production workflow-reachable code, then implement scanner in `plugin/src/temporal/workflow-bundle-boundary.test.ts` or sibling test. It must fail on `defineUpdate` / `wf.defineUpdate` in the change workflow surface, reuse existing reachability traversal where practical, and must not flag Temporal TypeScript-patched `Date.now()`, `new Date()`, or `Math.random()`. TDD inline.
  > Extended workflow bundle boundary tests with a defineUpdate scanner and a production workflow-reachable guardrail, while explicitly not flagging Temporal TypeScript deterministic Date/random APIs.
- ✅ T06 — Update agent-facing replay determinism documentation and, if warranted, `advance-delivery` spec deltas. Document that Temporal TypeScript patches `Date.now()`, `new Date()`, and `Math.random()` deterministically in workflow sandbox; use `sleep()`/`condition()` for workflow timers; ADV change workflows remain signal/query-only unless future specs explicitly handle update migration. Verification: docs/spec tests or targeted grep/assertions as applicable. TDD intent: not_applicable (docs/spec).
  > Updated AGENTS.md with corrected Temporal TypeScript determinism guidance and added advance-delivery requirements for poisoned-history fallback, signal-only change workflow surface, and docs guidance. Added external citations for new requirements.
- ✅ T07 — Final recovery verification across affected surfaces. Run targeted tests for retry-wrapper, store-temporal fallback, gate fallback, status bootstrap, and workflow guardrail; then run `pnpm run check` and `pnpm test` from `plugin/`. If live-tool validation remains blocked by cached dist/session reload, document exact rebuild/restart requirement and source-level evidence. TDD intent: separate_verification.
  > Ran targeted affected tests, full check, full test suite, and build. Applied formatting/type fixes required by check. Source-level verification passed; live tool behavior requires fresh session/rebuilt dist to exercise host-loaded tool changes due OpenCode cache model.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** Temporal TypeScript workflows patch `Date.now()`, `new Date()`, and `Math.random()` to deterministic sandbox values; replay guardrails for this project should target actual unsafe workflow-surface drift such as reintroducing `defineUpdate`, not blindly ban patched Date/random APIs.
- **[gotcha]** Archive validator (rq-archiveValidate01 + rq-TDDvalidatorCompliantPath01) requires `task.tdd_evidence.{red,green}` to be stamped via `adv_run_test phase:'red'/'green'`. /adv-apply protocol calls for these calls in steps 3b/3c, but ad-hoc apply that runs tests via plain `pnpm test` or `bash` will not stamp evidence — leading to MISSING_TDD_EVIDENCE blockers at archive time even when full red→green cycles ran. Mitigations: (1) call `adv_run_test` for inline TDD tasks during apply, OR (2) use explicit `metadata.tdd_intent` at task creation (`separate_verification` / `not_applicable`) when a single verification task covers a batch of impl tasks. Reclassification via `adv_task_reclassify_tdd` clears the block post-hoc when evidence exists in summaries but not in the durable evidence record.
