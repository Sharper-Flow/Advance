# TDD Contract

> **Version:** 1.8.0
> **Updated:** 2026-07-30

## Purpose

Canonical definition of how TDD phases integrate with the ADV task model. Inline TDD (red/green within each implementation task) is the default. Separate verification tasks are reserved for cross-cutting tests spanning multiple implementation tasks.

## Requirements

### Inline TDD as Default Model

**ID:** `rq-TDD001inl` | **Priority:** **[MUST]**

Implementation tasks MUST use inline TDD by default: the red phase (write failing test) and green phase (make it pass) happen within the same task. Proposal templates MUST NOT create separate test tasks for same-scope work. Inline TDD progress is evidenced by adv_run_test invocations and durably summarized by the final verification claim on taskCompletedSignal.

**Tags:** `tdd`, `task-model`, `inline`

#### Scenarios

**Implementation task uses inline TDD phases** (`rq-TDD001inl.1`)

**Given:**
- An implementation task with metadata.tdd_intent='inline' or no metadata.tdd_intent set

**When:** TDD compliance is checked

**Then:**
- The task uses adv_run_test outputs as inline TDD evidence; final durable claim is recorded in taskCompletedSignal.verification
- No separate test task is required for this scope

**Proposal templates do not create separate test tasks for same-scope work** (`rq-TDD001inl.2`)

**Given:**
- A proposal is generated via /adv-proposal

**When:** Step 8 task generation runs

**Then:**
- Implementation tasks include inline TDD instructions in their description
- No standalone 'Write tests for X' tasks are created for the same scope as an implementation task

**Default tdd_intent is inline when metadata is absent** (`rq-TDD001inl.3`)

**Given:**
- A task with no metadata.tdd_intent field set

**When:** The task classifier determines TDD intent

**Then:**
- The task is treated as tdd_intent='inline' for TDD compliance purposes
- Title-based heuristics are used as advisory fallback only and do not establish a structural evidence-plan compatibility boundary

---

### Separate Verification for Cross-Cutting Tests

**ID:** `rq-TDD002sep` | **Priority:** **[MUST]**

A task MAY use separate verification (metadata.tdd_intent='separate_verification') when it represents cross-cutting tests that span multiple implementation tasks, such as integration tests, E2E tests, or acceptance test suites. These tasks are legitimately blocked_by their implementation dependencies and MUST NOT be flagged as TDD inversions.

**Tags:** `tdd`, `task-model`, `cross-cutting`

#### Scenarios

**Cross-cutting test task blocked by impl tasks is not an inversion** (`rq-TDD002sep.1`)

**Given:**
- A task with metadata.tdd_intent='separate_verification'
- That task has blocked_by dependencies on implementation tasks

**When:** TDD inversion detection runs

**Then:**
- No TASK_TDD_INVERSION error is returned
- The dependency ordering is accepted as correct

**Separate verification requires explicit metadata** (`rq-TDD002sep.2`)

**Given:**
- A task that appears to be a test task based on title heuristics
- That task has blocked_by dependencies on implementation tasks
- That task has no metadata.tdd_intent set

**When:** TDD inversion detection runs

**Then:**
- A TASK_TDD_INVERSION warning or error is returned (title heuristic fallback)
- The remediation hint suggests either merging into the impl task or setting metadata.tdd_intent='separate_verification'

---

### Not-Applicable TDD Intent

**ID:** `rq-TDD003na` | **Priority:** **[SHOULD]**

Tasks that are not logic-bearing (documentation, configuration, chores, releases) SHOULD set metadata.tdd_intent='not_applicable' to skip TDD evidence requirements. When metadata is absent, the existing title-based heuristics (isTrivialTask patterns) are used as an advisory fallback to determine whether TDD is required; they do not by themselves establish a normalized evidence-plan compatibility or exempt a task from evidence requirements.

**Tags:** `tdd`, `task-model`, `trivial`

#### Scenarios

**Not-applicable task skips TDD evidence requirement** (`rq-TDD003na.1`)

**Given:**
- A task with metadata.tdd_intent='not_applicable'

**When:** TDD compliance is checked

**Then:**
- No tdd_evidence is required
- The task is not flagged for missing TDD phases

**Legacy task without metadata uses title heuristics** (`rq-TDD003na.2`)

**Given:**
- A task with no metadata.tdd_intent field
- The task title matches isTrivialTask patterns (docs, config, chore)

**When:** TDD compliance is checked

**Then:**
- The task is treated as not requiring TDD evidence (backward compatible)

---

### Task Classifier with Metadata-First Detection

**ID:** `rq-TDD004cls` | **Priority:** **[MUST]**

