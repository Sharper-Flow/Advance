# Acceptance

Reviewed at: 2026-05-21T06:57:30.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | Release gate rejects direct-mode completion without default-branch reachability. | pass | Implemented in gate.ts; covered by gate.release-enforcement tests. |
| AC2 | acceptance_criterion | PR mode rejects release completion without pushed-branch handoff evidence. | pass | Implemented in gate.ts via verifyChangeBranchPushed; covered by PR mode gate tests. |
| AC3 | acceptance_criterion | Archive validates worktree path before writing in-repo archive artifacts. | pass | Implemented in change.ts pre-archive validation; targeted re-review approved. |
| AC4 | acceptance_criterion | Archive finalization runs before archived-state transition and issue closure. | pass | Implemented in change.ts ordering; targeted re-review approved. |
| AC5 | acceptance_criterion | Archive artifacts are committed on the change branch before merge/push finalization. | pass | Implemented by commitArchiveArtifacts; helper tests pass. |
| AC6 | acceptance_criterion | Dirty main checkout and merge failures hard-block with remediation; no stash or branch switching. | pass | Implemented in git-finalize helpers; tests pass. |
| AC7 | acceptance_criterion | Docs/specs reflect runtime release finalization contract. | pass | Updated adv-archive command, ADV instructions, and specs; review approved. |
| AC8 | acceptance_criterion | Full check/test/build passes. | pass | pnpm run check, pnpm test, and pnpm run build passed. |
| C1 | constraint | No automatic stash, branch switching, conflict auto-resolution, or force push. | respected | git-finalize uses argv git operations without checkout/switch/stash/force push; tests cover no-stash behavior. |

