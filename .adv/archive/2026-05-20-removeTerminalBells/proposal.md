# Remove terminal bells

## Intent

Remove ADV-owned terminal audible bell state/policy and rely on host/tool notification integrations (especially Warp/OpenCode notifications) for completion and attention signals.

## Problem

ADV currently owns a cross-terminal audible bell state machine in `plugin/src/events/terminal.ts`: `ringBell()`, `_setBellCallback()`, `armPendingFinalAlert()`, `_clearPendingFinalAlert()`, pending-final-alert state, debounce timers, and status-transition bell policy. That logic is large relative to value, hard to keep aligned with specs/tests, and overlaps with environment/tool notification systems.

The fast-follow from `fixTerminalTitleBell` should remove ADV-owned bell ringing while preserving terminal title behavior and non-audible title encoding.

## Scope

### In Scope

- Keep terminal title updates and non-audible title encoding (`rq-titleBell01`).
- Remove ADV-owned audible BEL notification behavior from `plugin/src/events/terminal.ts`.
- Remove now-unused bell state and test seams if no other behavior needs them:
  - `ringBell()` and direct BEL writes for notification purposes.
  - `_setBellCallback()` if only used by bell tests.
  - `armPendingFinalAlert()` / `_clearPendingFinalAlert()` and pending/debounce state if no longer needed.
  - `BELL_DEBOUNCE_MS`, `bellDebounceTimer`, `cancelPendingBell()` if only used for bells.
- Remove call sites that only arm ADV bell notifications, including current `message.updated` arming in `plugin/src/index.ts` if it has no remaining purpose.
- Remove or rewrite tests in `plugin/src/events/events.test.ts` that only validate audible bell policy.
- Update `chat-output-display` spec/docs to say ADV does not own audible bell notification behavior and title updates remain non-audible.
- Document Warp/OpenCode notification integration as the recommended notification surface.

### Out of Scope

- Do not change terminal title text formatting or title update triggers.
- Do not remove `rq-titleBell01` or weaken title no-BEL guarantees.
- Do not add OSC 9/OSC 777 notification emission to ADV core.
- Do not modify `@warp-dot-dev/opencode-warp` or Warp configuration files.
- Do not add a new cross-terminal notification abstraction.
- Do not change ADV workflow/status marker semantics beyond removing ADV-owned audible bells.

### Must Not

- Must not emit BEL (`\x07`) from ADV status/title update paths after removal.
- Must not replace removed bells with another terminal escape notification protocol in the same change.
- Must not break status marker rendering, context ticker/snapshot behavior, or terminal title updates.
- Must not silently depend on Warp-specific behavior for correctness; Warp notifications are an integration recommendation, not an ADV correctness boundary.

## Success Criteria

- [ ] `plugin/src/events/terminal.ts` no longer emits BEL for status transitions, final-alert policy, or title refreshes.
- [ ] `ringBell()` and related bell-only state/test seams are removed, or any remaining code has a documented non-bell purpose.
- [ ] `armPendingFinalAlert()` call sites are removed or proven unnecessary once ADV-owned bell policy is gone.
- [ ] Existing terminal title behavior remains intact: deterministic title payloads, ST title terminator, sanitized title payloads, and no BEL in title output.
- [ ] Specs/docs no longer require ADV-owned audible bell behavior; `chat-output-display` preserves title no-BEL law and documents host/tool notification reliance.
- [ ] Tests remove bell-policy expectations and add/keep negative assertions proving ADV status/title paths do not emit BEL.
- [ ] Verification passes from `plugin/`: targeted events/terminal tests, relevant spec/drift tests, `pnpm run check`, `pnpm test`, and `pnpm run build`.

## Affected Code

Initial source scan found bell-related code in:

- `plugin/src/events/terminal.ts`
  - `ringBell()` and status-transition bell calls.
  - pending final alert / debounce state.
- `plugin/src/index.ts`
  - `armPendingFinalAlert(messageId)` call from `message.updated` handling.
- `plugin/src/events/index.ts`
  - exports for bell arming helpers.
- `plugin/src/events/events.test.ts`
  - large bell transition test block.
- `.adv/specs/chat-output-display/spec.json`
  - `rq-idleMarker03` currently owns audible bell policy.
- `docs/specs/chat-output-display.md` and related docs such as `docs/adv-context-agreement.md` / `CHANGELOG.md` may mention the old bell policy.

## Related Repositories

Current repo only. No cross-repo code changes expected.

## Constraints

