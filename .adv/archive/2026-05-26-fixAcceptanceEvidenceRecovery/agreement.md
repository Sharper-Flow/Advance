# Agreement

## Objectives

1. Make acceptance proof durable before user acceptance is requested.
2. Treat `contract.reviewMatrix`, generated `acceptance.md`, and `executive-summary.md` as required acceptance proof for new contract-era changes.
3. Ensure Temporal receives workflow-visible evidence markers for required acceptance proof before acceptance gate completion.
4. Keep acceptance pending/stuck when required proof is missing, stale, failing, or not workflow-visible.
5. Support audited completed-workflow/poisoned-history repair for old stuck changes, including the PokeEdge-style state where approval happened but evidence/gate persistence failed.
6. Preserve ADV's signal/query-only workflow architecture and avoid Temporal update handlers.
7. Encode the no-late-homework rule in specs, command contracts, tooling, and tests.

## Success Criteria

1. Acceptance proof exists durably before the acceptance approval prompt.
2. Required acceptance evidence is represented in workflow state or in an explicitly audited recovery projection.
3. Stuck completed/poisoned workflow states can be repaired without manual ADV state-file edits.
4. Missing or invalid proof yields deterministic blockers instead of heuristic agent judgment.
5. Healthy acceptance flow remains structurally compatible with existing signal/query workflow architecture.

## Acceptance Criteria

1. `/adv-review` must persist and verify `contract.reviewMatrix`, generated `acceptance.md`, and `executive-summary.md` before presenting acceptance approval.
2. Acceptance gate completion must fail with deterministic blockers when any required acceptance proof is missing, stale, failing, or not workflow-visible.
3. `executive-summary.md` must be workflow-known acceptance evidence, not only a communication artifact.
4. Completed/poisoned workflow recovery must support audited repair for review matrix, executive summary, and acceptance gate completion.
5. Recovery must require precise evidence, recovery rationale, and prior user approval evidence; no silent repair.
6. Chat approval alone must never mark acceptance done when required proof failed to persist.
7. Healthy paths remain signal/query-only; no Temporal `defineUpdate` reintroduction.
8. Specs and `/adv-review` docs encode the no-late-homework rule.
9. Regression tests cover healthy path, missing evidence blockers, completed workflow recovery, poisoned recovery, and rejection without recovery evidence.
10. `pnpm run check`, `pnpm run build`, and relevant/full tests pass.

## Constraints

- Specs are law: update `advance-workflow` before or with implementation.
- Required acceptance proof must be persisted and verified before acceptance approval prompt.
- `executive-summary.md` is acceptance proof for this change's target behavior.
- Recovery must be explicit, audited, and evidence-gated.
- Do not silently mark acceptance done from chat approval alone when required proof failed to persist.
- Preserve Temporal signal/query-only change workflow surface; do not reintroduce `defineUpdate`.
- Use deterministic readiness blockers and typed evidence, not LLM judgment, for gate correctness.
- Do not require manual reads or edits under ADV state directories.
- Keep release/archive ordering scope with `fixArchiveReleaseOrdering`; this change owns acceptance evidence only.

## Avoidances

- Manual ADV state-file editing as a supported repair path.
- Heuristic chat-history reconstruction as proof.
- Caller-forged artifact metadata as authoritative evidence.
- Silent recovery without recovery evidence, user approval evidence, and rationale.
- Treating `executive-summary.md` as optional communication-only material for acceptance.
- Broad release/archive behavior changes unrelated to acceptance proof.
- New Temporal update handlers on change workflows.

## Out of Scope

- Fixing PokeEdge app logic or `fixSetPriceSorting` implementation.
- Broad dirty-main checkpointing, worktree cleanup, or archive finalization sequencing.
- Reworking proposal/discovery/design/planning/execution gates except for shared evidence infrastructure needed by acceptance.
- Adding external services or dependencies.

## Preview Applicability

visual_surface: false

Rationale: this is internal ADV workflow/tooling behavior. It affects CLI/tool outputs and durable workflow state, not browser-visible or visual output.

## Decisions

### User Decisions

1. Executive summary semantics
   - User chose: `Acceptance proof`.
   - Meaning: `executive-summary.md` must be workflow-known required acceptance evidence, not only release/sign-off narrative material.
   - Why it matters: this closes the gap where `/adv-review` requires the artifact before prompt but workflow readiness does not know about it.
2. Old stuck changes
   - User chose: `Audited repair`.
   - Meaning: PokeEdge-style completed/poisoned workflow states should be recoverable with explicit evidence, rationale, and validation.
   - Why it matters: prevents valid verified work from remaining permanently blocked while avoiding silent repair.
3. Late persistence failure after chat approval
   - User chose: `Not accepted yet`.
   - Meaning: chat approval alone is insufficient when required proof failed to persist; acceptance remains pending/stuck until proof is persisted or recovered.
   - Why it matters: enforces no-late-homework semantics structurally.

### Agent Decisions (LBP)

1. Preserve signal/query architecture and add structural evidence markers/recovery; do not use Temporal updates.
2. Reuse existing completed/poisoned recovery classification patterns from `contract.ts`, `gate.ts`, and archive recovery.
3. Add deterministic readiness blockers for required acceptance evidence instead of prompt-only guidance.
4. Add an artifact/evidence recovery writer pattern analogous to existing task/gate/status recovery writers.
5. Keep release/archive ordering work out of scope and coordinate via existing related changes.

## Deferred Questions

None.

## Sign-Off

Acceptance criteria approved by user via chat reply: `approve`.