# Archive Briefing Digest

**Change ID:** persistPostArchiveSubagent
**Title:** Persist post-archive subagent reports
**Status:** archived
**Generated:** 2026-07-09T23:53:36.001Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: roadmap #213

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

Showing 21 of 21 durable facts.

- **[agenda]** follow_ups: Add a characterization test proving a report appended to an ARCHIVED bundle change.json is returned by getTemporalChange (source: archive) and by adv_change_show include.subagentReports, and a parallel test for the CLOSED case reading paths.changes.
- **[agenda]** follow_ups: Confirm during planning whether adv_subagent_report_submit routes through withTargetPathStore for cross-project terminal changes so the correct paths.archive/paths.changes are resolved for target projects.
- **[archive_only_evidence]** sources: getTemporalChange read-path ordering: getTemporalChange calls loadTerminalProjection FIRST and unconditionally (L591), returning it before the changeCache.get check at L604. For archived changes the disk projection is dominant and re-read every call, so a stale changeCache entry cannot shadow it.
- **[archive_only_evidence]** sources: loadArchiveBundleDominantProjection re-reads + re-caches: loadTerminalProjection -> loadArchiveBundleDominantProjection -> loadArchiveProjection reads the archive bundle from legacy.paths.archive every call and re-populates changeCache via setCachedProjection (L455). Read path is disk-dominant and self-refreshing for archived changes.
- **[archive_only_evidence]** sources: loadArchiveProjection reads the ARCHIVE dir: Reads loadChange(legacy.paths.archive, changeId) and iterates archive dirs matching change.json.id (handles {date}-{changeId} bundle naming). It never reads paths.changes for the archived case.
- **[archive_only_evidence]** sources: findArchiveBundle resolves dated bundle dir: Resolves the {date}-{changeId} bundle directory containing change.json (verified readable). This is the same file loadArchiveProjection reads back.
- **[archive_only_evidence]** sources: _recovery-writers cache policy docstring (authoritative): Canonical policy: status/disposition recovery writers use disk-direct saveChange WITHOUT store.changes.refresh(), because refresh re-queries Temporal and can overwrite the disk repair with stale non-terminal state. The Temporal read path treats archive bundles as terminal/dominant and invalidates stale active cache entries there.
- **[archive_only_evidence]** sources: saveRecoveredDesignConcernDisposition uses saveChange(paths.changes): The pattern the design cites writes via saveChange(input.store.paths.changes, updated) — i.e. the ACTIVE changes dir — not the archive bundle. Latest-wins on (taskId, concernKey) + recovery_audit.
- **[archive_only_evidence]** sources: saveChange target path: saveChange(changesDir, change) writes join(changesDir, change.id, 'change.json'). It always targets the passed changesDir (active dir when store.paths.changes is passed); it does NOT resolve or write the archive bundle.
- **[archive_only_evidence]** sources: store-disk changes.get reads only paths.changes: legacy.changes.get resolves and loads only from paths.changes (active dir). It has no archive-dir fallback. Confirms an active-dir write is invisible to the archive-dominant read path for archived changes.
- **[archive_only_evidence]** sources: loadChange normalizes persisted subagent reports on readback: loadChange runs normalizePersistedSubagentReportState before ChangeSchema.parse, so appended subagent_reports[] normalize safely on read (aligns with rq-subagentReports10).
- **[archive_only_evidence]** sources: adv_change_show include.subagentReports read shape: Reads change.subagent_reports[] plus task.subagent_reports[] (legacy), dedupes by subagentReportReadbackKey. A change-scoped sidecar append is surfaced here without further read-path change.
- **[archive_only_evidence]** sources: rq-subagentReports09 replay/legacy compatibility: Report persistence MUST preserve Temporal replay safety and legacy task/checkpoint consumer compatibility. Disk-projection append to a terminal change does not touch workflow history, so it does not add replay events — but sidecar keys must stay deterministic/scope-aware.
- **[archive_only_evidence]** sources: invalidateChange semantics: invalidateChange(changeId) deletes changeCache + memo entries. Available as an optional belt-and-suspenders after a disk write; not strictly required because loadTerminalProjection re-reads disk first for archived.
- **[archive_only_evidence]** architecture_assessment: The design's core shape is sound: for terminal (archived/closed) changes, Temporal rejects signals on completed workflows, and the Temporal read path is already durable-disk-dominant (getTemporalChange loads loadTerminalProjection FIRST, before any workflow query or cache read). So appending to the terminal DISK projection subagent_reports[] and running the file-based consumers is architecturally correct and needs NO read-path change. Claim 3 (read dominance) and the cache concern (Claim 1) both resolve favorably: because loadArchiveBundleDominantProjection re-reads disk and re-populates the cache on EVERY getTemporalChange call, a stale changeCache cannot serve a report-less projection after a disk write. The correct write discipline is disk-direct saveChange WITHOUT store.changes.refresh() (refresh re-queries Temporal and can clobber the repair with stale non-terminal state) — exactly the _recovery-writers policy. HOWEVER, Claim 2 is REFUTED as literally specified: the cited helper saveRecoveredDesignConcernDisposition writes via saveChange(store.paths.changes, ...) which targets the ACTIVE changes dir, whereas the archived read path (loadArchiveProjection) reads the ARCHIVE BUNDLE dir ({date}-{changeId}/change.json via findArchiveBundle). legacy.changes.get reads only paths.changes and has no archive fallback. Therefore, for the ARCHIVED case, a saveChange(paths.changes,...) write is invisible to the dominant read path. The archived writer must target the resolved archive-bundle change.json (findArchiveBundle(paths.archive, changeId)), not paths.changes. For the CLOSED case, loadDiskTerminalProjection -> legacy.changes.get reads paths.changes, so saveChange(paths.changes,...) IS the correct target — the two terminal states need DIFFERENT write targets, which the design's single 'mirror saveRecoveredDesignConcernDisposition' framing conflates.
- **[unresolved_action]** validation.blockers: Archived write target mismatch: design mirrors saveRecoveredDesignConcernDisposition which writes saveChange(store.paths.changes, ...) = active changes dir, but the archived read path (loadArchiveProjection, index.ts:420) reads the archive BUNDLE dir resolved by findArchiveBundle (archive.ts:1055). legacy.changes.get (store-disk.ts:352) reads only paths.changes, so an active-dir write is invisible for archived changes. The archived writer MUST write the bundle change.json (findArchiveBundle(paths.archive, changeId)) instead.
- **[unresolved_action]** required_main_agent_actions: Fix completed-workflow race fallback to reload/use terminal projection before disk recovery persistence.
- **[unresolved_action]** required_main_agent_actions: Add regression coverage for WorkflowExecutionAlreadyCompleted after an initial active load, proving archived bundle change.json receives the report and readback is visible.
- **[unresolved_action]** required_main_agent_actions: Rerun targeted vitest and pnpm run check after remediation.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] For terminal ADV projections, disk recovery writers must receive a terminal-status snapshot. Passing a stale active snapshot to a fallback can write to the active projection while archived readback remains bundle-dominant, making a successful write invisible.
- **[archive_only_evidence]** verification: tests_run=pnpm --dir plugin exec vitest run src/tools/_recovery-writers.test.ts src/tools/subagent-report.test.ts, pnpm --dir plugin run check results=pass — Targeted vitest: 2 files passed, 55 tests passed. Check: schemas:check, typecheck, test isolation, lockfile policy, lint, and format:check passed.

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |

## Unresolved Actions

- Archived write target mismatch: design mirrors saveRecoveredDesignConcernDisposition which writes saveChange(store.paths.changes, ...) = active changes dir, but the archived read path (loadArchiveProjection, index.ts:420) reads the archive BUNDLE dir resolved by findArchiveBundle (archive.ts:1055). legacy.changes.get (store-disk.ts:352) reads only paths.changes, so an active-dir write is invisible for archived changes. The archived writer MUST write the bundle change.json (findArchiveBundle(paths.archive, changeId)) instead.
- Fix completed-workflow race fallback to reload/use terminal projection before disk recovery persistence.
- Add regression coverage for WorkflowExecutionAlreadyCompleted after an initial active load, proving archived bundle change.json receives the report and readback is visible.
- Rerun targeted vitest and pnpm run check after remediation.
