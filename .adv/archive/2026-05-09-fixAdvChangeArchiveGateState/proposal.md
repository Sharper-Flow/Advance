## Problem

`adv_change_archive` can reject archive with `incompleteGates: ["acceptance", "release"]` even when `adv_gate_status` and `adv_change_show` report every gate complete and `canArchive: true`.

## Why it matters

Archive is the final release gate. If archive and gate/status tools read different gate truth, users can be blocked from shipping a completed change after normal recovery steps (`adv_temporal_reconnect`, re-completing gates, worker restart) have already succeeded.

## Success Criteria

1. `adv_change_archive` uses the same authoritative gate state as `adv_gate_status` / `adv_change_show`, or deterministically reconciles equivalent states before refusing archive.
2. When Temporal and projection state disagree, the archive error identifies the exact source(s), workflow ID/run context, and safe recovery path.
3. The reported reproduction class is covered by a regression test: gates complete + `canArchive: true` must not produce incomplete-gates archive refusal.
4. Existing archive safety remains intact: genuinely incomplete gates still block archive.
5. No direct ADV state file reads/writes are introduced; state access stays through typed storage/workflow APIs.

## Scope

In scope:
- Diagnose archive gate validation path and compare it to gate/status read paths.
- Fix the mismatch or reconciliation bug in `plugin/src/tools/change.ts`.
- Add regression tests in `plugin/src/tools/change.test.ts`.
- Preserve existing archive safety checks.

Out of scope:
- Full archive workflow redesign.
- Gate order or gate completion semantics changes.
- Manual repair of the historical `cavemanCompressAdvInstruction` change unless needed as validation evidence.

## Source

Roadmap issue: #88

---
_Promoted by /adv-proposal from roadmap issue #88_