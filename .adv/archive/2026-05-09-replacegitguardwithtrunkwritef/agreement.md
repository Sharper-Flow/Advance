# Agreement

## Objectives

1. Replace the 6-category git-classifier guard (`plugin/src/tools/git-guard.ts`, 717 lines + 879-line test) with a small file-write firewall enforcing the single P32 invariant — "agents do not edit files directly on trunk on the default branch".
2. Eliminate the carve-out feedback-loop bug class evidenced by the three rapid-succession archived guard changes today (`programmaticgitmutationguard` → `fixGitMutationGuardDeadlock` → `allowFastForwardPushDefault` in 5 hours).
3. Retire spec `advance-meta/rq-gm01` (Bash Git Mutation Interception) and mint `advance-meta/rq-twf01` (Trunk Write Firewall) with 7 scenarios.
4. Bundle 3 LBP worktree-ergonomics features into this change: worktree-include for gitignored env files, setup-worktree post-create hook, and port-isolation documentation.
5. Close GitHub issue #101 as fixed-by-this-change with archive-bundle link.

## Acceptance Criteria

**Core firewall:**
1. `plugin/src/tools/git-guard.ts` (717 lines) and `plugin/src/tools/git-guard.test.ts` (879 lines) deleted; zero remaining references in `plugin/src/`.
2. New `plugin/src/tools/trunk-write-firewall.ts` blocks `write`/`edit`/`morph_edit` and destructive `bash` patterns (`>`/`>>`/`tee`/`sed -i`/`cp`/`mv`/`rm`) when target path is inside trunk checkout AND HEAD is the default branch.
3. Firewall allows the same operations inside any active ADV worktree path.
4. Firewall allows trunk file edits when ANY of `.git/MERGE_HEAD`, `.git/REBASE_HEAD`, `.git/rebase-merge/`, `.git/rebase-apply/`, `.git/CHERRY_PICK_HEAD`, `.git/REVERT_HEAD` exists (legitimate in-progress recovery flow).
5. Zero ADV-imposed friction on any `git` command (commit, merge, pull, push, reset, plumbing) — verified by removing all git-classifier tests and not replacing them.
6. Firewall short-circuits ALLOW for paths outside any git checkout.

**Spec lifecycle:**
7. Spec `advance-meta/rq-gm01` retired; new requirement `advance-meta/rq-twf01` minted with 7 scenarios covering the new firewall (block / allow-in-worktree / 4-state in-progress escape / git-allowed / outside-repo / residual-risk).

**LBP worktree-ergonomics bundle:**
8. **Worktree-include** — `adv_worktree_create` copies a configurable list of gitignored files (default: `.env`, `.env.local`, `.env.*.local`) from trunk checkout into the new worktree. Configuration source: `project.json` field (e.g. `worktree.include_paths`) with safe default. Documented in `docs/worktree-guide.md`.
9. **Setup-worktree hook** — `adv_worktree_create` runs an optional post-create command (e.g. `npm ci`, custom script) configured via `project.json` (e.g. `worktree.setup_command`). Failure surfaces as a worktree creation warning, not a hard block. Documented.
10. **Port/resource-isolation guidance** — documentation-only deliverable in `docs/worktree-guide.md` covering per-worktree port offset patterns and DB instance separation. No code changes (no clean ADV injection point without runtime stack knowledge).

**Issue closure + verification:**
11. GitHub issue #101 closed with disposition "fixed by `replacegitguardwithtrunkwritef`" and link to archive bundle.
12. Full ADV gate-cycle integration test passes: discover → design → prep → apply → archive on a fresh dummy repo, including worktree-include + setup-hook flows.
13. `pnpm test` green (1356+ tests, plus new firewall + worktree-feature tests).
14. `pnpm run check` green (typecheck + lint + format).

## Constraints

- **Hook surface:** New firewall plugs into the existing `tool.execute.before` dispatch table by tool name (currently special-cases `bash`/`task`/`question`); no new hook contract needed.
- **DI for tests:** Firewall must follow the existing `GuardDeps` pattern (inject `getDefaultBranch`, `getWorktreePaths`, `getProjectRoot`) so vitest runs on Node without spawning git.
- **Determinism:** All classification pure given inputs — no time-based or random checks (P33).
- **Backwards compat:** Existing tests in `integration.test.ts` and `__tests__/compaction.test.ts` use `tool.execute.before` for `task`/`question`/`bash` flows — those branches remain untouched.
- **Schema migration:** AC8/AC9 introduce new `project.json` fields — additive, optional, backwards-compatible defaults.
- **OpenCode session reload:** Source-vs-dist gotcha (per `AGENTS.md`) — live tool-call validation deferred to fresh session after `pnpm run build`; in-session validation via vitest.

## Avoidances

- **No replacement enforcement for `git push --force` to default branch.** Remote branch protection covers most cases. Address only if user requests in a follow-up.
- **No fix for OpenCode#1 snapshot race.** Out of ADV's layer; tracked at sharper-flow/Opencode-Advance#1.
- **No detection of indirect destructive writes** via shell-variable indirection or external scripts. Documented as accepted residual risk (same posture as current guard's shell-alias gap).
- **No bundled implementation of port-isolation as code.** Documentation-only per AC10 — no clean ADV injection point without runtime stack knowledge.
- **No reflection, conformance, or non-worktree-subsystem feature work.**

## Decisions

### User Decisions

- **Q1 — In-progress escape hatch scope:** All four (`MERGE_HEAD` / `REBASE_HEAD` / `CHERRY_PICK_HEAD` / `REVERT_HEAD`) — comprehensive coverage of every documented in-progress git state. Reuses pattern from `plugin/src/tools/checkpoint.ts:115-148` and `plugin/src/tools/archive-helpers/skip-duplicate.ts:43`.
- **Q2 — LBP gap bundling:** Ship all 3 implementable LBP gaps (worktree-include, setup-worktree-hook, port-isolation guidance) in this change. Maximizes user value per cycle; accepts longer review surface as a deliberate trade.
- **Q5 — Issue #101 closure:** Close as fixed-by-this-change. The friction reported (post-merge sync of trunk, plumbing recovery) IS resolved here — git commands no longer touch any guard. "Fixed" is honest; "wontfix" would be misleading.

### Agent Decisions (LBP)

- **Q3 — Destructive-bash pattern catalog:** Minimal scope `(a)` — redirects (`>`/`>>`), `tee`, `sed -i`, `cp`/`mv`/`rm`. Matches current guard's accepted-residual-risk posture; smaller surface; comprehensive enumeration is YAGNI without observed friction. Heredoc detection deferred (instruction-governed).
- **Q4 — Spec lifecycle:** Retire `rq-gm01` and mint `rq-twf01` (rather than amend in-place). Different enforcement layer warrants different requirement; archive trail clearer; matches convention from prior spec-replacement changes (e.g. `addStructuralChangeContract`).

## Deferred Questions

None — all open questions resolved at agreement.

## Sign-Off

User replied `approve` to AC checkpoint at Phase 4.5.1; all 14 acceptance criteria approved as written.
