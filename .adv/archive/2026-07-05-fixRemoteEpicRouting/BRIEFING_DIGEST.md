# Archive Briefing Digest

**Change ID:** fixRemoteEpicRouting
**Title:** Fix remote Epic routing
**Status:** archived
**Generated:** 2026-07-05T21:54:41.243Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: roadmap #195

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

Showing 87 of 87 durable facts.

- **[archive_only_evidence]** decisions: Added a single requirement rq-epicOwnerRouting01 instead of scattering routing rules across existing requirements — Keeps the owner/child routing matrix discoverable and testable in one place; aligns with AC6 and design KD1
- **[archive_only_evidence]** decisions: Used the design's field name epic_owner_target_path in specs/docs — Matches the approved design and avoids overloading the existing child target_path parameter, preserving same-project and owner-local/child-remote compatibility
- **[archive_only_evidence]** decisions: Updated asset tests to assert the new requirement, routing matrix shapes, and error codes — Provides lightweight, deterministic contract coverage without expanding into implementation tests
- **[archive_only_evidence]** verification: node -e "JSON.parse(require('fs').readFileSync('.adv/specs/advance-epics/spec.json','utf8')); console.log('spec.json valid')" (0) — advance-epics spec.json parses as valid JSON
- **[archive_only_evidence]** verification: cd plugin && pnpm run schemas:check && pnpm run typecheck (0) — JSON schemas unchanged and TypeScript typechecks
- **[archive_only_evidence]** verification: cd plugin && pnpm run format:check && pnpm run lint (0) — Prettier and ESLint pass on src/
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/advance-epics-assets.test.ts (0) — 55 Advance Epics asset/spec contract tests pass
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: node -e "JSON.parse(require('fs').readFileSync('.adv/specs/advance-epics/spec.json','utf8')); console.log('spec.json valid')"
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run schemas:check && pnpm run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run format:check && pnpm run lint
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/advance-epics-assets.test.ts
- **[archive_only_evidence]** decisions: Placed resolveEpicOwnerStore in plugin/src/tools/epic.ts instead of target-project.ts — Existing epic.test.ts mocks ./target-project; keeping the helper in epic.ts lets the mock intercept withTargetPathStore while still exporting resolveEpicOwnerStore for direct tests.
- **[archive_only_evidence]** decisions: Used explicitChildStore for shape validation and resolveRepairChildStore for inferred child routing in repair — Repair must preserve the legacy behavior of resolving child project from entry.change_ref.target_path when no explicit target_path is provided, while still enforcing unsupported-shape rejection.
- **[archive_only_evidence]** decisions: Replaced maybeAppendTargetContext with formatEpicRoutingOutput for all Epic membership mutators — Ensures consistent split-context output (_epicOwnerProjectContext / _childProjectContext) across link, unlink, move, and repair.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/epic.test.ts src/tool-registry.surface.test.ts src/tools/change.test.ts src/tools/change-cross-project-create.test.ts (0) — 172 tests passed
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, test-isolation, lockfile-policy, lint, format:check all green
- **[archive_only_evidence]** verification: bin/oc-test smoke (0) — smoke suite + full check gate green
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/epic.test.ts src/tool-registry.surface.test.ts src/tools/change.test.ts src/tools/change-cross-project-create.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test smoke
- **[archive_only_evidence]** decisions: Centralized create-time Epic seed validation in create-clarify.ts via buildEpicMembershipFromSeed — Ensures same completeness check runs before both same-project and cross-project create paths, keeping same-project behavior intact while preventing partial seeds from leaking to target stores
- **[archive_only_evidence]** decisions: Validated routed parent Epic inside createCrossProjectFollowUp before target child create — Cross-project create must prove the parent Epic (in target or epic_owner_target_path project) exists and the entry_id is present; otherwise a typed error is returned and target create is never called
- **[archive_only_evidence]** decisions: Forwarded both cross_project_origin and epic_membership in target create initialMetadata — Preserves cross-project provenance and projects Epic membership onto the new child change in one initialMetadata payload
- **[archive_only_evidence]** decisions: Set epic_project_id on cross-project epic_membership from resolved owner/target project context — Remote Epic membership needs to record which ADV project owns the Epic, without affecting same-project seeds
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change-cross-project-create.test.ts src/tools/change.test.ts (1) — RED: 3 new tests failed as expected before implementation
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change-cross-project-create.test.ts src/tools/change.test.ts (0) — GREEN: 99 tests pass after implementation
- **[archive_only_evidence]** verification: pnpm --dir plugin run check (0) — Full pre-push gate passes (schemas, typecheck, test isolation, lockfile, lint, format)
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change-cross-project-create.test.ts src/tools/change.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change-cross-project-create.test.ts src/tools/change.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin run check
- **[archive_only_evidence]** decisions: Added shared epicOwnerTargetPathSchema in target-project.ts and spread it into owner-only Epic tool args. — Avoids duplicating the three owner routing arg descriptions across six tools and keeps schema source in one place.
- **[archive_only_evidence]** decisions: Routed create/show/list/update/reorder/add_shell through resolveEpicOwnerStore and used owner.store for all Epic operations. — Implements the owner-only-store requirement and reuses the existing resolver already used by link/unlink/move/repair.
- **[archive_only_evidence]** decisions: Wrapped owner-only tool outputs with formatEpicRoutingOutput. — Surfaces _epicOwnerProjectContext for routed operations while keeping same-project output shape unchanged (owner.context is null).
- **[archive_only_evidence]** decisions: Made adv_epic_promote_shell reject remote-child creation when no change_id is provided and owner is remote. — Design specifies safe same-owner shell promotion only; creating a child change in a remote project from promote_shell is not yet supported.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/tools/epic.test.ts src/tool-registry.surface.test.ts (0) — 90 tests pass (70 epic + 20 surface) after implementation
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, test-isolation, lockfile-policy, lint, format:check all pass
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/tools/epic.test.ts src/tool-registry.surface.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[archive_only_evidence]** decisions: Introduced applyChildEpicMembership and formatChildProjectionFailureOutput helpers — Converts child projection exceptions after owner mutation into deterministic, actionable partial-failure responses instead of generic errors or silent success
- **[archive_only_evidence]** decisions: Wrapped child projection writes in link/move and owner unlink in move/unlink with try/catch partial-failure paths — Membership mutations touch two stores; a failure in the second step must surface owner_partially_mutated / child_projection_failed flags and a repair action
- **[archive_only_evidence]** decisions: Enforced same-owner child omission proof for move and repair when no target_path is supplied — If the child change cannot be found in the remote owner project, the tool must ask for an explicit child route rather than report CHANGE_NOT_FOUND from the wrong store
- **[archive_only_evidence]** decisions: Fixed two projectTerminalStateForLinkedEntry calls in link retarget/new-link paths to use ownerStore — Remote-owner Epic mutations must project terminal state onto the owner entry, not the current-session store
- **[archive_only_evidence]** decisions: Extended EPIC_OWNER_ROUTING_ERROR_CODES with CHILD_PROJECTION_FAILED and MEMBERSHIP_PARTIAL_FAILURE — Provides stable typed error codes for the new deterministic repair paths
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/epic.test.ts (0) — 78 Epic tool tests pass (8 new split-routing/partial-failure tests)
- **[archive_only_evidence]** verification: pnpm --dir plugin run check (0) — schemas:check, typecheck, test-isolation, lockfile-policy, lint, format:check all green
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/epic.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin run check
- **[agenda]** follow_ups: Read advance-epics spec requirements beyond rq-epicEntity01..rq-epicOnePerChange01 (12 of 24 truncated) for the authoritative cross-project target-path trust/mutation rule before design gate.
- **[agenda]** follow_ups: Confirm whether adv_epic_show/list/update read tools should also gain target_path routing or remain local-only in this change's scope.
- **[archive_only_evidence]** sources: adv_change_create target_path short-circuit: When target_path is set, create routes into createCrossProjectFollowUp BEFORE the Epic seed logic at lines 1205-1231, so epic_id/entry_id/epic_title are silently dropped.
- **[archive_only_evidence]** sources: createCrossProjectFollowUp metadata: targetStore.changes.create is the authoritative write and IS correctly target-routed, but initialMetadata only carries cross_project_origin; epic_membership is never forwarded. Fix is narrow metadata forwarding.
- **[archive_only_evidence]** sources: adv_epic_create lacks target routing: adv_epic_create has no target_path/target_confirmed/confirmationEvidence args, so creating an Epic in Project A from Project B is impossible. Same gap for show/list/update.
- **[archive_only_evidence]** sources: Owner-local Epic vs target child projection: link/move/unlink/repair route only the child projection to childStore.store; Epic lookup (loadEpic(store)) and mutation (store.epics.linkChange) stay owner-local by deliberate design (test 'routes child projection through target_path while Epic remains owner-local'). Issue #195 EPIC_NOT_FOUND arises because the Epic lives in the target, not the local session store.
- **[archive_only_evidence]** sources: Reusable target routing primitive: targetPathSchema, withTargetPathStore, and appendTargetProjectContextOutput already exist and are used by Epic link/move/repair; remote-owner routing can reuse them.
- **[archive_only_evidence]** sources: advance-epics spec project-aware entries: Change entries support a project-aware change_ref carrying change_id, project_id, optional repo_id, and optional target_path; one-Epic-per-change and optional membership invariants remain authoritative.
- **[archive_only_evidence]** architecture_assessment: The existing cross-project Epic model is a deliberate 'owner-local Epic + target child projection' split shape, encoded in epic.test.ts:625: link/move/unlink/repair route only the child change projection to the target store while the Epic itself is looked up and mutated in the current-session-local store. Issue #195 asks for a different shape — 'remote owner routing' where the Epic ALSO lives in the target project. Two concrete defects follow: (1) adv_change_create target_path silently drops Epic seed fields because it short-circuits into createCrossProjectFollowUp, which never forwards epic_membership into the (correctly target-routed) targetStore.changes.create; this is a narrow, low-risk fix. (2) adv_epic_create/show/list/update have no target_path args at all, and link/move/unlink/repair look up the Epic in the wrong (local) store for the remote-owner case, producing misleading EPIC_NOT_FOUND. The reusable withTargetPathStore/targetPathSchema primitive already exists, so the create-side fix and epic_create routing are cheap. The unresolved architectural fork is whether a single target_path can mean 'authoritative for both Epic owner and child' (colliding with the existing owner-local split-project design) or whether distinct owner/child target fields plus a supported/unsupported routing matrix are required — this needs a user/orchestrator decision before implementation.
- **[agenda]** follow_ups: Candidate 4 (unify owner/child store resolvers) is a post-change refactor; do not expand this change's scope for it.
- **[agenda]** follow_ups: Confirm during planning whether adv_epic_show/list/update read tools also gain epic_owner_target_path routing or stay local-only for this change (AC2 says 'where supported' — scope the read tools explicitly).
- **[archive_only_evidence]** sources: Create-side seed drop short-circuit: target_path routes into createCrossProjectFollowUp BEFORE Epic seed logic at lines 1205-1231, so epic_id/entry_id/epic_title are silently dropped for cross-project creates (violates DONT1/AC1/SC3).
- **[archive_only_evidence]** sources: Cross-project create forwards only origin metadata: targetStore.changes.create receives initialMetadata:{cross_project_origin:origin} only; epic_membership is never forwarded, yet target store is already correctly routed.
- **[archive_only_evidence]** sources: Storage layer already accepts epic_membership in initialMetadata: Both disk scaffold and Temporal create paths already read initialMetadata.epic_membership and seed it. The create-side fix is one-line forwarding, not new plumbing.
- **[archive_only_evidence]** sources: Systemic owner-local Epic lookup: 8+ loadEpic call sites all use the current-session-local store; none can target a remote owner. This is the single wrong-store root cause of misleading EPIC_NOT_FOUND (AC4/DONT4).
- **[archive_only_evidence]** sources: Reusable child-store resolver pattern: resolveChildStore already wraps withTargetPathStore with temporal-required and returns {context,store}; resolveEpicOwnerStore in the design is a direct structural clone, and maybeAppendTargetContext already emits split target context.
- **[archive_only_evidence]** sources: adv_epic_create has no owner routing: adv_epic_create args carry no target_path/target_confirmed/confirmationEvidence and always write to local store; creating a remote-owner Epic from Project B is currently impossible (AC2).
- **[archive_only_evidence]** sources: Epic change-ref already project-aware: change_ref already carries change_id, project_id, optional repo_id, optional target_path; split owner/child projection needs no schema change to the entry ref itself.
- **[archive_only_evidence]** architecture_assessment: The draft design is structurally sound and reuses the right primitives (withTargetPathStore, resolveChildStore shape, maybeAppendTargetContext). Scouting surfaced five leverage points. (1) The single highest-payoff/lowest-risk shortcut: the create-side seed-drop fix is genuinely one-line forwarding — the storage layer (store-disk.ts:398-399, changes.ts:152/224) already accepts initialMetadata.epic_membership, so createCrossProjectFollowUp only needs to receive and forward the assembled membership; no new plumbing. (2) The design's resolveEpicOwnerStore should be built as a near-verbatim clone of resolveChildStore (epic.ts:339-361) rather than a fresh helper, keeping locality (P04) and matching the existing {context,store} contract that maybeAppendTargetContext already consumes. (3) The wrong-store defect is systemic, not per-tool: 8+ loadEpic(store,...) sites share one root cause; routing them through a single ownerStore accessor is a cross-cutting improvement that fixes AC4/DONT4 in one structural move and prevents whack-a-mole. (4) The seed-drop fix has an ordering subtlety worth calling out in design: the Epic-seed assembly currently lives AFTER the target_path branch (change.ts:1205-1231), so the fix must hoist seed validation/assembly ABOVE line 1158 or duplicate it inside the cross-project branch — otherwise AC1's 'validate parent Epic before target child creation / no orphan' cannot be satisfied because the branch returns before seed logic runs. (5) Parent-Epic pre-validation for the cross-project create should reuse the owner-store loadEpic path plus the existing INVALID_EPIC_MEMBERSHIP_SEED completeness guard (change.ts:1215) so SC3 is enforced structurally with no new error taxonomy. None of these alter the approved contract; all tie to existing AC/constraints.
- **[agenda]** follow_ups: Planning: specify deterministic same-owner-child proof for KD3 omitted-child-route shape (avoid DONT2 inference).
- **[agenda]** follow_ups: Planning: add partial-failure repair-status test for two-remote-store link/move (rq-epicMembershipRepair01).
- **[agenda]** follow_ups: Planning: add typed UNSUPPORTED_EPIC_ROUTING_SHAPE fail-before-mutation test for adv_epic_promote_shell remote-child.
- **[archive_only_evidence]** sources: epic.ts resolveChildStore (source): Existing resolveChildStore wraps withTargetPathStore with stateRequirement:'temporal-required'. Design's resolveEpicOwnerStore snippet is a faithful clone — confirms KD2 low-risk pattern reuse.
- **[archive_only_evidence]** sources: target-project.ts withTargetPathStore (source): withTargetPathStore supports 'temporal-required' with ensureTargetMutationQueueReady + trust gate (target_confirmed/confirmationEvidence). Confirms owner routing can reuse trust+queue-readiness invariants (C3/C4).
- **[archive_only_evidence]** sources: epic.ts membership tool call sites (source): All owner Epic access (loadEpic(store,...) and store.epics.*) uses the current-session-local store; only child projection routes through resolveChildStore. This is exactly the systemic wrong-store bug #195 describes — validates KD2/KD3 diagnosis.
- **[archive_only_evidence]** sources: change.ts adv_change_create branch ordering (source): target_path short-circuits to createCrossProjectFollowUp at line 1158 BEFORE Epic seed validation/construction at 1205-1231. On the cross-project path epic_id/entry_id/epic_title are silently dropped. Confirms KD4 hoist is necessary for AC1/SC3 and DONT1.
- **[archive_only_evidence]** sources: create-clarify.ts createCrossProjectFollowUp (source): createCrossProjectFollowUp passes only initialMetadata:{cross_project_origin} and accepts no Epic seed params. Confirms the design's claim that epic_membership forwarding is a real missing gap, and that storage already accepts initialMetadata (plumbing exists).
- **[archive_only_evidence]** sources: epic.test.ts backward-compat anchor (test): Test 'routes child projection through target_path while Epic remains owner-local' asserts ownerStore.epics.linkChange on the local store while target_path routes only child projection. Confirms KD1: overloading target_path would break this test; separate owner field family is required.
- **[archive_only_evidence]** sources: advance-epics spec rq-epicMembershipRepair01 (spec-law): 'Cross-project membership mutations MUST follow target-path trust rules' + audit evidence + deterministic partial-failure statuses (projection_pending/stale/target_unreachable). Design KD2/KD3/DDC2 preflight and deterministic repair-status mitigation comply.
- **[archive_only_evidence]** sources: advance-epics spec rq-epicEntries01 / rq-epicOnePerChange01 (spec-law): change_ref must carry change_id+project_id (+optional target_path); one-Epic-per-change preserved by one compact projection per child. Design split-routing writing change_ref.project_id/target_path for child C, and preserving single membership, is spec-compliant.
- **[archive_only_evidence]** architecture_assessment: The design correctly diagnoses issue #195 as a systemic wrong-store bug: every Epic-owner access in epic.ts membership tools uses the current-session-local store while only child projection routes via resolveChildStore, and adv_change_create silently drops Epic seed fields on the target_path branch (verified at change.ts:1158-1174 before the seed logic at 1205-1231). The proposed fix — a second explicit owner routing field family (epic_owner_target_path/target_confirmed/confirmationEvidence) resolved through a resolveEpicOwnerStore clone of the proven resolveChildStore→withTargetPathStore pattern — is structurally sound, reuses existing trust+queue-readiness+cache invariants, and keeps target_path child semantics backward-compatible (anchored by epic.test.ts:625). KD4's hoist of seed validation and epic_membership forwarding before the cross-project create branch is necessary and correctly targeted for AC1/SC3/DONT1. Typed pre-mutation error codes, distinct output contexts, and DDC store-identity assertions make correctness structural per C2/P33. No spec-law contradiction found; the design explicitly complies with rq-epicMembershipRepair01 cross-project trust rules and preserves optional membership + one-Epic-per-change invariants.
- **[unresolved_action]** required_main_agent_actions: Proceed with acceptance/release decision; no blocking review findings remain.
- **[unresolved_action]** required_main_agent_actions: If live MCP proof is required, rebuild/deploy plugin and validate remote Epic routing in a fresh OpenCode session due runtime dist caching.
- **[archive_only_evidence]** verification: tests_run=for p in <focus files>; do test -e "$p" ...; done, bin/oc-test targeted -- plugin/src/tools/epic.test.ts plugin/src/tools/change-cross-project-create.test.ts plugin/src/tool-registry.surface.test.ts plugin/src/advance-epics-assets.test.ts, bin/oc-test targeted -- src/tools/epic.test.ts src/tools/change-cross-project-create.test.ts src/tool-registry.surface.test.ts src/advance-epics-assets.test.ts, pnpm --dir plugin run schemas:check, pnpm --dir plugin run check results=pass — Path preflight: all 13 focus files OK. First targeted test command used repo-root-prefixed paths against plugin-local include pattern and failed with 'No test files found' (invocation issue, not code failure). Corrected targeted command passed 4 files / 159 tests. schemas:check exited 0. pnpm --dir plugin run check exited 0: schemas:check, typecheck, test isolation, lockfile policy, eslint, prettier all passed. Initial submit attempt with packet scope_key reviewer:acceptance was rejected by report schema; corrected to required review:acceptance change-scope.
- **[unresolved_action]** required_main_agent_actions: Before claiming fresh-session live MCP validation, run source build/deploy and restart OpenCode/plugin host per Source-vs-Dist reload gotcha, then exercise affected ADV Epic tools if release workflow requires live validation.
- **[unresolved_action]** required_main_agent_actions: Optionally track slop-scan detector environment repair for eslint timeout / knip JSON parse / missing ast-grep and jscpd; not blocking this release because targeted tests, check/build evidence, and fallback review are clean.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] For this repo, `bin/oc-test targeted -- ...` runs from `plugin/`; pass paths like `src/tools/epic.test.ts`, not `plugin/src/tools/epic.test.ts`, or Vitest reports no matching files.
- **[archive_only_evidence]** verification: tests_run=Path preflight for focused release files; git status --short; git diff --check origin/trunk...HEAD, bin/adv slop-scan plugin/src --json, bin/oc-test targeted -- plugin/src/tools/epic.test.ts plugin/src/tools/change-cross-project-create.test.ts plugin/src/tool-registry.surface.test.ts plugin/src/advance-epics-assets.test.ts, bin/oc-test targeted -- src/tools/epic.test.ts src/tools/change-cross-project-create.test.ts src/tool-registry.surface.test.ts src/advance-epics-assets.test.ts, git status --short && git merge-base --is-ancestor origin/trunk HEAD results=pass — Path preflight OK for all focus files; git diff --check clean; git status clean. Slop scan found 0 findings but remained SLOP_SCAN_DEGRADED because eslint timed out, knip JSON parse failed, ast-grep/jscpd unavailable. Initial targeted test command used repo-root plugin/src paths and failed with 'No test files found'; diagnosed wrapper runs from plugin/. Corrected targeted command passed 4 files / 159 tests. origin/trunk is ancestor of HEAD, indicating branch includes current trunk.
- **[archive_only_evidence]** findings: [info] slop-scan: bin/adv slop-scan plugin/src --json reported 0 findings but degraded detector coverage (eslint timeout, knip parse failure, ast-grep/jscpd unavailable). Fallback review found no blocker/high slop findings.
- **[archive_only_evidence]** findings: [info] deployment-readiness: Source build passes; live deployed MCP behavior requires normal build/deploy/restart before fresh-session validation.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
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

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: node -e "JSON.parse(require('fs').readFileSync('.adv/specs/advance-epics/spec.json','utf8')); console.log('spec.json valid')"
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run schemas:check && pnpm run typecheck
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run format:check && pnpm run lint
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/advance-epics-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/epic.test.ts src/tool-registry.surface.test.ts src/tools/change.test.ts src/tools/change-cross-project-create.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test smoke
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change-cross-project-create.test.ts src/tools/change.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/change-cross-project-create.test.ts src/tools/change.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin run check
- verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/tools/epic.test.ts src/tool-registry.surface.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/tools/epic.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin run check
- Proceed with acceptance/release decision; no blocking review findings remain.
- If live MCP proof is required, rebuild/deploy plugin and validate remote Epic routing in a fresh OpenCode session due runtime dist caching.
- Before claiming fresh-session live MCP validation, run source build/deploy and restart OpenCode/plugin host per Source-vs-Dist reload gotcha, then exercise affected ADV Epic tools if release workflow requires live validation.
- Optionally track slop-scan detector environment repair for eslint timeout / knip JSON parse / missing ast-grep and jscpd; not blocking this release because targeted tests, check/build evidence, and fallback review are clean.
