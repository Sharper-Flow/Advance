# Archive Briefing Digest

**Change ID:** fixAdvRunTestPipefailFalse
**Title:** Fix adv_run_test pipefail false-green
**Status:** archived
**Generated:** 2026-07-23T16:21:11.751Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: triage #299

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

Showing 6 of 6 durable facts.

- **[archive_only_evidence]** decisions: Used targeted vitest -t filters for RED/GREEN evidence instead of full pnpm test -- src/tools/test.test.ts — Full-file run repeatedly exceeded the adv_run_test timeout due to Temporal worker bundle creation in the broader test environment; targeted filters reliably completed in ~3-4s and still exercised the new assertions.
- **[archive_only_evidence]** decisions: Spawned non-Windows commands through bash -c 'set -o pipefail; <command>' with shell:false — Preserves /bin/sh default on Windows while giving Linux/macOS pipefail semantics exactly as approved; keeps cwd/detached/windowsHide/env and does not rewrite the user's command string semantics.
- **[archive_only_evidence]** decisions: Typecheck and lint ran as separate shell commands, not adv_run_test evidence runs — pnpm run typecheck and pnpm exec eslint on touched files both returned exit 0.
- **[archive_only_evidence]** verification: pnpm vitest run --project unit -t "classifies failing pipe stage as failed" src/tools/test.test.ts (1) — RED: pipefail test fails before fix (assertion expected +0 not to be +0)
- **[archive_only_evidence]** verification: pnpm vitest run --project unit -t "pipefail|masking|quoted and semicolon" src/tools/test.test.ts (0) — GREEN: new pipefail/masking/quoted-semantics tests pass after fix
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/test.test.ts (0) — VERIFY: full test.test.ts passes (28 tests) via oc-test targeted

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| OOS1 | out_of_scope | missing |
| OOS2 | out_of_scope | missing |
| DONT1 | avoidance | pass |

## Unresolved Actions

None
