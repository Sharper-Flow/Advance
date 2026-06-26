# Executive Summary: Update Epic Scope

Implemented structural Epic scope and merge support.

## What changed

- Epics now render a derived `scope_label` from typed scope breadth:
  - no scope: `legacy-unscoped`
  - one repo/project: `local`
  - multiple repos/projects: `product-spanning`
- Added audited `adv_epic_update_scope` with optimistic concurrency, dry-run preview, stale-version protection, and linked-entry removal guards.
- Added active duplicate Epic merge support through `adv_epic_merge`:
  - dry-run merge plan
  - duplicate/conflict reporting
  - explicit conflict disposition support
  - cross-project target confirmation checks
  - child `epic_membership` projection movement
  - source `merged_into` pointer after selected entries resolve
- Merged source Epics now have structural `merged` status, remain queryable, and produce no active next-work recommendations.
- Updated `/adv-epic` guidance to prefer scope update or merge before creating duplicate Epics.

## Verification

- Acceptance reviewer rerun verdict: READY.
- Contract review matrix: 34/34 pass/respected.
- Targeted Epic tests passed after remediation:
  - 176-test Epic suite
  - 140-test post-remediation Epic suite
  - 83-test reviewer targeted suite
- `pnpm run typecheck` passed.
- `pnpm run schemas:check` passed.
- Touched-file Prettier checks passed.

## Known unrelated issue

Repo-wide smoke reaches `format:check` and fails on pre-existing unrelated formatting drift in:

- `src/cli-bridge-contract.test.ts`
- `src/tools/change.ts`

Those files are outside this change’s touched scope.