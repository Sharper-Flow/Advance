# Archive Briefing Digest

**Change ID:** fixTemporalCitationInvariant
**Title:** Fix temporal citation invariant
**Status:** archived
**Generated:** 2026-07-13T18:20:19.067Z

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
| release | pending |

## Epic Context

No Epic membership

## Durable Facts

Showing 24 of 24 durable facts.

- **[archive_only_evidence]** decisions: Placed JSDoc comment directly above the deterministic-API enforcement test inside the describe block — Keeps citation adjacent to the enforcement site per AC1/AC2; JSDoc is versioned, scanned by spec-citation-invariant, and preserves locality of behavior
- **[archive_only_evidence]** verification: pnpm exec vitest run src/__tests__/spec-citation-invariant.test.ts --no-coverage (0) — 2/2 pass — citation invariant green with local anchor in place
- **[archive_only_evidence]** verification: pnpm exec vitest run src/temporal/workflow-bundle-boundary.test.ts --no-coverage (0) — 6/6 pass — workflow boundary behavior unchanged
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas, typecheck, isolation, lockfile, lint, format all green
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/__tests__/spec-citation-invariant.test.ts --no-coverage
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/workflow-bundle-boundary.test.ts --no-coverage
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- **[agenda]** follow_ups: Optional post-merge hygiene (out of scope, do not expand this change): the paired rq-changeWorkflowSignalOnly01 now has two citations (_adapters.ts + boundary test) — harmless; no action required.
- **[archive_only_evidence]** sources: Spec law rq-temporalTsDeterminismDocs01 (advance-delivery): Requires agent-facing guidance to state Date.now()/new Date()/Math.random() are deterministic sandbox values, route timers to sleep()/condition(), and distinguish official Temporal TS determinism from the project signal-only change-workflow surface. Priority 'should'.
- **[archive_only_evidence]** sources: Spec law rq-changeWorkflowSignalOnly01 (advance-delivery): Change workflow code stays signal/query-based; no defineUpdate; regression scan must fail on wf.defineUpdate/defineUpdate but must NOT fail merely because patched Date/random APIs are used. Paired law with the determinism-docs requirement.
- **[archive_only_evidence]** sources: Citation invariant enforcement (literal token scan): findCitedRequirements builds an alternation regex over active requirement IDs and scans file CONTENTS under searchRoots including join(REPO_ROOT,'plugin/src') plus AGENTS.md/ADV_INSTRUCTIONS.md/CHANGELOG.md. ANY literal ID match in a scanned file satisfies the invariant. docs/specs mirrors and own spec.json excluded; meta.status=planned skipped. A comment token is sufficient — no executable code required.
- **[archive_only_evidence]** sources: Workflow-boundary enforcement site: forbiddenWorkflowSurfaceUsages rejects wf.defineUpdate/defineUpdate; the passing unit test asserts a fixture containing Date.now()/new Date()/Math.random() yields ONLY ['wf.defineUpdate'] — i.e. deterministic APIs are not flagged. This is the versioned enforcement site for both requirements and lives under the plugin/src scan root. Currently lacks either requirement-ID token.
- **[archive_only_evidence]** sources: Current sole citation (fragile prose anchor): The only existing citation for rq-temporalTsDeterminismDocs01 is a trailing HTML comment. grep of plugin/src returns zero matches. Archive digests (fixChangeListTimeouts, fixShallowRepoIdentity, alignCoordinateProjects) confirm this requirement is the single reproduced uncited baseline failure. AGENTS.md content also accurately matches the spec scenario (patched Date/random, sleep()/condition() routing, signal-only distinction).
- **[archive_only_evidence]** sources: Pre-existing paired-citation precedent: rq-changeWorkflowSignalOnly01 is ALREADY cited in plugin/src (not presently uncited). Adding it beside the boundary test is a locality co-citation (agreement O2/AC2), not a fix for a missing citation — a benign, low-risk addition consistent with the repo's comment-anchor convention.
- **[archive_only_evidence]** sources: Temporal TypeScript SDK determinism (official docs): Confirms Date.now()/new Date() are deterministic (time of last Workflow Task completion, advances on await sleep()), Math.random() is deterministic and safe in the sandbox, and functions like Math.random/Date/setTimeout are replaced by deterministic versions. Corroborates every factual claim the proposed comment will assert; the signal-only/no-defineUpdate rule is project-specific, correctly framed as distinct.
- **[archive_only_evidence]** architecture_assessment: The design is a comment-only citation anchor added beside the deterministic-API enforcement in plugin/src/temporal/workflow-bundle-boundary.test.ts, containing the literal IDs rq-temporalTsDeterminismDocs01 and rq-changeWorkflowSignalOnly01 plus accurate prose (patched Date/new Date/Math.random allowance; wf.defineUpdate rejection). Verified structurally sound against all three enforcement sites: (1) The citation invariant is a pure literal-token content scan whose searchRoots include plugin/src, so a comment token in this test file is scanned and satisfies AC1/AC3 — no code or telemetry needed, honoring C1/C2/DONT3. (2) The chosen location is the versioned enforcement site for BOTH requirements and is strictly more local/durable than the single fragile AGENTS.md trailing comment (C3 preserves AGENTS.md prose while removing sole-anchor fragility; DONT1 satisfied because the citation is in a live scanned source, not archive-only). (3) The proposed comment prose is accurate against the spec law body/scenario AND against official Temporal TS SDK docs — Date.now()/new Date()/Math.random() are genuinely deterministic sandbox-patched and permitted, while defineUpdate is a project-specific restriction correctly distinguished. AC2's co-citation of rq-changeWorkflowSignalOnly01 is a benign locality addition (that requirement is already independently cited at _adapters.ts:8), so it cannot regress. Acceptance commands prove the contract exactly: the citation-invariant targeted test (AC3) is the literal gate the fix satisfies, the workflow-boundary targeted test (AC4) proves no behavior change at the enforcement site, and pnpm run check (AC5) covers lint/format/typecheck of the touched test file. No runtime, schema, workflow, or bounded-read surface is reached — matching the archived-and-merged fixChangeListTimeouts boundary. Deviation from by-the-book citation-anchor convention: NONE (matches the // rq-{ID} comment pattern already used across plugin/src, e.g. _adapters.ts).
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/__tests__/spec-citation-invariant.test.ts src/temporal/workflow-bundle-boundary.test.ts, git diff --check trunk...HEAD results=pass — Citation invariant: 2/2 passed; workflow boundary: 6/6 passed (8 total). Branch diff against merge-base trunk is a clean 9-line comment-only addition in plugin/src/temporal/workflow-bundle-boundary.test.ts; no behavior, bounded-read, or telemetry code changed.
- **[unresolved_action]** required_main_agent_actions: Present the AC3 scope-drift finding to the user via Tier A inline approval per docs/scope-discovery-protocol.md.
- **[unresolved_action]** required_main_agent_actions: On approve: reenter from discovery, amend AC3 to `bin/oc-test targeted -- src/__tests__/spec-citation-invariant.test.ts`, then refresh acceptance evidence.
- **[unresolved_action]** required_main_agent_actions: On split: create a fast-follow solely to align the wrapper invocation documented in the agreement.
- **[unresolved_action]** required_main_agent_actions: On reject: record rejected_with_evidence for this finding; release must not claim literal AC3 proof passed.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] `bin/oc-test` runs Vitest from `plugin/`; root-invoked targeted paths must be `src/...`, not `plugin/src/...`. Keep acceptance commands aligned with the wrapper's working directory.
- **[unresolved_action]** scope_drift: stop_and_report: AC3 prescribes `bin/oc-test targeted -- plugin/src/__tests__/spec-citation-invariant.test.ts`, but the project wrapper runs in plugin/ and only resolves `src/__tests__/spec-citation-invariant.test.ts`. Updating the acceptance command changes an agreement criterion; no code edit was applied.
- **[archive_only_evidence]** verification: tests_run=git status --short && git diff --check && git diff --cached --check && git diff --no-ext-diff --unified=80 HEAD -- plugin/src/temporal/workflow-bundle-boundary.test.ts, bin/oc-test targeted -- plugin/src/__tests__/spec-citation-invariant.test.ts, bin/oc-test targeted -- src/__tests__/spec-citation-invariant.test.ts, bin/oc-test targeted -- src/temporal/workflow-bundle-boundary.test.ts, pnpm --dir plugin run check, git show --stat --format=fuller HEAD && git show --format= --unified=24 HEAD -- plugin/src/temporal/workflow-bundle-boundary.test.ts results=fail — Worktree is clean; HEAD 169ea392 changes only nine comment lines in plugin/src/temporal/workflow-bundle-boundary.test.ts. Exact citations and semantic wording verified at lines 90-96. The literal AC3 command failed because oc-test runs in plugin/. Corrected wrapper targets passed: citation invariant 2/2 and boundary suite 6/6. pnpm --dir plugin run check passed (schemas, typecheck, isolation, lockfile, lint, format).

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |

## Unresolved Actions

- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/__tests__/spec-citation-invariant.test.ts --no-coverage
- verification_missing: No adv_run_test evidence found for reported command: pnpm exec vitest run src/temporal/workflow-bundle-boundary.test.ts --no-coverage
- verification_missing: No adv_run_test evidence found for reported command: pnpm run check
- Present the AC3 scope-drift finding to the user via Tier A inline approval per docs/scope-discovery-protocol.md.
- On approve: reenter from discovery, amend AC3 to `bin/oc-test targeted -- src/__tests__/spec-citation-invariant.test.ts`, then refresh acceptance evidence.
- On split: create a fast-follow solely to align the wrapper invocation documented in the agreement.
- On reject: record rejected_with_evidence for this finding; release must not claim literal AC3 proof passed.
- stop_and_report: AC3 prescribes `bin/oc-test targeted -- plugin/src/__tests__/spec-citation-invariant.test.ts`, but the project wrapper runs in plugin/ and only resolves `src/__tests__/spec-citation-invariant.test.ts`. Updating the acceptance command changes an agreement criterion; no code edit was applied.
