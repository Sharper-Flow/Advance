# Sub-Agent Reports

> **Version:** 1.9.1
> **Updated:** 2026-08-28

## Purpose

Typed, durable ADV sub-agent report ingestion and readback. Replaces ADV worker final-message fenced JSON with Zod-validated tool-call submission, sidecar report persistence, deterministic scope-aware dedupe, and machine-readable downstream consumers.

## Requirements

### Typed tool-call report ingest

**ID:** `rq-subagentReports01` | **Priority:** **[MUST]**

ADV worker reports MUST be submitted through adv_subagent_report_submit using strict Zod-validated payloads. Version 1 supports adv-engineer, adv-reviewer, adv-designer, adv-researcher, adv-tron, adv-scanner-bundle, and orchestrator-submitted adv-verification-triage-bundle payload variants, and rejects malformed or unsupported payloads before persistence. adv-researcher payloads additionally include an Architecture Judgement object per rq-subagentReports20 with status consistency against validation.status.

**Tags:** `subagents`, `reports`, `zod`, `ingest`

#### Scenarios

**Malformed report rejected** (`rq-subagentReports01.1`)

**Given:**
- A caller submits a report missing required fields

**When:** adv_subagent_report_submit validates the payload

**Then:**
- The tool returns INVALID_REPORT
- No disk mutation is fired
- No agenda follow-up is written

**Known optimized handoff agents validate structurally** (`rq-subagentReports01.2`)

**Given:**
- A report uses agent adv-researcher, adv-tron, adv-scanner-bundle, or adv-verification-triage-bundle with its required fields

**When:** adv_subagent_report_submit runs in v1

**Then:**
- The strict payload schema validates the agent-specific object
- The report carries explicit source metadata
- The disk mutation is fired only after schema validation succeeds

**adv-designer report variant validates structurally** (`rq-subagentReports01.3`)

**Given:**
- A report uses agent adv-designer with task-scoped identity anchors and design_dimensions plus neighboring_recommendations

**When:** adv_subagent_report_submit validates the payload in v1

**Then:**
- The strict DESIGNER_REPORT schema accepts only the typed payload
- Malformed or unsupported designer payloads are rejected as INVALID_REPORT before persistence
- Missing TASK or ATTEMPT remains INVALID_REPORT instead of inferred heuristically

**Verification triage bundle validates structurally** (`rq-subagentReports01.4`)

**Given:**
- The orchestrator submits agent adv-verification-triage-bundle with scope_key verifier:<slug>
- The payload names phase local_verify or ci_check and includes targets, status, error_class, confidence, evidence_basis, findings, recommended_next_action, scope_risk, required_main_agent_actions, and follow_ups

**When:** adv_subagent_report_submit validates the payload in v1

**Then:**
- The strict verification triage bundle schema accepts only the typed payload
- Malformed triage bundles are rejected as INVALID_REPORT before persistence
- The bundle is orchestrator-submitted verification evidence, not worker-submitted authority

---

### Mutation-persisted sidecar report state

**ID:** `rq-subagentReports02` | **Priority:** **[MUST]**

Accepted reports MUST persist via subagentReportSubmittedMutation into a change-level sidecar report store. Task-scoped adv-engineer and adv-reviewer reports keep legacy task.subagent_reports[] read compatibility, but new canonical persistence MUST be scope-aware sidecar storage. The change projection MUST dedupe repeated submissions by (change_id, scope, agent, attempt) using deterministic change projection state, and MUST map task-scoped report blockers into task error_recovery without deprecated runtime update handler-based mutations. Blocker-to-error_recovery mapping MUST NOT write a record that violates the retry-budget invariant enforced on read (ErrorRecoverySchema rejects attempts.length > max_retries): retry_count MUST be clamped to max_retries, and attempts[] MUST be bounded to at most max_retries entries retaining the most recent, with each retained entry preserving its true monotonic attempt_number. The budget MUST resolve from a single shared constant so writer and reader cannot diverge. Because change projection state is re-derived by readbacking history through this reducer, a clamped reducer also restores changes whose recorded history already exceeded the budget; the clamp MUST therefore live in the reducer, not only at a tool boundary or in a schema normalizer.

**Tags:** `disk`, `mutations`, `dedupe`, `tasks`

#### Scenarios

**Duplicate report key is idempotent** (`rq-subagentReports02.1`)

**Given:**
- The sidecar already stores a report for change_id, scope, agent, and attempt

**When:** The same report is submitted again

**Then:**
- No duplicate sidecar report entry is appended
- The change projection records the key in seenReportIds if needed
- The tool response reports duplicate true

**Blockers feed error recovery** (`rq-subagentReports02.2`)

**Given:**
- A submitted engineer blocker or reviewer blocking finding exists

**When:** The change projection applies subagentReportSubmittedMutation

**Then:**
- The task error_recovery.last_error summarizes blocker location and issue
- The error_recovery attempt records the report attempt number
- No tool-layer heuristic owns persistence correctness

**Over-budget blockers stay readable** (`rq-subagentReports02.3`)

**Given:**
- A task whose error_recovery.attempts already holds max_retries entries

**When:** A further blocked sub-agent report is submitted and the change projection applies subagentReportSubmittedMutation

**Then:**
- attempts[] still holds at most max_retries entries, retaining the most recent
- retry_count equals max_retries rather than the raw report attempt number
- Each retained entry preserves its original monotonic attempt_number
- The resulting error_recovery satisfies the read-path schema, so the change stays readable and writable

**Pre-clamp history self-heals on readback** (`rq-subagentReports02.4`)

**Given:**
- An existing change projection whose recorded history contains more than max_retries subagentReportSubmitted mutations with blockers, written before the clamp shipped

**When:** A disk reducer applying the clamp readbacks that unchanged history

**Then:**
- readback completes without a inconsistent readback error
- The re-derived error_recovery satisfies the read-path schema
- The previously unreadable change becomes readable and writable without manual repair
- readback evidence alone is insufficient: command-sequence readback does not exercise the read-path schema, so both assertions are required

---

### Queryable reports and consumers

**ID:** `rq-subagentReports03` | **Priority:** **[MUST]**

