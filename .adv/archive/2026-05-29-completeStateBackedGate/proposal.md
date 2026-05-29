## Cross-Project Origin

This change was created as a follow-up from **toolbox**.

| Field | Value |
|-------|-------|
| Source project | toolbox |
| Source path | `/home/jon/toolbox` |

> **Note:** The originating project should be consulted for context on why this change is needed.


# Complete state-backed gate migration

## Intent

Close the residual gap between `fixGateArtifactReadiness` (state-backed proposal/discovery/design) and `removePositionalArtifactApi` (removed disk writes for `agreement`/`design`/`executiveSummary`/`acceptance`). Result today: acceptance gate readiness blocks via `inspectArtifactActivity` requiring disk artifacts that the write flow no longer produces.

## Symptom

Reproducible end-to-end. Demonstrated tonight (2026-05-28→29 UTC) on two toolbox changes (`fixOcE2eTestBugs`, `fixLauncherPostMigration`) shipped through 7-gate lifecycle:

1. `adv_change_update executiveSummary: "<content>"` returns success
2. `state.artifacts.executiveSummary.path` and `.contentHash` populated
3. `state.documents.executiveSummary` populated (via existing flow)
4. **Disk file at the metadata's `.path` is NOT created**
5. `adv_gate_complete gateId: "acceptance"` blocks: `ACCEPTANCE_EXECUTIVE_SUMMARY_MISSING — Artifact not found: <path>`
6. Manual workaround: write file to disk with content matching metadata's `contentHash` + re-fire `adv_change_update` → gate passes

Same pattern blocking pokeedge-web's `fixSubDollarLabels` (4 re-entries observed before the user shifted sessions).

## Root Cause

Two recent changes shipped same day (2026-05-28) and don't compose:

| Change | What it did | Side effect |
|---|---|---|
| `fixGateArtifactReadiness` | Migrated proposal/discovery/design readiness checks to read `state.documents` + `state.artifacts` (state-backed) | Deliberately kept acceptance on `inspectArtifactActivity` (disk-based) per "legacy histories and acceptance" comment |
| `removePositionalArtifactApi` | Moved artifact content to `state.documents`; disk dual-write removed | `agreement`/`design`/`executiveSummary` no longer written to disk |

`fixGateArtifactReadiness`'s assumption ("acceptance keeps disk inspection because disk content is reliable") was true at decision time but invalidated by `removePositionalArtifactApi`'s removal of disk writes for the very artifact acceptance depends on.

## Proposed direction

Two viable options. Recommendation: **Option A** for architectural coherence.

### Option A — Extend state-backed evidence to acceptance gate (recommended)

Apply the same `stateBackedArtifactEvidence` pattern from `fixGateArtifactReadiness` to the acceptance gate. Read `state.documents.executiveSummary` for content + `state.artifacts.executiveSummary` for metadata. Drop `inspectArtifactActivity` from the non-recovery acceptance path. Recovery path keeps `inspectArtifactActivity` per C12 of `removePositionalArtifactApi` (D12 of `addPerProjectOcWrapper` empirically verified `inspectArtifactActivity` is XDG-aware).

- **Pros:** Architectural consistency. Acceptance treated like the other gates. No mixed disk/state semantics.
- **Cons:** Loses one belt-and-suspenders disk hash check at acceptance.

### Option B — Restore disk dual-write for executive-summary (and other acceptance artifacts)

Keep acceptance disk-based. Re-add disk markdown write in the `adv_change_update` flow for `executiveSummary` (and possibly `acceptance.md`). Other artifacts (`agreement`/`design`) stay Temporal-only because state-backed readiness already handles them.

- **Pros:** Minimal architectural surface change. Acceptance keeps the strong disk-hash verification it was designed for.
- **Cons:** Partial revert of `removePositionalArtifactApi` AC11 (no disk writes). Asymmetric — `executiveSummary` is dual-write but `design`/`agreement` aren't.

## LBP Targets

- Validate which option aligns with the maintainer team's intent post-`removePositionalArtifactApi`. The original commenter at `workflows.ts:827` ("recovery path requires inspectArtifactActivity to verify disk") suggests intent was non-recovery acceptance also uses disk; but post-`removePositionalArtifactApi` that's untenable without restoring writes.

## Scope (Option A — assumed)

- `plugin/src/temporal/workflows.ts:880` (non-recovery acceptance path): replace `inspectArtifactActivity` call with `stateBackedArtifactEvidence("executiveSummary", state)` equivalent
- `plugin/src/temporal/workflows.ts:833` (recovery path): unchanged
- `plugin/src/temporal/gate-readiness.ts:201-225`: already metadata-only; no change needed
- Add replay-safe patch marker similar to `STATE_BACKED_GATE_ARTIFACT_PROOF_PATCH` from `fixGateArtifactReadiness`
- Regression test: stage a no-disk acceptance completion through the workflow boundary; assert it advances without `ARTIFACT_MISSING`

## Success Criteria

- `adv_gate_complete gateId: "acceptance"` advances cleanly when `state.documents.executiveSummary` and `state.artifacts.executiveSummary.{path,contentHash}` are present, regardless of disk-file presence
- Acceptance-recovery path (poisoned-history) continues to use `inspectArtifactActivity` (C12 of `removePositionalArtifactApi` preserved)
- Full `pnpm test` passes
- Replay determinism preserved via versioned patch marker
- Existing change histories with on-disk acceptance artifacts continue to work (legacy compatibility)
- New regression test asserts no-disk acceptance completion

## Out of Scope

- Restoring disk writes for any other artifact (covered by Option B if pursued instead)
- `inspectArtifactActivity` itself (used elsewhere — recovery path, archive bundle materialization)
- Re-evaluating `fixGateArtifactReadiness`'s state-backed approach for proposal/discovery/design (already shipped and working)
- Toolbox-side workaround tooling (the manual disk-write + re-fire pattern works today)

## Recovery Note for affected changes

Until this ships, any change hitting `ACCEPTANCE_EXECUTIVE_SUMMARY_MISSING` after the new write flow can be unblocked manually:

1. Fetch content via `adv_change_show changeId: <id> include: { executiveSummary: true }` — extract `_executiveSummary`
2. Write content to disk at the path in `state.artifacts.executiveSummary.path`
3. Re-fire `adv_change_update changeId: <id> executiveSummary: <same content>`
4. Retry `adv_gate_complete gateId: "acceptance"`

SHA256 of disk content will match the existing `state.artifacts.executiveSummary.contentHash` if step 1's content is used verbatim.

## Reproducibility evidence

- Toolbox change `fixOcE2eTestBugs` (archived 2026-05-28, merge `beb1b0f`): blocked at acceptance; workaround applied (see acceptance gate notes)
- Toolbox change `fixLauncherPostMigration` (archived 2026-05-29, merge `6de5faba`): blocked at acceptance; workaround applied
- pokeedge-web `fixSubDollarLabels`: 4 prior re-entries before user shifted sessions; agent diagnosis "poisoned-history" reached for `recoveryMode` escape — actually the same disk-write gap surfacing