## Cross-Project Origin

> **Note:** This block was auto-injected because `target_path` pointed at the per-change worktree under `~/.local/share/opencode/worktree/...`. The worktree shares the same `adv_project_id` (`bdf259aa162ae192af5b18899ccdc653b085528d`) as the source path — there is **no separate target project** to consult. Treat this section as a tooling artifact, not as cross-project origin.

| Field | Value |
|-------|-------|
| Source project | advance |
| Source path | `/home/jrede/dev/oc-plugins/advance` |
| Worktree path | `/home/jrede/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/retireInvestmentGovernanceDeadweight` |
| Same `adv_project_id` | yes |

## Autopilot Mode

| Field | Value |
|-------|-------|
| `approved_mode` | `autopilot` |
| `autopilot_invoked_at` | `2026-05-07T22:42:00Z` |
| Routine checkpoints delegated | proposal, agreement (discovery), design, prep (planning), acceptance |
| Tier B preserved (will pause) | archive sign-off, cancellation approval |
| System interrupts preserved (will pause) | doom-loop (3+ retries), design CONFLICT, contract-compromise risk, drift detection, judgment-call surfacing |
| Gating discovery question | Are Phase J + Phase 1.5 functional intents covered elsewhere? — surfaces as **contract-compromise risk** if verification finds gaps |

# retireInvestmentGovernanceDeadweight

## Why

See `problem-statement.md` for problem statement, evidence, and desired outcome.

## What Changes

### Behavioral / surface removals

| Surface | Current | After |
|---|---|---|
| `/adv-prep` Phase J | Identifies upcoming user-value decisions, writes `change.judgment_calls[]` | **Removed.** Prep gate proceeds without judgment-call identification |
| `/adv-apply` Phase 1.5 | Inspects `change.judgment_calls[]`, surfaces unresolved entries via `question`, records `batch_surfaced_at` | **Removed.** Apply proceeds directly to Phase 2 (contract display) after Phase 1 (target resolution) |
| Hardstop tier surfacing | Advisory pause recommendation in /adv-apply Phase 1.5 banner | **Removed.** Tier classification removed from active surface |
| `change.judgment_calls[]` schema | Optional array on `Change` | **Read-passthrough only.** Archived changes carrying it remain readable; new changes do not initialize it |
| `change.batch_surfaced_at` schema | Optional ISO8601 audit anchor | **Read-passthrough only.** Same backward-compat treatment |
| Cost-governance instruction file | `~/.config/opencode/instructions/cost-governance.md` synced from `.opencode/instructions/cost-governance.md` | **Deleted at both ends; sync target removed** |
| Cost-governance skill | `skills/adv-cost-governance-methodology/SKILL.md` synced to `~/.config/opencode/skills/` | **Deleted at both ends; sync target removed** |

### Code-surface removals

| File | Action |
|---|---|
| `plugin/src/tools/investment.ts` | **Slim.** Keep `computePerGateDurations` (pure formatter, used by reflection). Decide tier fate via discovery-question 2 below. Remove `JudgmentCall` references, default thresholds if tier dropped, `threshold_tier` from tool output if tier dropped |
| `plugin/src/tools/investment.test.ts` | Update — drop tier-dependent tests if tier dropped, drop judgment-call coverage |
| `plugin/src/types/investment.ts` | Remove `JudgmentCallSchema`, `JudgmentCallCategorySchema`, `JudgmentCall`, `JudgmentCallCategory`. Tier types retained or removed per discovery-question 2 |
| `plugin/src/types/index.ts` | Remove judgment-call re-exports; tier re-exports per discovery-question 2 |
| `plugin/src/types/changes.ts` | Drop `judgment_calls` and `batch_surfaced_at` from active schema (passthrough for archived) |
| `plugin/src/storage/store-temporal/changes.ts` | Drop `judgment_calls` / `batch_surfaced_at` projection passthroughs at lines 123-124, 169-170 |
| `plugin/src/storage/store-disk.ts:370` | Drop `judgment_calls: []` initializer |
| `plugin/src/storage/change-selection.ts:160-161` | Drop `batch_surfaced_at` from "last activity timestamp" formula (other timestamps cover the case) |
| `plugin/src/tools/reflection.ts:341, 353` | Adapt — call `computePerGateDurations` directly (always available); tier call removed if tier dropped |
| `plugin/src/index.ts:734` | Drop comment referencing Phase 1.5 |
| `plugin/src/adv-autonomy-quality-assets.test.ts:315` | Update — assertion expects `adv_investment_report` mention in `adv-discover.md`, `adv-review.md`, `adv-archive.md`. Update to reflect new surface or remove |

