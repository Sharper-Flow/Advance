# Contract Traceability

**Change ID:** addReleaseNotesData
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-28T17:30:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Versioned sidecar exposes typed audience/category/area/action/breaking/deprecation/highlight data; Corded checkpoint-range selector audit proves future discovery without prose/diff parsing. |
| SC2 | success_criterion | pass | review | Pinned PokeEdge af05cb49 and PokeEdge-Web d0dfd936 workflows promote complete archive git trees without CI/config changes. |
| SC3 | success_criterion | pass | review | Independent reviewer READY; zero-prompt asset tests pass; existing archive files and Corded sources unchanged. |
| AC1 | acceptance_criterion | pass | test | Schema RED/GREEN plus singular remediation verify fields, enums, strict nested objects, bounds, object acceptance and array rejection. |
| AC2 | acceptance_criterion | pass | test | Archive tests validate version 1.0 envelope with change_id/title/release_notes and standalone generated schema. |
| AC3 | acceptance_criterion | pass | test | Archive absent-data tests prove no release-notes.json and unchanged existing path. |
| AC4 | acceptance_criterion | pass | test | Command asset tests verify review composes and harden refines through typed setter with no new prompt. |
| AC5 | acceptance_criterion | pass | test | Archive command asset tests verify missing-block fast-track synthesis before bundle/signoff with no new prompt. |
| AC6 | acceptance_criterion | pass | test | Pure mapping tests cover feat→added, fix→fixed, perf→changed and undefined others; first-run missing PR is accepted with no backfill. |
| AC7 | acceptance_criterion | pass | test | schemas:generate/check pass; change and standalone release-notes JSON schemas are tracked. |
| AC8 | acceptance_criterion | pass | test | Legacy/optional schema, workflow seed, absent archive, replay and readback tests pass. |
| AC9 | acceptance_criterion | pass | test | PokeEdge main→staging exact-SHA production flow and PokeEdge-Web main→staging→production flow carry ordinary .adv/archive files before deploy/release. |
| AC10 | acceptance_criterion | pass | test | PokeEdge release remains git-log based; Corded 9e0d3d8 filters change.json/executive-summary explicitly; legacy archive artifacts unchanged by tests. |
| AC11 | acceptance_criterion | pass | test | Corded deployment checkpoints already compare changed file ranges; stable release-notes.json can be selected by separate future rewrite without index/trigger. |
| AC12 | acceptance_criterion | pass | test | Branch diff contains only Advance files; no Corded, PokeEdge, PokeEdge-Web source/workflow/config mutations. |
| C1 | constraint | respected | static_check | Review/harden/archive asset tests assert existing-phase composition and no new prompts/checkpoints. |
| C2 | constraint | respected | static_check | Change field optional; absent schema/archive/replay tests pass; no backfill path added. |
| C3 | constraint | respected | static_check | Worker build, Temporal integration, operation-ledger tests, replay and workflow-bundle boundary tests pass. |
| C4 | constraint | respected | static_check | Runtime UTF-8 envelope cap and field/collection bounds include multibyte coverage; public schema documents runtime limit. |
| C5 | constraint | respected | static_check | Sidecar emitted only by writeArchiveBundleFiles and protected in GENERATED_BUNDLE_FILES across copy loops. |
| C6 | constraint | respected | static_check | Compatibility derives from existing archive layout/git-tree promotion; zero external repo changes. |
| C7 | constraint | respected | static_check | No deployment event, dispatch, notification, API, or release-rendering trigger added. |
| DONT1 | avoidance | respected | review | No Corded source or deployment changes; only future-consumer data contract emitted. |
| DONT2 | avoidance | respected | review | Independent review confirms no renderer, version grouping, aggregate index, or CHANGELOG generator. |
| DONT3 | avoidance | respected | review | Schema and command assets contain no conditional headline/quality validation. |
| DONT4 | avoidance | respected | review | No semver_impact field exists in content or envelope schemas. |
| DONT5 | avoidance | respected | review | Optional field and absent archive tests cover legacy/current changes; no historical migration. |
| DONT6 | avoidance | respected | review | Archive tests verify existing change.json/executive-summary semantics remain unchanged; sidecar additive only. |
| DONT7 | avoidance | respected | review | Branch and external audit show no PokeEdge/PokeEdge-Web CI or historical Corded notification edits. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Corded rewrite/deployment intentionally deferred; no Corded files changed. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Historical archive backfill intentionally absent. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Rendering, version-range aggregation, and index intentionally deferred. |
| OOS4 | out_of_scope | not_applicable | not_applicable | Per-repo split intentionally deferred; one block per change implemented. |
| OOS5 | out_of_scope | not_applicable | not_applicable | External repository mutation intentionally excluded and absent from branch diff. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-5d3af5469dfa | AC1, AC6, AC7, AC8 | AC1, AC6, AC7, AC8 | C2, C4, DONT3, DONT4, DONT5, OOS2, OOS3 |  |
| tk-e7c3d487a5a4 | AC4, AC5, SC3 | AC4, AC5 | C1, C3, C7, DONT1, DONT2, DONT7, OOS1, OOS5 |  |
| tk-4e9b331b4e52 | AC2, AC3, AC6, AC8, AC9, AC10, SC2, SC3 | AC2, AC3, AC6, AC8, AC10 | C2, C5, C6, C7, DONT1, DONT6, DONT7, OOS1, OOS2, OOS5 |  |
| tk-08d4f9f3f387 | AC4, AC5, AC11, SC1, SC3 | AC4, AC5, AC11 | C1, C7, DONT1, DONT2, DONT3, DONT4, DONT7, OOS1, OOS3 |  |
| tk-ee2a9462398c |  | SC1, SC2, SC3, AC9, AC10, AC11, AC12 | C6, C7, DONT1, DONT2, DONT7, OOS1, OOS5 |  |
| tk-e1fc14279113 |  | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11, AC12 | C1, C2, C3, C4, C5, C6, C7, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7, OOS1, OOS2, OOS3, OOS4, OOS5 |  |
