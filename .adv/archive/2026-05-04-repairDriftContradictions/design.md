# Design

## Architecture Overview

Repair the instruction surface through three coordinated edit streams:

1. **Instruction contract repairs** (`ADV_INSTRUCTIONS.md`) — fix gate names, target_path matrix, worktree failure behavior, marker registry, `_contextSnapshot` wording, forbidden state file list, sub-agent count semantics, checkpoint redundancy, and LOW-tier voice cleanup.
2. **Developer quick-reference repairs** (`AGENTS.md`, `cost-governance.md`) — fix stale command count/storage wording and clarify/remove inactive `auto.*` tuning semantics.
3. **Manifest phaseGoal alignment** (`plugin/src/manifest.ts` + `plugin/src/manifest.test.ts`) — add code-backed phase goals for missing lifecycle workflow commands so the ADV_INSTRUCTIONS Phase Goals claim remains true.

No spec changes: existing requirements already define the laws being restored in prose.

## Key Decisions

### KD-1 — Specs + current code are source of truth

When live prose conflicts with `.adv/specs/*` or `plugin/src/*`, update prose to match code/specs. Do not alter implementation to preserve stale docs except for user-approved M9 metadata alignment.

### KD-2 — Hard-block worktree tooling failure

Use the current Worktree Policy as canonical: mutating ADV work must run in a worktree. Remove live fallback wording that says proceed in-place. Historical archived docs may remain untouched unless referenced by live instruction tests.

### KD-3 — Canonical worktree tool names in live instructions

Use `adv_worktree_create`, `adv_worktree_delete`, `adv_worktree_cleanup` in ADV_INSTRUCTIONS. Backward-compatible aliases can be acknowledged only as aliases, not as primary commands.

### KD-4 — Marker registry is the single live marker source

Every live `[ADV:*]` marker used in ADV_INSTRUCTIONS is either in the table with semantics or removed. `[ADV:SKILL_CREATED]` remains agent-emitted because specs/commands require it; remove duplicate system-emitted classification.

### KD-5 — PhaseGoal coverage becomes explicit and tested

Add `phaseGoal` metadata for exactly four missing lifecycle workflow commands:

- `adv-discover` — discovery findings + agreement flow
- `adv-design` — concrete design + validation
- `adv-reflect` — durable post-completion reflection
- `adv-autopilot` — full pipeline delegation with safety stops

Do not add `phaseGoal` to `adv-task` or `adv-validate` in this change. `adv-task` is a fast-track exempt command; `adv-validate` is a compliance check. Both can keep existing descriptions without joining the lifecycle phaseGoal set.

### KD-6 — Voice cleanup is piecewise, not blanket compression

For LOW-tier findings L5/L8/L9: edit only sections touched by higher-severity repairs or obvious duplicates. Keep safety-critical rules where removing detail would harm agent behavior.

## Implementation Strategy

### Batch A — Tests first for manifest and instruction invariants

- Update `plugin/src/manifest.test.ts` `WORKFLOW_COMMANDS` to include `adv-discover`, `adv-design`, `adv-reflect`, `adv-autopilot`.
- Update `phaseGoal values match the user-approved phase goals` expected map for those four commands.
- Add targeted ADV_INSTRUCTIONS asset tests for the riskiest regressions:
  - no retired gate labels in Command Boundaries
  - no `adv_status`/`adv_temporal_diagnose` in no-target_path list
  - canonical `adv_worktree_*` names in Worktree Integration
  - no `[ADV:SKILL_CREATED]` duplicate system-emitted classification
  - `_contextSnapshot` opt-in wording present

### Batch B — CRITICAL/HIGH instruction repairs

Edit `ADV_INSTRUCTIONS.md` findings C1-C3 and H1-H8 first. Preserve section headings where tests depend on them.

### Batch C — Manifest phaseGoal alignment

Edit `plugin/src/manifest.ts` to add phaseGoal strings for `adv-discover`, `adv-design`, `adv-reflect`, and `adv-autopilot`. Update ADV_INSTRUCTIONS Phase Goals table to match the manifest-backed set.

### Batch D — Medium/LOW docs repairs

Edit `AGENTS.md`, `cost-governance.md`, and remaining medium/low ADV_INSTRUCTIONS findings. Voice cleanup uses piecewise review.

### Batch E — Verification and final contradiction pass

Run targeted tests, `pnpm test`, `scripts/sync-global.sh --check`, then a final line-oriented read-through for contradiction closure.

## LBP Analysis

Best long-term state: agent instructions are generated/validated enough that stale prose cannot silently contradict shipped code. This change does not solve full generation, but it adds tests around high-risk prose drift and moves phaseGoal canonicality closer to code.

## Affected Components

- `ADV_INSTRUCTIONS.md`: live agent operating contract
- `AGENTS.md`: developer-facing quick-reference
- `.opencode/instructions/cost-governance.md`: tunable investment governance config
- `plugin/src/manifest.ts`: command metadata source
- `plugin/src/manifest.test.ts`: phaseGoal guard
- `plugin/src/adv-instructions-assets.test.ts` or nearby asset tests: prose drift guards

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Manifest phaseGoal scope expands too far | Final list is exactly four new commands; `adv-task` and `adv-validate` are explicitly excluded. |
| Asset tests become brittle prose tests | Assert structural absence/presence, not exact paragraphs. |
| Voice cleanup removes safety nuance | Process piece by piece; close LOW findings as no-change where needed. |
| Empty optional artifact fields overwrite content | During implementation, call `adv_change_update` only with fields being changed; never pass empty strings. |
| Neighbor draft changes overlap | Check active changes before editing shared prompt/sync surfaces; current plan avoids provider sync docs. |

## Validator Result

Validator verdict: CAUTION.

Cautions resolved inline:
1. The design now explicitly updates `plugin/src/manifest.test.ts` `WORKFLOW_COMMANDS` and expected phaseGoal assertions.
2. The design now names the final phaseGoal expansion list and excludes `adv-task` / `adv-validate`.

No unresolved CONFLICT. No contract-compromise risk.