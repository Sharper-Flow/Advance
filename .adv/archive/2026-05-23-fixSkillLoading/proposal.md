# Proposal

## Why

ADV command contracts do not clearly distinguish **orchestrator-needed skill content** from **sub-agent-needed skill content**. Some commands load whole skills in main context even when large parts of the skill only guide spawned workers. This risks avoidable context bloat and inconsistent patterns across ADV commands.

## What Changes

- Establish a responsibility-based loading policy for command/skill pairs.
- Inventory and classify all active command `skill(...)` references.
- Add structural tests for taxonomy coverage, phantom skill refs, fallback/degradation, and worker skill availability assumptions.
- Update scout command/spec wording so the orchestrator keeps routing/schema/degradation authority while worker-only prompt content can move to worker context or prompt packets.
- Remove, fix, or explicitly allowlist stale/missing skill refs.

## Success Criteria

1. Command/skill loading taxonomy is documented.
2. All active command `skill(...)` refs are inventoried and classified.
3. Missing/stale refs are removed, fixed, or allowlisted with rationale.
4. Worker self-load assumptions are tested for no explicit deny plus fallback.
5. Scout semantics remain bounded and equivalent.
6. Asset/spec tests fail for future drift.

## Scope

### In Scope

- `ADV_INSTRUCTIONS.md` command-vs-skill policy.
- `.opencode/command/*.md` skill-loading refs and scout wording.
- `skills/adv-*/SKILL.md` split/orchestrator/worker notes where needed.
- `.adv/specs/advance-meta/spec.json`, `.adv/specs/adv-discover/spec.json`, `.adv/specs/advance-workflow/spec.json`.
- Command/skill asset tests under `plugin/src/`.

### Out of Scope

- Replacing or renaming ADV sub-agents.
- Changing the seven-gate lifecycle.
- Runtime token accounting.
- Global prompt optimization unrelated to command/skill boundaries.

### Must Not

- Must not give workers ADV state, gate, checkpoint, or adoption authority.
- Must not remove fallback/degradation paths.
- Must not rely on prose-only policy where tests can enforce it.
- Must not leave missing refs unclassified.

## Affected Code

- `ADV_INSTRUCTIONS.md`
- `.opencode/command/adv-discover.md`
- `.opencode/command/adv-design.md`
- `.opencode/command/adv-harden.md`
- `.opencode/command/adv-slop-scan.md`
- `.opencode/command/adv-audit.md`
- `.opencode/command/adv-refactor.md`
- `.opencode/command/adv-tron.md`
- `.opencode/command/ship.md` if scan scope includes non-ADV commands
- `skills/adv-opportunity-scout/SKILL.md`
- `.adv/specs/advance-meta/spec.json`
- `.adv/specs/adv-discover/spec.json`
- `.adv/specs/advance-workflow/spec.json`
- `plugin/src/adv-skill-backed-commands-assets.test.ts` and/or new phantom-skill test

## Related Repositories

Current repo only: `advance`.

## Constraints

- Preserve ADV gate/state authority in orchestrator.
- Keep skills read-only.
- Keep sub-agent nesting forbidden.
- Prefer structural tests over prose assertions.

## Impact

- Reduces main-agent context load for worker-only methodology.
- Makes command/skill architecture more consistent.
- Prevents stale or phantom skill refs from accumulating silently.

## Discovery Findings

Discovery completed; see `agreement.md` for approved objectives and acceptance criteria. Key findings: command/skill references need taxonomy, missing skill refs need removal/fix/allowlist, worker self-load should be permissive but machine-verified, and `inlined-agent-methodology` is acceptable when optimal.
