# Archive: Update triage cleanup

**Change ID:** updateTriageCleanup
**Archived:** 2026-06-19T19:53:20.557Z
**Created:** 2026-06-19T15:29:37.152Z

## Tasks Completed

- ✅ Add RED asset tests for triage cleanup-before-priority contract
  > Extended plugin/src/adv-triage-relevance-assets.test.ts with RED assertions for Phase 3.5 cleanup ordering before issue creation/scoring, cleanup_decisions schema/prompt contract, GitHub duplicate capability detection, and rq-backlogCoord09 spec law. The targeted test currently fails as intended until implementation tasks update command/skill/spec surfaces.
- ✅ Add backlog-coordination spec law for triage cleanup-before-creation/scoring
  > Task checkpoint completed
- ✅ Update adv-triage command with Phase 3.5 Source Cleanup Validation
  > Added `/adv-triage` Phase 3.5 Source Cleanup Validation after match/gap and before issue creation/user-owned scoring. Documented cleanup_decisions[], source/reason Tier B approval grouping, source-specific action mapping for ADV changes/GitHub issues/agenda, GitHub duplicate capability detection via `gh issue close --help`, and P33 advisory-only heuristic boundaries. Updated skill schema, prompts, core flow, and anti-patterns in the same checkpoint because command behavior references those skill sections.
- ✅ Update adv-triage skill schema, prompts, and anti-patterns for cleanup decisions
  > Added `cleanup_decisions[]` schema with source/ref/classification/evidence/proposedAction/approvalGroup; added Tier B source cleanup prompt grouped by source/reason; documented agenda `should-merge`/superseded completion via `adv_agenda_complete` note; documented GitHub duplicate capability detection with `gh issue close --help`, native `--duplicate-of` when present, and `Duplicate of #N` fallback semantics; extended anti-patterns to forbid cleanup-before-creation/scoring regressions and heuristic-owned mutation.
- ✅ Verify triage cleanup contract coverage and targeted tests
  > Release hardening completed. Harden reviewer added missing `adv_agenda_cancel` key-tool documentation and a matching asset-test assertion, then primary reran targeted asset tests and schema check and checkpointed the remediation.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** `bin/oc-test` is rooted at the repository checkout, not `plugin/`; ADV verification commands using `bin/oc-test targeted -- ...` must run with workdir at repo root even though tests themselves execute under plugin/.
