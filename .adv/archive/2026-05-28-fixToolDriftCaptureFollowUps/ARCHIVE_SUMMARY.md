# Archive: fix tool drift + capture follow-ups

**Change ID:** fixToolDriftCaptureFollowUps
**Archived:** 2026-05-28T20:18:01.147Z
**Created:** 2026-05-28T20:11:59.231Z

## Tasks Completed

- ✅ T1: Add adv_subagent_report_submit to .opencode/agents/adv.md tools allowlist
  > Task checkpoint completed
- ✅ T2: Add adv_subagent_report_submit to .opencode/agents/adv-atc.md tools allowlist
  > Task checkpoint completed
- ✅ T3: Add 4 agenda items capturing removePositionalArtifactApi OOS follow-ups
  > Task checkpoint completed
- ✅ T4: Capture 5 wisdom entries (3 patterns + 2 gotchas)
  > Task checkpoint completed
- ✅ T5: Verify deploy-local --check zero drift + pnpm test pass
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[pattern]** State-mutation rejection over throw in Temporal signal handlers. Per https://docs.temporal.io/handling-messages#exceptions, throwing in a signal handler fails the ENTIRE workflow (ApplicationFailure → workflow failure; other exceptions → Workflow Task Failure → stuck workflow). The canonical ADV pattern is state-mutation rejection: record the rejection in workflow state (e.g. `state.artifacts[kind].rejection = { reason, attempted_size, cap, rejected_at }`), leave the target state field unchanged, return state. Workflow continues; tool layer observes rejection via next query. Reference: applyGateStuckToState at workflows.ts:722-732, 1098. Use this pattern for any structural validation defense (size caps, schema gates, permission checks) inside signal handlers.</content>
<parameter name="promote">true
- **[pattern]** Compile-time invariant locks via const-true type assertion catch type-set drift between related declarations. Pattern: `type _Check = keyof A extends B ? B extends keyof A ? true : never : never; const _check: _Check = true;`. If either side drifts (a new B value added without an A field, or vice versa), the const assignment fails to compile. Used in types/artifacts.ts to enforce keyof ArtifactPayload === ArtifactKind, in types/gates.ts to enforce GateArtifactKind aligns with its Zod schema. Better than runtime tests because TS catches drift before commit.</content>
<parameter name="promote">true
- **[convention]** Use explicit ordered arrays over Object.entries() for determinism-critical iteration. Object.entries() order is implementation-defined for non-integer keys (modern engines preserve insertion order in practice, but it's emergent not contractual). When ordering matters for replay safety, history-diff cleanliness, or audit reproducibility (e.g. workflow signal fan-out, deterministic test fixtures), declare an explicit ReadonlyArray of [key, signal-or-value] tuples. TS type annotation catches drift between the array and the source key set at compile time. Example: ARTIFACT_SIGNAL_ORDER in storage/store-temporal/changes.ts.</content>
<parameter name="promote">true
- **[gotcha]** TypeScript interface method overloads require implementation satisfaction at compile time — additive-overload approach forces consolidating implementation work into the interface change. When adding a second overload to an interface method (Store["changes"].create with both positional and options-object shapes during a migration window), both store implementations (disk + temporal) must satisfy BOTH overloads in the same change. Splitting interface-add from impl-add into separate tasks breaks the build between them. Either: (a) consolidate the impl work into the interface-changing task, (b) use intersection types with explicit `as Store["changes"]["create"]` casts to defer impl, or (c) skip the additive overload entirely and migrate atomically.</content>
<parameter name="promote">true
- **[gotcha]** Test fixtures using mockResolvedValueOnce break silently when a migration adds a new caller of the mocked function earlier in the call chain. Symptom: test that previously expected a single call to fn() now fails with "received: default mock return" because the mockOnce was consumed by an earlier caller introduced by the migration. Fix: replace mockResolvedValueOnce with mockResolvedValue (stable default for shared call patterns). When precise per-call assertions are needed, count expected calls explicitly. Example: T10 archive-phase9 test fix — readArtifact in validation context now calls findArchiveBundle before the archive flow's own findArchiveBundle, consuming the mockOnce.</content>
<parameter name="promote">true
