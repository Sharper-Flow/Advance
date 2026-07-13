# Executive Summary — Remove command trace tags

## Outcome
ADV production command prompts no longer expose internal requirement-trace or manifest HTML comments. `adv-apply` now points repeated guidance to one canonical detailed section instead of repeating full operational blocks.

## Value
Commands are shorter and clearer for runtime use while requirement traceability remains structurally protected in executable test/source citations.

## What changed
- Removed 100 internal HTML comment lines from 30 `.opencode/command/adv-*.md` files.
- Repaired the malformed former manifest heading in `adv-prep.md`.
- Replaced command tag-literal asset assertions with substantive behavior anchors; preserved skill-file citation assertions.
- Added a citation-preservation test surface for previously command-only requirement IDs.
- Consolidated duplicate retry, cross-repo, TDD, incremental-verification, and trivial-task guidance within `adv-apply.md`.
- Applied one user-approved whitespace-only Prettier correction required for the mandated format check.

## Verification
- Acceptance reviewer verdict: READY.
- Command trace/manifest absence scan: pass.
- Citation and affected command-asset suites: pass.
- `pnpm run check`: pass.
- All four planned tasks checkpointed; worktree clean.

## Risks / Follow-ups
- No remaining acceptance blockers.
- Skill-file requirement citation assertions intentionally remain; they are not runtime command text.
- No runtime deployment impact: command assets take effect through the normal OpenCode command asset lifecycle.