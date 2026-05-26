# Design

## Architecture Overview
Move ADV sub-agent reports toward a **single sidecar report store** on the change workflow, with explicit scope metadata. This is better for ADV's token/context goal than continuing to embed reports in task objects: ordinary `adv_change_show` and task reads should not drag persisted worker handoffs into the main orchestrator context unless the caller explicitly requests them.

Design principle:

- **Report payloads are durable sidecar evidence.**
- **Task/change summaries stay lightweight by default.**
- **`include.subagentReports` is the opt-in parent-facing readback.**

The system still distinguishes report scope structurally:

- `scope.kind: "task"` for `adv-engineer` and `adv-reviewer` task work.
- `scope.kind: "change"` for taskless `adv-researcher`, `adv-tron`, and scanner-bundle work.

Existing legacy `task.subagent_reports[]` remains readable for backward compatibility and migration safety, but new writes should target the sidecar store. Legacy task reads are a compatibility bridge; design should avoid making dual-source report storage permanent if a safe migration/projection path is available.

## Key Decisions

### 1. Use one sidecar `subagent_reports[]` bucket with explicit scope

Decision: add `ChangeWorkflowState.subagent_reports[]` / `Change.subagent_reports[]` as the canonical report store for new reports.

Rationale:
- Best supports token efficiency: task objects can remain compact unless reports are explicitly requested.
- Avoids fake tasks and avoids embedding large reports in every task read.
- Gives one persistence/readback path for all report variants.
- Preserves truthful scope through metadata rather than storage location.

Scope shape:

```ts
const SubagentReportScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("task"), task_id: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("change"), scope_key: ChangeReportScopeKeySchema }).strict(),
]);
```

Scope keys must be structural, not freeform. Define per-lane scope-key formats or derive them from typed fields:

- Researcher: `researcher:{topic_slug}` or derived from a required `topic` field.
- Tron: `tron:{target_slug}` or derived from a required `target` field.
- Scanner bundle: `scanner-bundle:{phase}` where phase is `review | harden`.
- Design validator or scout reports, if later added, use their own enumerated prefixes.

Shared report fields:

```ts
schema_version: "1.0";
change_id: string;
agent: "adv-engineer" | "adv-reviewer" | "adv-researcher" | "adv-tron" | "adv-scanner-bundle";
scope: SubagentReportScope;
attempt: number;
workdir_used: string;
follow_ups?: string[]; // bounded, default []
```

Schema must enforce agent↔scope pairing structurally:

- `adv-engineer`, `adv-reviewer` → `scope.kind === "task"`.
- `adv-researcher`, `adv-tron`, `adv-scanner-bundle` → `scope.kind === "change"`.

Use per-agent object schemas or `.refine()` with tests so invalid pairings are rejected before persistence.

Compatibility:
- Existing reports in `task.subagent_reports[]` remain read and included by `include.subagentReports`.
- New reports persist to the sidecar bucket.
- Checkpoint/task logic that only needs to know whether a task has a persisted report must check both the sidecar bucket and legacy task field.

### 2. Derive deterministic identity from scope; do not add a separate `report_id`

Decision: use `(change_id, scope, agent, attempt)` as the idempotency key.

Rationale:
- Avoids another worker-supplied identity field.
- Reuses the existing mental model of report identity.
- Keeps packet requirements smaller.

Key helper:

```ts
function subagentReportKey(report: SupportedSubagentReport): string {
  const scopeId =
    report.scope.kind === "task"
      ? `task:${report.scope.task_id}`
      : `change:${report.scope.scope_key}`;
  return `${report.change_id}|${scopeId}|${report.agent}|${report.attempt}`;
}
```

Replay safety note: legacy signal histories used the old key shape `(change_id, task_id, agent, attempt)`. The implementation must preserve legacy-key calculation for replay of legacy payloads, or guard key-shape changes with Temporal versioning.

Packet anchors:
- Task-scoped reports: `WORKING DIRECTORY`, `CHANGE`, `TASK`, `ATTEMPT`; reviewer also `PHASE`.
- Change-scoped reports: `WORKING DIRECTORY`, `CHANGE`, `SCOPE KEY`, `ATTEMPT`; scanner bundle also `PHASE`.

### 3. Keep `adv_subagent_report_submit`, but scope-aware

Decision: use the same tool for all report variants and branch by `report.scope.kind`.

Submit flow:
1. Validate with expanded `SupportedSubagentReportSchema`.
2. Compute deterministic key from report scope.
3. If `scope.kind === "task"`, verify the task exists.
4. Check dedupe against `seenReportIds`, sidecar bucket, and legacy task bucket.
5. Fire `subagentReportSubmittedSignal` with `report` and `submittedAt`; optional `taskId` remains accepted for legacy compatibility.
6. Workflow persists into sidecar bucket for new scoped reports.
7. Tool consumes bounded follow-ups into source-tagged agenda items.

### 4. Scanner bundles are submitted by the orchestrator, not individual scanners

Decision: `explore` scanner lanes remain non-persisted and receive no ADV tool access. The main orchestrator submits one compact scanner bundle after review/harden synthesis.

