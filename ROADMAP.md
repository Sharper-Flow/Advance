# Roadmap

<!-- adv-triage generated: 2026-05-08T19:56:31Z | DO NOT EDIT MANUALLY -->
<!-- Source of truth: GitHub Project #2 owned by @Sharper-Flow -->

Regenerate with `/adv-triage --execute`. Manual edits are overwritten.

## Bugs (by priority)

### High
| # | Title | Labels |
|---|-------|--------|
| #89 | /adv-triage GraphQL budget exhaustion during Project field updates | — |
| #60 | Post-Temporal-cutover external-state hygiene leftovers + test-isolation leak | — |
| #48 | ADV worktree tools fail with WorkflowUpdateFailedError after repair and clean diagnostics | — |

### Medium
| # | Title | Labels |
|---|-------|--------|
| #86 | Fix terminal.ts permission-ATTN vs idle-ATTN distinction | — |
| #63 | adv_change_validate returns passed:false on warnings-only state in strict mode | — |
| #62 | adv_change_validate over-triggers MISSING_TDD_EVIDENCE on data/constant tasks | — |
| #55 | adv_worktree_delete rejects fix/* branches with branch_not_in_registry even with force: true | — |
| #54 | adv_change_close fails on terminated workflows with no disk-only fallback | — |
| #53 | adv_change_archive recovery path skips createInRepoArchive when external bundle pre-exists | — |

### Low
| # | Title | Labels |
|---|-------|--------|
| #73 | Validator emits PROPOSAL_TASK_DRIFT warnings for narrative proposal sections | — |
| #67 | adv_temporal_diagnose reports false projectWorkflow NOT_FOUND when workflow is healthy | — |
| #57 | adv_status visibility memo holds deleted change entries until session restart | — |
| #56 | adv_status first-call bootstrap nondeterminism (TMPRL1100 race against scopeAdvInstructionLoadAdv) | — |
| #43 | Delete stale bun.lock — dual lockfile drift risk | — |
| #33 | Temporal worker health check reports false-negative: worker alive but diagnose shows dead | — |

## Features (by WSJF, descending)

| # | Title | V | TC | RROE | E | WSJF | Labels |
|---|-------|---|----|------|---|------|--------|
| #51 | ADV backlog primitive: prioritized, sortable list of unstarted work | 8 | 3 | 13 | 3 | 8.0 | — |
| #79 | Add must-not section to future ADV proposals | 5 | 1 | 2 | 1 | 8.0 | — |
| #80 | Make worktree.deps.store required | 8 | 2 | 5 | 2 | 7.5 | — |
| #72 | Scope ADV instruction load to ADV-using sessions (~17k tokens per non-ADV session) | 13 | 8 | 13 | 5 | 6.8 | — |
| #66 | ADV clarify/design must surface 'imported assumptions from research' as scope decisions | 8 | 3 | 8 | 3 | 6.3 | — |
| #64 | Add adv_delta_add MCP tool — agent-facing path to encode spec deltas | 8 | 2 | 8 | 3 | 6.0 | — |
| #61 | Telemetry & Temporal follow-ups from fixTemporalContextMismatch | 5 | 2 | 5 | 2 | 6.0 | — |
| #78 | Verify Phase J + Phase 1.5 functional intent before final retirement | 3 | 1 | 2 | 1 | 6.0 | — |
| #81 | Document tdd_intent reclassification workaround for cached-dist self-update sessions | 3 | 1 | 2 | 1 | 6.0 | — |
| #84 | Sweep unused type exports flagged by knip | 3 | 1 | 2 | 1 | 6.0 | — |
| #87 | Wire scanFileOverlaps into prep validator when async checks exist | 8 | 3 | 5 | 3 | 5.3 | — |
| #85 | Programmatic git mutation guard | 13 | 5 | 8 | 5 | 5.2 | — |
| #42 | Stub JSON schemas provide zero validation — generate from Zod or delete | 5 | 2 | 3 | 2 | 5.0 | — |
| #59 | Multi-repo product linking: design model for ADV state across separate front/backend repos | 13 | 8 | 13 | 8 | 4.3 | — |
| #45 | Add runtime Zod parse validation at SDK boundary in tests | 5 | 2 | 5 | 3 | 4.0 | — |
| #65 | Replace prose-based MCP arg validation with declarative Zod refinements at schema boundary | 13 | 5 | 13 | 8 | 3.9 | — |
| #50 | Project capability index: searchable, indexed reference of truth | 8 | 3 | 8 | 5 | 3.8 | — |
| #68 | Pre-flight dryRun mode for mutating ADV tools | 8 | 3 | 8 | 5 | 3.8 | — |
| #70 | Surface worker.js restart exhaustion via agent-visible health surface | 8 | 5 | 13 | 8 | 3.3 | — |
| #69 | Bucket C / KD-8: switch Node default to OOP worker (or confirm Bun-only direction) | 5 | 2 | 3 | 3 | 3.3 | — |
| #82 | Reduce ESLint complexity violations across plugin/src | 5 | 2 | 3 | 3 | 3.3 | — |
| #74 | Investigate whether OCA tmux-window bridge needs replacement | 3 | 2 | 3 | 3 | 2.7 | — |
| #83 | Decompose long factory closures | 5 | 2 | 5 | 5 | 2.4 | — |

## Deferred / Unscored

- #71 — F10 Phase 2: build scripts/opencode-adv.sh CLI helper for non-LLM cross-project tool exec — _missing ADV Type_

## Triage Run Summary

- Run timestamp: 2026-05-08T19:56:31Z
- Sources scanned: gh (38 issues), project items (38)
- Issues scored this run: 21 features (batched GraphQL)
- Items deferred: 1
