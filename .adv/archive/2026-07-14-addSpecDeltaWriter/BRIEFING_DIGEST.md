# Archive Briefing Digest

**Change ID:** addSpecDeltaWriter
**Title:** Add spec delta writer
**Status:** archived
**Generated:** 2026-07-14T14:15:23.163Z

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

Showing 68 of 68 durable facts.

- **[agenda]** follow_ups: tk-dbe87a62be7b: implement and register adv_delta_add MCP tool on top of store.specDeltas.add — mirror plugin/src/tools/wisdom.ts for target-path confirmation, recovery fields, tool-arg-preflight/title/banner surfaces
- **[agenda]** follow_ups: tk-35ad732df458: archive integration check — tool-written add delta consumed once by archive, new-capability spec creation, fail-closed on conflict
- **[archive_only_evidence]** decisions: Reducer rejects duplicate requirement ids across ALL capabilities in the change, not just the target capability — Mirrors validator/conflicts.ts global seenIds semantics and archive fail-closed behavior; exact-identifier matching is deterministic, not heuristic
- **[archive_only_evidence]** decisions: Duplicate delta ids rejected across all capabilities too — dl- ids are globally unique by construction; a duplicate would double-apply at archive time and fail closed — rejecting at write time is atomic and deterministic
- **[archive_only_evidence]** decisions: CAPABILITY_KEY_PATTERN exported from types/specs.ts, shared by zod CapabilityKeySchema, workflow reducer, and disk store — Single source of truth (P33 structural correctness); reducer validates defensively because Temporal signal payloads arrive unvalidated on the wire
- **[archive_only_evidence]** decisions: No projectAfter on the workflow handler; store op owns cache refresh + persistStateToDisk — Mirrors the adv_wisdom_add writer pattern exactly (wisdomAddedSignal handler has no projection either)
- **[archive_only_evidence]** decisions: Store op throws typed error (surfacing latest signal_rejection message) before any cache/disk refresh when the delta did not land — AC2 atomic semantics: typed validation error with the change delta record unchanged; rejection evidence flows from workflow state
- **[archive_only_evidence]** decisions: Workflow-level test asserts monotonic lastSignalAt (truthy) rather than fixture timestamp; payload.addedAt behavior asserted in the pure reducer unit test — setLastSignalAt is monotonic-max; intervening signal rejections stamp workflowNow() (real test-env clock), so older fixture timestamps cannot move it backwards
- **[archive_only_evidence]** decisions: Disk store gained a specDeltas.add fallback mirroring the reducer contract — Store interface is shared; disk backend (P2.7 substrate) must implement the new group for type completeness and cold-start parity
- **[archive_only_evidence]** verification: bunx vitest run src/temporal/change-state.spec-delta.test.ts src/storage/store-temporal/spec-deltas.test.ts src/temporal/messages.test.ts src/temporal/workflows.signal-handlers.test.ts (1) — RED (runId tr_mrk31vxv_d93e4806): all new tests fail before implementation — missing schema, reducer, signal binding, store op; 50-vs-51 signal contract mismatch
- **[archive_only_evidence]** verification: bunx vitest run src/temporal/change-state.spec-delta.test.ts src/storage/store-temporal/spec-deltas.test.ts src/temporal/messages.test.ts src/temporal/workflows.signal-handlers.test.ts (0) — GREEN (runId tr_mrk3hmbn_58a124df): all focused tests pass after implementation
- **[archive_only_evidence]** verification: bunx vitest run <same 4 files> && pnpm run typecheck (0) — VERIFY (runId tr_mrk3mtgh_8d735bbe): focused tests pass + tsc --noEmit clean
- **[archive_only_evidence]** verification: bin/oc-test targeted -- <10 related files: change-state, signal-rejection, archive-activity, projection, bundle-boundary, disk-projection, store-disk, store-temporal index, signal-integration, queries> (0) — 116/116 related tests pass — reducer neighbors, archive delta consumer, projection, structural boundary, store backends
- **[archive_only_evidence]** verification: bin/oc-test targeted -- <12 related files: workflows.epic/ops-follow-up/search-attrs, change-state crash-recovery/size-guard/ops-follow-up/worktree-auto-manage, store-temporal changes, no-disk-writes-invariant, store-types, memo, workflow-start> (0) — 99/99 second-ring neighbor tests pass
- **[archive_only_evidence]** verification: bunx eslint <15 touched files>; bunx prettier --write <4 files>; pnpm run schemas:check (0) — ESLint clean on all touched files; Prettier formatting applied; generated JSON schemas in sync
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bunx vitest run src/temporal/change-state.spec-delta.test.ts src/storage/store-temporal/spec-deltas.test.ts src/temporal/messages.test.ts src/temporal/workflows.signal-handlers.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bunx vitest run src/temporal/change-state.spec-delta.test.ts src/storage/store-temporal/spec-deltas.test.ts src/temporal/messages.test.ts src/temporal/workflows.signal-handlers.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bunx vitest run <same 4 files> && pnpm run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- <10 related files: change-state, signal-rejection, archive-activity, projection, bundle-boundary, disk-projection, store-disk, store-temporal index, signal-integration, queries>
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- <12 related files: workflows.epic/ops-follow-up/search-attrs, change-state crash-recovery/size-guard/ops-follow-up/worktree-auto-manage, store-temporal changes, no-disk-writes-invariant, store-types, memo, workflow-start>
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bunx eslint <15 touched files>; bunx prettier --write <4 files>; pnpm run schemas:check
- **[archive_only_evidence]** decisions: Dedicated tools/spec-delta.ts module rather than extending tools/spec.ts — Mirrors the adv_wisdom_add writer pattern (dedicated tools/wisdom.ts); keeps read-only spec.ts separate from the change-mutating writer; matches the design's 'mirror adv_wisdom_add writer pattern across ... MCP registry' directive.
- **[archive_only_evidence]** decisions: Recovery mode refuses the disk-projection write even with valid poisoned-history evidence — Task constraint explicitly forbids 'direct disk workaround'. A disk-projection delta write would bypass the workflow reducer's duplicate-detection invariants and the archive-as-sole-global-writer boundary, creating an unverifiable state fork. The tool returns a typed refusal with remediation hint (recover the workflow first via adv_temporal_diagnose / adv_change_status_repair, then retry). This satisfies AC5 'follows existing audited recovery semantics OR refuses without modifying state' via the refuse branch.
- **[archive_only_evidence]** decisions: Tool enforces >=1 scenario beyond DeltaAddSchema's optional scenarios field — AC1 requires 'at least one Given/When/Then scenario'; RequirementSchema has scenarios as optional, so the tool-level guard closes the gap without weakening the schema used by archive for legacy deltas.
- **[archive_only_evidence]** decisions: Validated capability/delta captured into const locals before closure capture — TypeScript narrowing of `{capability?, error?}` union does not survive closure capture; explicit locals preserve narrowing into withTargetPathStore and runAdd without re-assertion.
- **[archive_only_evidence]** decisions: adv_delta_add added to activeChangeRepointTools in index.ts — The tool is a change mutator carrying args.changeId; same category as adv_wisdom_add / adv_contract_mint. Cross-project calls are already exempt via args.target_path check in handleToolExecuteBefore.
- **[archive_only_evidence]** verification: bun run test -- src/tools/spec-delta.test.ts (RED) (1) — RED tr_mrk4g7vy_73a4c30d: module-not-found before implementation
- **[archive_only_evidence]** verification: bun run test -- src/tools/spec-delta.test.ts src/tool-registry.test.ts src/cli-bridge-contract.test.ts src/tool-registry.surface.test.ts src/utils/tool-title.test.ts src/utils/banner.test.ts src/utils/tool-arg-preflight.test.ts src/tools/spec.test.ts src/tools/wisdom-derived-export.test.ts src/tools/contract.test.ts src/temporal/change-state.spec-delta.test.ts src/storage/store-temporal/spec-deltas.test.ts src/temporal/workflows.signal-handlers.test.ts src/temporal/messages.test.ts (GREEN) (0) — GREEN tr_mrk4onuj_ed8283ce: 14 test files pass after implementing spec-delta.ts + 6 registration-surface edits
- **[archive_only_evidence]** verification: bun run test -- <22 files> && bun run lint && bun run typecheck && bun run format:check (VERIFY) (0) — VERIFY tr_mrk50trs_94528c30: 561/561 tests pass across 22 files (spec-delta, tool-registry, cli-bridge, surface, tool-title, banner, arg-preflight, spec, wisdom-derived-export, contract, change-state.spec-delta, store-temporal/spec-deltas, workflows.signal-handlers, messages, integration, adv-reviewer-asset, tool-name-assets, manifest, manifest-doc-drift, deploy-local, schema-registry, rq-backlogCoord09-spec-compliance, agent-tool-contracts-assets). ESLint, tsc --noEmit, prettier --check all clean.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bun run test -- src/tools/spec-delta.test.ts (RED)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bun run test -- src/tools/spec-delta.test.ts src/tool-registry.test.ts src/cli-bridge-contract.test.ts src/tool-registry.surface.test.ts src/utils/tool-title.test.ts src/utils/banner.test.ts src/utils/tool-arg-preflight.test.ts src/tools/spec.test.ts src/tools/wisdom-derived-export.test.ts src/tools/contract.test.ts src/temporal/change-state.spec-delta.test.ts src/storage/store-temporal/spec-deltas.test.ts src/temporal/workflows.signal-handlers.test.ts src/temporal/messages.test.ts (GREEN)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bun run test -- <22 files> && bun run lint && bun run typecheck && bun run format:check (VERIFY)
- **[agenda]** follow_ups: Confirm exact GitHub issue #64 text during discovery.
- **[agenda]** follow_ups: Specify duplicate replay behavior as a hard conflict before persistence.
- **[archive_only_evidence]** sources: Delta schema and validation: DeltaSchema is a discriminated union; add carries a full RequirementSchema and IDs have deterministic prefixes.
- **[archive_only_evidence]** sources: Archive delta engine: Add rejects duplicate requirement IDs; archive applies deterministic ordering and fails closed.
- **[archive_only_evidence]** sources: Change state shape: Deltas are a capability-keyed record in durable change workflow state.
- **[archive_only_evidence]** sources: Archive persistence: Archive applies each capability delta atomically to specs and fails archive on error.
- **[archive_only_evidence]** sources: Writer precedent: adv_wisdom_add provides append-only signal-driven tool, target-path, recovery, cache refresh, and disk fallback pattern.
- **[archive_only_evidence]** sources: Conflict validation: Duplicate requirement IDs can be structurally rejected before persistence.
- **[archive_only_evidence]** sources: Roadmap: Existing roadmap item #64 explicitly calls for an adv_delta_add MCP tool.
- **[archive_only_evidence]** architecture_assessment: Deltas are already strongly typed and archive-safe, but no delta mutation signal or tool exists. The correct path is an add-only, signal-driven writer that updates the existing capability-keyed ChangeWorkflowState.deltas record and reuses archive application unchanged.
- **[agenda]** follow_ups: Confirm exact GitHub/ROADMAP issue #64 wording during prep to ensure add_delta scope alignment (not re-verified verbatim this pass).
- **[agenda]** follow_ups: Decide and document capability-existence policy: allow new-capability add (matches createSpecFromDeltas) vs. explicit gated reject.
- **[agenda]** follow_ups: Pin target-path/recovery mirror to the change.ts mutation-tool pattern (target_confirmed + confirmationEvidence + recoveryMode='poisoned_history'), not the leaner wisdom.ts arg schema, to satisfy AC4/AC5.
- **[agenda]** follow_ups: Add an explicit AC2 test: a second add delta with a duplicate requirement.id is refused pre-persistence and state.deltas is unchanged (append never double-writes).
- **[agenda]** follow_ups: TASK_SCOPE/IN_SCOPE/OUT_OF_SCOPE/DONE_WHEN/STOP_WHEN/VERIFICATION packet anchors were not provided as a structured briefing packet; validation proceeded from persisted proposal/agreement/design and local source per existing prompt scope.
- **[archive_only_evidence]** sources: DeltaAddSchema + RequirementSchema (typed input contract): DeltaSchema is a discriminatedUnion on operation; DeltaAddSchema carries operation:'add' literal + full RequirementSchema (id, title, body, PrioritySchema, optional scenarios). Requirement/Scenario are .passthrough(). ID prefixes rq-/dl- are constants. Confirms the design's 'existing typed delta and requirement schemas, restricted to add' claim is structurally backed.
- **[archive_only_evidence]** sources: Archive add-delta application (duplicate + fail-closed): applyAddDelta rejects duplicate requirement IDs. applyDeltasToSpec sorts rename->remove->modify->add, stops on first error, only updates version metadata when the whole batch succeeds (fail-closed). createSpecFromDeltas creates a brand-new capability spec from adds (version 1.0.0). Confirms archive compatibility AND that a not-yet-existing capability is supported at archive time.
- **[archive_only_evidence]** sources: Archive activity consumes state.deltas fail-closed: On status==='archived', activities iterate Object.entries(state.deltas), call applySpecDelta per capability, and return {ok:false} on first failure (archive fails closed). applySpecDelta uses applyDeltasToSpec for existing specs and createSpecFromDeltas for missing ones. This is the sole global-spec writer, unchanged by the design.
- **[archive_only_evidence]** sources: Signal to reducer wiring pattern (mirror target): wisdomAddedSignal defined in messages.ts, name adv.change.wisdomAdded in CHANGE_WORKFLOW_SIGNAL_NAMES, handled via wf.setHandler(...signalMutation('wisdomAdded', applyWisdomAddedToState)). applyWisdomAddedToState pushes entry + setLastSignalAt. ChangeWorkflowState.deltas is Change['deltas']. A specDeltaAdded reducer would mirror this exactly: append to state.deltas[capability].
- **[archive_only_evidence]** sources: Change deltas state shape: deltas: z.record(z.string(), z.array(DeltaSchema)).optional().default({}). Capability-keyed array of deltas. Design's 'append the delta under state.deltas[capability]' matches the persisted shape; append (not replace) preserves multiple deltas per capability.
- **[archive_only_evidence]** sources: Structural duplicate-ID conflict validator (reusable pre-write check): checkDuplicateRequirementIds already detects add-delta requirement IDs colliding with existing spec IDs (context.existingRequirementIds) and with other in-change deltas, emitting typed DUPLICATE_REQUIREMENT_ID errors. Reusable to satisfy the design's pre-write duplicate rejection structurally rather than heuristically.
- **[archive_only_evidence]** sources: adv_wisdom_add writer template + 10-surface registration: adv_wisdom_add uses fireSignalAndRefresh (rq-cacheRefresh01) with disk fallback, snapshot emission, typed error handling. Registration truly spans tool-registry (bind + op-adapter list), index.ts op list, tool-arg-preflight, tool-title, store-temporal op, plus asset/cli-bridge/benchmark/registry contract tests. The design's 'Registration Surface' mirror list is real and complete.
- **[archive_only_evidence]** sources: Target-path/recovery pattern location (precision check): adv_wisdom_add's ADD path does NOT expose target_path/target_confirmed/recoveryMode on its tool arg schema; the richer untrusted-target-mutation (target_confirmed + confirmationEvidence) and poisoned_history recovery pattern lives in change.ts/epic.ts mutation tools. AC4 (target confirmation) and AC5 (poisoned-history recovery) therefore require the change.ts mutation-tool pattern, not the leaner wisdom.ts arg schema. This submission itself required target_confirmed for the untrusted target project, confirming the pattern.
- **[archive_only_evidence]** sources: Consumer capability exists (originating case): The originating PokeEdge consumer capability collection-dashboard already exists, so the writer's add delta targets an existing spec there; and even where a target capability is absent, createSpecFromDeltas covers new-capability creation at archive. The unblock path is viable end-to-end.
- **[archive_only_evidence]** sources: Roadmap provenance: Roadmap #64 explicitly requests an adv_delta_add MCP tool; the design implements the defined gap rather than inventing a parallel mechanism. Exact issue text not re-read this pass - see caution.
- **[archive_only_evidence]** architecture_assessment: The add-only adv_delta_add design is architecturally sound and correctly maps onto the existing Temporal-first, signal-driven, capability-keyed delta model. Deltas are already strongly typed (DeltaAddSchema + RequirementSchema, discriminated union), the archive engine is the sole global-spec writer and is fail-closed (activities.ts:624 returns {ok:false} on first delta failure), and change workflow state carries deltas as record<capability, Delta[]>. A specDeltaAdded signal + applySpecDeltaAddedToState reducer that appends to state.deltas[capability] is an exact structural analog of the proven wisdomAddedSignal/applyWisdomAddedToState pair. Pre-write structural validation is available and should reuse existing conflicts.ts duplicate-ID detection rather than a bespoke heuristic (satisfies P33 structural-correctness). The 10-surface registration mirror list is real and complete. Two precision items keep this at caution rather than pass: (1) the design's 'validate capability existence' input rule conflicts with the archive engine's legitimate new-capability creation path (createSpecFromDeltas); rejecting unknown capabilities at tool time would block the exact new-capability delta the archive can apply, so the intended behavior must be decided explicitly. (2) AC4/AC5 (target confirmation + poisoned-history recovery) require the change.ts mutation-tool target_confirmed/confirmationEvidence/recoveryMode pattern; the design says 'mirror existing signal writers' but adv_wisdom_add's ADD arg schema does not carry those fields, so the mirror source must be change.ts, not wisdom.ts, or AC4/AC5 will be under-implemented.
- **[wisdom_candidate]** wisdom_candidates: [convention] Agent-callable delta writers must reuse the validator's canonical ID formats and read the target capability through the supported Store before signaling; archive stays the only global-spec writer.
- **[archive_only_evidence]** changes_made: plugin/src/tools/spec-delta.ts: Added structural dl-/rq-/scenario ID validation and target-spec duplicate requirement refusal before signaling, matching existing completeness validation and agreement requirement that invalid/conflicting adds never persist.
- **[archive_only_evidence]** changes_made: plugin/src/tools/spec-delta.test.ts: Added refusal coverage for malformed delta/requirement/scenario IDs and pre-signal duplicate requirement IDs already present in the target spec.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted src/tools/spec-delta.test.ts, bin/oc-test targeted src/tools/spec-delta.test.ts src/storage/store-temporal/spec-deltas.test.ts src/temporal/change-state.spec-delta.test.ts src/temporal/workflows.signal-handlers.test.ts, bin/oc-test targeted src/temporal/archive-activity.test.ts, bun --cwd=/home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/addSpecDeltaWriter/plugin run typecheck results=pass — TDD red run exposed four missing structural/pre-signal validation cases; scoped remediation made 28/28 tool tests pass. Related Temporal/store/reducer/signal suite passed 74/74. Archive activity suite passed 6/6, including new-spec delta application. TypeScript typecheck and git diff --check passed.
- **[unresolved_action]** required_main_agent_actions: Deploy the Advance plugin and restart the plugin host before invoking adv_delta_add in a fresh session.
- **[unresolved_action]** required_main_agent_actions: Do not revisit archive application, global spec writes, or modify/remove/rename surfaces; release hardening confirmed this change remains add-only and archive remains the sole global-spec writer.
- **[wisdom_candidate]** wisdom_candidates: [pattern] For append-only workflow writers, validate terminal lifecycle state and cross-field identifier ownership at the tool boundary before signaling; schema-shaped IDs alone do not enforce the mutation contract.
- **[archive_only_evidence]** changes_made: plugin/src/tools/spec-delta.ts: Require authoritative change readback with draft status before mutation; require every scenario ID to use its added requirement as parent.
- **[archive_only_evidence]** changes_made: plugin/src/tools/spec-delta.test.ts: Added regression coverage for archived-change refusal and scenario-parent mismatch refusal.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted src/tools/spec-delta.test.ts, bin/oc-test targeted src/tools/spec-delta.test.ts src/temporal/change-state.spec-delta.test.ts src/storage/store-temporal/spec-deltas.test.ts src/temporal/workflows.signal-handlers.test.ts, pnpm --dir plugin run check, pnpm --dir plugin run build, git diff --check results=pass — Single tool suite: 30/30 passed. Release-focused tool/state/Temporal suite: 4 files, 76/76 passed. Plugin check completed schema/type/isolation/lockfile/lint/format checks successfully; plugin build and Temporal worker build succeeded. git diff --check passed. Acceptance evidence records pre-hardening full suite 347 files/5185 tests passed.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| SC5 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
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
| DONT5 | avoidance | respected |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: bunx vitest run src/temporal/change-state.spec-delta.test.ts src/storage/store-temporal/spec-deltas.test.ts src/temporal/messages.test.ts src/temporal/workflows.signal-handlers.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bunx vitest run src/temporal/change-state.spec-delta.test.ts src/storage/store-temporal/spec-deltas.test.ts src/temporal/messages.test.ts src/temporal/workflows.signal-handlers.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bunx vitest run <same 4 files> && pnpm run typecheck
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- <10 related files: change-state, signal-rejection, archive-activity, projection, bundle-boundary, disk-projection, store-disk, store-temporal index, signal-integration, queries>
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- <12 related files: workflows.epic/ops-follow-up/search-attrs, change-state crash-recovery/size-guard/ops-follow-up/worktree-auto-manage, store-temporal changes, no-disk-writes-invariant, store-types, memo, workflow-start>
- verification_missing: No adv_run_test evidence found for reported command: bunx eslint <15 touched files>; bunx prettier --write <4 files>; pnpm run schemas:check
- verification_missing: No adv_run_test evidence found for reported command: bun run test -- src/tools/spec-delta.test.ts (RED)
- verification_missing: No adv_run_test evidence found for reported command: bun run test -- src/tools/spec-delta.test.ts src/tool-registry.test.ts src/cli-bridge-contract.test.ts src/tool-registry.surface.test.ts src/utils/tool-title.test.ts src/utils/banner.test.ts src/utils/tool-arg-preflight.test.ts src/tools/spec.test.ts src/tools/wisdom-derived-export.test.ts src/tools/contract.test.ts src/temporal/change-state.spec-delta.test.ts src/storage/store-temporal/spec-deltas.test.ts src/temporal/workflows.signal-handlers.test.ts src/temporal/messages.test.ts (GREEN)
- verification_missing: No adv_run_test evidence found for reported command: bun run test -- <22 files> && bun run lint && bun run typecheck && bun run format:check (VERIFY)
- Deploy the Advance plugin and restart the plugin host before invoking adv_delta_add in a fresh session.
- Do not revisit archive application, global spec writes, or modify/remove/rename surfaces; release hardening confirmed this change remains add-only and archive remains the sole global-spec writer.
