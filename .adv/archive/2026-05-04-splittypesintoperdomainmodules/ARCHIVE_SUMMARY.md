# Archive: splitTypesIntoPerDomainModules

**Change ID:** splittypesintoperdomainmodules
**Archived:** 2026-05-04T07:27:36.831Z
**Created:** 2026-05-04T06:03:17.449Z

## Tasks Completed

- ✅ Capture baseline metrics: dist/index.js byte size (current 794,944 B), pnpm test pass count (current 1356+), pnpm run check exit code 0. Record in apply ledger as regression references for AC3, AC4, AC5.
  > Captured baseline: dist/index.js=794,944B (±5% range 755,196–834,692). Build succeeds. ESM 42ms + DTS 4.9s. Test count baseline deferred to verification task (saves 55s here, same evidence).
- ✅ Extract leaf domain files from plugin/src/types.ts into plugin/src/types/ (10 files): specs.ts (Priority, Scenario, Requirement, Spec, Dependency, Delta, _ID_PREFIXES preserved), tasks.ts (TaskStatus, Task, TaskType, Cancellation, Tdd*, Attempt, ErrorRecovery, TaskRun*), gates.ts (GateId, Gates, GateCompletion, GATE_DEFS, helpers), wisdom.ts, investment.ts, project.ts, conformance.ts, status.ts, tdd-helpers.ts, responses.ts. Each file imports z from "zod" and any cross-domain types from sibling files. Old types.ts unchanged at this point — directory file resolution still favors types.ts so nothing breaks. No new symbols introduced; pure extraction.
  > Created 10 leaf + helper domain files: specs, tasks, gates, wisdom, investment, project, conformance, status, tdd-helpers, agenda, responses. responses.ts forward-references ChangeStatus + FastFollowOf via type-only imports from ./changes (cycle-safe). 11 files committed in checkpoint sha 7d18113. types.ts unchanged so all 76 import sites still resolve to old file.
- ✅ Extract branch domain files: plugin/src/types/changes.ts (Change, ChangeStatus, ReentryHistory, CrossProjectOrigin, CrossProjectLink, ExternalDependency, FastFollowOf, ClarifyFindingSnapshot, BulkClose*, ChangeClosure, ChangeListStatusFilter — imports TaskSchema from ./tasks, GatesSchema from ./gates) and plugin/src/types/agenda.ts (AgendaPriority, AgendaStatus, AgendaItem, AgendaMeta, AGENDA_PRIORITY_ORDER — imports GatesSchema from ./gates). Old types.ts still wins resolution; nothing observable changes.
  > changes.ts created with Change, ChangeStatus, BulkClose, ReentryHistory, ClarifyFindingSnapshot, CrossProject*, ExternalDependency, FastFollowOf + private ValidationResult schemas. Imports from ./tasks (TaskSchema), ./specs (DeltaSchema), ./wisdom, ./gates, ./investment. agenda.ts (also a branch domain) was created in task 2.
- ✅ Construct plugin/src/types/index.ts barrel using named re-exports (matches storage/events/validator convention): export each symbol explicitly via `export { Schema1, type Type1, ... } from "./<domain>"` for all 12 domain files. 135 total exports. No `export *`. Verify no name collisions before writing (grep should confirm uniqueness).
  > index.ts barrel created. Named re-exports for 136 symbols (135 original + TddEvidence newly exported, needed by tdd-helpers.ts). Pattern matches storage/events/validator. types.ts still wins resolution at this point.
- ✅ Switch resolution: delete plugin/src/types.ts. Run `git mv plugin/src/types.test.ts plugin/src/types/index.test.ts` and update its import path from `from "./types"` to `from "."`. After this, all 76 import sites resolve through the new barrel. No other source file edits required.
  > types.ts deleted; types.test.ts → types/index.test.ts (with import path updates and ./types→. dynamic imports). 2 minimal test-tool path fixes outside types/: handoff-footer-drift.test.ts (asserts on types/status.ts now); workflow-bundle-boundary.test.ts (file-first directory resolver to handle the new directory-style "../types" import). All 3068 tests pass. Build dist=795,951B (within 755-835 KB tolerance, +0.13% from baseline).
- ✅ Verification: run `pnpm test` (must pass with ≥1356 tests — AC3), `pnpm run check` (typecheck + lint + format — AC4), `pnpm run build` (AC5: dist/index.js within 755–835 KB / ±5% of 794,944 B baseline), confirm temporal/workflow-bundle-boundary.test.ts in the suite passes (AC6). Record evidence for each AC.
  > Final verification passed: pnpm run check (typecheck + isolation + lint + format), pnpm test (167 passed, 1 skipped files; 3068 passed, 5 skipped tests), pnpm run build, dist/index.js 795,951 B within 755,196–834,692 B tolerance. workflow-bundle-boundary.test.ts passed in suite after resolver fix.

## Specs Modified

