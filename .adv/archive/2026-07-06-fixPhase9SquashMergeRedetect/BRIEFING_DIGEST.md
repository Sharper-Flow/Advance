# Archive Briefing Digest

**Change ID:** fixPhase9SquashMergeRedetect
**Title:** Fix phase9 squash-merge redetect
**Status:** archived
**Generated:** 2026-07-06T00:41:30.545Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY

## Archive Digest

**Status:** archived

| Gate | Status |
| --- | --- |
| proposal | done |
| discovery | done |
| design | done |
| planning | done |
| execution | done |
| acceptance | done |
| release | pending |

## Epic Context

No Epic membership

## Durable Facts

Showing 18 of 18 durable facts.

- **[agenda]** follow_ups: Planning task: add `pnpm run schemas:generate` + verify `pnpm run schemas:check` green — Phase9FinalizationStatusSchema is a public registry + Temporal signal payload, so the optional field is not free.
- **[agenda]** follow_ups: Add explicit `--stable` to all git patch-id invocations and document it in the helper; add an edge-case note/test for binary files and mode changes where patch-id may spuriously differ.
- **[agenda]** follow_ups: Add a red test: delete change/{id} branch (both worktree and local ref) before calling detection, assert tip-based tree-SHA recovery marks release reachable; and a patch-id test where origin/default advanced under the PR so trees differ.
- **[agenda]** follow_ups: Confirm the persisted tip commit object remains reachable in mainCheckout's shared object store after branch deletion (deletion does not prune; guard only matters if aggressive GC runs between archive and retry) — note this assumption in design.md risks table.
- **[agenda]** follow_ups: Verify tip is captured on BOTH the finalizeRelease-first-pass and the direct verifyReleaseEvidenceFromMain path; ensure buildPendingMergePhase9Status and buildFailedPhase9Classification preserve changeTipSha across pending_merge transitions so a later retry still has it.
- **[agenda]** follow_ups: OOS but adjacent (already noted in contract OOS1): worktree cleanup timeout on poisoned workflows can be the trigger that leaves the branch deleted mid-retry — track as related.
- **[archive_only_evidence]** sources: git-scm official git-patch-id docs (2.54.0): git patch-id defaults to UNSTABLE hash unless --stable is passed or patchid.stable=true. --stable is required for cross-environment/config determinism. patch-id ignores whitespace and line numbers; it is a symmetrical sum of SHA-1 over file diffs.
- **[archive_only_evidence]** sources: git/git patch-id documentation source: Confirms two patches comparing the same two trees produce the same stable patch-id; robust to hunk reordering and orderfile differences. Default remains unstable unless configured.
- **[archive_only_evidence]** sources: detectSquashMergeByTree source: Currently does `git rev-parse change/{id}^{tree}` in mainCheckout and compares against `git log --format=%H %T -50 origin/{default}`. Fails (returns reachable:false) when the change/{id} ref is missing.
- **[archive_only_evidence]** sources: resolveReleaseReachability + call site: direct route: origin ancestry check -> discoverMergedPr (gh) -> readPrMergeState (gh) -> detectSquashMergeByTree(origin/{default}) as final fallback. ReleaseReachabilityInput (line 148) has no changeTipSha field yet.
- **[archive_only_evidence]** sources: verifyReleaseEvidenceFromMain (worktree-gone retry path): The retry path invoked when worktreePath is absent. Reads change.phase9_status?.prNumber but not a tip. This is the path where squash-merge-then-delete manifests, because the branch ref is already gone.
- **[archive_only_evidence]** sources: Phase9FinalizationStatusSchema + ChangeSchema registry membership: Phase9FinalizationStatusSchema is embedded in ChangeSchema (public registry entry) AND in Phase9StatusUpdatedSignalPayloadSchema (Temporal signal). Adding a field flows into public JSON schemas.
- **[archive_only_evidence]** sources: archive dispatch phase9:run path: First pass with worktreePath present calls finalizeRelease; retry with worktree gone calls verifyReleaseEvidenceFromMain. First recordPhase9Status({status:pending}) at line 2580 does not capture tip today.
- **[archive_only_evidence]** sources: existing branch-missing tree test: Asserts detectSquashMergeByTree returns reachable:false when change branch does not exist. Additive optional-tip change keeps this test green (no tip passed).
- **[archive_only_evidence]** architecture_assessment: The core design is sound and correctly targets the real failure surface. Root cause is accurate: detectSquashMergeByTree and both ancestry checks (verifyChangeBranchReachable, verifyChangeBranchReachableFromOrigin) all dereference the live `change/{id}` ref, so a squash-merge followed by branch deletion leaves no structural proof on the retry path (verifyReleaseEvidenceFromMain), and the release gate stays pending. Persisting a trusted change-tip SHA into phase9_status and substituting it for the live ref in tree-SHA comparison is the minimal, correct structural fix. It preserves the shipped-invariant bar (still requires positive tree/patch/PR proof) and degrades gracefully for legacy in-flight changes (optional field, falls back to live-ref behavior). Reuse of the existing tree-SHA comparison via a single rev-parse substitution is a good LBP call and keeps existing tests green.

