# Executive Summary

## Outcome

ADV tool argument handling now rejects or normalizes placeholder values structurally at the registry preflight boundary before workflow/tool execution. Minimal ad hoc `adv_change_create` remains supported, while origin/linkage/audit/path/command placeholders stay strict and test-covered.

## Verdict

APPROVED / RELEASE READY

## What Was Built

1. Added normalized-args preflight plumbing in `tool-registry.ts`, so tools execute validated/normalized arguments from `tool-arg-preflight.ts`.
2. Added explicit placeholder field policies for `adv_change_create` and representative ADV tools, including content, audit, path, origin/linkage, command, worktree, conformance, agenda, Temporal, contract, and target-aware fields.
3. Preserved strict origin behavior for roadmap/triage/discovery/ad hoc paths and added canonical minimal create diagnostics.
4. Updated `advance-workflow` spec law with placeholder-safe tool argument requirements and scenarios.
5. Added data-driven regression matrix covering minimal valid creation, blank artifacts, invalid origin placeholders, target/source/lineage placeholders, empty `scope_repos`, and representative all-tools traps.
6. Applied acceptance-review remediation for blank `target_path`, `confirmationEvidence`, `source_project`, and `source_change_id` edge cases.
7. Applied release hardening fixes: refreshed AGENTS.md stale guidance, removed an unbacked rq-style traceability comment, added non-create registry preflight coverage, and added non-record raw-args coverage.

## What Was Verified

- Verdict: APPROVED after acceptance review; release hardening READY after all validated harden findings were fixed and re-verified.
- Tests: `pnpm run check` passed; final focused regression/architecture guard tests passed (75 tests); full `pnpm test` passed earlier (227 files / 2995 tests).
- Validation: `adv_change_validate --strict` passed with only non-blocking `NO_DELTAS` warning.
- Merge compatibility: dry-run merge into `origin/trunk` passed.
- Investment: 6 tasks / 1 retry / 195 min active elapsed / tier: auto.
- Contract matrix: 43 required rows passed/respected; 0 failed/violated/unknown.

## Remaining Concerns

Runtime deployment caveat only: source changes require normal `pnpm run build`, `./scripts/deploy-local.sh --fix`, and a fresh OpenCode session before live deployed ADV tool behavior changes.