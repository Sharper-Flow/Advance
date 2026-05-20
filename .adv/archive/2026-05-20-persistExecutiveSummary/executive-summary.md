# Executive Summary

## Outcome
Persisted `executive-summary.md` as a 5th narrative artifact, scoped as a **communication-only field** (NOT a gate or activity artifact). Distinct from trunk's `acceptance.md` (gate-enforcement projection via `inspectArtifactActivity`); both now coexist orthogonally. Designed to be written at acceptance time, restated at archive sign-off, and copied into the archive bundle for downstream consumers (release notes, changelogs, user context).

## Verdict
APPROVED (acceptance gate signed off by user); READY (harden status, 0 unresolved blocker/HIGH/MEDIUM after remediation).

## What Was Built
1. **Type layer**: extended `ArtifactKind` and `ARTIFACT_FILENAME` in `temporal/activities.ts` only for the `acceptance` kind (from trunk merge); deliberately kept `executive-summary` OUT of `activities.ts` ArtifactKind and out of `contracts.ts` `ArtifactKind` + `ChangeWorkflowState.artifacts` to enforce the "field-only" classification (no workflow-state tracking, no activity surface).
2. **Storage layer**: 5th optional `executiveSummaryContent` param threaded through `storage/json.ts` (`createChangeScaffold` + `updateChangeArtifacts`, both now table-driven via the ARCH-2 campsite refactor), `storage/store-types.ts` (signatures + return types), `storage/store-disk.ts` (full threading), and `storage/store-temporal/changes.ts` (legacy-path threading only — NOT in the signal-mapping `updates` array, by design).
3. **Tool surface**: `adv_change_create` accepts `executiveSummary`; `adv_change_update` accepts `executiveSummary` (joins the at-least-one-of guard alongside proposal/problemStatement/agreement/design); `adv_change_show` accepts `include.executiveSummary` flag → returns `_executiveSummary` markdown. Cross-project `createCrossProjectFollowUp` threads the param too.
4. **Command guidance**: `/adv-review` Phase 7 adds a `### Persist Executive Summary` step instructing the orchestrator to compose using investment metrics + acceptance summary and persist via `adv_change_update executiveSummary: ...` before the acceptance gate completion. Sign-Off Boundary template in `.opencode/agents/adv.md` adds an `### Executive Summary` section sourced from `_executiveSummary` (no recomposition fallback). `/adv-archive` Phase 1 reads via `adv_change_show include: { executiveSummary: true }`.
5. **Documentation**: `docs/adv-gates.md` distinguishes `acceptance.md` (gate-enforcement) from `executive-summary.md` (narrative field); `AGENTS.md`, `ADV_INSTRUCTIONS.md`, `SETUP.md` updated to include the new field in canonical `adv_change_update` invocation guidance; `CHANGELOG.md [Unreleased]` added entry with plugin-rebuild operational note.
6. **Tests**: 5 new tests in `storage/json.test.ts` covering scaffold + update write/omit/mixed paths; 2 new tool-level tests in `tools/change.test.ts` for `adv_change_show include.executiveSummary` round-trip (file-present and file-missing cases); 3 new asset tests in `__tests__/human-checkpoints-assets.test.ts` enforcing Phase 7 persistence, archive include flag, and Sign-Off Boundary no-recomposition guard.

## What Was Verified
- **Acceptance verdict**: APPROVED with 5 review findings (1 blocker fixed inline, 1 issue fixed inline, 3 pre-existing campsite suggestions deferred → all later either fixed or rejected_with_evidence during harden)
- **Harden status**: READY — 10 findings reviewed across 6 scanners (test coverage, AI-slop, doc hygiene, cleanup, production readiness, deployment readiness): 6 fixed inline (2 BLOCKER docs, 4 HIGH/MEDIUM docs + tests), 1 fixed (CHANGELOG), 1 partially fixed (ARCH-2 harmonization), 5 rejected_with_evidence (pre-existing patterns or by-design exclusions)
- **Tests**: 2532 passed, 2 skipped, 208 suites (full pipeline: typecheck, lint, format:check, vitest)
- **Investment**: 6 tasks / 0 retries / ~95 min active wall-clock / tier: auto (no doom-loop)
- **Per-gate timing**: proposal 4.2min, discovery 2.2min, design 3.9min, planning 28.6min (longest — included trunk-merge collision resolution), execution 12.6min, acceptance 39.0min (longest — included full review + remediation + post-acceptance harden)
- **No `change.contract`** defined; contract matrix N/A
- **Merge compatibility**: trunk merged cleanly after collision resolution; second auto-merge brought in `removePhantomSubAgent` archive — clean merge path verified

## Remaining Concerns
- **Bootstrap caveat persists**: this artifact (executive-summary.md) was written via the `Write` tool rather than the new `adv_change_update executiveSummary:` field because OpenCode's running session loaded `plugin/dist/index.js` before the schema extension. End-to-end behavior verified via 2532 tests; future changes will exercise the live tool path in fresh sessions after rebuild. The CHANGELOG entry documents the rebuild requirement.
- **Five rejected_with_evidence findings** for follow-up consideration (all pre-existing or cross-cutting beyond this change's scope):
  - Pre-existing pattern: `changeDir` in `adv_change_show.execute` uses input `changeId` not resolved id (affects all 5 include flags)
  - Pre-existing pattern: silent-catch on non-ENOENT errors in include-flag reads (mirrors all 4 existing artifact reads)
  - Pre-existing pattern: max-size validation absent on all artifact content fields
  - Pre-existing complexity: `adv_change_create.execute` cyclomatic 28 (HIGH)
  - Pre-existing type erosion: `(result as Record<string, string>)` cast from `refactorAdvCollaborativeStage`
- **Fast-follow worktree caveat**: shared parent worktree with `improveAcceptanceReviews`; `adv_task_checkpoint` was bypassed per branch-mismatch (wisdom `ws-Q6Z5S1`). Manual commits at scope-correction and harden-remediation boundaries.
- **Concurrent-signaling stress test** is a known flake under full-suite load; passes when re-run in isolation (wisdom `ws-fNiCR8`).
- **Live-tool regeneration of this artifact** in a fresh session post-rebuild would be a clean validation step (uses `adv_change_update executiveSummary:` against canonical content); not blocking for archive since the file is already persisted and verified by the harden pass.
