# Executive Summary — fixArchivePrTitles

## Outcome
ADV archive Phase 9 now produces **Conventional-Commit-compatible PR titles** for target projects that require them, and **blocks (instead of silently shipping)** when a title would be non-conforming, non-releasing, or unresolvable.

## Why it matters
Repositories using squash-title-driven release automation (e.g. PokeEdge: Python Semantic Release + a PR-title Conventional Commit validator) derive release semantics from the squash PR title. The previous behavior titled archive PRs `Archive {changeId}`, which failed the target's title validator, auto-merged anyway, and produced **no release tag** — while ADV reported "shipped." This is the silent-non-release failure class: ADV reaches terminal shipped while the target's release automation cannot classify the merge.

## What changed
- **Typed project config**: `archive.pr_title_policy` (format `conventional`|`plain` default, `release_types`, `allowed_types`; arrays `.min(1)`). A target declares its own policy; absent field = plain (no regression).
- **Title construction**: conventional → `{type}: {change.title}`; plain → `Archive {changeId}` (byte-for-byte unchanged); conventional + no resolvable type → `UNRESOLVED_PR_TITLE` signal.
- **Shared pre-merge guard** in `armPullRequestAutoMerge` (the sole merge-arming primitive, used by both the primary handoff and the re-drive path): fetches the **live** PR title and blocks on `PR_TITLE_POLICY_VIOLATION` (non-conforming or non-releasing type), `PR_TITLE_TYPE_UNRESOLVED`, or `PR_TITLE_LOOKUP_FAILED`. Covers reused PRs (re-drive on a prior bad title).
- **Explicit choice**: `adv_change_archive` gained an optional bounded `prTitleType` param for the case where change metadata doesn't yield a type.
- **Spec-law amendment**: modify-delta on `rq-approvedPrAutoMerge01` carves out the title-policy exception (preserving all authority/identity/`--delete-branch`/Tier-B invariants).

## Verification
- **209 tests green** (git-finalize 155 incl. PokeEdge PR #1020 repro, AC2 via re-drive path regression, reuse bad-title coverage, release_types + empty-array enforcement; change.archive-phase9 54; project schema).
- **Independent acceptance review: PASS** (3 review passes; 2 real must-fixes surfaced and fixed — release_types enforcement, empty-array rejection).
- **Review matrix 10/10 rows, 0 failing** (AC1-AC5 pass; C1-C3 + DONT1-DONT2 respected).
- Full `pnpm run check` clean (schemas/typecheck/manifests/test-isolation/lockfile/lint/format).
- `adv_change_validate` 0 errors.

## Risks / follow-ups
- **PokeEdge adoption (out of scope here)**: PokeEdge must add `archive.pr_title_policy` to its project.json for the fix to take effect — a separate cross-project config edit.
- **Worktree drift**: change branch is 6 commits behind `origin/trunk`; rebase before release/archive.
- No CI bypass, force-merge, commit rewriting, or synthetic release commits introduced (C3).

## Supporting evidence
Commits `03803b9e` → `0e6a2351` on `change/fixArchivePrTitles`. Spec delta `dl-archivePrTitlePolicyException` on `advance-workflow`/`rq-approvedPrAutoMerge01`.