Rationale:
- Preserves existing scanner isolation contracts.
- Avoids expanding `explore` permissions.
- Keeps noisy scanner output out of ADV state.
- Records durable audit data that review/harden can query later.

User selected compressed scanner rows. Shape:

```ts
agent: "adv-scanner-bundle";
phase: "review" | "harden";
scanner_rows: Array<{
  name: string;      // scanner/dimension label
  severity: "blocker" | "issue" | "suggestion" | "nit" | "info";
  summary: string;   // bounded; includes key evidence refs inline when needed
}>;
aggregate_verdict: "READY" | "NEEDS_WORK" | "BLOCKED" | "CONFLICT";
follow_ups?: string[];
```

### 5. Make follow-up handling bounded and source-tagged

Decision: all persisted report variants may expose `follow_ups: string[]`, with bounded count/length. The submit tool creates source-tagged agenda items from these follow-ups.

Rules:
- Bounded count per report, recommended max 5.
- Bounded text length per follow-up.
- Agenda metadata/source includes report key, change ID, agent, and scope.
- Duplicate follow-up keys should be detected where practical.
- Harden must inspect report-created agenda items and fix only items that are safe, adjacent, and campsite/touched-scope applicable; otherwise record rationale.

Implementation simplification:

```ts
function reportFollowUps(report: SupportedSubagentReport): string[] {
  return report.follow_ups ?? [];
}
```

### 6. Readback is merged, explicit, and opt-in

Decision: `adv_change_show include.subagentReports` returns one merged `_subagentReports` list with explicit source metadata and meta counts.

Shape:

```ts
_subagentReports: Array<{
  source: "sidecar" | "legacy_task";
  scope: { kind: "task"; task_id: string } | { kind: "change"; scope_key: string };
  report: SupportedSubagentReport;
}>;
_subagentReportsMeta: {
  total: number;
  sidecar: number;
  legacyTask: number;
  taskScoped: number;
  changeScoped: number;
};
```

Default `adv_change_show` should not expand new sidecar reports into task summaries. New sidecar reports stay behind `include.subagentReports`.

### 7. Use Temporal versioning/replay safety for persistence/key changes

Decision: implementation must explicitly handle replay of old histories.

Required safeguards:
- Add a patch/version marker such as `subagent-reports-sidecar-v1` around workflow logic that changes report persistence or key calculation, or prove by test that legacy payload shape always takes the legacy branch during replay.
- Keep old signal payload parsing valid: old payloads with top-level `taskId` and task-shaped report must still replay and produce deterministic state.
- Add workflow signal/replay tests for:
  - legacy task report payload under new worker bundle
  - new scoped sidecar payload
  - duplicate legacy/new report keys

### 8. Correct enforcement documentation structurally

Decision: remove `enforceTaskPolicy` runtime-enforcement claims and stale `guards/` claims across active prompts, instructions, project context, README, and changelog where they could be read as current truth. Historical changelog entries may remain only if explicitly historical and not presenting current behavior.

Replacement language:
- Sub-agent nesting is structurally constrained by sub-agent `task: false` tool grants.
- Parallel caps are orchestrator protocol rules unless/until ADV owns a delegation tool or OpenCode exposes host middleware.
- No current doc may claim plugin runtime enforcement for built-in `task` dispatch.

Add an asset test that scans prompt/doc surfaces for forbidden claims.

## ADR Drafts
No ADR drafted. The decision is important but local to ADV's existing sub-agent report capability, covered by spec-law updates and tests, and not surprising once the existing report architecture is understood.

## Implementation Strategy

1. **Spec-first contract updates**
   - Update `subagent-reports` for sidecar report storage, scope metadata, researcher/tron variants, scanner bundle reports, readback source metadata, bounded agenda follow-ups, and Temporal replay safety.
   - Update `delegation-defaults` to keep individual scanners non-persisted while allowing orchestrator-submitted scanner bundles.
   - Add harden agenda follow-up requirement.
   - Add enforcement-doc correction requirement.

2. **Type/schema updates**
   - Add structural `SubagentReportScopeSchema` and bounded `ChangeReportScopeKeySchema`.
   - Refactor report schemas so all variants carry `scope` and optional/defaulted bounded `follow_ups`.
   - Add strict `ResearcherSubagentReportSchema`, `TronSubagentReportSchema`, and `ScannerBundleSubagentReportSchema`.
   - Enforce agent↔scope pairing via per-agent schemas or refinements.
   - Keep compatibility aliases/projections as needed for existing engineer/reviewer code and tests.
   - Add helpers:
     - `getSubagentReportScope(report)`
     - `subagentReportDedupeKey(report)` with legacy-key support
     - `reportFollowUps(report)`

3. **Signal/state persistence**
   - Update signal payload schema to accept `{ report, submittedAt, taskId? }` for backward compatibility.
   - Add sidecar `subagent_reports?: SupportedSubagentReport[]` to change workflow state/projection.
   - Update apply function to persist new reports to sidecar bucket while replaying legacy payloads safely.
   - Keep legacy task report read support.
   - Preserve task error-recovery mapping only for task-scoped blockers.

