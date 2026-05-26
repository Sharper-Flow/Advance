# Proposal: Fix subagent report contracts

## Why

ADV sub-agent report handling has contract drift across schemas, persisted state, tool validation, and agent prompt packets. Older persisted reports can fail current read schemas, while acceptance-stage reviewer packets can instruct workers to submit reports against synthetic task IDs that `adv_subagent_report_submit` rejects by design. The result is confusing for both workers and orchestrators: code review can complete, but durable report submission/readback breaks at the ADV state boundary.

## What Changes

- Restore backward-compatible readback for legacy persisted sub-agent reports missing newly required fields.
- Clarify and enforce the valid anchoring model for `adv-reviewer`, `adv-engineer`, and `adv-designer` persisted reports.
- Align acceptance/review worker packet contracts with the report schemas and submit tool behavior.
- Improve diagnostics when a report uses a non-existent task anchor.
- Resolve schema/prompt/spec drift around report `scope` shape, including whether string scope remains compatibility-only or prompts move to structural scope.
- Add regression tests covering stale report readback, invalid synthetic task IDs, and schema/prompt/spec contract alignment.

## Success Criteria

- `adv_change_show` and `adv_gate_status` do not fail solely because legacy task `subagent_reports` omit `scope_drift` or `required_main_agent_actions`; missing legacy values normalize to safe defaults.
- `adv_subagent_report_submit` preserves strict validation for new submissions and still rejects malformed reports before persistence.
- Reviewer/engineer/designer report submission uses a supported real task anchor, or a deliberate new change-scoped/acceptance-review mechanism is specified and implemented.
- Acceptance-stage reviewer packets cannot generate unsupported synthetic task IDs without an explicit supported persistence path.
- Invalid task anchors return a clear, actionable diagnostic that tells the caller whether a real task ID, change-scoped report, or non-persisted scanner lane is expected.
- Schema, command packet docs, agent prompts, and `.adv/specs/subagent-reports/spec.json` agree on `scope` shape and agent/scope pairing.
- Tests cover legacy report normalization, task-scoped submit failures, accepted task-scoped reports, and prompt/schema contract assets.

## Scope

### In Scope

- Sub-agent report schemas and compatibility normalization for legacy persisted records.
- `adv_subagent_report_submit` validation, error messages, and task-anchor handling.
- Read paths that parse/query changes containing legacy `task.subagent_reports[]` and sidecar reports.
- `adv-reviewer`, `adv-engineer`, and `adv-designer` packet/prompt contracts where they map packet anchors into report payloads.
- Acceptance/review command contracts where reviewer reports are spawned or persisted.
- `subagent-reports` capability spec deltas and tests/assets that enforce schema/prompt/tool alignment.

### Out of Scope

- Broad rewrite of ADV delegation or sub-agent architecture.
- Changing task completion semantics owned by `fixTaskCompletion`.
- Changing the seven-gate lifecycle.
- Migrating or manually editing external ADV state files as the normal fix path.
- Adding new sub-agent types or report variants unrelated to this bug.
- Changing non-ADV scanner lanes unless needed to clarify that they must not call `adv_subagent_report_submit`.

### Must Not

- Must not weaken strict validation for new malformed report submissions.
- Must not infer missing identity anchors heuristically for new reports.
- Must not require manual ADV state-file edits to recover ordinary readback.
- Must not persist reviewer reports against synthetic task IDs unless a structural supported anchor model is added.
- Must not make legacy compatibility hide genuine invalid new report payloads.

## Affected Code

Likely affected paths:

- `plugin/src/types/subagent-reports.ts`
- `plugin/src/types/tasks.ts`
- `plugin/src/types/changes.ts`
- `plugin/src/tools/subagent-report.ts`
- `plugin/src/tools/change.ts`
- `plugin/src/storage/json.ts`
- `plugin/src/storage/store-temporal/tasks.ts`
- `plugin/src/temporal/change-state.ts`
- `.opencode/agents/adv-reviewer.md`
- `.opencode/agents/adv-engineer.md`
- `.opencode/agents/adv-designer.md`
- `.opencode/command/adv-review.md`
- `.opencode/command/adv-harden.md`
- `.adv/specs/subagent-reports/spec.json`
- related tests under `plugin/src/types/*`, `plugin/src/tools/*`, and asset/spec consistency tests

