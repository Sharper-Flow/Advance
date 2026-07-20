# Archive Briefing Digest

**Change ID:** hardenSlopScanTestEnv
**Title:** Harden slop-scan test env
**Status:** archived
**Generated:** 2026-07-17T04:02:15.458Z

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

Showing 29 of 29 durable facts.

- **[archive_only_evidence]** decisions: Launch ADV with process.execPath instead of the bare 'bun' command — AC1 requires the CLI test to use the actual executable path; avoids depending on PATH to find 'bun'.
- **[archive_only_evidence]** decisions: Pass child-only env via runAdv options rather than mutating process.env — Preserves isolation and satisfies C1/DONT1.
- **[archive_only_evidence]** decisions: Normalize PATH case-insensitively and replace with an absolute empty temp directory — AC2/C2; empty directory avoids ambiguous empty-PATH semantics and works cross-platform with Path/PATH.
- **[archive_only_evidence]** decisions: Validate the report with validateSlopScanReport before content assertions — Turns the shape check into a contract proof and satisfies design-derived criteria.
- **[archive_only_evidence]** decisions: Assert each of the four important TypeScript detectors is unavailable — AC4 distinguishes unavailable detectors from other failure states and guarantees SLOP_SCAN_DEGRADED.
- **[archive_only_evidence]** verification: bun test bin/adv.test.ts --test-name-pattern "degraded" (0) — Focused degraded-path test passes in ~538 ms (was timing out at 5 s before fix).
- **[archive_only_evidence]** verification: bun test bin/adv.test.ts (0) — Full CLI test suite passes: 16 pass, 0 fail.
- **[archive_only_evidence]** verification: bun test bin/lib/slop-scan/ (0) — All slop-scan unit tests pass: 42 pass, 0 fail.
- **[report_follow_up]** follow_ups: Packet omitted IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION anchors; analysis followed TASK_SCOPE and signed agreement without inferring them.
- **[report_follow_up]** follow_ups: No draft design artifact was available; scout evaluated proposal and agreement only, as requested.
- **[report_follow_up]** follow_ups: Prior-consideration/conflict-scan data was not provided; candidate novelty is unknown.
- **[research_citation]** sources: Current CLI test helper and degraded-path test: runAdv currently launches a bare bun command, always copies the parent environment, and the degraded-path test relies on ambient detector availability. (file:///home/jon/dev/advance/bin/adv.test.ts#L44-L58,L169-L187)
- **[research_citation]** sources: Detector runner environment and unavailable classification: Each detector subprocess inherits the CLI child's environment; spawn errors normalize to unavailable. (file:///home/jon/dev/advance/bin/lib/slop-scan/runner.ts#L48-L71)
- **[research_citation]** sources: TypeScript detector registry: TypeScript selects required eslint, knip, ast-grep, and jscpd detectors, plus non-important external Semgrep coverage. (file:///home/jon/dev/advance/bin/lib/slop-scan/registry.ts#L17-L73)
- **[research_citation]** sources.omitted: 3 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Pass. Boring design: extend runAdv with a child-only environment override, launch the CLI through process.execPath, create an absolute empty PATH directory inside the unique fixture, assert exact unavailable states for the four required TypeScript detectors, and clean temporary fixtures in finally. Keep production scanner and detector timeout defaults unchanged. Candidates: (1) options-object helper extension—adopt_now, high payoff/low risk, tied to AC1/AC2/C1; (2) exact ID-to-state assertions—adopt_now, high payoff/low risk, tied to AC3/AC4/SC2; (3) fixture-local empty bin plus finally cleanup—design_around, medium payoff/low risk, tied to C2/C3; (4) explicit 5000ms Bun test timeout—adopt_now, medium payoff/low risk, tied to AC5/SC3. No detector-present case: agreement marks it out of scope.
- **[report_follow_up]** follow_ups: The ADV-generated briefing packet was truncated by host output, but identity anchors came from the user packet and current agreement/design were fetched through adv_change_show; no identity inference was required.
- **[report_follow_up]** follow_ups: Semantic local search timed out twice, including the required non-hybrid retry; symbol/text search and direct source reads supplied local evidence instead.
- **[report_follow_up]** follow_ups: Episode recall returned no authoritative change-specific guidance; recalled text was not used as evidence.
- **[report_follow_up]** follow_ups: After the two cautions are incorporated, verify through the repository's required bin/oc-test routing rather than direct bun test invocation.
- **[research_citation]** sources: Signed agreement and contract: AC1-AC6 require process.execPath launch, child-only absolute empty-directory PATH, exit 1, parseable slop_scan_report.v1, four unavailable detector IDs, 5,000ms bound, and existing coverage green; C1-C3 require child isolation, absolute path semantics, portability, and parallel-test safety. (adv://change/hardenSlopScanTestEnv/agreement)
- **[research_citation]** sources: Draft design: Design confines changes to bin/adv.test.ts, extends runAdv with cwd/env options, uses process.execPath, fixture-local empty PATH, exact detector assertions, 5,000ms test timeout, and cleanup. (adv://change/hardenSlopScanTestEnv/design)
- **[research_citation]** sources: Current CLI dispatcher test: runAdv currently launches bare bun with inherited env; degraded test only checks generic failed important detectors and does not isolate PATH or clean its fixture. (file:///home/jon/dev/advance/bin/adv.test.ts#L44-L58,L169-L187)
- **[research_citation]** sources.omitted: 10 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Mostly correct, simple, and spec-aligned, with two implementation-level corrections needed before approval. Child-scoped env injection, absolute process.execPath launch, fixture-local empty directory, exact detector states, timeout bound, and finally cleanup are conventional and keep production scanner behavior unchanged. However, `{ ...process.env, PATH: emptyDir }` is not portable on Windows because Bun's own harness documents duplicate case-insensitive `Path`/`PATH` keys and first-key-wins behavior; this can leave the ambient path effective and violate C3/AC2. Construct child env by removing every inherited key whose uppercase form is `PATH`, then add one canonical `PATH`. Also fulfill 'parses as slop_scan_report.v1' structurally by calling the existing validateSlopScanReport rather than checking only schema_version. Deviation: MINOR; both fixes remain test-only and preserve the design's architecture.
- **[unresolved_action]** required_main_agent_actions: Resend a valid Context Packet containing a valid remediation TASK ID or independent-review SCOPE KEY, plus the existing CHANGE, ATTEMPT, PHASE, and WORKING DIRECTORY anchors.
- **[archive_only_evidence]** verification: tests_run= results=n/a — No analysis started: packet identity validation failed before scope lock.
- **[wisdom_candidate]** wisdom_candidates: [success] Hermetic CLI degraded-path tests can preserve parent isolation by passing a copied child env with all case variants of PATH removed and one absolute empty directory assigned to PATH; launch via process.execPath so the test runtime itself is not PATH-dependent.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- bin/adv.test.ts (wrapper target mismatch; then fallback bun test bin/adv.test.ts), bun test bin/adv.test.ts, bun test bin/lib/slop-scan/, git diff 58d65284..HEAD --check results=pass — The repository wrapper only targets plugin Vitest files, so bin/adv.test.ts produced its deterministic 'No test files found' wrapper result; its immediate Bun fallback passed 16/16 tests in 6.53s. Direct Bun verification (the only runner supporting root bin tests) passed bin/adv.test.ts: 16 pass, 0 fail, and bin/lib/slop-scan/: 42 pass, 0 fail. Diff whitespace check passed. Static review confirms AC1 process.execPath launch; AC2 child-only, case-insensitive PATH replacement with absolute empty fixture; AC3 schema validation and exact exit 1; AC4 all four required detectors unavailable and SLOP_SCAN_DEGRADED; AC5 explicit 5,000 ms test timeout; AC6 relevant CLI and scan coverage green. No global process.env mutation, fake executable, detector-present coverage, or runtime-timeout change found.

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
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |

## Unresolved Actions

- Resend a valid Context Packet containing a valid remediation TASK ID or independent-review SCOPE KEY, plus the existing CHANGE, ATTEMPT, PHASE, and WORKING DIRECTORY anchors.
