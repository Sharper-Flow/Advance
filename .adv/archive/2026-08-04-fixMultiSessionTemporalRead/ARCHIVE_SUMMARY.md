# Archive: Fix multi-session Temporal read saturation

**Change ID:** fixMultiSessionTemporalRead
**Archived:** 2026-08-04T17:37:28.054Z
**Created:** 2026-08-02T20:12:34.430Z

## Tasks Completed

- ✅ Reproduce the host-cap breach deterministically (RED)
  > Task checkpoint completed
- ✅ D1+D2: request-scoped read context across all four status views
  > Task checkpoint completed
- ✅ D3: bootstrap-vs-durable-absence discriminator for NOT_FOUND retry admission
  > Task checkpoint completed
- ✅ D4: bind the read budget to the host tool cap with a CI-enforced invariant
  > Task checkpoint completed
- ✅ D5: bound the post-status enrichment loop and remaining phases for all views
  > Task checkpoint completed
- ✅ Prove elimination, not conformance — binding verification and re-entry decision
  > Task checkpoint completed
- ✅ D6 Site 1+2: bound the status corpus fetch (PRIMARY CAUSAL FIX — summary/changes/hygiene)
  > Task checkpoint completed
- ✅ D4a Site 3: bound the health pre-ranking diskId enumeration (CAUSAL FIX — health view)
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** CANDIDATE CAUSE (unadopted, cross-session handoff 2026-08-03): the in-flight change filter admits terminal-status changes, inflating the working set. Peer session cross-checked 41 of 49 reported in-flight IDs against .adv/archive/ and found 25 with dated bundles; adv_change_workflow_terminate dryRun confirmed addReleaseNotesData and fixDurableTestEvidence as currentStatus 'archived' while listed draft/in-flight, with fixReleaseGateProjection as a correctly-discriminating control.

CORROBORATED INDEPENDENTLY in this session: adv_change_list status:'in-flight' listed fixChangeReadTimeouts and fixHealthFieldScope as draft; adv_change_show on both returned status 'archived' (fixHealthFieldScope with _source 'archive').

WHY IT MATTERS: this design records that the adv_status host-cap breach cause is NOT located, suspect surface narrowed to buildTemporalStatus (store-temporal/index.ts:1687). A phantom working set is a live candidate contributor to read pressure there. Peer saw adv_change_list hydrationStats totalIds:157, fromHydration:108, deadlineExceeded:true, omittedCount:108.

NOT ADOPTED INTO SCOPE. This agreement covers deadline/budget/degradation architecture only; working-set correctness is a different defect for a separate change. Causation unproven.

RE-ENTRY TRIGGER: if tk-4c67f765d92e lands D1-D5, passes all structural criteria, and the symptom still reproduces, the Open Risk clause returns this change to discovery. Investigate the phantom working set BEFORE building the deferred timing harness.

ALSO REPORTED, likely separate surface: MCP Tier-4 adv_status returns degraded:true, source:'disk_projection', zero active changes while 16 are open, while advertising temporal_health_ok:true.
- **[gotcha]** PRODUCTION VERIFICATION FAILED after causal fix shipped (2026-08-04T02:24Z). PR #365 merged to trunk da0344dd, built, deployed (sha256 2b8ac400 matches trunk build), OpenCode restarted. Session PID 1994752 started 22:22:45 vs deploy 22:18:02, so the new bundle IS loaded. adv_doctor healthy, no PLUGIN_BUNDLE_STALE. Yet adv_status view:'summary' STILL returns ToolExecutionTimeout at 10000ms.

This is the agreement Open Risk clause firing: fixture-green does not equal production-fixed.

PRIME SUSPECT: D5, task tk-0a6c9ab3707e, deliberately deferred when scope was cut to ship the causal fix. status.ts:458-473 post-status enrichment loop remains unbounded for summary/changes/hygiene; its cutoff guard at :429-431 is gated on view==='health'. We fixed the STORE layer (D6 corpus load, D4a ranking, D1/D2 deadline threading) but this TOOL-layer loop runs AFTER store.status() returns and nothing shipped bounds it.

WHY THE 6/6 GREEN FIXTURE MISSED IT: status-host-cap.test.ts injects delays at store/probe boundaries, which are UPSTREAM of the enrichment loop. Tests can be honestly green while production breaches. This is the same false-green shape the design validator caught in status-health-integration-blockers.test.ts (20-candidate seed + mocked ranking), one layer up. Any D5 test must inject cost INSIDE the enrichment loop.

SECOND FINDING: two OpenCode sessions from 20:03 and 20:13 still running on the OLD bundle, each with its own Temporal worker, still parsing 484 archive bundles per status call. Real added load on the same host until restarted. adv_doctor also reports 38 tracked orphan queues, 0 adopted.

RESUME: finish tk-0a6c9ab3707e (D5), re-measure adv_status on all four views. If it still breaches with every identified unbounded path eliminated, re-enter design and build the deferred timing harness.
