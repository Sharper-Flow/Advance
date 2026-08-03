# Archive Briefing Digest

**Change ID:** fixWorkerBundleProvenanceGate
**Title:** Fix worker bundle provenance gate
**Status:** archived
**Generated:** 2026-08-03T23:41:45.849Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: discovery

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

Showing 55 of 55 durable facts.

- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/types/changes.worker-bundle-provenance.test.ts, pnpm --dir plugin run typecheck, git diff --check 1680c330^ 1680c330 -- plugin/src/types/changes.ts plugin/src/types/changes.worker-bundle-provenance.test.ts results=pass — Focused Vitest suite passed 7/7. TypeScript typecheck exited 0 with no output. git diff --check was clean. An initial focused-test invocation with plugin/src/... exited 1 because oc-test executes from plugin/ and the filter must be src/...; corrected invocation passed.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/types/changes.worker-bundle-provenance.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run typecheck
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check 1680c330^ 1680c330 -- plugin/src/types/changes.ts plugin/src/types/changes.worker-bundle-provenance.test.ts
- **[archive_only_evidence]** verification: tests_run=git diff --stat -- plugin/schemas/ && git diff --numstat -- plugin/schemas/ && git diff --check -- plugin/schemas/ && git diff -- plugin/schemas/, pnpm run schemas:check results=pass — Schema diff is exactly one file, plugin/schemas/change.schema.json, with 26 insertions and 0 deletions; git diff --check passed. The added workerBundleProvenance object has four required string fields (source_sha, build_run_id, replay_run_id, recorded_at), optional numeric worker_manifest_generation, and is absent from the parent required list. schemas:check exited successfully. schema-registry.ts has no diff and already registers ChangeSchema as change.schema.json.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --stat -- plugin/schemas/ && git diff --numstat -- plugin/schemas/ && git diff --check -- plugin/schemas/ && git diff -- plugin/schemas/
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run schemas:check
- **[archive_only_evidence]** decisions: Made the provenance signal mock apply its payload to a captured Change before retaining the existing signal-argument assertions. — The mocked boundary now fails when the recorded receipt is dropped, reproducing the defect the prior no-op mock concealed.
- **[archive_only_evidence]** decisions: Used real TestRunRecord-shaped build_worker and replay_determinism entries in a saveChange/loadChange fixture and asserted both the evaluator and archive preflight pass. — This proves the full persisted Change shape required by the evaluator survives disk reload and satisfies AC2/AC3 without duplicating projection-layer tests.
- **[archive_only_evidence]** decisions: Applied a formatting-only cleanup to the adjacent worker-bundle schema test. — The repository check was otherwise blocked by that pre-existing Prettier failure; no behavior or assertions changed.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.worker-bundle.test.ts (1) — RED: tightened mocked-boundary assertion failed because the no-op fireSignalAndRefresh mock dropped workerBundleProvenance.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.worker-bundle.test.ts src/storage/worker-bundle.archive-roundtrip.test.ts (0) — GREEN: 2 test files and 11 tests passed after applying payload persistence in the mock and adding the disk round-trip/archive preflight test.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.worker-bundle.test.ts src/storage/worker-bundle.archive-roundtrip.test.ts src/types/changes.worker-bundle-provenance.test.ts (0) — VERIFY: 3 test files and 18 tests passed.
- **[archive_only_evidence]** verification: pnpm --dir plugin run check (0) — PASS: schemas, typecheck, manifest/frontmatter/isolation/lockfile checks, lint (existing warnings only), and formatting checks.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msdo788u_e3cd1006
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msdo9i7m_b731ad94
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msdoj5cv_a333cfae
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msdonguv_41f8a8cb
- **[archive_only_evidence]** decisions: Added an explicit unresolvable build/replay run-ID guard test. — Existing tests covered missing receipts, blank source_sha, wrong evidence_kind, and failing runs, but did not prove both plausible IDs must resolve to durable typed runs.
- **[archive_only_evidence]** decisions: Added a persistent-Change path-hint test for undeclared impact. — It verifies worker-bundle path hints cannot bypass the typed worker_bundle_impact declaration authority.
- **[archive_only_evidence]** decisions: Strengthened archive preflight assertions to inspect readinessBlockers shape. — Existing archive-gate coverage checked blocker text/codes; this preserves the structured code, gateId, message, and remediation contract consumed downstream.
- **[archive_only_evidence]** decisions: Added the already-present worker-bundle archive round-trip test to the raw saveChange inventory. — The required full sweep exposed a deterministic test-inventory regression from that test's intentional disk fixture write; the allow-list entry is test-only and does not alter production behavior.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec vitest run src/temporal/gate-readiness.test.ts src/tools/change/archive-gate.test.ts (0) — Pass: 2 test files, 168 tests; worker-bundle readiness and archive-gate tests.
- **[archive_only_evidence]** verification: pnpm --dir plugin run schemas:check (0) — Pass: generated JSON schemas are deterministic and up to date.
- **[archive_only_evidence]** verification: pnpm --dir plugin run check (0) — Pass: typecheck, manifest/frontmatter/isolation/lockfile checks, lint (4 pre-existing warnings), and format check.
- **[archive_only_evidence]** verification: VITEST_MAX_WORKERS=4 bin/oc-test full (1) — Initial full unit sweep failed one inventory assertion: worker-bundle.archive-roundtrip.test.ts was an unenumerated raw saveChange caller.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec vitest run src/storage/save-change-allow-list.test.ts (1) — Isolated reproduction confirmed the inventory failure: 5 passed, 1 failed.
- **[archive_only_evidence]** verification: pnpm --dir plugin exec vitest run src/storage/save-change-allow-list.test.ts (0) — Pass after adding the adjacent test-only allow-list entry: 6 tests passed.
- **[archive_only_evidence]** verification: VITEST_MAX_WORKERS=4 bin/oc-test full (0) — Pass: final full unit sweep completed with exit code 0 and no failed tests reported by oc-test; aggregate Vitest counts were truncated by the bounded runner output.
- **[archive_only_evidence]** verification: VITEST_MAX_WORKERS=4 bin/oc-test full (1) — Recorded initial full-sweep failure for regression comparison; resolved before final verification.
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msdp084l_22b38222
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msdpphonx_09557993
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msdp2ufx_c47e8eda
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msdp8ekm_523fdaa2
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msdp8u9z_95562a2b
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msdp9yuu_ff0573b7
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msdpev90_750c8961
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_msdp8ekm_523fdaa2
- **[report_follow_up]** follow_ups: Author WorkerBundleProvenanceSchema and wire Option B fix in shared.ts + types/changes.ts
- **[report_follow_up]** follow_ups: Add disk-projection round-trip test (provenance record -> disk read -> archive preflight pass) mirroring spec-deltas.disk-projection.test.ts
- **[report_follow_up]** follow_ups: Consider auditing TEMPORAL_OWNED_PROJECTION_FIELDS vs ChangeWorkflowState for any OTHER workflow-owned fields silently dropped (related-scan P25)
- **[research_citation]** sources: TEMPORAL_OWNED_PROJECTION_FIELDS + projectTemporalStateOntoLatest (DECISIVE): Explicit allowlist of fields a Temporal dual-write may overwrite on the disk projection. Neither worker_bundle_impact nor workerBundleProvenance is listed. projectTemporalStateOntoLatest maps state then picks ONLY allowlisted fields, returning {...latest, ...temporalOwned}. (plugin/src/storage/store-temporal/shared.ts:136-184)
- **[research_citation]** sources: mapTemporalChangeStateToChange (DECISIVE): Field-by-field mapper from ChangeWorkflowState to Change. Produces neither worker_bundle_impact nor workerBundleProvenance. This is the explicit mapping the user could not find. (plugin/src/storage/store-temporal/shared.ts:87-124)
- **[research_citation]** sources: persistStateToDisk dual-write path: Every workflow-driven disk write routes through commitChangeProjection with mutateLatest=projectTemporalStateOntoLatest. Strips both worker-bundle fields. (plugin/src/storage/store-temporal/index.ts:266-304)
- **[research_citation]** sources.omitted: 13 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: DECISIVE HYDRATION ANSWER: (b). The user searched for stateToChange/hydrateChange and found nothing because the mapping is split across TWO named functions in store-temporal/shared.ts: mapTemporalChangeStateToChange (field-by-field producer, lines 87-124) and TEMPORAL_OWNED_PROJECTION_FIELDS (allowlist, lines 136-167), combined by projectTemporalStateOntoLatest (lines 174-184) into {...latest, ...temporalOwned}. Neither worker-bundle field appears in EITHER list. Every workflow-driven disk write (persistStateToDisk index.ts:266; refresh changes.ts:1573) routes through this stripping merge. ROOT CAUSE REFUTED AS STATED: the missing Change schema declaration is NOT why the evaluator sees undefined. ChangeSchema uses .passthrough() (changes.ts:1526), so unknown fields are preserved on read; the field simply never reaches disk JSON because the projection write strips it. The real cause is the projection allowlist/mapper omitting workerBundleProvenance. WHY THE SIBLING worker_bundle_impact WORKS: set_worker_bundle_impact writes disk DIRECTLY via store.changes.save({...change, worker_bundle_impact}) at change.ts:2955-2956 before firing the signal; the field lands on latest and survives subsequent {...latest,...temporalOwned} spreads. provenance_record has NO direct save (change.ts:2862-2878), so the field is never on latest and never persists. Latent finding: worker_bundle_impact itself is ALSO absent from the allowlist and survives only via the direct-save coupling; any future signal-only setter would lose it too.
- **[report_follow_up]** follow_ups: Confirm whether ADV-owned build:worker+replay tool acceptable given it blocks host on heavy build; if not, spec before/after generation-diff precondition precisely (clean tree? no prior bundle?).
- **[report_follow_up]** follow_ups: Decide canonical bundle path at record/eval time: worktree plugin/dist/temporal (what build run produces) vs deployed ~/.local/share/Advance/plugin/dist/temporal (what ships). Document worktree-bundle provenance != deployed-artifact provenance in agreement.
- **[report_follow_up]** follow_ups: If proceeding, add replay-patch marker consistent with workflows.ts:1167-1198 discipline if any command-sequence divergence introduced.
- **[research_citation]** sources: adv_run_test signal payload: evidence_kind is caller-supplied enum label passed through unvalidated. testRunRecorded records runId/exitCode/classification/command/durationMs/evidence_kind/quality only; records NO bundle generation, artifact hash, or source SHA. A run record attests only 'this command exited 0'. (plugin/src/tools/test.ts:386,525-543)
- **[research_citation]** sources: adv_worker_bundle_provenance_record: source_sha, build_run_id, replay_run_id all caller-supplied and passed straight into the signal. worker_manifest_generation also caller-supplied and optional. (plugin/src/tools/change.ts:2793-2891)
- **[research_citation]** sources: Evaluator match logic + source_sha nonblank-only check: No binding of source_sha to any commit; no binding of receipt to any bundle generation. Match is purely (runId, evidence_kind, exitCode===0). (plugin/src/temporal/gate-readiness.ts:1068,1080-1131)
- **[research_citation]** sources.omitted: 5 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: The proposed design (capture source_sha from HEAD + bundle generation from disk at RECORD time; reject caller-supplied authenticity values) is NECESSARY but INSUFFICIENT. Record-time capture proves a bundle EXISTS on disk and that HEAD is some commit; it does NOT prove the recorded build_worker RUN produced that bundle. The reproduction survives unchanged whenever a real (possibly stale) worktree bundle is present on disk — the normal state after any prior legitimate build. The temporal binding (run -> artifact) is entirely absent. The robust closure is for ADV to perform build+replay itself in one privileged tool that emits the receipt with ADV-captured anchors and ADV-owned run IDs, eliminating caller-supplied run IDs and the evidence_kind label as an authority channel. Even that leaves a residual: worktree-build provenance does not bind the separately-deployed trunk artifact.
- **[unresolved_action]** validation.blockers: Core security claim false: design does not stop the true/true forgery. Capturing bundle generation at record time attests existence, not causation. With a stale-but-real worktree bundle on disk (normal post-build state), attacker running adv_run_test command:true evidence_kind:build_worker then ...replay_determinism then adv_worker_bundle_provenance_record records a receipt whose generation equals current on-disk generation and whose runs both exited 0 — gate passes. Evaluator (gate-readiness.ts:1080-1131) matches runId+evidence_kind+exitCode===0 and would additionally match generation==current, which holds because attacker never touched bundle. No file:line in proposed design establishes before/after-diff or ADV-owned-build binding.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| C4 | constraint | respected |

