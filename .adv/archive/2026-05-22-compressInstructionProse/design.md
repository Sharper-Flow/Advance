# Design

## Architecture Overview

This is an instruction-asset compression change. Architecture stays simple: edit active markdown instruction surfaces and the one asset test that asserts their labels; do not touch runtime tool behavior or schemas.

The governing mechanism remains the existing prose-load framework:

- `docs/command-voice-standard.md § Prose-Load Reduction Rules` defines enforcement-class templates.
- `advance-meta` spec law (`rq-proseReduction01`–`rq-proseReduction04`, `rq-skillProseCompression01`) defines invariants.
- `plugin/src/manifest-doc-drift.test.ts` and `plugin/src/adv-skill-backed-commands-assets.test.ts` provide structural regression checks.

Implementation runs from the existing worktree:

`/home/dev/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/compressInstructionProse`

Current worktree already contains prose-only edits across active instruction/test files. Planning must capture, audit, verify, and checkpoint those edits instead of ignoring them.

## Key Decisions

### D1 — Use `caveman-full` as the active normative label

User chose `caveman-full`. Active non-archive instruction surfaces should not teach `caveman-lite`/`caveman-light` as the current target.

`caveman-full` is a wording-density layer over prose-load templates. It does not replace enforcement-class classification.

### D2 — Audit breadth: all active instruction assets, obvious wins only

Audit all active instruction surfaces:

- `ADV_INSTRUCTIONS.md`
- `AGENTS.md`
- `.opencode/agents/*.md`
- `.opencode/command/adv-*.md`
- `skills/**/SKILL.md`
- `docs/command-voice-standard.md`
- `docs/prose-load-inventory.md`
- tests that assert instruction labels or prose-load structure

Apply only safe obvious compression. If a segment is already dense or safety-critical, leave it intact.

### D3 — Contract-token protection is structural

Before final verification, create pre/post snapshots for in-scope files and compare contract-token lines/classes. Tokens include:

- ADV tool names
- gate IDs/statuses
- slash commands
- enum values
- quoted errors and code examples
- `MUST` / `NEVER` / `Do NOT`
- approval, cancellation, and archive sign-off wording

Unexpected token loss blocks acceptance. Label/test-string changes are allowed only when justified by the approved `caveman-full` rename.

### D4 — Inventory is the audit ledger

Update `docs/prose-load-inventory.md` with a new pass for this change. Record changed/reclassified sections and archive status, preserving `rq-proseReduction03` traceability.

## Implementation Strategy

1. Capture current dirty-scope baseline and pre-token snapshot.
2. Normalize active stale labels to `caveman-full`.
3. Update prose-load inventory for this pass.
4. Audit active instruction surfaces and compress only obvious safe wins.
5. Generate post-token snapshot and compare against baseline.
6. Run focused tests:
   - `pnpm exec vitest run src/adv-skill-backed-commands-assets.test.ts src/manifest-doc-drift.test.ts`
   - stale-label search excluding historical archive/changelog paths
7. Run `pnpm run check` from `plugin/`.
8. During review, remediate any contract-token or clarity regressions and re-run focused verification.

## Validation Plan

- Case-insensitive stale-label grep for `caveman-lite|caveman-light` over active non-archive files.
- Contract-token pre/post diff with unexpected losses treated as blocking.
- Inventory anchors for pass 3/T7.
- Focused Vitest asset/drift checks.
- Full `pnpm run check`.
- Independent review of requirement traceability, logic/edge cases, security, architecture/quality, and cross-repo state.

## Risks and Mitigations

- **Risk:** Compression removes normative force. **Mitigation:** preserve modal tokens and run targeted review.
- **Risk:** Stale labels remain due case mismatch. **Mitigation:** use case-insensitive grep.
- **Risk:** Inventory drifts from implementation. **Mitigation:** update inventory in the same change and verify anchors.
- **Risk:** Runtime behavior changes accidentally. **Mitigation:** keep edits to markdown/test-label assets and run full check.

## No Spec Delta Expected

This change implements existing prose-load and instruction-compression requirements. No `.adv/specs/` delta is expected unless validation discovers an unmet spec invariant.