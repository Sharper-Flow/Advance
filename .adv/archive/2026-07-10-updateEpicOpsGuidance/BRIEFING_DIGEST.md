# Archive Briefing Digest

**Change ID:** updateEpicOpsGuidance
**Title:** Update Epic ops guidance
**Status:** archived
**Generated:** 2026-07-10T21:43:42.577Z

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

Showing 58 of 58 durable facts.

- **[agenda]** follow_ups: tk-4dafc1d36282 must add an external citation of rq-epicOpsPlanning01 (ADV_INSTRUCTIONS.md Epic Context and/or .opencode/command/adv-epic.md + adv-coordinate.md) to satisfy the spec-citation-invariant.
- **[agenda]** follow_ups: tk-0e9072cfdc74 should add rq-epicOpsPlanning01 to the advance-epics-assets mirror-sync reqId list and add focused blocking-vs-handoff assertions (AC4/DDC).
- **[unresolved_action]** required_main_agent_actions: Ensure sibling task tk-4dafc1d36282 lands an external citation for rq-epicOpsPlanning01 before running spec-citation-invariant as a CI gate (currently flags only this reqId by design).
- **[archive_only_evidence]** decisions: Referenced rq-opsFollowTrace01, rq-opsFollowRelease01, and rq-opsRunReleaseReadiness01 inline in the new requirement body instead of restating their semantics. — DDC2 requires reference-not-duplication; keeps one source of truth for provenance, blocking/handoff, and verified child-state release authority.
- **[archive_only_evidence]** decisions: Bumped spec.json version 1.11.0 -> 1.12.0 and updated_at to 2026-07-10, and brought the mirror header from 1.10.0/2026-07-08 to 1.12.0/2026-07-10. — New requirement warrants a minor bump; the mirror was already one version behind the spec, so this also restores spec/mirror version alignment.
- **[archive_only_evidence]** decisions: Did NOT add an external citation (ADV_INSTRUCTIONS.md / command files) for rq-epicOpsPlanning01. — That guidance is sibling task tk-4dafc1d36282 (AC1/AC2/SC1); editing it here would duplicate work and expand beyond this task's spec+mirror scope. Surfaced as a required_main_agent_action instead.
- **[archive_only_evidence]** verification: node -e "require('./.adv/specs/advance-epics/spec.json')" + schema-shape check on rq-epicOpsPlanning01 (0) — PASS — spec.json parses; rq-epicOpsPlanning01 present, priority must, 4 scenarios each with id/title/given(array)/when(string)/then(array); references rq-opsFollowTrace01/rq-opsFollowRelease01/rq-opsRunReleaseReadiness01; includes all six operational examples.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/advance-epics-assets.test.ts (0) — PASS — 55/55 tests; spec.json valid JSON, name advance-epics, mirror docs/specs/advance-epics.md still contains all listed reqIds.
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/__tests__/spec-citation-invariant.test.ts (1) — EXPECTED (cross-task) — fails on exactly one requirement: rq-epicOpsPlanning01 has no external citation yet. No other requirement regressed; 'requirement count does not shrink' passed. Citation is owned by sibling task tk-4dafc1d36282 (ADV_INSTRUCTIONS.md/command files); invariant goes green once that lands.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: node -e "require('./.adv/specs/advance-epics/spec.json')" + schema-shape check on rq-epicOpsPlanning01
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/advance-epics-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/__tests__/spec-citation-invariant.test.ts
- **[archive_only_evidence]** decisions: Cited rq-epicOpsPlanning01 in ADV_INSTRUCTIONS.md and adv-epic.md via HTML comments — spec-citation-invariant failed because rq-epicOpsPlanning01 (new law from sibling spec task) had no external citation; the invariant's remediation directs an rq citation comment in the relevant command/instruction file. These guidance files are the canonical instruction surfaces for that law, so the citation is in-scope and locality-correct, and is not the AC4 asset-test anchor owned by the verification task.
- **[archive_only_evidence]** decisions: Kept edits additive and prose-only; no schema, validator, gate, or spec changes — Contract C1 forbids new data model/validator/gate; AC3 (spec) and AC4 (drift-anchor test) are owned by sibling tasks. Preserving existing asset-test tokens kept advance-epics-assets.test.ts at 55/55.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/advance-epics-assets.test.ts (0) — 55/55 Epic asset contract tests pass; additive doc edits preserved all asserted tokens in adv-epic.md, adv-coordinate.md, and ADV_INSTRUCTIONS.md.
- **[archive_only_evidence]** verification: pnpm exec vitest run src/__tests__/spec-citation-invariant.test.ts (0) — 2/2 pass; rq-epicOpsPlanning01 now cited in canonical instruction surfaces, clearing the single uncited-requirement failure.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/advance-epics-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/__tests__/spec-citation-invariant.test.ts
- **[archive_only_evidence]** decisions: Anchored canonical wording as static asset tests rather than exercising adv_followup_promote / ops_followup runtime. — The task forbids duplicating advance-workflow behavior or falsely claiming coverage. Provenance, release blocking, surviving-obligation handoff, and child-state release authority stay owned by rq-opsFollowTrace01/rq-opsFollowRelease01/rq-opsRunReleaseReadiness01 and their tests; the Epic requirement is asserted to CITE those ids (reference-not-duplication, DDC2) and to forbid any new model/validator/enum/gate (DDC3).
- **[archive_only_evidence]** decisions: Added rq-epicOpsPlanning01 to the pre-existing mirror-sync reqId list instead of a standalone sync check. — Keeps one source of truth for spec↔doc requirement parity and matches the file's established convention; this was the exact follow-up the spec task (tk-cf9893829c1c) handed off.
- **[archive_only_evidence]** decisions: Used a reversible in-test negative control (flip one typed-route assertion to not.toContain, run, revert) for RED evidence rather than fabricating a failure. — Sibling tasks tk-cf9893829c1c and tk-4dafc1d36282 already landed the underlying spec/guidance, so a natural RED did not exist; the negative control proves the anchors are non-vacuous (a real removal of adv_followup_promote from the spec fails the suite) without mutating any source surface, and the final state is GREEN.
- **[archive_only_evidence]** decisions: Did not run pnpm run schemas:check. — Repository evidence shows it is not relevant: git status reports only plugin/src/advance-epics-assets.test.ts changed; no Zod schema, plugin/src/schema-registry.ts, or plugin/schemas/*.schema.json surface was touched.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/advance-epics-assets.test.ts (0) — BASELINE (pre-edit): 55/55 pass. Companion grep showed zero references to rq-epicOpsPlanning01 / ops_followup_links / adv_followup_promote / follows_release — ops guidance was unanchored (drift gap = RED-equivalent risk).
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/advance-epics-assets.test.ts (1) — RED / negative control: with one assertion flipped to expect the spec NOT to contain adv_followup_promote, exactly 1 test failed — 'spec.json rq-epicOpsPlanning01 ... blocks vs release-first handoff' AssertionError: expected '{...rq-epicOpsPlanning01...}' not to contain 'adv_followup_promote'. Proves the typed-route anchor is non-vacuous (a real removal fails). Reverted immediately; no source surface mutated.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/advance-epics-assets.test.ts (0) — GREEN (post-edit, post-revert): 60/60 pass — 55 baseline + 5 new AC1-AC4 ops-anchor tests, with rq-epicOpsPlanning01 added to the mirror-sync reqId list.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/__tests__/spec-citation-invariant.test.ts (0) — 2/2 pass; rq-epicOpsPlanning01 external citation (ADV_INSTRUCTIONS.md + adv-epic.md) intact and requirement count did not shrink.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec eslint src/advance-epics-assets.test.ts (0) — ESLint clean (RC=0, no output).
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/advance-epics-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/advance-epics-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/advance-epics-assets.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/__tests__/spec-citation-invariant.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin exec eslint src/advance-epics-assets.test.ts
- **[agenda]** follow_ups: Design: decide whether to add an optional instruction-anchor drift/coverage test asserting the new Epic ops block references rq-opsFollow* anchors.
- **[agenda]** follow_ups: Design: confirm phrasing distinguishing required-release-blocking (relationship=blocks) from required-release-first-with-handoff (follows_release/monitors/cleanup_after + required_handoff:true) using followup.ts L604 vocabulary.
- **[agenda]** follow_ups: Resolve clarify finding CLARIFY_MISSING_ERROR_HANDLING by noting unreachable/incomplete linked ops work is already surfaced as warning/blocker via gate-readiness.ts L681-720 (no new error-handling design needed).
- **[archive_only_evidence]** sources: Epic spec (advance-epics.md) — no ops coverage: The canonical Epic capability spec contains ZERO requirements about operational delivery work. Ops-followup laws live only in advance-workflow.md and are change-scoped, not Epic-scoped. This is the primary spec gap.
- **[archive_only_evidence]** sources: Typed ops-followup laws (advance-workflow.md): Five MUST requirements fully define typed provenance, evidence, blocking/release-first handoff, runbook state, and stale-link reconciliation. All proposal constraints are already satisfied structurally at change scope; the missing piece is Epic-planning-level instruction to USE them.
- **[archive_only_evidence]** sources: Release-gate blocking enforcement (executable anchor): blocks relationships hard-block release (OPS_FOLLOWUP_BLOCKS_INCOMPLETE); required_handoff on non-blocking links also blocks until complete/handed off. Backs the proposal's unreachable/incomplete visibility constraint with real code+tests.
- **[archive_only_evidence]** sources: Typed model: kind + relationship enums match proposal operation list: The proposal's six operation classes (first deploy, migration/backfill, deploy config, monitoring, cleanup/teardown) map 1:1 onto the existing OpsFollowupKind enum. No new vocabulary needed.
- **[archive_only_evidence]** sources: In-tool relationship semantics already documented: adv_followup_promote already documents blocks=hard-blocking release-safety; follows_release/monitors/cleanup_after=release-first sequencing. Relationship guidance exists at tool layer; Epic-planning layer does not reference it.
- **[archive_only_evidence]** sources: Canonical Epic instruction surface (ADV_INSTRUCTIONS.md § Epic Context): Authoritative agent-facing Epic instruction block enumerates 6 Epic behaviors, none about required operational work. Highest-leverage instruction insertion point.
- **[archive_only_evidence]** sources: Epic command surface (adv-epic.md): The /adv-epic command frames goal/scope/overlap but never prompts for operational delivery work. A Phase-1 elicitation line is the minimal command-surface delta.
- **[archive_only_evidence]** sources: Deployment-outside-gate-lifecycle boundary (must reconcile): Existing law says ADV stops at push and does not deploy. New Epic ops guidance must TRACK required ops work as linked typed follow-ups, NOT make ADV execute deploys or add a deploy gate.
- **[archive_only_evidence]** sources: Instruction/spec drift anchor discipline: Advance requires instruction prose to have executable anchors. Any new Epic ops instruction should reference existing rq-opsFollow* requirements + gate-readiness tests to avoid prose-only drift.
- **[archive_only_evidence]** architecture_assessment: The typed ops-followup subsystem is complete and correct at CHANGE scope: schema (changes.ts L357-626), state machine (temporal/change-state.ts L274-390), release-blocking enforcement (gate-readiness.ts L681-720 with tests), five MUST spec requirements (advance-workflow.md L3945-4247), and in-tool relationship/kind vocabulary covering all six operation classes in the proposal. The gap is purely at the EPIC PLANNING instruction layer: advance-epics.md has zero ops requirements, ADV_INSTRUCTIONS.md Epic Context (L540-562) lists six Epic behaviors none about required operational work, and adv-epic.md never elicits it. Nothing in data model, validators, or the release gate needs to change to satisfy the proposal constraints — blocking/handoff/unreachable-visibility invariants are already enforced structurally. The minimal delta is instruction + spec wording making required Epic operational work an explicit linked typed ops-followup obligation, reusing adv_followup_promote and existing relationship semantics, without contradicting the ADV-stops-at-push boundary (L184/L739). A NEW validator/test-backed rule is NOT required, because required-ness is context-dependent (only when operational need exists) and cannot be machine-detected without false-mandate risk the proposal forbids. One optional low-risk reinforcement: a drift/coverage test asserting the new Epic ops instruction block references the existing rq-opsFollow* anchors.
- **[agenda]** follow_ups: Planning: confirm docs/specs/advance-epics.md mirror is regenerated from spec.json (not hand-edited) to satisfy AC3 + schemas discipline.
- **[agenda]** follow_ups: Planning: AC4 anchor must assert the typed adv_followup_promote/ops_followup_links route AND the blocks vs release-first handoff distinction in advance-epics-assets.test.ts specifically.
- **[archive_only_evidence]** sources: advance-workflow spec: rq-opsFollowRelease01 (MUST): Blocking relationships (blocks) MUST prevent release; non-blocking release-first (follows_release, monitors, cleanup_after) MUST NOT block once explicit surviving-obligation handoff recorded; archive lists open ops follow-ups + handoff. Design's blocking/release-first distinction matches this law verbatim.
- **[archive_only_evidence]** sources: adv_followup_promote relationship enum (schema truth): Enum: 'blocks' = hard-blocking release-safety path; 'follows_release','monitors','cleanup_after' = release-first sequencing. Confirms the typed route the design directs required ops work into. followup.test.ts exercises all four.
- **[archive_only_evidence]** sources: advance-workflow spec: rq-opsRunbook01 + rq-opsRunReleaseReadiness01: Durable runbook state governs production execution authority; release readiness fails closed on stale/unreachable child state. Confirms C4/DDC3: production execution + gate-readiness stay unchanged and authoritative outside this change.
- **[archive_only_evidence]** sources: advance-epics spec (target for new rq-epicOpsPlanning01): Epic order advisory (rq-epicOrderAdvisory01); creation/coordination commands goal-first/read-first/approval-gated. New requirement fits as additive MUST without contradicting advisory-order or optional-membership invariants.
- **[archive_only_evidence]** sources: Target instruction/command surfaces (existence verified): AC1 elicitation slots into Phase 1 'Elicit and confirm' bullet list; AC2 fits Epic Context body + Avoidances forbid-list; AC4 anchors extend existing Epic asset test. All four named surfaces exist as claimed.
- **[archive_only_evidence]** architecture_assessment: Instruction/spec alignment over an existing typed ops-followup subsystem. Design reuses adv_followup_promote / ops_followup_links rather than inventing an Epic-native operations model, preserving one release authority (rq-opsFollowRelease01) and one source of truth. Cited requirements (rq-opsFollowRelease01, rq-opsRunbook01, rq-opsRunReleaseReadiness01, rq-opsFollowTrace01) all exist and back the release-safety and provenance claims. Relationship semantics (blocks vs follows_release/monitors/cleanup_after) match both the spec law and the followup.ts enum exactly. All named affected surfaces (advance-epics spec.json, docs mirror, ADV_INSTRUCTIONS Epic Context, adv-epic Phase 1, adv-coordinate audit, advance-epics-assets.test.ts) are real, structurally correct insertion points. C2 (no heuristic mandate) and C3 (advisory order) honored: operational need stays contextual, not inferred from Epic metadata - consistent with P33 since ops need cannot be structurally inferred without false mandates. DDC3/OOS1 (no schema/validator/gate/execution change) respected. Minor structural-anchor caution: ops relationship laws + enforcing test live in advance-workflow / ops-follow-up-assets.test.ts, while the new requirement + anchors live in advance-epics / advance-epics-assets.test.ts. AC4's negative-anchor guarantee must assert against the NEW advance-epics requirement text, not re-assert advance-workflow ops laws, to avoid false coverage / cross-spec drift. Implementation-precision note for planning, not a design defect.
- **[wisdom_candidate]** wisdom_candidates: [convention] For planning-only cross-cutting guidance, bind the new law to existing typed runtime laws and test canonical instruction/spec surfaces rather than duplicating a second operational mechanism.
- **[archive_only_evidence]** verification: tests_run=git diff --check HEAD~2..HEAD, bin/oc-test targeted -- src/advance-epics-assets.test.ts results=pass — Read-only review of both commits (6 files, docs/spec/command/test only). git diff --check passed. Focused asset suite passed: 1 file, 60 tests. Execution evidence supplied by packet also reports bin/oc-test full (329 files/4832 tests), pnpm check, and pnpm build passing.
- **[archive_only_evidence]** findings: [info] contract-scope: All approved criteria trace to canonical spec, instruction, commands, and focused drift anchors; no untraced criteria or out-of-scope implementation changes.
- **[archive_only_evidence]** findings: [info] test-slop: Slop detector coverage degraded: knip failed parsing and ast-grep/jscpd are unavailable. Do not interpret zero detector findings as a complete slop sweep.
- **[archive_only_evidence]** findings: [info] test-slop: Two low maintainability observations: pre-existing bounded-wildcard asset-test regexes can yield opaque failures; no release-impacting defect found.

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
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| DONT4 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |

## Unresolved Actions

- Ensure sibling task tk-4dafc1d36282 lands an external citation for rq-epicOpsPlanning01 before running spec-citation-invariant as a CI gate (currently flags only this reqId by design).
- verification_missing: No adv_run_test evidence found for reported command: node -e "require('./.adv/specs/advance-epics/spec.json')" + schema-shape check on rq-epicOpsPlanning01
- verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/advance-epics-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: ../bin/oc-test targeted -- src/__tests__/spec-citation-invariant.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/advance-epics-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/__tests__/spec-citation-invariant.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/advance-epics-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/advance-epics-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/advance-epics-assets.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/__tests__/spec-citation-invariant.test.ts
- verification_missing: No adv_run_test evidence found for reported command: pnpm --dir plugin exec eslint src/advance-epics-assets.test.ts
