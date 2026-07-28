# Archive Briefing Digest

**Change ID:** addReleaseNotesData
**Title:** Add release notes data
**Status:** archived
**Generated:** 2026-07-28T18:07:42.700Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: adhoc

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
| release | stuck |

## Epic Context

No Epic membership

## Durable Facts

Showing 100 of 134 durable facts (34 omitted).

- **[archive_only_evidence]** decisions: Enforced envelope byte cap with a Zod .refine on the serialized JSON envelope — JSON Schema cannot express deterministic UTF-8 byte budgets; using Zod refine keeps the cap structural at the runtime validation layer and is verified by tests, matching repo conventions of schema-driven validation
- **[archive_only_evidence]** decisions: Placed release-notes schemas, mapping utility, and tests adjacent to Change types in plugin/src/types/ — Preserves locality (P04): release_notes lives on Change, so its schemas and tests belong in the changes module rather than a new top-level directory
- **[archive_only_evidence]** decisions: Registered release-notes as a standalone public JSON schema rather than inlining into change.schema.json — Task contract explicitly requires a standalone release-notes.schema.json; change.schema.json references it implicitly through the optional release_notes array on Change
- **[archive_only_evidence]** decisions: Mapped only feat/fix/perf and returned undefined for all other conventional-commit types — Task contract requires deterministic authoritative mapping with no heuristic classification
- **[archive_only_evidence]** verification: cd /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/addReleaseNotesData/plugin && pnpm exec vitest run src/types/changes.release-notes.test.ts --reporter=verbose (1) — RED phase: 9 tests failed as expected because schemas/utility did not yet exist
- **[archive_only_evidence]** verification: cd /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/addReleaseNotesData/plugin && pnpm exec vitest run src/types/changes.release-notes.test.ts src/schema-registry.test.ts --reporter=verbose (1) — Intermediate run after implementation: 21 release-notes tests passed; schema-registry test failed because schema artifacts were stale and needed regeneration
- **[archive_only_evidence]** verification: cd /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/addReleaseNotesData/plugin && pnpm exec vitest run src/types/changes.release-notes.test.ts src/schema-registry.test.ts --reporter=verbose (0) — GREEN phase: 24 tests passed across release-notes and schema-registry after schemas:generate
- **[archive_only_evidence]** verification: cd /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/addReleaseNotesData/plugin && pnpm run schemas:generate && pnpm run schemas:check (0) — Generated 9 JSON schemas and schemas:check passed
- **[archive_only_evidence]** verification: cd /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/addReleaseNotesData/plugin && pnpm run typecheck (0) — TypeScript typecheck passed
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4qxz3m_d7788e67
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4r11xz_16a38909
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4r1psy_d7380242
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: schemas-generate-check
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: typecheck
- **[archive_only_evidence]** decisions: Implemented adv_change_set_release_notes using the canonical changeCommand primitive rather than direct signal+refresh — Task contract requires operation_id, command_kind, payload_hash, ledger confirmation, revision fencing, and projection-proof commit; the store adapter pattern already used by setEpicMembership provides this exactly
- **[archive_only_evidence]** decisions: Added runtime schema validation inside the tool execute path in addition to the args-schema/preflight layer — Defensive: tests call execute directly and the task says full replacement input must be validated by the canonical schema before signaling
- **[archive_only_evidence]** decisions: Used withChangeCommandOperation in the reducer and recorded a rejected ledger entry for invalid payloads — Preserves operation-ledger audit semantics and replay determinism even when the signal payload fails schema validation
- **[archive_only_evidence]** decisions: Placed release-note tests adjacent to the code they exercise (change-state.release-notes.test.ts, change.release-notes.test.ts, workflows.release-notes.itest.ts) — Locality of behavior (P04): release-note reducer tests live with change-state, tool tests live with change tools, integration tests live under temporal/__tests__
- **[archive_only_evidence]** verification: cd /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/addReleaseNotesData/plugin && pnpm exec vitest run src/temporal/change-state.release-notes.test.ts src/tools/change.release-notes.test.ts --reporter=verbose (1) — RED phase: 10 tests failed as expected because ReleaseNotesSet types/functions did not yet exist
- **[archive_only_evidence]** verification: cd /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/addReleaseNotesData/plugin && pnpm exec vitest run src/temporal/change-state.release-notes.test.ts src/tools/change.release-notes.test.ts src/temporal/messages.test.ts src/tools/command-family-inventory.test.ts src/temporal/contracts.test.ts --reporter=verbose (0) — GREEN phase: 61 tests passed across reducer, tool, message contract, command inventory, and contract tests
- **[archive_only_evidence]** verification: cd /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/addReleaseNotesData/plugin && pnpm run build:worker (0) — Temporal worker bundle built successfully before integration tests
- **[archive_only_evidence]** verification: cd /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/addReleaseNotesData/plugin && pnpm exec vitest run src/temporal/__tests__/workflows.release-notes.itest.ts --reporter=verbose (0) — Temporal integration tests passed: valid signal applies, invalid payload rejects, idempotent replay stable
- **[archive_only_evidence]** verification: cd /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/addReleaseNotesData/plugin && pnpm run typecheck (0) — TypeScript typecheck passed
- **[archive_only_evidence]** verification: cd /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/addReleaseNotesData/plugin && pnpm exec vitest run src/temporal/change-state.release-notes.test.ts src/tools/change.release-notes.test.ts src/temporal/messages.test.ts src/tools/command-family-inventory.test.ts src/temporal/contracts.test.ts src/utils/tool-arg-preflight.test.ts src/tool-registry.inventory.test.ts src/cli-bridge-contract.test.ts --reporter=verbose (0) — Broad targeted suite passed: 182 tests across reducer, tool, messages, inventory, contracts, preflight, registry, and CLI bridge
- **[archive_only_evidence]** verification: cd /home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/addReleaseNotesData/plugin && pnpm exec vitest run src/temporal/__tests__/workflow-bundle-imports.test.ts --reporter=verbose (0) — Workflow bundle import guard passed: no filesystem or Node-only modules pulled into workflow graph
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4rl85l_372b5b3c
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4s0r9f_efd1bea1
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4s6jry_71337936
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4s6v7b_e58d2748
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4s7z3d_07fb4409
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4s8nkc_6f4048ed
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4sg3tq_d940cb22
- **[archive_only_evidence]** decisions: Emit release-notes.json only when release_notes is defined, including an empty defined collection. — The archive contract conditions sidecar generation on data presence; the canonical envelope schema remains the structural validator.
- **[archive_only_evidence]** decisions: Protect release-notes.json through GENERATED_BUNDLE_FILES. — Both external and in-repo sibling-copy paths share this set, preventing source artifacts from clobbering generated output.
- **[archive_only_evidence]** verification: cd plugin && pnpm exec vitest run --project unit src/archive/archive.test.ts (0) — Passed: 33 archive tests, including populated/absent/collision release-note sidecar coverage.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4sycef_87f83d50
- **[archive_only_evidence]** decisions: Changed release_notes to one ReleaseNotesContent object at every public boundary. — The approved contract specifies one release-note block per Change; arrays are rejected without an unshipped compatibility alias.
- **[archive_only_evidence]** decisions: Retained arrays only inside ReleaseNotesContent highlights and deprecations. — Those are the contract's bounded internal collections, capped at 20.
- **[archive_only_evidence]** verification: cd plugin && pnpm exec vitest run --project unit src/types/changes.release-notes.test.ts (1) — RED: singular-envelope contract test failed as expected because the schema required an array.
- **[archive_only_evidence]** verification: cd plugin && pnpm run build:worker (0) — Worker bundle build passed before Temporal integration tests.
- **[archive_only_evidence]** verification: cd plugin && pnpm exec vitest run --project unit src/types/changes.release-notes.test.ts src/tools/change.release-notes.test.ts src/utils/tool-arg-preflight.test.ts src/temporal/change-state.release-notes.test.ts src/archive/archive.test.ts && pnpm exec vitest run --project temporal src/temporal/__tests__/workflows.release-notes.itest.ts (0) — GREEN: schema, setter/preflight, reducer, archive sidecar, and Temporal integration suites passed.
- **[archive_only_evidence]** verification: cd plugin && pnpm run schemas:check && pnpm run typecheck && pnpm run check (0) — Generated schema validation, typecheck, and complete check passed; lint retains only pre-existing warnings.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4t6gch_9a47da24
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4t93wt_61e1768a
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4t9hty_e7522089
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4tcd61_51c70d23
- **[archive_only_evidence]** decisions: Granted adv_change_set_release_notes to orchestrator via TIER_2_ALLOWLIST — Tier 2 is orchestrator-only top-level; adding it there lets owning commands call the setter directly without broadening any sub-agent authority or changing the sub-agent union floor.
- **[archive_only_evidence]** decisions: Composed ReleaseNotesContent inline at existing executive-summary/release-readiness synthesis points — Task requires zero-ceremony capture with no new prompt/checkpoint; piggybacking on existing durable summary writes avoids extra user turns.
- **[archive_only_evidence]** decisions: Used deterministic category map and evidence-only optional fields — Preserves the typed schema authority: feat->added, fix->fixed, perf->changed; deprecated/removed/security only with explicit evidence; no unsupported semantic fields or heuristic authority.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/release-notes-command-assets.test.ts (1) — RED phase: 5 expected failures from new command asset/manifest/tool-visibility tests before implementation
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/release-notes-command-assets.test.ts (0) — GREEN phase: 6/6 new release-notes command-asset tests pass after implementation
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/release-notes-command-assets.test.ts src/tool-role-policy.test.ts src/tool-registry.inventory.test.ts src/manifest.test.ts src/agent-prompt-policy-binding.test.ts src/commands-spine-assets.test.ts (0) — GREEN: 113/113 policy/manifest/command-spine/asset tests pass
- **[archive_only_evidence]** verification: pnpm run check (0) — verify phase: schemas:check, typecheck, generate:manifests:check, frontmatter, test-isolation, lockfile-policy, lint, format:check all pass (3 pre-existing warnings in manifest-frontmatter.ts)
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4txg92_20627f68
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4u1gkk_551fa970
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4u970l_786a4deb
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4uaci2_2877929f
- **[archive_only_evidence]** decisions: Added release_notes to the continue-as-new seed in buildChangeWorkflowContinueAsNewSeed — workflows.signal-handlers.itest enforces that every seedState Pick key appears as key: state.key; release_notes was in the Pick list but missing from the seed construction
- **[archive_only_evidence]** decisions: Added projectAfter: true to releaseNotesSetSignal handler — Setting release notes mutates workflow state and must regenerate the downstream disk projection / launcher aggregate like other mutating signals
- **[archive_only_evidence]** decisions: Added a per-change projection fallback in buildLauncherProjection when summary shards are absent — The workflow's best-effort writeChangeProjection activity writes schemaVersion 2 per-change projections but not CQRS-lite summary shards; the aggregate was empty for signal-driven integration tests. Fallback derives LauncherChangeSummary directly from projection files, keeping the summary-shard path primary.
- **[archive_only_evidence]** decisions: Added adv_change_set_release_notes rows to docs/cli-surface-matrix.md and docs/tool-ownership.md — Registry coverage tests require every ADV_TOOL_NAMES entry to have disposition and ownership rows
- **[archive_only_evidence]** decisions: Updated the frozen prompt baseline for adv and adv-engineer — The generated orchestrator frontmatter line for adv_change_set_release_notes added 504 bytes to adv and 816 bytes to adv-engineer; causal and within the documented re-freeze policy
- **[archive_only_evidence]** verification: cd plugin && pnpm run build:worker (0) — RED phase worker build succeeded before temporal tests
- **[archive_only_evidence]** verification: cd plugin && pnpm exec vitest run --project unit src/cli-surface-matrix.test.ts src/tool-ownership-assets.test.ts src/tool-name-assets.test.ts (1) — RED phase: 3 failures - missing cli-surface-matrix row, missing tool-ownership classification, adv-engineer prompt-byte budget exceeded
- **[archive_only_evidence]** verification: cd plugin && pnpm exec vitest run --project temporal src/storage/launcher-projection.itest.ts (1) — RED phase: launcher-projection aggregate empty because summary-shard index was absent from writeChangeProjection path
- **[archive_only_evidence]** verification: cd plugin && pnpm exec vitest run --project temporal src/temporal/workflows.signal-handlers.itest.ts (1) — RED phase: continue-as-new seed missing release_notes: state.release_notes
- **[archive_only_evidence]** verification: cd plugin && pnpm run build:worker && pnpm exec vitest run --project temporal src/storage/launcher-projection.itest.ts src/temporal/workflows.signal-handlers.itest.ts && pnpm exec vitest run --project unit src/cli-surface-matrix.test.ts src/tool-ownership-assets.test.ts src/tool-name-assets.test.ts (0) — GREEN phase: all targeted temporal and unit tests pass
- **[archive_only_evidence]** verification: cd plugin && pnpm run check (0) — GREEN phase: schemas:check, typecheck, generate:manifests:check, frontmatter, test-isolation, lockfile-policy, lint, format:check all pass
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4vki9i_07fb866c
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4vliha_992740a8
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4vlptk_7551085f
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4vpluk_0583b02c
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4w9wk6_9c504ac9
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4wchaf_417fe008
- **[report_follow_up]** follow_ups: Candidate L3 requires the exact source precedence to be stated in design tests so no inferred category/audience becomes validity authority.
- **[report_follow_up]** follow_ups: Candidate L4 requires archive tests to distinguish initial bundle creation from later Phase 9 PR-finalization state.
- **[research_citation]** sources: Change schema and compatibility boundary: ChangeSchema uses optional additive fields and .passthrough(), preserving legacy and forward compatibility. (file:///home/jon/dev/advance/plugin/src/types/changes.ts#L971-L1266)
- **[research_citation]** sources: Canonical command adapter: changeCommand confirms operation-ledger state before committing a projection and checks command kind, payload hash, and revision. (file:///home/jon/dev/advance/plugin/src/storage/store-temporal/shared.ts#L582-L704)
- **[research_citation]** sources: Archive generated-file authority: writeArchiveBundleFiles is the generated bundle-file authority and GENERATED_BUNDLE_FILES protects generated names from sibling copy loops. (file:///home/jon/dev/advance/plugin/src/archive/archive.ts#L96-L210)
- **[research_citation]** sources.omitted: 2 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Draft design follows existing additive ChangeSchema, canonical ledger-confirmed command, and archive single-writer patterns. Four bounded leverage candidates follow; no design rewrite recommended.
- **[report_follow_up]** follow_ups: WORKING DIRECTORY: /home/jon/dev/advance
CHANGE: addReleaseNotesData | design re-entry
SCOPE KEY: researcher:design-leverage-scout-ci-revision
ATTEMPT: 1
TASK_SCOPE: bounded revised release-notes design opportunity scout
IN_SCOPE:
  - additive typed sidecar/envelope/schema, archive ordering, compatibility transport, and future discovery shape
OUT_OF_SCOPE:
  - Corded, PokeEdge, and PokeEdge-Web source edits; aggregate indexes; workflow/config edits
DONE_WHEN:
  - sourced findings identify up to five opportunities or inconclusive evidence
STOP_WHEN:
  - source access blocked or a contract/CI contradiction needs orchestrator decision
VERIFICATION:
  required_when_possible:
    - cite official docs and local source examples for material claims
  optional_additional_checks: true
- **[report_follow_up]** follow_ups: Candidate O1 — Envelope single source. Rationale: define exported ReleaseNotesEnvelopeSchema with schema_version/change_id/title/release_notes; derive the sidecar and release-notes.schema.json from it, while ChangeSchema owns only the optional release_notes block. Payoff: no duplicated identity/content model and direct future consumer validation. Risk: low, fixture/schema maintenance. Contract tie: revised deltas 1–2. Fate: adopt. Evidence: https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/schema-registry.ts ; https://zod.dev/json-schema
- **[report_follow_up]** follow_ups: Candidate O2 — Generated sidecar protection in common writer. Rationale: write release-notes.json from writeArchiveBundleFiles and add it to GENERATED_BUNDLE_FILES, rather than copying from a source artifact. Payoff: both external and in-repo archive flows emit identical sidecars and sibling copies cannot overwrite it. Risk: low; a missing set entry would reintroduce overwrite risk. Contract tie: sidecar before tag/deployment and archive generated-file protection. Fate: adopt. Evidence: https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/archive/archive.ts
- **[report_follow_up]** follow_ups: Candidate O3 — Archive integration test as ordering/transport proof. Rationale: assert an archived change with/without release_notes produces/omits release-notes.json, validates against the published schema, preserves existing change.json/executive-summary byte/behavior expectations, and exists in the in-repo PR archive before any release operation. Payoff: direct proof against regressions without modifying CI. Risk: low; test must not couple to an external deployment. Contract tie: revised deltas 3–4 and SC2/AC9–12 evidence intent. Fate: adopt. Evidence: https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/archive/archive.ts ; https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/schema-registry.test.ts
- **[report_follow_up]** follow_ups: Candidate O4 — Pinned compatibility source audit. Rationale: record exact repository revision, workflow/file path, and matching rule that proves ignored unknown sidecars and full-tree promotion; rerun it as review evidence, not a runtime dependency. Payoff: preserves zero external edits while making compatibility falsifiable. Risk: medium only because consumer CI may drift. Contract tie: revised delta 4 and AC9–12. Fate: adopt as acceptance evidence. Evidence: https://github.com/Sharper-Flow/PokeEdge-Web/blob/main/.github/workflows/release.yml ; https://github.com/Sharper-Flow/PokeEdge-Web/blob/main/.github/workflows/promote-to-staging.yml ; https://github.com/Sharper-Flow/PokeEdge-Web/blob/main/.github/workflows/production-deploy.yml
- **[report_follow_up]** follow_ups: Candidate O5 — Do not prebuild consumer discovery. Rationale: define only the stable filename/envelope now; future Corded scans changed release-notes.json paths between its existing deployment checkpoints. Payoff: no index, trigger, API, or cross-repo dependency. Risk: low; future consumer must define checkpoint semantics. Contract tie: revised delta 5. Fate: adopt/defer implementation to future Corded rewrite. Evidence: https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/archive/archive.ts ; https://github.com/Sharper-Flow/PokeEdge-Web/blob/main/.github/workflows/production-deploy.yml
- **[report_follow_up]** follow_ups: SC2 and AC9–12 exact wording was not supplied. I found no contradiction with the described constraints, but I do not know whether each criterion has additional unstated conditions. Hidden dependency: direct Corded filtering evidence could not be independently inspected from the active local source surface; do not claim it verified without a pinned source audit.
- **[research_citation]** sources: Advance archive writer: The common archive writer produces generated bundle files, and both archive paths call it; generated-file exclusions protect output from sibling-copy overwrites. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/archive/archive.ts)
- **[research_citation]** sources: Advance JSON-schema registry: The registry deterministically emits Draft 7 schemas from exported Zod schemas, and schema tests compare committed artifacts with rendered output. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/schema-registry.ts)
- **[research_citation]** sources: Zod JSON Schema documentation: Zod v4 supports native z.toJSONSchema conversion and selectable JSON Schema targets. (https://zod.dev/json-schema)
- **[research_citation]** sources.omitted: 2 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: The revised additive sidecar is the simpler compatible boundary: archive once through the existing common writer, publish its Zod-derived schema through the existing deterministic registry, and leave consumers/transports untouched. The local PokeEdge-Web release/promotion evidence confirms full-tree git merge/tag transport. I could not independently inspect the separate Corded service's file-selection implementation from the available local source surface, so its unknown-sidecar-ignore assertion remains a required source-audit evidence item rather than established research evidence.
- **[report_follow_up]** follow_ups: Pinned PokeEdge origin/main content at af05cb49d17c7d44f15e896764ca6edc5bef8e34 could not be retrieved directly: raw GitHub paths returned 404. Treat local PokeEdge workflow observations as advisory until a permitted pinned source capture is supplied.
- **[research_citation]** sources: Advance archive writer and schema registry: The existing single archive writer emits generated artifacts and both external/in-repo bundle paths call it; the public registry derives schema artifacts from Zod. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/archive/archive.ts)
- **[research_citation]** sources: Advance durable command adapter: changeCommand confirms operation-ledger outcome, reads confirmed state, and commits the projection. (https://github.com/Sharper-Flow/Advance/blob/trunk/plugin/src/storage/store-temporal/shared.ts)
- **[research_citation]** sources: Corded current archive consumer: Current consumer enumerates change.json and optionally derives only sibling executive-summary.md; unknown sibling paths are ignored. (file:///home/jon/dev/Corded/src/handlers/github_webhook.rs)
- **[research_citation]** sources.omitted: 2 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Pass with a minor evidence limitation. The optional Change field plus versioned sidecar is additive and uses the existing generated-bundle writer on both archive paths. The specified setter follows the existing signal → ledger confirmation → state readback → projection commit pattern. Current Corded only enumerates change.json and optional executive-summary.md, so a sibling sidecar is inert until a separate rewrite. No parallel release trigger is proposed. The PokeEdge pinned remote source could not be fetched because the direct raw URL returned 404; local workflow inspection therefore cannot independently prove the pinned commit.
- **[unresolved_action]** required_main_agent_actions: Review and retain the four uncommitted scoped remediation files in the change worktree; task/gate/checkpoint ownership remains with the orchestrator.

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
| AC8 | acceptance_criterion | pass |
| AC9 | acceptance_criterion | pass |
| AC10 | acceptance_criterion | pass |
| AC11 | acceptance_criterion | pass |
| AC12 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| C5 | constraint | respected |
| C6 | constraint | respected |
| C7 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| DONT5 | avoidance | respected |
| DONT6 | avoidance | respected |
| DONT7 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |
| OOS4 | out_of_scope | not_applicable |
| OOS5 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4qxz3m_d7788e67
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4r11xz_16a38909
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4r1psy_d7380242
- verification_missing: No durable adv_run_test evidence found for run_id: schemas-generate-check
- verification_missing: No durable adv_run_test evidence found for run_id: typecheck
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4rl85l_372b5b3c
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4s0r9f_efd1bea1
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4s6jry_71337936
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4s6v7b_e58d2748
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4s7z3d_07fb4409
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4s8nkc_6f4048ed
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4sg3tq_d940cb22
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4sycef_87f83d50
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4t6gch_9a47da24
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4t93wt_61e1768a
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4t9hty_e7522089
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4tcd61_51c70d23
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4txg92_20627f68
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4u1gkk_551fa970
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4u970l_786a4deb
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4uaci2_2877929f
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4vki9i_07fb866c
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4vliha_992740a8
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4vlptk_7551085f
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4vpluk_0583b02c
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4w9wk6_9c504ac9
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms4wchaf_417fe008
- Review and retain the four uncommitted scoped remediation files in the change worktree; task/gate/checkpoint ownership remains with the orchestrator.
