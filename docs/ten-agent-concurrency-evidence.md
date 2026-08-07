# Ten-Agent Concurrency Evidence Report

**Checked at:** 2026-08-07T06:07:18.630Z
**Method:** 10 independent Bun child processes against isolated temporary disk state and temporary git repositories.

## Result

**PASS** — disk-only concurrency clearance.

## Metrics

- Lock budget: **15000 ms**
- Lock-wait P95: **317.763 ms** (threshold: **3000 ms**, 20% of the 15s lock budget)
- Lock timeouts: **0**
- committed_unverified outcomes: **0**
- Torn/corrupt JSON or JSONL writes: **0**
- Expected records: **51**
- Surviving records: **51**

## Worktree and terminal projections

- Create results: **10** successful (1 fresh, 9 reused)
- Pending delete queued: **true**
- Startup drain complete: **true**
- Archive calls successful: **10/10**
- Archive bundle terminal: **true**
- Release projection terminal: **true**
- Archive fail-closed: **true**

## Assertions

| Assertion | Result |
|---|---|
| tenIndependentActors | PASS |
| lockWaitP95Bounded | PASS |
| zeroLockTimeouts | PASS |
| zeroCommittedUnverified | PASS |
| zeroTornWrites | PASS |
| recordsSurvive | PASS |
| createDeleteStable | PASS |
| pendingDeletePersistsAndDrains | PASS |
| archiveReleaseTerminal | PASS |
| archiveFailsClosed | PASS |

## Scope and safety

- No OpenCode sessions or background workers were created.
- XDG_DATA_HOME and ADV_WORKTREE_HOME pointed into the temporary fixture.
- Temporary projections, JSONL stores, git worktrees, and archive output were removed after verification.
