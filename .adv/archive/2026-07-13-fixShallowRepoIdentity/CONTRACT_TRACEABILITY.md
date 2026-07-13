# Contract Traceability

**Change ID:** fixShallowRepoIdentity
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-13T00:56:09.790Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | project-identity-guard.test.ts 7/7: shallow clones refuse; getProjectIdFromGit throws UnstableIdentityError; index.ts refuses store init at mint chokepoint (no external/Temporal state minted). |
| SC2 | success_criterion | pass | review | store-consolidate.test.ts 38/38: terminal-first import, live recreation, collision halt, ledger idempotency, zero-mutation dry_run tree compares; no delete calls (no silent loss). |
| SC3 | success_criterion | pass | review | Linked child runPokeedgeConsolidation created as fast_follow of parent; proposal requires deployed trunk, scan/dry-run, explicit execute approval, before/after counts for 67fe3e95… + 2d2af340… into 4d6b5898…. |
| AC1 | acceptance_criterion | pass | test | Guard shallow-refusal fixture; UnstableIdentityError message names `git fetch --unshallow` and states no ADV state created; mint-point refusal wired in index.ts/plugin-context.ts. |
| AC2 | acceptance_criterion | pass | test | Partial-clone (--filter=blob:none) fixture (DDC5) and multi-root fixture in guard suite prove non-trip; identity resolves via sorted root determinism as today. |
| AC3 | acceptance_criterion | pass | test | dry_run zero-mutation tree-compare tests + execute approval_required typed refusal test; dry-run is default mode. |
| AC4 | acceptance_criterion | pass | test | Execute tests: live change recreation via ensureChangeWorkflowStarted + changeSeedStateFromChange (tasks/gates/artifacts/epic_membership carried); live epic via buildEpicSeedState; terminal items imported as disk projections. |
| AC5 | acceptance_criterion | pass | test | Collision-halt tests: unified per-ID collision map across changes/archive/retired-epics/live-epics; execute halts with per-ID report; no overwrite (zero delete/overwrite calls). |
| AC6 | acceptance_criterion | pass | test | Ledger idempotency tests (skip_ledgered); buildConsolidationPlan reads ledger before collision detection and excludes ledgered IDs so re-runs report no-op. |
| AC7 | acceptance_criterion | pass | test | AC7 (amended) verified as linked-handoff configuration: runPokeedgeConsolidation is a linked fast_follow child; its proposal mandates deployed trunk, scan/dry-run, explicit execute approval, and before/after verification for the two source stores into 4d6b5898…. Live execution intentionally deferred to child (trunk-only deployment). |
| C1 | constraint | respected | static_check | Execute recreates via new Temporal workflows carrying seed state; source workflows untouched; no history rewrite. Verified in store-consolidate.ts execute path. |
| C2 | constraint | respected | static_check | Execute requires approvedByUser===true and non-empty approvalEvidence else throws ConsolidationError('approval_required') with zero mutations; dry-run default. Tested. |
| C3 | constraint | respected | static_check | Detection uses `git rev-parse --is-shallow-repository` (reads .git/shallow) and info/grafts file existence — structural git plumbing, never error-text inference. |
| C4 | constraint | respected | static_check | Guard non-trip tests for full clone, partial clone, and multi-root preserve current identity behavior. |
| C5 | constraint | respected | static_check | 7 guard fixtures (shallow/partial/multi-root/graft/not-git) + 38 consolidation tests (scan/dry_run/execute/collision/idempotency/refusals). Full suite 4956/4956 green. |
| C6 | constraint | respected | static_check | Design and process mandate trunk-only deployment; live PokeEdge run deferred to post-merge child. Caveat: opt-in post-commit hook transiently deployed the branch during execution; runtime was restored from trunk and no branch-built tool was used for any production op (recorded as wisdom ws-H2RU-g). |
| DONT1 | avoidance | respected | review | Guard throws UnstableIdentityError (loud refusal); no path-hash or silent fallback on trip. not_git stays distinct from unstable. |
| DONT2 | avoidance | respected | review | Collision policy is halt+report; no newest-wins/auto-resolution. Tested. |
| DONT3 | avoidance | respected | review | Recovery is tool-owned (adv_store_consolidate); child change runs the tool, not manual file shuffling. |
| DONT4 | avoidance | respected | review | Static audit: zero rmSync/unlinkSync/fs.rm/rimraf calls in store-consolidate.ts; orphan stores are never deleted. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-419ca51e73a3 | AC1, AC2, SC1 | AC1, AC2 | C3, C4, DONT1 |  |
| tk-b9ec0d0fdd3e | AC3, AC5, SC2 | AC3, AC5 | C2, C3, DONT2, DONT3 |  |
| tk-9e02f3b6015f | AC4, AC6, SC2 | AC4, AC6 | C1, C2, DONT3, DONT4 |  |
| tk-2b3929ed4d2c | SC1, SC2 |  | C5 |  |
| tk-cb27339a3627 | AC7, SC3 | AC7 | C2, DONT3, DONT4 |  |
| tk-6db01c6b815e |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, SC1, SC2, SC3 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4 |  |
| tk-ee8f47a8f4ce |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, SC1, SC2, SC3 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4 |  |
