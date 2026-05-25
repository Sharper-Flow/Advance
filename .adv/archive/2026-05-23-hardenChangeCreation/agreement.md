# Agreement

## Objectives

1. **Canonical minimal ad hoc creation** — `adv_change_create` reliably supports a payload of `summary` plus optional `capability`, `proposal`, and `problemStatement` with no origin/linkage metadata persisted.
2. **All-tools placeholder policy** — Every ADV tool field with durable state, audit, workflow, path, external-execution, or semantic-filter meaning gets an explicit placeholder policy: reject, normalize to omitted, or accept.
3. **Deterministic placeholder handling** — Placeholder-heavy payloads produce deterministic outcomes per field.
4. **Strict correctness preserved** — Origin linkage, issue claims, cross-project metadata, lineage, artifact persistence, gate completion, task state, external command execution, and approval auditability remain strictly validated.
5. **Provider behavior as evidence** — Provider differences are investigated as evidence, not assumed causal.
6. **Spec law and regression coverage** — Requirements and tests prevent recurrence across create and same-shape ADV tool traps.

## Acceptance Criteria

**AC1 — Minimal ad hoc creation works**
- Given `{ summary: "Update Geist typography", capability: "ui-interaction-primitives", proposal: "...", problemStatement: "..." }`, when `adv_change_create` runs, then a change is created with no `origin`, no `fast_follow_of`, no `cross_project_origin`, no `scope_repos` unless product-linked default applies.

**AC2 — Blank artifact/origin placeholders are rejected deterministically**
- Given `{ summary: "...", proposal: "", design: "   ", origin_source_artifact: " " }`, when preflight runs, then no workflow starts, no blank artifact is written, and the response names every offending field and includes the canonical minimal payload when useful.

**AC3 — Ad hoc origin linkage is rejected**
- Given `{ summary: "...", origin_kind: "adhoc", origin_issue_number: 0, origin_source_artifact: "" }`, when preflight runs, then origin linkage fields are rejected or stripped by an explicit field policy, and no invalid `origin` is persisted.

**AC4 — Roadmap/triage/discovery origin constraints remain strict**
- Roadmap without `origin_issue_number` → rejected.
- Triage with non-blank `origin_source_artifact` → accepted; without → accepted.
- Discovery with `origin_issue_number` → rejected.
- Existing origin tests continue to pass.

**AC5 — Cross-project/lineage placeholders handled structurally**
- `target_path: ""` or whitespace-only → rejected or normalized by explicit policy; never attempts cross-project mutation.
- `source_project` / `source_change_id` without `target_path` → rejected or normalized by explicit policy.
- `parent_change_id: "none"` or blank → rejected or normalized by explicit policy.
- `scope_repos: []` → normalized to omitted or rejected by explicit policy.

**AC6 — Same-shape traps across ADV tools are covered**
- Required content fields such as `summary`, task `content`, wisdom `content`, test `command`, worktree `branch`, and audit `reason` fields reject blank/whitespace values before mutation or execution.
- Optional durable/audit/path/linkage strings reject blank/whitespace when provided unless an explicit field policy treats omission as equivalent.
- Record values such as task cancellation reasons and metadata reject blank values when they persist audit or workflow state.
- Empty arrays/objects are normalized or rejected only through explicit policy.

**AC7 — Regression tests cover all failure patterns**
- Minimal valid ad hoc payload.
- Ad hoc with blank/zero origin placeholders.
- Blank artifact fields.
- Roadmap/triage/discovery origin constraints.
- Target/source/lineage placeholders.
- Empty array `scope_repos` placeholder.
- Representative all-tools traps: task content, gate notes/actor, approval evidence, cancellation reasons, wisdom content, run-test command, worktree branch/base, conformance audit fields, agenda title/reason.

**AC8 — Tool guidance includes canonical minimal call**
- `adv_change_create` description/schema includes a minimal valid ad hoc payload example and tells agents to omit optional fields not intended to be set.
- Error diagnostics include field names and a compact retry shape when callers can recover mechanically.

**AC9 — Provider investigation recorded structurally**
- Design records a provider-by-provider matrix covering GPT-class, Claude-class, and one open-weights/other model path if available.
- Matrix columns include provider, placeholder pattern reproduced, root-cause classification, and follow-up obligation.

**AC10 — Single-source validation ownership**
- Placeholder/cross-field validation is centralized in shared preflight helpers where possible.
- Execute paths keep only defensive assertions needed for safety, with tests proving preflight and execute behavior do not diverge.

## Constraints

- Preserve strict correctness for `rq-backlogCoord08`.
- Prefer structural correctness: schemas, preflight normalization/rejection, validators, and tests over prose-only guidance.
- Keep valid ad hoc creation minimal and discoverable.
- Treat provider/model differences as evidence.
- Sentinel normalization policy is a design decision; heuristics must not own correctness, persistence, workflow state, or audit boundaries.
- “Across all tools” means all ADV fields where placeholder values affect durable state, audit, workflow transitions, paths, external execution, or semantic filters.

## Avoidances

- Do not treat `origin_issue_number: 0` as valid.
- Do not persist blank artifact files.
- Do not silently retain invalid adhoc origin linkage.
- Do not weaken cross-project mutation auditability.
- Do not hide validation errors that indicate real ambiguity.
- Do not rely on heuristic sentinel normalization as correctness authority.
- Do not split `adv_change_create` into mode-specific tools in this change.
- Do not redesign provider runtime hints unless design proves they are causal.
- Do not normalize placeholders for approval evidence, recovery evidence, gate actor, command strings, paths, issue numbers, or IDs unless design proves omission-equivalence and audit safety.

## Decisions

### User Decisions

1. **Scope:** Broaden from `adv_change_create` pilot plus survey to placeholder-sensitive handling “across all tools”.
2. **Acceptance criteria:** Approved by user via inline checkpoint reply: `approve`.
3. **Sentinel policy:** Deferred to design phase after research. P33 applies as default guardrail.
4. **Error UX:** Deferred to design phase. Fields + minimal JSON is current recommended direction pending design validation.

### Agent Decisions (LBP)

1. **Runtime preflight over schema-level transforms** — validation must happen at preflight/execution boundaries.
2. **Pilot path remains the anchor, but all-tools policy joins scope**.
3. **Strict-by-default sentinel handling** — audit/path/linkage/ID fields default to reject, not normalize.
4. **Validate `source_project`/`source_change_id` conditional on `target_path`**.
5. **Use schema examples as guidance, not correctness**.

## Deferred Questions

1. Sentinel normalization allowlist.
2. Error diagnostic shape.
3. Empty array/object policy.
4. Read-only filter policy.

## Sign-Off

Acceptance criteria approved by user via inline reply: `approve`. Contract minted from this agreement.