### Workflow / agent surface updates

| File | Action |
|---|---|
| `ADV_INSTRUCTIONS.md § Investment Check-In` | Delete section |
| `.opencode/command/adv-prep.md` Phase J | Delete |
| `.opencode/command/adv-apply.md` Phase 1.5 | Delete; Phase numbering adjusted |
| `.opencode/command/adv-autopilot.md` Phase 1.5 references (lines 23-24, 101, 162) | Delete; replace with `rq-autonomy01` reference |
| `.opencode/agents/adv.md` | Update overlay (lines 125, 136, 203, 211 reference judgment calls / Phase 1.5) |
| `.opencode/agents/build.md:201` | Update large-scope-validity callout (drop "judgment calls (cost-governance Phase 1.5)" reference) |
| `.opencode/agents/adv-engineer.md:89` | Same |
| `rules.yaml` P28 | Delete (cost-governance rule) |
| `SETUP.md` lines 401, 417, 419 | Update — drop Phase J / opt-in references |
| `scripts/sync-global.sh` | Drop sync targets for cost-governance skill + instruction file |

### Spec deltas

| Spec | Action |
|---|---|
| `.adv/specs/advance-workflow/spec.json:1198` | Update scenario — remove `judgment_calls[]` mention |
| `docs/specs/advance-workflow.md:1093` | Mirror update |
| `rq-autonomy01` | **Survives unchanged** — confirmed canonical pause path |
| Spec deltas required for retirement of investment-governance requirements | TBD in `/adv-design` (depends on whether `rq-autonomy01` covers all surface intents) |

## Success Criteria

| ID | Criterion | Measurable |
|---|---|---|
| SC1 | All Phase J / Phase 1.5 / hardstop tier code paths removed from active workflow | grep `judgment_calls`, `Phase J`, `Phase 1.5`, `batch_surfaced_at`, `hardstop` in `plugin/src/tools/`, `.opencode/command/`, `.opencode/agents/`, `.opencode/instructions/`, `ADV_INSTRUCTIONS.md`, `rules.yaml` returns zero matches in active code (archived changes excluded) |
| SC2 | Reflection plane1 continues to emit `per_gate_ms` and `retry_total` correctly | `pnpm test plugin/src/tools/reflection.test.ts` passes; manual reflection on a fresh change produces the same plane1 metric shape |
| SC3 | Archived changes with `judgment_calls`/`batch_surfaced_at` remain readable | `adv_change_show` on `2026-05-04-fixStuckTemporalWorkerRecovery` (and 13 other archives carrying the fields) succeeds without schema errors |
| SC4 | Trunk verification clean | `pnpm run check` + `pnpm test` + `pnpm run build` all pass |
| SC5 | Cost-governance skill + instruction file removed from both repo and synced global locations | Files do not exist; `scripts/sync-global.sh --check` reports clean |
| SC6 | Umbrella agenda item `ag-55f13852` part 2 marked closed (false positive on smooth runs no longer reachable) | Agenda item updated with closure note referencing this change |

## Affected Code

See `What Changes` table — comprehensive grep already mapped during /adv-idea Phase 1b.

Primary surface: `plugin/src/tools/investment.ts`, `plugin/src/types/investment.ts`, `.opencode/command/adv-{prep,apply,autopilot}.md`, `.opencode/instructions/cost-governance.md`, `skills/adv-cost-governance-methodology/SKILL.md`, `rules.yaml` P28, `ADV_INSTRUCTIONS.md`.

## Related Repositories

None. Changes confined to `/home/jrede/dev/oc-plugins/advance` worktree.

## Constraints

- **Backward-compat for archived changes** — Read-passthrough for `judgment_calls`/`batch_surfaced_at` on archived/historical reads. New changes do not write these fields.
- **Trunk-is-prod (P32)** — Worktree isolation already in place at `change/retireInvestmentGovernanceDeadweight`.
- **Verification-driven scope** — The retirement is conditional on verification verdict (see Discovery Agenda question 1). The change MUST NOT proceed past discovery if verification finds gaps.
- **Sync-global.sh idempotence** — Must run cleanly after deletes and not flag missing skill/instruction files as drift errors.

## Impact

