# Design — Fix post-merge archive cleanup

## Architecture overview

Archive separates repository preparation from terminal completion.

```text
initial archive
  → write canonical and tracked pre-merge bundle
  → commit release artifacts
  → push or open PR
  → pending_merge

terminal replay
  → read-only merged-PR preflight
  → complete release and archive state in canonical ADV storage
  → refresh canonical bundle only
  → plan/apply exact managed-worktree cleanup
  → retain PR branch for operator-explicit cleanup
  → return typed cleanup disposition
```

One shipped-completion function owns release-gate completion, released projection proof, archive transition, canonical refresh, cleanup, issue closure, and output. Initial direct release and merged-PR replay use this same seam.

Historical poisoned worktrees stay in the existing worktree planner and executor. No separate deletion tool or manual recovery path is added.

## Key decisions

### D1 — Probe merged replay before any repository writer

Add a read-only preflight before `reconcileInRepoArchive`, `archiveChange`, and `finalizeRelease`.

**Levers:** `handlers-archive.ts:689-777` runs writers before finalization. `git-finalize.ts:3735-3742` commits before merged proof at `:3880-3932` and `:2334-2377`.

The preflight requires a validated canonical bundle, pending or terminal Phase 9 evidence, recorded PR identity, and shipped default-branch proof. It returns:

```ts
type ArchivePreparation =
  | { kind: 'prepared_initial'; archiveResult: ArchiveOperationResult; finalization: GitFinalizeOutcome; releasedProjectionPath?: string }
  | { kind: 'verified_merged_replay'; existingBundlePath: string; releasedProjectionPath?: string; projectionManifest?: SpecProjectionManifest; finalization: Extract<GitFinalizeOutcome, { status: 'shipped' }> };
```

The replay variant performs zero worktree writes and validates the existing projection manifest for released-commit proof. Missing or contradictory evidence returns the current blocker or normal path. It never infers a merge.

Proof only inside `finalizeRelease` is rejected because archive writers would still run first.

### D2 — Freeze tracked projections after release integration

The tracked repository projection is pre-release evidence. Terminal-only facts update canonical ADV state and the canonical archive bundle.

**Levers:**

- `archive-gate.ts:41-60` refreshes two targets.
- `archive-gate.ts:511-893` threads `inRepoBundlePath` through recovery.
- `handlers-archive.ts:1037-1079` refreshes both targets after transition.

Replace these paths with one terminal helper that accepts only a canonical bundle path. Delete the dual-target helper, two-path loop, and terminal `inRepoBundlePath` threading. Use one `archivedAt` value.

Initial preparation still writes and commits the tracked bundle. No terminal path writes it after released-commit proof. `writeArchiveBundleFiles` remains the sole producer.

Rejected alternatives:

- A post-merge commit or follow-up PR creates a second release vehicle.
- Removing the tracked projection breaks released evidence.

### D3 — One shipped-completion seam

Extract `completeShippedArchiveLifecycle` from `handlers-archive.ts:840-1201`.

Inputs include shipped proof, canonical bundle, released projection path and manifest, archive mode, repair state, worktree path, issue context, and operations context.

Outputs are exhaustive:

```ts
type ArchiveCleanupDisposition =
  | { status: 'complete'; worktree: AdvWorktreeDeleteResult; branch: BranchCleanupDisposition }
  | { status: 'retained'; worktree: AdvWorktreeDeleteResult; branch: { policy: 'blocked_by_worktree' } }
  | { status: 'not_applicable'; reason: string; branch: BranchCleanupDisposition }
  | { status: 'preview'; worktree: AdvWorktreeDeleteResult; branch: BranchCleanupDisposition };

type BranchCleanupDisposition =
  | { policy: 'operator_explicit'; tool: 'adv_worktree_cleanup'; mode: 'archived_branches' }
  | { policy: 'direct'; result: DeleteChangeBranchResult }
  | { policy: 'not_applicable'; reason: string }
  | { policy: 'blocked_by_worktree' };
```

Final output adds:

```ts
completion: 'archived' | 'archived_with_retained_cleanup';
cleanup: ArchiveCleanupDisposition;
```

Top-level `success` describes durable archival. Explicit completion and cleanup states prevent cleanup-complete inference. User output says “Archived; cleanup retained” for retained state.

The function consumes every non-throwing worktree and branch result. Exceptions cover unexpected failures only.

### D4 — Automatic PR worktree cleanup, explicit PR branch cleanup

After shipped proof, archive uses existing worktree plan/apply for the exact managed worktree. It never calls `deleteChangeBranch` for PR-derived proof.

