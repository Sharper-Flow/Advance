# Design

## Architecture Overview

This is a **removal change**, not a feature. It strips a surface that has demonstrably produced zero observable value while preserving the durable-data backward-compat invariant. There is no new architecture introduced; the design is about coherent deletion sequencing across nine surfaces:

1. Plugin TypeScript (tool, types, schema, storage, reflection consumer + reflection storage schema, asset test)
2. Command files (`/adv-prep`, `/adv-apply`, `/adv-autopilot` — including phase renumbering to fix the existing duplicate `## Phase 2` heading in `adv-apply.md`)
3. ADV instructions (`ADV_INSTRUCTIONS.md`, `.opencode/instructions/cost-governance.md`)
4. Skills (`skills/adv-cost-governance-methodology/SKILL.md` + synced global copy)
5. Agent overlays (`adv`, `build`, `adv-engineer`, overlays/*.overlay.md)
6. Rules (`rules.yaml` P28)
7. Setup/changelog (`SETUP.md`, `CHANGELOG.md`)
8. Specs (`advance-workflow` scenarios referencing retired surfaces; `rq-autonomy01` survives unchanged)
9. Sync script (`scripts/sync-global.sh` cost-governance entries)

After retirement, the agent's structural pause path for user-value tradeoffs is `rq-autonomy01.3` (design approval conditional on tradeoffs) and `rq-autonomy01.6` (contract-compromise design pause). Tradeoffs land in the `## Key Decisions` section of `design.md` per current observed practice (verified during discovery).

## Key Decisions

### KD-1 — Slim `adv_investment_report` surface, keep the metric formatter

Retained in slimmed `plugin/src/tools/investment.ts`:
- `computePerGateDurations` (pure formatter, exported for reflection.ts)
- `adv_investment_report` tool registration
- Tool returns: `task_counts`, `elapsed_ms`, `active_elapsed_ms`, `retry_total`, `retry_density`, `doom_loop_active`, `per_gate_ms`, `token_hint`

Removed:
- `classifyTier`, `DEFAULT_THRESHOLDS`, `ThresholdsSchema`, `Thresholds` type
- `threshold_tier` output field
- `thresholds` argument on the tool

Rationale: reflection plane1 directly imports `computePerGateDurations` (line 341) and `classifyTier` (line 353). After this change, reflection imports only `computePerGateDurations`. The `threshold_tier: "auto"` field in plane1 output becomes informationally meaningless once Phase 1.5 surfacing retires — clean drop is preferred over partial keep.

### KD-2 — Schema cleanup uses `.passthrough()` for archived backward-compat

`Change` schema in `plugin/src/types/changes.ts:381` already terminates with `.passthrough()` (validator-confirmed). Drop the explicitly-declared `judgment_calls` and `batch_surfaced_at` optional fields. Archived bundles carrying these fields continue to load successfully — passthrough preserves them as unknown extra fields without schema errors. Two regression tests confirm:
1. Archived bundle with populated `judgment_calls[]` parses successfully and round-trips
2. Archived bundle with `batch_surfaced_at: <ISO>` parses successfully and round-trips

This is cleaner than maintaining two schema variants (active vs archived). The passthrough mechanism is the canonical compatibility lever in the type system.

### KD-3 — Storage cleanup pattern: drop active writes, preserve passthrough reads

| File | Active behavior change |
|---|---|
| `plugin/src/storage/store-temporal/changes.ts:123-124, 169-170` | Drop the explicit `judgment_calls` / `batch_surfaced_at` projection passthroughs. The full `Change` schema's `.passthrough()` covers archived reads automatically |
| `plugin/src/storage/store-disk.ts:370` | Drop `judgment_calls: []` initializer in new-change creation. New changes do not write the field |
| `plugin/src/storage/change-selection.ts:160-161` | Drop `batch_surfaced_at` from `getLastActivityTimestamp` formula. Other timestamps (created_at, task started/completed_at, gate completed_at) cover the recency case |

### KD-4 — Command file phase renumbering for `/adv-apply`

`.opencode/command/adv-apply.md` currently has a **latent duplicate-heading bug**: line 287 is `## Phase 1.5`, line 306 is `## Phase 2: Prep Gate Approval Verification`, line 327 is `## Phase 2: Display Contract`. Two `## Phase 2` headings live side-by-side.

Resolution after Phase 1.5 deletion:
- Phase 1: Target Resolution + Context Load (unchanged)
- Phase 1.5: Prep Gate Approval Verification (renamed from current `## Phase 2: Prep Gate Approval Verification`) — claims the freed slot; preserves the meaning that this is a verification, not a major phase
- Phase 2: Display Contract (unchanged)
- Phase 3+ (unchanged)

This fixes the duplicate-heading bug as a side effect of the retirement. Treats it as P23 campsite-rule cleanup within touched scope.

### KD-5 — `/adv-prep` Phase J deletion

Delete the `## Phase J: Identify Judgment Calls (addCostTimeInvestment)` section (lines 104-122 of `.opencode/command/adv-prep.md`). The phase sits between "Touched-Scope Quality Ownership" and "Phase 3: Validation + Completion" — clean removal preserves Phase 3's position.

### KD-6 — `/adv-autopilot` reference cleanup

`.opencode/command/adv-autopilot.md` references Phase 1.5 in 3 places (lines 23-24, 101, 162). Pattern:
- Lines 23-24: in the `Constraints` section, listing system interrupts
- Line 101: in Phase 3 (Execution) describing what is NOT replaced
- Line 162: in the System Interrupt Handling table

After retirement, the `Constraints` and Phase 3 references become stale; the system-interrupt table loses one row. Replace any remaining surface intent (user-value tradeoff pause) with a `rq-autonomy01.6` reference (contract-compromise pause) where contextually appropriate. Phase 1.5 lines: deleted entirely.

### KD-7 — Spec scenario cleanup is narrow, `rq-autonomy01` survives unchanged

Two spec scenarios reference retired surfaces (validator-verified `rq-autonomy01` body does NOT enumerate judgment calls):
1. `.adv/specs/advance-workflow/spec.json` — scenario near line 1198 mentions `judgment_calls[]` in /adv-apply Phase 1.5 surfacing → update to remove the reference
2. `rq-autonomy01.4` — given clause includes "no unresolved judgment call" → simplify to "no unresolved user-value tradeoff" (already the parent contract's framing). After retirement, `judgment_calls` is never populated so the existing precondition is vacuously satisfied — but the scenario should not reference a surface that no longer exists
3. `rq-autonomy01.5` — given clause references "Judgment-call surfacing (Phase 1.5)" → drop the parenthetical; replace with "user-value tradeoffs have been resolved at the design approval checkpoint per rq-autonomy01.3"

`rq-autonomy01` body, requirements, priority, tags, and the 7 enumerated checkpoints remain untouched. The contract is the canonical pause path. Validator confirmed no other requirement (across `advance-workflow`, `adv-prep`, etc.) depends on `judgment_calls` schema.

`docs/specs/advance-workflow.md:1093-1101` mirrors these scenario edits.

### KD-8 — Sync script deletion of cost-governance entries is mechanical

`scripts/sync-global.sh` line 130 declares `ADV_COST_GOVERNANCE_PATH`; lines 817-822 check it; lines 953-... patch it into `opencode.json` instructions array. Remove all references including the variable declaration. After the change, the script no longer manages a cost-governance file in the global config.

`opencode.json` instructions array (in `~/.config/opencode/opencode.json`) gets the cost-governance.md entry removed by `--fix` mode. Document this as a one-time sync step in CHANGELOG.

### KD-9 — Skill deletion at both ends

`skills/adv-cost-governance-methodology/SKILL.md` (repo) — deleted via `git rm`.

`~/.config/opencode/skills/adv-cost-governance-methodology/` (synced global) — deleted via standard sync delete propagation, OR explicitly via `rm -rf` if `sync-global.sh` does not handle skill deletes (verify during apply).

### KD-10 — Agent overlay updates use surgical edits, not rewrites

`.opencode/agents/adv.md`, `.opencode/agents/build.md`, `.opencode/agents/adv-engineer.md` are large files (200+ lines each). Surgical edits via `mcp_Edit` for the specific lines that mention "Phase 1.5", "judgment calls", "cost-governance" — preserves all other agent guidance unchanged.

For the synced versions in `~/.config/opencode/agents/`, the next `scripts/sync-global.sh --fix` propagates the trimmed source. Verify post-apply.

`.opencode/overlays/*.overlay.md` (managed blocks injected into shared global agents) — check for cost-governance / Phase 1.5 references; trim same way.

### KD-11 — Reflection storage schema co-removal (validator-surfaced gap)

The validator's CORRECTNESS review surfaced an oversight in the original draft. `plugin/src/storage/reflection.ts:39, 119` declares `threshold_tier` on the `ReflectionEntry.plane1.efficiency` shape (the durable reflection record schema), and `plugin/src/tools/reflection.test.ts:152` asserts the field exists. Co-removal required:

| File | Line | Action |
|---|---|---|
| `plugin/src/storage/reflection.ts` | 39 | Drop `threshold_tier` from `ReflectionEntrySchema.plane1.efficiency` |
| `plugin/src/storage/reflection.ts` | 119 | If `.passthrough()` is present (validator confirmed it is), archived reflection records carrying `threshold_tier` round-trip cleanly via passthrough — same pattern as Change schema |
| `plugin/src/tools/reflection.ts` | 353 | Drop `classifyTier` call |
| `plugin/src/tools/reflection.ts` | 536 | Drop `threshold_tier` from emitted reflection report |
| `plugin/src/tools/reflection.test.ts` | 152 | Update assertion to drop `threshold_tier` expectation |

Archived `reflections.jsonl` entries from prior reflections (today's `rf-TWH7zD7v` is one) carry `threshold_tier: "auto"` — passthrough preserves them. No data loss; no migration required. Add a regression test confirming archived reflection passthrough.

This KD is folded into Task Group 2 (Tool slimming) during prep.

## Implementation Strategy

Sequenced into 8 task groups. Each group is one or more tasks per the prep gate; this is the implementation strategy that prep will translate into a task graph.

| # | Group | Description |
|---|---|---|
| 1 | **Schema + types cleanup** | Drop `JudgmentCallSchema`, `JudgmentCallCategorySchema`, `ThresholdTierSchema`, related types, and active fields on `Change` schema. Slim `InvestmentReportSchema`. Update `types/index.ts` re-exports. Drop matching tests in `plugin/src/types.test.ts`. Add 2 regression tests confirming archived bundle passthrough |
| 2 | **Tool slimming + reflection co-removal** | `plugin/src/tools/investment.ts` — drop `classifyTier`, `DEFAULT_THRESHOLDS`, `ThresholdsSchema`, `Thresholds`, `threshold_tier` output. Update `plugin/src/tools/investment.test.ts`. Update `plugin/src/tools/reflection.ts:341, 353, 536` (drop classifyTier call + threshold_tier emission). Update `plugin/src/storage/reflection.ts:39, 119` (drop threshold_tier from schema, rely on passthrough). Update `plugin/src/tools/reflection.test.ts:152` (assertion update). Add regression test for reflection passthrough |
| 3 | **Storage cleanup** | `plugin/src/storage/store-temporal/changes.ts`, `plugin/src/storage/store-disk.ts:370`, `plugin/src/storage/change-selection.ts:160-161`. Add tests asserting active behavior |
| 4 | **Command file deletions** | `/adv-prep` Phase J delete, `/adv-apply` Phase 1.5 delete + duplicate-Phase-2 renumber fix, `/adv-autopilot` reference cleanup |
| 5 | **Instructions + skill deletion** | Delete `.opencode/instructions/cost-governance.md`. Delete `skills/adv-cost-governance-methodology/SKILL.md`. Trim `ADV_INSTRUCTIONS.md § Investment Check-In` and any other Phase J/1.5/judgment-call references |
| 6 | **Agent + rules + setup updates** | Surgical edits to `.opencode/agents/{adv,build,adv-engineer}.md` and `.opencode/overlays/*.overlay.md`. Delete `rules.yaml` P28. Update `SETUP.md` lines 401, 417, 419. Update `CHANGELOG.md` |
| 7 | **Sync script + global cleanup** | Update `scripts/sync-global.sh` to remove cost-governance entries. Run `--fix` to propagate. Manually delete `~/.config/opencode/skills/adv-cost-governance-methodology/` if needed. Update `opencode.json` instructions array |
| 8 | **Spec scenario updates + verification** | `.adv/specs/advance-workflow/spec.json` scenario at line 1198, `rq-autonomy01.4`, `rq-autonomy01.5` parenthetical. Mirror in `docs/specs/advance-workflow.md`. Update `plugin/src/adv-autonomy-quality-assets.test.ts:315`. Run `pnpm run check` + `pnpm test` + `pnpm run build`. Run `scripts/sync-global.sh --check`. Close agenda item `ag-55f13852` part 2 with closure note |

## LBP Analysis

**Why retire vs patch the umbrella bug?**

| Path | Pros | Cons |
|---|---|---|
| Retire (this design) | Removes ~250 lines tool + 291 lines skill + 2 phase hooks + spec entries + instruction file. Single canonical user-value pause path (`rq-autonomy01`). Closes umbrella item by elimination. Aligns with empirical zero-surfacing rate over 14 archives | Removes a system that was theoretically correct (just wrong-time/wrong-shape). Future user-value-surfacing system would need fresh design |
| Patch hardstop bug only | Minimal blast radius. Investment governance survives | Polishes deprecated surface. Empirical zero-surfacing remains. Two parallel surfacing paths (Phase 1.5 + design approval) for the same intent. Future-cost: every change to `/adv-prep` or `/adv-apply` must consider Phase J/1.5 interaction |
| Keep all, redesign for v2 | Most flexible | Highest cost. No evidence v2 would surface more than v1's zero |
| Keep Phase J as advisory metadata, retire Phase 1.5 + tier (validator-surfaced 4th alternative) | Preserves identification protocol | Phase J without Phase 1.5 is a write-only pipeline with no consumer. Requires keeping JudgmentCallSchema, judgment_calls field, Phase J prose, identification skill section. Non-trivial maintenance for zero demonstrated value |

LBP verdict: retire fully (path 1). The empirical evidence (0 surfacing across 14 archives, 5-archive verification of design.md absorbing the intent) is decisive. Validator confirmed all-at-once retirement is simpler than phased; validator confirmed alternative path 4 not recommended.

**Why drop tier classification entirely vs keep for reflection?**

Reflection's `threshold_tier: 'auto'` field becomes a label without behavior once Phase 1.5 retires. The classifier's only signal — "this change has crossed a threshold" — has no consumer. Reflection's plane1 already exposes raw `task_count`, `retry_total`, `doom_loop_active`, `per_gate_ms` — those are the actionable metrics. The categorical tier was always a derived label.

## Affected Components

Comprehensive in proposal.md `## What Changes` and agreement.md `## Acceptance Criteria`. Summary:

- **Plugin TS:** investment.ts, investment.test.ts, reflection.ts, reflection.test.ts, storage/reflection.ts (validator-surfaced), types/investment.ts, types/index.ts, types/changes.ts, types.test.ts, storage/store-temporal/changes.ts, storage/store-disk.ts, storage/change-selection.ts, index.ts, adv-autonomy-quality-assets.test.ts
- **Commands:** adv-prep.md, adv-apply.md, adv-autopilot.md
- **Instructions:** ADV_INSTRUCTIONS.md, .opencode/instructions/cost-governance.md (delete)
- **Skills:** skills/adv-cost-governance-methodology/SKILL.md (delete)
- **Agents:** adv.md overlay, build.md overlay, adv-engineer.md, overlays/*.overlay.md
- **Rules:** rules.yaml P28 (delete)
- **Setup:** SETUP.md, CHANGELOG.md
- **Specs:** advance-workflow/spec.json, docs/specs/advance-workflow.md
- **Sync:** scripts/sync-global.sh

## Risks / Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Archived bundle parse failure when fields removed from schema | Medium → Low | KD-2: rely on `.passthrough()` already in `Change` schema (validator-verified at types/changes.ts:381). Add 2 regression tests confirming archived bundles round-trip |
| Reflection plane1 consumers in downstream projects break on `threshold_tier` removal | Low | Reflection output is informational JSON; downstream readers tolerant of optional fields. Document removal in CHANGELOG |
| `adv-autonomy-quality-assets.test.ts:315` breaks if not updated | High → 0 | Task group 8 explicitly updates this test as part of verification |
| Sync script `--fix` leaves stale entries in `opencode.json` | Medium | Manual verification step in task group 7; `scripts/sync-global.sh --check` reports clean before archive |
| Latent references to Phase J/1.5 in archived/historical artifacts trigger asset tests | Medium | Asset tests scan `.opencode/command/`, `.opencode/agents/`, ADV_INSTRUCTIONS.md, etc. — not archived bundles. Verify scan paths exclude archive directories |
| Trunk-is-prod violation if mid-state commits land on trunk | Low | Worktree isolation already in place. ff-merge only after all task groups complete + verification clean |
| `rules.yaml` P28 removal in `~/.config/opencode/instructions/rules.yaml` (user-managed file) | Medium | Source-of-truth for rules.yaml is user's home directory, not repo. SETUP.md mentions this. Document removal in CHANGELOG; user manually removes P28 from their rules.yaml as a one-time sync step |
| Reflection storage schema field removal breaks archived reflection reads | Medium → Low | KD-11: validator confirmed reflection schema also uses `.passthrough()` at line 119. Same pattern as Change schema. Add regression test |

## Spec Delta Shape

Three operations on `.adv/specs/advance-workflow/spec.json`:
1. **Modify** `rq-autonomy01.4` scenario — drop "no unresolved judgment call" from given clause
2. **Modify** `rq-autonomy01.5` scenario — drop "Judgment-call surfacing (Phase 1.5)" parenthetical from given clause; replace with "user-value tradeoffs have been resolved at the design approval checkpoint per rq-autonomy01.3"
3. **Modify** the scenario at line 1198 (and the corresponding scenario block in `docs/specs/advance-workflow.md:1093-1101`) referencing `judgment_calls[]` — remove or simplify the line

No new requirements added. No requirements deleted. No requirements renamed. `rq-autonomy01` body, priority, and tags unchanged.

## Validator Result

**Verdict: VALIDATED (clean pass with one info-caution on alternative consideration).**

| Dimension | Level | Summary |
|---|---|---|
| 1. CORRECTNESS | info | Passthrough strategy confirmed sound; reflection plane1 threshold_tier is a clean drop. Change schema `.passthrough()` confirmed at `plugin/src/types/changes.ts:381` |
| 2. SIMPLICITY | info | All-at-once retire is simpler than phased — surfaces are tightly coupled (Phase J writes, Phase 1.5 reads). Partial retirement leaves dead-letter writes |
| 3. SPEC-LAW COMPLIANCE | info | No spec-law conflict. `rq-autonomy01.4` and `rq-autonomy01.5` survive cleanly via scenario edits; parent contract body does NOT enumerate judgment calls |
| 4. KEY ALTERNATIVES | caution | "Advisory-only Phase J" alternative considered. Recommended NOT taken — Phase J without Phase 1.5 is write-only with no consumer; provides no coverage beyond `rq-autonomy01` + organic Key Decisions |

**Validator implementation note (resolved inline as KD-11):** "the design should explicitly call out updating `plugin/src/storage/reflection.ts` lines 39, 119 (the `threshold_tier` field on the ReflectionEntry efficiency shape) alongside the reflection.ts line-353 classifyTier call — the schema definition and test assertion at reflection.test.ts:152 need co-removal." → Added as KD-11; folded into Task Group 2 during prep.

**Recommendation:** Proceed as designed. Design is sound and well-scoped.