# Roadmap

<!-- adv-triage generated: 2026-05-09T18:09:02Z | DO NOT EDIT MANUALLY -->
<!-- Source of truth: GitHub Project #2 owned by @Sharper-Flow -->

Regenerate with `/adv-triage --execute`. Manual edits are overwritten.

## Bugs (by priority)

### Critical
| # | Title | Labels |
|---|-------|--------|
| #88 | ADV archive sees incomplete gates despite gate status complete | — |
| #102 | Git mutation guard blocks canonical archive push from default branch | — |

### High
| # | Title | Labels |
|---|-------|--------|
| #48 | ADV worktree tools fail with WorkflowUpdateFailedError after repair and clean diagnostics | needs-verify |
| #60 | Post-Temporal-cutover external-state hygiene leftovers + test-isolation leak | — |
| #91 | Doctor script: classify blank rows by orphan-vs-live, not just by age | — |

### Medium
| # | Title | Labels |
|---|-------|--------|
| #53 | adv_change_archive recovery path skips createInRepoArchive when external bundle pre-exists | — |
| #54 | adv_change_close fails on terminated workflows with no disk-only fallback | — |
| #62 | adv_change_validate over-triggers MISSING_TDD_EVIDENCE on data/constant tasks | — |
| #63 | adv_change_validate returns passed:false on warnings-only state in strict mode | — |
| #86 | Fix terminal.ts permission-ATTN vs idle-ATTN distinction | — |
| #92 | adv_status [doctor] recommendation: replace 'Stale OpenCode blank assistant messages detected' framing | — |
| #95 | Hot-change recommendation falsely attributes work to 'another agent' when caller is the worker | — |
| #97 | Reflection improvement_suggestions are generic — replace with category-specific guidance | — |

### Low
| # | Title | Labels |
|---|-------|--------|
| #33 | Temporal worker health check reports false-negative: worker alive but diagnose shows dead | needs-verify |
| #43 | Delete stale bun.lock — dual lockfile drift risk | — |
| #56 | adv_status first-call bootstrap nondeterminism (TMPRL1100 race against scopeAdvInstructionLoadAdv) | — |
| #57 | adv_status visibility memo holds deleted change entries until session restart | — |
| #67 | adv_temporal_diagnose reports false projectWorkflow NOT_FOUND when workflow is healthy | needs-verify |
| #73 | Validator emits PROPOSAL_TASK_DRIFT warnings for narrative proposal sections | — |

## Features (by WSJF, descending)

