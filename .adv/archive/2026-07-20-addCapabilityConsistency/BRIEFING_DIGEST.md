# Archive Briefing Digest

**Change ID:** addCapabilityConsistency
**Title:** Add capability consistency detection
**Status:** archived
**Generated:** 2026-07-20T19:36:52.535Z

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

Showing 62 of 62 durable facts.

- **[report_follow_up]** follow_ups: debt-marker helper (bin/lib/arch-scan/helpers/debt-marker.{ts,test.ts}) already existed in worktree when I started — produced by parallel/preceding task tk-4d116d975b24. I did NOT touch those files; both are currently uncommitted.
- **[report_follow_up]** follow_ups: Asset test for 4-file markdown sync (command.md + SKILL.md + spec.json + docs/specs/arch-scan.md) is tk-f7bd0b05be75 — out of scope here; runs after the 5 rule tasks complete.
- **[report_follow_up]** follow_ups: Execution bridge wiring registry into bin/arch-scan.ts is tk-970cacb8a8e7 — explicitly noted in task as 'NOT expected to work yet'.
- **[unresolved_action]** required_main_agent_actions: Commit progress on change/addCapabilityConsistency branch. Task description asked me to run adv_task_checkpoint taskId: tk-5d489ac19151, but that tool is not in my leaf-agent surface and my contract forbids orchestration actions. Please run checkpoint from the orchestrator.
- **[archive_only_evidence]** decisions: Added entry-level intent_required?: readonly string[] on CapabilityRelationship in addition to the spec's per-counterpart intent_required? field — Task spec interface signature places intent_required? inside acceptable_counterparts items, but the 5 entry data definitions (entries 4 and 5) populate it at the entry top level. Including both satisfies both readings; only entries 4/5 use the entry-level field (no entry populates per-counterpart intent_required). Required for `as const satisfies` to accept entries 4/5.
- **[archive_only_evidence]** decisions: Used ReadonlyArray<{...}> instead of spec's literal `readonly Array<{...}>` syntax for object-element arrays — TypeScript rejects `readonly Array<T>` with TS1354 (readonly modifier only permitted on array/tuple literal types, not generic type references). ReadonlyArray<{...}> is the canonical desugared form. Same fix applied to nested ReadonlyArray<{id,reason}> in CapabilityCoverage.
- **[archive_only_evidence]** decisions: Cast pattern `value as unknown as T` instead of direct `value as T` in validators — TS strict overlap check rejects direct cast from Record<string, unknown> (post-isObject guard) to interfaces with literal-typed properties. Two-step cast through unknown is the canonical validated-narrow pattern.
- **[archive_only_evidence]** decisions: Added zero-dependency runtime validators validateCapabilityEvidence and validateCapabilityFinding (plus ValidationResult<T>) in schema.ts — Task spec accepts 'runtime shape checks via plain assertions' when zod unavailable; bin/lib/ is zero-dependency per slop-scan precedent. Validators return path-qualified issue lists — required for downstream rule tasks to produce P34-compliant evidence-backed findings.
- **[archive_only_evidence]** decisions: Added helper exports findCapabilityRelationship(id) and relationshipsByPhase(phase) in registry.ts — Small ergonomic helpers for the downstream engine (tk-cf5ea29d29ad) and bridge (tk-970cacb8a8e7) tasks. Within registry module's own API surface; not used in this task but unblocks the immediately-blocked downstream task.
- **[archive_only_evidence]** verification: bun test bin/lib/arch-scan/schema.test.ts bin/lib/arch-scan/registry.test.ts (0) — 22 pass / 0 fail (126 expect() calls). 9 schema tests cover literal unions, evidence+finding validators (accept/reject paths), AbsenceProof nesting, CapabilityCoverage shape. 13 registry tests cover length=5, unique ids, ordered catalog, compile-time satisfies, detection_phase∈{1,3}, valid severity/confidence unions, RegExp-instance check, non-empty file_globs, ≥1 counterpart per entry, ReDoS heuristic screen, Rev #8 autoinstrumentation counterparts, Rev #9 medium-confidence CSP rule with 2 exception signals, entry-level intent_required on manifest+scaffold (DONT9/DONT10).
- **[archive_only_evidence]** verification: npx -y -p typescript@5.6.3 tsc --project (isolated strict tsconfig covering schema.ts + registry.ts) (0) — Strict-mode compile clean: strict, strictNullChecks, noImplicitAny, skipLibCheck, noFallthroughCasesInSwitch. No any types; as const satisfies validates; readonly modifiers correct.
- **[archive_only_evidence]** verification: plugin/node_modules/.bin/tsc (v6.0.3) --project (same isolated strict tsconfig) (0) — Strict-mode compile clean under project's own tsc 6.0.3 — confirms strict validity independent of npx tsc version.
- **[unresolved_action]** required_main_agent_actions: Mark tk-5d489ac19151 as done; reviewer evidence is this report
- **[archive_only_evidence]** verification: tests_run=npx -y -p typescript@5.6.3 tsc --strict --target ES2022 --moduleResolution Bundler --module ESNext --skipLibCheck --noEmit --noFallthroughCasesInSwitch --esModuleInterop bin/lib/arch-scan/schema.ts bin/lib/arch-scan/registry.ts bin/lib/arch-scan/helpers/debt-marker.ts, bun test bin/lib/arch-scan/schema.test.ts bin/lib/arch-scan/registry.test.ts results=pass — Corrected strict TypeScript compile completed with exit 0. Bun v1.3.14 completed 22 passing tests, 0 failures, and 126 expect() calls across 2 files in 66ms.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: npx -y -p typescript@5.6.3 tsc --strict --target ES2022 --moduleResolution Bundler --module ESNext --skipLibCheck --noEmit --noFallthroughCasesInSwitch --esModuleInterop bin/lib/arch-scan/schema.ts bin/lib/arch-scan/registry.ts bin/lib/arch-scan/helpers/debt-marker.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bun test bin/lib/arch-scan/schema.test.ts bin/lib/arch-scan/registry.test.ts
- **[archive_only_evidence]** decisions: Used fixtures-on-disk layout under __tests__/fixtures/<name>/ instead of tmpdir+writeFile. — Task spec explicitly required fixtures dir; on-disk fixtures keep package.json line map stable so test can assert exact line numbers (8/11/14) for trigger evidence (P34 file:line). Path resolved via import.meta.url, standard Bun pattern.
- **[archive_only_evidence]** decisions: Created SECOND fixture (knip-config-with-workspace-hoist/) for exception-signal negative test. — Parallel fixture structure easier to audit; negative fixture carries own README. Keeps positive fixture pristine for multi-finding case.
- **[archive_only_evidence]** decisions: Positive fixture includes knip + eslintConfig + prettier config blocks (3 trigger hits). — Task offered the option; enables dedicated multi-finding test proving per-trigger-hit fan-out works end-to-end.
- **[archive_only_evidence]** decisions: Hoist fixture uses pnpm-workspace.yaml with hoist:true content rather than lerna.json. — Rule exception regex /(hoist|workspace)/i matches on file CONTENT; filename alone would not have triggered. README documents this.
- **[archive_only_evidence]** decisions: Did not use bin/oc-test gate for single-file iteration. — oc-test-gate policy says single-file inline TDD uses adv_run_test or direct invocation. adv_run_test failed (cross-project store mismatch), fell back to direct bun test via bash.
- **[archive_only_evidence]** verification: bun test bin/lib/arch-scan/__tests__/rule-config-vs-dep.test.ts (0) — 4 pass / 0 fail, 43 expect() calls, 43ms. All rule assertions GREEN: registry 5-mapping sanity, knip-config finding shape (relationship_id/severity=major/confidence=high/detection_method=regex, trigger evidence file=package.json line=8, absence_proof with searchedRoots+includedGlobs containing **/package.json+parseFailures array), multi-finding (eslintConfig line=11 + prettier line=14), and exception suppression via pnpm-workspace.yaml hoist.
- **[archive_only_evidence]** verification: bun test bin/lib/arch-scan/ (0) — 67 pass / 0 fail across 7 files (280 expect() calls, 175ms). No regressions in evaluator.test.ts, registry.test.ts, scan.test.ts, schema.test.ts, helpers/debt-marker.test.ts, or new rule-config-vs-dep.test.ts.
- **[archive_only_evidence]** verification: node -e JSON.parse on both fixture package.json files (0) — Both fixture package.json files parse as valid JSON.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: bash-bun-test-rule-config-vs-dep
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: bash-bun-test-arch-scan-suite
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: bash-json-validate-fixtures
- **[unresolved_action]** required_main_agent_actions: Do not mark tk-5d489ac19151 done from this report yet: resolve the non-reproducible TypeScript static-check requirement and obtain passing reviewer evidence.
- **[unresolved_action]** required_main_agent_actions: Confirm ADV state identity/workflow availability for tk-5d489ac19151; reviewer submission required change scope because the active report schema rejected task scope.
- **[unresolved_action]** required_main_agent_actions: After target/lib expectation is clarified or corrected, rerun the static check. The ES2022-targeted strict check already exits 0; unit test evidence is passing.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] A standalone TypeScript strict check without --target/--lib defaults to legacy library definitions; source using dotAll RegExp, Array.find/includes, and Number.isFinite needs an explicit modern target/lib for reproducible evidence.
- **[archive_only_evidence]** verification: tests_run=bun test bin/lib/arch-scan/schema.test.ts bin/lib/arch-scan/registry.test.ts, npx -y -p typescript@5.6.3 tsc --noEmit --strict --strictNullChecks --noImplicitAny --skipLibCheck bin/lib/arch-scan/schema.ts bin/lib/arch-scan/registry.ts --outdir /tmp/tsc-check, npx -y -p typescript@5.6.3 tsc --noEmit --target ES2022 --strict --strictNullChecks --noImplicitAny --skipLibCheck bin/lib/arch-scan/schema.ts bin/lib/arch-scan/registry.ts --outdir /tmp/tsc-check results=fail — Unit suite: 22 pass, 0 fail, 126 expect() calls, 47.00ms. Mandated TS 5.6.3 command failed with TS1501 at registry.ts:95; TS2339/TS7006 at registry.ts:269; TS2339 at schema.ts:117; TS2550 at schema.ts:157,163. Same command plus --target ES2022 exited 0. Static review confirms schema exports at schema.ts:47-99 match requested shapes; structured evidence at 47-53; registry TypeScript source with no YAML-loader matches in bin/lib/arch-scan; Rev #8 counterparts at registry.ts:91-107; Rev #9 confidence medium at 192-207; five mappings at 123-149; phase-3 intents at 227-231 and 253-257; as const satisfies at 261. All registry patterns are bounded literals/alternations or simple quantified character classes; no nested quantifier detected. Deviations accepted: entry-level intent_required preserves relationship-level semantics while interface permits per-counterpart form (registry.ts:50,62); ReadonlyArray is necessary because readonly Array is TS1354-invalid; unknown-to-target double cast follows runtime validation without runtime semantic change (schema.ts:172-174,274-276).
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bun test bin/lib/arch-scan/schema.test.ts bin/lib/arch-scan/registry.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: npx -y -p typescript@5.6.3 tsc --noEmit --strict --strictNullChecks --noImplicitAny --skipLibCheck bin/lib/arch-scan/schema.ts bin/lib/arch-scan/registry.ts --outdir /tmp/tsc-check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: npx -y -p typescript@5.6.3 tsc --noEmit --target ES2022 --strict --strictNullChecks --noImplicitAny --skipLibCheck bin/lib/arch-scan/schema.ts bin/lib/arch-scan/registry.ts --outdir /tmp/tsc-check
- **[unresolved_action]** required_main_agent_actions: Build contract.reviewMatrix via adv_contract_review_matrix_set covering all 25 contract items (C1-C10, DONT1-DONT10, OOS1-OOS4)
- **[unresolved_action]** required_main_agent_actions: Compose executive-summary.md and persist via adv_change_update executiveSummary
- **[unresolved_action]** required_main_agent_actions: Render Approval Consequence Context (8 categories) and present acceptance sign-off prompt
- **[unresolved_action]** required_main_agent_actions: Do NOT complete acceptance gate until matrix + executive summary are workflow-visible
- **[wisdom_candidate]** wisdom_candidates: [convention] Per-trigger counterpart scoping is a required invariant for any multi-mapping relationship registry entry — without it, unrelated owner deps silently mask real findings. Document as a convention for future capability-relationship additions.
- **[archive_only_evidence]** changes_made: bin/lib/arch-scan/evaluator.ts: findCounterpart now accepts triggerMatch and skips counterparts whose trigger_pattern does not match the originating trigger hit; evaluateRelationship calls findCounterpart per-trigger instead of once up-front
- **[archive_only_evidence]** changes_made: bin/lib/arch-scan/registry.ts: AcceptableCounterpart gains optional trigger_pattern discriminator; populated on the 5 config-vs-dep mappings (knip/eslint/prettier/stylelint/commitlint)
- **[archive_only_evidence]** changes_made: bin/lib/arch-scan/__tests__/rule-config-vs-dep.test.ts: Regression test 'does not let one tool dependency satisfy another tool\'s config block' using new fixture config-with-unrelated-owner-dep
- **[archive_only_evidence]** changes_made: bin/lib/arch-scan/__tests__/fixtures/config-with-unrelated-owner-dep/package.json: Fixture: prettier installed but knip missing; asserts knip finding fires and prettier does NOT silently satisfy knip
- **[archive_only_evidence]** changes_made: plugin/src/adv-arch-scan-assets.test.ts: Strengthen rq-archcap01 4-surface sync: now asserts spec.requirements includes 'rq-archcap01' AND command.md + SKILL.md + docs/specs/arch-scan.md all contain 'rq-archcap01'
- **[archive_only_evidence]** changes_made: .opencode/command/adv-arch-scan.md: Tag Capability Consistency stack-pack row with <!-- rq-archcap01 --> marker
- **[archive_only_evidence]** verification: tests_run=pnpm run typecheck (project tsc --noEmit), bun test bin/lib/arch-scan/ (95 pass / 0 fail / 501 expect() calls / 12 files), vitest run src/adv-arch-scan-assets.test.ts (16 pass / 0 fail) results=pass — Worktree HEAD f0f6d7bb; orchestrator re-ran typecheck + bun test + vitest asset test; AC scenarios verified by reviewer worker via CLI smoke; contract matrix not yet built by orchestrator.
- **[unresolved_action]** consumer_warnings: verification_missing: Sub-agent ENGINEER_REPORT submissions for tk-4d116d975b24 and tk-cf5ea29d29ad failed (Temporal unreachable from sub-agent session); work verified on disk by orchestrator. Session/project-context gap, not a code defect.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run typecheck (project tsc --noEmit)
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bun test bin/lib/arch-scan/ (95 pass / 0 fail / 501 expect() calls / 12 files)
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: vitest run src/adv-arch-scan-assets.test.ts (16 pass / 0 fail)
- **[unresolved_action]** required_main_agent_actions: Persist Release Readiness Summary into executive-summary.md via adv_change_update executiveSummary before archive
- **[unresolved_action]** required_main_agent_actions: Verify workflow-visible executive-summary metadata before archive sign-off
- **[wisdom_candidate]** wisdom_candidates: [pattern] Precompute relationship-global counterpart evidence once, then apply trigger-specific discriminators in memory — avoids O(triggers × counterparts) repository rescans.
- **[archive_only_evidence]** changes_made: bin/lib/arch-scan/evaluator.ts: Precompute relationship-global counterpart evidence once per relationship, then apply trigger-specific discriminators in memory; eliminates per-trigger repository rescans while preserving per-trigger scoping invariant
- **[archive_only_evidence]** changes_made: bin/lib/arch-scan/report.test.ts: Added direct text and JSON renderer coverage; 7/7 production scanner files now have adjacent tests
- **[archive_only_evidence]** verification: tests_run=bun test bin/lib/arch-scan/ (97 pass / 0 fail), vitest src/adv-arch-scan-assets.test.ts (16 pass / 0 fail), pnpm run typecheck (clean), git diff --check (clean), manual scans: temp files, debug code, secrets, ReDoS, path traversal, TODO/FIXME results=pass — Worktree HEAD dacca1f0. bun test bin/lib/arch-scan/: 97 pass / 0 fail / 507 expect() calls across 13 files (was 95; +2 from report.test.ts). vitest src/adv-arch-scan-assets.test.ts: 16 pass / 0 fail. pnpm run typecheck: clean. 7/7 source-test pairing complete. No temp/debug artifacts. No hardcoded secrets. No ReDoS. No path traversal. No TODO/FIXME in critical paths. No new env vars/migrations/external services.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bun test bin/lib/arch-scan/ (97 pass / 0 fail)
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: vitest src/adv-arch-scan-assets.test.ts (16 pass / 0 fail)
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run typecheck (clean)
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check (clean)
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: manual scans: temp files, debug code, secrets, ReDoS, path traversal, TODO/FIXME

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| C1 | constraint | pass |
| C2 | constraint | pass |
| C3 | constraint | pass |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| C7 | constraint | respected |
| C8 | constraint | pass |
| C9 | constraint | pass |
| C10 | constraint | pass |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| DONT7 | avoidance | respected |
| DONT8 | avoidance | respected |
| DONT9 | avoidance | respected |
| DONT10 | avoidance | respected |
| OOS1 | out_of_scope | missing |
| OOS2 | out_of_scope | missing |
| OOS3 | out_of_scope | missing |
| OOS4 | out_of_scope | missing |

