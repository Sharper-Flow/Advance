# Agreement — Fix release validation failures

## Discovery summary

Release `32ec6a59f0f57d72027d1b1646072e5422e15a71` is durable and reachable from `origin/trunk`. Post-release checks found one incomplete implementation seam, one release-owned dead-code finding, and two CI failures that were already red on base SHA `050a5aaf591fce49766d93e973c9213733712a22`.

The archive defect is broader than the initial hypothesis. `completeShippedChange` still refreshes both the canonical external bundle and the tracked in-repository bundle after release proof. Recovery helpers also retain dual-target refresh plumbing. The released design explicitly required those paths to collapse to one canonical-only terminal writer, but the implementation left them in place. The direct route therefore rewrote three terminal files after pushing the release commit and made its worktree dirty before cleanup.

The canonical dead-code ratchet reports 53 findings. Structural caller and registry tracing classified every finding. Three files are retired and uncalled. The remaining findings are internal-only exports, types, schemas, constants, or duplicate barrel exports. `ArchiveCleanupDisposition` is the only finding introduced by the released archive change. No dynamic-registry false positive requires a baseline exception.

The OSV failure is `GHSA-2v37-7h3g-55p8`. `nanoid@3.3.17` is affected; `3.3.18` is patched. Advance uses the vulnerable copy only through the development-tool `postcss@8.5.25` chain. The direct dependency remains patched on `nanoid@^5.1.16`. The repository already uses scoped pnpm security-floor overrides.

The current historical worktree contains only three modified tracked archive files. Existing worktree law requires dirty state to remain retained. This change will preserve that refusal and report its exact disposition. It will not force-remove or manually reset the worktree.

## Conflict and prior-work assessment

- `fixPostMergeArchiveCleanup` is the direct predecessor. This change completes its approved canonical-only design and repairs its missed deletion work.
- `fixDeadInternalCallGuards` recorded the nanoid and dead-code failures as named follow-ups. This change owns those follow-ups.
- `fixEpicMembershipWritePath` recorded three dead files as a separate cleanup obligation. This change owns that obligation.
- Active `fixSquashMergeWorktreeCleanup` owns squash-safe branch deletion and worktree-versus-branch cleanup ordering. This change will not modify its branch deletion surface.
- Active `codifyCloseRetirementLaw` has no overlap.
- The archived inventory contained 218 changes. No other active or archived change owns this complete remediation scope.

## Objectives

- **O1 — Make terminal refresh canonical-only.** After release proof, every shipped archive route writes terminal facts only to the canonical external bundle.
- **O2 — Remove structurally proven dead code.** Resolve all 53 current ratchet findings through subtraction or local visibility correction, without adding baseline fingerprints.
- **O3 — Patch the vulnerable transitive dependency.** Resolve the nanoid 3.x chain to `3.3.18` or later without changing the direct nanoid 5.x dependency.
- **O4 — Preserve release and cleanup safety.** Keep route, retry, branch, dirty-worktree, CWD, lock, deadline, ancestry, and lease behavior fail-closed.
- **O5 — Give the historical worktree an explicit safe disposition.** Preserve the exact retained classification and never claim deletion while its tracked archive files remain dirty.
- **O6 — Restore release CI.** Make the CI, security, and build workflows pass on the released remediation.

## Acceptance criteria

### AC1 — Post-release terminal writes are canonical-only

Given direct, `no_remote`, PR manual, PR auto-merge, merge-queue, merged-replay, retry, and archive-delta repair routes, after structural release proof:

- terminal refresh accepts only the canonical external bundle path,
- the tracked archive bundle remains byte-identical to the released commit,
- and no post-finalization helper accepts or reconstructs an in-repository terminal-refresh target.

### AC2 — Direct archive does not create dirty terminal residue

A direct-route regression test executes initial bundle preparation, release-gate completion, shipped completion, and cleanup sequencing. It proves:

- the tracked bundle receives zero writes after finalization,
- the canonical bundle receives the terminal refresh,
- cleanup does not receive a `dirty_worktree` blocker created by archive terminal writes,
- and the direct branch cleanup gate remains dependent on successful worktree cleanup.

### AC3 — Dual-target refresh plumbing is removed

The post-finalization code contains no dual-target refresh loop and no terminal `inRepoBundlePath` or `inRepoArchivePath` threading. Initial pre-release archive preparation still writes the tracked bundle and includes it in the release commit.

### AC4 — Route and retry behavior remains explicit

Focused tests cover all eight AC1 routes. They prove pending merge performs no terminal cleanup, merged replay remains idempotent, exact retry performs no repeated destructive action, and recovery writes only the canonical bundle.

### AC5 — Cleanup and branch safety remain unchanged

Negative tests prove dirty, untracked, in-use, locked, expired, ancestry-mismatched, path-mismatched, and hash-mismatched worktrees remain retained. No implementation or test adds automatic PR branch deletion or changes the squash-merge branch cleanup surface.

### AC6 — Every current dead-code finding is resolved structurally

`pnpm --dir plugin run dead-code:check` exits 0. The reviewed baseline bytes remain unchanged. The remediation removes:

- three uncalled files,
- internal-only export modifiers,
- exports whose only consumer was a removed file,
- schema/type exports used only for local derivation,
- and duplicate barrel exports.

### AC7 — Dead-code removals preserve registered behavior

After deletion, SDK parity, schema drift, manifest drift, type checking, lint, formatting, plugin tests, CLI tests, and build all pass. Static registry and documentation scans show no stale reference to removed public names.

