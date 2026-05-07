## Objective
Remove `bun-types` from the main `plugin/tsconfig.json` to eliminate Node type shadowing, while preserving type safety for files that legitimately use Bun-only APIs.

## Success Criteria
1. `plugin/tsconfig.json` contains only `node` in its `types` array
2. Bun-specific source files (terminal.ts, worktree/index.ts, runtime-manager.ts) continue to compile via explicit `/// <reference types="bun-types" />` directives
3. An ESLint rule bans `Bun` global usage in `plugin/src/` except for explicitly allowed Bun-only files
4. `pnpm run typecheck` passes
5. `pnpm run lint` passes
6. `pnpm run test` passes

## Scope
### In Scope
- `plugin/tsconfig.json` — remove `bun-types` from types array
- `plugin/src/tools/worktree/terminal.ts` — add triple-slash reference
- `plugin/src/tools/worktree/index.ts` — add triple-slash reference
- `plugin/src/temporal/runtime-manager.ts` — add triple-slash reference
- `plugin/eslint.config.js` — add `no-restricted-globals` rule for `Bun`

### Out of Scope
- Refactoring Bun-specific modules to be Node-compatible
- Runtime behavior changes
- Test tsconfig changes (tests already mock Bun APIs)

## Files
- `plugin/tsconfig.json`
- `plugin/src/tools/worktree/terminal.ts`
- `plugin/src/tools/worktree/index.ts`
- `plugin/src/temporal/runtime-manager.ts`
- `plugin/eslint.config.js`

## Acceptance Criteria
- [ ] `bun-types` removed from main tsconfig `types` array
- [ ] Triple-slash references added to Bun-specific source files
- [ ] ESLint `no-restricted-globals` rule blocks `Bun` usage outside allowed files
- [ ] CI passes: typecheck, lint, format:check, test