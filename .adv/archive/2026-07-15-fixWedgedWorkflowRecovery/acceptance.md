# Acceptance

Reviewed at: 2026-07-15T19:56:55.139Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | **Typed reset path:** An audited ADV tool can terminate only an eligible reachable-but-wedged change workflow. It records the target change, termination outcome, reason, evidence, and idempotent already-terminated state. | pass | Reviewer READY; pinned termination tool has approval, eligibility, run-pinning, and idempotency coverage. |
| SC2 | success_criterion | **Authoritative recovery path:** For an eligible acceptance or release recovery, `adv_gate_complete` can explicitly use the durable corrected projection even while a reachable wedged workflow would otherwise supply stale state. | pass | Gate recovery reads one durable snapshot after terminal workflow evidence; targeted gate tests pass. |
| SC3 | success_criterion | **Accurate diagnostics:** A reachable workflow whose query handler fails is labeled `query_failed`; `missing_workflow` is reserved for an actually absent or terminally unavailable workflow. | pass | Typed query_failed classification and mutation rejection covered by task 1 tests. |
| SC4 | success_criterion | **Fail-closed boundaries:** Unknown, unshipped, non-terminal, incomplete-prior-gate, or insufficiently evidenced reset/recovery requests make no workflow termination and no disk projection mutation. | pass | Refusal paths for incomplete, unavailable, and unshipped recovery states reviewed and tested. |
| SC5 | success_criterion | **Regression proof:** Automated tests cover reset success, idempotency, each refusal boundary, disk-authoritative success/refusal, and query-failure classification. Public schema artifacts stay generated and checked. | pass | Review focused suite 78/78; integration full suite 5445/5445; pnpm run check passed. |
| AC1 | acceptance_criterion | **AC1:** Given a reachable workflow wedged at acceptance or release, all prior gates done, shipped proof, and audit evidence, when the reset tool is invoked, then it terminates only that workflow and returns an audit result. | pass | change.workflow-terminate.test.ts 18/18 passes; focused review suite passes. |
| AC2 | acceptance_criterion | **AC2:** Given the AC1 state and a corrected durable projection, when guarded disk-authoritative recovery completes the target gate, then it computes readiness from that projection without raw Temporal CLI use. | pass | gate.test.ts coherent disk snapshot recovery test passes. |
| AC3 | acceptance_criterion | **AC3:** Given missing shipment proof, incomplete gates, missing evidence, unknown ID, or a non-terminal change, when reset or disk-authoritative recovery is requested, then ADV returns a structured refusal and performs no termination or projection write. | pass | Termination and gate recovery refusal tests pass. |
| AC4 | acceptance_criterion | **AC4:** Given a reachable workflow query failure, when a read falls back to a projection, then `_recovery.reason` is `query_failed`, not `missing_workflow`. | pass | recovery-classification and Temporal store tests pass. |
| AC5 | acceptance_criterion | **AC5:** Targeted regression tests, schema generation/check, and relevant plugin checks exit 0. | pass | pnpm run check and full suite 361 files/5445 tests pass. |
| C1 | constraint | Reuse existing typed Temporal/store boundaries; do not add a raw CLI workaround. | respected | Review found typed tool/store/Temporal adapters only; no raw CLI path. |
| C2 | constraint | Require explicit approval/evidence for destructive workflow termination. | respected | Termination requires explicit approval and non-empty audit evidence. |
| C3 | constraint | Keep recovery limited to acceptance/release and preserve prior-gate/task/readiness checks. | respected | Recovery entrypoint limits targets to acceptance/release and retains task/readiness checks. |
| C4 | constraint | Use Zod/schema-registry types for recovery-reason vocabulary; no string-only classification. | respected | query_failed is typed and rejected at mutation-authority boundaries. |
| C5 | constraint | Preserve archive-purge semantics; the new tool is a distinct active/wedged recovery surface. | respected | Archived changes remain routed to archive purge; new tool covers active wedged recovery. |
| C6 | constraint | Implementation runs in the ADV-managed change worktree. | respected | All task checkpoints were created on change/fixWedgedWorkflowRecovery worktree. |
| OOS1 | out_of_scope | General Temporal worker supervision or restart redesign. | not_applicable | No general worker supervision redesign included. |
| OOS2 | out_of_scope | Redesigning archive finalization, ops-followup semantics, or all recovery tools. | not_applicable | No archive finalization or ops-followup redesign included. |
| OOS3 | out_of_scope | Repairing existing incidents without explicit operator approval. | not_applicable | No existing incident repair executed. |