## Related Repositories

- Current repo only: `advance`.
- No product-linked `project.json.product` context is configured.

## Constraints

- Specs are law; update `subagent-reports` requirements where current behavior or intended new behavior changes.
- Preserve Temporal replay safety and legacy compatibility (`rq-subagentReports09`).
- Preserve strict Zod validation for new payloads (`rq-subagentReports01`).
- Preserve structural correctness: normalization must be explicit, deterministic, and tested.
- Do not solve unrelated task completion overlap covered by `fixTaskCompletion`.

## Impact

- Restores reliable ADV readback for changes containing older sub-agent report records.
- Prevents acceptance/review workers from being sent impossible report-submit instructions.
- Improves diagnostics and reduces repeated failed submissions.
- Aligns specs, schemas, prompts, and tests so future report-contract changes stay synchronized.

## Context

Triage evidence from the reported session:

- `adv_change_show` and `adv_gate_status` failed schema validation for old `subagent_reports` missing `scope_drift` and `required_main_agent_actions`.
- `adv_task_list` could still read tasks because it queries task state without full `ChangeSchema` parsing.
- `adv_subagent_report_submit` rejected `task_id: "acceptance-review-fixSetPriceSorting"` with `Task not found`, because reviewer reports are currently task-scoped and must reference an existing task.
- Code currently accepts reviewer `scope` as a string for compatibility, while `subagent-reports` spec requires structural scope metadata.
- Active change `fixTaskCompletion` is adjacent but targets task completion ownership, not sub-agent report readback and reviewer packet anchoring.

## Discovery Findings

### Discovery Checklist

| Step | Status | Result |
|---|---|---|
| Skill Discovery | PASS | Loaded `adv-agent-tool-contracts`; no new skill needed. |
| Prior Research Extension | PASS | `docs/repo-improve-prep.md` exists but targets ADV tool latency, not sub-agent report contracts; new finding: its status/read-path latency recommendations may affect broad readback validation but not the contract root cause. |
| Conflict & Related-Work Scan | PASS with warning | Active adjacent change `fixTaskCompletion` targets task completion ownership, not report contract drift. `adv_change_validate` passed pre-approval; after proposal gate, two retries timed out while Temporal health was OK. Agenda items are unrelated executive-summary/delegation follow-ups. |
| Edge Case Investigation | PASS | Covered legacy shape, sidecar vs legacy task storage, invalid anchors, duplicate reports, string scope compatibility, scanner lanes. |
| Design Question Depth | PASS | Open design questions annotated below. |
| Draft Spec Delta Shapes | PASS | Draft `rq-subagentReports10..13` below. |
| P25 Related-Pattern Scan | PASS | Similar compatibility pattern exists only for gates (`normalizeLegacyGateData`), not report rows. |
| LBP Check | PASS | Internal structural fix; no external alternatives needed. Best local pattern is explicit normalization + strict new-ingest schemas + asset tests. |

### Skills Considered

- `adv-agent-tool-contracts`: MATCH; used checklist for schema, packet, prompt, transport lane, tests, and spec alignment.
- `lgrep`: MATCH as local code exploration policy; used text/search/read evidence.
- No external skill gap detected.

### Extends

- `docs/repo-improve-prep.md`: not directly about report contracts. New finding: the report bug hits high-latency/fragile read paths (`adv_change_show`, `adv_gate_status`), reinforcing that readback must be structurally robust and not rely on broad downstream aggregation to repair malformed report rows.

### Conflict Scan

