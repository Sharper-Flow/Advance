# Agreement

## Objectives

1. Retire `/adv-prep` Phase J (judgment-call identification)
2. Retire `/adv-apply` Phase 1.5 (judgment-call surfacing)
3. Retire threshold-tier hardstop semantics (advisory or otherwise)
4. Retire `change.judgment_calls[]` and `change.batch_surfaced_at` from active schema (read-passthrough preserved for archived data)
5. Slim `plugin/src/tools/investment.ts` to the metric formatter `computePerGateDurations` consumed by reflection plane1; drop `classifyTier`, `ThresholdTier`, default thresholds, and `threshold_tier` output field
6. Delete `.opencode/instructions/cost-governance.md` and `skills/adv-cost-governance-methodology/SKILL.md` (both repo-local and synced global locations)
7. Delete `rules.yaml` P28 (cost-governance rule) and `ADV_INSTRUCTIONS.md § Investment Check-In`
8. Update `/adv-prep`, `/adv-apply`, `/adv-autopilot`, `.opencode/agents/{adv,build,adv-engineer}.md`, `SETUP.md`, `scripts/sync-global.sh`, and spec scenarios that reference the retired surfaces
9. Close umbrella agenda item `ag-55f13852` part 2 (hardstop false positive on smooth runs) by elimination
10. Maintain `rq-autonomy01` unchanged as the canonical user-value-tradeoff escape clause; verify trunk verification (typecheck + lint + test + build) is clean

## Acceptance Criteria

| ID | Criterion | Verification |
|---|---|---|
| AC1 | All Phase J / Phase 1.5 / hardstop tier code paths removed from active workflow | `rg "judgment_calls\\|batch_surfaced_at\\|Phase J\\|Phase 1\\.5\\|hardstop"` in `plugin/src/`, `.opencode/command/`, `.opencode/agents/`, `.opencode/instructions/`, `ADV_INSTRUCTIONS.md`, `rules.yaml`, `SETUP.md` returns zero matches in active code (archived bundles excluded) |
| AC2 | Reflection plane1 continues to emit `per_gate_ms` and `retry_total` correctly | `pnpm test plugin/src/tools/reflection.test.ts` passes; `adv_reflect` on a fresh test change produces plane1 with same metric shape minus `threshold_tier` |
| AC3 | Archived changes with `judgment_calls`/`batch_surfaced_at` remain readable | `adv_change_show` on `2026-05-04-fixStuckTemporalWorkerRecovery` (and ≥3 other archives carrying the fields) succeeds without schema errors; passthrough confirmed via dedicated regression test |
| AC4 | Trunk verification clean | `pnpm run check` + `pnpm test` + `pnpm run build` all pass on trunk after merge |
| AC5 | Cost-governance assets removed at both ends | Files do not exist at: `.opencode/instructions/cost-governance.md`, `skills/adv-cost-governance-methodology/SKILL.md`, `~/.config/opencode/instructions/cost-governance.md`, `~/.config/opencode/skills/adv-cost-governance-methodology/SKILL.md`. `scripts/sync-global.sh --check` reports clean |
| AC6 | Umbrella agenda `ag-55f13852` part 2 closed by elimination | Agenda item updated with closure note referencing this change ID |
| AC7 | `adv_investment_report` slimmed surface contract documented | Tool returns task counts, retry total, doom-loop signal, `per_gate_ms`. Does NOT return `threshold_tier`. Tool `description` and `args` schema reflect the slimmed surface |
| AC8 | Asset test `adv-autonomy-quality-assets.test.ts:315` updated | Assertion no longer requires `adv_investment_report` in `adv-discover.md` / `adv-review.md` / `adv-archive.md`. Test passes |

## Constraints

- **Backward-compat for archived changes** — `Change` schema's `.passthrough()` modifier preserves `judgment_calls[]` and `batch_surfaced_at` fields on archived bundle reads. No data loss
- **Trunk-is-prod (P32)** — Worktree isolation already in place at `change/retireInvestmentGovernanceDeadweight`
- **Verification-driven scope** — Confirmed ✅ FULLY COVERED. Retirement proceeds without `/adv-discover` or `/adv-design` enhancements
- **Sync-global.sh idempotence** — Must run cleanly after deletes, not flag missing skill/instruction files as drift errors
- **No new schema fields** — This is a removal change, not an extension
- **Cross-project consumers** — Read-passthrough preserves cross-project compat for any downstream ADV-enabled project that loaded historical changes

