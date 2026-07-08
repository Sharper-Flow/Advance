# Executive Summary

## Outcome

Add Epic retirement is review-approved at the source/test level. The change adds an explicit, audited way to retire completed Epics while keeping active Epic lists focused on work that can still guide next steps.

## Why It Matters

Completed or merged initiatives no longer silently linger in active planning output, and retired Epic history remains available by typed reads. Existing legacy Epic workflows get an explicit audited status-index repair path instead of automatic retirement or consumer-side guessing.

## Verdict

APPROVED

## What Was Built

1. Epic retirement spec law and docs: added executable requirements for audited retirement, active-only lists, retained history, candidate dry-runs, and legacy status-index repair.
2. Retired history projection: retirement persists a compact projection before workflow completion so `adv_epic_show` can read retired Epics by ID.
3. Guarded lifecycle mutation: completed Epics can retire only with audit evidence and expected version; active/future entries block before mutation and name blockers.
4. Structural active listing: default MCP/CLI active lists use `AdvEpicStatus = "active"` plus `ExecutionStatus = "Running"`; completed/merged/retired Epics are not active-list rows.
5. Legacy repair path: `adv_epic_repair_membership` gains an audited `refresh_search_attributes` mode to backfill `AdvEpicStatus` for running legacy Epic workflows without retiring or mutating roadmap entries.
6. CLI source-boundary fix: `adv epic list --json` is visibility-only/worker-free; disk-backed current-child enrichment was removed during review.
7. Public retirement tool: `adv_epic_retire` exposes dry-run, evidence, expected-version, owner-routing, and typed error behavior.

## What Was Verified

- Verdict: APPROVED after review remediation; final reviewer verdict READY.
- Tests: full local suite passed (`bin/oc-test full`, run `tr_mrcc8neq_5dc347fd`). Targeted Epic/index repair tests passed (`tr_mrcbrhfk_6ec055f0`). CLI bin tests passed (`tr_mrcc2k6u_cec4271c`). `pnpm run check` passed (`tr_mrcc3zt4_d745505b`).
- Preview URL: not_applicable — agreement declares `visual_surface: false`; implementation affects ADV MCP/CLI lifecycle tooling, Temporal state, specs, and tests, with no browser-visible surface.
- Contract matrix: 30 rows persisted; all required rows pass/respected, no failed/violated/unknown rows.

## Remaining Concerns

- Source-vs-dist caveat: live OpenCode tool schemas in this current session may not expose newly added/extended tool behavior until `pnpm run build`, `./scripts/deploy-local.sh --fix`, and a fresh OpenCode session. Source-level tests verify behavior; live validation belongs after rebuild/restart.
- No blocking product or data migration remains. Legacy Epic status indexing is explicit/audited via repair mode rather than automatic.

## Supporting Evidence

- Task checkpoints: `314691a`, `5d9cb13`, `aefd0d5`, `972cd45`, `479a049`, `8641cb1`, plus review remediation checkpoints `5212572`, `44eb0c1`, `b66cad0`.
- Review: acceptance reviewer final verdict READY after fixing active-list status indexing, legacy index repair, and CLI disk-read boundary.
- Verification: `tr_mrcc8neq_5dc347fd`, `tr_mrcbrhfk_6ec055f0`, `tr_mrcc2k6u_cec4271c`, `tr_mrcc3zt4_d745505b`.
- Contract proof: `adv_contract_review_matrix_set` persisted 30 rows with `failingRows: 0`.

## Consequence Context

1. delivered value — status: pass; evidence: explicit Epic retirement, retained history, and active-only list semantics implemented and reviewed.
2. enabling-only/follow-up dependency — status: n/a; evidence: no blocking follow-up dependency; legacy index repair is delivered in-scope as an explicit operator action.
3. ops readiness — status: pending; evidence: harden owns release/deploy/production/docs cleanup; source-vs-dist rebuild/restart caveat remains for live tool validation.
4. migration/data impact — status: pass; evidence: no automatic retirement or destructive migration; legacy status index repair is audited and explicit.
5. frontend/preview impact — status: n/a; evidence: `visual_surface: false`, no browser-visible surface.
6. collision/release risk — status: warning; evidence: new search attribute/tool mode requires build/deploy/restart and search-attribute registration in target runtime.
7. open follow-ups — status: n/a; evidence: no blocking review findings remain; non-blocking operational note is live validation after rebuild/restart.
8. next action — status: pass; evidence: user acceptance can proceed to harden; harden should verify build/deploy/restart caveat before archive.