### AC8 — The nanoid advisory is cleared by the owning dependency surface

`plugin/pnpm-workspace.yaml` contains a scoped nanoid 3.x security-floor override. The regenerated lockfile contains no `nanoid@3.3.17` snapshot, keeps the direct nanoid 5.x dependency, and passes frozen-lockfile installation. OSV and Trivy dependency checks report no `GHSA-2v37-7h3g-55p8` finding.

### AC9 — The historical worktree remains truthfully classified

Worktree triage reports the exact retained path and its dirty archive files. No command uses force, reset, checkout, filesystem deletion, or an unverified cleanup exception. If the worktree remains registered, final output names the blocker and next operator route.

### AC10 — Spec law matches the canonical-only boundary

`rq-archiveTerminalDurability01.1` and `rq-archiveTerminalDurability01.8` state that post-release terminal refresh is canonical-only for every shipped route. Typed specs, generated mirrors, schema checks, and mirror equality pass.

### AC11 — Local release validation passes

The exact CI-equivalent commands pass:

- frozen dependency installation,
- dead-code ratchet,
- SDK parity,
- schema drift,
- type checking,
- lint,
- formatting,
- plugin tests,
- plugin build,
- and Bun CLI tests.

The previously approved prompt-budget baseline remains outside this scope because GitHub CI does not run it and the user approved that known baseline before this remediation.

### AC12 — GitHub release checks finish green

After integration, GitHub reports terminal success for the CI, Security Gates Pilot, and dependent Build jobs. Default-branch reachability proves the released remediation commit.

## Constraints

- **C1:** Canonical ADV storage owns facts created after release proof.
- **C2:** The tracked archive bundle may change only during pre-release preparation and its release commit.
- **C3:** Do not force-remove, reset, checkout, or manually delete a worktree.
- **C4:** Preserve dirty-worktree, CWD, lock, deadline, ancestry, path, hash, approval, and lease checks.
- **C5:** Do not add or modify dead-code baseline fingerprints.
- **C6:** Remove a finding only after declaration, registry, configured entry, barrel, dynamic, and test use are traced.
- **C7:** Use the scoped pnpm override pattern. Do not hand-edit lockfile resolution data.
- **C8:** Keep the direct nanoid 5.x dependency unchanged.
- **C9:** Do not modify automatic or operator branch deletion behavior owned by `fixSquashMergeWorktreeCleanup`.
- **C10:** Implement in an isolated ADV worktree. Deploy only from merged `trunk`.
- **C11:** The prompt-budget baseline is not part of this change.

## Avoidances

- **A1:** Do not add per-route conditions around the dual-target writer. Remove the unwarranted second target.
- **A2:** Do not add `@public`, widen Knip entry roots, or bless fingerprints for constructs with no runtime owner.
- **A3:** Do not remove tests, validation, observability, or error handling to make the dead-code check pass.
- **A4:** Do not use an unscoped nanoid override that can force the 5.x dependency onto 3.x.
- **A5:** Do not perform a full unrelated lockfile refresh.
- **A6:** Do not commit terminal metadata after release proof.
- **A7:** Do not treat the dirty historical worktree as deleted or safe to force-remove.
- **A8:** Do not revive retired tool names or leave stale documentation tombstones.

## Lowest-breaking-point assessment

| Failure | Lowest owner | Correction |
|---|---|---|
| Tracked bundle becomes dirty after release | terminal refresh helper and its path contract | Remove the in-repository terminal target and retain one canonical target. |
| Dead-code ratchet reports 53 findings | declarations and three uncalled files | Delete dead files and remove unnecessary export surfaces. |
| nanoid 3.3.17 remains vulnerable | root pnpm override and lock resolution | Add a scoped 3.x floor and regenerate the lockfile. |
| Historical worktree cannot delete | current dirty-worktree safety law | Preserve retained state and report exact evidence; do not weaken deletion authority. |

## Spec delta plan

Modify `advance-workflow`:

- Clarify `rq-archiveTerminalDurability01.1` so every shipped route refreshes only the canonical surviving bundle after release proof.
- Clarify `rq-archiveTerminalDurability01.8` so shared shipped completion never writes the tracked bundle and exact replay stays write-free.
- Regenerate `docs/specs/advance-workflow.md` from the typed source.

No `worktree-lifecycle` law changes. Dirty worktrees remain retained.

## Research evidence

- Local route inventory: `plugin/src/tools/change/handlers-archive.ts`, `archive-gate.ts`, `archive.ts`, and `git-finalize.ts`.
- Dead-code classification: all 53 findings traced through static registries, callers, types, barrels, and removed-name tests.
- Official advisory: https://github.com/advisories/GHSA-2v37-7h3g-55p8 and https://osv.dev/vulnerability/GHSA-2v37-7h3g-55p8.
- pnpm overrides: https://pnpm.io/settings/dependency-resolution#overrides.
- Knip entry and public-export guidance: https://knip.dev/guides/configuring-project-files and https://knip.dev/reference/jsdoc-tsdoc-tags.
- Opportunity scout: adopted canonical choke-point removal, test inversion, scoped override, deletion-only ratchet repair, and taxonomy-based retained disposition.

## Discovery disposition

- External dependency research confirmed the scoped nanoid override.
- External dead-code tools are not the architecture owner; the repository ratchet and static registry remain authoritative.
- The active squash-merge cleanup change remains separate.
- No critical behavioral, functional, or scope ambiguity remains.
- The cross-project origin field reflects the current orchestrator project. The durable source artifact and all implementation ownership remain in Advance.