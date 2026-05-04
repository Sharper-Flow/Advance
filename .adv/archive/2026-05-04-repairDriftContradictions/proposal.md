# Repair drift, contradictions, and redundancy in ADV agent instructions

## Summary

Single-bundle repair of 31 audit findings in ADV agent-facing instructions. Three CRITICAL, eight HIGH, eleven MEDIUM, nine LOW. Scope now includes code-backed manifest phaseGoal alignment for M9 per user decision.

## Goals

- Eliminate all internal contradictions in `ADV_INSTRUCTIONS.md`
- Align instruction text with current code reality: gate names, tool capabilities, line references, tool aliases, marker registry, state-file paths
- Add missing `phaseGoal` entries in `plugin/src/manifest.ts` so the Phase Goals contract is code-backed rather than weakened
- Remove low-value redundancy: repeated checkpoint list, dated annotations, ambiguous repeated "Skip for" wording
- Make every `[ADV:*]` marker in the instructions either declared with semantics or removed
- Apply medium-aggressive voice cleanup piece by piece: trim where safe; preserve safety-critical nuance

## Scope

### Files Touched

Primary edits:
- `ADV_INSTRUCTIONS.md` — main repair surface; most of the 31 findings
- `AGENTS.md` — command count and storage model drift
- `.opencode/instructions/cost-governance.md` — `auto.*` dead-knob clarification/removal
- `plugin/src/manifest.ts` — add missing `phaseGoal` entries for `adv-discover`, `adv-design`, `adv-reflect`, `adv-autopilot`
- `plugin/src/manifest.test.ts` — expand `WORKFLOW_COMMANDS` / expected phaseGoal assertions for the four new commands
- Manifest/asset tests touched as needed to cover phaseGoal additions and instruction drift guards

Verification-only reads:
- `plugin/src/types.ts`
- `plugin/src/tools/{status,temporal-ops,change}.ts`
- `plugin/src/storage/json.ts`
- `plugin/src/guards/task.ts`
- `plugin/src/adv-instructions-assets.test.ts`
- `scripts/sync-global.sh`
- `.adv/specs/*/spec.json`

## Out of Scope

- Spec changes; verified `rq-*` IDs already resolve
- New tools, gates, skills, or workflow semantics
- Provider-agent restructuring
- Full split of `ADV_INSTRUCTIONS.md` into multiple docs (future prose-reduction work only)
- Graceful in-place fallback for mutating worktree flows (explicitly rejected)
- `phaseGoal` for `adv-task` or `adv-validate` in this change. `adv-task` is a fast-track exempt command and `adv-validate` is a pure compliance check; neither is part of the final lifecycle-orchestrating phaseGoal expansion set.

## Success Criteria

- Zero direct contradictions remain in `ADV_INSTRUCTIONS.md`
- Gate names in Command Boundaries match canonical seven-gate model: proposal, discovery, design, planning, execution, acceptance, release
- `adv_status` and `adv_temporal_diagnose` target_path support is documented once and correctly
- Worktree-unavailable behavior is hard-block for mutating ADV flows
- Worktree tool names use canonical `adv_worktree_*` form
- `clarify_enforcement` line refs are removed or accurate
- `_contextSnapshot` default-vs-include behavior is unambiguous
- Forbidden ADV state file list covers current artifacts (`agreement.md`, `design.md`, `problem-statement.md`, `reflections.jsonl`, `conformance.json`, `archive/`, etc.)
- Sub-agent counts specify total spawned in batches of ≤3, not concurrent cap
- `[ADV:*]` marker registry is complete and non-duplicative
- Missing manifest `phaseGoal` coverage is added for `adv-discover`, `adv-design`, `adv-reflect`, and `adv-autopilot`
- Voice cleanup proceeds piece by piece with medium aggressiveness: compact obvious redundancy, keep safety-critical nuance
- `pnpm test` and `scripts/sync-global.sh --check` pass