adv_change_show include.subagentReports MUST return persisted sidecar report data with explicit source metadata. Legacy reports that still live on task.subagent_reports[] MUST remain readable through the same opt-in readback. Tool-layer consumers MUST retain follow_ups[] as bounded, source-attributed report metadata and surface verification cross-check warnings without rolling back an already persisted report. Follow-ups are promoted only through the typed adv_followup_promote path into an ops/enabler child change, not by consumer-side queue writes.

**Tags:** `read-surface`, `verification`, `consumers`

#### Scenarios

**Reports are queryable by change** (`rq-subagentReports03.1`)

**Given:**
- A change has one or more persisted sidecar or legacy sub-agent reports

**When:** adv_change_show is called with include.subagentReports true

**Then:**
- The response includes _subagentReports
- The response includes _subagentReportsMeta.total
- The response preserves task.subagent_reports[] only for legacy/task compatibility

**Follow-ups remain source-attributed report metadata after persistence** (`rq-subagentReports03.2`)

**Given:**
- An engineer report contains follow_ups

**When:** adv_subagent_report_submit succeeds

**Then:**
- The report signal is fired before any consumer runs
- Each follow-up is retained as source-attributed report metadata
- Consumer failures are returned as warnings

---

### No ADV worker fenced-report transport

**ID:** `rq-subagentReports04` | **Priority:** **[MUST]**

ADV worker contracts MUST instruct persisted worker lanes to call adv_subagent_report_submit before exit. Apply, review, and harden context packets MUST include ATTEMPT so the report key is stable. Legacy TaskStructuredOutput extraction remains available for non-ADV callers but MUST short-circuit for tasks that already have persisted sub-agent reports.

**Tags:** `agents`, `contracts`, `legacy`, `attempt`

#### Scenarios

**Worker contracts use tool-call transport** (`rq-subagentReports04.1`)

**Given:**
- adv-engineer or adv-reviewer is spawned by ADV

**When:** The worker completes its scope

**Then:**
- The worker builds a schema-specific report object
- The worker calls adv_subagent_report_submit with that object
- The worker does not rely on final-message fenced JSON as the ADV report transport

**Legacy extraction skips persisted report tasks** (`rq-subagentReports04.2`)

**Given:**
- A task already has task.subagent_reports[]

**When:** adv_task_checkpoint or compatible task completion sees legacy adv-output text

**Then:**
- The completion signal omits structured_output extracted from the legacy text
- Existing non-ADV structured_output behavior remains unchanged for tasks without subagent_reports

---

### Schema-aligned worker context packets

**ID:** `rq-subagentReports05` | **Priority:** **[MUST]**

ADV typed worker context packets MUST align with the strict report schemas that adv_subagent_report_submit validates. Task-scoped adv-engineer worker packets MUST include WORKING DIRECTORY, CHANGE, TASK, and ATTEMPT identity anchors. Task-scoped adv-reviewer worker packets MUST include WORKING DIRECTORY, CHANGE, TASK, PHASE, and ATTEMPT identity anchors. Task-scoped adv-designer worker packets MUST include WORKING DIRECTORY, CHANGE, TASK, and ATTEMPT identity anchors. Change-scoped adv-researcher and adv-tron worker packets MUST include WORKING DIRECTORY, CHANGE, SCOPE KEY, and ATTEMPT identity anchors. Orchestrator-submitted scanner bundle packets MUST include WORKING DIRECTORY, CHANGE, SCOPE KEY, PHASE, and ATTEMPT identity anchors. Missing schema-derived identity anchors produce malformed reports and MUST remain INVALID_REPORT. Newly-added non-identity packet anchors are warn-first during rollout: TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION. These anchors define explicit scope boundaries, completion conditions, stop conditions, and verification expectations. Out-of-scope findings use finish owned scope if safe, then report; workers stop immediately only for contract/security/release blockers. Verification commands are required when possible and workers may add relevant additional checks. Individual scanner lanes are separate non-persisted analysis workers and MUST NOT claim worker report transport or call adv_subagent_report_submit.

**Tags:** `subagents`, `packets`, `schema`, `scanners`

#### Scenarios

**Typed worker packets provide schema-derived identity** (`rq-subagentReports05.1`)

**Given:**
- ADV spawns adv-engineer, adv-reviewer, or adv-designer for implementation or remediation work

**When:** The worker builds ENGINEER_REPORT, REVIEWER_REPORT, or DESIGNER_REPORT for adv_subagent_report_submit

**Then:**
- task-scoped packets provide strict identity anchors WORKING DIRECTORY, CHANGE, TASK, and ATTEMPT
- change-scoped packets provide strict identity anchors WORKING DIRECTORY, CHANGE, SCOPE KEY, and ATTEMPT
- new non-identity anchors TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION warn first during rollout
- Missing TASK, SCOPE KEY, PHASE, or ATTEMPT is rejected as INVALID_REPORT instead of inferred heuristically

**Scanner lanes remain non-persisted** (`rq-subagentReports05.2`)

**Given:**
- ADV spawns explore scanners during review or harden

**When:** The scanner returns dimension-specific analysis JSON

**Then:**
- The scanner packet is classified as scanner, not worker
- The scanner is not instructed to call adv_subagent_report_submit
- The scanner result is consumed by the orchestrator and is not persisted directly

**Scope and stop semantics are explicit** (`rq-subagentReports05.3`)

**Given:**
- A worker packet contains scope/done/stop/verification anchors

**When:** The worker encounters an out-of-scope finding or verification need

**Then:**
- The worker uses TASK_SCOPE, IN_SCOPE, and OUT_OF_SCOPE to identify owned work
- The worker uses DONE_WHEN to decide completion
- The worker uses STOP_WHEN to stop for contract/security/release blockers
- The worker uses VERIFICATION commands when possible and may add relevant checks
- The worker should finish owned scope if safe before reporting out-of-scope actions

---

### Strict report scope model

**ID:** `rq-subagentReports06` | **Priority:** **[MUST]**

Persisted reports MUST carry structural scope metadata. Task evidence reports use scope.kind task with task_id. Optimized handoff reports use scope.kind change with a structural scope_key. The schema MUST enforce agent/scope pairing: adv-engineer and adv-designer are task-scoped only; adv-reviewer is task-scoped for remediation and change-scoped for independent review and harden summaries; adv-researcher, adv-tron, adv-scanner-bundle, and adv-verification-triage-bundle are change-scoped. Verification triage bundles use scope_key verifier:<slug>.

**Tags:** `schema`, `scope`, `structural-correctness`

