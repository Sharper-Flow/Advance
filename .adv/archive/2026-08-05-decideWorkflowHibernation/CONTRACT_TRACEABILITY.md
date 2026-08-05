# Contract Traceability

**Change ID:** decideWorkflowHibernation
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-08-05T04:36:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | adv-reviewer attempt 2 (design v4, amended contract) verified ADR-002 and DEC-1..DEC-5 each carry rationale, alternatives and consequences. Attempt 1 had found DEC-5 lacked alternatives; restored in v4 with four (mitigation-only framing, defer entirely, fail loudly instead of logging, ship hibernation first). |
| SC2 | success_criterion | pass | review | Verdict rests on five architectural arguments (P40 correctly applied; epics have no terminal path; retention reclaims only closed workflows; Temporal's deletion-signal guidance matches DEC-2; both preconditions solved). Cost is explicitly stated as not load-bearing. Attempt 3 confirmed the struck entity-workflow claim does not reappear doing justificatory work anywhere, including the design tail. |
| SC3 | success_criterion | pass | review | Nine overturned assumptions recorded, each with an evidence anchor. Assumptions 4, 6 and 9 were introduced by this change's own drafts rather than the proposal, which is why SC3 was broadened at discovery re-entry to 'discovery or later review'. |
| AC1 | acceptance_criterion | pass | test | ADR records the 'no running-worker identity report exists' assertion as refuted (Overturned Assumption 1) and names bundle-generation parity with all three required anchors: worker-bundle-manifest.ts:29, worker-heartbeat.ts:99-117, worker-roll.ts:133-216. Attempt 1 independently re-verified those citations against source. |
| AC2 | acceptance_criterion | pass | test | DEC-2 records self-completion by signal as the resolution, and records external cancel as unusable because RequestCancelWorkflowExecution returns OK against an already-completed workflow (temporalio/temporal#2860), plus external terminate as wrong because no Workflow Task is scheduled so no cleanup runs. |
| AC3 | acceptance_criterion | pass | test | Ruled SATISFIED by adv-reviewer attempt 2 on all three sub-conditions independently: (a) verdict's stated basis is architectural shape; (b) the figures are recorded as invalid for steady-state reasoning; (c) the omitted variable is NAMED, not implied — a manual cleanup pass performed immediately before sampling, including ~74 change closures. |
| AC4 | acceptance_criterion | pass | test | DEC-3 covers epics under the same verdict AND records the absent routine close path as a distinct finding (40 running, zero ever closed; completion machinery exists at workflows.ts:2494-2522 but nothing drives it). Both halves present. |
| AC5 | acceptance_criterion | pass | test | DEC-4 separates established fact (scanner healthy; worker.historyScannerEnabled defaults true per common/dynamicconfig/constants.go:3372-3376; ADV only terminates, zero delete/reset call sites) from unestablished mechanism, states the latter unresolved, and records the ~50x population discrepancy as the reason neither number is adopted. |
| AC6 | acceptance_criterion | pass | test | DEC-5 states both halves required by the amended wording: the work's value does not depend on the verdict (the hazard is pre-existing on paths ADV already runs), AND the affirmative verdict creates a ship-first ordering constraint because hibernation increases completion events, which is when buffered signals are lost. |
| AC7 | acceptance_criterion | pass | test | ~/.config/opencode/skills/agent-temporal-lifecycle/SKILL.md exists (24486 bytes). Mechanically verified exhaustively, not sampled: 8/8 F-facts carry a source URL, 6/6 A-anchors carry an appropriate anchor, all 16 body URLs appear in the grouped source index, frontmatter parses as valid YAML. Extended this cycle with the entity-workflow lifetime findings, both quotes verified verbatim by fetching docs.temporal.io/design-patterns/entity-workflow directly. |
| C1 | constraint | respected | static_check | git diff trunk...HEAD is empty; worktree clean; zero commits ahead of trunk. No implementation of hibernation, orphan reclamation or setDefaultSignalHandler. Deliverables are the ADR (Temporal artifact) and the skill (global config, outside the repo). |
| C2 | constraint | respected | static_check | No code changed, so no defineUpdate could be introduced. Design validator separately confirmed no conflict with rq-changeWorkflowSignalOnly01, since DEC-2's mechanism is a signal. |
| C3 | constraint | respected | static_check | DEC-4 states the orphan mechanism as not established and adopts neither disputed population number. All Temporal and SQLite operations during this change were reads or a single scoped repair signal; no destructive command was run against live state. |
| C4 | constraint | respected | static_check | Design gate completed 2026-08-05T04:26:19Z with approval evidence recorded, before any downstream implementation. addWorkflowHibernation was created as a record only; no implementation has begun. |
| DONT1 | avoidance | respected | review | No ruled-out mechanism was re-argued. The ruled-out set (in-workflow durable signal queue, continueAsNew as count-bounding, auto-archive, creation ceiling, shared workflow, lazy-spawn, evaluateWorkerDeploymentReadiness, dualWriteAfterMutation as durability basis, verifyDeployedBuildIdentity alone) does not reappear as justification. Verified by adv-reviewer attempts 2 and 3. |
| DONT2 | avoidance | respected | review | Four DONT2 violations occurred during authoring and all four were caught and corrected rather than shipped: Assumptions 1, 4, 6 and 9. Each is recorded in the Overturned Assumptions table with its refuting anchor. Attempt 3 swept the previously-unread design tail and found no new instance. |
| DONT3 | avoidance | respected | review | The decision is made and recorded, not deferred. Downstream records are its named consequences with an explicit ordering constraint (rq-hib04 ships before hibernation), not tickets substituting for a verdict. The user separately reviewed the earlier reflexive change-creation and judged the three follow-ups warranted on their merits. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Read-path 8s deadline (retry-wrapper.ts:203) not addressed; owned by fixHealthViewTimeoutHealth, fixChangeReadTimeouts, fixTemporalReadDiagnosis. Recorded in the design as Overturned Assumption 5 to prevent it being misread as workflow-count pressure. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Worker process memory (~3 GB across 3 workers) not addressed. Distinct resource with no workflow-lifecycle interaction. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Per-session task-queue accumulation not addressed; already solved by four terminal changes. Cited in the design only as precedent that ADV solves this pattern class by automatic reaping. |
| OOS4 | out_of_scope | not_applicable | not_applicable | No orphan reclamation implemented. DEC-4 explicitly defers it until the mechanism is established, per P40, and routes the investigation to investigateOrphanWorkflow with DDC4 as its opening obligation. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-47703010effc | AC7 |  | C1, C3, DONT2 |  |
| tk-f7fcf367f261 |  | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, AC6, AC7 | C2, C4, DONT1 |  |
| tk-3eca1b40f863 |  |  | DONT3, C1, OOS4, OOS3 |  |
| tk-04c0f09c81f9 |  | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, AC6 | C1, C2, C3, C4, DONT1, DONT2 |  |
| tk-637261eee2b3 | AC7 |  | C1, DONT2 |  |
| tk-d1b0182ff0c2 |  |  | C1, DONT3, OOS4, OOS3 |  |
