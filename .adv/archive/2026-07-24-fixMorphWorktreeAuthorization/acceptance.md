# Acceptance

Reviewed at: 2026-07-24T21:26:00Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | **AC1** — `adv-engineer.md`, `adv-designer.md`, `adv-reviewer.md` no longer contain "ADV authorizes this pair before Morph can use the external root"; they truthfully describe `morph_edit`'s session-root confinement and route ADV-worktree edits to `edit`/`write`, with an immediate `edit`/`write` fallback if `morph_edit` rejects a worktree path. | pass | 3 agent files (adv-engineer.md:108, adv-designer.md:122, adv-reviewer.md:116) rewritten; false 'ADV authorizes this pair' sentence removed; honest edit/write routing + fallback present. Reviewer verdict READY. commit 561d981c. |
| AC2 | acceptance_criterion | **AC2** — `adv-engineer-assets.test.ts` asserts the corrected wording (no false authorization claim; `edit`/`write` routing for worktree edits; `morph_edit` session-root confinement) and is green. | pass | adv-engineer-assets.test.ts truth guard: RED tr_mrzfi5x2 (fail) -> GREEN tr_mrzfizit (pass); full assets suite 26/26 tr_mrzfju64. |
| AC3 | acceptance_criterion | **AC3** — Repo-wide grep for the removed false sentence and "ADV authorizes this pair" returns zero matches outside archived changes. | pass | rg 'ADV authorizes this pair' (excl .adv/archive, node_modules) returns only the test's own not.toContain assertion string at test:204; all directive/source files clean. |
| AC4 | acceptance_criterion | **AC4** — ADV's `authorizeMorphWorktree` + `ADV_MORPH_WORKTREE_CAPABILITY` code is unchanged (Part B and non-regression depend on it). | pass | git diff on plugin/src/utils/morph-worktree-authorization.ts and plugin/src/index.ts (morph-wrapping block 677-695) is EMPTY; ADV validator untouched. |
| AC5 | acceptance_criterion | **AC5 (Part B — separate morph change)** — morph reads `Symbol.for("advance.morph-worktree-capability.v1")` and uses `capability.root` for confinement; `workdir`/`taskId` added to morph's tool args; tests prove a worktree write succeeds with valid `workdir`+`taskId` and is rejected for mismatched/unauthorized roots. | not_applicable | AC5 is Part B (morph-side capability read) - explicitly deferred to a separate cross-project change in ~/dev/opencode-morph-fast-apply per the agreement. Not applicable to Part A. |
| C1 | constraint | **Part A is ADV-only** (`~/dev/advance`); no morph source edits in this change. | respected | Only ~/dev/advance files touched (3 agent md + 1 test); no morph source edits. |
| C2 | constraint | **No runtime behavior change in Part A** — directive + test only (lowest risk, ships first). | respected | Directive + test only; no runtime code changed. |
| C3 | constraint | **Do not remove ADV's capability/validator** — Part B consumes it. | respected | authorizeMorphWorktree + ADV_MORPH_WORKTREE_CAPABILITY unchanged (empty diff). |
| C4 | constraint | **P33 (structural correctness):** the durable fix is structural (morph reads the capability), not prose-only. Part A is the honest interim; Part B is the structural completion. | respected | Part A is the honest interim; Part B is the structural completion. Design validated; symbol-survival confirmed for OpenCode 1.18.4. |
| C5 | constraint | Part B is a cross-project change in `~/dev/opencode-morph-fast-apply` (morph is path-loaded dev source + ADV-enabled; no deploy ceremony). | respected | Part B scoped as a separate cross-project change in ~/dev/opencode-morph-fast-apply (path-loaded dev source, ADV-enabled). |
| DONT1 | avoidance | **DONT1** — Do not claim `morph_edit` authorizes external worktree roots (false today). | respected | No remaining claim that morph_edit authorizes external worktree roots (grep clean). |
| DONT2 | avoidance | **DONT2** (from archived `2026-05-29-fixTrunkFirewallRelPath`) — Do not add a `workdir` parameter to `write`/`edit`/`morph_edit` at the OpenCode SDK level. Note: morph's *own* tool-args schema adding `workdir`/`taskId` in Part B is in-scope and distinct — it is morph's schema, not an SDK change. | respected | No SDK-level workdir param added to write/edit/morph_edit; change is directive + test only. |
| DONT3 | avoidance | **DONT3** — Do not re-implement morph's `execute` inside ADV (fork/safety-logic-drift risk). | respected | No re-implementation of morph execute in ADV. |
| DONT4 | avoidance | **DONT4** — Do not remove `morph_edit` from the sub-agent tool surface (it still serves in-session-repo edits). | respected | morph_edit not removed from any tool surface. |