#### Scenarios

**Invalid agent scope pair rejected** (`rq-subagentReports06.1`)

**Given:**
- A report pairs adv-researcher with scope.kind task, adv-engineer with scope.kind change, or adv-designer with scope.kind change

**When:** adv_subagent_report_submit validates the payload

**Then:**
- The schema rejects the report as INVALID_REPORT
- No tool-layer heuristic repairs the scope
- No workflow signal is fired
- The only adv-reviewer change-scoped reports accepted are independent review or harden summaries

**Independent reviewer reports are change-scoped** (`rq-subagentReports06.3`)

**Given:**
- ADV performs independent review or harden at the change level

**When:** An adv-reviewer report is submitted for acceptance review or release hardening

**Then:**
- The report uses scope.kind change with a structural scope_key
- The report does not require task_id
- Task-scoped adv-reviewer reports remain valid only for remediation tied to existing tasks

**Source metadata preserved** (`rq-subagentReports06.2`)

**Given:**
- A valid change-scoped report is submitted

**When:** The report is read through include.subagentReports

**Then:**
- The response includes agent, scope, workdir_used, attempt, and submitted_at source metadata
- The response identifies whether the report came from sidecar or legacy task storage
- The ordinary change/task read remains compact unless include.subagentReports is true

---

### Optimized handoff variants

**ID:** `rq-subagentReports07` | **Priority:** **[MUST]**

adv-researcher and adv-tron reports MUST persist compact optimized handoff fields instead of raw transcripts. adv-scanner-bundle reports MUST be orchestrator-submitted scanner bundle summaries; individual scanners keep no ADV tool access and cannot submit reports directly. adv-verification-triage-bundle reports MUST persist orchestrator-submitted verification triage bundle evidence for local_verify and ci_check phases; verification workers keep no ADV tool access and cannot submit reports directly.

**Tags:** `research`, `recon`, `scanner`, `handoff`, `verification`, `triage`

#### Scenarios

**Research and recon reports stay compact** (`rq-subagentReports07.1`)

**Given:**
- A researcher or tron worker returns findings

**When:** The report is submitted

**Then:**
- The payload includes evidence, assessment, blockers or open questions, and recommended next action
- Raw transcript persistence is not required
- The sidecar stores the compact handoff

**Scanner bundle isolation** (`rq-subagentReports07.2`)

**Given:**
- Review or harden scanners produce dimension-specific analysis

**When:** Scanner output is persisted

**Then:**
- Only the orchestrator-submitted scanner bundle can be persisted
- Individual scanners have no ADV tool access
- The bundle records phase and scanner_count

---

### Bounded follow-up retention

**ID:** `rq-subagentReports08` | **Priority:** **[MUST]**

Persisted report follow_ups[] MUST be retained as bounded, source-attributed report metadata. Harden MUST inspect report follow-ups and fix those that are safe, adjacent, and campsite/touched-scope applicable; non-applicable follow-ups MUST get rationale instead of silent ignore. Promotion to a durable ops/enabler child change happens only through the typed adv_followup_promote path.

**Tags:** `follow-ups`, `harden`, `campsite`

#### Scenarios

**Follow-up retention is bounded** (`rq-subagentReports08.1`)

**Given:**
- A submitted report contains more follow_ups[] than the configured bound

**When:** Report consumers process follow-ups

**Then:**
- Only the bounded number of follow-ups is retained
- Each item records report agent, scope, and attempt source metadata
- The response warns when follow-ups are truncated

**Harden inspects report follow-ups** (`rq-subagentReports08.2`)

**Given:**
- Report follow-ups exist during harden

**When:** Harden evaluates local safe fixes

**Then:**
- Safe adjacent campsite items are fixed
- Non-applicable items receive rationale
- Unrelated or unsafe work is not silently expanded into the release gate

---

### disk readback and legacy compatibility

**ID:** `rq-subagentReports09` | **Priority:** **[MUST]**

Sub-agent report persistence MUST preserve disk readback safety. Key-shape changes from legacy task_id keys to scope-aware sidecar keys MUST be versioned or compatibility-preserved. Existing adv-engineer and adv-reviewer behavior remains backward-compatible, including task/checkpoint consumers that detect legacy task.subagent_reports[].

**Tags:** `disk`, `readback`, `compatibility`, `legacy`

#### Scenarios

**Legacy report history readbacks** (`rq-subagentReports09.1`)

**Given:**
- A change projection history contains legacy task-scoped report submissions

**When:** New change projection code readbacks the history

**Then:**
- disk readback does not fail due to report key shape changes
- Legacy task-scoped reports remain queryable
- New sidecar reports use deterministic scope-aware keys

**Task/checkpoint compatibility remains intact** (`rq-subagentReports09.2`)

**Given:**
- A task has either sidecar task-scoped reports or legacy task.subagent_reports[]

**When:** Task completion and checkpoint consumers evaluate persisted reports

**Then:**
- The consumer recognizes persisted report evidence from both sources
- Existing adv-engineer and adv-reviewer report behavior stays backward-compatible
- No duplicate legacy structured_output is extracted for already-reported tasks

---

### Legacy report default normalization on readback

**ID:** `rq-subagentReports10` | **Priority:** **[MUST]**

Persisted legacy task and sidecar sub-agent reports missing fields added after initial rollout MUST be deterministically normalized at readback, projection seed, and projection boundaries before strict whole-change parsing. Missing task-scoped scope_drift defaults to null, and missing required_main_agent_actions defaults to an empty array. New adv_subagent_report_submit payload validation remains strict and MUST NOT accept those omissions as valid new ingest.

**Tags:** `legacy`, `normalization`, `readback`, `zod`

#### Scenarios

**Legacy missing report fields normalize safely** (`rq-subagentReports10.1`)

**Given:**
- A persisted task or sidecar worker report lacks scope_drift or required_main_agent_actions

**When:** ADV loads, seeds, or projects the change state

**Then:**
- scope_drift is treated as null
- required_main_agent_actions is treated as []
- The normalized change can pass strict ChangeSchema parsing

**New malformed reports remain invalid** (`rq-subagentReports10.2`)

**Given:**
- A new worker report submission omits scope_drift or required_main_agent_actions

**When:** adv_subagent_report_submit validates the payload

**Then:**
- The strict report schema rejects the payload as INVALID_REPORT
- No compatibility normalizer runs on new ingest
- No disk mutation is fired