- Active related change: `fixTaskCompletion` is adjacent but not overlapping enough to block; it owns task completion semantics, not report readback/packet anchoring.
- Validation: `adv_change_validate` passed before approval with expected `NO_TASKS`/`NO_DELTAS`; after gate completion, validation timed out twice. `adv_temporal_diagnose` reported Temporal healthy and change workflow reachable.
- Agenda: pending subagent follow-ups found, but they target executive-summary/delegation/visual-review issues, not this report-contract bug.

### Current State

- `plugin/src/types/subagent-reports.ts:122-132` requires engineer `scope_drift` and `required_main_agent_actions`; `:218-243` requires the same for reviewer reports.
- `plugin/src/types/subagent-reports.ts:57-64` accepts task-scoped `scope` as either structural task scope or string for backward compatibility.
- `plugin/src/types/tasks.ts:228-235` stores `task.subagent_reports` as `SubagentReportSchema`; `plugin/src/types/changes.ts:480-482` parses task and sidecar reports during whole-change parse.
- `plugin/src/storage/json.ts:441-447` normalizes only legacy gate data before `ChangeSchema.parse`; no report normalizer exists there.
- `plugin/src/storage/store-temporal/tasks.ts:32-43` lists tasks directly from Temporal query, explaining why task listing can survive while whole-change readback fails.
- `plugin/src/tools/subagent-report.ts:101-107` throws `Task not found in change ...`; `:437-439` loads change and validates task anchor before signal persistence.
- `plugin/src/temporal/change-state.ts:420-459` stores accepted reports in both sidecar and task legacy locations, so compatibility must handle both.
- `.opencode/agents/adv-reviewer.md:235-242` shows string `scope`; `:306-328` requires `task_id` from `TASK` and retries submission up to three times.
- `plugin/src/tools/change.ts:2004-2022` aggregates sidecar and task reports after change parse; it cannot repair reports that already failed schema parse.

### Edge Cases

1. Legacy task report missing both new fields: normalize `scope_drift: null`, `required_main_agent_actions: []`; do not mutate new submissions.
2. Legacy sidecar report missing fields: same defaults must apply before `ChangeSchema.parse`.
3. Invalid synthetic task ID in reviewer report: return structured diagnostic with valid task IDs and supported alternatives, not generic unexpected error.
4. String `scope` in old report: readback remains accepted; prompts should stop generating it for new reports.
5. Scanner lane confusion: non-persisted scanners must not be told to call `adv_subagent_report_submit`; only orchestrator bundles persist scanner summaries.
6. Duplicate report keys after normalization: dedupe must remain deterministic by change/scope/agent/attempt.

### Open Design Questions

- Acceptance-review persistence model. Trust model: joint; user chose durable persistence. Blast radius: wrong model repeats synthetic-task failure or loses review evidence. Alternatives: change-scoped reviewer variant, dedicated review task, or inline-only. Recommendation: design a structural persisted acceptance-review model that does not fabricate task IDs.
- Legacy normalization boundary. Trust model: agent. Blast radius: wrong boundary leaves `adv_gate_status`/`adv_change_show` broken. Alternatives: schema preprocess, storage read adapter, workflow projection, tool-only adapter. Recommendation: normalize before strict whole-change parse, with tests for sidecar and task rows.
- String-scope compatibility. Trust model: joint; user chose prompt deprecation. Blast radius: tightening parser too fast breaks live workers; leaving prompts unchanged perpetuates drift. Recommendation: update prompts/examples to structural scope now; keep parser compatibility for legacy/readback until a later removal change.
- Task-anchor diagnostics. Trust model: agent. Blast radius: poor diagnostics cause repeated failed subagent retries. Alternatives: generic error, INVALID_TASK_ANCHOR code, dry-run hint. Recommendation: structured `INVALID_TASK_ANCHOR` with valid task IDs and lane guidance.

### Draft Spec Deltas

- `rq-subagentReports10` — Legacy report read compatibility defaults.
  - Given a legacy engineer/reviewer/designer report lacks `scope_drift` or `required_main_agent_actions`
  - When change/task readback parses persisted state
  - Then safe defaults are applied before strict parse and the change remains readable.