- OpenCode plugin source edits must be verified with tests/build from `plugin/`.
- Live OpenCode validation requires rebuilt `plugin/dist/` and a fresh OpenCode session because plugin code is cached at session startup.
- Warp/OpenCode notification behavior must be treated as external integration behavior; discovery should verify current docs before final design.
- The fast-follow worktree was created from `trunk` and is not currently a descendant of `change/fixTerminalTitleBell`; implementation must first incorporate the parent branch or equivalent parent changes so title no-BEL behavior is preserved.

## Impact

- Reduces ADV-owned notification state and likely deletes a significant amount of bell-specific runtime/tests/spec policy.
- Removes noisy/fragile terminal audible bell behavior from ADV core.
- Leaves notification responsibility to host/tool integration layers such as Warp/OpenCode notifications and user terminal settings.

## Context

Created as a fast-follow from `fixTerminalTitleBell`. During hardening, we estimated the existing terminal bell machinery at roughly 150–250 LOC of runtime/tests/spec policy. User explicitly agreed to remove it rather than continue maintaining ADV-owned audible bell behavior.

## Discovery Findings

### Discovery Checklist

| Step | Status | Reason |
|---|---|---|
| Skill Discovery | PASS | `lgrep` matched code-discovery need; no new skill needed. |
| Prior Research Extension | PASS | Cited repo polish and traceability prep docs; added new findings below. |
| Conflict & Related-Work Scan | PASS | Parent fast-follow validated; branch ancestry issue found; no overlapping active agenda. |
| Edge Case Investigation | PASS | Branch ancestry, title no-BEL, status transitions, cleanup, and external-notification cases reviewed. |
| Design Question Depth | PASS | Key design questions annotated in discovery. |
| Draft Spec Deltas | PASS | `rq-idleMarker03` / `rq-titleBell01` update shapes drafted. |
| Related Pattern Scan | PASS | Bell-related code/spec/doc references enumerated. |
| LBP Check | PASS | Removing core BEL policy aligns with host-notification responsibility and simpler ADV core. |

### Skills Considered

- `lgrep`: matched the core local-code discovery need; used for `ringBell`, `armPendingFinalAlert`, `_setBellCallback`, `rq-idleMarker03`, `\x07`, and bell-policy references.
- `adv-slop-detection`: not loaded for discovery; useful later in harden but not a discovery-domain skill.
- No terminal-notification custom skill exists or is warranted; official Warp docs and local code evidence are enough.

### Extends

- `docs/repo-improve-prep.md`: supports the code-quality/locality motivation. New finding: the bell state machine is a smaller but clear instance of the same polish theme — too much policy in one runtime surface, with tests/docs/specs carrying heavy friction.
- `docs/change-contract-traceability-prep.md`: supports stable success criteria and traceability. New finding: this change needs explicit negative assertions (`no BEL from ADV status/title paths`) because removing behavior is easy to under-verify.
- Parent change `fixTerminalTitleBell`: archived and valid fast-follow parent. New finding: current `removeTerminalBells` worktree is not a descendant of `change/fixTerminalTitleBell`, so implementation must incorporate the parent branch/equivalent title no-BEL changes before removing bells.

### Conflict Scan

- Active changes: no active in-flight change directly overlaps terminal bell removal. `persistExecutiveSummary`, `addQuestionComments`, and others are unrelated drafts.
- Archived related change: `fixTerminalTitleBell` is directly related and must be preserved.
- `adv_change_validate` passes with expected pre-prep warnings: `NO_TASKS`, `NO_DELTAS`, and branch-local `SPEC_DIVERGED`.
- Pending agenda items are unrelated to terminal bell removal.

### Current State

- `plugin/src/events/terminal.ts` currently has title emission and bell notification logic in the same module.
- In this worktree, title output still shows the trunk baseline (`\x1b]0;${title}\x07`), confirming the parent no-BEL fix is not present yet.
- `ringBell()` emits BEL via tmux client/pane TTYs or stdout.
- `_setBellCallback()` exists only as a bell-test seam.
- `armPendingFinalAlert()` is exported and called from `plugin/src/index.ts` message completion handling to arm final-alert bells.
- `events.test.ts` has a large bell transition block covering ATTN/IDLE debounce/final-alert behavior.
- `chat-output-display` currently has `rq-idleMarker03` requiring bell behavior and `rq-titleBell01` requiring title no-BEL while allowing dedicated notification bells.
- Warp docs confirm Warp owns agent notifications for supported coding agents, including completion/request/error desktop notifications, and has OpenCode setup via `@warp-dot-dev/opencode-warp`. Warp audible bell is separately configurable and disabled by default.

### Edge Cases

