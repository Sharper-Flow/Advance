# Agreement: Caveman-compress ADV instruction surfaces

## Current-State Evidence
- `docs/command-voice-standard.md` already defines runtime voice as "terse/caveman-lite" but does not explicitly state how it composes with prose-load compression templates for instruction docs.
- `docs/command-voice-standard.md § Prose-Load Reduction Rules` defines enforcement classes and compression templates; new work must extend/combine these, not duplicate them.
- `ADV_INSTRUCTIONS.md` line guard exists in `plugin/src/adv-skill-backed-commands-assets.test.ts`: warn >650, fail >950.
- `.opencode/token-budgets.json` baseline says `advInstructionsLineBaseline: 746`; current file is above baseline and close to hard guard.
- `docs/prose-load-inventory.md` is post-compression archive; durable rules belong in specs/tests, not inventory.

## Objectives
- Document how terse/caveman-lite voice composes with ADV prose-load methodology.
- Compress `ADV_INSTRUCTIONS.md` using existing prose-load templates plus terse/caveman-lite style while preserving contracts.
- Keep exact tool names, gate names, statuses, commands, errors, MUST/NEVER language, and approval boundaries.
- Verify with existing asset tests and line guard.

## Acceptance Criteria
1. `docs/command-voice-standard.md` defines caveman/terse compression composition rules for agent-facing prose.
2. `ADV_INSTRUCTIONS.md` is shorter than current file and under the hard line guard.
3. Tests verify critical ADV contract phrases still exist.
4. `scripts/sync-global.sh --check` passes after sync.
5. No runtime code, schema, or state behavior changes are introduced.

## Non-Goals
- Public docs full rewrite.
- Runtime behavior changes.
- Compression that obscures safety warnings or irreversible actions.
- New competing compression methodology separate from existing prose-load infrastructure.

## Constraints
- Do not compress JSON/code examples.
- Keep approval/checkpoint wording unambiguous.
- Keep destructive/cancellation/archive warnings normal enough for safety.
- Do not alter tool calls, enum values, or command syntax.