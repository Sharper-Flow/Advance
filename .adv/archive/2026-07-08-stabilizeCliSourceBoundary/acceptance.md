# Acceptance

Reviewed at: 2026-07-08T00:34:45.728Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | `bin/adv` keeps stable behavior while its plugin-source boundary becomes explicit and enforced. | pass | Reviewer READY; implementation moved scattered Temporal imports behind internal boundary with no CLI behavior change; Bun CLI tests passed: tr_mrbc4rpt_3de2d6b4 and reviewer `bun test bin/` 197 pass. |
| SC2 | success_criterion | Future `bin/` imports into unsafe plugin internals fail structurally before release. | pass | `bin/lib/cli-source-boundary.test.ts` enforces bin-side allowlist and transitive forbidden-import graph; RED tr_mrbc1rz0_c171bd42 failed on old deep imports; GREEN tr_mrbc333z_bf6c8c2b passed. |
| SC3 | success_criterion | CLI source-boundary law is captured in `advance-meta` and backed by tests. | pass | `rq-cliSourceBoundary01` added to `.adv/specs/advance-meta/spec.json` and mirrored in `docs/specs/advance-meta.md`; JSON parse tr_mrbbzhit_21f3140b and schemas check tr_mrbc4odu_b26bbc70 passed. |
| AC1 | acceptance_criterion | Root `bin/adv` / `bin/lib/*` imports into `plugin/src` are limited to documented CLI-safe surfaces. | pass | Boundary test verifies root `bin/adv`/`bin/lib` plugin-source imports are only `shared/cli-projection` and `cli/temporal-boundary`; final reviewer boundary test passed with dynamic import coverage. |
| AC2 | acceptance_criterion | `advance-meta` contains a requirement governing the CLI source-boundary rule. | pass | `advance-meta` now contains `rq-cliSourceBoundary01` with four scenarios governing CLI source-boundary behavior; docs mirror updated to v1.21.0. |
| AC3 | acceptance_criterion | Tests fail on unapproved `bin/` imports into broad plugin internals such as `storage`, `tools`, `tool-registry`, or plugin init. | pass | Boundary test rejects storage/tools/tool-registry/plugin-init/index paths in the Temporal boundary transitive graph; reviewer added dynamic import detection to prevent bypass. |
| AC4 | acceptance_criterion | Existing CLI behavior remains compatible for `status`, `roadmap`, `slop-scan`, `epic list --json`, and dashboard commands. | pass | Bun CLI tests passed: `bun test ... bin/adv.test.ts bin/dashboard-cli.test.ts` tr_mrbc4rpt_3de2d6b4; reviewer `bun test bin/` passed 197 tests. |
| AC5 | acceptance_criterion | Live Temporal-backed status/epic behavior is preserved; no stale disk active-state fallback is introduced. | pass | `live-status.ts` and `epic-list.ts` import live Temporal primitives through `plugin/src/cli/temporal-boundary`; no disk active fallback added. Existing status/bridge tests passed tr_mrbc4qx7_eded5d85. |
| AC6 | acceptance_criterion | Existing `cli-projection` zero-import/parity safeguards remain intact. | pass | `shared/cli-projection` remains Tier A; `bin/lib/types.ts` and `changes.ts` stay on projection imports. `cli-projection-import-safety.test.ts` passed in tr_mrbc4rpt_3de2d6b4. |
| AC7 | acceptance_criterion | Design decides whether to keep explicit allowlist paths or consolidate Temporal imports behind a named CLI-safe adapter. | pass | Design chose named internal CLI-safe Temporal adapter `plugin/src/cli/temporal-boundary.ts`; validator and reviewer both accepted this shape. |
| C1 | constraint | Do not weaken spec-law, Temporal replay safety, typed tool boundaries, or ADV state source-of-truth rules. | respected | No gate/state/tool-boundary semantics changed; spec law added and tests enforce P33 structural boundary. Reviewer READY, no blockers. |
| C2 | constraint | Do not make root CLI active-state reads use unsupported external-state files when a live Temporal path is required. | respected | No active-state disk fallback introduced; active status/Epic imports remain Temporal boundary based. Existing fail-closed status tests passed. |
| C3 | constraint | Do not introduce OCA-specific API goals. | respected | No OCA-specific files, API, or compatibility goals added; touched files are CLI boundary/spec/test only. |
| C4 | constraint | Do not broaden into a full CLI redesign or full Advance v2 rewrite. | respected | No broad CLI redesign or v2 rewrite; implementation limited to spec, boundary module, import updates, and tests. |
| C5 | constraint | Source tests may validate code in-session; live deployed ADV tool behavior requires rebuild/deploy/restart. | respected | Source tests validated behavior in-session; live deployed ADV tool behavior caveat remains documented by repo context, no deployed runtime validation claimed. |
| C6 | constraint | Runtime remains Bun for `bin/adv`; package scripts and most tests still run from `plugin/`. | respected | Root Bun tests run and passed; plugin tests run via Node/Vitest targeted path. Runtime split preserved. |
| DONT1 | avoidance | Do not replace source-boundary correctness with heuristic/prose-only guidance. | respected | Correctness enforced by deterministic import tests and spec requirement, not prose-only guidance. |
| DONT2 | avoidance | Do not blanket-ban all Temporal CLI imports if that would remove live status/epic behavior. | respected | Temporal imports were consolidated through Tier B boundary, not blanket-banned; live behavior preserved. |
| DONT3 | avoidance | Do not add unrelated unused-export sweeps. | respected | No unused-export sweep or unrelated cleanup performed; touched files are scoped to agreed boundary. |
| DONT4 | avoidance | Do not alter ADV state semantics, gate semantics, or Temporal workflow behavior beyond preserving CLI behavior. | respected | No ADV state, gate, or Temporal workflow behavior changed; Temporal client/list helper imports only re-exported through boundary. |
| DONT5 | avoidance | Do not absorb adapter-surface optimization or Temporal hot-path deep scan into this change. | respected | No adapter-surface optimization or Temporal hot-path redesign included; changes are minimal boundary hardening. |
| OOS1 | out_of_scope | Full Advance v2 rewrite. | not_applicable | Full Advance v2 rewrite not performed; discovery research explicitly routed it to separate Epic strategy, not this change. |
| OOS2 | out_of_scope | OCA-specific compatibility or API work. | not_applicable | OCA-specific compatibility/API work not performed. |
| OOS3 | out_of_scope | Broad CLI UX redesign. | not_applicable | Broad CLI UX redesign not performed; user-visible behavior preserved. |
| OOS4 | out_of_scope | Broad adapter-surface refactor beyond a minimal CLI-safe boundary if design chooses one. | not_applicable | Broad adapter refactor not performed; only minimal CLI Temporal boundary added. |
| OOS5 | out_of_scope | Deep Temporal workflow hot-path redesign. | not_applicable | Deep Temporal workflow hot-path redesign not performed. |
| OOS6 | out_of_scope | `scripts/opencode-session-doctor.ts` import boundary; this change targets root `bin/adv` CLI. | not_applicable | `scripts/opencode-session-doctor.ts` boundary untouched; change targets root `bin/adv` only. |

