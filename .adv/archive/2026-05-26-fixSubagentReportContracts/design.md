# Design

## Architecture Overview

Fix report contracts at three structural boundaries:

1. **Persisted legacy read boundary** — normalize old report rows before strict `ChangeSchema` parsing or cache/projection use. This applies to both `change.subagent_reports[]` sidecar rows and legacy `task.subagent_reports[]` rows.
2. **Temporal seed/projection boundary** — ensure stale workflow seed state is normalized and sidecar reports are not dropped when workflow state is mapped into `Change` objects. `plugin/src/storage/store-temporal/shared.ts:58-80` currently omits `subagent_reports`, even though workflow state carries it.
3. **New submission boundary** — keep `adv_subagent_report_submit` strict for new payloads, but replace generic task-anchor failures with typed, actionable diagnostics.
4. **Worker packet boundary** — stop generating unsupported synthetic task IDs and move new worker examples to structural `scope` objects.

The design keeps compatibility and correctness separate: legacy records get deterministic defaults; new malformed reports still fail.

## Key Decisions

### KD1 — Normalize legacy report rows before whole-change parse and workflow seed/projection use

Add a pure workflow-safe compatibility helper near the report schemas, for example `plugin/src/types/subagent-report-compat.ts` or a localized export from `plugin/src/types/subagent-reports.ts`.

Responsibilities:

- Walk raw change-like objects.
- Normalize `change.subagent_reports[]`.
- Normalize every `task.subagent_reports[]`.
- For task-scoped `adv-engineer`, `adv-reviewer`, and `adv-designer` legacy rows:
  - if `scope_drift` is absent, set `scope_drift: null`
  - if `required_main_agent_actions` is absent, set `required_main_agent_actions: []`
- Leave unsupported/malformed identity fields untouched so genuinely invalid records still fail strict parsing.
- Return `[normalized, changed]` like `normalizeLegacyGateData` to support disk write-back when safe.

Apply the helper in:

- `plugin/src/storage/json.ts` before `ChangeSchema.parse`, alongside `normalizeLegacyGateData`.
- `plugin/src/temporal/change-state.ts` in `changeSeedStateFromChange` so reseeded workflows and continue-as-new seed paths do not carry stale report shapes forward.
- `plugin/src/storage/store-temporal/shared.ts` inside `mapTemporalChangeStateToChange` as defensive projection-time normalization before caching/returning a `Change`.

This preserves `rq-subagentReports09` while avoiding manual ADV state edits. The helper must remain workflow-safe if imported by `temporal/change-state.ts`: no Node APIs, no storage/tool imports.

### KD2 — Preserve strict new-ingest schemas

Do not make `scope_drift` or `required_main_agent_actions` optional in `EngineerSubagentReportSchema`, `DesignerSubagentReportSchema`, or task-scoped `ReviewerSubagentReportSchema` for new submissions. Existing tests such as `plugin/src/types/subagent-reports.test.ts:273-305` should keep proving omission fails for new payloads.

Compatibility belongs in the persisted-record normalizer, not in the ingest schemas.

### KD3 — Add a change-scoped reviewer report variant for independent review/harden

Acceptance-stage independent review is not a task remediation. It needs durable evidence, but synthetic task IDs are structurally wrong.

Add a supported change-scoped reviewer variant:

- `agent: "adv-reviewer"`
- `phase: "review" | "harden"`
- `scope: { kind: "change", scope_key: string }`
- command packet examples use reserved literals `review:acceptance` and `harden:release`
- no `task_id`
- same verdict/findings/verification/risks/actions shape as the current reviewer report

Keep task-scoped reviewer reports for remediation workers tied to existing tasks/findings.

Implementation note: use shared reviewer field shape to avoid duplication, but be careful with Zod discriminators. A simple union of task-scoped reviewer and change-scoped reviewer may be clearer than forcing one discriminator to cover both `agent` and `scope.kind`. Keep `scope_key` as a string for consistency with existing change-scoped reports, but pin the known review/harden literals in command/prompt asset tests.

Update `ScopedSubagentReportSchema` and `rq-subagentReports06` so the valid pairings are:

- `adv-engineer`: task-scoped only
- `adv-designer`: task-scoped only
- `adv-reviewer`: task-scoped for remediation, change-scoped for independent review/harden summaries
- `adv-researcher`, `adv-tron`, `adv-scanner-bundle`: change-scoped

### KD4 — Make invalid task anchors actionable

