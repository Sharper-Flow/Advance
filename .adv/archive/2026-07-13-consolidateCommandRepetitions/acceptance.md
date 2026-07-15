# Acceptance

Reviewed at: 2026-07-13T19:19:14.737Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | **AC1:** `adv-review.md` has one full 12-dimension framework definition; later usage is a local reference that retains required scanner behavior. | pass | Focused asset suite: adv-review-assets.test.ts 13/13 pass; canonical matrix/reference assertions cover one full matrix, OWASP scope, and explicit-justification reference. |
| AC2 | acceptance_criterion | **AC2:** Target-resolution, skill-wrapper, worktree-context, auto-continue, and sub-agent-context prose are compacted only where command-specific behavior and frozen contract tokens remain explicit. | pass | Focused 129-test command asset suite passes; scoped diff shows only the review-matrix dedup and its direct asset test, with no unsafe wrapper rewrite. |
| AC3 | acceptance_criterion | **AC3:** `adv-apply` rebase wording and `adv-archive` T28 labels change only when source/history confirms they are stale; otherwise they remain unchanged. | pass | Source audit retained live preExecutionRebase and T28 markers; focused command assets pass and branch diff does not touch adv-apply.md or adv-archive.md. |
| AC4 | acceptance_criterion | **AC4:** Gate Handoff, approval, briefing-packet, embedded-methodology, and frontend-fallback anchors remain intact. | pass | Focused command-asset suites pass; reviewer confirmed Gate Handoff, approval, briefing-packet, embedded-methodology, and scanner contracts remain intact. |
| AC5 | acceptance_criterion | **AC5:** Targeted command asset tests and `pnpm run check` exit 0. | pass | Focused command asset suite: 129 tests pass. plugin pnpm run check exits 0. git diff --check exits 0. |
| SC1 | success_criterion | **SC1:** Current command bloat is reduced without cross-command include architecture. | pass | Independent reviewer READY: duplicate 12-row Phase 1 matrix removed; canonical same-file source retained without shared includes. |
| SC2 | success_criterion | **SC2:** Each changed command remains independently readable and behaviorally complete. | pass | Independent reviewer READY: Phase 1 has a precise same-file reference preserving all-12, OWASP, and explicit-justification behavior. |
| C1 | constraint | No runtime, schema, spec, tool, or agent behavior changes. | respected | Base-to-HEAD diff contains only .opencode/command/adv-review.md and plugin/src/adv-review-assets.test.ts; no runtime/schema/spec/tool/agent files changed. |
| C2 | constraint | Token budgets remain advisory. | respected | No token budget enforcement added; existing advisory wording and behavior retained. |
| C3 | constraint | No cross-command shared-template/include mechanism. | respected | Diff adds no shared template, loader, include mechanism, or cross-command abstraction. |
| DONT1 | avoidance | Do not reword frozen contract tokens merely to reduce prose. | respected | Reviewer found frozen behavior preserved; implementation deletes duplicate rows and uses a local reference rather than rewording protected tokens. |
| DONT2 | avoidance | Do not delete phase-local worker schemas or test-pinned fallback content. | respected | Reviewer and focused assets confirm no phase-local worker schema, fallback content, or briefing-packet contract was deleted. |
| OOS1 | out_of_scope | Hard token-budget enforcement. | not_applicable | No hard token-budget enforcement was requested or changed. |
| OOS2 | out_of_scope | Shared command loader/include architecture. | not_applicable | No shared command loader/include architecture was introduced. |
| OOS3 | out_of_scope | Recovery of stale `updateAgentGuide` work. | not_applicable | No stale updateAgentGuide recovery work is included. |

