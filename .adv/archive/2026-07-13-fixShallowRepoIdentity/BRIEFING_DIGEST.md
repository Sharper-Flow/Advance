# Archive Briefing Digest

**Change ID:** fixShallowRepoIdentity
**Title:** Fix shallow repo identity
**Status:** archived
**Generated:** 2026-07-13T01:02:06.577Z

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

Showing 85 of 85 durable facts.

- **[agenda]** follow_ups: PRE-EXISTING: advance-epics-assets.test.ts > /adv-epic command contract > 'keeps initial entries optional and mutations typed' fails on clean base c6d2348 — .opencode/command/adv-epic.md no longer matches /initial (?:roadmap )?entries are optional…/i. Confirmed via git stash that it fails without this task's changes. Not in scope; surface to the docs task owner.
- **[agenda]** follow_ups: Task tk-9e02f3b6015f: duplicate store-id across legacy+shard layouts currently prefers shard with a warning; execute needs the final deterministic source-selection policy.
- **[agenda]** follow_ups: Task tk-2b3929ed4d2c: SETUP.md shallow-clone guidance and .adv/specs deltas (rq-projectIdentityStability01, rq-storeConsolidation01) remain — deliberately untouched.
- **[unresolved_action]** required_main_agent_actions: Decide whether to route the pre-existing advance-epics-assets.test.ts failure to the docs task (tk-2b3929ed4d2c) or a separate fix — it will fail the full-suite verification gate (tk-6db01c6b815e) if left as-is.
- **[archive_only_evidence]** decisions: Unified per-ID collision map across all item categories (changes, archive bundles, retired epics, live epics) rather than per-category checks — Catches same-ID-different-category collisions (e.g. change live in source but archived in target) — the dangerous case AC5/DONT2 must halt on; structural per design
- **[archive_only_evidence]** decisions: Execute action included in the action enum but returns a structured non-mutating refusal naming task tk-9e02f3b6015f — Keeps the action-discriminated schema stable for task 3 (DDC3) while guaranteeing zero mutations this build (C2)
- **[archive_only_evidence]** decisions: Orphan classification via structural git checks: cat-file -e {sha}^{commit} + rev-list --max-parents=0 {sha} — C3 — a non-root commit used as store id is exactly the shallow-boundary/graft unstable-identity signature; no error-text or path heuristics
- **[archive_only_evidence]** decisions: data_home_root injection + defaultDataHomeRoot() that unwraps the oc per-project shard path to the XDG base — Tests never touch real XDG stores (design excerpt requirement); default correctly walks both legacy and opencode-projects shard layouts in oc-sharded sessions
- **[archive_only_evidence]** decisions: Ledger exists flag tracks file existence (not row count); malformed ledger lines counted and tolerated — DDC4 append-only ledger may contain drifted rows; dry_run must report them, never crash
- **[archive_only_evidence]** decisions: Added the docs/cli-surface-matrix.md row and frozen-snapshot append as registration wiring — Existing asset tests (cli-surface-matrix coverage, cli-bridge-contract frozen list, explicit-title guard) fail without them — they are mechanical registration invariants, not the spec/docs work owned by tk-2b3929ed4d2c
- **[archive_only_evidence]** decisions: Duplicate store-id in both layouts: deterministic shard-layout preference with warning — Read-only determinism; execute task will need the final policy, surfaced via warnings now
- **[unresolved_action]** scope_drift: finish_owned_scope_then_report: Added one row to docs/cli-surface-matrix.md and appended adv_store_consolidate to the frozen snapshot in cli-bridge-contract.test.ts. Strictly OUT_OF_SCOPE reads as 'spec/docs edits', but these two files are mechanical registration invariants enforced by existing asset tests (cli-surface-matrix coverage requires a row per tool; frozen snapshot requires the new name). Without them the acceptance gate's full suite would fail on registration wiring, which IS in scope. Both edits are append-only single lines preserving the guards' intent.
- **[archive_only_evidence]** verification: bunx vitest run src/tools/store-consolidate.test.ts --maxWorkers=2 (RED, runId tr_mrgkd7dt_e8c1c369) (1) — RED confirmed: suite failed with module absent before implementation
- **[archive_only_evidence]** verification: bunx vitest run src/tools/store-consolidate.test.ts --maxWorkers=2 (GREEN, runId tr_mrgkqv91_55cf3330) (0) — All 24 tests pass: scan enumeration/classification across legacy+shard layouts, shallow-boundary flagging, worker.lock liveness, zero-mutation tree compares, dry_run partitioning, collision halt report, ledger idempotency (skip_ledgered), jsonl hash dedupe, missing-target/source handling, shallow-repo refusal with unshallow guidance, execute refusal, schema round-trips, plan_hash stability
- **[archive_only_evidence]** verification: bun run typecheck (VERIFY, runId tr_mrgkrg0x_6b3754db) (0) — tsc --noEmit clean across the plugin
- **[archive_only_evidence]** verification: bunx vitest run tool-registry/tool-title/cli-bridge-contract/cli-surface-matrix/tool-name-assets/advance-epics-assets (VERIFY, runId tr_mrgkryxr_12b913e4) (1) — 118 passed, 1 failed — the failure (advance-epics-assets 'keeps initial entries optional') confirmed PRE-EXISTING on clean base c6d2348 via git stash; all wiring tests for this change pass
- **[archive_only_evidence]** verification: bunx vitest run tool-arg-preflight/integration/worktree-warp-mode-assets/active-change-pointer/adv-engineer-assets/adv-designer-assets (VERIFY, runId tr_mrgkts0n_83d2e356) (0) — 219 passed — no regressions in preflight policies, integration, or agent-asset surfaces
- **[archive_only_evidence]** verification: bunx vitest run src/tools/store-consolidate.test.ts --maxWorkers=2 && bun run typecheck (VERIFY post lint/format, runId tr_mrgkvdvr_e0e42244) (0) — 24 tests + typecheck re-verified after eslint fixes and prettier formatting; eslint clean, schemas:check clean
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bunx vitest run src/tools/store-consolidate.test.ts --maxWorkers=2 (RED, runId tr_mrgkd7dt_e8c1c369)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bunx vitest run src/tools/store-consolidate.test.ts --maxWorkers=2 (GREEN, runId tr_mrgkqv91_55cf3330)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bun run typecheck (VERIFY, runId tr_mrgkrg0x_6b3754db)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bunx vitest run tool-registry/tool-title/cli-bridge-contract/cli-surface-matrix/tool-name-assets/advance-epics-assets (VERIFY, runId tr_mrgkryxr_12b913e4)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bunx vitest run tool-arg-preflight/integration/worktree-warp-mode-assets/active-change-pointer/adv-engineer-assets/adv-designer-assets (VERIFY, runId tr_mrgkts0n_83d2e356)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bunx vitest run src/tools/store-consolidate.test.ts --maxWorkers=2 && bun run typecheck (VERIFY post lint/format, runId tr_mrgkvdvr_e0e42244)
- **[archive_only_evidence]** decisions: Live change recreation uses ensureChangeWorkflowStarted + changeSeedStateFromChange(loadChange(...)) — the exact reseedChangeFromDisk path — plus a disk-projection copy of the change dir into target changes/ — Existing creation/signal path (C1: new workflow with carried state, no history rewrite); disk copy mirrors the store's own non-terminal dual-write and enables KD-5 document hydration via projectionChangesDir=target changes dir
- **[archive_only_evidence]** decisions: Live epic recreation queries source epic workflow state (getEpicStateQuery) and starts the target workflow with seedState=buildEpicSeedState(state); missing source state fails that item with an operator-facing error instead of inventing a persistence path — EpicWorkflowInput.seedState is the existing continue-as-new carry mechanism; STOP_WHEN forbids new persistence machinery
- **[archive_only_evidence]** decisions: Recreation backends are injectable (ConsolidationExecuteDeps); defaults share one lazily-created Temporal client bundle — Tests never touch real Temporal/XDG; terminal-only executes need no Temporal connection at all
- **[archive_only_evidence]** decisions: Ledger rows written per applied item AND per appended jsonl row (item_id = row content hash), immediately after each mutation — DDC4 append-only content-hashed rows; per-item ledgering is the resume contract (ledgered items skipped)
- **[archive_only_evidence]** decisions: buildConsolidationPlan: ledger read moved before collision detection; ledgered IDs excluded from collisions — Without this, a successful run makes its own re-run report false collisions (target now holds the imported items), breaking AC6 no-op reporting
- **[archive_only_evidence]** decisions: Missing target store mints under canonical legacy layout (opencode/plugins/advance/<id>) — Deterministic rule; plan reports target.exists=false only when no layout copy exists
- **[archive_only_evidence]** decisions: Unledgered partial copies in the target halt as collisions rather than being auto-adopted — AC5/DONT2 literal: duplicate IDs halt; resume granularity is the ledger per DONE_WHEN parenthetical
- **[archive_only_evidence]** verification: bunx vitest run src/tools/store-consolidate.test.ts --maxWorkers=2 (red) (1) — RED: 15 new execute tests fail before implementation (runId tr_mrgm1hpf_8ec9b2dd)
- **[archive_only_evidence]** verification: bunx vitest run src/tools/store-consolidate.test.ts --maxWorkers=2 (green) (0) — GREEN: 38/38 pass (runId tr_mrgmafbl_90efcdd3)
- **[archive_only_evidence]** verification: bun run typecheck (0) — tsc --noEmit clean (runId tr_mrgmch5i_95c64e17)
- **[archive_only_evidence]** verification: bunx vitest run src/tools/store-consolidate.test.ts src/cli-bridge-contract.test.ts --maxWorkers=2 (verify) (0) — VERIFY: 57/57 pass incl. cli-bridge contract (runId tr_mrgmd2in_778ad87d)
- **[archive_only_evidence]** verification: bunx eslint src/tools/store-consolidate.ts src/tools/store-consolidate.test.ts (0) — eslint clean on both touched files
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bunx vitest run src/tools/store-consolidate.test.ts --maxWorkers=2 (red)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bunx vitest run src/tools/store-consolidate.test.ts --maxWorkers=2 (green)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bun run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bunx vitest run src/tools/store-consolidate.test.ts src/cli-bridge-contract.test.ts --maxWorkers=2 (verify)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bunx eslint src/tools/store-consolidate.ts src/tools/store-consolidate.test.ts
- **[archive_only_evidence]** decisions: Registered deltas by editing .adv/specs/<capability>/spec.json directly (version bump + new requirement) with docs/specs md mirrors updated to match — This is the repo's existing delta mechanism — verified via git history of recent checkpoint commits (e.g. ensureTargetWorkers added rq-targetWorkerLifecycle01 the same way) and the deploy-local.test.ts mirror-sync guard; change.deltas map has no agent-facing write path and is only consumed at archive time
- **[archive_only_evidence]** decisions: Placed shallow-clone guidance under SETUP.md Troubleshooting and created docs/store-consolidation.md as a new doc — Shallow refusal is an environment-level operator gotcha matching Troubleshooting; consolidation is a multi-step recovery flow warranting a dedicated doc, cross-linked from SETUP.md and README documentation map
- **[archive_only_evidence]** decisions: JSON edits done via python json.load/dump with ensure_ascii=False — First pass escaped the em-dash in the purpose field to \u2014; rewrote from git-clean state to keep diffs minimal and literal-UTF8 consistent with the rest of the file
- **[archive_only_evidence]** verification: bun run typecheck (plugin/) (0) — tsc --noEmit passes; runId tr_mrgn773z_eca98227
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/deploy-local.test.ts src/release-install-assets.test.ts src/tools/spec.test.ts src/manifest-doc-drift.test.ts src/adv-stability-docs-assets.test.ts src/cli-bridge-contract.test.ts (0) — 6 suites, 144 tests passed — covers spec.json schema validation, advance-meta md-mirror version/ID sync, SETUP.md asset guards, docs stability guards, frozen tool-name list; runId tr_mrgn84sp_15c5d602
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bun run typecheck (plugin/)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/deploy-local.test.ts src/release-install-assets.test.ts src/tools/spec.test.ts src/manifest-doc-drift.test.ts src/adv-stability-docs-assets.test.ts src/cli-bridge-contract.test.ts
- **[agenda]** follow_ups: Confirm design.md matches validated packet before completing design gate
- **[agenda]** follow_ups: adv_store_consolidate scan should warn about existing shallow-minted state dirs
- **[archive_only_evidence]** sources: git-rev-parse docs: --is-shallow-repository documented plumbing surface
- **[archive_only_evidence]** sources: git shallow.c: is_repository_shallow() structurally checks .git/shallow file
- **[archive_only_evidence]** sources: git 2.15.0 release notes: --is-shallow-repository shipped 2017; universally available
- **[archive_only_evidence]** sources: shallow root repro: rev-list --max-parents=0 returns shallow boundary as fake root
- **[archive_only_evidence]** sources: git shallow boundary commit: boundary rewrites when .git/shallow changes
- **[archive_only_evidence]** sources: partial-clone technical doc: partial clone is independent of DAG shallowing; roots preserved
- **[archive_only_evidence]** sources: GitHub partial vs shallow clone: --filter=blob:none downloads all commits/trees; no .git/shallow
- **[archive_only_evidence]** architecture_assessment: Existing: projectId from rev-list --max-parents=0 HEAD with null-on-failure (vulnerable to moving shallow boundary). Reference: gate identity minting on --is-shallow-repository == false with typed refusal. Deviation MINOR: pre-check + typed refusal at the store.ts createStore mint chokepoint; no identity-basis change. ~40 read-side getProjectId call sites keep soft fallbacks; mint chokepoint refusal gives minimal correct blast radius.
- **[unresolved_action]** validation.blockers: Worker-side report persistence failed with WorkflowNotFoundError (submitted against source project); re-submitted by orchestrator via target_path
- **[unresolved_action]** validation.blockers: Validation used design-summary packet + local code; design.md artifact was unfetchable from worker context
- **[agenda]** follow_ups: Child runPokeedgeConsolidation: promote before/after production count proof and source-store retention from proposal constraints to explicit acceptance criteria before execution.
- **[agenda]** follow_ups: Child: verify at run time that the executing adv_store_consolidate came from a merged-trunk deploy (structural check), not a branch build.
- **[agenda]** follow_ups: Parent acceptance: confirm AC7 is evaluated as handoff-configured (child linked + child preconditions present), not silently re-interpreted as requiring live production counts.
- **[archive_only_evidence]** sources: Parent design amendment (adv_change_show _design): Parent branch never locally deployed; child runs only after parent merged to trunk and runtime deploys from trunk; child follows scan→dry-run→approval→execute for 67fe3e95/2d2af340 into 4d6b5898 with before/after proof.
- **[archive_only_evidence]** sources: Parent agreement (Constraints §6, Decision): Constraint 6: parent branch never locally deployed; runtime deploy only after parent merge to trunk. Decision: PokeEdge production migration moves from parent pre-release execution to linked post-merge child, preserving trunk-only deployment.
- **[archive_only_evidence]** sources: Child proposal (fast-follow link): Child is fast_follow_of fixShallowRepoIdentity; proposal requires deployed trunk, scan→dry-run→explicit approval→execute, preserve source stores, retained before/after recovery evidence.
- **[archive_only_evidence]** sources: AGENTS.md line 43 (deploy model): Live adv_* behavior changes only after pnpm run build + deploy-local.sh --fix + host restart. Confirms running the migration tool against un-merged branch code would require deploying that branch — which the design forbids; child instead runs merged trunk-deployed tool.
- **[archive_only_evidence]** sources: adv-archive command spec line 553: Production deploy is outside ADV gate lifecycle; ADV stops at verified default-branch push + local dev deploy. Confirms parent release legitimately ends without running production migration.
- **[archive_only_evidence]** sources: Trunk-worktree isolation policy (global instruction): Trunk checkout stays on default branch; branch work in worktrees. Corroborates that parent branch does not become deployed runtime except by explicit local deploy from worktree, which the design excludes.
- **[archive_only_evidence]** architecture_assessment: The amendment resolves a genuine circular dependency. Original AC7 required live PokeEdge production migration (before/after count proof) as a pre-release acceptance obligation, but the migration must run against the deployed consolidation tool, and per AGENTS.md:43 the tool only takes effect after build+deploy-local, and per trunk-only policy runtime deploy occurs only after merge to trunk. That made the pre-merge production operation impossible: proving the tool live required deploying un-merged branch code, violating the trunk-only invariant. The re-entry split cleanly separates concerns: (1) parent delivers tested tool + identity guard + specs, proven by AC1-AC6 (guard trip/non-trip, dry-run plan, live-item recreation, collision halt, idempotency) — all satisfiable in tests without a production run; (2) child runPokeedgeConsolidation, linked as fast_follow_of the parent, owns the live migration and holds the before/after production proof, gated on deployed trunk. AC7 in the parent is now a documented-handoff verification (child linked + child proposal requires trunk+scan+dry-run+approval+before/after) rather than a live production run. Tool safety is preserved: agreement Constraints (structural shallow detection, dry-run default, no history rewrite, approval-gated audited mutation) and Avoidances (no silent fallback, no newest-wins collision resolution, no manual file shuffling, no orphan deletion without separate approval) are unchanged by the amendment. Structural guards remain: fast-follow linkage is durable (parent_change_id present on child), child proposal encodes the trunk precondition and scan→dry-run→approval→execute sequence, and the specific source/target store IDs (67fe3e95, 2d2af340 → 4d6b5898) are carried in both parent AC7 and child proposal.
- **[agenda]** follow_ups: Child needs explicit acceptance criteria for deployed-trunk identity, source-store retention, and before/after counts.
- **[agenda]** follow_ups: Parent acceptance must assess AC7 as child handoff configuration.
- **[archive_only_evidence]** sources: Advance AGENTS deployment model: Source edits require build, local deployment, and OpenCode/plugin-host restart before runtime behavior changes.
- **[archive_only_evidence]** sources: ADV archive contract: Production deployment is outside parent release lifecycle after verified default-branch push.
- **[archive_only_evidence]** sources: Trunk worktree policy: Branch work stays isolated; runtime deployment is trunk-only by user decision.
- **[archive_only_evidence]** sources: Parent agreement and design amendment: Parent holds tested tool safety; linked child holds deployed-trunk production proof.
- **[archive_only_evidence]** architecture_assessment: Original AC7 created an impossible loop: live production proof required runtime deployment, but trunk-only policy prohibits deployment of the unmerged branch. The fast-follow child removes that loop while retaining parent safety obligations and production evidence.
- **[unresolved_action]** required_main_agent_actions: Obtain scope decision before remediation because failures include unrelated adv-epic and repository instruction assets.
- **[archive_only_evidence]** findings: [blocker] Full suite: 3 failed / 330 passed test files; 5 failed / 4928 passed tests. Missing adv-epic optional-entry wording, AGENTS Temporal/schema/CI-order contract text, and external citation for rq-temporalTsDeterminismDocs01.
- **[archive_only_evidence]** findings: [blocker] pnpm run check failed at Prettier after prior validation stages completed.
- **[unresolved_action]** suggested_handoff: Repair documented asset-contract omissions and formatting only if scope is explicitly expanded. — in_scope: adv-epic wording, AGENTS contract text, external citation, Prettier formatting
- **[unresolved_action]** recommended_next_action: ask_user
- **[archive_only_evidence]** findings: [info] Full suite fully green after drift repairs (4956/4956).
- **[archive_only_evidence]** findings: [info] Static check pipeline fully green.
- **[unresolved_action]** suggested_handoff: No handoff required; full suite and static check are green. — in_scope: None — verification complete

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |

