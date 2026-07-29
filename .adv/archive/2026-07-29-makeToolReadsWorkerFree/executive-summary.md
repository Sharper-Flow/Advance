# Outcome

Routine ADV host-tool reads no longer require a live change or Epic workflow worker to report durable facts. Agents can see persisted gates, archived change summaries, and Epic projection state instead of receiving false empty/not-found results after session queue loss.

## Delivered value

- `adv_gate_status` now reads persisted gate state and reports unavailable workflow-only details explicitly.
- Change show/list behavior is regression-protected for projection and archived reads.
- Epic show renders durable projection facts before advisory convergence; completed-candidate evaluation reports a typed unavailable result when live evaluation cannot run.
- A shared structural guard prevents workflow-query calls from returning to designated routine host readers.
- CLI status retains its Visibility-only fail-closed behavior.

## Verification

- Independent acceptance review: READY; no findings.
- Focused acceptance review: 139/139 tests passed.
- Task-level verification passed: 68 gate tests, 24 change/guard/CLI tests, and 13 Epic/guard tests.
- Each implementation task was checkpointed with RED→GREEN evidence.

## Risks and follow-up

- The change worktree is two commits behind `origin/trunk`; rebase and revalidate before merge/release.
- Full-suite failures reported by the engineer were pre-existing and outside this change (`schema-error-propagation.test.ts`, `optimized-handoff-assets.test.ts`); focused affected suites are green.