Gaps and corrections found:

1. TIP CAPTURE POINT / SUBJECT MISMATCH (medium). Design text says capture via `git -C {worktreePath} rev-parse change/{id}`. Two issues: (a) The capture must land in the FIRST recordPhase9Status({status:pending}) at change.ts:2580 (before finalizeRelease/dispatch), because the retry path is exactly when the worktree/branch is gone. If tip is only captured later it will be unavailable on retry. (b) `rev-parse change/{id}` and `rev-parse HEAD` in an ADV worktree that is checked out on change/{id} are equivalent, but HEAD is the more robust subject if the worktree is ever detached; either is acceptable given validateChangeWorktree already asserts the branch. More important: detectSquashMergeByTree computes the tree in mainCheckout, so the persisted SHA must be a commit object present in mainCheckout's object store (it is, since worktrees share the object DB), and the helper must switch to `rev-parse {tip}^{tree}` — confirm the tip commit is fetched/reachable in mainCheckout after branch deletion (shared .git object store makes this true unless GC pruned it; deletion alone does not prune).

2. PATCH-ID DETERMINISM (medium, must-fix). git patch-id defaults to the UNSTABLE hash unless `--stable` is passed or patchid.stable=true is configured (git-scm docs). The design's `git diff {base}..{tip} | git patch-id` is non-deterministic across environments/config and will silently mismatch. detectSquashMergeByPatchId MUST use `git patch-id --stable` on BOTH sides (change diff and each trunk commit's `git show --stable`-equivalent via `git diff-tree -p | git patch-id --stable`). Also the design's `git show {commit} | git patch-id` for merge commits emits combined diffs that patch-id skips; use `git diff-tree -p --no-merges` piping to be safe.

3. SCHEMA REGEN IS MANDATORY, NOT CONDITIONAL (low, must-fix in planning). Phase9FinalizationStatusSchema is embedded in ChangeSchema which IS a public registry entry (schema-registry.ts:32) and in the Temporal Phase9StatusUpdatedSignalPayload. Adding an optional field requires `pnpm run schemas:generate` and will be caught by `pnpm run schemas:check` in CI. The design hedges ('if it is in the registry ... confirm during planning') — it definitively is. Make it a firm planning task.

4. REPLAY SAFETY (low, OK). Adding an OPTIONAL field to a signal payload schema is backward-compatible for Temporal replay: old histories without the field parse cleanly; the signal-only change-workflow surface has no defineUpdate poisoning risk here. No migration needed.

