# Executive Summary — Add Discovery Completeness Verification

`/adv-discover` now runs an always-on **Completeness Verification** step (Phase 1.8) that prevents discovery from treating a found symptom or single code path as the full problem/full solution. The motivating failure — `addResidentialProxyExternal` missing a parallel `ImageDownloadClient` download surface — is now structurally guarded: discovery must answer whether the full problem was identified and the full solution is scoped, every time.

**What shipped:**
- Three new spec requirements in `adv-discover` (v1.4.0): `rq-disc13` (always-on problem-completeness check), `rq-disc14` (solution-scope check + sole-entry blocking + secondary-surface disposition), `rq-disc15` (durable anchors across spec/command/checklist/docs/tests).
- New Phase 1.8 in `.opencode/command/adv-discover.md`: two always-on checks, scan-depth scaling (narrow changes record a lightweight rationale; broad scans run only for sole-entry/cross-cutting claims), sole-entry blocking that **reuses the existing B-CRITICAL ambiguity halt** (`rq-disc-tax2` → `/adv-clarify`) rather than new machinery, and mandatory secondary-surface disposition before agreement.
- `discover-checklist.md`, `docs/specs/adv-discover.md` mirror, and a one-line `ADV_INSTRUCTIONS.md` pointer kept in sync.
- Asset tests assert the obligation is co-present across spec, command, checklist, and docs mirror (rq-disc15 drift guard).

**Key design decision:** the sole-entry block deliberately reuses the existing Boundaries-CRITICAL → halt → `/adv-clarify` plumbing (KD2). No new halt code, no new Temporal surface (C6). `advance-workflow` was left untouched (C3); only a stale test assertion (1.17.0→1.18.0) was campsite-fixed in the touched test file.

**Design refinement during execution:** `rq-disc15.2` was revised from "protocol step count equality" to "co-presence" — the command (9 steps) and checklist (11 items) use different granularities, so numeric equality would be false; co-presence is the real drift guarantee. Recorded in spec + docs mirror.

**Verified:** RED→GREEN TDD per implementation task; 67/67 asset tests pass; `pnpm run check` exit 0 (schemas/typecheck/lint/format); independent reviewer verdict READY (one in-scope AC5 gap remediated); contract review matrix 27/27 pass, 0 failing. No scope drift.
