# Archive: Add temporal repair specialist

**Change ID:** addTemporalRepairSpecialist
**Archived:** 2026-06-19T02:17:23.273Z
**Created:** 2026-06-18T18:34:55.025Z

## Tasks Completed

- ✅ Add `adv-temporal-repair` agent asset and asset-test anchors
  > Added `.opencode/agents/adv-temporal-repair.md` with classifier-first repair guidance, hard ADV state access policy, minimal read/classifier/report tool allowlist, and blocked mutation/nested-delegation tools. Added `plugin/src/adv-temporal-repair-assets.test.ts` and enrolled the new agent in `subagent-reports-spec-assets.test.ts` state-access coverage. Verified RED missing-agent failure, then GREEN targeted vitest pass (17 tests).
- ✅ Wire primary ADV routing and specialist packet contract
  > Updated `.opencode/agents/adv.md` worker routing and subagent table to include `adv-temporal-repair` for Temporal/session-pointer/artifact-phantom triage with packet anchors. Updated `ADV_INSTRUCTIONS.md` roster similarly. Extended deploy-local prompt safety markers and intentionally reratcheted the canonical prompt ceiling to 368 with comment. Verified RED marker absence, then GREEN `pnpm exec vitest run src/deploy-local.test.ts` (66 tests).
- ✅ Align `adv_temporal_diagnose` envelope with implementation and specialist needs
  > Narrowed `adv_temporal_diagnose` description to actual response dimensions and added `serverServiceable` to output from the already-computed queue poller probe. Added `temporal-ops.test.ts` coverage that the description no longer promises search-attribute/stale-queue/last-error fields and that output exposes the thin classifier envelope. Verified RED/ GREEN targeted temporal ops tests.
- ✅ Document phantom-pointer/artifact recovery decision tree
  > Added `docs/temporal-recovery.md` section for ADV phantom pointer / phantom artifact triage. The decision tree requires `adv_change_show` + `adv_gate_status`, treats `readable:false`/missing sidecars as artifact-readability mismatch, limits `adv_change_forget` to current-session pointer cleanup, and distinguishes worker restart from OpenCode restart. Added docs asset test anchors. Verified RED/GREEN `adv-stability-docs-assets.test.ts`.
- ✅ Evaluate bounded artifact-only `adv_change_show` support
  > Added optional `include.artifactOnly` to `adv_change_show`. When set with artifact include flags, the tool returns bounded artifact readback (`id`, `title`, `status`, normalized `artifacts`, requested `_artifact` content, `_artifactOnly:true`) without full tasks/clarify context and without exposing unreadable phantom paths. Added regression test for Temporal document content with `readable:false`. Verified RED/GREEN targeted change test.
- ✅ Run cross-cutting verification and release-readiness checks for temporal repair specialist
  > Ran targeted changed-surface tests (6 files, 161 tests), schemas:check, and repo smoke check. First smoke run failed Prettier format on three files; formatted them and reran. Final targeted suite passed and `./bin/oc-test smoke` passed, covering schemas:check, typecheck, test isolation, lockfile policy, lint, format:check, and smoke tests.

## Specs Modified


## Wisdom Accumulated

- **[pattern]** When adding a new read-only ADV subagent that should reuse existing report transport, model asset tests after `adv-tron`/state-access assets rather than enum-backed `adv-designer`; add the new agent to `subagent-reports-spec-assets.test.ts` `AGENT_PATHS` to inherit the ADV state-access policy battery.
- **[gotcha]** In Advance, `pnpm test -- <files>` can run broader tests than intended through the package script; for precise ADV `adv_run_test` TDD evidence on selected Vitest files, use `pnpm exec vitest run <files>`. Keep `./bin/oc-test smoke/full` for broader gated verification.