## Unresolved Actions

- Decide whether to route the pre-existing advance-epics-assets.test.ts failure to the docs task (tk-2b3929ed4d2c) or a separate fix — it will fail the full-suite verification gate (tk-6db01c6b815e) if left as-is.
- finish_owned_scope_then_report: Added one row to docs/cli-surface-matrix.md and appended adv_store_consolidate to the frozen snapshot in cli-bridge-contract.test.ts. Strictly OUT_OF_SCOPE reads as 'spec/docs edits', but these two files are mechanical registration invariants enforced by existing asset tests (cli-surface-matrix coverage requires a row per tool; frozen snapshot requires the new name). Without them the acceptance gate's full suite would fail on registration wiring, which IS in scope. Both edits are append-only single lines preserving the guards' intent.
- verification_missing: No adv_run_test evidence found for reported command: bunx vitest run src/tools/store-consolidate.test.ts --maxWorkers=2 (RED, runId tr_mrgkd7dt_e8c1c369)
- verification_missing: No adv_run_test evidence found for reported command: bunx vitest run src/tools/store-consolidate.test.ts --maxWorkers=2 (GREEN, runId tr_mrgkqv91_55cf3330)
- verification_missing: No adv_run_test evidence found for reported command: bun run typecheck (VERIFY, runId tr_mrgkrg0x_6b3754db)
- verification_missing: No adv_run_test evidence found for reported command: bunx vitest run tool-registry/tool-title/cli-bridge-contract/cli-surface-matrix/tool-name-assets/advance-epics-assets (VERIFY, runId tr_mrgkryxr_12b913e4)
- verification_missing: No adv_run_test evidence found for reported command: bunx vitest run tool-arg-preflight/integration/worktree-warp-mode-assets/active-change-pointer/adv-engineer-assets/adv-designer-assets (VERIFY, runId tr_mrgkts0n_83d2e356)
- verification_missing: No adv_run_test evidence found for reported command: bunx vitest run src/tools/store-consolidate.test.ts --maxWorkers=2 && bun run typecheck (VERIFY post lint/format, runId tr_mrgkvdvr_e0e42244)
- verification_missing: No adv_run_test evidence found for reported command: bunx vitest run src/tools/store-consolidate.test.ts --maxWorkers=2 (red)
- verification_missing: No adv_run_test evidence found for reported command: bunx vitest run src/tools/store-consolidate.test.ts --maxWorkers=2 (green)
- verification_missing: No adv_run_test evidence found for reported command: bun run typecheck
- verification_missing: No adv_run_test evidence found for reported command: bunx vitest run src/tools/store-consolidate.test.ts src/cli-bridge-contract.test.ts --maxWorkers=2 (verify)
- verification_missing: No adv_run_test evidence found for reported command: bunx eslint src/tools/store-consolidate.ts src/tools/store-consolidate.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bun run typecheck (plugin/)
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/deploy-local.test.ts src/release-install-assets.test.ts src/tools/spec.test.ts src/manifest-doc-drift.test.ts src/adv-stability-docs-assets.test.ts src/cli-bridge-contract.test.ts
- Worker-side report persistence failed with WorkflowNotFoundError (submitted against source project); re-submitted by orchestrator via target_path
- Validation used design-summary packet + local code; design.md artifact was unfetchable from worker context
- Obtain scope decision before remediation because failures include unrelated adv-epic and repository instruction assets.
- Repair documented asset-contract omissions and formatting only if scope is explicitly expanded. — in_scope: adv-epic wording, AGENTS contract text, external citation, Prettier formatting
- ask_user
- No handoff required; full suite and static check are green. — in_scope: None — verification complete