| Audience | Impact |
|---|---|
| ADV agents (this project) | Simpler /adv-prep and /adv-apply phases. One fewer phase hook in each. Pause for user-value tradeoffs continues via `rq-autonomy01` escape clause |
| ADV agents (downstream consumers via target_path) | Same — schema passthrough preserves cross-project compat |
| Existing users with custom thresholds in `cost-governance.md` | Config file deleted. Thresholds were never user-tunable in practice (file was synced read-only). Single-line note in CHANGELOG |
| Reflection plane1 consumers | No semantic change — `per_gate_ms` and retry counts continue. `threshold_tier` may drop from output (discovery question 2) |
| Archived change history | Untouched. `judgment_calls[]` remains readable as passthrough. No data loss |

## Context

- This change emerged from `/adv-idea` exploration of agenda umbrella `ag-55f13852` (Telemetry & Temporal follow-ups from fixTemporalContextMismatch)
- The investment governance system was originally introduced by `addCostTimeInvestment` (archived). It has not produced observed surfacing value since
- Today's archive (`fixWorkflowReplayDeterminism`) surfaced two additional dead-weight signals: `per_gate_ms` includes human-idle wall-clock (item 4 of umbrella) and reflection plane2 mirrors wisdom titles instead of capturing real friction (item 3). Both items are deferred to a follow-up reflection-quality change

## Discovery Agenda

Carry these unresolved questions into `/adv-discover` — they shape final scope.

1. **🚦 GATING — Are Phase J + Phase 1.5 functional intents covered by surviving mechanisms in observable practice?** Tracked separately as agenda item `ag-HrOggXLa` (HIGH). Sample 5 recent archived changes' `agreement.md` + `design.md`, check whether real user-value tradeoffs were surfaced during `/adv-discover` or `/adv-design`. Compare against `rq-autonomy01.1`–`.6` to confirm escape-clause coverage matches Phase 1.5's structural prompt.
   - **Verdict drives scope:** ✅ fully covered → retire as scoped above; ⚠ partially covered → enhance `/adv-discover` and/or `/adv-design` first; ❌ not covered → keep Phase 1.5 surfacing only, retire only the dead-letter parts (hardstop tier, judgment-call schema)
2. **Tier classification fate.** Should `classifyTier` and `ThresholdTier` survive in slimmed `adv_investment_report` for reflection plane1 informational purposes, or be dropped entirely? Reflection currently calls `classifyTier` directly with hardcoded thresholds — easy to drop if no consumer needs the categorical signal.
3. **Non-ADV consumers.** Does any non-ADV agent (build, plan, general, mechanic, prioritizer) reference `adv_investment_report` or its tier output? Quick grep across `.opencode/agents/*.md` should resolve.
4. **Asset-test update strategy.** `adv-autonomy-quality-assets.test.ts:315` asserts `adv_investment_report` is mentioned in `adv-discover.md`, `adv-review.md`, `adv-archive.md`. Update assertion to match new surface or remove the test entirely?
5. **Migration test coverage.** Tests covering Phase J / Phase 1.5 / judgment-call schema — convert to `archived` fixtures (verify passthrough), or remove outright?

## Scope

### In Scope

- Removal of Phase J in `/adv-prep`
- Removal of Phase 1.5 in `/adv-apply` and references in `/adv-autopilot`
- Removal of threshold-tier hardstop semantics (advisory or otherwise)
- Removal of `change.judgment_calls[]` and `change.batch_surfaced_at` from active schema (passthrough preserved for archived)
- Slimming of `plugin/src/tools/investment.ts` to metric formatters consumed by reflection
- Deletion of `.opencode/instructions/cost-governance.md`, `skills/adv-cost-governance-methodology/SKILL.md`, and synced global copies
- Update of agent overlays referencing judgment calls / Phase 1.5 / cost-governance
- Update of `rules.yaml` P28 (delete) and `ADV_INSTRUCTIONS.md § Investment Check-In` (delete)
- Spec scenario updates referencing `judgment_calls[]`
- Sync-script update to drop deleted assets
- Closure note on agenda item `ag-55f13852` part 2

### Out of Scope

- Doom-loop mechanism modifications
- `rq-autonomy01` modifications
- v2 design of any user-value-surfacing system
- Reflection plane1 metric shape changes (other than adapting to slimmed tool surface)
- Reflection plane2 quality improvements (separate change — items 3+4 of umbrella tracker)
- Per-gate-ms work-time calculation fix (item 4 of umbrella, separate change)
- Any change to how cross-project ADV consumers behave