# Acceptance

Reviewed at: 2026-07-20T00:05:00.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | All scoped defects receive a verified disposition: fixed, already fixed with regression proof, or partially fixed with remaining behavior completed. | pass | Nine linked issues have closure evidence; eight tasks done; review defect fixed at 307f4d47. |
| SC2 | success_criterion | Session authority, report validation, evidence matching, readiness decisions, workflow versioning, and validator authority use typed structural inputs—not first-caller, command-string, retry timing, or unscoped prose heuristics. | pass | Typed structural authorities cover session, report, run, receipt, replay, and validator behavior. |
| SC3 | success_criterion | Valid workflows complete without avoidable manual recovery; unsafe or incomplete evidence remains fail-closed with actionable diagnostics. | pass | Valid paths recovered without bypass; unsafe/incomplete evidence remains fail-closed with typed diagnostics. |
| SC4 | success_criterion | Existing task, report, and workflow records remain readable through explicit compatibility paths. | pass | Legacy variants, additive schemas, and replay fixtures passed tr_mrsgjl5y_9d79db59. |
| SC5 | success_criterion | Targeted tests, `pnpm run check`, build, smoke suite, and full suite pass from the final branch. | pass | Full suite tr_mrsgjl5y_9d79db59, check tr_mrsgbrar_8f21a9d9, build tr_mrsgk6le_73f3ac45 passed. |
| AC1 | acceptance_criterion | A root OpenCode session can execute a blockable ADV tool before any system transform; descendant sessions remain blocked; missing, cyclic, malformed, or unavailable ancestry fails closed. | pass | 35462b52; firewall/integration tests cover root, descendant, missing, cyclic, malformed, unavailable ancestry. |
| AC2 | acceptance_criterion | An `in_progress` task assigned to a non-live peer appears as an orphan warning identifying task and change, with documented recovery; no status mutation occurs automatically. | pass | 35462b52 + 307f4d47; tr_mrsgavwh_078d6696 passed 15 WIP orphan/privacy tests. |
| AC3 | acceptance_criterion | Task add/update guidance states that only `implements` and `verifies` cover acceptance criteria; uncovered AC IDs are returned actionably; `respects` semantics remain unchanged. | pass | f9424e69; one cancellation-aware projection keeps respects separate and returns uncovered IDs. |
| AC4 | acceptance_criterion | Malformed nested report input returns bounded field paths and messages; no report or workflow mutation persists. | pass | d626cf61; bounded nested preflight diagnostics occur before handler/signal/write. |
| AC5 | acceptance_criterion | Behavior-critical non-test tasks require rationale and proof target at prep, but reviewer-owned conclusion evidence only by completion; pre-planning evidence-plan correction does not require cancellation or recreation. | pass | f9424e69; stage-v2 prep rationale/proof target and completion reviewer reference tests pass. |
| AC6 | acceptance_criterion | An engineer/designer report referencing typed test evidence owned by the same task matches by run identity and exit status despite cosmetic command-label differences; absent or mismatched typed evidence still warns or blocks; reviewer aggregate text is non-authoritative. | pass | 76eaad8d; typed-v1 same-task run/exit binding and explicit legacy fallback tests pass. |
| AC7 | acceptance_criterion | After a successful readiness-affecting mutation, immediate gate completion observes applied state on its first valid attempt or returns a fresh typed blocker—never the previous blocker set solely due to handler lag. | pass | b5e8fec9; exact post-apply receipt and typed unconfirmed-failure tests pass. |
| AC8 | acceptance_criterion | Archive validation with at least 250 terminal candidates and 50 active candidates completes inside the fixed 8-second authority budget, performs zero terminal/archive authority reads, and remains fail-closed on active omissions. | pass | addArchiveScaleRegression proves 250 terminal/50 active under 8,000ms, zero terminal reads, fail-closed omissions; #239 evidence comment recorded. |
| AC9 | acceptance_criterion | Worktree inventory with at least 250 owners and one poisoned workflow returns healthy records plus explicit poison/omission metadata within its bound; omitted records never become deletion candidates. | pass | d5b0d53c; 250 owners + poisoned workflow regression returns healthy and explicit omitted/poison records safely. |
| AC10 | acceptance_criterion | Public schema changes regenerate deterministically and preserve strict validation plus legacy read compatibility. | pass | tr_mrsgbrar_8f21a9d9 passed schemas/typecheck/manifests/lint/format; full suite passed legacy reads. |
| AC11 | acceptance_criterion | Each GitHub issue receives closure evidence citing regression tests, relevant change or commit, and final verification result; no issue closes from inference alone. | pass | Issues #224/#239/#240/#241/#243/#244/#245/#246/#247 each received relevant checkpoint, regression, and final-verification evidence. |
| AC12 | acceptance_criterion | Histories containing `state-backed-acceptance-proof-v1` replay without `TMPRL1100`; confirmed nonterminal PokeEdge Web changes `fixSetLogoLoading`, `addAppIcons`, and `restoreUpgradePageChrome` become queryable without reset, termination, status repair, or disk bypass; a bounded target scan reports any additional affected open changes. | pass | 7e7c8662; known PokeEdge changes queryable after deploy/restart, staleRunningCount=0, bounded 50-change scan found no additional poison candidate. |
| AC13 | acceptance_criterion | Design validators cannot classify out-of-scope alternatives as blockers or halt gates solely through `validation.status: fail`; every blocker cites an approved contract item and in-scope remediation. | pass | d626cf61; validator blockers require approved contract IDs, in-scope remediation, source; fail status advisory. |
| C1 | constraint | Role and gate enforcement remain fail-closed. | respected | Role and gate enforcement remain fail-closed. |
| C2 | constraint | Peer-session privacy remains intact; peer PID and full working directory are not exposed. | respected | Peer PID/full workdir omitted; warning rows use privacy-safe IDs. |
| C3 | constraint | Temporal determinism, signal ordering, replay compatibility, and Temporal-only runtime persistence are preserved. | respected | Temporal ordering/determinism/replay fixtures pass; persistence remains Temporal-backed. |
| C4 | constraint | Public schema evolution is additive where possible; legacy records have explicit deterministic normalization or fallback. | respected | Schema evolution additive with explicit deterministic legacy variants. |
| C5 | constraint | The fixed 8-second archive active-authority bound is not raised. | respected | Archive authority budget remains fixed at 8,000ms. |
| C6 | constraint | `addArchiveScaleRegression` retains #239 implementation ownership; this change consumes its accepted evidence. | respected | addArchiveScaleRegression retains #239 ownership; no duplicate inventory authority. |
| C7 | constraint | Regression-suite evidence is sufficient for #239/#224 closure; live external-project mutation is not required. | respected | #239/#224 use production-shaped regression evidence; no destructive live mutation required. |
| C8 | constraint | Poison-history repair changes Advance worker compatibility only; no PokeEdge Web product-code edits. | respected | No PokeEdge product-code edit; only Advance worker compatibility and read-only checks. |
| DONT1 | avoidance | Do not weaken sub-agent restrictions or trust caller-supplied role arguments. | respected | No restriction weakening or caller role authority. |
| DONT2 | avoidance | Do not automatically reset, complete, cancel, or reassign orphaned tasks. | respected | No automatic orphan reset/complete/cancel/reassign. |
| DONT3 | avoidance | Do not count `respects` as implementation or verification coverage. | respected | Respects never covers success/acceptance criteria. |
| DONT4 | avoidance | Do not accept display command text or reviewer aggregate prose as verification authority when typed evidence is required. | respected | Typed run identity owns new evidence; prose/display labels non-authoritative. |
| DONT5 | avoidance | Do not use delays, blind retries, cache state, or partial inventories as correctness authority. | respected | Receipts and complete authority own correctness; retries/cache/partial lists do not. |
| DONT6 | avoidance | Do not create duplicate archive/worktree inventory architectures. | respected | Existing archive/worktree authorities extended, not duplicated. |
| DONT7 | avoidance | Do not use status repair, termination, or archive recovery to bypass pending acceptance/release gates. | respected | No reset, termination, status repair, or archive bypass of product gates. |
| OOS1 | out_of_scope | Unrelated older GitHub issues. | missing |  |
| OOS2 | out_of_scope | Destructive repair of existing application-project archives, workflows, tasks, or worktrees. | missing |  |
| OOS3 | out_of_scope | Broad replacement of Temporal or OpenCode session architecture. | missing |  |
| OOS4 | out_of_scope | Automatic orphan-task rescue. | missing |  |
| OOS5 | out_of_scope | New external dependencies or services. | missing |  |
| OOS6 | out_of_scope | Modifying OpenCode core to change SDK validation-error transport. | missing |  |
| OOS7 | out_of_scope | PokeEdge Web product-code changes. | missing |  |