---

### Independent review and harden structural anchors

**ID:** `rq-subagentReports11` | **Priority:** **[MUST]**

Independent adv-reviewer reports for acceptance review and release hardening MUST use a supported change-scoped structural anchor, never synthetic task IDs. Acceptance review uses scope.kind change with scope_key review:acceptance. Release hardening uses scope.kind change with scope_key harden:release. Remediation reviewer reports tied to a task remain task-scoped and MUST reference an existing ADV task ID.

**Tags:** `review`, `harden`, `scope`, `anchors`

#### Scenarios

**Acceptance reviewer report uses change scope** (`rq-subagentReports11.1`)

**Given:**
- ADV runs independent acceptance review

**When:** The reviewer persists its report

**Then:**
- The report uses scope.kind change
- The scope_key is review:acceptance
- No synthetic task IDs are created or accepted for the independent review lane

**Harden reviewer report uses change scope** (`rq-subagentReports11.2`)

**Given:**
- ADV runs release hardening

**When:** The reviewer persists its report

**Then:**
- The report uses scope.kind change
- The scope_key is harden:release
- Task-scoped reviewer reports remain reserved for remediation work tied to real tasks

---

### Invalid task anchors return actionable diagnostics

**ID:** `rq-subagentReports12` | **Priority:** **[MUST]**

Task-scoped sub-agent report submissions that reference a task outside the change MUST fail before signaling with a typed INVALID_TASK_ANCHOR diagnostic. The response MUST identify changeId, taskId, agent, attempt, valid task anchors, and guidance explaining when to use task scope, independent reviewer change scope, or non-persisted scanner lanes.

**Tags:** `diagnostics`, `task-anchor`, `tooling`

#### Scenarios

**Invalid task id is actionable** (`rq-subagentReports12.1`)

**Given:**
- A task-scoped worker report references a missing task ID

**When:** adv_subagent_report_submit validates task anchoring

**Then:**
- The tool returns INVALID_TASK_ANCHOR
- The response includes valid task IDs and titles for the change
- The response explains independent review and harden reports must use the change-scoped reviewer variant
- No workflow signal is fired

---

### Structural scope in worker prompts

**ID:** `rq-subagentReports13` | **Priority:** **[MUST]**

New ADV worker prompts, packet examples, and command contracts MUST use structural `scope` objects. String scope remains compatibility-only for legacy persisted records and legacy callers until a future removal, but it MUST NOT be promoted in new examples. Task workers use scope.kind task with task_id. Independent reviewer packets use scope.kind change with scope_key review:acceptance or harden:release.

**Tags:** `prompts`, `scope`, `compatibility`, `contracts`

#### Scenarios

**New worker examples use structural scope** (`rq-subagentReports13.1`)

**Given:**
- ADV prompt or command assets show a report payload example

**When:** The example includes report scope

**Then:**
- The example uses a structural scope object
- Task examples include kind task and task_id
- Independent review or harden examples include kind change and scope_key
- String scope is described only as compatibility-only

---

### Required Follow-Up Preservation

**ID:** `rq-subagentReports14` | **Priority:** **[MUST]**

Report ingestion MUST preserve the required-obligation classification and severity of follow-ups as typed report metadata. A follow-up tagged as required_critical MUST be promoted with elevated priority through the typed follow-up promotion path. Standard follow-ups without required classification are promoted with standard priority.

**Tags:** `subagents`, `reports`, `follow-ups`, `required-obligation`

#### Scenarios

**Required-critical follow-up promotes with elevated priority** (`rq-subagentReports14.1`)

**Given:**
- An engineer report contains a follow-up with required_critical classification

**When:** The follow-up is promoted through the typed follow-up promotion path

**Then:**
- The promoted owner records elevated priority
- The provenance preserves required_critical severity
- The source metadata preserves the original report agent and scope

**Standard follow-up promotes with standard priority** (`rq-subagentReports14.2`)

**Given:**
- An engineer report contains a follow-up without required classification

**When:** The follow-up is promoted through the typed follow-up promotion path

**Then:**
- The promoted owner records standard priority
- The provenance preserves standard severity without elevated obligation

---

### Artifact-Wide Sub-Agent State Access Policy

**ID:** `rq-subagentArtifactAccess01` | **Priority:** **[MUST]**

ADV worker prompts and command packets MUST instruct sub-agents to access ADV artifacts through ADV tools or packet-provided content, not by direct reads of external ADV state paths. The forbidden artifact list includes proposal, problem statement, agreement, design, executive summary, acceptance, change, agenda, wisdom, and conformance state files.

**Tags:** `subagents`, `artifacts`, `prompts`, `state-access`

#### Scenarios

**Design validator uses inline or tool-provided artifacts** (`rq-subagentArtifactAccess01.1`)

**Given:**
- An adv-researcher design-validation packet needs design or agreement context

**When:** The worker receives the packet and needs artifact content

**Then:**
- The packet or agent instructions direct it to inline content or adv_change_show include flags
- The worker is not instructed to dereference artifacts.*.path under external ADV state

**Direct read failure recovers through ADV tools** (`rq-subagentArtifactAccess01.2`)

**Given:**
- A worker attempts to read an external ADV state artifact path and the read fails

**When:** The worker recovers from the failed direct read

**Then:**
- It stops retrying alternate filesystem paths
- It uses the ADV tool read path or packet-provided content instead

**Worker policy covers every change artifact kind** (`rq-subagentArtifactAccess01.3`)

**Given:**
- ADV worker agent files or command packets define state-access policy

**When:** Asset tests inspect the policy text

**Then:**
- The policy covers proposal, problem statement, agreement, design, executive summary, and acceptance artifacts
- The policy also covers change, agenda, wisdom, and conformance state files

---

### Typed Follow-Up Promotion from Reports

**ID:** `rq-opsFollowPromotion01` | **Priority:** **[MUST]**

Report follow-ups and required_follow_ups MUST be promotable into durable linked ops follow-up changes with typed provenance. Promotion MUST prefer structured report sources (required_follow_ups, follow_ups, report metadata) over agenda text, MUST detect duplicate promotions from source identity, and MUST preserve obligation class, severity, and source_contract_id in the linked change. Agenda text MUST remain a readable fallback but not the authority.

