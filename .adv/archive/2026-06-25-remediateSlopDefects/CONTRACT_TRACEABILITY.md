# Contract Traceability

**Change ID:** remediateSlopDefects
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-25T16:31:47.333Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Multi-session worktree ownership safe: process-liveness.ts isProcessAlive (EPERM→alive) + worktree-lease.test EPERM-reclaim case asserts a live peer's lease is not reclaimed (status 'blocked'). runId tr_mqtmm1vw. |
| SC2 | success_criterion | pass | review | Agenda durable: agenda.test proves malformed lines logged + compaction preserves malformed content (skipped). runId tr_mqtmro5b. |
| SC3 | success_criterion | pass | review | Operational failures observable: change.ts archive-cleanup logger.warn (3 sites) + mesh-issues parseFailed flag surfaced by archive-mesh consumer. |
| SC4 | success_criterion | pass | review | Single sources of truth: recoverReleaseGateIfWorkflowCompleted (change.ts), waitForGateCompletion (_adapters.ts), CHANGE_BRANCH_PREFIX/CHANGE_WORKFLOW_PREFIX (contracts.ts). |
| SC5 | success_criterion | pass | review | All 9 findings dispositioned: 7 fixed, QUAL-001 documented residual risk, STRUCT-001 deferred ROADMAP #82. Touched-scope scan clean. |
| AC1 | acceptance_criterion | pass | test | worktree-lease.test.ts EPERM mock → reclaim returns 'blocked'; process-liveness.test.ts ESRCH→false/EPERM→true. Independent reviewer confirmed fail-safe direction. runId tr_mqtmm1vw. |
| AC2 | acceptance_criterion | pass | test | agenda.test.ts: malformed line logged + skippedMalformed counted; compaction preserves malformed content. runId tr_mqtmro5b. |
| AC3 | acceptance_criterion | pass | test | change.ts 3 empty // warning-only catches → logger.warn(change id + op + error). change.archive-phase9 suite green. runId tr_mqtn8rbr. |
| AC4 | acceptance_criterion | pass | test | mesh-issues.test exit-0+malformed→parseFailed:true; archive-mesh.test consumer pushes error. runId tr_mqtmw722. |
| AC5 | acceptance_criterion | pass | test | recoverReleaseGateIfWorkflowCompleted SSOT; 3 catch sites delegate. Behavior-preserving: recovery/archive suites 97/97. runId tr_mqtmywu3. |
| AC6 | acceptance_criterion | pass | test | _adapters.waitForGateCompletion shared; gate.ts + change.ts delegate; 3 direct unit tests. gate + _adapters suites green. runId tr_mqtn5liz/tr_mqtn6sni. |
| AC7 | acceptance_criterion | pass | test | contracts.ts single prefix defs; 3 duplicate defs removed + campsite literals; rg confirms no remaining module-local def. boundary+visibility+git-finalize 130/130. runId tr_mqtndvqf. |
| AC8 | acceptance_criterion | pass | test | rq-worktreeLeaseLiveness01 (worktree-lifecycle 1.6.0) + rq-agendaDurableParse01 (advance-meta 1.19.0) with Given/When/Then + doc mirrors; impl conforms (AC1/AC2 tests). |
| AC9 | acceptance_criterion | pass | test | trunk-write-firewall classifyDestructiveBash docstring cites rq-twf01.7 + ADV_INSTRUCTIONS.md residual-risk; body unchanged; firewall tests green. runId tr_mqtnf7te. |
| AC10 | acceptance_criterion | pass | test | ROADMAP.md:54 #82 confirmed tracks plugin/src complexity; change.ts not decomposed (single file). |
| AC11 | acceptance_criterion | pass | test | pnpm run check PASS (schemas:check, typecheck, test-isolation, lockfile, lint, format:check). runId tr_mqtnqoyr. Full suite green except 42 proven-pre-existing failures. |
| C1 | constraint | respected | static_check | pnpm run check passes from plugin/. runId tr_mqtnqoyr. |
| C2 | constraint | respected | static_check | workflow-bundle-boundary.test.ts green; contracts.ts additions are plain string consts, no new node/storage/tools imports. |
| C3 | constraint | respected | static_check | TDD red→green for QUAL-002/003/005 (red runIds tr_mqtmj9zx, tr_mqtmq5vj, tr_mqtmuric precede green). |
| C4 | constraint | respected | static_check | No public schema drift; schemas:check green; spec.json edits are not public Zod schemas. |
| C5 | constraint | respected | static_check | Structural-correctness preserved: tagged ParseLineResult union (agenda), typed parseFailed flag (mesh), typed liveness helper. No new heuristics own correctness. |
| DONT1 | avoidance | respected | review | trunk-write-firewall classifyDestructiveBash body unchanged (docstring-only diff). |
| DONT2 | avoidance | respected | review | Exclusive-worktree-ownership invariant preserved: EPERM→alive prevents reclaiming a live peer's lease. |
| DONT3 | avoidance | respected | review | No new silent-failure catches: all new/changed catches log or surface (agenda malformed kind, change.ts logger.warn, mesh parseFailed). rg confirms no new bare empty catch. |
| DONT4 | avoidance | respected | review | Firewall not hardened against shell indirection; docstring defers it as accepted residual risk. |
| DONT5 | avoidance | respected | review | change.ts not decomposed (single 5412-line module; only internal helper extraction). |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-361607ec80f6 | AC8 |  | C4 |  |
| tk-6a5415f4ba5a | SC1, AC1 | AC1, AC8 | DONT2, C2, C3, C5 |  |
| tk-1e91b4227a85 | SC2, AC2 | AC2, AC8 | DONT3, C3, C5 |  |
| tk-0ba8e833e732 | SC3, AC4 | AC4 | DONT3, C5 |  |
| tk-694324956834 | SC4, AC5 | AC5 | C2, C5 |  |
| tk-84944765a6b2 | SC4, AC7 | AC7 | C2, C5 |  |
| tk-e2f6f499ef7a | SC5, AC9 | AC9 | DONT1, DONT4 |  |
| tk-7d7a1b5b6191 | SC5, AC10 | AC10 | DONT5 |  |
| tk-d648ec6f8130 | SC4, AC6 | AC6 | C2 |  |
| tk-5cc315776738 | SC3, AC3 | AC3 | DONT3 |  |
| tk-123206b439b0 | SC5 | AC11, SC5 | C1 |  |