4. **Tool behavior**
   - Remove `UNSUPPORTED_AGENT` rejection for researcher/tron.
   - Validate all variants through the expanded strict schema.
   - For task-scoped reports, require the referenced task exists.
   - For change-scoped reports, do not require task lookup.
   - Deduplicate before signaling.
   - Extend follow-up agenda consumer to all variants with bounds/source tags.

5. **Readback**
   - Update `adv_change_show include.subagentReports` to return sidecar + legacy task reports with source tags and meta counts.
   - Avoid adding new sidecar reports to default task payloads.

6. **Agent and command contracts**
   - Update `adv-researcher` and `adv-tron` prompts to call `adv_subagent_report_submit` when spawned in ADV report-enabled contexts.
   - Keep direct/no-mutation restrictions: no gate/task/change orchestration by sub-agents.
   - Update review/harden command contracts so orchestrator submits scanner bundles after synthesis.
   - Update harden contract to inspect report-created agenda items.

7. **Enforcement-doc cleanup**
   - Replace or remove all `enforceTaskPolicy` and stale `guards/` claims.
   - Add asset tests to prevent recurrence.

8. **Tests**
   - Schema tests for all new report variants, scope metadata, scope-key formats, and agent↔scope pairing.
   - Tool tests for valid submit, malformed rejection, dry-run, dedupe, follow-up agenda creation, task-scoped task lookup, and change-scoped no-task lookup.
   - Temporal signal/replay tests for sidecar persistence and legacy task report compatibility.
   - `adv_change_show` readback tests for source metadata/meta counts.
   - Checkpoint/task tests ensuring task-scoped sidecar reports still suppress legacy structured-output extraction where needed.
   - Asset tests for agent prompts, command packets, specs, and enforcement-doc wording.

## LBP Analysis
This design follows the long-term best practice already established in ADV and external agent harnesses: sub-agents perform noisy work in isolated context and return compact, typed, parent-facing outputs. Moving reports into a sidecar store further improves main ADV context purity because ordinary task/change summaries stay lightweight. The design avoids direct scanner tool expansion, fake task pollution, and raw transcript persistence. Correctness is structural through schemas, discriminators, workflow state, scope metadata, Temporal replay safeguards, and asset tests.

## Affected Components
- `plugin/src/types/subagent-reports.ts`
- `plugin/src/types/signals.ts`
- `plugin/src/types/tasks.ts` and change schema/state types as needed
- `plugin/src/temporal/contracts.ts`
- `plugin/src/temporal/change-state.ts`
- `plugin/src/tools/subagent-report.ts`
- `plugin/src/tools/change.ts`
- `plugin/src/tools/task.ts`
- `plugin/src/tools/checkpoint.ts`
- `.opencode/agents/adv.md`
- `.opencode/agents/adv-researcher.md`
- `.opencode/agents/adv-tron.md`
- `.opencode/command/adv-review.md`
- `.opencode/command/adv-harden.md`
- `.adv/specs/subagent-reports/spec.json`
- `.adv/specs/delegation-defaults/spec.json`
- README/project context/changelog references to stale enforcement/guards wording
- Relevant tests under `plugin/src/`

## Risks / Mitigations
- **Risk:** Moving new task-scoped reports to sidecar changes internal assumptions around `task.subagent_reports[]`.
  - **Mitigation:** keep legacy read compatibility; update checkpoint/task guards to query sidecar; preserve user-facing `include.subagentReports` behavior.
- **Risk:** Scanner bundles become too terse to audit.
  - **Mitigation:** compressed rows still require severity + bounded summary; summary may include key evidence refs inline.
- **Risk:** Freeform scope keys cause collisions or fragmentation.
  - **Mitigation:** structural scope-key formats/derivation and agent↔scope schema checks.
- **Risk:** Follow-up agenda creates noise.
  - **Mitigation:** bounded `follow_ups[]`, source tags, dedupe, harden applicability limits.
- **Risk:** Temporal replay issues from signal payload/key evolution.
  - **Mitigation:** explicit patch/versioning or proven legacy branch, plus replay-focused tests.
- **Risk:** Prompt/docs drift reintroduces fake runtime-enforcement claims.
  - **Mitigation:** asset test scanning active prompt/doc surfaces.

## Design Leverage Scout
- Candidates considered: 5.
- Adopted: scope-derived identity without separate `report_id`; shared optional `follow_ups`; enforcement-doc asset test first.
- User-selected: compressed scanner rows.
- Investigated and chosen for token/context efficiency: single sidecar report store with scope metadata for new reports, plus legacy task-report read compatibility.

## Validator Result
Validator: `CAUTION`.

Caution findings resolved in this design revision:
- Added Temporal replay/versioning requirement for signal payload and dedupe-key changes.
- Tightened `scope_key` from freeform string to structural per-lane formats or derivation.
- Required agent↔scope pairing validation at schema level.
- Clarified legacy task report reads as compatibility bridge rather than preferred storage.
