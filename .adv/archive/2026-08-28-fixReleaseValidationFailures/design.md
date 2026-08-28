# Design — Fix release validation failures

## Architecture overview

The remediation changes four lowest-breaking-point owners:

1. Post-release terminal refresh has one writable target: the canonical external bundle.
2. Dead-code repair deletes uncalled files and removes unnecessary exports without baseline exceptions.
3. A scoped pnpm override raises only nanoid 3.x to the patched floor.
4. The historical dirty worktree remains retained under current safety law.

Pre-release archive preparation still writes the tracked bundle. Branch deletion remains owned by `fixSquashMergeWorktreeCleanup`.

## Key decisions

### D1 — Remove tracked terminal targets from the two lowest helpers

The effective write levers are `refreshArchiveBundleProjectionsUnderLock` in `archive-gate.ts:47-66` and the dual-path loop in `completeShippedChange` at `handlers-archive.ts:579-600`.

Delete `inRepoArchivePath` and terminal `inRepoBundlePath` from these write contracts first. TypeScript excess-property errors enumerate every object-literal caller.

`completeArchivedBundleRelease` and `completeReleaseGateAfterFinalization` accept only the canonical archive path. `completeShippedChange` refreshes only `archivePath` after its terminal mutation.

Cleanup retains a separately named `trackedBundlePath` as read-only recovery evidence. It never reaches a writer.

### D2 — Keep two ordered canonical refresh moments

Release-gate evidence and archived-lifecycle evidence are distinct durable facts:

1. `completeArchivedBundleRelease` records release-gate and Phase 9 facts.
2. `completeShippedChange` records final archived lifecycle after the active-store mutation.

Both refresh the canonical bundle. Neither writes the tracked bundle after finalization.

### D3 — Correct and extend route tests

Keep the canonical merged-replay test at `archive-gate.test.ts:127-174`.

Invert only the tracked-target assertion in `handlers-archive.partial-repair.test.ts:948-971`; retain its positive canonical assertion. Preserve `archive.test.ts:425-486` as pre-release tracked-bundle preparation coverage.

Reuse the partial-repair harness for a direct-route regression that proves:

- initial tracked preparation remains,
- post-finalization tracked writes are zero,
- both terminal refresh moments target only the canonical bundle,
- cleanup receives no dirty state created by terminal refresh,
- branch cleanup still requires deleted or already-absent worktree cleanup.

Focused coverage includes direct, `no_remote`, PR manual, PR auto-merge, merge queue, merged replay, existing-bundle retry, and archive-delta repair.

### D4 — Resolve all 53 dead-code findings by subtraction

Delete these zero-importer files first:

- `plugin/src/tools/adv-session.ts`
- `plugin/src/tools/report-followup.ts`
- `plugin/src/tools/spec-delta.ts`

Then remove unnecessary exports, exports whose only consumer was removed, duplicate barrel exports, and stale current documentation references.

Before each group, confirm no registry, configured entry, dynamic, barrel, or production caller remains. Keep `bin/lib/slop-scan/dead-code-baseline.json` byte-identical.

The ratchet is monotone (`current − baseline`). Deletion groups are order-independent and need no baseline change.

### D5 — Add a scoped nanoid 3.x security floor

Add this established override shape to `plugin/pnpm-workspace.yaml`:

```yaml
nanoid@<4: ^3.3.18
```

Cite `GHSA-2v37-7h3g-55p8`. Regenerate through pnpm lockfile-only installation.

Verify no `nanoid@3.3.17` remains, postcss resolves patched 3.x, direct nanoid remains 5.x, and frozen installation succeeds.

### D6 — Keep the historical worktree retained

The `fixPostMergeArchiveCleanup` worktree contains three modified tracked archive files created by the old runtime. `rq-terminalCleanupSafety01.5` requires retention.

Do not clean, reset, checkout, force-remove, or delete that worktree. Final verification records its path, dirty files, retained classification, and operator route.

### D7 — Amend existing archive law only

Modify `rq-archiveTerminalDurability01.1` and `rq-archiveTerminalDurability01.8` so every shipped route uses canonical-only terminal refresh after release proof.

