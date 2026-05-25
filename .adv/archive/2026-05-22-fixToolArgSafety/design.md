# Design

## Architecture Overview

Implement tool-argument safety as layered structural validation:

1. **Schema / preflight layer** — reject invalid provided values before tool execution when OpenCode invokes ADV tools.
2. **Tool execute layer** — repeat critical checks inside `change.ts` so direct unit tests and internal calls cannot bypass safety.
3. **Storage boundary layer** — reject blank artifact writes before any destructive file write.
4. **Temporal seed-state layer** — move origin metadata into creation-time state instead of late disk-only patching.

`undefined` means omitted/no change/default behavior. `""` or whitespace-only means invalid when the field is artifact/linkage state.

## Key Decisions

### KD1 — Reject blank provided artifact fields, do not coerce them

A blank provided value is an error, not an omitted field.

- Applies to `proposal`, `problemStatement`, `agreement`, `design`, and `executiveSummary` on `adv_change_update` and `adv_change_create`.
- Applies to `origin_source_artifact` on `adv_change_create`.
- Error messages name each offending field and tell callers to omit fields they do not intend to change.

### KD2 — Layer `adv_change_update` validation

`adv_change_update` has cross-field validation because one call can contain multiple artifact fields.

- Extend `CROSS_FIELD_VALIDATORS.adv_change_update` so any provided blank artifact field is invalid, even when another provided artifact field is non-empty.
- Keep the existing at-least-one-artifact rule.
- Add the same blank check in `adv_change_update.execute` before loading or writing the change.
- Add storage defense in `updateChangeArtifacts`: pre-scan all provided artifacts and return an error before any write when a blank is present.

### KD3 — Validate create-time narrative/linkage fields with field-level checks

`adv_change_create` rejects blank provided fields field-by-field.

- Use trim-aware nonblank validation for provided narrative artifact fields.
- Preserve original content; do not transform/trim user content before writing.
- Add execute-path validation so direct calls to `changeTools.adv_change_create.execute` are covered.
- Add storage-boundary scaffold protection so direct storage callers cannot create blank narrative artifacts.

### KD4 — Enforce a typed origin matrix

| origin_kind | origin_issue_number | origin_source_artifact |
|---|---:|---:|
| `roadmap` | required | rejected |
| `triage` | optional | optional/recommended |
| `discovery` | rejected | optional |
| `adhoc` | rejected | rejected |
| omitted | rejected if linkage field present | rejected if linkage field present |

Issue numbers imply backlog claim/search/close semantics; discovery and adhoc origins must not accidentally claim a GitHub issue.

### KD5 — Seed origin metadata before Temporal workflow start

Extend `Store.changes.create` with optional creation metadata. Disk store stamps `origin`, fast-follow lineage, and repo scope metadata into the `Change` before saving. Temporal store starts the workflow from that stamped change so workflow state and search attributes see the same authoritative origin from creation.

### KD6 — Preserve compatibility

Existing valid create/update/proposal flows remain compatible:

- Omitted artifact fields keep prior behavior.
- Existing create calls without origin remain valid.
- `triage` may carry issue/source metadata; `roadmap` still requires issue metadata.
- No dedicated repair tool is added in this change.

## Review Remediation

Acceptance review found and fixed two correctness gaps:

1. `createChangeScaffold` now rejects blank provided scaffold artifact content before any file write.
2. `executiveSummary` artifact metadata now participates in the Temporal `updateArtifactMetadataSignal` path and `ChangeWorkflowState.artifacts` type.

A minor closeBatch message spacing typo was also fixed adjacent to the touched Temporal store code.

## Validation Strategy

- Red/green tests for preflight, tool execute, storage, origin matrix, and Temporal seed state.
- Targeted regression for affected files.
- `pnpm run check`.
- Full `pnpm test`.
- `adv_change_validate --strict`.
- Contract review matrix before acceptance.