A shared task classifier MUST check metadata.tdd_intent first, then fall back to title-based heuristics for legacy tasks without metadata. The classifier is the single source of truth for determining a task's TDD intent across all validators (prep-readiness, completeness, gate checks). When a task carries a typed evidence_plan, the plan is the structural authority for its evidence route; the classifier's title fallback is advisory only and does not override the plan.

**Tags:** `tdd`, `classifier`, `metadata`

#### Scenarios

**Metadata takes precedence over title heuristics** (`rq-TDD004cls.1`)

**Given:**
- A task with metadata.tdd_intent='not_applicable'
- The task title contains 'test' (would match isTestTask heuristic)

**When:** The classifier determines TDD intent

**Then:**
- The metadata value 'not_applicable' is used
- The title heuristic is not consulted

**Invalid metadata value falls back to title heuristics** (`rq-TDD004cls.2`)

**Given:**
- A task with metadata.tdd_intent='invalid_value'

**When:** The classifier determines TDD intent

**Then:**
- The invalid value is ignored with a warning log
- Title-based heuristics are used as fallback

**Classifier is used by all validators** (`rq-TDD004cls.3`)

**Given:**
- The prep-readiness validator, completeness validator, and gate checks

**When:** Any of these validators need to determine a task's TDD intent

**Then:**
- They call the shared classifier rather than implementing their own detection logic
- Detection behavior is consistent across all validators

---

### TDD Inversion Detection with Metadata Awareness

**ID:** `rq-TDD005inv` | **Priority:** **[MUST]**

TDD contract owns the canonical semantics for TDD inversion and task-classifier expectations. The prep-readiness TDD inversion check MUST use the task classifier to determine task roles. A test task (by classifier) blocked_by an implementation task (by classifier) of the same scope is a TDD inversion — UNLESS the test task has metadata.tdd_intent='separate_verification'. This replaces the previous title-only detection that produced false positives. Inversion detection operates on task roles; the normalized evidence plan (rq-TDD013evp) separately determines the valid proof route for each task. Prep-readiness/rq-PR003tdd owns the planning-gate enforcement behavior and readiness failure surface.

**Tags:** `tdd`, `prep`, `inversion`, `task-graph`

#### Scenarios

**Metadata-classified test task blocked by impl task is flagged** (`rq-TDD005inv.1`)

**Given:**
- A task classified as 'test' by title heuristics (no metadata.tdd_intent set)
- That task has blocked_by dependency on a task classified as 'impl'

**When:** TDD inversion detection runs in prep-readiness

**Then:**
- A TASK_TDD_INVERSION error is returned
- Remediation suggests merging the test task into the impl task or setting metadata.tdd_intent='separate_verification'

**Separate-verification task is exempt from inversion detection** (`rq-TDD005inv.2`)

**Given:**
- A task with metadata.tdd_intent='separate_verification'
- That task has blocked_by dependency on implementation tasks

**When:** TDD inversion detection runs in prep-readiness

**Then:**
- No TASK_TDD_INVERSION error is returned

**False positive prevention for non-test tasks with test-like titles** (`rq-TDD005inv.3`)

**Given:**
- A task with metadata.tdd_intent='inline'
- The task title contains 'test' (e.g., 'Create task classifier with test-first approach')

**When:** TDD inversion detection runs in prep-readiness

**Then:**
- The task is classified as 'inline' per metadata, not as a test task
- No false-positive TASK_TDD_INVERSION error is returned

---

### Unified TDD Remediation Path

**ID:** `rq-TDD006rem` | **Priority:** **[MUST]**

When a TDD inversion is detected, the remediation MUST be: merge the test task into the implementation task as inline TDD. The 'reverse the dependency' remediation MUST NOT be offered because it creates a separate-task TDD model that contradicts the inline-first contract.

**Tags:** `tdd`, `prep`, `remediation`

#### Scenarios

**Remediation suggests merge, not dependency reversal** (`rq-TDD006rem.1`)

**Given:**
- A TASK_TDD_INVERSION error is detected

**When:** Remediation guidance is provided

**Then:**
- The primary remediation is: merge the test task into the implementation task
- An alternative is: set metadata.tdd_intent='separate_verification' if the test is genuinely cross-cutting
- 'Reverse the dependency' is NOT offered as a remediation option

---

### Primary TDD Evidence Path for Inline Work

**ID:** `rq-TDD008path` | **Priority:** **[MUST]**