## Unresolved Actions

- Commit progress on change/addCapabilityConsistency branch. Task description asked me to run adv_task_checkpoint taskId: tk-5d489ac19151, but that tool is not in my leaf-agent surface and my contract forbids orchestration actions. Please run checkpoint from the orchestrator.
- Mark tk-5d489ac19151 as done; reviewer evidence is this report
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: npx -y -p typescript@5.6.3 tsc --strict --target ES2022 --moduleResolution Bundler --module ESNext --skipLibCheck --noEmit --noFallthroughCasesInSwitch --esModuleInterop bin/lib/arch-scan/schema.ts bin/lib/arch-scan/registry.ts bin/lib/arch-scan/helpers/debt-marker.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bun test bin/lib/arch-scan/schema.test.ts bin/lib/arch-scan/registry.test.ts
- verification_missing: No durable adv_run_test evidence found for run_id: bash-bun-test-rule-config-vs-dep
- verification_missing: No durable adv_run_test evidence found for run_id: bash-bun-test-arch-scan-suite
- verification_missing: No durable adv_run_test evidence found for run_id: bash-json-validate-fixtures
- Do not mark tk-5d489ac19151 done from this report yet: resolve the non-reproducible TypeScript static-check requirement and obtain passing reviewer evidence.
- Confirm ADV state identity/workflow availability for tk-5d489ac19151; reviewer submission required change scope because the active report schema rejected task scope.
- After target/lib expectation is clarified or corrected, rerun the static check. The ES2022-targeted strict check already exits 0; unit test evidence is passing.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bun test bin/lib/arch-scan/schema.test.ts bin/lib/arch-scan/registry.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: npx -y -p typescript@5.6.3 tsc --noEmit --strict --strictNullChecks --noImplicitAny --skipLibCheck bin/lib/arch-scan/schema.ts bin/lib/arch-scan/registry.ts --outdir /tmp/tsc-check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: npx -y -p typescript@5.6.3 tsc --noEmit --target ES2022 --strict --strictNullChecks --noImplicitAny --skipLibCheck bin/lib/arch-scan/schema.ts bin/lib/arch-scan/registry.ts --outdir /tmp/tsc-check
- Build contract.reviewMatrix via adv_contract_review_matrix_set covering all 25 contract items (C1-C10, DONT1-DONT10, OOS1-OOS4)
- Compose executive-summary.md and persist via adv_change_update executiveSummary
- Render Approval Consequence Context (8 categories) and present acceptance sign-off prompt
- Do NOT complete acceptance gate until matrix + executive summary are workflow-visible
- verification_missing: Sub-agent ENGINEER_REPORT submissions for tk-4d116d975b24 and tk-cf5ea29d29ad failed (Temporal unreachable from sub-agent session); work verified on disk by orchestrator. Session/project-context gap, not a code defect.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run typecheck (project tsc --noEmit)
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bun test bin/lib/arch-scan/ (95 pass / 0 fail / 501 expect() calls / 12 files)
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: vitest run src/adv-arch-scan-assets.test.ts (16 pass / 0 fail)
- Persist Release Readiness Summary into executive-summary.md via adv_change_update executiveSummary before archive
- Verify workflow-visible executive-summary metadata before archive sign-off
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bun test bin/lib/arch-scan/ (97 pass / 0 fail)
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: vitest src/adv-arch-scan-assets.test.ts (16 pass / 0 fail)
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run typecheck (clean)
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check (clean)
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: manual scans: temp files, debug code, secrets, ReDoS, path traversal, TODO/FIXME