Replace the current generic throw from `getTaskOrError()` in `plugin/src/tools/subagent-report.ts` with a structured response before signaling:

- `code: "INVALID_TASK_ANCHOR"`
- `message: "Task-scoped sub-agent report references a task that does not exist in this change"`
- `changeId`, `taskId`, `agent`, `attempt`
- `validTaskIds` and task titles, capped if needed
- `guidance` explaining:
  - task-scoped reports must use an existing ADV task ID
  - independent review/harden reports must use the change-scoped reviewer report variant
  - scanner lanes must not call `adv_subagent_report_submit`

Do not attempt `recordSubmitFailure` for a non-existent task unless a safe change-level failure record is introduced. There is no safe task to attach failure state to.

### KD5 — Preserve and expose sidecar reports in Temporal readback

Update `mapTemporalChangeStateToChange` to include `subagent_reports: state.subagent_reports`. This is a high-leverage AC2/AC3 fix:

- workflow state already carries `subagent_reports` (`plugin/src/temporal/contracts.ts:199`)
- signal handlers write sidecar and task reports (`plugin/src/temporal/change-state.ts:443-456`)
- disk schemas accept sidecar reports (`plugin/src/types/changes.ts:482`)
- dedupe checks read `change.subagent_reports` (`plugin/src/tools/subagent-report.ts:251`)

Without this mapping, sidecar report readback/dedupe is incomplete even after schema work.

### KD6 — Move prompts/examples to structural scope while keeping parser compatibility

Update worker prompt examples:

- Task workers: `"scope": { "kind": "task", "task_id": "{task-id}" }`
- Independent reviewer packets: `SCOPE KEY: review:acceptance` or `harden:release`, no `TASK` line.
- Remediation reviewer packets: keep `TASK: {task-id}` and structural task scope.

Keep the string `scope` branch accepted for legacy compatibility, but mark it compatibility-only in code comments/specs and remove it from new prompt examples.

### KD7 — Add spec-law deltas before implementation

Update `.adv/specs/subagent-reports/spec.json` with requirements equivalent to:

- `rq-subagentReports10`: legacy report default normalization on readback.
- `rq-subagentReports11`: independent review/harden reports use a supported structural anchor and never synthetic task IDs.
- `rq-subagentReports12`: invalid task anchors return typed actionable diagnostics.
- `rq-subagentReports13`: new prompts use structural scope; string scope remains compatibility-only until a future removal.

Adjust `rq-subagentReports06` to include the new reviewer change-scoped variant.

No ADR draft needed: decisions are important but not hard-to-reverse enough once specs/tests pin them.

## Implementation Strategy

1. **Red tests: legacy normalization and sidecar readback**
   - Add fixture tests for raw change objects containing old `task.subagent_reports[]` and `change.subagent_reports[]` missing the new fields.
   - Assert JSON load / `ChangeSchema` path succeeds after normalization.
   - Assert `changeSeedStateFromChange` and `mapTemporalChangeStateToChange` return normalized task/sidecar reports.
   - Assert `mapTemporalChangeStateToChange` preserves `subagent_reports` in returned `Change`.
   - Assert new `EngineerSubagentReportSchema.parse` still rejects missing fields directly.

2. **Report compatibility helper**
   - Implement deterministic normalizer for persisted report rows.
   - Reuse it in `storage/json.ts`, `temporal/change-state.ts`, and `store-temporal/shared.ts`.
   - Ensure `mapTemporalChangeStateToChange` includes normalized `subagent_reports` in returned `Change`.

3. **Change-scoped reviewer schema**
   - Introduce a change-scoped reviewer schema or shared reviewer payload core to avoid duplicating fields.
   - Update `ScopedSubagentReportSchema` and readback key behavior.
   - Keep task-scoped reviewer behavior intact for remediation.

4. **Tool diagnostics**
   - Replace generic task-not-found throw with `INVALID_TASK_ANCHOR` response.
   - Add tests for invalid synthetic task IDs and valid change-scoped reviewer submissions.

5. **Prompt/command contract updates**
   - Update `.opencode/agents/adv-reviewer.md`, `.opencode/agents/adv-engineer.md`, `.opencode/agents/adv-designer.md` examples to structural scope.
   - Update `.opencode/command/adv-review.md` and `.opencode/command/adv-harden.md` independent review/harden packet templates to use `SCOPE KEY` for change-scoped reviewer reports; remediation packet templates keep `TASK`.
   - Add/adjust asset tests to prevent fabricated `acceptance-review-*` task IDs and string-scope examples in new prompts.

