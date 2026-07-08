# Contract Traceability

**Change ID:** stabilizeCliSourceBoundary
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-08T00:34:45.728Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Reviewer READY; implementation moved scattered Temporal imports behind internal boundary with no CLI behavior change; Bun CLI tests passed: tr_mrbc4rpt_3de2d6b4 and reviewer `bun test bin/` 197 pass. |
| SC2 | success_criterion | pass | review | `bin/lib/cli-source-boundary.test.ts` enforces bin-side allowlist and transitive forbidden-import graph; RED tr_mrbc1rz0_c171bd42 failed on old deep imports; GREEN tr_mrbc333z_bf6c8c2b passed. |
| SC3 | success_criterion | pass | review | `rq-cliSourceBoundary01` added to `.adv/specs/advance-meta/spec.json` and mirrored in `docs/specs/advance-meta.md`; JSON parse tr_mrbbzhit_21f3140b and schemas check tr_mrbc4odu_b26bbc70 passed. |
| AC1 | acceptance_criterion | pass | test | Boundary test verifies root `bin/adv`/`bin/lib` plugin-source imports are only `shared/cli-projection` and `cli/temporal-boundary`; final reviewer boundary test passed with dynamic import coverage. |
| AC2 | acceptance_criterion | pass | test | `advance-meta` now contains `rq-cliSourceBoundary01` with four scenarios governing CLI source-boundary behavior; docs mirror updated to v1.21.0. |
| AC3 | acceptance_criterion | pass | test | Boundary test rejects storage/tools/tool-registry/plugin-init/index paths in the Temporal boundary transitive graph; reviewer added dynamic import detection to prevent bypass. |
| AC4 | acceptance_criterion | pass | test | Bun CLI tests passed: `bun test ... bin/adv.test.ts bin/dashboard-cli.test.ts` tr_mrbc4rpt_3de2d6b4; reviewer `bun test bin/` passed 197 tests. |
| AC5 | acceptance_criterion | pass | test | `live-status.ts` and `epic-list.ts` import live Temporal primitives through `plugin/src/cli/temporal-boundary`; no disk active fallback added. Existing status/bridge tests passed tr_mrbc4qx7_eded5d85. |
| AC6 | acceptance_criterion | pass | test | `shared/cli-projection` remains Tier A; `bin/lib/types.ts` and `changes.ts` stay on projection imports. `cli-projection-import-safety.test.ts` passed in tr_mrbc4rpt_3de2d6b4. |
| AC7 | acceptance_criterion | pass | test | Design chose named internal CLI-safe Temporal adapter `plugin/src/cli/temporal-boundary.ts`; validator and reviewer both accepted this shape. |
| C1 | constraint | respected | static_check | No gate/state/tool-boundary semantics changed; spec law added and tests enforce P33 structural boundary. Reviewer READY, no blockers. |
| C2 | constraint | respected | static_check | No active-state disk fallback introduced; active status/Epic imports remain Temporal boundary based. Existing fail-closed status tests passed. |
| C3 | constraint | respected | static_check | No OCA-specific files, API, or compatibility goals added; touched files are CLI boundary/spec/test only. |
| C4 | constraint | respected | static_check | No broad CLI redesign or v2 rewrite; implementation limited to spec, boundary module, import updates, and tests. |
| C5 | constraint | respected | static_check | Source tests validated behavior in-session; live deployed ADV tool behavior caveat remains documented by repo context, no deployed runtime validation claimed. |
| C6 | constraint | respected | static_check | Root Bun tests run and passed; plugin tests run via Node/Vitest targeted path. Runtime split preserved. |
| DONT1 | avoidance | respected | review | Correctness enforced by deterministic import tests and spec requirement, not prose-only guidance. |
| DONT2 | avoidance | respected | review | Temporal imports were consolidated through Tier B boundary, not blanket-banned; live behavior preserved. |
| DONT3 | avoidance | respected | review | No unused-export sweep or unrelated cleanup performed; touched files are scoped to agreed boundary. |
| DONT4 | avoidance | respected | review | No ADV state, gate, or Temporal workflow behavior changed; Temporal client/list helper imports only re-exported through boundary. |
| DONT5 | avoidance | respected | review | No adapter-surface optimization or Temporal hot-path redesign included; changes are minimal boundary hardening. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Full Advance v2 rewrite not performed; discovery research explicitly routed it to separate Epic strategy, not this change. |
| OOS2 | out_of_scope | not_applicable | not_applicable | OCA-specific compatibility/API work not performed. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Broad CLI UX redesign not performed; user-visible behavior preserved. |
| OOS4 | out_of_scope | not_applicable | not_applicable | Broad adapter refactor not performed; only minimal CLI Temporal boundary added. |
| OOS5 | out_of_scope | not_applicable | not_applicable | Deep Temporal workflow hot-path redesign not performed. |
| OOS6 | out_of_scope | not_applicable | not_applicable | `scripts/opencode-session-doctor.ts` boundary untouched; change targets root `bin/adv` only. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-5f09b1a5e58c | SC3, AC2 | AC2 | C1, C4, DONT1, OOS1, OOS2, OOS3, OOS4, OOS5, OOS6 |  |
| tk-209511755edf | SC1, SC2, AC1, AC3, AC5, AC6, AC7 | AC1, AC3, AC5, AC6, AC7 | C1, C2, C3, C4, C6, DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4, OOS5, OOS6 |  |
| tk-fa18f6c0f507 |  | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, AC6, AC7 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4, OOS5, OOS6 |  |
