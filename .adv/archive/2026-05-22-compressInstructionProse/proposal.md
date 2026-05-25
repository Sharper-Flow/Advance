# Proposal

Apply caveman-full compression to audited ADV instruction, command, agent, and skill files while preserving protocol meaning.

## Problem

Recent ADV command/instruction/skill additions landed after the previous caveman-full maintenance pass. Some active instruction surfaces now carry verbose prose and stale `caveman-lite` references, increasing prompt load and conflicting with the intended caveman-full standard.

## Scope

In scope:

- Active ADV instruction surfaces: `ADV_INSTRUCTIONS.md`, `AGENTS.md`, `.opencode/agents/`, `.opencode/command/`, `skills/`, and supporting prose-load docs/tests.
- Current-style label normalization from stale `caveman-lite`/`caveman-light` wording to `caveman-full`.
- Prose-load inventory update for this compression pass.
- Structural verification through stale-label search, token snapshots, focused asset/drift checks, and `pnpm run check`.

Out of scope:

- Runtime behavior changes.
- Tool schemas, enums, gate IDs, statuses, or command semantics.
- Broad documentation rewrites outside audited instruction surfaces.
- Archive/changelog history rewrites unless the mention is active instruction semantics.

## Success Criteria

- Active ADV instruction surfaces use `caveman-full` as the current normative style label.
- Audited active instruction assets have obvious compression wins applied without reducing protocol clarity.
- Behavioral contracts remain unchanged.
- Verification is machine-backed, not visual-only.

## Constraints

- Preserve exact contract tokens: tool names, gate IDs, statuses, slash commands, enum values, quoted errors, `MUST`, `NEVER`, approval checkpoints, cancellation approval, archive sign-off, JSON/code examples.
- Keep prose-load enforcement-class templates as the governing compression framework.
- Do not edit ADV external state files directly.
- Prefer obvious safe compression wins over perfect compression.

## Discovery Agenda

1. Identify active stale caveman labels.
2. Audit active instruction surfaces for verbose segments with safe compression benefit.
3. Confirm prose-load inventory and tests that enforce the style surface.
4. Define structural verification for label and contract-token preservation.

## B/F/S Scan

- Bugs: stale label references may mislead agents about the current voice standard.
- Features: none; this is maintenance/compression.
- Specs: no spec deltas expected; existing prose-load requirements govern the work.
