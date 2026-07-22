## Outcome

Agents can now correct staged spec-deltas mid-change. Four new tools complete the staged-delta write vocabulary: `adv_delta_amend` (full-replace a staged delta, preserving its id — the primary unblock), `adv_delta_retract` (drop a staged delta), and `adv_delta_remove` / `adv_delta_rename` (stage remove/rename operations the downstream already applied).

## Why It Matters

`adv_delta_modify` allowed only a *first* modify of a requirement and rejected any later correction — an agent who staged a wrong postimage was stuck (cancel + recreate the change was the only escape). This directly unblocked the replaceRecoveryToolSprawl agent, who needed to amend a staged modify on `rq-activeChangePointer01` (replacing retired-tool references adv_change_forget→adv_doctor across scenarios .1/.2/.6 while preserving .3/.4/.5/.7).

## Verification

- 90 targeted delta tests + 13 replay-determinism tests (including replay of poisoned production histories) pass
- `pnpm run check` green (schemas/typecheck/manifests/lint/format); `build:worker` clean
- Live post-deploy dogfood: this change's own spec-law delta `rq-stagedDeltaCrud01` round-tripped cleanly (readback-confirmed), and the workflow self-recovered via the OrphanQueueAdopter — both this session's own mechanisms validated in production

## Structural properties

- No migration — the Delta discriminated union already included remove/rename; `change.deltas[]` shape unchanged
- Replay-safe — new signal handlers appended additively; old histories never sent them; no `wf.patched()`
- Archive remains the sole global-spec writer; tools mutate only the change-owned staged record
- Full-replace amend (deterministic, no heuristic merge); every write returns explicit failure on unconfirmed readback (SC4+SC6)

## Risks / Follow-ups

- Merge coordination: additive overlap with in-flight replaceRecoveryToolSprawl on workflows.ts/tool-registry.ts/tool-role-policy.ts — that change rebases + reruns build:worker when it merges
- Sub-agent test runIds were not durably recorded (verification_missing warnings) — dispositioned with the orchestrator-run 90+13 test evidence