# Design

## Architecture Overview

ADV should own deterministic display state, not audible notification delivery. This change removes the terminal BEL notification state machine from the core terminal display module while preserving title rendering as a non-audible display surface.

The new shape:

- `plugin/src/events/terminal.ts`
  - keeps: project-name extraction, title construction, sanitized title payload, ST-terminated OSC title writes, tmux `rename-window`, status-title update, cleanup/reset of title + caches;
  - removes: `ringBell()`, `_setBellCallback()`, `armPendingFinalAlert()`, `_clearPendingFinalAlert()`, pending final alert state, debounce timer, and all status-transition BEL side effects.
- `plugin/src/index.ts`
  - removes message-completion bell arming logic if it only exists to call `armPendingFinalAlert()`.
  - audit and remove `mainSessionId`, `lastObservedCompletedMessageId`, `getCompletedMainMessageId()`, and `handleMessageUpdatedEvent()` only if they have no non-bell consumer.
- `plugin/src/events/index.ts`
  - stops exporting bell arming helpers.
- `chat-output-display` specs/docs
  - keep IDLE/ATTN status marker semantics;
  - create `rq-titleBell01` in this branch as part of replaying parent `fixTerminalTitleBell` behavior, because this worktree starts from trunk where that requirement is absent;
  - rewrite `rq-idleMarker03` from “bell policy” to “host-owned notifications / no ADV audible bell policy”.

External notifications (Warp/OpenCode integration, terminal settings, OS notifications) remain outside ADV correctness. ADV may document that Warp supports agent notifications for supported coding agents, including OpenCode via `@warp-dot-dev/opencode-warp`, but ADV core does not emit OSC 9/777 or BEL notifications.

## Key Decisions

1. **Remove, do not replace, ADV-owned BEL notifications.**
   - Rationale: the user explicitly prefers relying on environment/tool notifications over maintaining ADV bell state.
   - Rejected: replacing BEL with OSC 9/777. That is terminal-specific notification policy and would reintroduce escape-sequence notification ownership in ADV core.

2. **Preserve parent title no-BEL behavior by replaying equivalent source/spec changes in this branch.**
   - Rationale: the fast-follow worktree is based on `trunk`, not `change/fixTerminalTitleBell`. Merging the archived parent branch could drag checkpoint/archive history into this change. Re-implementing the parent title behavior in the same touched files gives the correct end-state with cleaner history.
   - Required behavior: ST title terminator, sanitized title payloads for OSC and tmux rename-window, no BEL in title output.
   - Required spec/docs: create `rq-titleBell01` and the matching markdown/drift-test coverage in this branch, not merely update an existing requirement.

3. **Rewrite `rq-idleMarker03` instead of deleting the ID.**
   - Rationale: preserving the requirement ID keeps downstream references stable while changing the law from “ADV rings bells on state transitions” to “ADV does not own audible notification delivery”.
   - Rejected: delete the requirement entirely; that risks stale references and loses the explicit no-audible-bell law.

4. **Remove bell tests and replace with negative/no-BEL tests.**
   - Rationale: after removal, tests should verify absence of BEL and preservation of title/status behavior, not retired policy.
   - Keep unrelated status marker, title, context ticker/snapshot, and drift tests.

5. **Leave historical changelog entries alone unless they assert current behavior.**
   - Rationale: changelog is historical; changing old entries can obscure what previously shipped. Current docs/specs should be updated.

## ADR Drafts

None. The design is a local simplification and user-approved product direction. It is not hard to reverse and does not require a standalone ADR.

## Implementation Strategy

1. **Establish RED tests for the target state.**
   - Add/adjust tests proving title output uses ST, no BEL, and sanitized payloads.
   - Add/adjust tests proving `updateTerminalStatus()` title/status paths do not emit BEL for representative transitions (`WORK→ATTN`, `WORK→IDLE`, `ATTN→IDLE`, `BLOCKED→ATTN`).
   - Add/adjust drift tests for newly created `rq-titleBell01`, `rq-idleMarker03` no-ADV-bell wording, and markdown mirror coverage.
   - Run focused tests and confirm they fail on trunk baseline / old bell behavior.

2. **Restore/preserve parent title behavior in source and spec.**
   - Add `sanitizeOscTitlePayload()` or equivalent.
   - Change title OSC terminator from BEL to ST.
   - Use sanitized title for `tmux rename-window`.
   - Keep deterministic title payload formatting unchanged.
   - Create `rq-titleBell01` in `.adv/specs/chat-output-display/spec.json`, mirror it in `docs/specs/chat-output-display.md`, bump the spec version, and update drift tests.

3. **Remove bell runtime state.**
   - Delete `ringBell()` and direct BEL writes.
   - Delete `_setBellCallback()` and bell-only test seam.
   - Delete `armPendingFinalAlert()`, `_clearPendingFinalAlert()`, pending final alert fields, `BELL_DEBOUNCE_MS`, `bellDebounceTimer`, and `cancelPendingBell()` if no non-bell uses remain.
   - Simplify `updateTerminalStatus()` to update title identity and status tracking without side-effect bells.
   - Simplify `cleanupTerminal()` to reset title/status/title-cache/TTY-cache only.