## Unresolved Actions

- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/types/changes.worker-bundle-provenance.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run typecheck
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check 1680c330^ 1680c330 -- plugin/src/types/changes.ts plugin/src/types/changes.worker-bundle-provenance.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --stat -- plugin/schemas/ && git diff --numstat -- plugin/schemas/ && git diff --check -- plugin/schemas/ && git diff -- plugin/schemas/
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm run schemas:check
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msdo788u_e3cd1006
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msdo9i7m_b731ad94
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msdoj5cv_a333cfae
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msdonguv_41f8a8cb
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msdp084l_22b38222
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msdpphonx_09557993
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msdp2ufx_c47e8eda
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msdp8ekm_523fdaa2
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msdp8u9z_95562a2b
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msdp9yuu_ff0573b7
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msdpev90_750c8961
- verification_missing: No durable adv_run_test evidence found for run_id: tr_msdp8ekm_523fdaa2
- Core security claim false: design does not stop the true/true forgery. Capturing bundle generation at record time attests existence, not causation. With a stale-but-real worktree bundle on disk (normal post-build state), attacker running adv_run_test command:true evidence_kind:build_worker then ...replay_determinism then adv_worker_bundle_provenance_record records a receipt whose generation equals current on-disk generation and whose runs both exited 0 — gate passes. Evaluator (gate-readiness.ts:1080-1131) matches runId+evidence_kind+exitCode===0 and would additionally match generation==current, which holds because attacker never touched bundle. No file:line in proposed design establishes before/after-diff or ADV-owned-build binding.
