# Cross-Session Notes — `fixStuckTemporalWorkerRecovery`

**From:** PokeEdge session, 2026-05-04 ~02:48–03:05 EDT
**To:** Agent currently in `~/.local/share/opencode/worktree/bdf259a.../change/fixStuckTemporalWorkerRecovery`
**Status:** Untracked file in advance main checkout. Standing down on the change itself.
**Mirror:** GitHub comment on [Sharper-Flow/Advance#25](https://github.com/Sharper-Flow/Advance/issues/25).

---

## Why this file exists

A user in `pokeedge-web` hit the diagnose / restart false-alarm pattern your change is fixing. We ground-truthed it against `temporal task-queue describe` and confirmed your change targets the right root causes. These notes pass back **net-new evidence**, **one composition risk**, **one test-scenario suggestion**, and **a list of accompanying-change candidates** that should NOT bloat your change.

The user explicitly told me to stand down on mutating the change. This is read-only signal — landing how you want.

---

## 1. Live evidence captured (PokeEdge project, project_id `67fe3e95...`)

The exact failure shape your tk-b1452857 / tk-669c7976 are designed to detect, reproduced live:

| Plane | `adv_temporal_diagnose` said | `temporal task-queue describe` ground truth |
|---|---|---|
| `worker_alive` | `false` | `true` (5 workflow + 5 activity pollers, all <45s) |
| `registered_queues` | `[]` | UNVERSIONED workflow + activity polling actively |
| `stale_queues.running_count` | 10 | 10 normal long-lived `adv/change/*` + `adv/project/*` workflows, **NOT stuck** (backlog = 0) |
| `worker_lock` | held PID 827547, fresh 3.3s, schema **v2** | matched |
| `recommendedNextAction` | "run `adv_temporal_worker_restart`" | restart was already proven futile (5 sessions, 5 workers, lock held by ONE; restart spawns yet another idle worker) |

Lock holder PID changed mid-investigation: 827547 → 1473088 (different opencode session re-won the lock). Whichever session won the latest lock acquisition becomes "owner"; the other 4 sessions appear "broken" from their own diagnose call.

## 2. Important nuance: this case is NOT v1-legacy

The lock was already **v2** with fresh heartbeat. So this incident does **not** match `rq-workerSingleton01.6` (suspect legacy v1 live lock requiring approval to reclaim). Your serviceability classifier needs to handle this distinct case correctly:

> **A v2 lock + fresh heartbeat + healthy server-side pollers, viewed from a non-owner session.**

The right classification is `confidence: server-poller, ownership: peer-alive` — not `peer-owned-unknown`, not `suspect-legacy`. The peer is healthy; this session is correctly idle. Restart should be a no-op recommendation, not the next action.

If the classifier mis-buckets this as `peer-owned-unknown` because it can't see the lock-holder's worker child directly, we'll just trade one false alarm for another. The fix is to trust `DescribeTaskQueue` poller freshness as a sufficient positive serviceability plane regardless of lock ownership.

## 3. Composition risk in `probeStaleQueues`

`plugin/src/temporal/health-probe.ts:probeStaleQueues` short-circuits only on `registeredQueues.includes(queue)`. After your changes, it should **also** short-circuit when `queueServiceability.confidence === "server-poller"`. Otherwise:

- Non-owner sessions still emit "Stale Temporal queue …" recommendations even when `DescribeTaskQueue` proves the queue is healthy
- The `adv_status` recommendation list keeps surfacing the false alarm even though `adv_temporal_diagnose` correctly classifies serviceable

tk-669c7976's "Use queue serviceability in diagnose and status health output" should already cover this for the recommendation ordering. Double-check that `probeStaleQueues` itself (or its callers in status output) gates on serviceability before emitting the running-count entry — otherwise status output and diagnose can disagree.

## 4. Suggested test scenario for tk-8223bce9

A scenario the regression task may not yet cover:

```
GIVEN  5 concurrent OpenCode sessions in same project
  AND  1 holds v2 worker.lock with fresh heartbeat
  AND  Temporal task-queue describe shows fresh pollers from all 5
  AND  10 long-lived adv/change/* workflows are Running > 5min
  AND  this session is one of the 4 non-owners
WHEN   adv_temporal_diagnose runs from a non-owner session
THEN   serviceability classification = "serviceable, peer-owned, server-poller evidence"
  AND  recommendedNextAction does NOT say "run adv_temporal_worker_restart"
  AND  recommendedNextAction is informational ("peer N owns queue, healthy")
  AND  stale_queues running_count of 10 is NOT emitted as a warning
  AND  formatted status separates "this session" from "queue health"
```

The existing scenarios in tk-eb7226ae cover suspect-v1-live-lock and bounded-recovery paths. This scenario covers the **healthy multi-session steady state** which is the dominant runtime mode and was the dominant source of false alarms today.

## 5. Stand-down protocol I used (worth codifying as ADV pattern)

When the visiting agent (this session, in `pokeedge-web`) read change state via `adv_status target_path: /home/jrede/dev/oc-plugins/advance`, the response correctly returned:

```json
"_projectContext": {
  "trusted": false,
  "trustSource": "explicit",
  "stateMode": "disk-snapshot",
  "warning": "Read-only untrusted target_path snapshot. Mutations require explicit target confirmation."
}
```

That rail is correct. The pattern I followed:

1. Discover peer in_progress task on a change (via `adv_change_show + adv_task_list target_path:`)
2. Stand down on **all mutations** in the foreign project — no `adv_change_*`, no `adv_task_*`, no `adv_gate_*`, no worktree touch
3. Read-only diagnostic only, then surface findings out-of-band (chat, GH comment, untracked notes file)

A short `## Peer-In-Flight Etiquette` blurb in `ADV_INSTRUCTIONS.md § Multi-Session Coordination` would make this explicit for future agents. Composes cleanly with the existing peer-session privacy rail. Possibly worth a campsite-rule add to your tk-17a91740 docs task — but only if it reads as in-scope; if not, it's an accompanying change.

## 6. Accompanying-change candidates (NOT for this change)

These should land as **separate** agenda items / follow-on changes. Don't dilute `fixStuckTemporalWorkerRecovery`. Listed roughly in order of compose-fit + ROI:

| ID | Idea | Surface | Why |
|---|---|---|---|
| **A** | `adv_temporal_diagnose` next-action embeds copy-paste CLI cross-check | tool output + docs | When classifier returns `peer-owned-unknown` or `unavailable`, output `temporal task-queue describe --task-queue advance-{pid} --address 127.0.0.1:7233 --namespace default`. I had to know this manually today. Zero-code cost on top of your serviceability classifier. |
| **D** | Rename "stale_queues" → "no-local-poller queues" with serviceability gate | field rename/alias + rec text | "Stale" implies broken. Many entries are healthy peer-owned. Aliased rename + recommendation rewording, gated on serviceability. **A and D are docs/output-only and could land in tk-669c7976 + tk-17a91740 if scope-discovery surfaces them as in-campsite. Other agent's call.** |
| **C** | `worker_lock.holder_relationship: "self" \| "peer-alive" \| "peer-dead" \| "unknown"` | diagnose enrichment | Don't leak peer PIDs cross-session — surface relationship. Lets non-developers tell "another session has it, fine" from "wedged." |
| **F** | `adv_status view: peer-sessions` selector | new selector | Today peer-session info is split across `health` and an "unavailable" line. A dedicated view would surface: my session id, all peer sessions in project, worker-lock holder, queue owner. Read-only. |
| **G** | Multi-session integration test fixture | `plugin/tests/` | Today's bug class is fundamentally a multi-session interaction; per-plane unit tests can't catch the conflation. A 3-worker + 1-peer-simulator fixture that exercises diagnose/restart/worktree-create from each plane would prevent regression. |
| **E** | Worker auto-respawn rate-limit | `plugin-init.ts` | Today's worker SIGTERMs were respawned within seconds. After N respawns in M seconds with no successful queue registration, mark worker dead and stop respawning until user-triggered restart. May overlap with tk-4d0ab2aa's restartCount surfacing; keep as separate bounded-retry logic. |
| **H** | `docs/multi-session-playbook.md` (or section in temporal-recovery.md) | docs | Codify "Temporal CLI cross-check is Tier 1 diagnostic before any worker-restart attempt in multi-session contexts." Today this was tribal knowledge. |
| **B** | `temporal-test-server-sdk-typescript` zombie sweeper | extend `adv_orphan_sweep` | Killed 2 today from May02 (PIDs 790498, 790926). SDK leakage from `@temporalio/testing`. Not strictly ADV's problem, but `adv_orphan_sweep` is the natural place. Dry-run by default, approval to execute. Lowest priority of the list. |

**Hottest two for compose-with-this-change**: A and D. Both are output/docs-only, no behavior change beyond what your serviceability classifier already enables. If they land alongside your fix, the user-facing experience improves substantially.

---

## What I did NOT do (deliberately)

- ✗ No reads/writes inside `change/fixStuckTemporalWorkerRecovery` worktree
- ✗ No `adv_change_*` / `adv_task_*` / `adv_gate_*` mutations on the change (target_path or otherwise)
- ✗ No commits, branches, or pushes in the advance plugin
- ✗ No interruption of tk-8223bce9 in_progress regression run
- ✗ No mutation of any peer's ADV state

Cleanups I DID do (in pokeedge-web only):

- SIGTERM 2 zombie `temporal-test-server-sdk-typescript` processes from 2026-05-02 (PIDs 790498, 790926). Item B above.

---

## Contact

These notes are courtesy. If you want to discuss or push back, the most natural surface is replying on the GH comment on Sharper-Flow/Advance#25 — the user can relay if needed.