Regenerate `docs/specs/advance-workflow.md`. Do not modify `worktree-lifecycle` law.

## Implementation strategy

1. Create the isolated ADV worktree from fresh `origin/trunk`.
2. Add failing canonical-only assertions and record RED evidence.
3. Remove the two lowest tracked-target parameters and repair compiler-enumerated callers.
4. Make the eight-route matrix green.
5. Amend the typed specification and regenerate its mirror.
6. Delete the three retired files, localize exports, and remove stale references in reviewed groups.
7. Add the scoped nanoid override and regenerate only required lock resolution.
8. Run the dead-code ratchet after each deletion group.
9. Run exact CI-equivalent validation, independent review, and hardening.
10. Integrate and deploy only from fresh merged `trunk`; wait for terminal GitHub CI.
11. Re-run worktree triage and report the retained historical disposition.

Dead-code and dependency lanes can run independently. The archive lane lands its `ArchiveCleanupDisposition` visibility correction before the final dead-code sweep touches that file.

## Affected components

| Component | Change |
|---|---|
| `archive-gate.ts` | Canonical-only release and retry refresh contract. |
| `handlers-archive.ts` | Canonical-only final refresh and unchanged cleanup sequencing. |
| Archive route tests | Canonical-only and direct-route residue proof. |
| `advance-workflow/spec.json` and mirror | Durable canonical-only law. |
| Three retired tool files | Delete. |
| Tool/type modules from the 53-finding report | Local visibility and barrel cleanup. |
| Current docs with retired names | Remove stale references. |
| pnpm workspace and lockfile | Scoped security floor and generated resolution. |

## Lowest-breaking-point analysis

- Change the terminal writer contract, not the deletion planner.
- Change dead declarations, not Knip configuration.
- Change transitive resolution, not direct nanoid use.
- Retain the historical dirty worktree because current law correctly refuses it.

## Design-derived criteria

- **DDC1:** No post-finalization writer signature contains a tracked archive target.
- **DDC2:** Canonical release-gate and archived-lifecycle refreshes remain separate and ordered.
- **DDC3:** All eight shipped/retry routes have canonical-only assertions.
- **DDC4:** The dead-code baseline hash remains unchanged.
- **DDC5:** The dead-code ratchet reports zero new findings.
- **DDC6:** Patched nanoid 3.x and direct nanoid 5.x coexist.
- **DDC7:** No unsafe command touches the historical worktree.
- **DDC8:** Deployment occurs only after default-branch integration and freshness proof.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| A retry still forwards tracked path | Remove the lowest parameter and use compiler failures as caller inventory. |
| An export has hidden ownership | Require registry, entry, barrel, dynamic, and caller proof before deletion. |
| File removal breaks generated surfaces | Run SDK, schema, manifest, type, test, and build checks after each group. |
| Override affects nanoid 5.x | Scope to `nanoid@<4` and inspect the lock graph. |
| Lock regeneration expands | Reject unrelated lockfile changes. |
| Historical retention looks successful | Carry exact retained taxonomy through acceptance and release reports. |
| Branch scope drifts | Do not edit archived-branch cleanup or branch-force behavior. |

## ADR assessment

No new ADR is required. D1 completes `docs/adr/0010-post-merge-archive-authority.md`.

## Design leverage scout

Five candidates were considered. The design adopted compiler-driven parameter removal, deletion-first order, corrected test inventory, harness reuse, and parallel lane ordering.

## Validator result

Independent validator: **pass**, high confidence, low risk.

The validator confirmed both write levers, every parameter-threading route, all named tests, three orphan files, monotone ratchet behavior, the scoped nanoid selector, and spec-law compatibility. No blocker, contract compromise, or overlooked simpler architecture remains.

Validator cautions carried into planning:

- Keep the positive canonical assertion while inverting the tracked assertion.
- Keep `trackedBundlePath` as cleanup evidence after removing it from writers.
- Run the ratchet after each deletion group because subtraction can expose more dead exports.
- Treat the current historical worktree as retained; direct-route recovery cannot authorize its deletion.