# Archive Briefing Digest

**Change ID:** detectStalePluginBundle
**Title:** Detect stale plugin bundle
**Status:** archived
**Generated:** 2026-07-17T03:41:37.564Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: discovery

## Archive Digest

**Status:** archived

| Gate | Status |
| --- | --- |
| proposal | done |
| discovery | done |
| design | done |
| planning | done |
| execution | done |
| acceptance | done |
| release | pending |

## Epic Context

No Epic membership

## Durable Facts

Showing 67 of 67 durable facts.

- **[archive_only_evidence]** decisions: Used a tsup programmatic build script to generate an opaque pre-bundle generation and inject it via define before bundling. — The generation must be defined before the bundler runs and then written to the sidecar after index.js exists; the script is the only place that can both inject and finalize.
- **[archive_only_evidence]** decisions: Captured the loaded generation at module evaluation in plugin-bundle-manifest.ts and imported it from index.ts. — Keeps the generation concern in the manifest module and wires module-evaluation capture without scattering logic in index.ts.
- **[archive_only_evidence]** decisions: Made files.index diagnostic-only and used generation equality as the staleness authority. — Satisfies AC5: a deployment that preserves index.js mtime but changes the manifest generation still reports stale.
- **[archive_only_evidence]** verification: pnpm exec vitest run --run src/plugin-bundle-manifest.test.ts (1) — Red phase: test suite failed before implementation because the plugin-bundle-manifest module did not exist.
- **[archive_only_evidence]** verification: pnpm exec vitest run --run src/plugin-bundle-manifest.test.ts (0) — Green phase: 12/12 tests pass after implementation.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/plugin-bundle-manifest.test.ts (0) — 12/12 tests pass through the repo-local throttle wrapper.
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, test isolation, lockfile policy, lint, and format:check all green.
- **[archive_only_evidence]** verification: pnpm run build (0) — Production build writes dist/plugin-bundle-manifest.json with schema_version 1, generation, index SHA-256, and ISO built_at; no temp files remain.
- **[unresolved_action]** consumer_warnings: verification_mismatch: Reported exit_code 1 differs from durable adv_run_test evidence exitCode 0 for command: pnpm exec vitest run --run src/plugin-bundle-manifest.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/plugin-bundle-manifest.test.ts
- **[archive_only_evidence]** decisions: Added optional loadedGenerationOverride to getPluginBundleFreshness so tests can exercise current/stale/unknown without mocking module-level capture. — In test source execution the build-time define is not injected, so the captured loaded generation is always null; the override keeps the function production-simple while making it testable.
- **[archive_only_evidence]** decisions: Placed the PLUGIN_BUNDLE_STALE section in the stable header after SESSION_HEALTH and before WORKTREE_SESSION. — It is an independent deployment advisory, not a session-health hazard; ordering keeps session-health warnings first and preserves the existing stable-section hierarchy.
- **[archive_only_evidence]** decisions: Caught manifest-read errors in the experimental.chat.system.transform hook and returned null for pluginBundleFreshness. — Satisfies C3/DONT3: staleness detection must not crash initialization or overwrite session-health state.
- **[archive_only_evidence]** verification: pnpm exec vitest run --run src/plugin-bundle-manifest.test.ts src/utils/plugin-runtime-info.test.ts src/utils/system-block.test.ts src/utils/tool-formatters.test.ts (0) — 137 tests pass (TDD green after implementation)
- **[archive_only_evidence]** verification: pnpm exec vitest run --run src/tools/status.test.ts (0) — 55 status tests pass including new plugin bundle generation freshness assertions
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/plugin-bundle-manifest.test.ts src/utils/plugin-runtime-info.test.ts src/utils/system-block.test.ts src/utils/tool-formatters.test.ts src/tools/status.test.ts (0) — 192 tests pass through repo-local throttle wrapper
- **[archive_only_evidence]** verification: bin/oc-test smoke (0) — Repo checks (schemas, typecheck, isolation, lockfile, lint, format) plus 68 smoke tests pass
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, isolation, lockfile policy, lint, and format:check all green
- **[archive_only_evidence]** verification: pnpm run build (0) — Production build writes dist/plugin-bundle-manifest.json and embeds generation into dist/index.js chunk
- **[archive_only_evidence]** decisions: Centralized plugin root / dist path resolution in plugin-bundle-manifest.ts via getPluginRoot() and getPluginBundleDistDir(). — Both index.ts and plugin-runtime-info.ts need the plugin root; computing it locally with ../.. from one-level-deep index.ts or from a bundled dist/chunk was producing repo-root instead of plugin-root. A single source-of-truth helper anchored to plugin-bundle-manifest.ts's location (always one level under plugin root) removes the per-callsite arithmetic.
- **[archive_only_evidence]** decisions: Added optional moduleUrl parameter to the helpers so tests can simulate source and bundled module paths. — Tests run from source and cannot easily observe production bundling; the parameter lets regression tests assert the resolution for src/index.ts, dist/index.js, and dist/chunk-*.js without relying on the actual build.
- **[archive_only_evidence]** decisions: Removed local dirname/fileURLToPath imports from index.ts and plugin-runtime-info.ts where only the plugin root was needed. — Eliminates the duplicated, fragile path math and keeps the resolution logic in one place.
- **[archive_only_evidence]** verification: pnpm run typecheck (0) — TypeScript passes with centralized helpers and removed local imports
- **[archive_only_evidence]** verification: pnpm exec vitest run --run src/plugin-bundle-manifest.test.ts src/utils/plugin-runtime-info.test.ts src/utils/system-block.test.ts src/utils/tool-formatters.test.ts src/tools/status.test.ts (0) — 198 tests pass including 6 new path-resolution regression tests
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/plugin-bundle-manifest.test.ts src/utils/plugin-runtime-info.test.ts src/utils/system-block.test.ts src/utils/tool-formatters.test.ts src/tools/status.test.ts (0) — 198 tests pass through repo-local throttle wrapper (reran after one transient flake)
- **[archive_only_evidence]** verification: pnpm run check (0) — schemas:check, typecheck, isolation, lockfile policy, lint, and format:check all green
- **[archive_only_evidence]** verification: pnpm run build (0) — Production build succeeds; built dist/chunk-*.js shows getPluginRoot() resolves from module's directory to plugin root, and index.js uses getPluginBundleDistDir()
- **[archive_only_evidence]** decisions: Made the plugin manifest part of the deploy-time stale check so missing manifests trigger a rebuild before the guard fires. — The stale check already enforces required dist outputs; treating the manifest as a required output is the simplest structural guard and avoids a redundant failure path in normal builds.
- **[archive_only_evidence]** decisions: Skipped the manifest file existence guard in --dry-run mode. — Dry-run is a preview and may legitimately show a stale dist that would be rebuilt; failing on a missing manifest would break the existing dry-run preview behavior.
- **[archive_only_evidence]** decisions: Used sha256sum with shasum fallback for index validation. — Keeps the script portable across Linux (sha256sum) and macOS (shasum).
- **[archive_only_evidence]** decisions: Used jq to extract the expected hash from the manifest. — jq is already a documented dependency for deploy-local --fix config patching, so reusing it avoids adding another tool.
- **[archive_only_evidence]** verification: cd plugin && pnpm run check (0) — schemas:check, typecheck, test-isolation, lockfile-policy, eslint, and prettier all pass.
- **[archive_only_evidence]** verification: cd plugin && pnpm run build (0) — Plugin, worker bundle, and build-identity artifacts produced successfully; plugin-bundle-manifest.json regenerated.
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/deploy-local-plugin-manifest.test.ts (0) — Both new TDD tests pass: missing manifest blocks deploy and manifest-last publication preserves mtime identity.
- **[archive_only_evidence]** verification: cd plugin && npx vitest run src/deploy-local.test.ts src/deploy-local-worker-refresh.test.ts src/overlay-sync-assets.test.ts src/deploy-local-plugin-manifest.test.ts (0) — All 97 deploy-related regression tests pass after the rsync/manifest changes.
- **[archive_only_evidence]** verification: ./scripts/deploy-local.sh --dry-run (0) — Dry-run emits the new manifest-exclude/validate/publish-last preview messages and exits cleanly.
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run build
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/deploy-local-plugin-manifest.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: cd plugin && npx vitest run src/deploy-local.test.ts src/deploy-local-worker-refresh.test.ts src/overlay-sync-assets.test.ts src/deploy-local-plugin-manifest.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: No adv_run_test evidence found for reported command: ./scripts/deploy-local.sh --dry-run
- **[report_follow_up]** follow_ups: Packet omitted IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION anchors; scout followed TASK_SCOPE and embedded agreement without inferring missing boundaries.
- **[report_follow_up]** follow_ups: Episode recall returned no relevant prior decision; prior_consideration remains unknown and must be supplied by orchestrator conflict scan.
- **[report_follow_up]** follow_ups: Candidate details are returned in the user-facing response; no files were edited.
- **[research_citation]** sources: Approved agreement: Defines generation equality, typed stale/unknown states, health output, one system banner, deployment refusal, mtime diagnostics only, and no hot reload. (adv://change/detectStalePluginBundle/agreement)
- **[research_citation]** sources: Existing plugin runtime diagnostics: PluginRuntimeInfo already centralizes runtime provenance; current freshness authority is mtime-based and getPluginRuntimeInfo reads diagnostics on demand. (file:///home/jon/dev/advance/plugin/src/utils/plugin-runtime-info.ts#L55-L74)
- **[research_citation]** sources: Existing status health seam: adv_status already returns plugin_runtime in the health-oriented output assembly. (file:///home/jon/dev/advance/plugin/src/tools/status.ts#L821-L879)
- **[research_citation]** sources.omitted: 3 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: CAUTION. Strongest leverage is extending existing plugin-runtime-info, status health output, and single system-block assembler instead of creating parallel diagnostics. Design should preserve a distinct loaded embedded generation, return discriminated unknown reasons, keep stale banner state independent from session-health hazards, and make manifest publication the explicit last deployment step. Reuse worker manifest semantics as a pattern, not its worker-specific API.
- **[report_follow_up]** follow_ups: TASK_SCOPE, IN_SCOPE, OUT_OF_SCOPE, DONE_WHEN, STOP_WHEN, and VERIFICATION were supplied in the orchestrator packet and followed exactly; no files were edited.
- **[report_follow_up]** follow_ups: Episode advisory recall returned no relevant project decision; no recalled text was used as evidence.
- **[report_follow_up]** follow_ups: I do not know whether tsup's onSuccess timing remains stable across every future tsup release; current official docs support async onSuccess after successful JavaScript build, but the simpler project-specific build finalizer should be verified by fixture tests.
- **[report_follow_up]** follow_ups: Planning should define a bounded unknown-reason enum covering missing, empty, malformed JSON, unsupported schema, invalid generation/hash/timestamp, and unreadable manifest, matching AC4.
- **[research_citation]** sources: Approved agreement: Requires immutable generation equality, typed stale/restart recovery, safe bounded unknown states, mtime-independent detection, health projection, exactly one stale section, missing-manifest deploy refusal, no hot reload, and no session-health overwrite. (adv://change/detectStalePluginBundle/agreement)
- **[research_citation]** sources: Proposed design: Proposes one embedded plugin generation, final index.js SHA-256, atomic plugin-specific manifest, additive PluginRuntimeInfo diagnostics, independent system-block section, and manifest-last deployment. (adv://change/detectStalePluginBundle/design)
- **[research_citation]** sources: Runtime provenance spec law: Requires existing dist/source/process freshness fields and structured recovery hint in adv_status health, graceful null degradation, and no in-surface rebuild/restart orchestration. (https://github.com/Sharper-Flow/Advance/blob/trunk/.adv/specs/advance-delivery/spec.md#rq-runtimeProvenance01)
- **[research_citation]** sources.omitted: 14 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: CAUTION. Core architecture is correct and simpler than timestamp authority or hot reload: capture one immutable build generation in loaded code, compare it with a sidecar generation, retain SHA-256 and built_at as provenance, degrade invalid reads to typed unknown, and surface stale state through existing runtime-info/status/system-block seams (agreement; proposed design; Node crypto docs; POSIX rename spec). Two design details need explicit closure before implementation: (1) AC7 requires the deployed manifest to be re-read and compared on every system transform, or through an equivalently guaranteed refresh path, because current transform input has no plugin-freshness source; init-only capture would miss a later deploy (current transform call site). Keep IO outside the pure assembler and pass a typed snapshot into it. (2) Define generation creation as one pre-bundle, non-content-derived opaque value shared by compile-time injection and manifest finalization; using the final index hash as the embedded generation would create self-reference. Hash final index.js separately as agreed. Preserve existing source_dist_freshness and recovery_hint fields additively because rq-runtimeProvenance01 still requires them. Manifest-last deployment is sound as a visibility marker only if the first rsync excludes the manifest and final publication validates/copies it separately; current one-pass rsync does not provide that ordering.
- **[unresolved_action]** required_main_agent_actions: Review and checkpoint the two scoped uncommitted reviewer fixes before acceptance; no further code review action required.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] Sidecar manifests need validation for every contract field: merely checking `built_at` is a string accepts malformed manifests and violates safe-unknown semantics.
- **[archive_only_evidence]** changes_made: plugin/src/plugin-bundle-manifest.ts: Reject non-canonical or invalid `built_at` values so malformed manifests degrade to bounded `unknown`, rather than being treated as current or stale.
- **[archive_only_evidence]** changes_made: plugin/src/plugin-bundle-manifest.test.ts: Add malformed timestamp regression coverage to manifest reader validation.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/plugin-bundle-manifest.test.ts, bin/oc-test targeted -- src/plugin-bundle-manifest.test.ts src/utils/plugin-runtime-info.test.ts src/utils/system-block.test.ts src/utils/tool-formatters.test.ts src/tools/status.test.ts src/deploy-local-plugin-manifest.test.ts, pnpm run check, pnpm run build && node -e '<verify plugin manifest schema, generation, hash, canonical ISO timestamp>', git diff --check results=pass — Focused manifest suite: 22/22 passed. Affected suite: 6 files, 200/200 tests passed. `pnpm run check` completed schemas, typecheck, isolation/lockfile checks, lint, and formatting. Production build wrote a schema-v1 manifest; direct verification confirmed generation/hash/canonical ISO timestamp. `git diff --check` clean.
- **[wisdom_candidate]** wisdom_candidates: [pattern] Manifest-last deployments require same-directory temporary-copy and rename publication; direct copy can expose a partial sidecar.
- **[archive_only_evidence]** changes_made: scripts/deploy-local.sh: Atomically published manifest after payload validation.
- **[archive_only_evidence]** changes_made: plugin/src/deploy-local-plugin-manifest.test.ts: Covered no leftover temporary manifest files.
- **[archive_only_evidence]** changes_made: plugin/src/overlay-sync-assets.test.ts: Added required valid plugin manifest fixture.
- **[archive_only_evidence]** verification: tests_run=../bin/oc-test targeted -- src/plugin-bundle-manifest.test.ts src/utils/plugin-runtime-info.test.ts src/utils/system-block.test.ts src/utils/tool-formatters.test.ts src/tools/status.test.ts src/deploy-local-plugin-manifest.test.ts src/deploy-local-worker-refresh.test.ts src/deploy-local.test.ts src/overlay-sync-assets.test.ts, pnpm run check, pnpm run build, git diff --check $(git merge-base HEAD origin/trunk) results=pass — 9 scoped files / 295 tests passed; schema/type/isolation/lockfile/lint/format passed; production build emitted manifest; diff check passed. All contract review matrix rows pass. Prior proposal ambiguity warnings are not minted-contract gaps.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
| AC9 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | not_applicable |

## Unresolved Actions

- verification_mismatch: Reported exit_code 1 differs from durable adv_run_test evidence exitCode 0 for command: pnpm exec vitest run --run src/plugin-bundle-manifest.test.ts
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/plugin-bundle-manifest.test.ts
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && pnpm run build
- verification_missing: No adv_run_test evidence found for reported command: bin/oc-test targeted -- src/deploy-local-plugin-manifest.test.ts
- verification_missing: No adv_run_test evidence found for reported command: cd plugin && npx vitest run src/deploy-local.test.ts src/deploy-local-worker-refresh.test.ts src/overlay-sync-assets.test.ts src/deploy-local-plugin-manifest.test.ts
- verification_missing: No adv_run_test evidence found for reported command: ./scripts/deploy-local.sh --dry-run
- Review and checkpoint the two scoped uncommitted reviewer fixes before acceptance; no further code review action required.