For ordinary inline TDD work, the primary red/green execution path MUST use adv_run_test for both phases after test or implementation changes are made with editing tools. `adv_run_test.phase` is optional descriptive metadata (`red`, `green`, or `verify`) for traceability; it is not gate enforcement and must not complete or block task progression by itself. No separate fallback evidence tool is part of the live task surface; externally obtained evidence is folded into task verification text when needed.

**Tags:** `tdd`, `inline`, `evidence`, `workflow`

#### Scenarios

**Inline TDD uses adv_run_test as primary red and green path** (`rq-TDD008path.1`)

**Given:**
- An implementation task with metadata.tdd_intent='inline'
- The task is entering red or green phase

**When:** The ordinary TDD workflow is executed

**Then:**
- The test command is run through adv_run_test for the red phase
- The test command is run through adv_run_test for the green phase

**Primary path uses result fields for evidence semantics** (`rq-TDD008path.3`)

**Given:**
- adv_run_test records red or green phase evidence

**When:** Command result semantics are interpreted

**Then:**
- The command result is interpreted from `passed`, `classification`, and `exitCode` fields
- The optional phase field alone does not authorize gate completion, task completion, or rejection
- When lastGreenRunId is provided in taskCompletedSignal, the red→green sequence is verified by rq-TDD009seq

**Optional phase metadata remains bounded and descriptive** (`rq-TDD008path.4`)

**Given:**
- adv_run_test is invoked for inline TDD evidence

**When:** The caller supplies phase metadata

**Then:**
- Only `red`, `green`, or `verify` values are accepted
- The accepted value is returned as descriptive metadata
- The phase value is not gate enforcement
- The red→green ordering IS enforced by rq-TDD009seq when evidence refs are provided

---

### Red-Then-Green Ordering Enforcement for Inline TDD

**ID:** `rq-TDD009seq` | **Priority:** **[MUST]**

When a task with metadata.tdd_intent='inline' is completed via taskCompletedSignal carrying a lastGreenRunId reference, the workflow MUST verify that a prior testRunRecordedSignal record with phase='red' AND exitCode != 0 exists for the same taskId, ordered before a matching green record (phase='green', exitCode=0). If no valid red-then-green sequence is found, the taskCompletedSignal is rejected with TASK_ORDERING_VIOLATION. This enforcement applies only when lastGreenRunId is structurally present in the payload. Legacy tasks without lastGreenRunId are grandfathered. Tasks with tdd_intent='not_applicable' or 'separate_verification' are not subject to this check.

**Tags:** `tdd`, `inline`, `ordering`, `enforcement`

#### Scenarios

**Inline task completed without prior red run is rejected** (`rq-TDD009seq.1`)

**Given:**
- A task with metadata.tdd_intent='inline'
- taskCompletedSignal payload carries lastGreenRunId
- No prior testRunRecordedSignal with phase='red' and exitCode!=0 exists for the same taskId

**When:** applyTaskCompletedToState processes the signal

**Then:**
- TASK_ORDERING_VIOLATION is thrown
- The task status remains unchanged (not 'done')
- The rejection is recorded in signal_rejections

**Inline task completed with valid red-then-green sequence is accepted** (`rq-TDD009seq.2`)

**Given:**
- A task with metadata.tdd_intent='inline'
- A prior testRunRecordedSignal with phase='red' and exitCode!=0 exists
- A subsequent testRunRecordedSignal with phase='green' and exitCode=0 exists
- taskCompletedSignal carries lastRedRunId and lastGreenRunId matching those records

**When:** applyTaskCompletedToState processes the signal

**Then:**
- The task is marked 'done'
- No TASK_ORDERING_VIOLATION is thrown

**Legacy task without lastGreenRunId is grandfathered** (`rq-TDD009seq.3`)

**Given:**
- A task carrying legacy tdd_evidence.red and tdd_evidence.green
- taskCompletedSignal payload does NOT carry lastGreenRunId

**When:** applyTaskCompletedToState processes the signal

**Then:**
- The ordering check is skipped
- The task is marked 'done' (backward compatible)

**Non-inline tasks are exempt from ordering check** (`rq-TDD009seq.4`)

**Given:**
- A task with metadata.tdd_intent='not_applicable' or 'separate_verification'

**When:** applyTaskCompletedToState processes the signal

**Then:**
- The ordering check is skipped regardless of lastGreenRunId presence

---

### Advisory Test-Quality Signals in adv_run_test Evidence

**ID:** `rq-TDD010qual` | **Priority:** **[SHOULD]**

