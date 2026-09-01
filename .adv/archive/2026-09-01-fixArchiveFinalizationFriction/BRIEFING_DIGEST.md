# Archive Briefing Digest

**Change ID:** fixArchiveFinalizationFriction
**Title:** Fix archive finalization friction
**Status:** archived
**Generated:** 2026-09-01T23:41:09.779Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY

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

Showing 12 of 12 durable facts.

- **[report_follow_up]** follow_ups: The worktree contains pre-existing changes in plugin/src/tools/worktree/index-delete.test.ts from the sibling task. I did not modify that file.
- **[report_follow_up]** follow_ups: No specs:mirrors script or root package manifest exists in this worktree. The docs and .adv spec mirror were updated directly. docs/specs/.mirror-lock.json is not tracked or present.
- **[archive_only_evidence]** decisions: Skip auto-merge only for strict MERGED summaries. — UNKNOWN and other states must continue through title validation and arming.
- **[archive_only_evidence]** decisions: Validate a merged PR head against supplied change tips before skipping arming. — This prevents a merged PR for unrelated content from producing a shipped result.
- **[archive_only_evidence]** decisions: Parse the live title type inside the armer. — A reused PR's live title, not caller metadata, controls allowed and release policy.
- **[archive_only_evidence]** decisions: Keep the creation-path unresolved-title blocker. — New conventional PRs still require a caller type, while reused PRs use their live title.
- **[archive_only_evidence]** verification: pnpm vitest run src/tools/archive-helpers/git-finalize.test.ts --typecheck.enabled=false (1) — RED failed before implementation, exposing merged-PR skip, head mismatch, and parsed-title behavior gaps.
- **[archive_only_evidence]** verification: pnpm vitest run src/tools/archive-helpers/git-finalize.test.ts --typecheck.enabled=false (0) — GREEN passed 163 tests after implementation.
- **[archive_only_evidence]** verification: pnpm vitest run src/tools/archive-helpers/git-finalize.test.ts src/tools/change/archive-gate.test.ts src/tools/change.archive-phase9.test.ts --typecheck.enabled=false (0) — Final targeted suite passed 185 tests in 3 files.
- **[archive_only_evidence]** verification: pnpm vitest run src/handoff-footer-drift.test.ts src/__tests__/spec-id-shape-invariant.test.ts src/__tests__/no-retired-tool-spec-refs.test.ts src/deploy-local.test.ts --typecheck.enabled=false (0) — Spec artifact and mirror checks passed 98 tests in 4 files.
- **[unresolved_action]** required_main_agent_actions: Use this READY report as acceptance-review evidence. Do not revisit the cleanup scanner, Phase 9 persistence schema, branch mutation behavior, or auto-merge authority law.
- **[archive_only_evidence]** verification: tests_run=pnpm vitest run src/tools/worktree/index-delete.test.ts src/tools/archive-helpers/git-finalize.test.ts --typecheck.enabled=false, pnpm vitest run src/handoff-footer-drift.test.ts src/__tests__/spec-id-shape-invariant.test.ts src/__tests__/no-retired-tool-spec-refs.test.ts src/deploy-local.test.ts --typecheck.enabled=false, pnpm typecheck, git diff --check origin/trunk...HEAD results=pass — The focused suites passed 233 tests. The specification artifact suites passed 98 tests. TypeScript compilation and diff checks passed. The branch is clean and changes only the six expected files.

## Contract / AC Coverage

No contract items.

## Unresolved Actions

- Use this READY report as acceptance-review evidence. Do not revisit the cleanup scanner, Phase 9 persistence schema, branch mutation behavior, or auto-merge authority law.
