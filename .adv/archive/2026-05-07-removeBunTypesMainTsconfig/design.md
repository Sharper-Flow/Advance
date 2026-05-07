## Implementation Strategy

### Type Config Split
1. Remove `"bun-types"` from `plugin/tsconfig.json` → `types: ["node"]` only
2. Add `/// <reference types="bun-types" />` to the top of:
   - `plugin/src/tools/worktree/terminal.ts`
   - `plugin/src/tools/worktree/index.ts`
   - `plugin/src/temporal/runtime-manager.ts`

These are the only non-test files that legitimately reference `Bun` globals.

### ESLint Guardrail
Add `no-restricted-globals` rule to the source-files config in `plugin/eslint.config.js`:
```js
"no-restricted-globals": ["error", { name: "Bun", message: "Bun APIs are not available at runtime on Node hosts. Use /// <reference types=\"bun-types\" /> only in Bun-specific modules." }]
```
Override to `"off"` in a dedicated config block for the three Bun-specific files.

### Verification
- `pnpm run typecheck` — validates compilation with separated types
- `pnpm run lint` — validates ESLint rule application
- `pnpm run test` — confirms no test regressions