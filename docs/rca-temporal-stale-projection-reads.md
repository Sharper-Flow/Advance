# RCA — Stale Workflow Projections and Degraded Temporal Reads

> **Status:** DRAFT — not yet an ADV change. Written from a pokeedge-web session because
> cross-project change creation into this repo is currently broken (see §7).
> Pick this up from an ADV session rooted at `/home/jon/dev/advance` and create the change.
>
> **Source:** pokeedge-web change `disableValueMetricSurfaces`, session of 2026-08-03.
> **Suggested change summary:** `Fix stale workflow state reads`
> **Suggested origin:** `discovery`, source project `pokeedge-web`, source change `disableValueMetricSurfaces`.

## 1. Summary

For the full duration of a multi-hour session, ADV's Temporal-backed read and write paths
degraded while `adv_doctor` continuously reported the system fully healthy. The degradation
silently disabled an entire agent lane, made approved contract text unreachable through the
documented tool path, recorded genuine passing test evidence as missing, and blocked a gate
against two remediations that had both been applied correctly.

None of it was visible through the diagnostic surface an operator would consult.

## 2. Observed symptoms

| # | Symptom | Evidence |
|---|---|---|
| 1 | Artifact hydration failed permanently | `adv_change_show include:{agreement,design,artifactOnly:true}` returned the index with `readable: false` and `_artifactsError: "Temporal operation exceeded 1500ms timeout"` on every attempt, including solo calls with no parallel contention |
| 2 | Briefing-packet generation failed permanently | `_briefingPacketError: "Temporal operation exceeded 8000ms timeout"` |
| 3 | Writes reported timeout but landed | `adv_task_update` returned `ToolExecutionTimeout` at 10000ms on nearly every call; re-reading always showed the mutation applied |
| 4 | Durable test evidence did not persist | `adv_run_test` returned run IDs but durable records were absent, yielding `consumer_warnings: [{kind: "verification_missing"}]` for runs that genuinely executed and passed |
| 5 | Acceptance readiness projection froze | Gate refused with `VERIFICATION_EVIDENCE_MISSING` and did not clear after either documented remediation, though both returned `success: true` |
| 6 | Worktree deletion timed out | `adv_worktree_delete` timed out at 8000ms on both dry-run and apply; cleanup completed with raw git |

### 2.1 The lane-disabling consequence of symptom 2

This one deserves separate billing because it is not merely slow — it is a **capability loss**.

The `adv-designer` lane hard-requires an authoritative BRIEFING PACKET plus an
`IMPLEMENTATION_RECEIPT` with active cycle provenance, and refuses to begin without them.
Because briefing-packet hydration could not complete, the designer lane refused every
dispatch with a packet defect:

```
packet_defect: required frontend follow-up implementation provenance is missing
```

All frontend UI work in the change had to be rerouted to `adv-engineer`. The work completed
correctly, but a degraded *read* path silently removed the specialist lane that repo law
(`AGENTS.md` UI Laws) points frontend work at. Nothing announced this; it surfaced only as a
sub-agent refusal that looked like a packet-authoring mistake.

## 3. Root cause

The acceptance-gate failure is the most diagnostic instance and was traced across three
`adv-temporal-repair` engagements.

The acceptance readiness evaluator reads a **workflow-only projection that is not persisted
in the durable change snapshot**. `adv_gate_status` surfaces this directly:

```json
"_unavailable": [
  { "scope": "gateCriteria", "reason": "workflow-only projection; not persisted in durable change snapshot" },
  { "scope": "acceptanceCriteriaProjection", "reason": "workflow-only projection; not persisted in durable change snapshot" }
]
```

That projection was computed at gate-enter, `03:59:43Z`. The clean attempt-3 report and the
typed verification disposition both landed at `04:00:19Z` — after gate-enter. Both were
present in durable state (`adv_task_show` showed attempt 3 with no `consumer_warnings`), and
both were invisible to the frozen evaluator.

### 3.1 The decisive evidence — a signal asymmetry

Within a single gate-completion sequence, two blockers behaved differently:

| Signal | Blocker | Outcome |
|---|---|---|
| `contractReviewMatrixSetSignal` via `adv_contract_review_matrix_set` | `ACCEPTANCE_REVIEW_MATRIX_MISSING` | **Cleared** between retries |
| report-submit + `adv_verification_evidence_disposition` | `VERIFICATION_EVIDENCE_MISSING` | **Did not clear**, both returned `success: true` |

Same workflow, same gate, same retry window. The contract-review-matrix path refreshes its
portion of the projection; the verification-evidence path does not. This rules out
"the signal never arrived" as a general explanation and localizes the defect to
signal→projection propagation for the verification-evidence channel.

### 3.2 Contributing factor — queue contention

