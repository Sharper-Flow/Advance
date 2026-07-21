# Executive Summary

## Outcome

Slop-scan detector execution now resolves nested package roots correctly, refuses ambiguous multi-package roots with an actionable candidate list, and gives large TypeScript/JavaScript scans enough time to complete. Successful detector stdout is preserved as parser input, preventing large valid JSON reports from being corrupted by the diagnostic output cap.

## Value

The original `ERR_PNPM_NO_PKG_MANIFEST` result falsely looked like missing detectors even though ESLint, Knip, jscpd, and ast-grep were installed under `plugin/`. The scanner now distinguishes package-layout ambiguity from detector availability. Running `bin/adv slop-scan plugin --json` produces real findings with every required detector in `run` state.

## What Changed

- Added nested package-root discovery when walk-up resolution finds no `package.json`.
- Added deterministic ambiguity failure when more than one immediate package root is eligible.
- Raised the default and project-level `ast_timeout_ms` from 10s to 30s.
- Preserved successful detector stdout for parsing while retaining bounded diagnostics for failed/timed-out processes.
- Added regression coverage for nested-root resolution, ambiguity, walk-up preservation, timeout default, and large detector output.

## Verification

- Full root Bun suite: **291 passed, 0 failed** (`tr_mrtwkh95_53a14fb5`).
- Focused slop-scan suite: **15 passed, 0 failed** (`tr_mrtwj42l_90bfdc93`).
- End-to-end plugin scan: `failure == null`; ESLint, Knip, ast-grep, and jscpd all `state=run` (`tr_mrtwjsl8_2e1a5d54`).
- Independent acceptance review: **READY**, no findings or scope drift (`fixSlopScanResolverTimeouts|change:review:acceptance|adv-reviewer|1`).
- Contract matrix: 21/21 rows passing or respected; 0 failures.

## Remaining Behavior

Default repo-root scan intentionally returns `SLOP_SCAN_DEGRADED` when both `acp-mux/` and `plugin/` qualify as package roots. It now explains the ambiguity and instructs the operator to pass an explicit path; it no longer misreports `ERR_PNPM_NO_PKG_MANIFEST`. Auto-install/bootstrap remains intentionally out of scope.

## Risks and Follow-ups

No release blocker found. Future enhancement: product-level multi-package aggregation or a configured default scan path could make `bin/adv slop-scan` scan `plugin/` without an explicit argument in this repository. That behavior was not part of the approved change.