4. **Remove arming call sites and exports.**
   - Remove `armPendingFinalAlert` import/export.
   - Audit `mainSessionId`, `lastObservedCompletedMessageId`, `getCompletedMainMessageId()`, and `handleMessageUpdatedEvent()` in `plugin/src/index.ts`; remove them if their only purpose is terminal bell arming.
   - Keep unrelated message/session handling intact.

5. **Update specs/docs.**
   - Rewrite `rq-idleMarker03` to state ADV terminal status/title updates do not emit audible bells and notifications are host/tool-owned.
   - Update `rq-titleBell01` to prohibit BEL from title/status paths and remove language allowing a dedicated ADV notification-bell path.
   - Update `docs/specs/chat-output-display.md` mirror and `docs/adv-context-agreement.md` current requirement summary.
   - Add a concise note that Warp/OpenCode notifications are the recommended host notification surface; do not make Warp a requirement.

6. **Verify.**
   - Focused terminal/events tests.
   - Focused handoff/spec drift tests.
   - Source search for `\x07`, `ringBell`, `_setBellCallback`, `armPendingFinalAlert`, `BELL_DEBOUNCE_MS`.
   - `pnpm run check`, `pnpm test`, `pnpm run build` from `plugin/`.
   - Acceptance notes include live validation caveat: rebuild + fresh OpenCode session needed.

## LBP Analysis

This is the long-term best practice because it narrows ADV core to deterministic display responsibilities. Audible/desktop notifications are environment concerns with OS permissions, terminal preferences, and vendor-specific integrations. Warp already exposes agent notifications for supported coding agents and OpenCode setup via `@warp-dot-dev/opencode-warp`; Warp audible bell is separately configurable and disabled by default. ADV should not maintain a parallel cross-terminal bell policy when host/tool integrations own that user experience better.

The design also improves structural correctness: instead of a heuristic state machine deciding when to beep, correctness becomes a negative invariant (`no BEL from ADV status/title paths`) backed by tests and source search.

## Affected Components

- `plugin/src/events/terminal.ts`
- `plugin/src/events/events.test.ts`
- `plugin/src/events/terminal.test.ts`
- `plugin/src/events/index.ts`
- `plugin/src/index.ts`
- `.adv/specs/chat-output-display/spec.json`
- `docs/specs/chat-output-display.md`
- `docs/adv-context-agreement.md`
- `plugin/src/handoff-footer-drift.test.ts`

## Risks / Mitigations

- **Risk: title BEL regression because this branch starts from trunk.**
  - Mitigation: explicitly re-implement parent title no-BEL behavior first/with tests, create `rq-titleBell01`, and search for `\x07` before acceptance.
- **Risk: removing message.updated logic accidentally removes non-bell behavior.**
  - Mitigation: inspect call graph; remove only bell-arming helpers and confirmed bell-only supporting state; run full tests.
- **Risk: stale spec/docs still require bells.**
  - Mitigation: rewrite `rq-idleMarker03`, create/update `rq-titleBell01`, update markdown mirror and drift tests, scan for `rq-idleMarker03`/bell policy references.
- **Risk: users without Warp lose audible completion signal.**
  - Mitigation: this is accepted product direction; non-Warp degrades to no ADV-owned audible alert and users can configure terminal/host notifications externally.
- **Risk: hidden BEL remains in tests/spec strings only.**
  - Mitigation: classify source-search results; runtime source should have no BEL emitter, tests/specs may mention `\x07` only as negative assertions or documentation of forbidden behavior.

## Validator Result

DESIGN_VALIDATION:
  verdict: CAUTION
  findings:
    - dimension: CORRECTNESS
      level: caution
      summary: The initial design referenced `rq-titleBell01` as if it existed on trunk, but it was only added by the parent change.
      detail: Resolved in this design revision by explicitly requiring creation of `rq-titleBell01`, markdown mirror content, and drift-test coverage as part of the parent-behavior replay.
    - dimension: CORRECTNESS
      level: info
      summary: The message.updated handler appears bell-only and safe to remove if supporting state has no non-bell consumer.
      detail: Design now explicitly calls out auditing/removing `mainSessionId`, `lastObservedCompletedMessageId`, `getCompletedMainMessageId()`, and `handleMessageUpdatedEvent()` only if bell-only.
    - dimension: SIMPLICITY
      level: info
      summary: Replay-instead-of-merge is sound and simpler than merging the archived parent branch.
      detail: This avoids checkpoint/archive history while preserving the required source/spec behavior.
    - dimension: SPEC-LAW COMPLIANCE
      level: caution
      summary: Spec work must create `rq-titleBell01`, rewrite `rq-idleMarker03`, bump version, and update drift tests together.
      detail: Resolved in implementation strategy and risk mitigation.
    - dimension: KEY_ALTERNATIVES
      level: info
      summary: No significant viable alternative was overlooked.
      detail: OSC notification replacement and parent-branch merge were considered and rejected for this scope.
  recommendation: Proceed to planning after applying the clarifications above.
