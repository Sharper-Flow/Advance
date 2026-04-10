# Prep Readiness

> **Version:** 1.3.0
> **Updated:** 2026-04-07

## Purpose

Machine-enforced readiness checks that gate the prep phase. Answers: 'Do we have everything we need ready to make the full change?'

## Requirements

### Requirement Smell Detection

**ID:** `rq-PR001sml` | **Priority:** **[SHOULD]**

The validator must scan requirement titles and bodies in spec deltas for language patterns that indicate ambiguity, subjectivity, or unmeasurable claims. These patterns are advisory warnings — not blockers — because smell heuristics have false-positive risk.

**Tags:** `prep`, `quality`, `requirements`

#### Scenarios

**Subjective language detected as warning** (`rq-PR001sml.1`)

**Given:**
- A change delta whose requirement title contains 'easy' or 'simple' or 'nice'

**When:** runPrepReadinessChecks is called

**Then:**
- A SMELL_SUBJECTIVE warning is returned
- The gate is NOT blocked (severity is warning, not error)

**Ambiguous scope detected as warning** (`rq-PR001sml.2`)

**Given:**
- A requirement title containing 'etc' or 'and/or' or 'various'

**When:** runPrepReadinessChecks is called

**Then:**
- A SMELL_AMBIGUOUS warning is returned

**Superlative language detected as warning** (`rq-PR001sml.3`)

**Given:**
- A requirement title containing 'best' or 'fastest' or 'always'

**When:** runPrepReadinessChecks is called

**Then:**
- A SMELL_SUPERLATIVE warning is returned

**Negative phrasing detected as warning** (`rq-PR001sml.4`)

**Given:**
- A requirement title containing 'not' or 'never' or 'without'

**When:** runPrepReadinessChecks is called

**Then:**
- A SMELL_NEGATIVE warning is returned

**Totality claim detected as warning** (`rq-PR001sml.5`)

**Given:**
- A requirement title containing 'all' or 'every' or 'none'

**When:** runPrepReadinessChecks is called

**Then:**
- A SMELL_TOTALITY warning is returned

**Clean requirement produces no smell warnings** (`rq-PR001sml.6`)

**Given:**
- A requirement with a specific, measurable, positively-phrased title

**When:** runPrepReadinessChecks is called

**Then:**
- No smell warnings are returned for that requirement

**No smell checks run when change has no deltas** (`rq-PR001sml.7`)

**Given:**
- A change with tasks but no spec deltas (bug-fix scenario)

**When:** runPrepReadinessChecks is called

**Then:**
- No smell issues are emitted (nothing to check)

---

### Scenario Adequacy Enforcement

**ID:** `rq-PR002scn` | **Priority:** **[MUST]**

Requirements added via deltas must have at least one scenario defined. This is a must-level failure because requirements without any scenarios cannot be tested or validated.

**Tags:** `prep`, `quality`, `scenarios`

#### Scenarios

**Requirement with no scenarios is a must-failure** (`rq-PR002scn.1`)

**Given:**
- A change delta that adds a requirement with no scenarios array or an empty scenarios array

**When:** runPrepReadinessChecks is called

**Then:**
- A SCENARIO_MISSING issue with severity 'error' is returned
- The prep gate is blocked

**Requirement with at least one scenario passes** (`rq-PR002scn.2`)

**Given:**
- A change delta that adds a requirement with one or more scenarios

**When:** runPrepReadinessChecks is called

**Then:**
- No SCENARIO_MISSING error is returned for that requirement

**Only happy-path scenario on non-trivial requirement is a warning** (`rq-PR002scn.3`)

**Given:**
- A requirement with exactly one scenario whose title contains only 'happy path' language and the requirement body suggests error/edge conditions exist

**When:** runPrepReadinessChecks is called

**Then:**
- A SCENARIO_INADEQUATE warning is returned (advisory only)

**Bug-fix change with no deltas is not penalized** (`rq-PR002scn.4`)

**Given:**
- A change with tasks but zero spec deltas

**When:** runPrepReadinessChecks is called

**Then:**
- No SCENARIO_MISSING errors are emitted

---

### TDD Inversion Detection

**ID:** `rq-PR003tdd` | **Priority:** **[MUST]**

A task graph where a same-scope test task is blocked_by an implementation task violates the inline TDD contract. Detection uses metadata.tdd_intent first (values: inline, separate_verification, not_applicable), falling back to title-based heuristics for legacy tasks without metadata. Tasks with tdd_intent 'separate_verification' or 'not_applicable' are exempt from inversion checks.

**Tags:** `prep`, `tdd`, `task-graph`, `metadata`

#### Scenarios

**Test task blocked by impl task is a must-failure (title heuristic)** (`rq-PR003tdd.1`)

**Given:**
- A task without metadata.tdd_intent whose title matches test-task heuristics
- That task has a blocked_by dependency on another task whose title matches impl-task heuristics