## Discovery Findings

### Discovery Checklist

| Step | Status | Reason |
|---|---:|---|
| Lineage validation | PASS | Local change; no `cross_project_origin` or `fast_follow_of` present in `adv_change_show`. |
| Skill discovery | PASS | Trusted skills scanned. Relevant: `adv-worktree`, `adv-cost-governance-methodology`, `prioritizer` available. No new skill gap. |
| Prior research extension | PASS | No `temp/*.md` or `docs/*-prep.md` found. Relevant archives inspected: `fixparallelsubagentspawnguard`, `unifyworktreeunderadvmultisess`, `makeAdvContextEmissionSingle`, `skinnyProviderAdvAgents`. |
| Conflict & related-work scan | PASS | Active neighbors: `syncglobalpromptrefsinglefile`, `polishadvimprovecommanddoc`. No direct file conflict yet; coordinate if touching provider prompt sync docs or command docs. Agenda overlaps non-blocking. |
| Edge case investigation | PASS | Edge cases recorded below. |
| Design question depth | PASS | Three questions resolved by user. |
| Draft spec delta shapes | PASS | No spec deltas required. Manifest phaseGoal code edit does not alter ADV spec law. |
| P25 related-pattern scan | PASS | Similar historical worktree/prose patterns found; live scope remains listed files unless exact live instruction drift appears. |
| LBP check | PASS | LBP: align hot-path instructions with shipped code/specs; do not preserve stale fallback prose. |

### User Decisions

| Decision | User choice | Consequence |
|---|---|---|
| M9 Phase Goals | Add manifest phaseGoals | Scope includes `plugin/src/manifest.ts` and related tests. |
| LOW-tier voice cleanup | Happy medium between conservative/aggressive; go piece by piece | Planning should create reviewable tasks/chunks, not one giant compression sweep. |
| Worktree fallback | Hard block | Live instruction must say mutating ADV work stops if worktree tooling is unavailable. |

### Validator Refinements Applied

Independent validator returned CAUTION with two refinements. Both are incorporated:

1. Final phaseGoal expansion list is explicit: `adv-discover`, `adv-design`, `adv-reflect`, `adv-autopilot`.
2. Batch C explicitly updates `plugin/src/manifest.test.ts` `WORKFLOW_COMMANDS` and expected phaseGoal assertions for the four new commands.

### Current State Evidence

- `ADV_INSTRUCTIONS.md:161` uses retired gate labels: `research`, `prep`, `implementation`.
- `ADV_INSTRUCTIONS.md:464` says `adv_status`/`adv_temporal_diagnose` lack `target_path`; code shows target_path exists.
- `ADV_INSTRUCTIONS.md:524` cites stale `plugin/src/types.ts:1194-1196`; actual `clarify_enforcement` is later.
- `ADV_INSTRUCTIONS.md:935` says worktree tools unavailable → proceed in-place; line 904 says hard-block.
- `ADV_INSTRUCTIONS.md:183` and `:187` classify `[ADV:SKILL_CREATED]` in two origins.
- `ADV_INSTRUCTIONS.md:197/221/292` conflict on `_contextSnapshot` availability.
- `ADV_INSTRUCTIONS.md:650` documents cap `MAX_PARALLEL_SUBAGENTS = 3`; sub-agent table lacks total-vs-concurrent wording.
- `AGENTS.md:27` says 24 command files; actual `adv-*.md` count is 25.
- `AGENTS.md:17` still says `JSON + SQLite persistence`; later lines say Temporal-only.

### Edge Cases