**Tags:** `subagents`, `reports`, `follow-ups`, `ops-follow-up`, `promotion`, `provenance`

#### Scenarios

**Required follow-up promotes with obligation class** (`rq-opsFollowPromotion01.1`)

**Given:**
- An engineer report contains required_follow_up {text, obligation_class: required_critical, severity: critical, source_contract_id: C8}

**When:** Promotion runs

**Then:**
- A linked change is created
- The provenance records source_contract_id C8
- The ops_followup profile records obligation class and severity
- Duplicate detection uses the report source identity, not title matching

**Duplicate promotion returns existing link** (`rq-opsFollowPromotion01.2`)

**Given:**
- The same required follow-up has already been promoted

**When:** Promotion is called again with the same source artifact ID

**Then:**
- The tool returns the existing link/change without creating a duplicate
- The response references the original promotion

**Plain follow-up promotes as non-blocking** (`rq-opsFollowPromotion01.3`)

**Given:**
- A report follow_ups[] contains an advisory item

**When:** It is promoted

**Then:**
- A linked change is created
- The relationship is follows_release or cleanup_after per agent choice
- The severity is standard, not required-critical

---

### Review Packets Surface Non-Code Evidence Policies

**ID:** `rq-subagentNonCodeEvidence01` | **Priority:** **[MUST]**

ADV review and scanner worker packets MUST surface task type and evidence policy for non-code deliverables so reviewers can evaluate research, writing, design, approval, and documentation tasks against the approved contract without requiring fake TDD evidence. Persisted reviewer or scanner-bundle reports MUST preserve enough evidence summary for the orchestrator to build contract.reviewMatrix rows using the applicable evidence policy.

**Tags:** `subagents`, `review`, `non-code`, `evidence`, `contracts`

#### Scenarios

**Reviewer packet includes non-code task evidence policy** (`rq-subagentNonCodeEvidence01.1`)

**Given:**
- A change includes a research or documentation task with an evidence policy

**When:** ADV prepares an acceptance review packet

**Then:**
- The packet includes the task type
- The packet includes the task evidence policy
- The packet includes the contract items the task implements, verifies, or respects

**Review matrix can use non-code evidence policy** (`rq-subagentNonCodeEvidence01.2`)

**Given:**
- A reviewer verifies a non-code deliverable against a contract item

**When:** The orchestrator persists contract.reviewMatrix rows

**Then:**
- The row uses the applicable non-code evidence policy
- The row evidence cites the artifact, source audit, rubric review, or stakeholder acceptance proof
- Missing, failing, or unknown proof remains blocking

---

### Designer Design-Dimension Rationale

**ID:** `rq-subagentReports18` | **Priority:** **[MUST]**

DESIGNER_REPORT.design_dimensions MUST remain a strict six-dimension typed object using pass, concern, or n/a for component_correctness, semantic_html_a11y, responsive_behavior, visual_polish, site_design_consistency, and finer_details. When any dimension is concern or n/a, the report MUST include non-empty notes that explain the non-pass or non-applicable dimension. All-pass reports MAY omit notes for backward-compatible compactness. This rationale requirement MUST be enforced by schema validation before report persistence.

**Tags:** `subagents`, `adv-designer`, `reports`, `design-quality`, `zod`

#### Scenarios

**Concern without notes is rejected** (`rq-subagentReports18.1`)

**Given:**
- An adv-designer report has design_dimensions.visual_polish set to concern
- The design_dimensions object omits notes or provides blank notes

**When:** adv_subagent_report_submit validates the report

**Then:**
- The report is rejected as INVALID_REPORT
- No workflow signal is fired
- No sidecar report is persisted

**N/A without notes is rejected** (`rq-subagentReports18.2`)

**Given:**
- An adv-designer report has design_dimensions.responsive_behavior set to n/a
- The design_dimensions object omits notes or provides blank notes

**When:** adv_subagent_report_submit validates the report

**Then:**
- The report is rejected as INVALID_REPORT
- The diagnostic identifies the missing design-dimension rationale

**All-pass report remains compact** (`rq-subagentReports18.3`)

**Given:**
- An adv-designer report marks all six design dimensions pass

**When:** adv_subagent_report_submit validates the report

**Then:**
- The report is accepted even when notes is omitted
- Existing all-pass report compatibility is preserved

---

### Verification Triage Bundle Semantics

**ID:** `rq-subagentReports19` | **Priority:** **[MUST]**

adv-verification-triage-bundle MUST be an orchestrator-submitted verification triage bundle for local verification bursts and CI/check-run failures. It MUST use scope.kind change with scope_key verifier:<slug>, phase local_verify or ci_check, targets with command or ci_check identity, status pass|fail|inconclusive, error_class SEMANTIC|TRANSIENT|ENVIRONMENTAL|FATAL|UNKNOWN, confidence, evidence_basis, findings, recommended_next_action, scope_risk, optional suggested_handoff, required_main_agent_actions, optional consumer_warnings, and follow_ups. UNKNOWN is routing-only and must not write task error_recovery. route_adv_engineer is valid only when error_class is SEMANTIC, scope_risk is false, confidence is high or medium, and suggested_handoff is populated. The bundle is evidence, not authority: it MUST NOT complete gates, mutate tasks, change scope, edit code, publish final user-facing conclusions, or spawn remediation workers.

**Tags:** `subagents`, `verification`, `triage`, `ci`, `reports`, `zod`

#### Scenarios

**Local verification and CI targets are structurally represented** (`rq-subagentReports19.1`)

**Given:**
- The orchestrator submits a verification triage bundle

**When:** The bundle describes phase local_verify or ci_check

**Then:**
- local_verify targets include command identity and exit code
- ci_check targets include repo/check identity and head SHA
- Evidence is bounded and source-backed

**Triage classifications have routing-safe evidence policy** (`rq-subagentReports19.2`)

**Given:**
- A triage bundle classifies a failure

**When:** The classification is SEMANTIC, TRANSIENT, ENVIRONMENTAL, FATAL, or UNKNOWN

**Then:**
- SEMANTIC indicates deterministic failure evidence
- TRANSIENT requires rerun or infrastructure evidence
- ENVIRONMENTAL requires missing dependency, credential, service, or external-system evidence
- FATAL indicates unsafe or unrecoverable conditions
- UNKNOWN is routing-only and must not write task error_recovery

**Engineer handoff remains main-ADV owned** (`rq-subagentReports19.3`)