- Fast-follow baseline: if parent changes are not incorporated first, removing bells from trunk would regress the just-archived title no-BEL fix.
- tmux title path: title sanitization/no-BEL must apply to OSC writes and `tmux rename-window`; bell removal must not remove safe title handling.
- Status marker behavior: IDLE/ATTN textual markers and emojis must remain; only audible side effects are removed.
- Initial session: previously `null→ATTN` had special bell behavior; after removal, all status transitions should be silent at ADV terminal layer.
- External notifications: Warp/OpenCode integration may notify independently; ADV core must not depend on Warp for correctness or tests.
- Tests: deleting bell tests must not accidentally delete unrelated status/title/context snapshot coverage.

### Open Design Questions

1. **How to handle fast-follow baseline?**
   - Trust model: agent-only technical sequencing.
   - Blast radius: high; wrong baseline can reintroduce title BEL behavior.
   - Alternatives: merge `change/fixTerminalTitleBell`, cherry-pick parent commits, or manually reimplement parent changes. Recommendation: merge the parent branch/equivalent code at implementation start and verify no-BEL title tests.
2. **Spec delta shape for `rq-idleMarker03`.**
   - Trust model: joint agreement on product behavior; implementation technical.
   - Blast radius: medium; status marker semantics and notification expectations.
   - Alternatives: delete the requirement, rewrite to no audible bells, or keep external notification advisory. Recommendation: rewrite to state ADV status updates do not emit BEL and notifications are host/tool-owned.
3. **Should ADV emit OSC 9/777 instead of BEL?**
   - Trust model: user/product tradeoff.
   - Blast radius: medium; terminal-specific behavior and more escape-sequence policy.
   - Alternatives: OSC 9/777, Warp plugin integration, no ADV notification. Recommendation: no ADV core OSC notifications in this change; rely on host/tool integration.
4. **What docs should change?**
   - Trust model: agent-only documentation hygiene within scope.
   - Blast radius: low/medium; stale docs confuse future agents.
   - Alternatives: update specs only, update specs + human docs, edit changelog history. Recommendation: update specs/current docs; leave historical changelog entries unless they describe current behavior.

### Draft Spec Deltas

- `rq-idleMarker03` — ADV status updates do not own audible bell notifications.
  - Given any status marker transition is processed, when ADV updates terminal status/title, then ADV does not emit BEL (`\x07`).
  - Given an agent completes or needs attention, when notifications are desired, then notification delivery is handled by host/tool integrations or user terminal settings outside ADV core.
  - Given status marker rendering runs, when audible bell behavior is removed, then IDLE/ATTN marker text and emoji semantics remain unchanged.
- `rq-titleBell01` — Terminal title updates remain non-audible.
  - Given a terminal title update is emitted, when OSC/title output is written, then it uses ST/no-BEL and sanitized title payloads.
  - Given ADV status transitions occur, when title refreshes happen, then no title or status path emits BEL.
  - Remove or revise the old scenario language that allowed BEL through a dedicated notification-bell path.

### Related Pattern Scan

- Runtime bell code: `plugin/src/events/terminal.ts` (`ringBell`, `_setBellCallback`, pending alert state, debounce timer, bell calls).
- Completion arming: `plugin/src/index.ts` message.updated handler calls `armPendingFinalAlert`.
- Re-exports: `plugin/src/events/index.ts` exports arming helpers.
- Tests: `plugin/src/events/events.test.ts` bell transition and bell-gate policy sections.
- Specs/docs: `.adv/specs/chat-output-display/spec.json`, `docs/specs/chat-output-display.md`, `docs/adv-context-agreement.md`, and historical `CHANGELOG.md` references.
- Source BEL scan in the current worktree finds title BEL and `ringBell` BEL; title BEL is parent-baseline gap to fix before or during implementation.

### LBP Check

Likely direction matches long-term best practice. ADV should own deterministic display state (status markers, context surfaces, terminal titles) and not own cross-terminal audible notification policy. Warp/OpenCode notifications are a more appropriate integration layer for attention/completion alerts; non-Warp environments should degrade to no ADV-owned audible alert rather than a brittle BEL state machine.

### Recommended Objectives

1. Preserve parent title no-BEL behavior before removing bell code.
2. Remove ADV-owned audible BEL emission from status/title/update paths.
3. Delete or simplify bell-only state, seams, exports, and tests.
4. Rewrite specs/docs so ADV owns display state but not audible notification delivery.
5. Keep Warp/OpenCode notification guidance advisory, not a correctness dependency.
6. Verify with negative BEL source/tests plus full check/test/build.

### AMBIGUITY ANALYSIS — no ambiguity findings

Coverage: B:C F:C S:C M:C

Boundaries, functional scope, completion evidence, and missing technical information are sufficiently clear for agreement/design.

## Discovery Agenda

Resolved above. Remaining implementation details move to design/prep.
