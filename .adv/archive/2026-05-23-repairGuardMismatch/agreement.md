# Agreement

## Objectives

1. Make gate isolation less brittle for agents by allowing metadata-only discovery and design completion from main checkout.
2. Preserve strict worktree isolation for planning, execution, acceptance, release, and task execution/code/git-mutating paths.
3. Make remediation actionable by referencing only supported tool/session-routing surfaces.
4. Make worktree triage and registry-dependent validators trustworthy by replacing retired/stubbed registry reads with authoritative Temporal worktree records.
5. Encode the behavior in specs and regression tests.

## Acceptance Criteria

1. Discovery gate completion from main checkout succeeds when it only records discovery state and does not mutate repo/git.
2. Design gate metadata completion from main checkout succeeds when it does not mutate repo/git.
3. Planning, execution, acceptance, release, and task execution mutations still block from main checkout under active isolation/auto-managed changes.
4. Worktree isolation remediation for `adv_gate_complete` contains no unsupported `workdir` argument and points to supported session/worktree routing.
5. `adv_worktree_triage` emits no `adv_worktree_create --adopt` recommendation.
6. Triage, file-overlap, branch-integration, and merge-order registry reads use authoritative Temporal per-change worktree records or explicit unavailable/warning results, not retired/stubbed empty paths.
7. Regression tests cover the classification table, remediation text, triage recommendation, and same-pattern registry consumers.

## Constraints

- Do not add bypass flags.
- Do not weaken code/git-mutating isolation.
- Do not restore sidecar SQLite/JSONL as authoritative registry state.
- Keep solution structurally enforced through spec, types/adapters, and tests.

## Avoidances

- No `--ignore-isolation`.
- No invalid remediation flags/arguments.
- No false orphan reports from unavailable registry source.
- No broad cleanup deletion-policy rewrite.

## Decisions

### User Decisions

- Design gate posture: allow metadata-only design gate completion from main checkout; actual file/code edits remain governed by normal worktree/tool routing.
- Acceptance posture: keep acceptance guarded for v1 simplicity because review/harden can run tests and remediate code.
- Related registry consumers: include file-overlap, branch-integration, and merge-order alongside triage.

### Agent Decisions (LBP)

- Use one authoritative Temporal registry read path/adaptor over per-change worktree records rather than resurrecting sidecar registry authority.
- Preserve explicit unavailable/warning behavior for Temporal outages or poisoned per-change workflows.

## Deferred Questions

None.

## Sign-Off

Acceptance criteria approved by user reply: `approve`.