**Given:**
- A triage bundle recommends route_adv_engineer

**When:** The schema and orchestrator evaluate routing predicates

**Then:**
- error_class is SEMANTIC
- scope_risk is false
- confidence is high or medium
- suggested_handoff is present
- Main ADV independently validates scope before spawning adv-engineer

---

### Researcher Architecture Judgement Typed Contract

**ID:** `rq-subagentReports20` | **Priority:** **[MUST]**

New adv-researcher reports MUST include an Architecture Judgement object as durable typed report data, in addition to validation and recommendation fields. The payload MUST be a discriminated union keyed on applicability. applicable judgements MUST carry applicability applicable, a one-sentence summary, a non-empty risk string, optional tradeoffs array, required alternatives_considered array, optional spec_law_implications string, and required_validation_consistency with a single source of truth status field pass|caution|fail|unknown that matches validation.status. not_applicable judgements MUST carry applicability not_applicable and a one-sentence rationale that explains why the research has no architecture judgement dimensions. The architecture_judgement object is advisory-only: it MUST NOT complete gates, mutate tasks, change scope, or block research submission, and consumer tools MUST treat researcher fail as advisory architecture judgement with validation.status fail crosswalking to ANTI-PATTERN. The advisory-only fail verdict surfaces as architecture_judgement.risk and MUST NOT introduce a second verdict field. Legacy persisted researcher reports missing architecture_judgement MUST remain readable through adv_change_show include.subagentReports; adv_subagent_report_submit MUST NOT accept legacy-shaped submissions as new ingest.

**Tags:** `subagents`, `researcher`, `judgement`, `validation`, `verdict`, `zod`, `legacy`

#### Scenarios

**Applicable architecture judgement validates structurally** (`rq-subagentReports20.1`)

**Given:**
- A new adv-researcher report is submitted with applicability applicable

**When:** adv_subagent_report_submit validates the payload

**Then:**
- The report includes architecture_judgement.summary, risk, and required_validation_consistency
- architecture_judgement.required_validation_consistency.status matches validation.status
- alternatives_considered is present and may be empty only when none were considered
- Missing summary, risk, or mismatching status is rejected as INVALID_REPORT

**Not-applicable judgement covers docs/API/examples research** (`rq-subagentReports20.2`)

**Given:**
- A researcher reports on docs/API/examples research with no architecture judgement dimensions

**When:** adv_subagent_report_submit validates the payload

**Then:**
- The report includes architecture_judgement.applicability not_applicable
- The report includes a non-blank rationale
- Missing rationale or applicable shape mismatch is rejected as INVALID_REPORT

**Researcher fail judgement remains advisory-only** (`rq-subagentReports20.3`)

**Given:**
- An adv-researcher report carries validation.status fail and architecture_judgement.applicability applicable

**When:** The orchestrator processes the report

**Then:**
- Architecture Judgement surfaces as risk with required_validation_consistency.status fail
- No gate is auto-completed or block-listed by the researcher judgement
- User-visible labels crosswalk fail to ANTI-PATTERN via the validation.status source of truth

**Legacy researcher reports remain readable without judgement** (`rq-subagentReports20.4`)

**Given:**
- A persisted researcher report predates rq-subagentReports20 and lacks architecture_judgement

**When:** adv_change_show runs with include.subagentReports true

**Then:**
- The report is still returned with source metadata
- Missing architecture_judgement is treated as not_applicable with a normalized legacy_rationale
- adv_subagent_report_submit MUST NOT accept the legacy shape as new ingest

---

### Briefing Packets Derive from Structured Sub-Agent Report State

**ID:** `rq-subagentReports21` | **Priority:** **[MUST]**

Briefing packets MUST be generated read-only projections derived from persisted sub-agent reports and structured projection state. Lane identity anchors MUST match SUBAGENT_REPORT_FIELD_SOURCES / getSubagentReportPacketAnchors() for each supported persisted worker or bundle lane. Packet slices MUST be bounded and lane-specific; raw report bodies, raw artifacts, and raw transcripts MUST NOT be dumped into every packet. Missing structured state MUST render explicit unavailable markers or warnings instead of heuristically fabricating correctness-critical fields. Session/tool-read metadata MUST remain audit-only and MUST NOT be persisted as live briefing packet state.

**Tags:** `subagents`, `reports`, `briefing_packets`, `projection`, `anchors`

#### Scenarios

**Engineer lane anchors match task-scoped identity fields** (`rq-subagentReports21.1`)

**Given:**
- A briefing packet is requested for the engineer lane

**When:** Lane identity anchors are derived from report field sources

**Then:**
- Anchors include CHANGE, TASK, ATTEMPT, WORKING DIRECTORY
- Anchors do not include warn-first scope/done/stop/verification anchors

**Reviewer lane anchors match phase and task-scoped identity fields** (`rq-subagentReports21.2`)

**Given:**
- A briefing packet is requested for the reviewer lane

**When:** Lane identity anchors are derived from report field sources

**Then:**
- Anchors include CHANGE, TASK, PHASE, ATTEMPT, WORKING DIRECTORY

**Archive lane is not a worker lane** (`rq-subagentReports21.3`)

**Given:**
- A briefing packet is requested for the archive lane

**When:** The lane is classified

**Then:**
- The archive lane does not map to a persisted sub-agent report agent
- Archive digest anchors are deterministic and terminal-state focused

**Researcher sources render as bounded stable-order research_citation facts** (`rq-subagentReports21.4`)

**Given:**
- An adv-researcher report contains a non-empty sources array

**When:** The briefing fact classifier processes the report

**Then:**
- The first RESEARCH_CITATION_RENDER_LIMIT sources render as research_citation facts in stable report order
- Exactly one deterministic omission marker fact is rendered when sources exceed the bound
- No adoption, usage, delivery, click, or other telemetry is emitted
- research_citation facts are distinct from archive_only_evidence, unresolved_action, and transient_prompt_context

**Strict identity and warn-first context anchor boundary is pinned** (`rq-subagentReports21.5`)

**Given:**
- Packet-contract asset tests run against command/agent assets

**When:** Anchor tier membership is asserted

**Then:**
- Identity anchors (CHANGE, TASK, ATTEMPT, WORKING DIRECTORY, plus agent-specific PHASE / SCOPE KEY) remain strict
- TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION remain warn-first
- Strict and warn-first anchor sets are disjoint and the boundary is test-pinned

