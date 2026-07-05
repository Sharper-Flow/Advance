# Executive Summary — Make degraded slop-scan fail fast

## Outcome

`slop-scan` now treats degraded required detector coverage as an unsuccessful scan instead of producing degraded fallback findings.

## What changed

- Added typed `SLOP_SCAN_DEGRADED` failure envelope to `slop_scan_report.v1`.
- Added structural required-coverage helpers over `DetectorCoverage.important` and coverage states.
- `bin/adv slop-scan` now exits `1` when required detector coverage is degraded/failed/timed out/unavailable/skipped.
- JSON output remains parseable and includes `failure.code`, `failure.message`, and `failure.failedDetectors[]`.
- Text output renders `SLOP SCAN FAILED`, names failed required detectors, and avoids `[OK]` on failed coverage.
- Spec, command contract, generated spec docs, slop-scan skill guidance, and asset tests now document fail-fast semantics instead of brace/indent degraded fallback.

## Verification

- `bun test bin/lib/slop-scan/schema.test.ts` — passed.
- `bun test bin/adv.test.ts --test-name-pattern "adv slop-scan dispatcher"` — passed.
- `bun test bin/lib/slop-scan/render.test.ts` — passed.
- `bun test bin/lib/slop-scan/schema.test.ts bin/lib/slop-scan/render.test.ts bin/lib/slop-scan/runner.test.ts bin/lib/slop-scan/registry.test.ts bin/adv.test.ts` — 31 tests passed.
- `../bin/oc-test targeted -- src/adv-slop-scan-assets.test.ts src/slop-scan-false-positive-fixtures.test.ts` — 18 tests passed.
- Reviewer ran `../bin/oc-test targeted -- src/adv-slop-scan-assets.test.ts src/adv-skill-backed-commands-assets.test.ts src/slop-scan-false-positive-fixtures.test.ts` — 72 tests passed.
- Static stale fallback scan passed across spec, command, and docs.

## Review

Independent reviewer verdict: `READY`; no blocking findings. Reviewer removed stale failback wording from slop-scan skill assets and updated asset tests.

## Remaining concerns

None for this change. Broader Epic entries remain future work.