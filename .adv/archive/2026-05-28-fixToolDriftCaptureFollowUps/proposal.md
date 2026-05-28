# Fix Tool Drift + Capture Follow-Ups

## Why

`./scripts/deploy-local.sh --fix` after archiving `removePositionalArtifactApi` reported two pre-existing tool drift warnings:

- `adv_subagent_report_submit` registered in tool registry but missing from `.opencode/agents/adv.md` allowlist
- Same tool missing from `.opencode/agents/adv-atc.md` allowlist

Agents cannot call tools absent from their allowlists. The `adv` and `adv-atc` orchestrators delegate to `adv-engineer` and `adv-reviewer`, which submit typed reports via `adv_subagent_report_submit`. Without the tool in the orchestrator allowlist, report consumers (drift detection, scope-drift propagation) cannot consume those reports.

Plus: `removePositionalArtifactApi` agreement explicitly listed four out-of-scope follow-ups (A1, A3, A4, A5 from that agreement). They are durable concerns that should be captured as agenda items so they don't get lost.

## What Changes

### Tool allowlist additions

- `.opencode/agents/adv.md` — add `adv_subagent_report_submit: true` to the tools block
- `.opencode/agents/adv-atc.md` — add `adv_subagent_report_submit: true` to the tools block

### Agenda follow-ups (from `removePositionalArtifactApi` OOS)

Capture as agenda items so they show up in `adv_agenda_list`:

- Subagent report storage migration to Temporal (currently disk under `subagent-reports/`)
- Stale-file cleanup of orphaned disk markdown for migrated changes (post-T15)
- Project-level state migration consideration (conformance.json, agenda.jsonl, wisdom.jsonl, worktrees.json, roadmap-snapshot.json) — different ownership model, may want different approach
- Per-session XDG_DATA_HOME wrapper script for OpenCode launches (downstream win unlocked by the just-shipped change)

### Wisdom captures

Durable learnings from the just-archived change:

- **Pattern:** State-mutation rejection over throw in Temporal signal handlers (signal handler `throw` fails entire workflow per https://docs.temporal.io/handling-messages#exceptions; canonical ADV pattern is `applyGateStuckToState` at `workflows.ts:722-732`).
- **Pattern:** Compile-time invariant locks via `_check: _PayloadKeysMatchArtifactKind = true` for type-set alignment (catches drift between payload shape and signal contract at compile time).
- **Convention:** Explicit ordered arrays over `Object.entries()` for determinism-critical iteration (workflow signal fan-out, history-diff cleanliness).
- **Gotcha:** TypeScript interface overloads require implementation satisfaction at compile time — additive-overload approach forces consolidating impl work into the interface change (T5+T6 absorbed).
- **Gotcha:** Test fixtures using `mockResolvedValueOnce` break silently when a migration adds a new caller of the mocked function earlier in the call chain (T10 archive-phase9 test fix — `mockResolvedValue` default for shared call patterns).

## Success Criteria

- [ ] `./scripts/deploy-local.sh --check` reports zero tool drift warnings for `adv_subagent_report_submit`
- [ ] `adv_agenda_list` shows 4 new follow-up items with appropriate priorities
- [ ] 5 wisdom entries captured (3 patterns + 2 gotchas)
- [ ] `pnpm test` passes (allowlist additions are config-only, no code change)
- [ ] No new tool drift introduced

## Affected Code

- `.opencode/agents/adv.md` — tools allowlist addition
- `.opencode/agents/adv-atc.md` — tools allowlist addition

No source code changes; this is a config + agenda + wisdom capture change.

## Constraints

- No code changes outside `.opencode/agents/` allowlists
- Agenda items use existing categories (no schema change)
- Wisdom entries scoped to this change (do not retroactively attach to archived change)
- Worktree isolation (P32)

## Impact

- `adv` and `adv-atc` orchestrators gain visibility into `adv_subagent_report_submit` — fixes the silent invisibility flagged by deploy-local
- Four durable follow-ups captured in agenda for future prioritization
- Wisdom entries available for cross-change consumption via `adv_project_wisdom_list`

## Validation Plan

1. Add `adv_subagent_report_submit` to both agent manifest tools blocks
2. Run `./scripts/deploy-local.sh --check` and verify "tool drift" warning for the tool disappears
3. Add 4 agenda items via `adv_agenda_add`
4. Add 5 wisdom entries via `adv_wisdom_add`
5. Run `pnpm test` to confirm allowlist changes don't break tool registry or asset tests
6. Archive
