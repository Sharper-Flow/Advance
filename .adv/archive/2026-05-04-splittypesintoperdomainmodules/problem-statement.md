## Why

`plugin/src/types.ts` is a 1852-line monolithic shared types module exporting **135 top-level symbols** organized into ~25 domain clusters (Wisdom, Tdd, TaskRun, Task, Spec, Scenario, Requirement, Investment, Gates, etc.). It violates locality-of-behavior (`rules.yaml` P04): every Zod schema and shared interface in the codebase lives in one file, making discovery, review, and PR isolation harder than they need to be.

The just-completed broad `/adv-improve polish` scan flagged this as **HIGH-severity code-quality drift** (CQ1), second only to `change.ts` (2096 lines / 11 tools). It's also the cleanest file to split first because:

- 104 import sites all use the same form (`from ".../types"`) — a barrel preserves them unchanged
- The file contains only types + Zod schemas, no runtime tool definitions
- The workflow-bundle boundary test (`temporal/workflow-bundle-boundary.test.ts`) does NOT forbid `types.ts` — split is bundle-safe as long as no domain file pulls in `storage/`, `tools/`, `tool-registry`, `plugin-init`, or `node:*`
- `plugin/schemas/*.json` are `$ref` stubs — path-independent
- `vitest.config.ts` has no types-related alias
- The barrel pattern is already canonical in this repo (`validator/index.ts`, `storage/index.ts`, `events/index.ts`, `archive/index.ts`)

Establishing a clean domain split here also creates the precedent and confidence for the larger `change.ts` (2096L) and `worktree/index.ts` (1613L) splits called out by the same scan.

### Evidence

- `wc -l plugin/src/types.ts` → 1852
- `grep -c "^export" plugin/src/types.ts` → 135
- `grep -rn 'from ".*types"' plugin/src/ | wc -l` → 104 import sites
- `find plugin/src -name "index.ts"` → 8 existing barrels
- `temporal/workflow-bundle-boundary.test.ts:73-76` — forbidden set excludes `types.ts`