**Lever:** `handlers-archive.ts:1089-1147` uses route-name conditions.

A policy resolver uses proof kind and archive mode:

- PR-derived shipped proof: operator-explicit branch cleanup.
- Direct archive with deleted or absent worktree: typed direct branch cleanup.
- Retained worktree: branch blocked by worktree.
- Archive-delta repair: preserve repair branch.
- Pending merge: no terminal cleanup.

This covers `pr_auto_merge`, `pr_manual`, and `merge_queue` while preserving `rq-archiveBranchCleanup01`.

### D5 — Historical recovery uses content-bound proof

Add `archive_owned_projection` mode to the existing planner. Generic `force:true` cannot select it.

The injected terminal adapter validates canonical state and supplies repository, branch, base, PR, PR-head, merge-commit, canonical-bundle, allowed-root, and canonical-file-manifest identity. The planner stays store-independent.

Recovery requires:

1. Exactly one non-cross-repository merged PR matches repository, head, and base.
2. Fetched PR head equals the recorded OID.
3. Merge commit is reachable from fetched `origin/{default}`.
4. PR head is an ancestor of local branch head.
5. Every commit-tree difference is inside the exact archive root.
6. NUL status has no untracked, renamed, deleted, conflicted, or outside-root entry.
7. Every changed file is byte-identical to its validated canonical counterpart.
8. Exact commits, name-status entries, status entries, file hashes, canonical identity, and terminal proof are token-bound.

A path prefix, commit message, or terminal status alone never authorizes deletion.

Reuse strict PR identity schema fields from the existing `pr_merged` proof. Add archive-specific fields only. Put `git status --porcelain=v1 -z` parsing in shared `worktree/porcelain-parser.ts`; planner and executor use the same parser.

### D6 — Mode-aware PR revalidation and proof-bound force

The plan gains `removalMode: 'normal' | 'archive_owned_projection'`.

Refactor existing executor PR validation into a shared identity and reachability seam plus a mode-specific head relation:

```ts
normal:
  git merge-base --is-ancestor localHead prHeadOid

archive_owned_projection:
  git merge-base --is-ancestor prHeadOid localHead
```

**Validator correction:** The existing check at `deletion-executor.ts:616-627` accepts only the normal direction. Reusing it unchanged would reject every archive-divergent head. Planning must branch this check by removal mode before archive-specific commit, status, and hash revalidation.

Both modes reuse repository identity, default branch, fetched PR head equality, and merge-commit reachability from `deletion-executor.ts:520-702`.

A dirty canonical projection needs `git worktree remove --force`. The executor adds `--force` only after archive mode is token-bound and fully revalidated under the repository lease. Any drift refuses before deletion. No reset, checkout, filesystem delete, or branch delete occurs.

Generic caller `force:true` never becomes archive recovery authority.

### D7 — Dry-run uses the same planning path

Archive dry-run invokes read-only replay and planning only.

- Terminal replay returns a plan or typed refusal.
- Pre-terminal archive returns not-applicable or terminal-proof-required.
- Branch policy appears in preview.
- No plan applies and no projection writer runs.

## Implementation strategy

### Sequence 1 — Contract and RED evidence

1. Amend workflow and worktree specs.
2. Add RED tests for merged-replay writes.
3. Add RED tests for suppressed cleanup results.
4. Add sanitized fixtures for the six observed poisoned shapes without direct external ADV state reads.
5. Add every AC10 negative case, including both ancestry directions.

### Sequence 2 — Stop new divergence

1. Add replay preflight.
2. Extract shipped completion.
3. Remove every dual-target terminal refresh path.
4. Load projection manifests from validated canonical bundles.
5. Prove zero worktree writes and commits during merged replay.

### Sequence 3 — Make cleanup truthful

1. Add cleanup dispositions and output.
2. Consume worktree and direct branch results.
3. Add branch policy resolution.
4. Add dry-run preview.

### Sequence 4 — Add historical recovery

1. Extend terminal proof with recovery context.
2. Add shared NUL status parsing and canonical file manifest proof.
3. Add shared PR schema fields, integration proof, and removal mode.
4. Split normal versus archive ancestry while reusing common PR revalidation.
5. Add exact commit, status, and canonical hash revalidation.
6. Use proof-bound `--force` for canonical bytes only.
7. Verify `unifyTileVerticalRhythm` after merged deployment, through ADV tools only.

### Sequence 5 — Cross-route verification

1. Run focused archive, Phase 9, projection, planner, executor, and contract suites.
2. Run schema, manifest, type, lint, format, and architecture checks.
3. Run the full throttled suite.
4. Run read-only dry-run against the retained worktree after deployment.