| # | Title | V | TC | RROE | E | WSJF | Labels |
|---|-------|---|----|------|---|------|--------|
| #98 | Temporal-cutover stabilization tracker (umbrella) | 8 | 8 | 13 | 2 | 14.5 | priority:high |
| #100 | Harden phase should validate and implement review suggestions/questions | 8 | 3 | 8 | 2 | 9.5 | — |
| #51 | ADV backlog primitive: prioritized, sortable list of unstarted work | 8 | 3 | 13 | 3 | 8.0 | priority:medium |
| #79 | Add must-not section to future ADV proposals | 5 | 1 | 2 | 1 | 8.0 | — |
| #80 | Make worktree.deps.store required | 8 | 2 | 5 | 2 | 7.5 | — |
| #105 | Update /adv-triage Phase 3b to use question tool one-by-one instead of text-only batch prompt | 5 | 5 | 5 | 2 | 7.5 | — |
| #72 | Scope ADV instruction load to ADV-using sessions (~17k tokens per non-ADV session) | 13 | 8 | 13 | 5 | 6.8 | priority:high |
| #66 | ADV clarify/design must surface 'imported assumptions from research' as scope decisions | 8 | 3 | 8 | 3 | 6.3 | priority:medium |
| #64 | Add adv_delta_add MCP tool — agent-facing path to encode spec deltas | 8 | 2 | 8 | 3 | 6.0 | priority:medium |
| #61 | Telemetry & Temporal follow-ups from fixTemporalContextMismatch | 5 | 2 | 5 | 2 | 6.0 | priority:high |
| #78 | Verify Phase J + Phase 1.5 functional intent before final retirement | 3 | 1 | 2 | 1 | 6.0 | — |
| #81 | Document tdd_intent reclassification workaround for cached-dist self-update sessions | 3 | 1 | 2 | 1 | 6.0 | — |
| #84 | Sweep unused type exports flagged by knip | 3 | 1 | 2 | 1 | 6.0 | — |
| #87 | Wire scanFileOverlaps into prep validator when async checks exist | 8 | 3 | 5 | 3 | 5.3 | — |
| #85 | Programmatic git mutation guard | 13 | 5 | 8 | 5 | 5.2 | — |
| #42 | Stub JSON schemas provide zero validation — generate from Zod or delete | 5 | 2 | 3 | 2 | 5.0 | priority:low |
| #104 | Expose stable ADV — cdae139e…      ID                        TITLE                                    TASKS  GATES          LAST ACTIVITY ⏰  branchAwareAdvOcaSession  Branch-aware ADV/OCA session management   7/10  ✓ ✓ ✓ ✓ ○ ○ ○  4d ago  1 active · 39 archived · 0 closed read surface for OCA consumption (O2) | 8 | 8 | 8 | 5 | 4.8 | — |
| #59 | Multi-repo product linking: design model for ADV state across separate front/backend repos | 13 | 8 | 13 | 8 | 4.3 | priority:medium |
| #93 | adv_status: surface reflection friction signal in hygiene view | 5 | 3 | 5 | 3 | 4.3 | priority:medium |
| #103 | Permission-first config for ADV agents | 8 | 5 | 8 | 5 | 4.2 | — |
| #45 | Add runtime Zod parse validation at SDK boundary in tests | 5 | 2 | 5 | 3 | 4.0 | priority:low |
| #94 | Add adv_friction_query MCP tool — agent-queryable reflection friction | 5 | 2 | 5 | 3 | 4.0 | priority:medium |
| #96 | adv_session_list: cross-project view (v2 promotion) | 5 | 2 | 5 | 3 | 4.0 | priority:medium |
| #65 | Replace prose-based MCP arg validation with declarative Zod refinements at schema boundary | 13 | 5 | 13 | 8 | 3.9 | priority:medium |
| #99 | Make change-contract traceability structural across review and archive | 13 | 5 | 13 | 8 | 3.9 | — |
| #50 | Project capability index: searchable, indexed reference of truth | 8 | 3 | 8 | 5 | 3.8 | priority:medium |
| #68 | Pre-flight dryRun mode for mutating ADV tools | 8 | 3 | 8 | 5 | 3.8 | priority:low |
| #69 | Bucket C / KD-8: switch Node default to OOP worker (or confirm Bun-only direction) | 5 | 2 | 3 | 3 | 3.3 | priority:low, needs-verify |
| #82 | Reduce ESLint complexity violations across plugin/src | 5 | 2 | 3 | 3 | 3.3 | — |
| #71 | F10 Phase 2: build scripts/opencode-adv.sh CLI helper for non-LLM cross-project tool exec | 5 | 3 | 8 | 5 | 3.2 | priority:low |
| #83 | Decompose long factory closures | 5 | 2 | 5 | 5 | 2.4 | — |
| #90 | Investigate: replace N-provider-variant model with single adv + runtime-injected provider hints | 5 | 2 | 5 | 5 | 2.4 | — |

## Deferred / Unscored

- None

## Triage Run Summary

- Run timestamp: 2026-05-09T18:09:02Z
- Sources scanned: gh (47 open issues), agenda (17), wisdom (0), notes (0), changes (17), todos (1 implementation-path candidate)
- Issues opened this run: 1 (#105)
- Field assignments this run: 12
- Items deferred: 0
