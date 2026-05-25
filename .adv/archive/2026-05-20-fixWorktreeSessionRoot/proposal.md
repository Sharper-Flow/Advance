# Proposal: Fix worktree session root

## Origin

Surfaced mid-session while working in `/home/dev/toolbox` (a non-ADV project). The symptom was observed in this repo (`advance`) during inline ADV worktree work; this change is created and executed here.

## Problem

ADV inline worktree mode creates and edits files under the per-change worktree, but the active OpenCode session still has its `Session.directory` / `Project.worktree` rooted at the trunk checkout. OpenCode then renders file tool paths relative to the trunk checkout, producing confusing paths such as:

```text
# Created ../../../.local/share/opencode/worktree/{project-id}/change/{change-id}/plugin/src/...
```

The underlying worktree storage location is valid and XDG-compliant. The defect is that inline ADV execution relies on per-tool `workdir` while OpenCode-native file tooling, display, permissions, LSP, and formatter root behavior remain bound to the original session's directory.

## Success Criteria

1. Mutating ADV implementation phases operate with OpenCode's effective session/project context rooted at the ADV worktree, not the trunk checkout. Verifiable by inspecting the session's `directory` (and/or the project `worktree`) reported by the OpenCode SDK during a mutating phase — it MUST equal the worktree path.
2. File tool output for worktree edits displays project-relative paths such as `plugin/src/foo.ts`, not `../../../.local/share/...`, when observed in a representative session.
3. Read/write/edit/apply_patch permission patterns, diagnostics, LSP/formatter discovery, and path metadata are consistent with the ADV worktree root. ("Permission" here refers to OpenCode tool-permission allowlists keyed on path patterns — NOT authentication or authorization. CLARIFY_ASSUMPTION_HEAVY is a false positive; this proposal introduces no auth model.)
4. Worktree storage remains under `$XDG_DATA_HOME/opencode/worktree/{project-id}/{branch}` unless explicitly configured otherwise.
5. If OpenCode cannot support switching the native session context safely, ADV falls back to non-inline worktree execution for mutating phases (existing terminal-fork path, `worktree.inline=false`) rather than continuing with misleading trunk-rooted inline execution. The fallback path is explicit, configurable, and covered by tests.

## Scope

Modules in scope for discovery / design / execution:

- `plugin/src/tools/worktree/index.ts` — inline branch (~L1956, currently skips session fork and returns a `workdir=` instruction string); non-inline branch (~L415, uses `client.session.fork` which does NOT accept a `directory` override per SDK `SessionForkData`); `worktreeConfigSchema.inline` default at ~L225.
- `plugin/src/index.ts` — plugin entrypoint where `{ directory, worktree, project }` arrives (`advancePluginImpl` ~L298); compaction hook that sets `workdir: directory` (~L972).
- `plugin/src/utils/git-session.ts` + tests — already distinguishes main checkout vs linked worktree; downstream of any context decision.
- `ADV_INSTRUCTIONS.md § Inline Worktree Protocol` (~L920–934) — user-facing protocol must reflect whatever inline/fork/create choice discovery lands on.
- `.opencode/worktree.jsonc` schema and docs — if a new mode (e.g. `inline: "rerooted"` vs `inline: true` vs `inline: false`) is introduced.

Explicitly NOT in scope here (deferred or separate changes):

- Storage relocation, repo-local worktrees, ADV external-state path redesign.
- Symlink, wrapper-script, or env-var hacks to disguise the worktree path.
- Upstream OpenCode SDK changes (e.g. teaching `session.fork` to accept a `directory` override). Discovery may document the gap and the petition; this change does not own delivering it.

## Out of Scope

- Moving ADV worktrees into the repository by default.
- Replacing XDG data-home storage with repo-local storage.
- Broad redesign of ADV external state paths.
- Cosmetic-only path shortening that leaves permissions/LSP/formatter context trunk-rooted.
- Symlink or wrapper-script hacks to disguise the worktree path.

## Constraints

- Preserve worktree isolation and trunk write firewall guarantees.
- Preserve existing ADV project-id and shared external-state behavior across worktrees.
- Prefer structural context/root correctness over display-only heuristics (P33).
- Any fallback behavior must be explicit and testable.

## Clarifier finding triage

| Finding | Severity | Disposition |
|---|---|---|
| `CLARIFY_MISSING_SUCCESS_CRITERIA` | warning | Addressed — criteria 1, 2, 5 now have measurable predicates; 3 and 4 remain qualitative by intent and will be operationalized in design. |
| `CLARIFY_UNCLEAR_SCOPE` | warning | Addressed — Scope section above. |
| `CLARIFY_ASSUMPTION_HEAVY` | warning | Dismissed as false positive — "permission" in criterion 3 means OpenCode tool-permission allowlists, not auth. No authentication or authorization is introduced. |
