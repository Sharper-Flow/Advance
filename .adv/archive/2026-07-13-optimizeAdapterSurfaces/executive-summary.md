# Executive Summary

## Outcome

This change is ready for user acceptance. It makes required ADV slop-scan coverage reproducible while preserving the earlier target-project, recovery, and concurrent gate-order safety work.

## Why It Matters

Required static-analysis detectors now resolve from declared repository dependencies and produce parsed, actionable output. Future work will not silently lose Knip, jscpd, or ast-grep coverage because a developer lacks global binaries or runs from the wrong directory.

## What Was Built

1. Added repository-local Knip, jscpd, and ast-grep dependencies plus committed Knip/jscpd configuration.
2. Added root `sgconfig.yml` and a bounded TypeScript `no-debugger` structural rule.
3. Routed jscpd and ast-grep through `pnpm exec` at `plugin/`, matching Knip and preserving absolute scan targets.
4. Updated Knip JSON parsing for Knip 6 `issues[]` output; added detector command, parser, rule-discovery, and degraded-to-run recovery tests.
5. Preserved required-detector severity: unavailable required tooling still degrades the scan rather than falling back silently.
6. Retained prior target-path authority/cache-refresh pins, recovery characterization, and concurrent-signaling gate-order coverage.

## What Was Verified

- `bun test bin/lib/slop-scan`: 42 passing tests.
- `bun test bin/`: 207 passing tests.
- `pnpm run check`: passed.
- `bin/oc-test full`: passed.
- `bin/adv slop-scan plugin/src/tools/change.ts --json`: required eslint, Knip, jscpd, and ast-grep detectors all reported `run`; no `SLOP_SCAN_DEGRADED`.
- Independent acceptance review: READY, no blockers, no source changes; targeted adapter/concurrency tests: 108 passing.

## Remaining Concerns

Non-blocking: `@ast-grep/cli` currently uses an explicit `allowBuilds: false` workaround so its JS launcher resolves the platform binary. Revisit only if package installation behavior changes. No data migration, production operation, frontend, or preview impact.

## Release Readiness

Acceptance evidence is complete. Release hardening still must re-check final branch, deployment/docs/cleanup implications, and archive readiness before sign-off.