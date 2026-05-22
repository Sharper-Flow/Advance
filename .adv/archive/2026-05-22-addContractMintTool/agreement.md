# Agreement

## Objectives

1. Provide deterministic agreement-to-ChangeContract parser that produces stable IDs, source hashes, and validated approvedAt timestamps.
2. Add production `adv_contract_mint` and `adv_contract_review_matrix_set` tools wired through Temporal signals with dry-run, force, target-path, and poisoned-history recovery support.
3. Add acceptance/gate compatibility support for explicit acceptance-only recovery rationale without weakening healthy contract checks.
4. Preserve contract proof fields through Temporal re-import/re-seed via shared change-to-workflow projection helpers.
5. Enforce structural discovery readiness blocker when agreement is present but contract is missing.
6. Add discover/review/prep guidance for contract preflight and tool bootstrap/reload.
7. Add task `contract_refs` referential validation.

## Acceptance Criteria

1. `adv_contract_mint` produces a deterministic ChangeContract from an approved agreement with stable IDs, evidence policies, and source hash.
2. `adv_contract_mint` supports dry-run, force, target-path, and poisoned-history recovery.
3. `adv_contract_review_matrix_set` persists a typed review matrix through signal or recovery path.
4. `adv_gate_complete acceptance` accepts an explicit `compatibilityReason` for legacy/replay recovery.
5. Temporal re-import/re-seed preserves contract, acceptanceCriteria, documents, and artifacts on a Change.
6. Discovery gate blocks on `DISCOVERY_CONTRACT_MISSING` when agreement is present and contract is absent.
7. Task `contract_refs` referencing unknown contract items are rejected by validation.
8. Targeted vitest, `pnpm run check`, and `pnpm run build` pass.

## Constraints

- Preserve healthy-path signal semantics for non-recovery contract operations.
- No direct ADV state file editing outside the documented recovery helpers.
- No Temporal DB surgery.

## Avoidances

- Do not weaken contract-proof checks; recovery still requires explicit recoveryMode + recoveryEvidence.
- Do not silently downgrade missing-workflow errors to poisoned-history recovery.

## Sign-Off

(Reconstructed agreement after empty-artifact regression. Original work shipped on trunk; see executive-summary.md for delivery report.)