The adv_run_test.v1 evidence record MAY carry advisory quality signals computed by static-parsing the test file referenced by the command argument: assertionDensity (count of assertion invocations), mockSurface (detected mock API patterns with counts), and behaviorSurface ('small', 'medium', or 'large' classified by assertion count and function coverage). These signals are advisory only — surfaced to /adv-review for human attention. They MUST NOT gate task completion, gate progression, or signal acceptance. Mock detection patterns are API-qualified (vi.mock, jest.mock, sinon.stub, unittest.mock.patch, etc.) to avoid false positives on the bare 'mock' token.

**Tags:** `tdd`, `quality`, `advisory`, `evidence`

#### Scenarios

**Quality signals computed when specific test file is referenced** (`rq-TDD010qual.1`)

**Given:**
- adv_run_test is called with a command referencing a specific test file
- The test file exists and is readable

**When:** The evidence record is constructed

**Then:**
- assertionDensity is populated with the count of assertion invocations
- mockSurface is populated with detected mock API patterns and counts
- behaviorSurface is classified as 'small', 'medium', or 'large'

**Quality signals omitted for broad commands** (`rq-TDD010qual.2`)

**Given:**
- adv_run_test is called with a broad command (e.g., 'pnpm test' without a specific file)

**When:** The evidence record is constructed

**Then:**
- assertionDensity, mockSurface, and behaviorSurface are omitted
- The evidence record is still valid without these fields

**Quality signals do not gate task completion** (`rq-TDD010qual.3`)

**Given:**
- An adv_run_test evidence record with low assertionDensity or high mockSurface

**When:** Task completion or gate progression is evaluated

**Then:**
- The quality signals are advisory only
- Task completion is not blocked by quality signal values
- The signals are surfaced to /adv-review for human attention

**Mock detection uses API-qualified patterns only** (`rq-TDD010qual.4`)

**Given:**
- A test file containing the word 'mock' in comments or variable names

**When:** mockSurface is computed

**Then:**
- The bare token 'mock' is not matched
- Only API-qualified patterns (vi.mock, jest.mock, sinon.stub, unittest.mock.patch, etc.) are detected

---

### Non-Code Deliverables Use Evidence Policies Instead of Fake TDD

**ID:** `rq-TDD011nonCodeEvidence` | **Priority:** **[MUST]**

Tasks whose deliverable type is docs, research, approval, ops, or other non-code work MUST NOT be forced through fake red/green TDD. Their TDD intent may be not_applicable or separate_verification as appropriate, but task completion and acceptance MUST still require machine-readable evidence through an evidence policy such as source_citation, source_audit, rubric_review, stakeholder_acceptance, artifact_reference, static_check, review, or not_applicable with rationale. Code tasks retain inline TDD as the default.

**Tags:** `tdd`, `non-code`, `evidence`, `task-model`

#### Scenarios

**Research task skips fake red green but requires evidence** (`rq-TDD011nonCodeEvidence.1`)

**Given:**
- A task has a research deliverable type

**When:** TDD compliance and task readiness are evaluated

**Then:**
- metadata.tdd_intent may be not_applicable
- No red/green TDD evidence is required solely because the task is tracked
- A source_citation or source_audit evidence policy is required for completion/review proof

**Explicit code task still uses inline TDD** (`rq-TDD011nonCodeEvidence.2`)

**Given:**
- A task has type code or otherwise performs logic-bearing implementation

**When:** TDD compliance is evaluated

**Then:**
- Inline red/green TDD remains the default
- The non-code evidence-policy path does not exempt the task from TDD unless it is explicitly and validly reclassified

---

### Loop-ledger test_runs and retryFailureCount are derived evidence, not retry authority

**ID:** `rq-TDD012ledgerEvidence` | **Priority:** **[MUST]**

The adv_change_show loop-ledger readback (rq-loopLedger01) surfaces test_runs only as source references (kind test_run) and exposes a derived retryFailureCount. Neither is authoritative. The authoritative red/green sequence remains the testRunRecordedSignal record ordering enforced at task completion (rq-TDD009seq), and the authoritative retry/attempt accounting remains task.attempts plus task.error_recovery. test_runs MUST NOT be reinterpreted as attempt counts, and the ledger retryFailureCount MUST NOT redefine or gate the retry budget, task completion, or acceptance. This clarification does not broaden TDD enforcement; it only pins the readback as evidence.

**Tags:** `tdd`, `loop-ledger`, `evidence`, `projection`

#### Scenarios

**test_runs are evidence refs, never attempt counts** (`rq-TDD012ledgerEvidence.1`)

**Given:**
- A task has adv_run_test test_runs recorded against it

**When:** The loop ledger is projected or task completion is evaluated

**Then:**
- test_runs appear only as source refs of kind test_run in the ledger
- They are not counted as task retry attempts
- Red/green ordering authority remains testRunRecordedSignal ordering (rq-TDD009seq)

