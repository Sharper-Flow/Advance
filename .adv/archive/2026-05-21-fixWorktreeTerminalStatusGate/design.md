## Design

### Mechanism

Widen the status guard from `=== "archived"` to `∈ {"archived", "closed"}` in both worktree-delete integration paths. Rename the failure-reason literal `change_not_archived` → `change_not_terminal` because the gate is now status-in-terminal-set, not status-equals-archived.

### LBP target sites

| File | Site | Change |
|---|---|---|
| `plugin/src/utils/branch-integration.ts:31` | Union literal in `BranchIntegrationResult.reason` | Rename to `change_not_terminal` |
| `plugin/src/utils/branch-integration.ts:129-135` | Condition A guard + fail() call | Widen accept set + rename reason + reword detail/hint |
| `plugin/src/tools/worktree/index.ts:1460-1466` | `verifyMissingRegistryChangeBranchIntegration` store status check | Widen accept set + rename reason + reword hint |
| `plugin/src/tools/worktree/index.ts:1632` | Static fallback hint at INTEGRATION_REQUIRED fail | Reword to `Branch must be archived or closed, merged, and clean` |
| `plugin/src/utils/branch-integration.test.ts` | 5 assertion sites + 2 test descriptions | Rename literal; add closed-accept case |
| `plugin/src/tools/worktree/index-delete.test.ts` | 3 assertion sites in #38 / #55-follow-up cases | Rename literal; add closed-accept case for drift-recovery path |

### Wording

- Detail: `Change "<id>" has status "<actual>" (expected "archived" or "closed").`
- Hint (primary): `Archive or close the change via /adv-archive or /adv-cancel before deleting its worktree.`
- Hint (drift-recovery): `Archive or close change <id> before deleting its worktree.`
- Hint (static fallback at advWorktreeDelete return): `Branch must be archived or closed, merged, and clean`

### Invariants preserved

- Condition B (merged into default branch) unchanged — closed branches with unmerged commits remain blocked with `branch_not_merged`.
- Condition C (clean worktree) unchanged — closed branches with dirty tree remain blocked with `worktree_dirty`.
- `opts.force` still does NOT bypass integration gate.
- Registry-drift recovery ordering (case c) unchanged; it just accepts a wider terminal set.

### Historical retro doc

`docs/audits/cull-process-retrospective.md:105` quotes the old `change_not_archived` reason verbatim in a retrospective narrative. Left untouched as historical record per proposal.

### Validator note

Mechanical guard widening + literal rename. No new external dependency, no new persistence surface, no new control flow. Sole API surface change is the published failure-reason union literal (a structural breaking change for any consumer matching that literal; verified zero internal callers).

### TDD outline

1. RED: extend `branch-integration.test.ts` with closed-status accept case → fails because guard still requires archived.
2. GREEN: widen guard in `branch-integration.ts`; rename literal.
3. RED: extend `index-delete.test.ts` with closed drift-recovery accept case → fails.
4. GREEN: widen guard in `index.ts:1460`; rename literal.
5. Rename remaining literals in test assertions; rerun `pnpm test` + `pnpm run check`.