`adv_doctor` reported 27+ tracked session queues active on the worker. Parallel Temporal
reads reliably contended: the same `adv_task_show` call that timed out when issued alongside
another read succeeded when issued alone. Confirmed twice.

This does not explain symptoms 1, 2 and 5 (which failed solo), but it compounded everything.

### 3.3 Why nothing caught it

`adv_doctor` reported `healthy` throughout: `server_alive`, `worker_alive`,
`queue_serviceable`, `search_attributes_ok` all true, `poisoned_workflows: []`,
`can_conclude_clean: true`.

Liveness checks do not measure read latency, projection freshness, or signal-to-projection
propagation. The only surface an operator would consult gave positive assurance while six
distinct read paths were failing.

### 3.4 Ruled out

- **Poisoned history** — `adv_wip_state` returned `poisoned_workflows: []`.
- **Phantom / lost state** — change was real, `claim_inventory.completeness: "complete"`.
- **Unhealthy worker** — `adv_doctor` healthy, and writes consistently landed.
- **Wrong `concernKey`** — schema explicitly specifies `"verification"`; that value was used.
- **Missing test evidence** — evidence existed and was durably recorded (`tr_mscp6lea_1c7946e5`, `evidenceRecording.status: "recorded"`).

## 4. Impact

- An entire agent lane (`adv-designer`) was silently disabled by a degraded read path.
- Approved contract text (AC/constraints/avoidances) was unreachable through the documented
  path, nearly forcing execution against inferred acceptance criteria. It was recovered only
  because a `documents` field on the disk snapshot happened to carry the full artifact text.
- Genuine passing test evidence was recorded as missing, then blocked a gate.
- A correctly applied remediation appeared to fail, driving a repair engagement that
  recommended an approval-gated `adv_change_reenter` the user would have had to approve.
- Every write required a defensive verification read, roughly doubling tool calls.
- `adv_doctor` gave false assurance throughout.

## 5. Proposed scope

1. **Refresh-on-signal.** Refresh or invalidate the acceptance/release readiness projection
   when verification-evidence signals land, matching the behavior
   `contractReviewMatrixSetSignal` already demonstrates.
2. **Report "latest" resolution.** Determine whether it resolves per agent-lane. If it does,
   a stale error report from a lane that never ran (the `adv-designer` attempt-1 error report
   here) can block acceptance regardless of a clean report from the lane that did the work.
   Either scope the check to lanes that produced work, or document the rule explicitly.
3. **Revisit short internal deadlines.** Failing permanently at 1500ms for artifact hydration
   is worse than taking 4000ms, especially when the fallback is "the agent cannot read the
   approved contract".
4. **Make degraded reads legible.** A caller receiving `readable: false` should be able to
   distinguish transient contention from hard failure. `adv_doctor` should report read latency
   and projection freshness, not liveness alone.
5. **Decouple lane preconditions from fallible reads.** A degraded read path must not silently
   disable an agent lane. Either decouple the `adv-designer` packet precondition, or give the
   orchestrator a supported way to construct the packet when hydration is unavailable.

## 6. Success criteria (draft)

1. A verification-evidence disposition or warning-free report submitted after gate-enter is
   reflected in readiness evaluation without re-entering the gate.
2. Artifact and briefing-packet hydration either succeed under realistic worker load or
   report a typed, actionable degraded state distinguishable from hard failure.
3. `adv_doctor` surfaces read-latency and projection-staleness signals.
4. A degraded read path cannot silently disable an agent lane.

**Non-goals:** rewriting the Temporal integration wholesale; eliminating the workflow-only
projection concept. The fix is refresh-on-signal plus legibility.

## 7. Related — cross-project change creation is broken

Filing this as a proper ADV change from the pokeedge-web session failed:

```
adv_change_create target_path:/home/jon/dev/advance
→ Failed to create target project change at /home/jon/dev/advance:
  TemporalOperationContext.projectId mismatch: context 'bdf259aa162ae192af5b18899ccdc653b085528d'
  does not belong to owner '67fe3e95bc2afb49e94cada183986fa1712e47d5'
```

The target store resolved the Advance project's ID (`bdf259aa…`) but validated it against the
**session** project's owner (`67fe3e95…` = pokeedge-web). This is a structural rejection, not a
timeout, and it is plausibly the same project-context/target-store family as the above. Worth
capturing as its own change — it is why this document exists as a file instead of an ADV change.

## 8. Provenance

- Session: pokeedge-web, change `disableValueMetricSurfaces`, 2026-08-03.
- Shipped successfully despite the degradation: PR #692, squash `de044101`, merged to `main`.
- Three `adv-temporal-repair` engagements; the third produced the projection-freeze diagnosis.
- Resolution that finally cleared the gate: re-firing
  `adv_verification_evidence_disposition` after `adv_doctor` confirmed worker health. The
  second firing propagated where the first had not — consistent with a transient propagation
  window rather than a permanent channel break.
