# Executive Summary: makeLegacyDesignValidation

## Outcome

Legacy ADV changes whose historical `subagent_reports` contain string-form `researcher:design-validation` blockers are now fully readable, archivable, and completable through normal ADV tooling. The wedged Vision `fixPlaywrightSessionIsolation` change (acceptance-done, un-archivable since 2026-07-20) unblocks on the normal archive path.

## Value / why it matters

A schema-evolution defect made fully-verified, shipped changes permanently un-archivable: their spec deltas couldn't apply, and the ADV change couldn't retire. The code was already merged to trunk out-of-band to unblock the machine, but the ADV state was stuck at acceptance-done with no supported repair path. This change restores the archive path for any historical change in this shape — without weakening the typed-blocker requirement for new submissions.

## What was built

**Tolerant reader, strict writer** — relocated the "design-validation blockers must be typed" enforcement from `ResearcherSubagentReportSchema.superRefine` (parse-time, runs on every read) to the `adv_subagent_report_submit` handler `executeSubmit` (write-time only).

- **Schema** (`plugin/src/types/subagent-reports.ts`): removed check-3 from `ResearcherSubagentReportSchema.superRefine`. The three sibling checks (pass+low-confidence, fail+no-blockers, design-validation+not_applicable) stay. Added a relocation comment to prevent regressions.
- **Handler** (`plugin/src/tools/subagent-report.ts`): added a string-blocker check inside the existing design-validation `if`-block, BEFORE the AC13 unknown-contract-IDs `flatMap`. New bare-string blockers on new submissions are rejected with the same `INVALID_REPORT` + message + offending indices as before — only the location changed.
- **Recovery writer** (`plugin/src/tools/_recovery-writers.ts`): unchanged. Already used a loose structural interface; confirmed tolerant.

## Spec-conformance angle

This was a conformance fix, not a relaxation. Spec `rq-subagentReports24.1` already targets `adv_subagent_report_submit` as the enforcement boundary (`"when": "adv_subagent_report_submit validates the report"`). Spec body (`.adv/specs/subagent-reports/spec.json` L1167) names the submit tool as the canonical preflight. The schema-time check-3 was an over-implementation beyond what the spec mandated.

## Verification

- **241 tests passed** across 9 affected test files (bin/oc-test targeted, 3.65s)
- **All 5 acceptance criteria green** (AC1 read tolerance, AC2 archive-through, AC3 write strictness, AC4 other read paths, AC5 regression tests)
- **All 7 constraints respected** (C1-C7)
- **All 3 avoidances respected** (DONT1-3)
- **Independent reviewer verdict**: READY (141 focused tests + TypeScript check pass; contract implementation matches)
- **`pnpm run check` green** (schemas, typecheck, manifests, lint, format)

## Key design decisions

1. **Relocation over migration** — no data migration tool, no on-disk rewrite, no read-time coercion. Immutable history simply becomes readable.
2. **C7 ordering rationale corrected during design** — the validator caught that the original "crash prevention" rationale was inaccurate (the AC13 `flatMap` already silently skips strings). Real motivation: **silent-acceptance prevention** — without the string check first, new bare-string blockers would slip through AC13 and persist via normal signaling.
3. **TDD red→green across task boundaries** — task-1's removal caused the existing test to fail (red); task-3 updated the assertion to prove legacy tolerance (green). All production tasks captured red evidence via `adv_run_test`.

## Risks / follow-ups

- **Real-world AC2 validation**: the Vision `fixPlaywrightSessionIsolation` change should be archived on the normal path once this ships. Recommend attempting that archive post-merge as real-world confirmation.
- **Spec drift prevention**: the relocation comment in `subagent-reports.ts` warns future maintainers not to re-add schema-time rejection. The spec already documents the boundary, but the comment is defense-in-depth.
- **No other known risks**: no public API change, no spec delta, no recovery-path change, no new exported symbol.
