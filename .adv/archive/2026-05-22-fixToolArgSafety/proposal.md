# Fix tool arg safety

## Why

ADV MCP tools accept optional narrative and linkage fields. A caller can accidentally provide blank strings for fields it did not intend to change. In the current runtime, provided blanks can be treated as real content and may overwrite artifacts or persist invalid origin metadata. Origin issue metadata can also be accepted outside the origin kinds that should own backlog issue semantics.

## What Changes

- Add structural validation for provided blank narrative artifact fields on `adv_change_update` and `adv_change_create`.
- Preserve omitted-field semantics: omitted fields remain unchanged or use existing create defaults.
- Reject blank `origin_source_artifact` when provided.
- Enforce the origin linkage matrix so `origin_issue_number` is accepted only for `roadmap` and `triage`, with `roadmap` still requiring it.
- Seed valid creation-time origin metadata into authoritative disk/Temporal state and related search attributes.
- Add defense-in-depth tests at preflight, tool execute, storage, and Temporal boundaries.

## Success Criteria

- `adv_change_update` rejects any provided blank artifact field, including mixed calls like `{ proposal: "real", design: "" }`, before writes/signals.
- Omitted artifact fields remain unchanged.
- `adv_change_create` rejects blank provided narrative artifact fields; omitted fields keep existing default/skip behavior.
- `origin_issue_number` is accepted only for `roadmap`/`triage`; `roadmap` still requires it.
- Blank `origin_source_artifact` is rejected when provided.
- Valid creation-time origin metadata appears in authoritative Temporal workflow reads and relevant search attributes.
- Error responses name offending fields and tell agents to omit fields they do not intend to change.
- Existing valid create/update/proposal flows remain compatible.

## Affected Code

- `.adv/specs/advance-workflow/spec.json` — tool argument blank artifact/linkage law.
- `.adv/specs/backlog-coordination/spec.json` — origin linkage and Temporal seed-state law.
- `plugin/src/utils/tool-arg-preflight.ts` — preflight validators.
- `plugin/src/tools/change.ts` — create/update execute-layer validation and metadata construction.
- `plugin/src/storage/json.ts` — storage artifact guards.
- `plugin/src/storage/store-*` and `plugin/src/temporal/*` — creation metadata seed and artifact metadata freshness.
- Co-located tests under `plugin/src/**`.

## Constraints

- Keep correctness structural: schemas, validators, storage guards, Temporal seed-state, and tests.
- Limit blank optional string rejection to artifact/linkage fields in this change.
- Do not rely on prompt discipline or silent blank-to-omission coercion.
- Do not add a dedicated origin repair tool unless forward-path seeding proves insufficient.

## Validation Plan

- Write failing tests first for blank update/create arguments, origin matrix violations, storage boundary guards, and Temporal seed state.
- Implement layered validation and metadata seeding.
- Run targeted regressions, `pnpm run check`, full `pnpm test`, and `adv_change_validate --strict`.