# TDD Contract

> **Version:** 1.0.0
> **Updated:** 2026-03-09

## Purpose

Canonical definition of how TDD phases integrate with the ADV task model. Inline TDD (red/green within each implementation task) is the default. Separate verification tasks are reserved for cross-cutting tests spanning multiple implementation tasks.

## Requirements

### Inline TDD as Default Model

**ID:** `rq-TDD001inl` | **Priority:** **[MUST]**

Implementation tasks MUST use inline TDD by default: the red phase (write failing test) and green phase (make it pass) happen within the same task. Proposal templates MUST NOT create separate test tasks for same-scope work. The task's tdd_phase field tracks progress through none -> red -> green -> refactor -> complete.

**Tags:** `tdd`, `task-model`, `inline`

#### Scenarios

**Implementation task uses inline TDD phases** (`rq-TDD001inl.1`)

**Given:**
- An implementation task with metadata.tdd_intent='inline' or no metadata.tdd_intent set

**When:** TDD compliance is checked

**Then:**
- The task is expected to have tdd_evidence with both red and green phases
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
- Title-based heuristics are used as fallback to determine if the task is test-relevant or implementation-relevant

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

Tasks that are not logic-bearing (documentation, configuration, chores, releases) SHOULD set metadata.tdd_intent='not_applicable' to skip TDD evidence requirements. When metadata is absent, the existing title-based heuristics (isTrivialTask patterns) determine whether TDD is required.

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

A shared task classifier MUST check metadata.tdd_intent first, then fall back to title-based heuristics for legacy tasks without metadata. The classifier is the single source of truth for determining a task's TDD intent across all validators (prep-readiness, completeness, gate checks).

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

The prep-readiness TDD inversion check MUST use the task classifier to determine task roles. A test task (by classifier) blocked_by an implementation task (by classifier) of the same scope is a TDD inversion — UNLESS the test task has metadata.tdd_intent='separate_verification'. This replaces the previous title-only detection that produced false positives.

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
