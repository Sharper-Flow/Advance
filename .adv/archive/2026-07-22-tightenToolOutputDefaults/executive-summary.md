# Executive Summary

## Outcome
ADV mutation tools no longer auto-attach a context summary to every response by default — callers now explicitly request it via `include.snapshot:true`. A new `outputMode` arg lets operators control JSON formatting on the three heaviest read tools.

## Why It Matters
Long ADV sessions (typical 10-task implementation run) previously accumulated ~3.4 KB of redundant context snapshots in chat history, accelerating context-window pressure and triggering destructive compaction warnings. This change eliminates that pressure while preserving full on-demand visibility.

## Verdict
APPROVED

## What Was Built
1. Default-OFF + opt-in context snapshot on 8 tools (task state updates, change creation, gate completion, wisdom entry) — callers pass `include.snapshot:true` to request the snapshot
2. `outputMode` arg on 3 heavy read tools (`adv_change_show`, `adv_task_list`, `adv_status`) — accepts `compact` or `pretty`, overrides the `ADV_TOOL_OUTPUT_MODE` env var per call
3. Shared Zod schema (`includeSnapshotSchema`) ensures all 8 tools have byte-identical arg shape matching the existing `adv_change_show` opt-in pattern
4. Shared helper (`maybeAttachChangeTicker`) eliminates code duplication across 5 ticker-emission sites and enforces uniform best-effort error handling
5. Precedence resolver (`resolveOutputMode`) makes the arg > env > compact ordering explicit and testable (addresses a validator-caught gap where env could override an explicit compact request)
6. Updated command docs, agent prompt, and ADV_INSTRUCTIONS.md to teach the opt-in pattern at workflow boundaries
7. Spec deltas recorded for 3 requirements (rq-ctxsnap2, rq-ctxticker2, rq-advStatusLazyView01) to reflect the new default-OFF behavior

## What Was Verified
- Verdict: APPROVED with 2 suggestions, 1 question (no blockers or issues)
- Tests: 371/371 pass across 11 targeted suites; `pnpm run check` exits 0 (typecheck, lint, format, schemas, manifests, isolation, lockfile)
- Preview URL: not_applicable (plugin runtime change; no visual surface)
- Contract matrix: 25 required rows, all pass/respected (8 OOS items exempt per verificationRequired:false)

## Remaining Concerns
- 2 review suggestions rejected with evidence during harden (indirect AC7 assertions → mock verifies gating logic; delta projection gap → Temporal read-layer limitation, deltas apply at archive)
- 4 tasks cancelled due to stage-v2 evidence policy (work complete: 3 spec deltas + byte budget analysis); deltas persist in ADV state

## Supporting Evidence
- Task IDs: tk-e6433ddc1d16, tk-0af83bddb1c4, tk-4a2433e9e75f, tk-775dfac8e67a, tk-f64ea513f734, tk-83760592f580, tk-878b67f87827, tk-6318a7bb7b83 (done); tk-32aa7e0a3408, tk-7a7346dd81d4, tk-21dc45c92650, tk-14a8e307034d (cancelled, work complete)
- Review reports: design leverage scout (pass), design validation (caution → integrated)
- Contract review matrix: 25 required rows persisted via adv_contract_review_matrix_set
- Commits: 8 checkpoints on change/tightenToolOutputDefaults branch
- Merge compatibility: clean (all files auto-merge with origin/trunk, no conflicts)

## Release Readiness Summary

### Harden Status: READY
All 6 release-readiness dimensions pass:
- Test coverage: 371/371 pass; all touched files have co-located tests
- AI-slop: none detected (structural Zod schemas, typed helpers, no placeholders)
- Documentation hygiene: 6 doc sites + ADV_INSTRUCTIONS.md updated; no conflicts or stale refs
- Cleanup: no temp files, debug code, or dead imports; prettier-clean
- Production readiness: no security surface; net-positive performance (~3.4 KB/session savings)
- Deployment readiness: no env vars, migrations, or external services; plugin rebuild + restart standard

### Approval Consequence Context
1. **Delivered value**: ~3.4 KB/session chat volume reduction; operator-controlled verbosity via `outputMode` arg on 3 heavy reads
2. **Enabling-only/follow-up dependency**: None — change is self-contained
3. **Ops readiness**: Plugin rebuild + OpenCode restart required to load new tool args (standard for plugin code changes; no deploy script, migration, or external service needed)
4. **Migration/data impact**: n/a — no data migration. Callers relying on auto-emit must add `include.snapshot:true` (documented in command docs + agent prompt + ADV_INSTRUCTIONS.md). No destructive behavior change — opt-in path preserved.
5. **Frontend/preview impact**: not_applicable — no visual surface (`visual_surface: false` per agreement)
6. **Collision/release risk**: Low — merge with origin/trunk clean (no conflicts). Coordinate with `replaceRecoveryToolSprawl` (active, recovery-arg removal on same tools); shared `includeSnapshotSchema` ensures clean merge surface.
7. **Open follow-ups**: 0 blocking. 2 review suggestions rejected with evidence (indirect test assertions → mock verifies gating; delta projection → Temporal read-layer gap, applies at archive). Non-blocking advisory: `addToolContextTelemetry` regression surface shows ~2.1 KB schema growth (net positive against ~3.4 KB/session savings).
8. **Next action**: `/adv-archive tightenToolOutputDefaults` — release gate sign-off + git finalization
