# Design

## Validator Verdict

Independent validator: VALIDATED, with required refinement: compose terse/caveman-lite voice with existing prose-load infrastructure instead of inventing a competing profile.

## Strategy
1. Treat caveman style as a voice/compression modifier layered onto existing prose-load reduction rules, not behavior change and not a second methodology.
2. Update `docs/command-voice-standard.md` near § Prose-Load Reduction Rules to state this composition:
   - enforcement class still controls what may compress;
   - terse/caveman-lite controls wording density inside the chosen template;
   - exact contract tokens stay unchanged.
3. Compress `ADV_INSTRUCTIONS.md` by replacing explanatory paragraphs with tables/fragments while preserving the existing section model and tested contract phrases.
4. Preserve exact tool names, gate IDs, statuses, slash commands, enum values, errors, `MUST`/`NEVER`, and approval/cancellation/archive wording where safety depends on clarity.
5. Add targeted asset tests for durable phrase preservation and composition docs; avoid brittle heading-exactness tests unless a heading is an explicit contract.
6. Update `.opencode/token-budgets.json` `advInstructionsLineBaseline` to the post-compression line count after verification, if compression reduces the file.
7. Leave `docs/prose-load-inventory.md` as historical inventory unless tests/specs require a refreshed inventory; do not use it as the durable rule home.

## Safety
- Do not compress JSON/code examples.
- Keep approval/checkpoint wording unambiguous.
- Keep destructive/cancellation/archive warnings normal enough for safety.
- Do not alter tool calls, enum values, command syntax, schemas, runtime code, or ADV state behavior.

## Verification
- Focused asset tests covering `docs/command-voice-standard.md`, `ADV_INSTRUCTIONS.md`, line guard, and existing critical phrases.
- `pnpm exec vitest run src/adv-skill-backed-commands-assets.test.ts src/adv-instructions-assets.test.ts` plus any touched test files.
- `./scripts/sync-global.sh --fix`, then `./scripts/sync-global.sh --check`.
- Final stack check if focused tests pass.