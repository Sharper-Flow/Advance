# Contract Traceability

**Change ID:** resolveAdvPersistenceRecovery
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-08-04T20:47:49.788Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | adv-reviewer READY (attempt 3): Decisions 1 and 3 each retain substantive rationale, alternatives considered, and consequences; ADR-001 and ADR-003 present with context/decision/consequences. |
| SC2 | success_criterion | pass | review | adv-reviewer READY: Implementation Strategy sequences D3 then D1, both independently shippable with no dependency outside this change; each decision names its affected components and levers. |
| SC3 | success_criterion | pass | review | adv-reviewer READY: LBP Analysis establishes both decisions move ADV from 'Temporal is the system of record' to 'disk projection is the system of record; Temporal is the write-ahead log' — the shared root cause, not per-symptom patches. |
| AC1 | acceptance_criterion | pass | test | adv-reviewer READY: Decision 1 verdict is AFFIRMATIVE for a read-only out-of-band recovery surface, enumerates covered read tools, and defers limited write to an explicit follow-up recorded in agreement.md Deferred Questions and executive-summary.md. |
| AC2 | acceptance_criterion | pass | test | adv-reviewer READY: Decision 3 requires a bounded adv_status view:summary probe routed through addNonHealthyFinding (doctor.ts:358), superseding the optimistic healthy default when the critical read path fails. |
| AC3 | acceptance_criterion | pass | test | adv-reviewer independently resolved archive commits 2ac4ceeb (makeReadsDiskAuthoritative), f0277b29 (gateMutationSuccessDisk), 5a2e0d94 (makeToolReadsWorkerFree), b0294359 (fixMultiSessionTemporalRead), plus implementation commit 1879fb64, via git show -s; archive commits contain .adv/archive bundles. |
| C1 | constraint | respected | static_check | adv-reviewer READY: Decision 1 is read-only; mutations return typed RECOVERY_MODE_READ_ONLY rather than writing. No second parallel write surface is introduced; limited write is explicitly deferred. |
| C2 | constraint | respected | static_check | adv-reviewer READY: this change contains no workflow code changes at all, so replay safety is trivially preserved. The persistence-boundary invariant additionally records that workflow code may not perform filesystem or network I/O. |
| C3 | constraint | respected | static_check | Design gate completed 2026-08-04T20:21:37Z with user-approved scope reduction before any implementation. No implementation exists: git status clean, trunk..change/resolveAdvPersistenceRecovery empty. |
| DONT1 | avoidance | respected | review | adv-reviewer verified git status clean and git log trunk..change/resolveAdvPersistenceRecovery empty. adv_task_checkpoint returned status:clean at 5dfcc43 — nothing to commit. |
| DONT2 | avoidance | respected | review | adv-reviewer explicitly assessed the Decision 2 split and concluded: moving one independently invalidated architectural decision to a dedicated decision change is a scope correction, not per-symptom deferral. Both retained decisions reached AFFIRMATIVE verdicts rather than being deferred. |
| DONT3 | avoidance | respected | review | adv-reviewer READY: Decision 1 explicitly distinguishes the AGENTS.md rule's original intent (blocking legacy SQLite/file-backed mutation paths) from the read-only recovery scope it supersedes, and states no mutation path may bypass Temporal. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-80bead8588f7 |  |  |  | Superseded by tk-d51cf17b7c91. Refs targeted the pre-split contract (AC4, AC5, C4, C5, C6, DONT4); hibernation items moved to decideWorkflowHibernation and the remainder were renumbered by the re-mint. |
| tk-d51cf17b7c91 | AC1, AC2, AC3 | SC1, SC2, SC3 | C1, C2, C3, DONT1, DONT2, DONT3 |  |
