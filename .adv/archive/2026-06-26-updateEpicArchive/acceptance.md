# Acceptance

Reviewed at: 2026-06-26T21:11:19.206Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Archiving an Epic child change loads the parent Epic through `adv_epic_show` before archive execution. | pass | Reviewer verdict READY; /adv-archive Phase 1 documents `adv_epic_show epic_id:` for `epic_membership`. |
| SC2 | success_criterion | Future archive flow projects terminal child state to the parent Epic entry only after release proof. | pass | `change.archive-phase9.test.ts` passes; archive projection test asserts setEntryTerminalSummary after archive save/release proof. |
| SC3 | success_criterion | Existing archived child changes can be repaired/backfilled so compact Epic history/progress advances. | pass | `epic.test.ts` passes; archived child sync_child_projection backfills terminal summary. |
| SC4 | success_criterion | Repair/backfill can handle completed or unreachable child workflows by using canonical archived child state/archive-bundle/release evidence instead of requiring a live child workflow mutation. | pass | `epic.test.ts` passes; repair reads canonical child state from store and does not call child membership mutation for terminal child. |
| SC5 | success_criterion | Archive and repair reports include Epic ID, entry ID/title/order when available, and evidence/result of verification or repair. | pass | Command/spec/agent assets include Epic ID/entry/report/repair evidence guidance; asset suite passes. |
| SC6 | success_criterion | Non-Epic archive behavior remains unchanged. | pass | Existing archive tests pass; non-Epic path unchanged except report guidance allows `Epic: n/a`. |
| AC1 | acceptance_criterion | `.opencode/command/adv-archive.md` states Phase 1 loads `adv_epic_show epic_id: ...` when `adv_change_show` includes `epic_membership`. | pass | `advance-epics-assets.test.ts` requires adv-archive.md contains `epic_membership` and `adv_epic_show epic_id:`; suite passes. |
| AC2 | acceptance_criterion | Runtime archive terminalization fires an existing typed Epic terminal-summary path after durable release proof, so archived Epic children appear in compact Epic history rather than active next work. | pass | `change.archive-phase9.test.ts` terminal projection test passes. |
| AC3 | acceptance_criterion | Runtime projection is idempotent and does not duplicate Epic entries on archive retry. | pass | Projection path uses idempotent `setEntryTerminalSummary`; archive Phase 9 suite passes on retry-safe behavior. |
| AC4 | acceptance_criterion | `adv_epic_repair_membership` (or a closely related typed Epic repair path) can repair an already-archived child by projecting terminal summary from canonical child/archive evidence when the child workflow is completed, missing, or otherwise unreachable. | pass | `epic.test.ts` archived and closed child sync repair tests pass. |
| AC5 | acceptance_criterion | Repair/backfill updates Epic progress: completed_entries increments and next_entry_id advances past terminal entries when applicable. | pass | Repair uses existing Epic terminal-summary signal; Epic workflow recomputes progress from terminal_summary. Reviewer confirmed path. |
| AC6 | acceptance_criterion | Stale/pending/unreachable membership projection repair remains typed and audited; no direct ADV state file reads/edits are introduced. | pass | All repair/update paths use typed store/Epic APIs; no direct ADV state file reads were added. |
| AC7 | acceptance_criterion | `.opencode/command/adv-archive.md` final report template contains an Epic line covering `n/a`, verified terminal state, repaired state, and warning cases. | pass | adv-archive report template includes `Epic:` line; asset suite passes. |
| AC8 | acceptance_criterion | `.opencode/agents/adv.md` or synchronized ADV instructions include archive/release terminal projection and repair evidence in the Epic context-loading rule. | pass | ADV agent and ADV_INSTRUCTIONS include archive/release terminal projection repair/backfill guidance; asset suite passes. |
| AC9 | acceptance_criterion | `advance-epics` spec gains a requirement for Epic-aware archive terminal-state verification and retroactive repair, with Given/When/Then scenarios for future archive, retroactive repair, completed child workflows, and non-Epic archive flows. | pass | Spec JSON includes `rq-epicArchiveSync01` with future archive, retroactive repair, non-Epic, and advisory-order scenarios. |
| AC10 | acceptance_criterion | `docs/specs/advance-epics.md` mirrors the new requirement. | pass | docs/specs/advance-epics.md includes `rq-epicArchiveSync01`; mirror asset test passes. |
| AC11 | acceptance_criterion | Tests fail without the archive/Epic runtime, repair, command, spec, and agent guidance and pass after implementation. | pass | RED/GREEN recorded for archive Phase 9, Epic repair, and asset tests; final targeted suite passed 99 tests. |
| C1 | constraint | Do not make Epic membership mandatory. | respected | No mandatory Epic membership behavior added; non-Epic archive remains valid. |
| C2 | constraint | Do not block archive solely because earlier Epic entries are incomplete; Epic order remains advisory. | respected | Command/spec preserve advisory-order non-blocking language. |
| C3 | constraint | Do not read or edit ADV state files directly; use store/tool APIs and archive-bundle/canonical state reads exposed through typed surfaces. | respected | Implementation uses store/tool APIs only; no direct ADV state file access added. |
| C4 | constraint | Do not add Jira-like Epic workflow fields. | respected | No Jira-like fields/workflows added. |
| C5 | constraint | Do not bypass typed Epic tools/signals for repair/update. | respected | Repair/update uses typed Epic signal/store paths. |
| C6 | constraint | Do not weaken Phase 9 release-proof requirements or archive sign-off semantics. | respected | Archive Phase 9 suite passes; release proof ordering preserved. |
| C7 | constraint | Do not treat Epic terminal projection as release proof. | respected | Epic terminal projection is reported as derived planning evidence, not release proof. |
| OOS1 | out_of_scope | Automatic shell promotion, reordering, or new planning workflow features. | respected | No shell promotion/reordering/planning workflow features added. |
| OOS2 | out_of_scope | Cross-project target-path repair redesign beyond safe typed warning/target-unreachable handling. | respected | No cross-project target-path redesign added; existing typed warning/repair surfaces remain. |
| OOS3 | out_of_scope | Manual one-off repair of the reported external Epic outside tested reusable repair capability. | respected | No one-off repair of the reported external Epic performed. |
| DONT1 | avoidance | Do not silently ignore `epic_membership` in release/archive. | respected | Archive/release no longer ignores `epic_membership`; command and runtime paths cover it. |
| DONT2 | avoidance | Do not present Epic repair as optional if stale/pending/unreachable projection state is detected during archive verification. | respected | Stale projection guidance routes to typed repair/backfill. |
| DONT3 | avoidance | Do not call a change shipped if release proof is missing; Epic verification is additional evidence, not a substitute for Phase 9 proof. | respected | Archive Phase 9 tests preserve release proof authority. |
| DONT4 | avoidance | Do not let `sync_child_projection` report success while compact Epic history/progress remains stale for an archived child. | respected | `epic.test.ts` proves terminal sync_child_projection reports terminal projection instead of membership-only no-op for archived child. |