## Avoidances

- × Doom-loop mechanism modifications (separate, working, untouched)
- × `rq-autonomy01` modifications (survives unconditionally as canonical user-value pause path)
- × v2 redesign of any user-value-surfacing system (explicitly not happening — fresh design if needed in future)
- × Reflection plane1 metric shape changes beyond dropping `threshold_tier` (same metrics, slimmed shape)
- × Reflection plane2 quality improvements (separate change — items 3+4 of umbrella `ag-55f13852`)
- × Per-gate-ms work-time calculation fix (separate change — item 4 of umbrella)
- × Changes to how cross-project ADV consumers behave
- × Suggesting splitting this change based on size (P32 + Large-Scope-Validity rule — prep gate + autopilot delegation establishes scope)

## Decisions

### User Decisions

| Question | User Choice | Why It Matters |
|---|---|---|
| Direction for investment governance | Retire Phase J + Phase 1.5 + hardstop tier; keep `adv_investment_report` metrics for reflection | LBP — empirical zero-surfacing rate over 14 archives confirms dead weight; `rq-autonomy01` covers user-value pause intent |
| Verification before retirement | Add gating discovery question before agreement sign-off | Don't retire on assertion alone — verify functional intent coverage in observable practice (now confirmed ✅) |
| Approval mode for routine checkpoints | Autopilot via `/adv-autopilot` | Delegate proposal/agreement/design/prep/acceptance approvals; Tier B archive sign-off preserved |

### Agent Decisions (LBP)

| Question | Choice | Rationale |
|---|---|---|
| Tier classification fate (Q2) | Drop `classifyTier`, `ThresholdTier`, default thresholds, `threshold_tier` output field | Reflection plane1's only consumer of `threshold_tier` becomes informationally meaningless once Phase 1.5 surfacing retires. Cleaner drop than partial keep |
| Non-ADV consumers (Q3) | None — only `adv` orchestrator references `adv_investment_report` | Confirmed via grep across `.opencode/agents/*.md`; `adv-engineer` explicitly disables it |
| Asset-test update strategy (Q4) | Update assertion to drop requirement that `adv_investment_report` appears in `adv-discover.md` / `adv-review.md` / `adv-archive.md` | Those references are removed by this change; assertion would fail otherwise |
| Migration test coverage (Q5) | Add 1-2 regression tests confirming `Change` passthrough preserves `judgment_calls[]` / `batch_surfaced_at` on archived reads. Remove obsolete Phase J / Phase 1.5 / surfacing tests outright | `.passthrough()` already provides the storage behavior — testing it doesn't require converting whole test suites; one or two regression tests is sufficient |
| Spec delta strategy | Update existing scenarios that reference retired surfaces; add no new requirements | Removal change, not extension. `rq-autonomy01` survives unchanged |
| Worktree commit boundary | Two-or-more commits per task per `/adv-apply` step 3c.5 (checkpoint), then archive bundle commit, then ff-merge to trunk | Standard ADV apply protocol; trunk-is-prod invariant respected |

## Deferred Questions

None. All discovery questions resolved during this phase.

## Sign-Off

| Field | Value |
|---|---|
| Mode | autopilot |
| Approver | adv-autopilot (delegated by user invocation of `/adv-autopilot` at 22:42Z) |
| Approved at | 2026-05-07T22:44Z |
| Verification verdict (gating) | ✅ FULLY COVERED — Phase J + Phase 1.5 intents absorbed by `rq-autonomy01.3`, `rq-autonomy01.6`, `/adv-design` Key Decisions section, and `/adv-discover` Phase 4.5.1 |
| Tier B preserved | archive sign-off, cancellation approval |
| System interrupts preserved | doom-loop, design CONFLICT, contract-compromise risk, drift detection |