5. PATCH-ID NECESSITY (design tradeoff, defensible). Tree-SHA equivalence covers the dominant squash-merge case (change branch unchanged after PR open, no conflict resolution in the squash). Patch-id is genuinely needed only when the squashed trunk tree differs from the change tip tree — i.e. trunk advanced under the PR and the merge base moved, OR a conflict was resolved during squash. Both are real but secondary. Since the existing gh-based readPrMergeState/discoverMergedPr already covers most PR-merge cases branch-deletion-safe, patch-id is the third fallback. It is justified for gh-unavailable / no-PR-metadata cases but adds real complexity (merge-base + bounded 50-commit scan + binary/mode-change edge cases). Recommend implementing it behind the tree-SHA-fails guard as designed, but treat it as the highest-risk/lowest-value slice — acceptable to land tree-SHA + tip first and patch-id as a follow-on if scope pressure appears.

6. NO EXISTING MERGE-BASE/PATCH-ID HELPER to reuse (confirmed). git-finalize.ts source has no merge-base or patch-id helper (only test-side usage). A new helper is correct; no reuse opportunity missed.

7. NO TEST CONFLICT (confirmed). The branch-missing test at git-finalize.test.ts:2709-2722 and the tree-match tests at 2655-2683 pass no tip, so additive optional-tip plumbing keeps them green. The design's additive-only claim holds.
- **[unresolved_action]** required_main_agent_actions: None blocking. Acceptance review passes: SC1 (tip captured at dispatch change.ts:2583-2602 + persisted Phase9FinalizationStatusSchema.changeTipSha), SC2 (threaded end-to-end change.ts -> archive-gate.ts:527 -> resolveReleaseReachability -> detectSquashMergeByTree, test-asserted), SC3 (fallback ordering unchanged; tree-match remains last-resort after origin_default + PR-merge checks), C1 (tree-match pre-existing; only tip-source threading added, no weakened bar), C2 (no new deps; pure git rev-parse/log), C3 (read-only rev-parse/log only), C4 (tip from trusted persisted phase9_status). Proceed to record acceptance evidence.
- **[wisdom_candidate]** wisdom_candidates: [pattern] Phase9 reachability survives branch deletion by capturing the change-branch tip SHA at archive-dispatch time (while the ref is still live), persisting it in phase9_status.changeTipSha, and preferring it over the live change/{id} ref during retry-time tree-SHA detection. Content-addressed SHA is deletion-proof; git ref is not. detectSquashMergeByTree: tipRef = deps.changeTipSha ?? `change/${changeId}`.
- **[archive_only_evidence]** verification: tests_run=npx vitest run src/tools/archive-helpers/git-finalize.test.ts src/tools/change.archive-phase9.test.ts --no-coverage results=pass — 2 test files, 114 tests passed (git-finalize 83, change.archive-phase9 31), 0 failures, 3.77s. Includes new coverage: unit test 'direct route + deleted branch + changeTipSha provided detects squash-merge via tree-SHA' (git-finalize.test.ts:580) asserts tip preference when change/{id} ref is 128/gone; end-to-end test 'phase9 retry threads persisted changeTipSha to reachability detection' (change.archive-phase9.test.ts:761) asserts resolveReleaseReachability called with changeTipSha:'tip123abc' from phase9_status and finalization status:shipped.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |

## Unresolved Actions

- None blocking. Acceptance review passes: SC1 (tip captured at dispatch change.ts:2583-2602 + persisted Phase9FinalizationStatusSchema.changeTipSha), SC2 (threaded end-to-end change.ts -> archive-gate.ts:527 -> resolveReleaseReachability -> detectSquashMergeByTree, test-asserted), SC3 (fallback ordering unchanged; tree-match remains last-resort after origin_default + PR-merge checks), C1 (tree-match pre-existing; only tip-source threading added, no weakened bar), C2 (no new deps; pure git rev-parse/log), C3 (read-only rev-parse/log only), C4 (tip from trusted persisted phase9_status). Proceed to record acceptance evidence.
