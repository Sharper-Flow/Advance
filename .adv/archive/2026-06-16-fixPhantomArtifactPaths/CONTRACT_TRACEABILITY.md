# Contract Traceability

**Change ID:** fixPhantomArtifactPaths
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-15T23:51:10.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Review/remediation verified no agent-facing active Temporal artifact path is exposed as readable: change_show artifact metadata, gates, and _contextSnapshot gate evidence normalize missing/non-readable paths; targeted tests and final full suite pass. |
| SC2 | success_criterion | pass | review | Artifact content remains accessible through adv_change_show include fields and worker packet guidance; change.test verifies Temporal document content returned without path; commands inject inline content/include guidance. |
| SC3 | success_criterion | pass | review | Agent/command policy blocks direct external ADV artifact reads across ADV workers; asset tests enforce artifact-wide filenames, include guidance, readable caveat, and artifacts.*.path warning. |
| SC4 | success_criterion | pass | review | Regression coverage spans types/artifacts, store-temporal changes, change-state, gate-readiness, workflows signal handlers, change tools, specs/assets, and command/agent asset tests. Final bin/oc-test full passed after review remediation. |
| AC1 | acceptance_criterion | pass | test | change.test covers Temporal document content returned via include without artifact path and snapshot/top-level gate path stripping; changes.test verifies Temporal metadata signal source:temporal/readable:false/no path. |
| AC2 | acceptance_criterion | pass | test | change.ts preserves Temporal-first then disk/archive fallback read paths; change.test verifies existing readable disk path preserved; full suite passed. |
| AC3 | acceptance_criterion | pass | test | adv-design, adv-research, and adv-refactor commands now load artifacts via include fields/inline packets and forbid dereferencing external artifacts.*.path; subagent-reports asset test enforces anchors. |
| AC4 | acceptance_criterion | pass | test | subagent-reports-spec-assets plus agent asset tests verify adv-researcher and peer agents contain artifact-wide state access policy, direct-read recovery rule, readable caveat, and include guidance. |
| AC5 | acceptance_criterion | pass | test | ArtifactMetadata has optional path plus source/readable; change-state normalizes blank paths; gate-readiness emits path only for readable metadata; change_show re-validates path existence. Targeted tests and final full suite pass. |
| AC6 | acceptance_criterion | pass | test | Recovery/archive/disk paths are preserved only when materialized/readable: review remediation derives recovery readable/path from fileExists and adds tests for materialized and non-materialized cases; archive/disk fallback unchanged. |
| C1 | constraint | respected | static_check | Temporal state.documents remains canonical for active artifact content; changes.ts emits content signals to documents and metadata source:temporal/readable:false with no active path. |
| C2 | constraint | respected | static_check | store-temporal changes path no longer passes artifacts to legacy disk writes or synthesizes active paths; no-disk-writes invariant test remains green. |
| C3 | constraint | respected | static_check | Workers/commands route artifact access through ADV tools and inline content; direct external ADV state file reads forbidden and recovery tells agents to stop retrying filesystem paths. |
| C4 | constraint | respected | static_check | readArtifact/readArtifacts fallback behavior retained, ARTIFACT_FILENAME centralized, readable disk path preservation test passes, full suite passes. |
| C5 | constraint | respected | static_check | Behavior is represented by typed ArtifactMetadata source/readable/path? contract, readback normalizers, gate-readiness helper, specs, and regression tests; not prose-only. |
| C6 | constraint | respected | static_check | change_show readArtifacts now uses activeStore for target_path include reads; normalization applies to activeStore readback and absolute metadata paths. Review scanner identified this as corrected latent target_path issue. |
| DONT1 | avoidance | respected | review | Structural tool output/state fixes implemented in types, store signals, change-state, gate-readiness, and change_show; prompt updates are secondary, not sole mitigation. |
| DONT2 | avoidance | respected | review | Recovery readable/path now file-existence-backed; materialized recovery path test passes; disk/archive fallback unchanged; final full suite passes. |
| DONT3 | avoidance | respected | review | No ADV/app worktree lifecycle code changed; git diff limited to specs, tool/storage/temporal artifact handling, prompts/commands, and tests. |
| DONT4 | avoidance | respected | review | Prompt edits scoped to artifact state access policy; review scanner found no unrelated prompt cleanup or out-of-scope files. |
| DONT5 | avoidance | respected | review | Content remains available via include fields and packet guidance; tests verify _design/Temporal content returned while false filesystem paths are omitted. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-e5a98cdf1080 | SC3, SC4, AC3, AC4, AC5, C5 | AC4 | C1, C2, C3, C4, C5, C6, DONT1, DONT3, DONT4, DONT5 |  |
| tk-43dc2438c083 | SC1, SC2, AC1, AC5, C1, C2, C5 | AC1, AC5 | C1, C2, C3, C5, DONT1, DONT5 |  |
| tk-a338b86baa6d | SC1, SC2, AC1, AC2, AC5, AC6, C4, C6 | AC1, AC2, AC5, AC6 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT5 |  |
| tk-b1ce593abfaa | SC2, SC3, AC3, AC4, C3 | AC3, AC4 | C3, DONT1, DONT3, DONT4, DONT5 |  |
| tk-8017cce437b5 |  | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