## Affected components

| Component | Change |
|---|---|
| `handlers-archive.ts` | Preflight, shipped completion, cleanup output, dry-run. |
| `archive-gate.ts` | Replay resolver and canonical-only refresh. |
| `git-finalize.ts` | Reuse merged-PR proof; keep initial commit ordering. |
| `archive.ts` | Validated canonical manifest and hash helpers. |
| `deletion-contracts.ts` | Shared PR fields, archive proof, removal mode. |
| `porcelain-parser.ts` | Shared NUL status parser. |
| `deletion-planner.ts` | Terminal context and content proof. |
| `deletion-executor.ts` | Mode-aware ancestry, shared PR proof, archive checks, proof-bound force. |
| `worktree/index.ts` | Recovery context and public result mapping. |
| Tests and specs | Route, proof, drift, safety, output, and ownership coverage. |

## LBP analysis

- Stop replay writes before the first writer.
- Change ownership at projection target selection.
- Keep recovery in the existing planner and executor.
- Change output truth at result assembly.
- Replace route-name conditions with one policy resolver.

Reporting alone leaves new worktrees poisoned. Skipping only final refresh still permits replay commits. Existing seams make a broad finalization rewrite unnecessary.

## Design-derived criteria

- **DDC1:** Preflight performs zero filesystem or Git mutation.
- **DDC2:** Terminal refresh accepts only a canonical bundle after release proof.
- **DDC3:** TypeScript exhaustively checks cleanup and branch policy states.
- **DDC4:** Recovery hashes canonical identity, exact commits, NUL entries, and file hashes.
- **DDC5:** Untracked, conflicted, deleted, renamed, or outside-root entries refuse.
- **DDC6:** All proof work uses the existing operation deadline.
- **DDC7:** No destructive command runs before lease and full revalidation.
- **DDC8:** Generic `force:true` never selects archive mode.
- **DDC9:** Output contains no file contents, credentials, environment, or unbounded Git text.
- **DDC10:** Existing `wdp1` plans remain parseable until five-minute expiry. New optional fields are hash-bound.
- **DDC11:** No tracked archive file is written after released proof.
- **DDC12:** Exact replay adds zero projection revision and repeats zero destructive success.
- **DDC13:** Planner and executor use one NUL status parser.
- **DDC14:** Terminal code retains no dual-path refresh helper or threading.
- **DDC15:** Normal and archive modes use opposite, explicitly tested ancestry predicates.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| User edits a generated file | Require byte identity with canonical bundle. |
| Path or rename ambiguity | Canonical paths and shared NUL parser; reject ambiguity. |
| Canonical bundle changes | Token-bind identity; re-read under lease. |
| PR or base changes | Revalidate exact identities and reachability. |
| Normal ancestry check blocks recovery | Mode-specific predicate and negative tests. |
| Consumers infer cleanup from `success` | Explicit completion and cleanup discriminators. |
| Route drift restores automatic branch deletion | Central proof-kind policy. |
| Sibling cleanup touches adjacent code | Do not change branch-delete semantics; rebase by merge order. |
| Historical branch remains | Report explicit branch disposition; sibling owns deletion semantics. |

## ADR draft

**Candidate:** `docs/adr/NNNN-post-merge-archive-ownership.md`

Repository archive projections freeze at release integration. Terminal-only facts live in canonical ADV state and bundle. Historical deletion needs content-bound terminal and Git proof. The consequence is that tracked archive files can show pre-merge release state while canonical reads remain terminal.

## Design leverage scout

Five candidates were considered. Four were adopted:

1. Reuse common executor PR revalidation.
2. Put NUL status parsing in the shared parser.
3. Delete all dual-target refresh paths and threading.
4. Share strict PR identity fields across proof kinds.

Direct real ADV archive directories were rejected as fixtures. Tests use sanitized repository fixtures and tool-backed operational proof.

## Validation status

**Validator: CAUTION, no blockers.** Confidence high; risk medium.

The design solves the agreed defect and preserves current spec authorities. The required correction is D6/DDC15: archive recovery must use `prHeadOid` as ancestor of local head, while normal PR cleanup keeps local head as ancestor of PR head.

Validated source levers:

- `handlers-archive.ts:689-777,840-1201`
- `git-finalize.ts:342-376,3735-3742,3880-3932`
- `archive-gate.ts:41-60`
- `deletion-planner.ts:32,518-524`
- `deletion-executor.ts:520-702`
- `deletion-contracts.ts:36-120`
- `porcelain-parser.ts:1-123`

Spec implications are resolved through the approved delta plan. No contract compromise remains.