6. **Spec and conformance tests**
   - Update subagent-report specs first in the implementation sequence.
   - Extend `subagent-reports-spec-assets.test.ts` and existing report schema/tool tests.
   - Enumerate asset-test files during planning: at minimum `subagent-reports-spec-assets.test.ts`, `adv-reviewer-asset.test.ts`, `adv-engineer-assets.test.ts`, `adv-designer-assets.test.ts`, and command contract tests covering review/harden packet anchors.

7. **Verification**
   - Targeted tests for types, storage JSON normalization, store-temporal mapping, subagent report tool, change show readback, asset/spec checks.
   - `pnpm run check` and relevant `bin/oc-test`/`pnpm test` lanes per repo policy.

## LBP Analysis

This design follows the local best practice already used for gate data: normalize old persisted data at read boundaries, then apply strict schemas. It avoids weakening correctness for new inputs, avoids manual state repair, and makes worker packet identity structural instead of prose-inferred.

Change-scoped reviewer reports are the clean long-term model for independent acceptance/release review because they are change-level evidence, not task remediation evidence. A dedicated pseudo-task would create artificial task lifecycle state and repeat the synthetic-anchor problem in another form.

## Affected Components

- `plugin/src/types/subagent-reports.ts` and related tests.
- `plugin/src/types/tasks.ts` / `plugin/src/types/changes.ts` as parser consumers; avoid broad schema weakening.
- `plugin/src/storage/json.ts` for disk snapshot read normalization.
- `plugin/src/temporal/change-state.ts` for workflow seed normalization.
- `plugin/src/storage/store-temporal/shared.ts` for Temporal query/cache/projection mapping and sidecar preservation.
- `plugin/src/tools/subagent-report.ts` for invalid-anchor diagnostics and change-scoped reviewer submit support.
- `plugin/src/tools/change.ts` for readback aggregation tests after normalization.
- `.opencode/agents/adv-reviewer.md`, `.opencode/agents/adv-engineer.md`, `.opencode/agents/adv-designer.md`.
- `.opencode/command/adv-review.md`, `.opencode/command/adv-harden.md`.
- `.adv/specs/subagent-reports/spec.json`.

## Risks / Mitigations

- Risk: Normalizer hides malformed new submissions. Mitigation: normalizer only runs on persisted readback/seed/projection surfaces; schema tests keep new-ingest strict.
- Risk: Temporal workflow state contains stale rows and query returns them. Mitigation: normalize in workflow-safe seed helper and store mapping layer; no storage/tool imports into workflow code.
- Risk: Adding change-scoped reviewer variant weakens task evidence expectations. Mitigation: restrict it to independent review/harden summaries and keep remediation reviewer task-scoped.
- Risk: Prompt updates drift again. Mitigation: asset tests assert structural scope examples and supported anchors.
- Risk: `fixTaskCompletion` touches nearby task consumers. Mitigation: keep this change focused on reports/anchors and coordinate during prep if shared files overlap.

## Design Leverage Scout

Validator/scout result: VALIDATED with leverage opportunities.

Auto-adopted:

- Add `subagent_reports: state.subagent_reports` to `mapTemporalChangeStateToChange`; this unlocks sidecar readback and dedupe correctness.
- Implement `INVALID_TASK_ANCHOR` as a structured branch in `executeSubmit`.
- Build change-scoped reviewer as a schema addition with shared reviewer fields; avoid brittle discriminator coupling.

User-surfaced candidate resolved:

- Keep persisted-record legacy normalizer because user explicitly chose auto-normalized readback.

Deferred:

- Broader string-scope canonicalization in helper internals after compatibility window.

## Validator Result

CAUTION — validated with minor cautions.

- Correctness: design targets confirmed root causes: required report fields, whole-change parse failures, sidecar readback omission, and task-scoped-only reviewer schema.
- Caution resolved in design: normalizer call sites are now pinned to `storage/json.ts`, `temporal/change-state.ts` seed conversion, and `store-temporal/shared.ts` projection mapping.
- Spec-law: implementation must explicitly amend `rq-subagentReports06` for change-scoped reviewer reports and update schema/prompt asset tests.
- Alternatives: no viable simpler alternative preserves C2/DONT2/DONT3; enum-vs-string for reviewer `scope_key` is resolved as string schema plus reserved literals in prompt/asset tests.
