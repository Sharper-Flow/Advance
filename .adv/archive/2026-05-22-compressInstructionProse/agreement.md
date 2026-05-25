# Agreement

## Objectives

1. Apply caveman-full compression to audited active ADV instruction surfaces.
2. Replace stale `caveman-lite`/`caveman-light` standard references with `caveman-full` where they govern current ADV command/instruction wording.
3. Preserve behavioral contracts exactly while reducing obvious prose load.
4. Make verification structural through inventory, token snapshots, focused tests, and full check.

## Success Criteria

- SC1: Active ADV instruction surfaces use `caveman-full` as the current normative style label where a caveman label is needed.
- SC2: Audited active instruction assets have obvious compression wins applied without reducing protocol clarity.
- SC3: Behavioral contracts remain unchanged.
- SC4: Verification is machine-backed, not visual-only.

## Acceptance Criteria

- AC1: Active ADV instruction surfaces no longer define current style as `caveman-lite` or `caveman-light`; normative wording uses `caveman-full`.
- AC2: All active audited instruction files are reviewed; segments with obvious compression benefit are compressed without reducing protocol clarity.
- AC3: Contract tokens remain intact: tool names, gates, statuses, slash commands, enums, quoted errors, `MUST`, `NEVER`, approval checkpoints, cancellation approval, archive sign-off, JSON/code examples.
- AC4: No runtime behavior, schema, or command semantics change.
- AC5: A fresh prose-load inventory pass records changed/reclassified sections and returns archive status at completion.
- AC6: Pre/post contract-token snapshots exist for in-scope files; diff is empty or intentional standard-name/test changes are justified.
- AC7: Focused asset/drift checks and `pnpm run check` pass from `plugin/`.

## Constraints

- C1: Prose-only compression except stale standard reference changes and matching tests.
- C2: Preserve required command frontmatter shape.
- C3: Keep safety, destructive-action, cancellation, and archive-signoff language unambiguous.
- C4: Existing prose-load enforcement-class templates remain the governing compression framework.
- C5: Compress obvious wins; do not pursue perfect optimization at the cost of protocol clarity.

## Avoidances

- DONT1: Do not delete contract-critical instructions only to reduce line count.
- DONT2: Do not alter workflow sequencing, gate ownership, approvals, cancellation approval, or archive sign-off.
- DONT3: Do not edit ADV external state files directly.
- DONT4: Do not treat `caveman-full` as a replacement for prose-load enforcement classes.
- DONT5: Do not rewrite archives/changelog history unless a mention is part of an active instruction surface.

## Out of Scope

- OOS1: Runtime behavior changes.
- OOS2: Tool schema, enum, gate ID, status, or command semantic changes.
- OOS3: Broad documentation rewrite outside audited instruction surfaces.
- OOS4: User-facing product feature changes.

## Decisions

### User Decisions

- Voice label: use `caveman-full`.
- Audit breadth: audit all active instruction files and compress segments with obvious benefit; preserve protocol over perfect optimization.
- Historical mentions: update all active non-archive mentions; leave archive/changelog history untouched unless active instruction semantics depend on it.
- AC approval: user replied `approve`.

### Agent Decisions (LBP)

- Use existing prose-load framework and structural tests; do not invent a new compression mechanism.
- Reuse prior bulk-compression contract-token snapshot/diff pattern.
- Add/update inventory for this pass because `rq-proseReduction03` requires it.
- Update exact asset-test strings atomically with label changes.

## Deferred Questions

None.

## Sign-Off

Acceptance criteria approved by user reply: `approve`.