**When:** runPrepReadinessChecks is called

**Then:**
- A TASK_TDD_INVERSION issue with severity 'error' is returned
- The prep gate is blocked

**Task with tdd_intent 'inline' prevents false positives on test-like titles** (`rq-PR003tdd.2`)

**Given:**
- A task with metadata.tdd_intent set to 'inline'
- The task title contains test-like language such as 'test-first' or 'spec'
- That task has a blocked_by dependency on an implementation task

**When:** runPrepReadinessChecks is called

**Then:**
- No TASK_TDD_INVERSION error is returned
- The metadata classification takes precedence over title heuristics

**Task with tdd_intent 'separate_verification' is accepted** (`rq-PR003tdd.3`)

**Given:**
- A task with metadata.tdd_intent set to 'separate_verification'
- That task has a blocked_by dependency on an implementation task

**When:** runPrepReadinessChecks is called

**Then:**
- No TASK_TDD_INVERSION error is returned

**Task with tdd_intent 'not_applicable' is exempt** (`rq-PR003tdd.4`)

**Given:**
- A task with metadata.tdd_intent set to 'not_applicable'

**When:** runPrepReadinessChecks is called

**Then:**
- No TASK_TDD_INVERSION error is returned

**Legacy tasks without metadata fall back to title heuristics** (`rq-PR003tdd.5`)

**Given:**
- A task without metadata.tdd_intent set
- The task title contains TDD-significant keywords

**When:** runPrepReadinessChecks classifies the task

**Then:**
- Title-based regex heuristics (isTestTask/isImplTask) are used for classification
- The task is checked for TDD inversion using the heuristic result

**Invalid tdd_intent values fall back to title heuristics** (`rq-PR003tdd.6`)

**Given:**
- A task with metadata.tdd_intent set to an unrecognized value (not inline, separate_verification, or not_applicable)

**When:** runPrepReadinessChecks classifies the task

**Then:**
- The invalid value is ignored
- Title-based regex heuristics are used as fallback

**Tasks with no TDD-significant keywords are not flagged** (`rq-PR003tdd.7`)

**Given:**
- Tasks about docs, chores, or releases with no test/impl naming pattern and no metadata.tdd_intent

**When:** runPrepReadinessChecks is called

**Then:**
- No TASK_TDD_INVERSION error is returned

**Orphan task warning** (`rq-PR003tdd.8`)

**Given:**
- A task with no deps and which is not a dependency of any other task

**When:** runPrepReadinessChecks is called

**Then:**
- A TASK_ORPHAN warning is returned (advisory only)

---

### Cross-Repo Routing Completeness

**ID:** `rq-PR004xrp` | **Priority:** **[MUST]**

Tasks that have one of target_repo or target_path set but not both have incomplete routing metadata. This creates ambiguity about where the task should be executed and must be flagged as a must-level failure.

**Tags:** `prep`, `cross-repo`, `routing`

#### Scenarios

**Task with target_repo but missing target_path is a must-failure** (`rq-PR004xrp.1`)

**Given:**
- A task with target_repo set but target_path absent

**When:** runPrepReadinessChecks is called

**Then:**
- A CROSS_REPO_MISSING_METADATA issue with severity 'error' is returned
- The prep gate is blocked

**Task with target_path but missing target_repo is a must-failure** (`rq-PR004xrp.2`)

**Given:**
- A task with target_path set but target_repo absent

**When:** runPrepReadinessChecks is called

**Then:**
- A CROSS_REPO_MISSING_METADATA issue with severity 'error' is returned

**Task with both fields set passes routing check** (`rq-PR004xrp.3`)

**Given:**
- A task with both target_repo and target_path set

**When:** runPrepReadinessChecks is called

**Then:**
- No CROSS_REPO_MISSING_METADATA error is returned for that task

**Task with neither field set passes routing check** (`rq-PR004xrp.4`)

**Given:**
- A task with neither target_repo nor target_path set (local task)

**When:** runPrepReadinessChecks is called

**Then:**
- No CROSS_REPO_MISSING_METADATA error is returned

**Task with repo hint in title but no routing metadata warns** (`rq-PR004xrp.5`)

**Given:**
- A task title containing '[backend]' or '~/dev/' but no target_repo/target_path

**When:** runPrepReadinessChecks is called

**Then:**
- A CROSS_REPO_HINT_UNROUTED warning is returned (advisory only)

---

### Prep Gate Readiness Enforcement

**ID:** `rq-PR005gat` | **Priority:** **[MUST]**

The adv_gate_complete tool for the prep gate must run all prep-readiness checks before marking the gate done. Must-level failures block gate completion; warnings produce advisory output but do not block.

**Tags:** `prep`, `gate`, `enforcement`

#### Scenarios

**Gate blocked when must-failures exist** (`rq-PR005gat.1`)

