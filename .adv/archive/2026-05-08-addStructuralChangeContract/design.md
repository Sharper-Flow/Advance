# Design: Structural Change-Contract Traceability

## Validator Verdict

Independent design validator verdict: **CAUTION**.

Assessment: architecture is sound and consistent with ADV patterns, but the draft needed specificity before the design gate. This design incorporates the required corrections:

1. Defines relationship between legacy `acceptanceCriteria?: string[]` and new contract items.
2. Defines required signal payloads.
3. Defines re-entry/amendment invalidation semantics.
4. Defines file-level placement.

No validator `CONFLICT` was reported. No user-value/product tradeoff requires design approval beyond the approved agreement.

## Architecture Direction

Add a lightweight **contract spine** to each change. The spine is typed state, not prose-only markdown.

- Typed `change.contract` is the source of truth once minted.
- `agreement.md`, review output, and archive artifacts are human-facing projections.
- Existing changes without `contract` remain valid and do not get archive-blocked by new checks.
- Contract checks activate only when `change.contract` exists.

## Source-of-Truth Rule

### Legacy `acceptanceCriteria` relationship

Current workflow state has `acceptanceCriteria?: string[]`. The new model must not create dual-source drift.

Rule:

- Before contract minting, `acceptanceCriteria?: string[]` remains valid legacy/projected state.
- After contract minting, `contract.items` with `kind: "acceptance_criterion"` is authoritative.
- `acceptanceCriteria` becomes a backward-compatible projection derived from `contract.items` for existing queries/output.
- Validators warn if both exist and diverge after contract minting.

## Schema Placement

### Type placement

- Add contract Zod schemas and inferred types in `plugin/src/types/changes.ts` or a new workflow-safe `plugin/src/types/contract.ts` exported from `plugin/src/types/index.ts`.
- Add task contract refs schema in `plugin/src/types/tasks.ts`.
- `plugin/src/temporal/contracts.ts` may use type-only imports only; no runtime Zod imports into workflow bundle.
- Workflow state gets optional `contract?: ChangeContract`.

### Candidate schemas

```ts
export const ContractRigorSchema = z.enum(["minimal", "standard", "strict"]);
export const ContractItemKindSchema = z.enum([
  "success_criterion",
  "acceptance_criterion",
  "constraint",
  "avoidance",
  "out_of_scope",
]);
export const ContractEvidencePolicySchema = z.enum([
  "test",
  "review",
  "static_check",
  "design_proof",
  "not_applicable",
]);
export const ContractItemStatusSchema = z.enum([
  "draft",
  "approved",
  "amended",
  "superseded",
  "waived",
]);
export const ContractEvidenceStatusSchema = z.enum([
  "pass",
  "fail",
  "respected",
  "violated",
  "unknown",
  "not_applicable",
]);

export const ContractItemSchema = z.object({
  id: z.string(),
  kind: ContractItemKindSchema,
  text: z.string(),
  sourceArtifact: z.enum(["proposal", "problemStatement", "agreement", "design"]),
  sourceHash: z.string().optional(),
  verificationRequired: z.boolean().default(true),
  evidencePolicy: ContractEvidencePolicySchema,
  status: ContractItemStatusSchema.default("draft"),
  notRequiredReason: z.string().optional(),
});

export const TaskContractRefsSchema = z.object({
  implements: z.array(z.string()).optional(),
  verifies: z.array(z.string()).optional(),
  respects: z.array(z.string()).optional(),
  not_applicable_reason: z.string().optional(),
});
```

## Workflow Signals

All state mutation follows existing signal/query-only workflow model.

Minimum signals:

1. `contractSetSignal`
   - Payload: `{ contract: ChangeContract; updatedAt: string }`
   - Used by discovery when agreement is approved and contract items are minted.
2. `contractAmendedSignal`
   - Payload: `{ amendments: ContractAmendment[]; invalidation: ContractInvalidation; updatedAt: string }`
   - Used when obligations are clarified, superseded, waived, or substantively changed.
3. `contractReviewMatrixSetSignal`
   - Payload: `{ reviewMatrix: ContractReviewMatrix; updatedAt: string }`
   - Used by review before acceptance sign-off.
4. Task ref mutation
   - Prefer extending existing task update payload/schema to carry `contract_refs` rather than adding a separate task-specific signal, unless existing task update flow cannot preserve structured refs cleanly.

Required wiring follows existing pattern:

- signal payload schema in `plugin/src/types/signals.ts` or workflow-safe signal type location;
- signal name in `CHANGE_WORKFLOW_SIGNAL_NAMES`;
- `wf.defineSignal` in `plugin/src/temporal/workflows.ts`;
- pure `apply*ToState` handler in `plugin/src/temporal/change-state.ts`;
- message alias updates if required;
- cache refresh through existing tool adapter pattern.

## Contract Item Rules

IDs are minted during discovery after agreement approval:

- `SC1..n` for success criteria.
- `AC1..n` for acceptance criteria.
- `C1..n` for constraints.
- `DONT1..n` for explicit avoidances / don’ts.
- `OOS1..n` for out-of-scope boundaries.

Proposal/problem obligations are absorbed into the approved agreement before minting. Agreement is the source artifact for the initial contract.

Evidence policy defaults:

- `AC-*`: `test` by default; `review` allowed for docs/process-only obligations.
- `C-*`: `test`, `static_check`, or `review`.
- `DONT-*` / `OOS-*`: `static_check`, `review`, or `design_proof`; executable tests only when meaningful.

## Task References

Add optional `contract_refs` to tasks:

```ts
contract_refs?: {
  implements?: string[];
  verifies?: string[];
  respects?: string[];
  not_applicable_reason?: string;
}
```

Validation:

- Unknown contract IDs are errors.
- For `standard` and `strict`, code tasks need at least one contract ref or explicit `not_applicable_reason`.
- Every required `AC-*` needs implementing/verifying coverage unless rigor is `minimal`.
- Mechanical/docs/verification-only tasks may be not-applicable with reason.

Validation location: contract coverage checks live in `plugin/src/validator/completeness.ts` or a small validator module called from completeness/`validateChange()`.

## Review Matrix

`/adv-review` creates and persists `contract.reviewMatrix` before user acceptance.

Construction model:

- Deterministic scaffold comes from `contract.items` + task `contract_refs` + task verification fields.
- Agent supplies verdict/status and concise evidence per row.
- Persist bounded structured rows, not unbounded raw logs.

Rows include:

```ts
{
  contractId: string;
  kind: ContractItemKind;
  status: "pass" | "fail" | "respected" | "violated" | "unknown" | "not_applicable";
  evidencePolicy: EvidencePolicy;
  evidence: string;
  notes?: string;
}
```

Review cannot complete acceptance if required rows are missing or unresolved unless the contract is formally amended/re-entered.

## Archive Validation

Archive does not redo product review. Archive verifies proof completeness.

Implementation location:

- Contract archive checks run in `adv_change_archive` / tool layer before firing archive signals or archive activity.
- `archiveChange()` / archive activity may generate `CONTRACT_TRACEABILITY.md` from typed state after checks pass.

Archive blocks when `change.contract` exists and:

- contract has required items but no review matrix;
- required item has no row;
- required row status is `fail`, `violated`, or `unknown`;
- task refs contain unknown contract IDs;
- an item was amended/waived/superseded without audit evidence;
- review matrix predates substantive contract amendment.

Archive skips contract checks for existing changes with no `contract` field.

## Re-Entry and Amendment Invalidation

Substantive contract changes must invalidate downstream proof.

Design decision: keep generic gate re-entry simple and handle contract-specific invalidation through contract amendment logic.

- `gateReenteredSignal` continues resetting gates and recording re-entry history.
- `contractAmendedSignal` records amendment intent and invalidates contract-derived proof.
- Workflows/commands that re-enter due to contract changes must also fire contract amendment/invalidation.

Invalidation by earliest affected gate:

| From gate | Contract invalidation |
|---|---|
| `discovery` | Re-mint affected contract items; clear review matrix; mark affected task refs stale/unknown until prep refreshes them. |
| `design` | Preserve contract IDs unless obligations changed; clear review matrix; record design-derived clarification/amendment. |
| `planning` | Clear review matrix; mark task refs stale if tasks are regenerated. |
| `execution` | Clear review matrix; keep task refs but validator checks affected items need fresh evidence. |
| `acceptance` | Clear review matrix and acceptance evidence. |
| `release` | Release re-entry does not change contract by default; if obligations change, route to earliest affected gate. |

Clarifications that do not change meaning:

- Keep ID stable.
- Update text/audit note.
- Do not clear proof unless evidence text no longer matches.

Substantive amendments:

- Append `ContractAmendment` with actor, reason, from/to, affected IDs, approval evidence, and invalidation scope.
- Mark replaced items `superseded` or `amended`.
- Clear stale review matrix rows.

## Rigor Levels

Stored at `contract.rigor`.

- `minimal`: contract summary + acceptance note; no full matrix. Allowed only when there are zero code tasks or explicitly docs/config-only scope.
- `standard`: default. IDs + task refs + review matrix.
- `strict`: standard plus stronger evidence requirements and archive blocking. Applies to security, cross-repo, architecture, public API, data migration, external conformance, or high-risk changes.

Discovery proposes rigor. Validator may escalate based on risk signals. For v1, escalation can be conservative and structural where possible; heuristics may warn/escalate but must not be sole authority for correctness-critical checks.

## Command Workflow Changes

- `/adv-discover`: mint contract after agreement approval, before discovery gate completion.
- `/adv-prep`: attach `contract_refs` to task graph.
- `/adv-review`: generate/persist review matrix before acceptance prompt.
- `/adv-harden`: treat unresolved required contract proof as validated in-scope finding.
- `/adv-archive`: block on missing/failing contract proof before archive execution; generate `CONTRACT_TRACEABILITY.md`.

## Tests / Verification Targets

- Type/schema tests for `ChangeContract`, `ContractItem`, `TaskContractRefs`, `ContractReviewMatrix`.
- Temporal workflow signal handler tests for contract set/amend/review matrix.
- Workflow bundle boundary tests remain green.
- Completeness/validator tests for missing refs, unknown refs, missing matrix, failing rows, rigor behavior.
- Re-entry tests for invalidation behavior.
- Archive tool tests for blocking behavior and `CONTRACT_TRACEABILITY.md` generation.
- Command asset tests for discover/prep/review/archive contract steps.

## Design Anti-Goals

- No enterprise ALM import/export, dashboards, arbitrary graph UI, or regulatory report suite.
- No markdown-only parser as source of truth.
- No fake executable tests for negative obligations.
- No accepted-debt loophole for failed in-scope acceptance criteria.
- No archive product re-review; archive only verifies proof completeness and release finalization.

## Open Items for Prep

- Decide exact file split: `types/contract.ts` vs adding to `types/changes.ts`.
- Decide whether task refs use top-level `contract_refs` or live under task `metadata` with typed schema. Preferred: top-level typed optional field.
- Decide exact archive artifact renderer path.
- Decide exact command-doc language for minimal rigor.