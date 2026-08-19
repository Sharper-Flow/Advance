# Agreement — Archived bundle proof alignment

## Objectives

- **O1:** Route cleanly active-absent legacy bundles through existing-bundle reconciliation regardless of stale or missing lifecycle state.
- **O2:** Make any post-repair durable proof read the same archive bundle selected for recovery mutation.
- **O3:** Converge the surviving bundle to terminal lifecycle state without recreating active state or attempting active retirement.
- **O4:** Preserve release authority, lock order, idempotence, active-path behavior, and fail-closed guarantees.

## Acceptance Criteria

- **AC1:** A legacy bundle with active projection absent and `lifecycleState` open or missing returns archive success after shipped proof.
- **AC2:** A clean active-projection absence plus validated existing bundle routes to `reconcileArchivedBundleRetry` before general-path archive transition; corrupt/unreadable active projection does not.
- **AC3:** When `releaseResult.recoveryMutation === true`, durable proof reads `archiveResult.archivePath` and no active `archive_transition`, worktree cleanup, branch cleanup, or issue-closure side effect is attempted.
- **AC4:** Archived bundle readback reports `gates.release.status=done`, `phase9_status.status=done`, and `lifecycleState=archived`.
- **AC5:** Exact replay adds no projection revision and repeats no finalization or cleanup side effects.
- **AC6:** Active-projection archives continue proving from active state before terminal synchronization.
- **AC7:** Bundle-path verification rejects foreign bundle identity; corrupt, mismatched, or unverified bundle state still fails closed.
- **AC8:** Focused archive tests, typecheck, lint, full suite, and production build pass.

## Post-Archive Continuation

After this change passes acceptance and archive sign-off, the release workflow must deploy from merged default, honor the required runtime restart, and retry both `fixArchivedReleaseRepair` and PokeEdge `unifyPricingSourcePrecedence` until archive success and seven done gates are proven. This remains part of the user-requested end-state but is not an execution-gate task, because archive and runtime activation must occur first.

## Constraints

- No active projection recreation or direct external-state editing.
- No new tool, startup reconciler, sweep, or reaper.
- No weaker Git/PR release evidence.
- No duplicate archive writer.
- No spec-law wording change unless implementation proves current law insufficient.

## Avoidances

- Do not infer clean absence from status alone; use typed projection read outcome.
- Do not let a bundle recovery fall through to active-only retirement.
- Do not accept a bundle whose internal change ID differs from the requested change.