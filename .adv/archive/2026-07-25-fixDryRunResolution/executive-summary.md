## Executive Summary: fixDryRunResolution

### Outcome
Archive dry-run preflight (`adv_change_archive dryRun:true`) now correctly clears stale required ops-follow-up obligations when the authoritative child change is complete, instead of reading a stale parent snapshot and falsely blocking valid archives.

### Value / Why it matters
Deploying the first ops-link resolver created a paradox: dry-run preflight (which must not write) skipped reconciliation entirely, so a parent change whose snapshot still showed a `not_started` child link was blocked from archiving even after the child completed. This blocked the live PokeEdge `pinBuildkitImage` → `verifyStagingBuildkit` release chain. The fix derives fresh authoritative child proof on every call and applies it via a non-aliasing ephemeral overlay — zero writes, same fail-closed parity as the wet (persisting) path.

### What was built
- `resolveRequiredOpsLinks` — shared host-only fresh per-link derivation of authoritative child proof. No signals, no saves. Used by both dry-run and wet paths.
- `overlayOpsResolutionsForRead` — non-aliasing ephemeral overlay via `structuredClone` (parent AND replacement resolutions), discarded after readiness/obligation rendering.
- `reconcileOpsFollowupLinks` — refactored to delegate to the shared derive, then persist + re-read (wet path only).
- `adv_change_archive` authority — dryRun branch calls resolve + overlay (zero writes); wet branch calls reconcile (signal + re-read).

### Verification
- 184 unit tests pass: 152 in `change.test.ts` (11 new: stale-clear, incomplete/missing/unreachable/identity-mismatch/stale-complete-current-unreachable/completion-proof-incomplete, cross-project clear+blocker, non-aliasing freeze, dry/wet parity) + 32 in `ops-followup-reconciliation.test.ts` (30 existing preserved under refactor + 2 new overlay non-aliasing regression).
- `pnpm run check` clean (schemas, typecheck, manifests, isolation, lint, formatting).
- Independent acceptance review: READY after C2 aliasing remediation (commit `6733dba8` — clone replacement resolutions before assignment).

### Risks / Follow-ups
- **AC5 (live PokeEdge proof):** Unit tests prove the code path (AC1 shares the same derive + overlay). The live Temporal-authoritative proof — `adv_change_archive dryRun:true` against `pokeedge-web pinBuildkitImage` — requires a plugin build + deploy first; captured at archive preflight. Cannot be unit-tested per design.
- **Plugin deploy required:** Fix takes effect only after `pnpm run build` + `deploy-local.sh --fix` + host restart. Source edits do not change live `adv_*` behavior until deployed.