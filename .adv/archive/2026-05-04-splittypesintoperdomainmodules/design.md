## Implementation Strategy

### Approach: Atomic per-domain extraction + barrel with named re-exports

Standard TypeScript barrel-module pattern. Mechanical refactor; no novel architectural decisions. Matches the repo convention used by `plugin/src/storage/index.ts`, `plugin/src/events/index.ts`, and `plugin/src/validator/index.ts`.

### Order of Operations

1. **Baseline capture** — record `wc -c plugin/dist/index.js`, `pnpm test` count, and current `pnpm run check` exit code as regression references.
2. **Leaf domain extraction** (10 files, no internal deps):
   - `types/specs.ts` — Priority, Scenario, Requirement, Spec, Dependency, Delta, plus the unused private `_ID_PREFIXES` constant (preserved verbatim to keep this refactor strictly mechanical)
   - `types/tasks.ts` — TaskStatus, Task, TaskType, Cancellation, Tdd*, Attempt, ErrorRecovery, TaskRun*
   - `types/gates.ts` — GateId, Gates, GateCompletion, GATE_DEFS, helpers
   - `types/wisdom.ts`, `types/investment.ts`, `types/project.ts`, `types/conformance.ts`, `types/status.ts`, `types/tdd-helpers.ts`, `types/responses.ts`
3. **Branch domain extraction** (2 files, depend on leaves):
   - `types/changes.ts` imports `TaskSchema` + `GatesSchema` from `./tasks`, `./gates`
   - `types/agenda.ts` imports `GatesSchema` from `./gates`
4. **Barrel construction** — `types/index.ts` uses **named re-exports** (`export { ... } from "./<domain>"`) per repo convention. Explicit symbol lists make the public API auditable and prevent accidental name collisions across 13 files.
5. **Old file deletion + test relocation** — atomic commit:
   - Delete `plugin/src/types.ts`
   - `git mv plugin/src/types.test.ts plugin/src/types/index.test.ts`
6. **Verification** — `pnpm test`, `pnpm run check`, `pnpm run build`, boundary test, dist size within 755–835 KB.

### Single-Commit Strategy

The refactor is purely mechanical with zero behavior change. **One atomic commit** ("refactor: split types.ts into per-domain modules under types/") is easier to review and bisect than per-domain commits. Reviewers can validate by diffing the concatenated domain files against the original. Git's `--find-renames` will partially detect movement.

### Module Resolution Strategy

Node/TS resolves `from "../types"` deterministically:
- If `types.ts` exists → uses it (wins over directory)
- If `types.ts` deleted → falls back to `types/index.ts`

Because `tsconfig.json` uses `moduleResolution: "bundler"`, the directory→`index.ts` lookup works transparently. The atomic commit removes `types.ts` in the same operation that creates `types/index.ts` — no intermediate broken state.

### Re-Export Pattern (validator-recommended)

Each domain file exports its symbols with `export const`, `export type`, etc. The barrel uses **named re-exports** matching `storage/index.ts` / `events/index.ts` / `validator/index.ts` style:

```ts
// types/index.ts
export {
  PrioritySchema,
  type Priority,
  ScenarioSchema,
  type Scenario,
  RequirementSchema,
  type Requirement,
  SpecSchema,
  type Spec,
  DependencySchema,
  type Dependency,
  DeltaSchema,
  type Delta,
} from "./specs";

export {
  TaskStatusSchema,
  type TaskStatus,
  TaskSchema,
  type Task,
  // ... etc
} from "./tasks";
// ...
```

Total surface: 135 exports across 13 named-re-export blocks. Mechanical to write.

### Test File Strategy

`plugin/src/types.test.ts` (190 lines, 16 Schema-validation tests) moves wholesale to `plugin/src/types/index.test.ts`. Imports update from `from "./types"` to `from "."` (resolves to `index.ts` barrel). No test logic changes.

Vitest's default `include: ["src/**/*.{test,spec}.{js,ts}"]` matches both old and new paths. No config changes.

### Pattern Established for Follow-Ons

This change establishes the recipe: directory + per-domain files + `index.ts` named-re-export barrel + colocated tests. Future splits of `change.ts` (1300 lines) and `worktree/index.ts` (~900 lines) follow this pattern with no design re-validation needed.

### Risk Map

| Risk | Mitigation |
|---|---|
| Forbidden imports leak into workflow-bundle types | `temporal/workflow-bundle-boundary.test.ts` will catch (boundary test stays green) |
| Circular import between `changes` ↔ `tasks`/`gates` | Verified absent; TypeScript would catch on `pnpm run typecheck` |
| Symbol name collision in barrel | Named re-exports surface collisions at compile time; verified via grep that no Schema name repeats |
| Test file fails to find Schemas after move | Path is `from "."` which resolves to `index.ts` barrel; same symbols exposed |
| `_ID_PREFIXES` lands in wrong file | Decision: preserved in `specs.ts` (sits next to other ID-using types like Requirement) |
| Git rename detection fails (PR review pain) | Single atomic commit; reviewers diff concatenated domain files vs original |
| `dist/index.js` size drift > 5% | Tsup tree-shaking is identical pre/post; barrel is zero-runtime; risk near zero. AC5 enforces. |
| Tree-shaking impact of barrel re-exports | Negligible: tsup single-entry ESM bundle bundles everything anyway. Validated by validator. |

### Validator Verdict: CAUTION → Resolved

Independent design validator (adv-researcher) returned VERDICT: CAUTION with 3 recommendations. All three incorporated:
1. ✓ Named re-exports in barrel (matches storage/events/validator convention)
2. ✓ `_ID_PREFIXES` placement specified (lands in `specs.ts`)
3. ✓ Single atomic commit (already aligned)

No CONFLICT findings. No contract-compromise risk identified. Design is ready for prep gate.

### Out of Scope (re-confirmed)

- No type renames
- No behavior changes
- No `change.ts` / `worktree/index.ts` splits
- No `node:*` / storage / tools imports
- No campsite-rule cleanup of dead `_ID_PREFIXES` (preserved verbatim; separate cleanup change can address)

### Why This Is a Mechanical Refactor

- Zero behavior change (data-shape modules only)
- Zero public API change (76 import sites unchanged)
- Zero test logic change (move + path adjust)
- Verifiable via existing test suite + boundary test + build size diff
- Validator-confirmed: simplicity ✓, architecture ✓