**Ledger retryFailureCount does not redefine retry authority** (`rq-TDD012ledgerEvidence.2`)

**Given:**
- The loop ledger reports a retryFailureCount for a change

**When:** Task completion, retry budget, or acceptance is evaluated

**Then:**
- retryFailureCount is treated as derived evidence only
- task.attempts and task.error_recovery remain the authoritative retry accounting
- The ledger value does not gate task completion or acceptance

---

### Normalized Task Evidence Plan

**ID:** `rq-TDD013evp` | **Priority:** **[MUST]**

Every task MUST have a normalized evidence plan that records exactly one evidence policy, one non-empty proof target, explicit compatibility provenance, and an evidence-plan version. New and materially reclassified tasks carry provenance `new` or `reclassified`; legacy in-flight tasks without plan provenance are normalized on read with compatibility `legacy`. Title, path, and test-quality heuristics are advisory only and MUST NOT determine the plan or gate completion. Behavior-critical tasks MUST NOT use `not_applicable`. A new stage-v2 non-test route for logic-bearing work requires a bounded rationale at prep; completion additionally requires a typed review_evidence_ref resolving to persisted task-scoped reviewer evidence. Caller-supplied review prose MUST NOT create reviewer authority. Historical legacy plans may retain deterministic review_conclusion compatibility.

**Tags:** `tdd`, `evidence`, `task-model`, `structural-correctness`

#### Scenarios

**New task carries one policy, proof target, and version** (`rq-TDD013evp.1`)

**Given:**
- A task is created under the normalized evidence-plan model

**When:** The task evidence plan is resolved

**Then:**
- The plan contains exactly one evidence policy
- The plan contains a non-empty proof target
- The plan provenance is `new` or `reclassified`
- The plan records its evidence-plan version

**Behavior-critical not_applicable route is rejected** (`rq-TDD013evp.2`)

**Given:**
- A task has type `code` or `verification`
- The task evidence plan uses policy `not_applicable`

**When:** The plan is validated at prep or completion

**Then:**
- The plan is rejected
- The task is directed to a proof-bearing route

**Stage-v2 non-test route separates prep and completion proof** (`rq-TDD013evp.3`)

**Given:**
- A behavior-critical stage-v2 task selects a non-test evidence policy

**When:** The plan is validated at prep

**Then:**
- A bounded rationale of at most 500 non-whitespace characters is required
- A non-empty proof target is required
- A reviewer conclusion is not required before reviewer work exists

**Completion requires reviewer-owned evidence** (`rq-TDD013evp.4`)

**Given:**
- A behavior-critical stage-v2 task uses a non-test evidence policy

**When:** Task completion is evaluated

**Then:**
- A typed review_evidence_ref resolves to persisted task-scoped reviewer evidence
- Caller-supplied prose alone does not satisfy completion
- The task remains blocked when reviewer-owned evidence is absent

**Legacy plan remains readable** (`rq-TDD013evp.5`)

**Given:**
- An in-flight task predates stage-v2 evidence plans
- The task has valid historical evidence

**When:** The task is read or completed

**Then:**
- The plan is normalized with compatibility `legacy`
- No timestamp or heuristic cutover is used
- Valid historical review_conclusion evidence remains readable

---

### Typed Evidence Policy Prevents Manufactured Test Work

**ID:** `rq-TDD014policyRoute` | **Priority:** **[MUST]**

Task deliverable type, normalized evidence policy and proof target, and explicit TDD intent MUST determine the required proof route. A valid non-test route for non-code work MUST NOT require adv_run_test, red/green phases, or a test-run ID. Task titles, generic agent instructions, and a desire for coverage are advisory and MUST NOT create a test obligation. Behavior-bearing inline code retains its existing red/green requirements; this rule does not weaken proof for that work.

**Tags:** `tdd`, `evidence-policy`, `non-code`, `agent-guidance`

#### Scenarios

**Non-code policy route does not require test runs** (`rq-TDD014policyRoute.1`)

**Given:**
- A non-code task has a valid non-test evidence policy and the policy-required proof

**When:** Task completion or acceptance evaluates its evidence

**Then:**
- No adv_run_test, red/green phase, or test-run ID is required
- The policy-required proof remains required

**Behavior-bearing inline code retains TDD** (`rq-TDD014policyRoute.2`)

**Given:**
- A behavior-bearing code task has inline TDD intent

**When:** Task completion evaluates its evidence

**Then:**
- Existing red/green ordering and proof requirements remain enforceable
- A non-test policy route is not inferred from titles or agent prose

---
