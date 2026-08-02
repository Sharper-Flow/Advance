# Acceptance

Reviewed at: 2026-08-02T22:57:24.746Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Change reads remain useful during optional-enrichment or workflow delays. | pass | Disk-authoritative read remains useful under slow enrichment. |
| SC2 | success_criterion | Routine read behavior creates no new Temporal traffic or workflow signals. | pass | No new Temporal traffic or signals from routine reads. |
| AC1 | acceptance_criterion | Given slow optional enrichment, when `adv_change_show` runs, then it returns authoritative disk projection plus bounded unavailable warnings. | pass | 199 focused tests tr_msccthou_b060e50e; bounded enrichment preserves disk projection and same-shape warnings; review attempt 2 READY. |
| AC2 | acceptance_criterion | Given a Temporal operation exceeds its own deadline, when the read responds, then callers receive typed/degraded classification rather than only generic tool timeout. | pass | Shared aggregate deadline produces typed hydrationStats/omittedIds on exhaustion; fast errors distinguished from timeouts; review attempt 2 READY. |
| AC3 | acceptance_criterion | Given routine change reads, when authoritative disk projection exists, then they do not issue workflow queries or signals. | pass | assertNoWorkflowCalls now exercises real paths; persistClarifyFindings no longer mutates from read path (persist: false); review attempt 2 READY. |
| AC4 | acceptance_criterion | Given stale loaded-plugin evidence, when release proof depends on current behavior, then release blocks until the loaded bundle is current. | pass | PLUGIN_BUNDLE_STALE_RELEASE_PREFLIGHT preflight refuses strictly stale loaded bundle; current/unknown never blocks. |
| AC5 | acceptance_criterion | Evidence: timeout ordering, optional-enrichment isolation, disk-only reads, and stale-bundle release handling via automated regression tests. | pass | Whole-show 8s budget test plus focused suites cover all four scenarios; pnpm run check and pnpm run build green. |
| C1 | constraint | Must keep health diagnostics global; no per-change workflow probe is added. | respected | No per-change doctor probe introduced. |
| C2 | constraint | Must not raise all tool timeouts indiscriminately. | respected | No global tool timeout raised. |
| C3 | constraint | Must not fold this repair into `fixTaskUpdatePersistence`. | respected | Separate ADV change from fixTaskUpdatePersistence. |
| C4 | constraint | Must not add workflow signals or Temporal mutations to routine read paths. | respected | Read path performs no workflow save/query/signal; clarify persistence display-only. |
| DONT1 | avoidance | Do not use OpenCode restart as the sole durable repair. | respected | Stale-bundle guard is a structural preflight, not a restart-only remedy. |

