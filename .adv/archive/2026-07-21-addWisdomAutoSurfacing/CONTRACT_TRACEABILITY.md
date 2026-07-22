# Contract Traceability

**Change ID:** addWisdomAutoSurfacing
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-21T19:25:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | adv_task_show returns _relevantWisdom (top 5 by recency after FTS filter) when contract_refs.implements non-empty. plugin/src/tools/task.ts:484-491 with null-guard coercion; tested plugin/src/tools/task.test.ts:397-495. |
| SC2 | success_criterion | pass | review | SEMANTIC error_recovery auto-generates WisdomDraft via maybeCreateWisdomDraftFromErrorRecovery helper. plugin/src/utils/wisdom-draft.ts:45-68; integrated in task.ts normal-path (line 1105+) and blocked-path (line 1068+) and poisoned-history path; 37 unit tests + 5 integration tests. |
| SC3 | success_criterion | not_applicable | review | Wisdom capture rate improvement is a post-deployment metric; not verifiable at acceptance boundary. Baseline established in reflection rf-5Vpj7LP2. |
| AC1 | acceptance_criterion | pass | test | plugin/src/tools/task.test.ts:397-495 — D1+D2 test asserts top-5 recency-sort wins over FTS ranking; FTS returns older-first [ws-old, ws-new], output is newer-first. Null-guard added at task.ts:484. |
| AC2 | acceptance_criterion | pass | test | plugin/src/tools/task.test.ts:497-524 — capabilities-gated hint suppression test. Plugin emits hint only; no MCP call (DONT2 preserved). |
| AC3 | acceptance_criterion | pass | test | plugin/src/tools/task.test.ts:1466-1629 — SEMANTIC → draft creation, TRANSIENT/empty-attempts → suppression, dedup at-most-one suggested per task. Now also covers blocked-status path (correctness-4 fix). |
| AC4 | acceptance_criterion | pass | test | plugin/src/types/tasks.test.ts:22-154 + plugin/src/utils/wisdom-draft.test.ts:293-444 — WisdomDraftStatusSchema enum locks states; lifecycle helpers enforce one-way transitions; idempotent dismiss tested. |
| AC5 | acceptance_criterion | pass | test | plugin/src/tools/checkpoint.test.ts:531-660 — drafts_pending_review + drafts_auto_dismissed counts verified for mixed/all-promoted/no-drafts/dismiss-failure paths. |
| AC6 | acceptance_criterion | pass | test | plugin/src/tools/wisdom.test.ts:262-446 — FROM_DRAFT_ID_REQUIRES_SOURCE_TASK, DRAFT_NOT_FOUND, DRAFT_ALREADY_PROMOTED, DRAFT_DISMISSED, atomic promotion, backward-compat paths. Signal-name assertion tightened (test-weak-signal-assertion nit). |
| AC7 | acceptance_criterion | pass | test | plugin/src/tools/wisdom.test.ts — rq-wisdomAutoSurfacing01.9 AC7 invariant test asserts drafts on cancelled tasks never appear in change-level wisdom queries. Architecture-only enforcement now guarded. |
| AC8 | acceptance_criterion | pass | test | plugin/src/index.ts:1266-1288 — PluginState extended with pendingWisdomDraftTasks; producer in experimental.chat.system.transform queries store.tasks.list and filters wisdom_drafts for suggested status. system-block.ts consumer reads field correctly. Tests in system-block.test.ts:298-417 + system-block-ac.verification.test.ts verify assembler behavior. |
| AC9 | acceptance_criterion | pass | test | plugin/src/tools/advisory-only-invariant.test.ts — static-assertion test scans change-state.ts and workflows.ts and confirms enrichment fields never read in gate-completion code paths. |
| AC10 | acceptance_criterion | pass | test | plugin/src/types/tasks.test.ts:167-171 — TaskSchema accepts without wisdom_drafts → undefined. plugin/src/tools/wisdom.test.ts:434-447 — without from_draft_id → single signal, no store.tasks.show. |
| C1 | constraint | respected | static_check | advisory-only-invariant.test.ts guards that enrichment never enters gate-completion paths; task.ts:475 comment documents intent. |
| C2 | constraint | respected | static_check | Reuses adv_wisdom_list reader pattern (FTS via store.wisdom.search), existing error_recovery schema (ErrorRecoverySchema), existing TaskSchema shape (additive optional wisdom_drafts field). |
| C3 | constraint | respected | static_check | task.ts:477-478 — implementsRefs.length > 0 gate before any enrichment work. Tested task.test.ts:497-524. |
| C4 | constraint | respected | static_check | task.ts:486 slice(0,5) for wisdom; task.ts:496 top_k:3 for recall hint; DONT2 forbids plugin MCP call. |
| C5 | constraint | respected | static_check | WisdomDraft lives on task signal field; dismissed drafts never enter change-level wisdom (AC7 test). Cancelled task lifecycle naturally bounds draft visibility. |
| C6 | constraint | respected | static_check | checkpoint.ts:494-511 — try/catch wraps dismiss; signal failure does not block checkpoint completion. |
| C7 | constraint | respected | static_check | adv_wisdom_add extended with from_draft_id; no new tool introduced. wisdom.ts:144+ implements validation + atomic promotion. |
| C8 | constraint | respected | static_check | Enrichment is advisory-only (AC9 test). Drafts are productivity aids; auto-dismiss at checkpoint is opt-out via review/promotion. |
| DONT1 | avoidance | respected | review | advisory-only-invariant.test.ts static-asserts enrichment fields absent from gate-completion paths. |
| DONT2 | avoidance | respected | review | task.ts:492-497 — plugin emits hint object only; no tools.episode.recall invocation in plugin source. Agent runtime owns the call. |
| DONT3 | avoidance | respected | review | wisdom-draft.ts:51 — maybeCreateWisdomDraftFromErrorRecovery filters to error_class === 'SEMANTIC' only. TRANSIENT/ENVIRONMENTAL/FATAL excluded. |
| DONT4 | avoidance | respected | review | checkpoint.ts:485-511 — auto-dismiss best-effort, never blocks completion. taskCompletedSignal fires before dismiss attempt. |
| DONT5 | avoidance | respected | review | dismissDraft/dismissAllSuggestedDrafts set status='dismissed' (terminal); never call store.wisdom.add for dismissed drafts. Promotion requires explicit from_draft_id call. |
| DONT6 | avoidance | respected | review | wisdom.ts:144-211 — from_draft_id path still requires type+content args (no auto-populate bypass); passes through normal validation. |
| DONT7 | avoidance | respected | review | task.ts:477-478 — implementsRefs.length === 0 suppresses both _relevantWisdom and _episodeRecallHint emission. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-a6cf8146d380 | AC1, AC2, AC10 |  | C1, C3, C4, DONT7 |  |
| tk-e6c18758c9d9 | AC4, AC7 |  | C5 |  |
| tk-16f8127784b7 | AC3, AC4 |  | C5, C6, DONT3 |  |
| tk-f559c1209038 | AC4, AC6 |  | C7, DONT5, DONT6 |  |
| tk-f0ef7d4573d1 | AC8 |  | C1 |  |
| tk-9d2d3be61d01 | AC4, AC5 |  | C6 |  |
| tk-296743071b40 | AC9 |  | C1, C8, DONT1 |  |
