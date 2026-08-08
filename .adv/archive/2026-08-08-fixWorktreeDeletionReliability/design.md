# Design

## Architecture

### 1. Split planning from deletion authority

Introduce one shared `WorktreeDeletionPlanner` and one `WorktreeDeletionExecutor` behind all deletion surfaces.

- Planning is read-only and Git-census-authoritative.
- Apply requires a plan token plus existing irreversible-action approval evidence.
- `adv_worktree_delete dryRun:true` remains as a compatibility adapter that returns the new plan.
- `adv_worktree_delete` without a plan token never deletes; it returns typed `PLAN_REQUIRED` plus migration guidance.
- `adv_worktree_cleanup` uses the same planner/executor internally after its count-matched approval contract; it does not retain a separate deletion implementation.

### 2. Self-contained deletion plan

`WorktreeDeletionPlanSchema` contains:

- schema version
- repository identity and canonical root
- Git common directory identity
- exact worktree path
- branch or detached state
- HEAD SHA and tree SHA
- main-worktree flag
- dirty state
- current-CWD/process-use state
- Git-native locked/prunable state and reason
- default branch and integration proof
- registry observation, explicitly advisory
- generated/expires timestamps
- structured warnings

The token format is `wdp1.<base64url(canonical-plan-json)>.<sha256>`.

- The hash detects corruption and binds every plan field.
- Approval remains the authorization boundary; token possession is not authorization.
- Default expiry: five minutes.
- The same canonical plan payload produces the same token.
- No plan file or background cleanup is required.

### 3. Canonical Git census

Consolidate existing worktree porcelain parsers into one parser for `git worktree list --porcelain -z`.

The parser recognizes:

- `worktree`, `HEAD`, `branch`, and `detached`
- `bare`
- `locked` with optional reason
- `prunable` with optional reason
- arbitrary paths without newline ambiguity

Git census identifies actual worktrees regardless of branch prefix or ADV registry history. Registry state contributes warnings and post-delete reconciliation only.

Main worktree, ambiguous identity, unresolved repository identity, malformed porcelain, or administrative corruption fail closed.

### 4. End-to-end operation context

Create `WorktreeDeletionOperationContext` at the public tool-handler entry, before target-project resolution.

It owns:

- absolute `startedAt` and `deadlineAt`
- response-reserve budget
- one `AbortController`
- current stage
- bounded stage timing records
- child-process lease registry
- `remainingMs()` and `enterStage()` invariants

Internal deadline: 7,500 ms, reserving at least 2,500 ms beneath the host's 10-second ceiling for cancellation confirmation, serialization, and wrapper overhead.

Target validation uses a lightweight project resolver and state-path derivation. Worktree planning/deletion must not initialize the full ADV store or run unrelated projection migrations.

### 5. Abortable process runner

Add a single process runner for deletion-owned Git commands and hooks.

On POSIX:

- spawn each command in a new process group
- propagate the operation AbortSignal
- on expiry send SIGTERM to the negative process-group PID
- wait a bounded grace period
- send SIGKILL to the process group if still alive
- await exit/close confirmation before returning

On Windows or another platform where subtree termination cannot be proven, destructive apply returns typed `UNSUPPORTED_PROCESS_TERMINATION`; planning remains available.

Every subprocess receives only `remainingMs()`; no call retains 30-second defaults or an absent timeout.

Delete-path use of non-cancelling `withTimeout`/`Promise.race` is removed. No late-success handler exists.

### 6. Liveness-aware repository lock

Replace the current owner-unverified worktree lock behavior with a lease:

- atomic create with PID, random owner token, acquired timestamp, and repository identity
- live owner: return typed `BUSY`
- dead owner: compare-and-reclaim
- release removes the file only when PID and owner token still match
- one lock covers apply revalidation, Git removal, and registry reconciliation

Planning does not acquire the destructive lease.

### 7. Apply state machine

`WorktreeDeletionResultSchema` is a discriminated union:

- `planned`
- `deleted`
- `already_absent`
- `refused`
- `drifted`
- `busy`
- `deadline_exceeded`
- `indeterminate`
- `repair_required`
- `unsupported`

Apply sequence:

1. Parse and validate token/hash/expiry.
2. Resolve the exact repository without full-store initialization.
3. Acquire repository cleanup lease within remaining budget.
4. Re-run canonical census and all safety checks.
5. Compare every plan-bound fact; any mismatch returns `drifted`.
6. Run bounded pre-delete hooks in a cancellable process group.
7. Recheck cleanliness and process use.
8. Run bounded `git worktree remove` without filesystem fallback.
9. Confirm process exit, then re-run census.
10. Reconcile ADV registry/pending-delete metadata transactionally.
11. Return terminal typed evidence; release lease by owner token.

`already_absent` is successful and idempotent only when Git census and filesystem checks both agree that the worktree is absent. Contradictory half-state returns `repair_required`.

### 8. Integration and corruption rules

Branch integration no longer asks whether the branch is registered. It proves safety from Git and existing release evidence:

