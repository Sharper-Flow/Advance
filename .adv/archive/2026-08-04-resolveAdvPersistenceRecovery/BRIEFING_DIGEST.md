# Archive Briefing Digest

**Change ID:** resolveAdvPersistenceRecovery
**Title:** Resolve ADV persistence recovery architecture
**Status:** archived
**Generated:** 2026-08-04T20:51:46.980Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: discovery

## Archive Digest

**Status:** archived

| Gate | Status |
| --- | --- |
| proposal | done |
| discovery | done |
| design | done |
| planning | done |
| execution | done |
| acceptance | done |
| release | pending |

## Epic Context

No Epic membership

## Durable Facts

Showing 36 of 36 durable facts.

- **[unresolved_action]** required_main_agent_actions: Revise design.md Decision 2 to supply a replay-safe, Activity-backed, acknowledged signal-drain protocol satisfying C6; do not start implementation until this blocker is resolved.
- **[unresolved_action]** required_main_agent_actions: Add explicit Consequences subsections to each Key Decision, especially Decision 3.
- **[unresolved_action]** required_main_agent_actions: Correct the ADR's repository-relative source-anchor paths to plugin/src/tools/doctor.ts, plugin/src/storage/store-temporal/index.ts, and plugin/src/utils/tool-budgets.ts.
- **[unresolved_action]** required_main_agent_actions: Re-run the structural ADR review after the artifact revision.
- **[unresolved_action]** required_main_agent_actions: Leave implementation, code, and branch history alone; this decision-only change currently respects DONT1.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] A Temporal hibernation design cannot claim disk-queued signal durability from a workflow handler alone: filesystem/network writes require Activities, and completion must wait for all handler work plus an acknowledged durable queue boundary.
- **[archive_only_evidence]** verification: tests_run=oc-fresh status --repo "/home/jon/dev/advance" --json, git status --short; git log trunk..change/resolveAdvPersistenceRecovery, git log --all --oneline --grep="Archive (makeReadsDiskAuthoritative|gateMutationSuccessDisk|makeToolReadsWorkerFree|fixMultiSessionTemporalRead)"; git show --no-patch 1879fb64, Context7 query: /temporalio/sdk-typescript (continueAsNew, signal handler completion, workflow I/O restrictions) results=fail — Fresh repository (trunk, behind=0, clean). No change-branch commits. Archive commits and cited 1879fb64 verified. Source identifiers/line numbers verified under plugin/src; ADR path strings do not resolve. Temporal SDK evidence confirms nondeterministic I/O requires Activities and unfinished signal handlers can be abandoned on workflow completion. Design fails C6 drain-barrier sufficiency.
- **[unresolved_action]** required_main_agent_actions: Restore or diagnose the ADV read path; adv_change_show and adv_status timed out at the host 10-second cap, then rerun the artifact review.
- **[unresolved_action]** required_main_agent_actions: Revise the C6 completion-boundary claim to address server-accepted signals with no available handler; include explicit handler-set coverage evidence for DDC5 or a durable alternative.
- **[unresolved_action]** required_main_agent_actions: After artifact access is restored, verify exact AC1-AC5, SC1-SC3, C1-C6, DONT1-DONT4 coverage; Decision 1-3 consequences; ADR-003; new alternatives/risks; validator-result accuracy; and every cited path, especially plugin/src/tools/change-list.ts.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Temporal TypeScript signals may be server-accepted yet buffered indefinitely when no handler is installed. allHandlersFinished waits active handler executions, not buffered handler-less signals; terminal-drain arguments must state and prove handler coverage or handle this third state.
- **[archive_only_evidence]** verification: tests_run=oc-fresh status --repo '/home/jon/dev/advance' --json, git status --short, git log --oneline trunk..change/resolveAdvPersistenceRecovery, Context7 Temporal TypeScript SDK signal-handler and allHandlersFinished documentation query results=fail — Working tree was clean; git log trunk..change/resolveAdvPersistenceRecovery produced no commits, satisfying the available DONT1 implementation-free check. Source verification confirmed workflows.ts:945 operation-ledger lookup; :673-744 seeds operation_ledger across continue-as-new; :2238 awaits allHandlersFinished; recovery-classification.ts:104-145 classifies completed/not-running/not-found; and store-temporal/index.ts:364-416 performs host-side confirmed readback before best-effort disk write. Context7 SDK documentation states signals buffer indefinitely when no handler is available and client signal resolves on server acceptance, establishing the unresolved third state. Artifact reads timed out, so contract/artifact coverage verification failed.
- **[unresolved_action]** required_main_agent_actions: Revise the ADR before design approval to replace DDC6's current worker-deployment-readiness claim with an enforceable full host-emitted-signal/deployed-worker-handler parity precondition that refuses hibernation on mismatch.
- **[unresolved_action]** required_main_agent_actions: Revise Decision 2 so hibernate completion requires a confirmed durable host-side disk projection transition, not best-effort dualWriteAfterMutation.
- **[unresolved_action]** required_main_agent_actions: Correct the invalid plugin/src/tools/change-list.ts citation and add the two non-blocking clarification sentences; rerun /adv-review after the artifact update.
- **[unresolved_action]** required_main_agent_actions: Leave repository code, task state, gates, worktrees, and implementation untouched for this decision-only change.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] A deployment-readiness predicate is not evidence of signal-schema/version parity unless its typed input includes both registries, its result exposes mismatch, and the hibernation path enforces it. Do not cite a general worker-versioning gate as a Case-C signal safety proof by implication.
- **[archive_only_evidence]** verification: tests_run=git status --short && git log --oneline trunk..change/resolveAdvPersistenceRecovery, repository source inspection: plugin/src/temporal/workflows.ts:747-2245; worker-deployment-readiness.ts:25-163; store-temporal/index.ts:350-394; recovery-classification.ts:14-145; doctor.ts:72-84,358-366; Context7 /temporalio/sdk-typescript handler semantics results=pass — DONT1 verified: git status was clean and trunk..change/resolveAdvPersistenceRecovery had no commits. All cited paths resolve except plugin/src/tools/change-list.ts. The bounded artifact-only read succeeded but response transport truncated after 20,894 of 34,466 characters; reviewed all supplied Decision 1/2/3 and Case-C content. Context7 confirms signals/updates precede other activation jobs when handlers exist, signals buffer until setHandler, unhandled updates reject at activation end, and allHandlersFinished drains running handlers. Source confirms no top-level await between changeWorkflow entry/handler registrations and line 2221; cited handler-body awaits do not split registration.
- **[unresolved_action]** required_main_agent_actions: Correct the three `assertDurablePersist` source anchors in the design artifact from line 44 to line 70, then rerun this source-anchor check.
- **[unresolved_action]** required_main_agent_actions: Do not revisit ADR-002 or hibernation implementation under this change; its remaining references are intentional history/dependency context.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] When an ADR cites multiple adjacent symbols, verify each named symbol's exact line rather than accepting a nearby type or error class as an equivalent anchor.
- **[archive_only_evidence]** verification: tests_run=test -e plugin/src/storage/store-temporal/index.ts && test -e plugin/src/storage/store-temporal/disk-persist.ts && test -e plugin/src/tools/doctor.ts && test -e plugin/src/utils/tool-budgets.ts && test -e plugin/src/plugin-init.ts && test -e AGENTS.md, git show -s --format='%H%x09%s' 2ac4ceeb f0277b29 5a2e0d94 b0294359 1879fb64, git status --short && git log trunk..change/resolveAdvPersistenceRecovery --oneline results=fail — All cited paths exist. `index.ts:364,366,399,405,411` confirms D1's best-effort cache-refresh/staleness premise; `doctor.ts:72-84,358`, `tool-budgets.ts:31-32`, `plugin-init.ts:936-949`, and `AGENTS.md:7` resolve to their stated levers or proposed integration location. `disk-persist.ts:31` is DiskPersistOutcome and line 70 is assertDurablePersist; line 44 is DiskProjectionPersistError, so the three `:44` assertDurablePersist anchors fail. Archive commits 2ac4ceeb, f0277b29, 5a2e0d94, b0294359 and implementation commit 1879fb64 all resolve with the claimed changes; archive commits contain .adv/archive bundles. Git worktree is clean and trunk..change/resolveAdvPersistenceRecovery is empty. Contract coverage: SC1/SC2/SC3 met for ADR-001 and ADR-003; AC1 and AC2 substantively met; AC3 provenance verified; C1/C2/C3 and DONT1/DONT3 met. DONT2 is met: moving one independently invalidated architectural decision to a dedicated decision change is a scope correction, not per-symptom deferral. Rescope integrity otherwise passes: D2/DDC/hibernation mentions are explicitly historical or the intentional dependency pointer; the two-write-path table materially supports D1's DDC4 staleness consequence. Incident note honestly reports adv_task_show—not adv_status—as the live timeout, so it is valid supporting evidence for the broader critical-read-path defect rather than self-serving proof of a specific status-view reproduction.
- **[unresolved_action]** required_main_agent_actions: Retrieve the design artifact through an authorized bounded/range-capable ADV artifact read, then confirm the three citations, retained Decision/ADR/DDC/risk/validator/incident anchors, and the four new-text assertions before acceptance.
- **[unresolved_action]** required_main_agent_actions: Do not treat this as a code or contract blocker; no repository change is requested.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Large raw narrative artifacts can exceed adv_change_show transport output limits. A bounded artifact section/range reader is needed for independent review without violating ADV state-access policy.
- **[archive_only_evidence]** verification: tests_run=source line inspection: plugin/src/storage/store-temporal/disk-persist.ts:31,44,70, source anchor spot-checks: plugin/src/storage/store-temporal/index.ts:364,366,399,405,411; plugin/src/tools/doctor.ts:72-84,358; plugin/src/utils/tool-budgets.ts:31-32; plugin/src/plugin-init.ts, git status --short && git log trunk..change/resolveAdvPersistenceRecovery --oneline results=pass — disk-persist source confirms DiskPersistOutcome at line 31, DiskProjectionPersistError at line 44, and assertDurablePersist at line 70. All requested source anchors resolve. git status was clean and trunk..change/resolveAdvPersistenceRecovery was empty. Artifact content itself was not returned: adv_change_show artifact-only response was transport-truncated.
- **[unresolved_action]** required_main_agent_actions: Record this closing review as READY; proceed through the design-gate approval workflow before any implementation begins.
- **[archive_only_evidence]** verification: tests_run=oc-fresh status --repo "/home/jon/dev/advance" --json, git status --porcelain && git log --oneline trunk..change/resolveAdvPersistenceRecovery && git show -s --format='%H%n%s%n%ad%n' --date=short 2ac4ceeb f0277b29 5a2e0d94 b0294359 1879fb64 results=pass — Artifact read completed in full. Source confirms DiskPersistOutcome at disk-persist.ts:31, DiskProjectionPersistError at :44, and assertDurablePersist at :70. The ADR's Architecture Overview, D1 Lever, and Affected Components table use those anchors correctly; no remaining assertDurablePersist-to-:44 attribution appeared. D1/D3 each retain substantive rationale, alternatives, and consequences; ADR-001/003, ADR-002 moved pointer, DDC3/DDC4 plus moved-DDC pointer, four risks, rounds 1-6, incident note, strategy, and four archived foundations remain. Git status and trunk..change/resolveAdvPersistenceRecovery were empty; archive/implementation commits resolved to the declared changes.
- **[report_follow_up]** follow_ups: Advise /adv-clarify: status reports 1 ambiguity finding on this change — confirm it does not overlap with the C6 drain-sequencing concern raised here.
- **[report_follow_up]** follow_ups: After design-gate approval, an implementation task should add a regression test asserting adv_change_show (all include-flag variants) returns within budget during a simulated Temporal outage, closing the observed live gap.
- **[report_follow_up]** follow_ups: Consider anchoring the 'no file-backed RUNTIME (writes)' vs 'file-backed READS are acceptable' distinction as a formal spec requirement so future agents do not re-conflate it (DONT3).
- **[research_citation]** sources: Temporal TS SDK docs — signal replay: query() requires the worker to replay history to reconstruct state before executing handlers; signals are part of workflow history and replayed deterministically. Confirms hibernate signal is replay-safe (DDC1). (https://github.com/temporalio/sdk-typescript/blob/main/packages/client/src/workflow-client.ts)
- **[research_citation]** sources: Temporal TS SDK docs — continueAsNew: continueAsNew restarts workflow with carried state to prevent history-limit overflow but the workflow keeps RUNNING (resets history only). Does NOT reduce running workflow count — not a simpler alternative to hibernation for the resource-bounding objective. (https://github.com/temporalio/sdk-typescript/blob/main/contrib/strands/README.md)
- **[research_citation]** sources: Codebase — dualWriteAfterMutation: Confirmed at cited line. Post-mutation readback + dual-write to disk; classifies stale reads; skips dual-write on ambiguous/poisoned outcomes. Foundation for Decision 1. (plugin/src/storage/store-temporal/index.ts:364)
- **[research_citation]** sources.omitted: 8 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: The common thesis — disk projection is the authoritative read source; Temporal is the write-ahead log — is correct and already materially shipped (makeReadsDiskAuthoritative returns on-disk projection as source-of-truth with a typed workflow_unresponsive advisory; dualWriteAfterMutation writes to both). All three decisions are architecturally sound. (D1) read-only bypass preserves C2 (no second write surface) and does NOT violate the AGENTS.md 'no file-backed runtime' prose because that rule is scoped to RUNTIME/writes, not reads — the design is more precise than the prose. (D2) hibernation via complete-and-recreate is the structurally correct Temporal pattern for bounding running workflow COUNT: continueAsNew only bounds history size not count (Temporal docs), auto-archive is terminal, and a creation-ceiling blocks users. (D3) bounded status probe is consistent with existing worker-free read laws. External evidence confirms signals are replay-safe (query replays history including signal events), so DDC1 is achievable via the existing wf.defineSignal/setHandler infrastructure. Replay-safety and no-simpler-alternative claims hold. Deviations are MINOR: one lever citation name is wrong (pushFinding -> addNonHealthyFinding), three cited rq- requirement IDs do not exist as anchored specs, the C6 in-flight-signal drain sequencing is named as a risk but its mechanism is underspecified, and live outage evidence shows adv_change_show heavy-include reads still time out (bypass coverage should be enumerated).

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |

## Unresolved Actions

- Revise design.md Decision 2 to supply a replay-safe, Activity-backed, acknowledged signal-drain protocol satisfying C6; do not start implementation until this blocker is resolved.
- Add explicit Consequences subsections to each Key Decision, especially Decision 3.
- Correct the ADR's repository-relative source-anchor paths to plugin/src/tools/doctor.ts, plugin/src/storage/store-temporal/index.ts, and plugin/src/utils/tool-budgets.ts.
- Re-run the structural ADR review after the artifact revision.
- Leave implementation, code, and branch history alone; this decision-only change currently respects DONT1.
- Restore or diagnose the ADV read path; adv_change_show and adv_status timed out at the host 10-second cap, then rerun the artifact review.
- Revise the C6 completion-boundary claim to address server-accepted signals with no available handler; include explicit handler-set coverage evidence for DDC5 or a durable alternative.
- After artifact access is restored, verify exact AC1-AC5, SC1-SC3, C1-C6, DONT1-DONT4 coverage; Decision 1-3 consequences; ADR-003; new alternatives/risks; validator-result accuracy; and every cited path, especially plugin/src/tools/change-list.ts.
- Revise the ADR before design approval to replace DDC6's current worker-deployment-readiness claim with an enforceable full host-emitted-signal/deployed-worker-handler parity precondition that refuses hibernation on mismatch.
- Revise Decision 2 so hibernate completion requires a confirmed durable host-side disk projection transition, not best-effort dualWriteAfterMutation.
- Correct the invalid plugin/src/tools/change-list.ts citation and add the two non-blocking clarification sentences; rerun /adv-review after the artifact update.
- Leave repository code, task state, gates, worktrees, and implementation untouched for this decision-only change.
- Correct the three `assertDurablePersist` source anchors in the design artifact from line 44 to line 70, then rerun this source-anchor check.
- Do not revisit ADR-002 or hibernation implementation under this change; its remaining references are intentional history/dependency context.
- Retrieve the design artifact through an authorized bounded/range-capable ADV artifact read, then confirm the three citations, retained Decision/ADR/DDC/risk/validator/incident anchors, and the four new-text assertions before acceptance.
- Do not treat this as a code or contract blocker; no repository change is requested.
- Record this closing review as READY; proceed through the design-gate approval workflow before any implementation begins.
