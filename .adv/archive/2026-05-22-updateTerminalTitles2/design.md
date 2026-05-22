# Design

## Architecture Overview

This change keeps ADV's existing terminal-title architecture and changes only the identity policy at the pure formatter boundary.

Runtime flow remains:

1. `plugin/src/events/status.ts` stores `projectName` and `activeChangeId`.
2. `status.ts` calls `updateTerminalStatus(status, projectName, activeChangeId)` when status/identity changes.
3. `plugin/src/events/terminal.ts` calls `buildTabTitle(...)` to compute a plain title string.
4. `updateTerminalStatus` compares the title with module-local `lastTitle` and emits only after a successful identity change.
5. Existing `setTitle` output paths sanitize control bytes, emit OSC with ST terminator, update tmux window name, and fall back through `/dev/tty`/stdout as they do today.

No new owner, persistence surface, or runtime state machine is introduced.

## Key Decisions

### D1 — Prefer formatter policy over output-path changes

Change `buildTabTitle` from project+change composition to active-change precedence:

```ts
const projectLabel = cleanTitlePart(projectName);
const changeLabel = cleanTitlePart(changeId);

if (changeLabel) return changeLabel;
if (projectLabel) return projectLabel;
return "";
```

Rationale: the agreed outcome is text identity, not emission semantics. Keeping emission untouched preserves the prior `fixTerminalTitleBell` / `removeTerminalBells` safety work.

### D2 — Preserve raw labels; do not humanize

`cleanTitlePart` remains trim-only at the formatter level. Control-byte normalization remains in `setTitle`, where all terminal output paths already pass.

Rationale: user chose raw ADV change id. Raw IDs are stable across ADV state, worktree branches, tests, and terminal title display.

### D3 — Add title identity spec law separate from no-BEL law

Add `rq-titleIdentity01` to `chat-output-display` instead of expanding `rq-titleBell01`.

Rationale: identity and terminal-safety are different laws. Keeping them separate avoids weakening no-BEL semantics and makes drift tests more targeted.

### D4 — Leave historical references alone unless current-facing

Current docs/specs should be updated (`ADV_INSTRUCTIONS.md`, `.adv/specs/chat-output-display/spec.json`, `docs/specs/chat-output-display.md`, and any drift tests). Historical changelog/research-pack entries should not be rewritten unless they claim current behavior.

Rationale: user chose current docs/specs scope; historical records are useful as history.

## ADR Drafts

None. The decision is localized, easy to reverse, and not an architecture-wide tradeoff. It does not meet the ADR rubric.

## Implementation Strategy

1. Add/update RED tests for title policy:
   - active change with project returns only change id
   - inactive returns project
   - empty/whitespace change id falls back to project
   - empty project with active change returns change id
   - status emoji/prefix/progress are ignored
   - active terminal OSC output contains change id only and does not contain `project: change`
   - status churn does not re-emit the same identity title
2. Implement the pure formatter change in `plugin/src/events/terminal.ts` and update comments to describe `change-id` active / `project` inactive.
3. Update terminal emission tests in `plugin/src/events/terminal.test.ts` to expect active payloads like `addFeatureX` and sanitized active change ids, while preserving no-BEL/ST checks.
4. Add `rq-titleIdentity01` to `.adv/specs/chat-output-display/spec.json` with G/W/T scenarios for active, inactive, no-churn, and sanitized/no-BEL identity output.
5. Update `docs/specs/chat-output-display.md` mirror and drift test coverage so the spec/docs cannot diverge silently.
6. Update current runtime docs (`ADV_INSTRUCTIONS.md` status-marker/tab-title line; related context docs if they claim current `project: advChange`).
7. Verify from `plugin/` with focused tests, `pnpm test`, `pnpm run check`, and `pnpm run build`.

## LBP Analysis

The long-term best practice is a structural, pure policy backed by tests and spec law:

- Pure formatter owns identity precedence.
- Emission path owns terminal safety.
- Spec law owns user-visible contract.
- Tests enforce both identity and safety.

This avoids heuristic title processing, avoids a broader OpenCode session-title migration, and keeps the current terminal output safety guarantees intact.

## Affected Components

- `plugin/src/events/terminal.ts` — `buildTabTitle` policy and comments.
- `plugin/src/events/events.test.ts` — pure formatter expectations.
- `plugin/src/events/terminal.test.ts` — emitted title payload expectations and no-BEL/ST preservation.
- `.adv/specs/chat-output-display/spec.json` — new `rq-titleIdentity01` requirement.
- `docs/specs/chat-output-display.md` — markdown mirror for the new requirement.
- `plugin/src/handoff-footer-drift.test.ts` or adjacent drift/asset tests — ensure spec/docs requirement coverage if current patterns already enforce it there.
- `ADV_INSTRUCTIONS.md` — current tab-title text.
- Potential current-facing context docs if exact search finds `project: advChange` / `Project: change-id` outside historical files.

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Accidentally weakening no-BEL/ST behavior while updating expectations | Keep `rq-titleBell01` unchanged and preserve no-BEL assertions in terminal tests. |
| Moving control-byte cleanup into formatter and bypassing output safety | Keep formatter trim-only; leave control normalization in `setTitle` so every emission path is covered. |
| Duplicate title emission after status churn | Add/keep a test around `lastTitle` caching and failed-emission retry. |
| Over-editing historical docs | Limit docs task to current docs/specs and cite user decision. |
| Spec/docs drift | Add/update drift assertion for `rq-titleIdentity01` in the existing spec/doc asset test. |

## Design Leverage Scout

Scout skipped. The change is localized to an already-owned formatter boundary and current-facing spec/docs, with no new architecture surface, dependency, persistence model, or platform integration.