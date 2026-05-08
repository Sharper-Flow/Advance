## Objectives

1. Make ADV git mutation safety mechanically enforced instead of prompt-only.
2. Prevent accidental commits/merges/pushes from dirty or unexpected shared checkouts.
3. Preserve valid multi-agent same-project work through separate git worktrees.
4. Preserve ADV Temporal non-interference.
5. Keep read-only git commands and normal inspection flows low-friction.

## Current-State Evidence

- `ADV_INSTRUCTIONS.md` says multi-session is supported and each session owns its own worktree; Temporal serializes ADV state writes.
- `ADV_INSTRUCTIONS.md` also documents known OpenCode snapshot-index contention as out of ADV's git/worktree layer.
- `.opencode/command/adv-archive.md` already contains a main-checkout invariant: main must be on default branch and clean; ADV must not switch/stash/fix main on the user's behalf.
- OpenCode official plugin docs show `tool.execute.before` receives the tool name and mutable/inspectable `output.args`; examples inspect `input.tool === "bash"`, mutate `output.args.command`, and throw errors to block operations.
- Current ADV `plugin/src/index.ts` already wires `tool.execute.before` and can route policy before tool execution.
- Current ADV `plugin/src/tools/checkpoint.ts` and `plugin/src/tools/worktree/index.ts` own several git mutation paths but raw bash git commands remain an exposed bypass.

## Acceptance Criteria

| AC | Statement | Verification |
|----|-----------|--------------|
| AC1 | Guard blocks ADV-owned git mutation from dirty shared main checkout without explicit scoped approval | Unit/integration test |
| AC2 | Guard verifies expected workdir, branch, and HEAD before commit/merge/push wrappers mutate git state | Unit/integration test |
| AC3 | Guard enforces dirty-file allowlists before staging/committing | Unit test |
| AC4 | Read-only git commands remain allowed | Unit test |
| AC5 | Archive finalization cannot push default branch without commit-range/divergence safety checks | Unit/integration test |
| AC6 | Guard does not mutate peer worktrees, indexes, branches, or working files | Multi-worktree test |
| AC7 | Guard introduces no ADV Temporal workflow locks or worker/queue coordination changes | Code review/test |
| AC8 | Unsafe raw shell git mutation is blocked, warned, or routed according to verified hook capability | Hook-level test |
| AC9 | Specs/docs capture the must-not behavior constraints | Spec/docs test |
| AC10 | Two agents in separate worktrees on different branches can independently commit allowed scoped changes without guard collision | Multi-worktree integration test |
| AC11 | OpenCode snapshot-index contention is not misrepresented as solved by the git mutation guard | Docs/test review |

## Dependencies

- OpenCode `tool.execute.before` can inspect/block bash command args per official docs; implementation still needs exact local arg-shape tests.
- No new Temporal coordination dependency should be introduced.

## Discovery Carry-Forward

- Determine final guard scope: global raw-bash guard, ADV-project-only guard, wrapper-first with raw-bash stopgap, or layered approach.
- Inventory every raw git mutation in commands/docs/tools and decide wrapper migration order.
- Decide exact user-confirmation contract for intentionally including dirty main-checkout changes.