---

### Post-archive report persistence via disk-projection fallback

**ID:** `rq-subagentReports22` | **Priority:** **[MUST]**

When the owning change change projection is terminal (archived or closed), adv_subagent_report_submit MUST persist the report via a disk-projection fallback rather than failing with SUBMIT_PROJECTION_FAILED. Archived changes write to the archive bundle change.json subagent_reports[] (or task.subagent_reports[] for task-scoped reports); closed changes write to the active changes dir change.json. The persisted report carries a recovery_audit marker distinguishing it from mutation-persisted reports. Persistence is idempotent by report key (change_id, scope, agent, attempt). The read path needs no change — terminal projection dominance already routes archived/closed reads through the disk projection. Report consumers (follow_ups, required_follow_ups, design concerns) run after disk persistence because they operate on the persisted report projection and work post-archive. The active-change projection mutation path (rq-subagentReports02), readback normalization (rq-subagentReports09, rq-subagentReports10), and disk readback safety (rq-subagentReports09) are unchanged.

**Tags:** `disk`, `terminal`, `disk-projection`, `post-archive`, `persistence`

#### Scenarios

**Terminal change report persists via disk projection** (`rq-subagentReports22.1`)

**Given:**
- A change change projection is terminal (archived or closed)

**When:** adv_subagent_report_submit is called with a valid report

**Then:**
- The report persists to the terminal disk projection subagent_reports[] (archive bundle change.json for archived; active changes dir for closed)
- The report carries a recovery_audit marker with persisted_via indicating the projection type
- The tool returns success (not SUBMIT_PROJECTION_FAILED)
- The mutation path is not invoked

**Post-archive report is queryable without a live change projection** (`rq-subagentReports22.2`)

**Given:**
- A report was persisted via the disk-projection fallback

**When:** adv_change_show include.subagentReports reads the change

**Then:**
- The report appears in _subagentReports
- The read succeeds without a live/running change projection for the change
- The report is loaded from the terminal disk projection

**Post-archive re-submit is idempotent** (`rq-subagentReports22.3`)

**Given:**
- A report was already persisted via the disk-projection fallback

**When:** The same report key is re-submitted

**Then:**
- The tool returns duplicate true
- No duplicate entry is appended

**Consumers run after post-archive persistence** (`rq-subagentReports22.4`)

**Given:**
- A report with follow_ups is submitted for a terminal change

**When:** The disk-projection persistence succeeds

**Then:**
- follow_ups are retained as source-attributed report metadata
- required_follow_ups are retained as required-obligation report metadata
- The early-return that previously blocked consumers is replaced by the disk-projection path

**Active change projection mutation path unchanged** (`rq-subagentReports22.5`)

**Given:**
- A change change projection is active (draft, pending, or active)

**When:** adv_subagent_report_submit is called

**Then:**
- The mutation path (subagentReportSubmittedMutation) is used as before
- No disk-projection fallback is triggered
- A defensive catch routes authorized completed-change projection race errors to the fallback

**Non-terminal Change projectionNotFound recovery is authorized** (`rq-subagentReports22.6`)

**Given:**
- A change change projection is active (not archived/closed) but the mutation fails with a completed-change projection error

**When:** adv_subagent_report_submit catches the mutation failure

**Then:**
- The structural completed-change projection classifier (isChange projectionCompletedError) authorizes the disk-projection fallback
- One deduplicated, authorized disk projection is written via saveRecoveredSubagentReport
- The tool returns success and does not re-mutation the unreachable change projection

**Non-terminal mutation failure without completed-change projection evidence returns typed failure** (`rq-subagentReports22.7`)

**Given:**
- A change change projection is active and the mutation fails with an error that is NOT a completed-change projection error (e.g. transient timeout, or a benign message containing 'Change projectionNotFound' as a substring)

**When:** adv_subagent_report_submit catches the mutation failure

**Then:**
- No disk-projection fallback is triggered
- The tool returns SUBMIT_PROJECTION_FAILED with a failureRecord when task identity is available
- The transient error path is unchanged

---

### Report-derived loop-ledger sources are typed evidence, not authority

**ID:** `rq-subagentReports23` | **Priority:** **[MUST]**

adv-reviewer remediation and harden reports, adv-scanner-bundle review/harden summaries, and orchestrator-submitted adv-verification-triage-bundle (local_verify and ci_check) reports are loop-ledger sources surfaced through adv_change_show include.loopLedger. Reviewer reports map to review_remediation/harden_remediation; verification triage maps to verification_triage (local_verify) or ci_repair (ci_check, carrying ci_check source refs). These ledger entries are derived, typed evidence and MUST NOT authorize, complete, or block any task, contract item, report, or gate; they MUST NOT mutate tasks, change scope, edit code, or spawn remediation. UNKNOWN or routing-only verification triage MUST remain evidence-only: it maps to verdict inconclusive, MUST NOT write task error_recovery (re-affirming rq-subagentReports19), and MUST NOT increment the loop ledger retryFailureCount. The loop ledger is a readback projection; vector/ML similarity and autonomy/retry changes remain out of scope (AC5/AC7).

**Tags:** `subagents`, `reports`, `loop-ledger`, `projection`, `evidence`

#### Scenarios

**Reviewer and triage reports are loop sources** (`rq-subagentReports23.1`)

**Given:**
- Persisted adv-reviewer (review/harden), adv-scanner-bundle, or adv-verification-triage-bundle reports exist

**When:** adv_change_show include.loopLedger projects the change

**Then:**
- Reviewer reports produce review_remediation/harden_remediation entries
- local_verify triage produces verification_triage; ci_check triage produces ci_repair with ci_check source refs
- Entries carry producer, evaluator, attemptCount, verdict, nextAction, and sourceRefs

**UNKNOWN triage stays inconclusive and non-authoritative** (`rq-subagentReports23.2`)

**Given:**
- A verification-triage report has error_class UNKNOWN or status inconclusive

**When:** The loop ledger entry is derived

**Then:**
- The entry verdict is inconclusive
- No task error_recovery is written (re-affirming rq-subagentReports19)
- retryFailureCount is not incremented
- No task, gate, scope, code, or autonomy mutation occurs

**Ledger projection grants no authority** (`rq-subagentReports23.3`)

