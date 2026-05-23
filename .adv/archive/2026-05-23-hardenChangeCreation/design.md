# Design

## Architecture Overview

Harden ADV tool-call argument handling at the tool boundary. Keep correctness structural and provider-agnostic:

1. **Shared preflight policy layer** in `plugin/src/utils/tool-arg-preflight.ts` validates and, where explicitly safe, normalizes placeholder values before any tool `execute` function runs.
2. **Registry integration** in `plugin/src/tool-registry.ts` passes normalized args into `execute` when preflight succeeds.
3. **Tool-local field policies** define which fields reject blanks, reject sentinel strings, normalize empty arrays/objects to omission, or pass through unchanged.
4. **Execute paths keep only defensive checks** for safety and external-state validation that preflight cannot own.
5. **Tests and specs lock behavior** across `adv_change_create` and representative placeholder-sensitive ADV tools.

Runtime validation and tests own correctness; MCP/Zod schema guidance remains advisory.

## Key Decisions

### KD1 — Preflight owns placeholder policy

Primary validation lives in `tool-arg-preflight.ts`, not scattered execute functions. Extend `ToolArgPreflightResult` with `normalizedArgs`, add a non-formatting `preflightToolArgs(...)` helper, and let `tool-registry.ts` call `execute(preflight.normalizedArgs, contextOrExtra)` when valid.

### KD2 — Reject by default for audit/path/linkage/ID/execution fields

Reject blank/whitespace placeholders for evidence, recovery, path, ID, origin/linkage, command, gate, workflow, and durable-state fields. Do not treat sentinel strings like `"none"`, `"n/a"`, `"null"`, or `"transcript"` as correctness authority.

### KD3 — Normalize only explicit omission-equivalent placeholders

Normalize only when omission and the placeholder are semantically identical and audit-safe. Empty `scope_repos: []` is a candidate for omission-equivalent normalization if product-linked defaults must remain active. If uncertain, reject with actionable diagnostics.

### KD4 — `adv_change_create` gets canonical minimal example and repair envelope

Add minimal ad hoc payload guidance and error repair shape:

```json
{
  "summary": "Add rate limiting",
  "capability": "advance-workflow",
  "proposal": "...",
  "problemStatement": "..."
}
```

Only `summary` is required. Omit all unused optional fields. Preflight errors may include `canonical_minimal_payload` plus field-specific invalid entries.

### KD5 — Keep preflight pure and synchronous

Preflight does not call filesystem, git, Temporal, network, store, or cross-project validators. Execute still owns real path checks, parent existence, target project routing, workflow safety, and state-loaded permission semantics.

### KD6 — Provider matrix is evidence, not branching

| Provider path | Placeholder pattern reproduced | Classification | Design response |
|---|---:|---|---|
| GPT-class | Yes, observed in-session | schema-structural + model-behavioral contributory | structural preflight + examples |
| Claude-class | Less frequent by user report | unknown/contributory | same structural handling |
| GLM/open-weights/other | Less frequent by user report | unknown | same structural handling |

No provider-specific runtime branch unless later tests prove a structural need.

## ADR Drafts

No ADR. Decisions are local tool-boundary hardening choices and reversible through the same spec/test surfaces.

## Implementation Strategy

1. Extend preflight result with `normalizedArgs`.
2. Update `tool-registry.ts` to pass normalized args into execute.
3. Add explicit field policies for `adv_change_create` and high-risk representative fields across task, wisdom, test, gate, change close/reenter, worktree, conformance, and agenda tools.
4. Keep origin matrix strict and add create-time checks for target/source/lineage/scope placeholders.
5. Add canonical minimal create payload guidance and error repair envelope.
6. Add/update spec requirements: `rq-changeCreateMinimalAdhoc01`, `rq-toolPlaceholderPolicy01`, `rq-toolArgPreflightSingleSource01`.
7. Add data-driven preflight matrix tests, origin regression rows, registry normalized-args test, and representative execute-parity tests.

## LBP Analysis

Best long-term path: structural validation at the tool boundary, not agent prose. This handles provider differences uniformly and preserves strict origin/audit semantics.

Rejected alternatives:
- Description-only guidance — not structural.
- Zod transforms/preprocess only — not reliable as MCP JSON Schema guidance.
- Generic trim all strings — unsafe for audit/path/ID/evidence fields.
- Split `adv_change_create` now — larger API change than needed.

## Affected Components

- `plugin/src/utils/tool-arg-preflight.ts`
- `plugin/src/tool-registry.ts`
- `plugin/src/tools/change.ts`
- `plugin/src/tools/task.ts`
- `plugin/src/tools/wisdom.ts`
- `plugin/src/tools/test.ts`
- `plugin/src/tools/gate.ts`
- `plugin/src/tools/adv-worktree.ts`
- `plugin/src/tools/conformance.ts`
- `plugin/src/tools/agenda.ts`
- `plugin/src/utils/tool-arg-preflight.test.ts`
- `plugin/src/tools/change-origin.test.ts`
- `.adv/specs/advance-workflow/spec.json`

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Over-broad rejection breaks harmless read filters | Apply policy only to durable/audit/path/workflow/execution/semantic-filter fields. |
| Normalization hides intent | Reject by default; normalize only omission-equivalent fields. |
| Preflight and execute diverge | Centralize helpers; add regression tests; remove duplicate create validation where safe. |
| Provider-specific issue persists | Add schema examples and provider matrix; keep runtime provider-agnostic. |
| Preflight becomes side-effectful | Keep pure/sync; no fs/store/Temporal imports. |

## Design Leverage Scout

Candidates considered: 5. Auto-adopted: 5. Surfaced to user: 0.

Adopted:
- Field-policy registry plus `normalizedArgs`.
- Explicit policies, not blanket trimming.
- Existing error envelope + `canonical_minimal_payload`.
- Data-driven preflight regression matrix.
- Pure/sync preflight boundary.

## Validator Result

`VALIDATED`.

Findings:
- Correctness: design solves all approved ACs; preflight-as-single-source plus `normalizedArgs` closes create/update validation drift.
- Simplicity: field-policy registry is right granularity; Zod transforms and blanket trimming are unsafe alternatives.
- Spec-law compliance: no contradiction with `rq-backlogCoord08`; new requirements are additive to existing `rq-toolArgBlankArtifactLinkage01`.
- Caution: prefer per-tool exported field policies registered into preflight over one monolithic central map, to preserve locality of behavior.

Recommendation: proceed. Implementation should keep `tool-arg-preflight.ts` a thin pure executor and locate field policy ownership near each tool schema where practical.