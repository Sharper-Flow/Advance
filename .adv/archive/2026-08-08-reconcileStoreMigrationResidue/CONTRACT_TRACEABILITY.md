# Contract Traceability

**Change ID:** reconcileStoreMigrationResidue
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-08-08T03:55:50.271Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Integration contract test proofClean assertion green; full suite tr_msjr2m3h_306611cf (5,166 tests); reviewer READY verdict |
| SC2 | success_criterion | pass | review | Integration migrationClean assertion (unmigrated markers zero + marker v1) green; artifact-metadata executor suites green |
| SC3 | success_criterion | pass | review | Integration reconstructed assertion + provenance schema + convergence gate green; epic-recovery suite green |
| SC4 | success_criterion | pass | review | Host/CLI parity: integration host-handler test + bun bin suite 374 pass; tool and CLI emit identical plan/approve semantics |
| SC5 | success_criterion | pass | review | Pokeedge-shaped end-to-end integration suite 3/3 green across all 12 residue classes; full suite green |
| AC1 | acceptance_criterion | pass | test | schema-drift normalize_enum_mapping executor maps retired values to other with before-state audit; normalizeLatestProjection repair path; integration enumReadable green |
| AC2 | acceptance_criterion | pass | test | Unmappable records quarantined + reported as documented residuals (remain_quarantined_reported); never synthesized; quarantine suite green |
| AC3 | acceptance_criterion | pass | test | rebuild_summary_shard + rebuild_from_changes executors; resolution-proved rebuilds; integration scan counters green |
| AC4 | acceptance_criterion | pass | test | advance_legacy_to_canonical advances with before-state; report_only for newer-than-canonical; integration asserts canonical byte-identical and legacy revision advanced |
| AC5 | acceptance_criterion | pass | test | migrate_record + classify_terminal_noop executors; marker written only when failed set empty; integration migrationClean green |
| AC6 | acceptance_criterion | pass | test | reconstruct_from_child_fragments builds owner from fragment fields only, stamps reconstruction provenance with gap flags, convergence gate before success; integration green |
| AC7 | acceptance_criterion | pass | test | formally_lost_report + clear_dangling_membership executors; bounded loss report; no Epic fabrication; epic-recovery suite green |
| AC8 | acceptance_criterion | pass | test | Read-only worker.lock probe refuses apply with typed error; dry-run writes nothing and emits plan + plan_hash; integration stale-plan/lock test green |
| AC9 | acceptance_criterion | pass | test | Bounded pages execute then typed continuation with cursor; resume skips only durably-completed receipts (failed re-processed); interrupted runs derivable via deriveRunStatus; paging fix 9f007c49 + resume fix 8ce35e86 green |
| AC10 | acceptance_criterion | pass | test | Unbounded proof wired into apply/report/tool/CLI with before/after counts; proof error fails closed; baselines captured under reconcile lock (8483b924); integration proofClean green |
| AC11 | acceptance_criterion | pass | test | normalize_and_restore executor handles nested quarantine layouts, restores to readable set with before-state audit; ambiguity refuses typed; quarantine suite green |
| AC12 | acceptance_criterion | pass | test | adv_store_reconcile host tool (operator-only, registry/policy/manifests green) + bin/adv reconcile + dist/reconcile-cli.js third bundle with SHA-validated deploy wiring; parity suites green |
| C1 | constraint | respected | static_check | Legacy-envelope executor implements legacy→canonical only; newer-than-canonical report_only never modifies canonical; tests green |
| C2 | constraint | respected | static_check | Locks via repo acquireFileLock (reconcile-apply, reconcile-audit); no new dependency introduced |
| C3 | constraint | respected | static_check | Fail-closed posture throughout: typed refusals, quarantine over synthesis, formal-loss over fabrication; reviewer sweep READY |
| C4 | constraint | respected | static_check | Active-projection writes route through commitChangeProjection/coordinator; save-change allow-list invariant green |
| C5 | constraint | respected | static_check | Tool surface follows registry/policy/manifest/schema conventions; generate:manifests:check + schemas:check green |
| C6 | constraint | respected | static_check | Dispatcher enforces RECONCILE_BATCH_SIZE bounded batches with persisted checkpoints |
| C7 | constraint | respected | static_check | Atomic per-record receipts + progress checkpoints derivable from receipts; crash-safety tests green |
| DONT1 | avoidance | respected | review | Independent reviewer contract sweep, READY verdict, no avoidance violations found; report persisted |
| DONT2 | avoidance | respected | review | Reviewer sweep READY; engine reuses existing storage primitives (no parallel write paths) |
| DONT3 | avoidance | respected | review | Integration suite drives the real engine (no reimplementation/mock theater); reviewer verified |
| DONT4 | avoidance | respected | review | Epic path never fabricates: insufficient fragments -> formal-loss report + explicit membership cleanup; tests green |
| DONT5 | avoidance | respected | review | Completion proof is unbounded (caps unset); budget-capped scan never accepted as proof; proof-error fail-closed; tests green |
| DONT6 | avoidance | respected | review | Reviewer sweep READY; artifact-metadata migration behavior preserved per contract |
| OOS1 | out_of_scope | respected | not_applicable | Scope held: no out-of-scope work merged; reviewer scope_drift none |
| OOS2 | out_of_scope | respected | not_applicable | No changes to unrelated store subsystems; diff confined to reconcile engine/surface/deploy wiring; reviewer verified |
| OOS3 | out_of_scope | respected | not_applicable | No production-store mutation performed by this change; integration uses isolated fixtures |
| OOS4 | out_of_scope | respected | not_applicable | Surface bounds respected: tool is operator-only, CLI standalone; no MCP mutation exposure; reviewer verified |
| OOS5 | out_of_scope | respected | not_applicable | Epic recovery bounded to reconstruction/formal-loss; no Epic feature work; reviewer verified |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-9aebec00d9c1 | AC8 |  | C5, C7, DONT2, DONT6, OOS2 |  |
| tk-06783de46a3f |  |  |  | Spec/documentation deliverable mandated by proposal Scope ('Spec coverage for the new capability') and agreement Agent Decision 6; no SC/AC/C/DONT/OOS contract item maps directly to staging spec text. |
| tk-6dac876c0d92 | AC8, AC9 |  | C2, C4, C6, C7, DONT2, OOS2 |  |
| tk-942a464420d7 | AC1, AC2 |  | C3, C4 |  |
| tk-889d8669fc6d | AC3 |  | C4 |  |
| tk-b142bd14bfa3 | AC4 |  | C1, C4 |  |
| tk-a8856055b2ad | AC5 | SC2 | C4, DONT6 |  |
| tk-43c9b5142c9c | AC6, AC7 | SC3 | C3, C4, DONT4, OOS5 |  |
| tk-c067e522c3cb | AC11 |  | C3, C4 |  |
| tk-078feb931e64 | AC10 | SC1 | DONT5 |  |
| tk-346d82ab9e03 | AC12 |  | C5, OOS4 |  |
| tk-229fbd8052ea | AC12 |  | C5, OOS4 |  |
| tk-f15e07ede630 |  | SC1, SC2, SC3, SC4, SC5, AC8, AC9, AC10, AC12 | DONT3, OOS3 |  |