**Given:**
- A report-derived ledger entry has verdict pass or fail

**When:** Task, contract, report, or gate readiness is evaluated

**Then:**
- The entry does not complete, unblock, or block any task, contract item, report, or gate
- Vector/ML similarity is advisory-only and out of scope (AC5/AC7)

---

### Design-Validation Blockers Are Typed, In-Scope, and Contract-Tied

**ID:** `rq-subagentReports24` | **Priority:** **[MUST]**

For adv-researcher reports whose scope.scope_key starts with researcher:design-validation, validation.blockers MUST be a list of typed objects, never free-form strings. Each blocker MUST carry finding (non-empty string), source (typed SubagentSourceReference with label, locator, summary), contract_ids (non-empty list of strings referencing items on the change's approved contract), scope equal to the literal in_scope (out-of-scope alternatives are rejected), and in_scope_remediation (non-empty string). Out-of-scope alternatives belong only in architecture_judgement.alternatives_considered and may never appear in validation.blockers. validation.status fail is advisory-only: it surfaces architecture_judgement.risk and the in-scope remediation, but it MUST NOT auto-block or complete an ADV gate. Other gate blockers (contract compromise, security/release blocker, user-discovered CONFLICT) retain independent authority. The canonical preflight in tool-arg-preflight MUST cap nested report issues at MAX_ZOD_PREFLIGHT_ISSUES bounded rows of field-path plus message, and the plugin-side preflight (adv_subagent_report_submit) MUST short-circuit malformed input before any signal, error_recovery, or workflow mutation persists. Handler-side defense-in-depth rejects malformed blocker authority (unknown contract_ids, scope ≠ in_scope, missing fields) with INVALID_REPORT and MUST NOT mutate workflow state for purely malformed input. Legacy persisted researcher reports remain readable through adv_change_show include.subagentReports, with normalizePersistedSubagentReportState filling legacy architecture_judgement defaults.

**Tags:** `subagents`, `researcher`, `design-validation`, `blockers`, `validator_scope`, `advisory_only`, `contract`, `preflight`, `no_mutation`, `backwards_compat`

#### Scenarios

**design-validation blocker entries must be typed objects** (`rq-subagentReports24.1`)

**Given:**
- A new adv-researcher report is submitted with scope.scope_key starting with researcher:design-validation

**When:** adv_subagent_report_submit validates the report

**Then:**
- validation.blockers entries that are bare strings are rejected as INVALID_REPORT with a typed-contract-IDs-required message
- validation.blockers entries that lack finding, source, contract_ids, scope, or in_scope_remediation are rejected
- validation.blockers entries with scope other than in_scope (e.g. out_of_scope, global) are rejected

**design-validation blocker contract_ids must reference the change's approved contract** (`rq-subagentReports24.2`)

**Given:**
- A new adv-researcher report is submitted with researcher:design-validation scope and a typed blocker whose contract_ids includes any string not present in change.contract.items[].id

**When:** The handler-side preflight cross-checks blocker contract_ids against change.contract.items

**Then:**
- The handler rejects the report with INVALID_REPORT and details.unknownContractIds listing exactly the unknown ids
- No disk mutation is made
- No projection state (task error_recovery, change state) is mutated

**validation.status fail remains advisory-only and never auto-blocks gates** (`rq-subagentReports24.3`)

**Given:**
- An adv-researcher report carries validation.status fail and architecture_judgement.applicability applicable with in-scope blockers

**When:** The orchestrator (or command) processes the report

**Then:**
- Validator surfaces architecture_judgement.risk and the in-scope remediation in design notes
- The design gate is not auto-blocked; the command proceeds to /adv-prep unless an independent blocker applies (contract compromise, security/release blocker, user-discovered CONFLICT)
- User-visible legacy label ANTI-PATTERN remains advisory-only

**malformed nested report input is bounded by the canonical preflight** (`rq-subagentReports24.4`)

**Given:**
- adv_subagent_report_submit receives a malformed nested report arg (wrong types, missing nested keys, missing field paths)

**When:** The plugin-side preflight validates the report against ScopedSubagentReportSchema

**Then:**
- The response emits at most MAX_ZOD_PREFLIGHT_ISSUES (10) bounded rows of field-path + message
- The handler is never called; no signal, no error_recovery, and no workflow mutation persists
- transportArgs submitted to OpenCode tool() may be intentionally broader than canonical args (same top-level keys) so the host can admit the report object before plugin preflight enforces strict validation

**out-of-scope alternatives belong to alternatives_considered only** (`rq-subagentReports24.5`)

**Given:**
- An adv-researcher design-validation report includes a recommendation that is out of the change's approved contract scope

**When:** The orchestrator routes the report

**Then:**
- Out-of-scope alternatives appear in architecture_judgement.alternatives_considered
- They MUST NOT appear in validation.blockers
- Promoting an out-of-scope alternative to blocker authority is structurally rejected at ingestion

---

### Typed Test-Run Binding for New Worker Reports

**ID:** `rq-subagentReports25` | **Priority:** **[MUST]**

New engineer/designer verification evidence MUST bind to durable same-task test-run IDs and matching exit status. Display command text and reviewer aggregate prose are descriptive only for new evidence. Historical reports without typed-binding provenance MAY retain exact-command compatibility through an explicit legacy variant; fuzzy normalization and timestamp cutovers are forbidden.

**Tags:** `reports`, `verification`, `test-runs`, `compatibility`

#### Scenarios

**Typed run survives cosmetic command labels** (`rq-subagentReports25.1`)

**Given:**
- A new engineer or designer report references a durable same-task test run
- The displayed command label differs cosmetically

**When:** Verification evidence is evaluated

**Then:**
- The run ID and exit status establish the match
- Display command text does not control authority

**Missing or mismatched typed evidence blocks** (`rq-subagentReports25.2`)

**Given:**
- A typed report references a missing run, another task's run, or mismatched exit status

**When:** Readiness is evaluated

**Then:**
- A typed verification warning or blocker is emitted
- Reviewer aggregate prose does not satisfy the gap

**Historical compatibility is explicit** (`rq-subagentReports25.3`)

**Given:**
- A persisted historical report lacks typed-binding provenance

**When:** It is read or evaluated

**Then:**
- It normalizes to an explicit legacy variant
- Exact-command compatibility may be used
- No timestamp or fuzzy command inference is used

---
