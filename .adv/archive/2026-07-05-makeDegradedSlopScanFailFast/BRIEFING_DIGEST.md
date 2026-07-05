# Archive Briefing Digest

**Change ID:** makeDegradedSlopScanFailFast
**Title:** Make degraded slop-scan fail fast
**Status:** archived
**Generated:** 2026-07-05T01:35:58.001Z

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

Epic: optimizeAdvPerformanceStructure · Make degraded slop-scan fail fast (order 0)

## Durable Facts

Showing 30 of 30 durable facts.

- **[agenda]** follow_ups: Planning must include rewriting bin/adv.test.ts:169-184; move exit-0 coverage to a controlled all-run/synthetic report path.
- **[agenda]** follow_ups: Add validateSlopScanReport branch for optional failure: code in SLOP_SCAN_FAILURE_CODES and failedDetectors[] validated as DetectorCoverage; reject invalid failure code.
- **[agenda]** follow_ups: Decide fate of 'degraded' in DETECTION_METHODS enum (retain vs deprecate) now that no degraded fallback findings are produced.
- **[agenda]** follow_ups: Comment the 'skipped' required-failure branch as defensive/unreachable for required detectors (only external-ci important:false emits skipped today).
- **[archive_only_evidence]** sources: bin/lib/slop-scan/schema.ts: SlopScanReport interface + validateSlopScanReport. No extra-key rejection, so adding optional failure envelope is non-breaking for existing reports; new envelope needs its own validation branch.
- **[archive_only_evidence]** sources: bin/lib/slop-scan/scan.ts: runSlopScan assembles report.coverage.detectors = coverage then returns. Clean single attach point for attachSlopScanFailure(report) after line 380, exactly as design states.
- **[archive_only_evidence]** sources: bin/lib/slop-scan/registry.ts: All 8 local detectors important:true; external-ci-semgrep important:false. Confirms 'required detector = applicable + important:true' and that advisory external coverage is excluded from fail-fast.
- **[archive_only_evidence]** sources: bin/lib/slop-scan/runner.ts: ToolExecutionStatus produces failed|timed_out|unavailable; normalizeCoverageFromExecution maps success/findings->run, else passes status through as coverage state. These are the states the design keys fail-fast on.
- **[archive_only_evidence]** sources: bin/lib/slop-scan/adapters/external-ci.ts: Only producer of state 'skipped', and it is important:false. No required/local detector ever emits 'skipped', so the design's 'applicable-required skipped' failure state is currently unreachable for required detectors (defensive-only).
- **[archive_only_evidence]** sources: bin/lib/slop-scan/render.ts: renderSlopScanReport hardcodes 'SLOP SCAN REPORT' heading and emits '[OK] No slop detected.' when findings/warnings empty. Design's failure heading + suppress-OK edits land here; existing PROMINENT COVERAGE WARNINGS block already surfaces important warning states.
- **[archive_only_evidence]** sources: bin/adv slop-scan dispatch: runSlopScanCommand always returns 0. Design's exit-1-on-failure.code lands cleanly here; stdout JSON/text emission is preserved.
- **[archive_only_evidence]** sources: bin/adv.test.ts existing CLI test: Only slop-scan CLI integration test; runs in bare temp dir with a TS file and asserts exitCode 0. Under new behavior ESLint/knip/ast-grep/jscpd resolve unavailable/failed (required) -> exit 1. This test MUST be updated; exit-0 path must use a controlled all-run coverage/synthetic path per design test strategy.
- **[archive_only_evidence]** sources: slop-scan spec.json: rq-ss001 body, rq-ss001.4 (brace/indent degraded fallback findings + [DEGRADED: AST tool unavailable]), rq-ss002.3 ([DEGRADED: AST timeout] fallback), rq-ss006.3 (degraded fallback confidence:low default), rq-ss012 coverage visibility. All targeted by design; stale fallback language present exactly as agreement claims.
- **[archive_only_evidence]** sources: command adv-slop-scan.md fallback lines: Runner adapters line 61 'brace/indent fallback with detectionMethod: degraded'; line 73 'Degraded fallback findings default to confidence: low'. These are the stale fallback lines the design removes.
- **[archive_only_evidence]** sources: adv-slop-scan-assets.test.ts: rq-ss012 asset drift test asserts command contains 'Scanner Coverage Report', 'coverage.detectors[]', 'externally_covered', 'coverage.falsePositiveProtections'. Design must preserve these tokens when editing command; test does not currently assert on fallback-removal, so a new assertion is needed to lock fail-fast contract.
- **[archive_only_evidence]** sources: schema.test.ts / render.test.ts: Existing validator test and renderer warning test provide the fixture patterns the new failure-envelope + failure-heading tests extend. render.test already asserts no '[OK]' when important-unavailable warning present.
- **[archive_only_evidence]** architecture_assessment: Design is structurally sound and matches actual code. Failure modeled as a typed envelope on the existing report (single response shape preserved, parseable JSON, coverage retained) rather than a second format - correct per P33. Two pure helpers (requiredCoverageFailures, attachSlopScanFailure) isolate the decision from I/O and are trivially unit-testable. Integration points are exactly where claimed: single attach point at scan.ts:380, exit-code branch at bin/adv:218, heading/OK-suppression at render.ts:48/87. Required-detector definition (applicable + important:true) is directly backed by registry.ts and correctly excludes external-ci-semgrep (AC7). Failure states map 1:1 to runner ToolExecutionStatus outputs (failed/timed_out/unavailable) plus normalizeCoverageFromExecution pass-through, so no state escapes classification. validateSlopScanReport does not reject extra keys, so the optional failure field is backward-compatible; but the failure envelope must get a dedicated validation branch (code enum + failedDetectors[] as DetectorCoverage) or invalid failure codes pass silently. One real regression: the sole slop-scan CLI integration test (bin/adv.test.ts:169-184) asserts exit 0 in a bare temp dir where required detectors are unavailable; under fail-fast it flips to exit 1 and must be rewritten. 'skipped' as a required-failure state is defensively listed but unreachable for required detectors today. Spec/command edits are minimal and targeted; rq-ss012 asset tokens must be preserved and a new fail-fast assertion added.
- **[unresolved_action]** required_main_agent_actions: Include the three review-applied skill/asset-test edits in the final change set.
- **[unresolved_action]** required_main_agent_actions: Consider promoting wisdom candidate about backing skill/category docs when command semantics change.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] When command contracts load methodology skills, fail-fast semantic changes must update the backing skill/category docs too; otherwise slash-command guidance can still revive retired fallback behavior even if spec and command docs are correct.
- **[archive_only_evidence]** changes_made: skills/adv-slop-detection/SKILL.md: Removed stale degraded fallback confidence guidance and aligned skill guidance with SLOP_SCAN_DEGRADED fail-fast semantics.
- **[archive_only_evidence]** changes_made: skills/adv-slop-detection/CATEGORIES.md: Replaced brace/indent fallback guidance with required detector fail-fast guidance and removed low-confidence degraded fallback wording.
- **[archive_only_evidence]** changes_made: plugin/src/adv-skill-backed-commands-assets.test.ts: Updated skill-backed asset assertion to require SLOP_SCAN_DEGRADED and no low-confidence fallback language.
- **[archive_only_evidence]** verification: tests_run=Path preflight: test -e for all referenced implemented files/areas, git diff --stat trunk...HEAD, bun test bin/lib/slop-scan/schema.test.ts bin/lib/slop-scan/render.test.ts bin/adv.test.ts, ../bin/oc-test targeted -- src/adv-slop-scan-assets.test.ts src/adv-skill-backed-commands-assets.test.ts src/slop-scan-false-positive-fixtures.test.ts, static stale degraded fallback scan across spec/command/docs/skill assets results=pass — Path preflight OK. Reviewed typed schema, scan orchestration, renderer, CLI exit, docs/spec/command, registry/advisory external coverage, and tests. Corrected one initial verification invocation that used plugin cwd with root-relative bun paths; reran from repo root and passed 26 bun tests. Targeted plugin asset/fixture tests passed: 3 files, 72 tests. Static scan confirmed no stale '[DEGRADED: AST tool unavailable]', '[DEGRADED: AST timeout]', 'brace/indent counting fallback', or 'Degraded fallback findings default' wording in slop-scan spec/command/docs/skill assets.
- **[unresolved_action]** required_main_agent_actions: Review and checkpoint/commit the two scoped reviewer hardening edits before release/archive so git worktree returns clean.
- **[unresolved_action]** required_main_agent_actions: No additional code remediation required from harden review; release can proceed after checkpoint and normal release gate cleanliness verification.
- **[archive_only_evidence]** changes_made: slop-smells.yaml: Removed stale MAINT-004 brace/indent degraded fallback contract from canonical smell catalog; replaced it with SLOP_SCAN_DEGRADED required-coverage failure language so catalog matches fail-fast behavior.
- **[archive_only_evidence]** changes_made: plugin/src/adv-slop-scan-assets.test.ts: Extended slop-scan asset test to assert slop-smells.yaml contains SLOP_SCAN_DEGRADED and no longer contains brace/indent counter fallback text.
- **[archive_only_evidence]** verification: tests_run=bun test bin/, bin/oc-test targeted -- src/adv-slop-scan-assets.test.ts src/adv-skill-backed-commands-assets.test.ts, rg -n "brace/indent counter|brace/indent fallback with|\[DEGRADED: AST tool unavailable\]|\[DEGRADED: AST timeout\]" .adv/specs/slop-scan/spec.json .opencode/command/adv-slop-scan.md docs/specs/slop-scan.md skills/adv-slop-detection slop-smells.yaml || true, git status --short --branch results=pass — bun test bin/ passed 189 tests / 0 failed after scoped fix. Targeted plugin asset tests passed 68 tests / 0 failed. Static stale fallback scan over spec, command, generated docs, skill, categories, and slop-smells surfaces produced no matches. Current git status shows only the two intentional reviewer edits: plugin/src/adv-slop-scan-assets.test.ts and slop-smells.yaml.
- **[epic_terminal_note]** epic.membership: optimizeAdvPerformanceStructure · Make degraded slop-scan fail fast (order 0)

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
| C5 | constraint | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |
| OOS3 | out_of_scope | not_applicable |
| OOS4 | out_of_scope | not_applicable |
| OOS5 | out_of_scope | not_applicable |

## Unresolved Actions

- Include the three review-applied skill/asset-test edits in the final change set.
- Consider promoting wisdom candidate about backing skill/category docs when command semantics change.
- Review and checkpoint/commit the two scoped reviewer hardening edits before release/archive so git worktree returns clean.
- No additional code remediation required from harden review; release can proceed after checkpoint and normal release gate cleanliness verification.
