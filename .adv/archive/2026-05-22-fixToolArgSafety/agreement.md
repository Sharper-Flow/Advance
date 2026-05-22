# Agreement

## Objectives

1. Reject blank provided artifact/linkage fields structurally before any destructive write or workflow signal.
2. Preserve omitted-field semantics for partial artifact updates and change creation defaults.
3. Restrict `origin_issue_number` to `roadmap` and `triage` origins; preserve the existing roadmap requirement.
4. Validate `origin_source_artifact` when provided; blank or whitespace-only source artifacts are invalid.
5. Make valid creation-time origin metadata authoritative in Temporal workflow state and related search attributes.
6. Add defense-in-depth tests and storage-boundary guards so bypassing preflight cannot blank artifacts.
7. Defer existing-state origin repair to design; do not add a repair tool unless forward-path seeding cannot satisfy the contract.

## Acceptance Criteria

1. `adv_change_update` rejects any provided blank artifact field, including mixed calls like `{ proposal: "real", design: "" }`, before writes/signals.
2. Omitted artifact fields remain unchanged.
3. `adv_change_create` rejects blank provided narrative artifact fields; omitted fields keep existing default/skip behavior.
4. `origin_issue_number` is accepted only for `roadmap`/`triage`; `roadmap` still requires it.
5. Blank `origin_source_artifact` is rejected when provided.
6. Valid creation-time origin metadata appears in authoritative Temporal workflow reads and relevant search attributes.
7. Error responses name offending fields and tell agents to omit fields they do not intend to change.
8. Existing valid create/update/proposal flows remain compatible.

## Constraints

- Correctness must be structural: Zod schemas, preflight validation, storage-boundary guards, Temporal seed-state flow, and tests.
- Scope for blank optional string rejection is artifact/linkage fields only in this change.
- Broader all-ADV-tool blank optional string policy is deferred to agenda `ag-IvWj2x1e`.
- Runtime source changes require build/deploy/restart before live ADV tool behavior can be validated end-to-end in OpenCode.
- Current repo only.

## Avoidances

- Do not silently coerce blank strings to omission for destructive fields.
- Do not rely on agent prompt discipline as the safety mechanism.
- Do not hand-edit ADV state projections to repair individual changes.
- Do not broaden into upstream OpenCode schema conversion fixes.
- Do not redesign every ADV tool schema.
- Do not add a dedicated origin repair tool unless design proves forward-path seeding is insufficient.

## Decisions

### User Decisions

1. Repair scope: decide in design whether existing bad origin metadata needs a repair path.
2. Origin policy: `origin_issue_number` is allowed only for `roadmap` and `triage` origins.
3. Blank strictness: apply now to artifact and linkage fields; create follow-up to investigate all ADV tools.

### Agent Decisions (LBP)

1. Use field-level Zod/trim-aware validation for create-time narrative/linkage fields where per-field presence is enough.
2. Use tool preflight for `adv_change_update` because mixed real+blank semantics are cross-field and need a clear agent-facing error.
3. Add storage-layer defense at `updateChangeArtifacts` so bypassing preflight cannot blank artifacts.
4. Prefer seeding origin before Temporal workflow start instead of late disk-only patching.
5. Reassess agenda `ag-TEEw07Il` after root-cause create-path fix.

## Deferred Questions

- Whether to include a signal-backed or migration-style repair path for existing malformed origin metadata. Resolve during design after seed-state options are evaluated.

## Sign-Off

User approved acceptance criteria with reply: `approve`.