- `rq-subagentReports11` — Acceptance-review persisted anchor contract.
  - Given an acceptance-stage independent reviewer report must be persisted
  - When ADV spawns the reviewer
  - Then the packet uses a supported structural anchor and never fabricates a task ID.
- `rq-subagentReports12` — Invalid task-anchor diagnostics.
  - Given a task-scoped worker report references a task not in the change
  - When `adv_subagent_report_submit` validates ownership
  - Then it returns an actionable error code and valid anchor guidance without retry ambiguity.
- `rq-subagentReports13` — Scope compatibility migration.
  - Given prompts/examples for new worker reports
  - When a worker builds a report
  - Then the prompt uses structural scope; string scope remains compatibility-only until explicitly retired.

### Related Pattern Scan

- Similar pattern: `plugin/src/storage/json.ts:79-106` and `:441-447` implement gate legacy normalization before strict parse.
- Missing parallel: no `normalizeLegacySubagentReports` path found for sidecar or task report rows.
- Related report consumers: `plugin/src/tools/checkpoint.ts:355-360`, `plugin/src/tools/task.ts:692-694`, and `plugin/src/tools/change.ts:2004-2022` consume reports after parse; they need tests but are not the normalization owner.

### LBP Check

Best long-term practice is structural compatibility at the trust boundary: normalize trusted legacy persisted records before strict Zod parse, keep new tool-call submissions strict, and align prompts/specs/tests so workers no longer generate ambiguous payloads. No external vendor/library solution is relevant; this is an internal contract and Temporal replay compatibility problem.

### Discovery Opportunity Scout

- Candidates considered: 7.
- Auto-adopted: 5.
  - Extend read normalizer for legacy reports.
  - Add structured invalid-anchor diagnostics.
  - Add asset test forbidding fabricated non-task `TASK` literals in review/harden packets.
  - Add backward-compat fixture tests for legacy report parse.
  - Add spec scenario for acceptance-review anchoring.
- Surfaced to user: 1 — string-scope deprecation timing; user chose prompt deprecation while keeping compatibility.
- Deferred: 1 — broader scanner/handoff persistence refactor remains out of scope.

### AMBIGUITY ANALYSIS — no ambiguity findings. Coverage: B:C F:C S:C M:C

### Recommended Objectives

1. Restore readback for old persisted task and sidecar reports with explicit compatibility defaults.
2. Preserve strict validation for all new worker report submissions.
3. Define and implement a supported durable persistence model for acceptance-stage reviewer reports.
4. Replace synthetic task ID failure loops with clear diagnostics and packet/asset tests.
5. Move new worker prompts/examples to structural `scope` while preserving legacy string-scope read/ingest compatibility.
6. Update subagent-report specs and contract tests so schemas, tools, prompts, and command packets stay aligned.

## Discovery Agenda

### Codebase unknowns

- Final design choice for acceptance-review persistence: likely change-scoped reviewer variant or dedicated review task; decide in `/adv-design`.
- Exact implementation site for normalization: discovery recommends pre-`ChangeSchema.parse` normalization, design will place it precisely.
- Full test list and fixture shape for sidecar/task legacy records.

### Ecosystem unknowns

- None requiring external research.

### Domain unknowns

- Resolved: user wants acceptance review persisted reliably.
- Resolved: user wants auto-normalized legacy readback.
- Resolved: user wants prompts to deprecate string scope while parser compatibility remains.

### Integration unknowns

- Coordinate touched areas with `fixTaskCompletion` if implementation modifies shared task/report consumers.
- Ensure scanner lanes stay non-persisted unless orchestrator submits a scanner bundle.

## Proposal Quality Scan

- B / Boundaries: PASS — Scope includes In Scope, Out of Scope, and Must Not.
- F / Functional Scope: PASS — Success criteria are testable and tied to observed failures.
- S / Completion Signals: PASS — Completion is measurable through readback, submit diagnostics, contract alignment, and regression tests.