- ancestor reachability, or
- squash-merge-safe tree/patch equivalence already accepted by cleanup policy, or
- canonical merged-PR evidence

Before apply census, run bounded `git worktree prune --expire now --dry-run` for diagnosis. Do not mutate with prune before plan revalidation. If administrative state is prunable/corrupt, return `repair_required` with bounded `git worktree repair` guidance rather than deleting a directory directly.

Git-native locked worktrees always refuse normal deletion. Existing `force` never bypasses main-worktree, integration, CWD, process-use, lock, or plan-drift checks.

## Lowest-Breaking-Point Decisions

1. **One shared planner/executor, not another cleanup tool.** Existing delete, cleanup, and archive paths converge instead of accumulating parallel logic.
2. **Compatibility adapter, not silent behavior change.** Existing dry-run becomes planning; destructive branch-only calls become `PLAN_REQUIRED`.
3. **No full-store initialization.** Worktree deletion needs repository and worktree state, not change projection migration.
4. **Self-contained plan token.** Avoids durable plan-state lifecycle while preserving exact drift binding.
5. **Repository lease plus Git revalidation.** Git has no native compare-and-remove primitive.
6. **Fail closed on unsupported process-tree cancellation.** A longer timeout or direct-child kill does not satisfy no-post-timeout mutation.
7. **Git authority is narrow.** Git owns worktree facts; ADV still owns archive/change lifecycle and approval evidence.

## Contract and Schema Changes

- Add public plan/result Zod schemas and generated JSON schema coverage.
- Extend `adv_worktree_delete` with `planToken` and `approvalEvidence`; enforce cross-field preflight before handler execution.
- Preserve `branch`, `dryRun`, `force`, and target-project fields only through explicit compatibility semantics.
- Update `adv_worktree_cleanup` to pass approved candidate identity into the shared executor.
- Update agent tool policy, manifests, command packets, cleanup skill examples, and tool descriptions.
- Placeholder-sensitive plan token and approval fields must fail as `INVALID_TOOL_ARGS` before shell commands or writes.

## Implementation Locality

Primary modules:

- `plugin/src/tools/adv-worktree.ts`
- `plugin/src/tools/worktree/index.ts`
- new local planner/executor/state-machine modules under `plugin/src/tools/worktree/`
- consolidated porcelain parser/census modules
- `plugin/src/utils/git-binary.ts`
- `plugin/src/utils/git-worktree-flock.ts`
- target-project lightweight resolution path
- worktree cleanup/archive adapters
- colocated schemas and tests
- generated schemas, tool-role policy/manifests, command/skill contract assets

Superseded constructs to remove:

- registry-membership deletion gate
- delete-owned non-cancelling timeout races
- ungated 30-second/no-timeout Git calls
- duplicated porcelain parsers
- owner-unverified lock release
- independent cleanup deletion implementation paths

## Verification Strategy

### RED first

- Target resolution hang returns generic host timeout today.
- Unregistered `release/*` worktree refuses today.
- Child/grandchild survives direct-child timeout today.
- Stale lock cannot be safely reclaimed today.
- HEAD/dirty/process drift between preview and apply is not token-bound today.

### GREEN

- Unit tests for schemas, token canonicalization, porcelain parser, deadline arithmetic, stage state machine, lease ownership, and process-group cancellation.
- Integration tests with real temporary Git repositories/worktrees for every branch family and refusal state.
- Fake/injected clock and process runner tests for every deadline stage.
- Concurrent apply tests proving exactly one delete and typed competitor outcomes.
- Post-response observation test waits beyond former timeout and proves no process, Git, or registry mutation.
- Cross-project fixture with large ADV state proves deletion avoids full-store migration.
- Public schema/manifests/packet parity checks.

### Operational acceptance

After merge, green CI, release, deployment, and OpenCode restart:

1. Plan both retained release worktrees.
2. Present exact irreversible deletion confirmation if prior approval does not bind the new plans.
3. Apply using plan tokens.
4. Verify Git census, filesystem absence, registry reconciliation, and repeated `already_absent` response.

## Failure and Recovery

- Deadline before destructive stage: typed failure, no mutation.
- Deadline during child process: terminate process group and confirm exit before response.
- Uncertain Git half-state: `indeterminate` or `repair_required`; never filesystem-delete.
- Registry reconciliation failure after confirmed Git deletion: return `deleted` with explicit reconciliation warning and enqueue only metadata repair, never another Git removal.
- Live lock: `busy`; dead lock: safely reclaimed.
- Drift: require a new plan.

## Alternatives Rejected

- Raise host/tool timeout: moves failure cliff and preserves non-cancellation.
- Registry repair before deletion: still makes projection history a prerequisite for Git cleanup.
- Background deletion queue: violates no-post-response mutation and hides authority.
- Manual Git fallback: bypasses audit and safety invariants.
- Git-native worktree lock as repository serializer: per-worktree semantics do not provide compare-and-remove or repository-wide serialization.