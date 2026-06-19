# Roadmap

<!-- adv-triage generated: 2026-06-19T15:42:35Z | DO NOT EDIT MANUALLY -->
<!-- Source of truth: GitHub Project #2 owned by @Sharper-Flow -->

Regenerate with `/adv-triage`. Manual edits are overwritten.

**Total: 8 bugs / 25 features / 1 deferred**

## Bugs (by priority)

### Critical

| # | Title | Labels |
|---|-------|--------|
| #131 | Investigate worktree delete timeout | — |
| #136 | Fix archive release gate ordering after terminal archive | — |
| #168 | Archive status repair reports success but read paths remain draft/in-flight | — |
| #174 | Worktree registry: archived-change `missing_from_disk` entries are unclearable (removeWorktree is a stub) | — |
| #175 | Fix peer-owned target_path create | — |

### High

| # | Title | Labels |
|---|-------|--------|
| #1 | adv_change_create creates duplicate instead of updating existing change | — |
| #127 | Add origin repair tool | — |
| #138 | Acceptance signals reject after execution gate complete: 'workflow execution already completed' | — |

## Features (by WSJF, descending)

| # | Title | V | TC | RROE | E | WSJF | Labels |
|---|-------|---|----|------|---|------|--------|
| #129 | Refactor adv-worktree skill — remove openchad, evaluate tmux | 3 | 2 | 3 | 1 | 8 | — |
| #80 | Make worktree.deps.store required | 8 | 2 | 5 | 2 | 7.5 | — |
| #109 | Verify archive gate protects against dangling task commits | 8 | 5 | 8 | 3 | 7 | — |
| #66 | ADV clarify/design must surface 'imported assumptions from research' as scope decisions | 8 | 3 | 8 | 3 | 6.3 | enhancement, priority:medium |
| #79 | Add must-not section to future ADV proposals | 3 | 1 | 2 | 1 | 6 | — |
| #64 | Add adv_delta_add MCP tool — agent-facing path to encode spec deltas | 8 | 2 | 8 | 3 | 6 | priority:medium |
| #61 | Telemetry & Temporal follow-ups from fixTemporalContextMismatch | 5 | 2 | 5 | 2 | 6 | enhancement, priority:high |
| #107 | Add TTL caching for ADV status health probes | 5 | 2 | 5 | 2 | 6 | — |
| #87 | Wire scanFileOverlaps into prep validator when async checks exist | 8 | 3 | 5 | 3 | 5.3 | — |
| #106 | Archived/terminal change listing can time out and shadow state | 8 | 3 | 5 | 3 | 5.3 | — |
| #81 | Document tdd_intent reclassification workaround for cached-dist self-update sessions | 2 | 1 | 2 | 1 | 5 | — |
| #84 | Sweep unused type exports flagged by knip | 2 | 1 | 2 | 1 | 5 | — |
| #104 | Expose stable ADV read surface for OCA consumption (O2) | 8 | 8 | 8 | 5 | 4.8 | — |
| #93 | adv_status: surface reflection friction signal in hygiene view | 5 | 3 | 5 | 3 | 4.3 | enhancement, priority:medium |
| #103 | Permission-first config for ADV agents | 8 | 5 | 8 | 5 | 4.2 | — |
| #45 | Add runtime Zod parse validation at SDK boundary in tests | 5 | 2 | 5 | 3 | 4 | enhancement, priority:low |
| #94 | Add adv_friction_query MCP tool — agent-queryable reflection friction | 5 | 2 | 5 | 3 | 4 | priority:medium |
| #96 | adv_session_list: cross-project view (v2 promotion) | 5 | 2 | 5 | 3 | 4 | enhancement, priority:medium |
| #65 | Replace prose-based MCP arg validation with declarative Zod refinements at schema boundary | 13 | 5 | 13 | 8 | 3.9 | enhancement, priority:medium |
| #50 | Project capability index: searchable, indexed reference of truth | 8 | 3 | 8 | 5 | 3.8 | priority:medium |
| #82 | Reduce ESLint complexity violations across plugin/src | 5 | 2 | 3 | 3 | 3.3 | — |
| #132 | Assess checkpoint target_path support | 5 | 2 | 3 | 3 | 3.3 | — |
| #143 | Add archive cleanup scanner | 8 | 3 | 5 | 5 | 3.2 | — |
| #83 | Decompose long factory closures | 5 | 2 | 5 | 5 | 2.4 | — |
| #135 | Clean terminal title API | 8 | 3 | 5 | 8 | 2 | — |

## Deferred / Unscored

- #144 — Add Claude distribution — _user-deferred (Value)_

## Triage Run Summary

- Run timestamp: 2026-06-19T15:42:35Z
- Sources scanned: GH issues, GH Project items, ADV changes, agenda, wisdom, cross-session notes, TODO/FIXME
- Issues opened this run: 2
- Issues added to project this run: 2
- Issues closed as completed/duplicate/superseded this run: 8
- Field assignments this run: 4 bug priority labels, 5 feature Value/WSJF sets
- Items deferred: 1
- Local sources deprecated: 3