**Given:**
- A change with at least one prep-readiness must-failure

**When:** adv_gate_complete with gateId 'planning' is called

**Then:**
- The gate is NOT marked done
- The response includes readinessFailures array with check IDs and remediation hints
- The response has success: false or error field

**Gate succeeds with only warnings** (`rq-PR005gat.2`)

**Given:**
- A change with no must-failures but one or more warnings

**When:** adv_gate_complete with gateId 'planning' is called

**Then:**
- The gate IS marked done
- The response includes readinessWarnings array (advisory)

**Gate succeeds cleanly with no issues** (`rq-PR005gat.3`)

**Given:**
- A change that passes all prep-readiness checks with no failures and no warnings

**When:** adv_gate_complete with gateId 'planning' is called

**Then:**
- The gate IS marked done
- No readinessFailures or readinessWarnings in response

**Non-planning gates are not affected** (`rq-PR005gat.4`)

**Given:**
- adv_gate_complete called for proposal, discovery, design, execution, acceptance, or release

**When:** The gate is completed

**Then:**
- No prep-readiness checks are run; behavior is unchanged from baseline

---

### Doctor-Lite Integrity Signals for Prep and Archive

**ID:** `rq-prdoc001` | **Priority:** **[SHOULD]**

Prep and archive flows must surface lightweight integrity findings: cross-repo routing metadata gaps, JSON/SQLite cache inconsistencies, broken task-to-change references, and pending WAL checkpoint warnings.

**Tags:** `prep`, `archive`, `doctor`, `integrity`

#### Scenarios

**Prep surfaces routing metadata gaps** (`rq-prdoc001.1`)

**Given:**
- Tasks contain incomplete cross-repo routing fields

**When:** adv-prep performs readiness analysis

**Then:**
- Missing target_repo/target_path metadata is surfaced in findings

**Archive checks doctor warnings before finalization** (`rq-prdoc001.2`)

**Given:**
- adv_status reports doctor-lite findings

**When:** adv-archive pre-checks run

**Then:**
- Cache inconsistency and broken refs are treated as blockers
- Pending WAL checkpoint is surfaced as advisory warning

---

### TDD Intent Assignment at Prep Finalization

**ID:** `rq-PR006tdi` | **Priority:** **[MUST]**

During prep finalization, every non-cancelled task MUST have an explicit metadata.tdd_intent value assigned (inline | separate_verification | not_applicable). The prep gate MUST verify that all tasks have tdd_intent set and reject gate completion when any task lacks it. This ensures TDD classification decisions are made deliberately at planning time, not deferred to implementation where they may be skipped or forgotten.

**Tags:** `prep`, `tdd`, `metadata`, `gate`

#### Scenarios

**Task without tdd_intent blocks prep gate** (`rq-PR006tdi.1`)

**Given:**
- A change with at least one non-cancelled task that has no metadata.tdd_intent set

**When:** runPrepReadinessChecks is called

**Then:**
- A TASK_TDD_INTENT_MISSING issue with severity 'error' is returned
- The prep gate is blocked

**Task with valid tdd_intent passes check** (`rq-PR006tdi.2`)

**Given:**
- A change where all non-cancelled tasks have metadata.tdd_intent set to one of: inline, separate_verification, not_applicable

**When:** runPrepReadinessChecks is called

**Then:**
- No TASK_TDD_INTENT_MISSING errors are returned

**Cancelled tasks are excluded from the check** (`rq-PR006tdi.3`)

**Given:**
- A change with both cancelled and non-cancelled tasks
- Only the cancelled tasks lack metadata.tdd_intent

**When:** runPrepReadinessChecks is called

**Then:**
- No TASK_TDD_INTENT_MISSING errors are returned
- Cancelled tasks are not considered

**Feature flag advisory mode downgrades severity** (`rq-PR006tdi.4`)

**Given:**
- Project config has tdd_enforcement set to 'advisory'
- A change with a task missing metadata.tdd_intent

**When:** runPrepReadinessChecks is called

**Then:**
- A TASK_TDD_INTENT_MISSING issue with severity 'warning' is returned
- The prep gate is NOT blocked

**Feature flag off mode skips the check entirely** (`rq-PR006tdi.5`)

**Given:**
- Project config has tdd_enforcement set to 'off'
- A change with tasks missing metadata.tdd_intent

**When:** runPrepReadinessChecks is called

**Then:**
- No TASK_TDD_INTENT_MISSING issues are emitted
- The check is skipped entirely

**Invalid tdd_intent value is treated as missing** (`rq-PR006tdi.6`)

**Given:**
- A task with metadata.tdd_intent set to an unrecognized value (not inline, separate_verification, or not_applicable)

**When:** runPrepReadinessChecks is called

**Then:**
- A TASK_TDD_INTENT_MISSING error is returned for that task
- The error message indicates the invalid value

---