| Gap | Edge cases / failure modes |
|---|---|
| Gate naming repair | Keep user-facing command names (`/adv-prep`) while fixing gate IDs (`planning`); update examples without breaking marker/asset tests. |
| target_path matrix cleanup | Do not overgeneralize target_path to tools that still lack it; make the matrix the single source. |
| Worktree fallback | Hard-block language must not leave `[ADV:INFO]` fallback; historical docs can remain but live instructions must be clear. |
| Marker registry | Keep spec-backed `[ADV:SKILL_CREATED]`; fix duplicate origin classification only. |
| Forbidden files list | Avoid brittle exhaustive-only list; examples plus wildcard/dir language prevents drift. |
| Phase Goals | Add four phaseGoal entries and update tests together; avoid behavior changes beyond metadata. |
| Voice cleanup | Trim redundancy piecewise; stop if a section is safety-critical or test-guarded. |

### Draft Spec Deltas

No spec deltas required. Existing specs already encode the laws this repair aligns with.

### Related Pattern Scan

- Historical docs still mention old worktree alias/fallback model; live instruction repair should not automatically rewrite all historical references.
- Command files correctly emit `[ADV:SKILL_CREATED]`, supporting single-origin classification as agent-emitted.
- Tool registry intentionally preserves aliases, supporting wording that canonical names are preferred while aliases remain backward-compatible.

### AMBIGUITY ANALYSIS

No blocking ambiguity findings.

| ID | Severity | Category | Finding | Evidence | Reason |
|---|---|---|---|---|---|
| B1 | LOW | Boundaries | M9 code-backed path expands scope to manifest/tests. | proposal.md:User Decisions "M9 Phase Goals | Add manifest phaseGoals" | Resolved by user. |
| F1 | LOW | Functional Scope | LOW-tier voice cleanup should be piecewise, not one sweep. | proposal.md:User Decisions "Happy medium between conservative/aggressive; go piece by piece" | Resolved by user. |
| S1 | LOW | Completion Signals | Success criteria are measurable and verification-backed. | proposal.md:Success Criteria "`pnpm test` and `scripts/sync-global.sh --check` pass" | Clear. |
| M1 | LOW | Missing Information | Worktree fallback direction was previously open. | proposal.md:User Decisions "Worktree fallback | Hard block" | Resolved by user. |

Coverage: B:C F:C S:C M:C D:N/A X:N/A Q:C I:C E:C C:C T:N/A

## Agreement Draft

### Objectives

1. Fix all 31 identified instruction findings in one bundled change.
2. Preserve ADV safety contracts while removing contradictory/stale prose.
3. Add manifest-backed phaseGoal coverage where docs claim manifest canonicality.
4. Keep docs aligned with source truth: specs + current `plugin/src` implementation.
5. Apply voice cleanup piece by piece, balancing brevity with safety.

### Acceptance Criteria

1. C1-C3 + H1-H8 repaired with before/after evidence.
2. M1-M11 repaired or explicitly closed with rationale.
3. L1-L9 repaired or explicitly closed with rationale; voice-density cleanup handled piece by piece.
4. `ADV_INSTRUCTIONS.md` has no direct contradictions after final read-through.
5. `AGENTS.md` no longer claims stale command count or SQLite persistence.
6. `cost-governance.md` no longer presents `auto.*` as an active tuning knob unless implementation confirms it is active.
7. `plugin/src/manifest.ts` has code-backed phaseGoal coverage consistent with Phase Goals doc claim.
8. Worktree-unavailable instruction hard-blocks mutating ADV work.
9. Verification passes: targeted asset tests, `pnpm test`, and `scripts/sync-global.sh --check`.

### Constraints

- No spec changes.
- No direct reads of ADV state files.
- Work continues in isolated worktree `change/repair-adv-instructions-drift`.
- Preserve generated/provider asset boundaries.
- Avoid broad historical-doc rewrite unless a live instruction or test requires it.

### Avoidances

- Do not rewrite workflow semantics.
- Do not expand into full prose-load-reduction project.
- Do not preserve graceful in-place fallback for mutating ADV work.

### Investment Snapshot

Investment: 0 tasks / 0 retries / tier: auto (pre-planning; task graph not synthesized yet).