# Executive Summary

## Outcome

ADV's existing `adv-arch-detection` capability gains a new typed detection pipeline that surfaces silent config↔code↔deps disagreements in any project — plumbed-but-unused env vars, config blocks whose owner package is missing, deferred enforcement (CSP `Report-Only` + TODO), PWA manifests declared without intent, and scaffold directories lacking a declared capability. The approver is deciding whether to ship this additive detection capability (no existing scanner behavior changes).

## Why It Matters

Operators running `/adv-arch-scan` on a project now get evidence-backed findings for inconsistencies that currently go undetected: an `APPLICATIONINSIGHTS_CONNECTION_STRING` plumbed in bicep with no `@azure/monitor-*` SDK imported, a `knip` config block with `knip` missing from devDependencies, a CSP `Report-Only` header sitting next to a TODO about enforcement. Every finding cites a specific file:line cross-reference (P34). High-confidence rules use deterministic regex/file-presence checks (P33); advisory rules are labeled honestly. This fills a real detection gap — `adv-audit` owns spec drift, `adv-slop-scan` owns AI-quality smells, `adv-improve` owns LBP, but none of them currently catch these cross-artifact capability mismatches. Remediation of identified gaps in downstream repos (e.g. pokeedge-web) is tracked separately as Epic `capabilityConsistencyGaps` and is explicitly out of scope here.

## Verdict

READY

## What Was Built

1. **Typed detection tree under `bin/lib/arch-scan/`** — schema.ts (typed contracts for evidence/findings/coverage), registry.ts (5 capability relationships with `as const satisfies` validation), evaluator.ts (~620L generic engine with bounded regex + Phase 3 intent gate), scan.ts (orchestrator), report.ts (text + JSON renderer), bridge.ts (thin repo-validation wrapper).
2. **Reusable debt-marker helper** — `helpers/debt-marker.ts` (~190L) with `scanDebtMarkers` pure function + 3 regex patterns; reusable across multiple deferred-state rules.
3. **5 capability relationships registered** — env-var-injection-vs-sdk-import, config-vs-dependency-presence (knip/eslint/prettier/stylelint/commitlint with per-trigger counterpart scoping), csp-report-only-with-deferred-todo, pwa-manifest-with-intent, scaffold-vs-declared-capability.
4. **CLI entrypoint `bin/arch-scan.ts`** — `node:util parseArgs` with `--format json|text`, `--phase`, `--relationship-id` filters; exit codes 0/1/2; missing-repo degraded sentinel.
5. **4-file markdown sync** — spec.json + command.md + SKILL.md + docs/specs/arch-scan.md updated with new requirement ID `rq-archcap01`; asset test strengthened to structurally enforce 4-of-4 surfaces.
6. **Fixture tree** under `bin/lib/arch-scan/__tests__/fixtures/` covering happy paths, exception signals (App Insights auto-instrumentation, pnpm-workspace hoist), and the mixed-owner-dep regression scenario surfaced during acceptance review.

## What Was Verified

- **Verdict**: READY with 2 non-blocking findings, both remediated in commit `f0f6d7bb` during acceptance review (per-trigger counterpart scoping for multi-mapping relationships; 4-surface rq-archcap01 sync strengthened from 2-surface markdown-only assertion).
- **Tests**: `bun test bin/lib/arch-scan/` 95 pass / 0 fail / 501 expect() calls across 12 files. `vitest src/adv-arch-scan-assets.test.ts` 16 pass / 0 fail. `pnpm run typecheck` clean.
- **Preview URL**: not_applicable — change is static code analysis tooling with no front-end, browser-visible, or visual-output surface.
- **Contract matrix**: 24/24 required rows passed/respected, 0 failing. C1-C10 constraints honored (P34 file:line evidence structural; P33 deterministic detection where it counts; additive only; 4-surface sync enforced; all-or-nothing typed implementation complete). DONT1-DONT10 avoidances respected (no generic checklists; no spec drift; no AI smells; no platform-unsupported universals; manifest/scaffold gated by intent evidence). OOS1-OOS4 out-of-scope items verified not applicable.

## Remaining Concerns

- **Deferred Tier 2 semantics (non-blocking)**: Rule 3 CSP exception escalation and `intent_required` severity softening are documented in registry metadata but not implemented. Both are labeled honestly (medium-confidence, advisory) — no heuristic dressed as deterministic (DONT6 respected). Suitable for fast-follow.
- **Cross-project follow-up (non-blocking)**: This change is a cross-project follow-up from `toolbox`. Pokeedge-web remediation of identified gaps is tracked separately as Epic `capabilityConsistencyGaps` in the pokeedge-web project (OOS1).
- **Sub-agent report submission gaps (process debt, non-blocking)**: Two engineer reports (tk-4d116d975b24, tk-cf5ea29d29ad) failed Temporal submission due to project-context gap in sub-agent sessions; work was verified on disk by the orchestrator at the time and re-verified during acceptance.

## Supporting Evidence

- Worktree HEAD: `f0f6d7bb` on branch `change/addCapabilityConsistency`
- Reviewer report: `addCapabilityConsistency|change:review:acceptance|adv-reviewer|2` (verdict READY)
- Test runs: `bun test bin/lib/arch-scan/` (95 pass), `vitest src/adv-arch-scan-assets.test.ts` (16 pass), `pnpm run typecheck` (clean)
- Contract review matrix: 24 rows, 0 failing (persisted via `adv_contract_review_matrix_set`)
- Commit chain: `3c52cd37` (tk-4d116d975b24) → `cbf0b894` (tk-cf5ea29d29ad) → `34587652` (tk-970cacb8a8e7) → `2facd175` (tk-bf8d780ca812) → `a7340ae7` (tk-c57c6d8fe098) → `f0f6d7bb` (review remediation)

## Consequence Context

1. **Delivered value**: New evidence-backed capability consistency detection under `adv-arch-detection`; 5 typed rules; CLI entrypoint; 4-file doc sync enforced structurally. Source: task implementation summaries + contract matrix.
2. **Enabling-only/follow-up dependency**: None blocking. Pokeedge-web gap remediation is a separate Epic (OOS1). Tier 2 semantics deferred but non-blocking.
3. **Ops readiness**: pending — harden owns release/deploy/production/docs/cleanup readiness. No production deployment, migration, or data impact in this change.
4. **Migration/data impact**: n/a — static analysis tooling, no persistence/schema migration, no data format change.
5. **Frontend/preview impact**: not_applicable — no visual surface; rationale: change is CLI/library only, no UI/browser/visual-output work.
6. **Collision/release risk**: low — additive only to `bin/lib/arch-scan/` and `bin/arch-scan.ts`; existing arch-scan detection behavior unchanged (C3 respected). Strengthened asset test is the only mutation to existing test surface; behavior change is stricter (was 2-of-4, now 4-of-4 surfaces).
7. **Open follow-ups**: Tier 2 deferred semantics (Rule 3 CSP exception escalation; intent_required severity softening) — non-blocking; pokeedge-web remediation under separate Epic (OOS1).
8. **Next action**: acceptance approval proceeds inline to `/adv-harden addCapabilityConsistency`; fixes/re-entry/split/stop follow the standard reply parser.