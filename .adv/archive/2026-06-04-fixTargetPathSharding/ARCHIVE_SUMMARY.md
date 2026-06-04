# Archive: Fix target path sharding

**Change ID:** fixTargetPathSharding
**Archived:** 2026-06-04T19:56:04.087Z
**Created:** 2026-06-04T19:17:54.467Z

## Tasks Completed

- ✅ Update spec law for canonical target_path external roots
  > Added spec-law requirement rq-targetPathCanonicalShard01 covering target_path canonical target shard behavior under opencode-projects sharding, non-sharded fallback, and existing shadow record non-migration.
- ✅ Add shard-aware target external-root helper with unit tests
  > Implemented getExternalRootForProject(projectId) in project-id.ts. It detects canonical .../opencode-projects/{40hex} XDG_DATA_HOME, derives sibling target shard via dirname()+projectId, falls back to getExternalRoot() for non-canonical/non-sharded homes, and preserves relative XDG validation. Added project-id unit tests and verified green.
- ✅ Route target_path stores and advisory target reads through canonical target root
  > Updated resolveTargetProject() target branch to use getExternalRootForProject while preserving current-project getExternalRoot(). Updated external-dependency-status target store creation to use getExternalRootForProject. Strengthened target-project tests with sharded XDG_DATA_HOME and exact target canonical externalRoot assertions for disk snapshot and Temporal-backed target stores.
- ✅ Route cross-project change creation through canonical target root
  > Updated createCrossProjectFollowUp() to use getExternalRootForProject(targetProjectId). Added sharded cross-project create regression using real git fixture repos to obtain test project IDs; test verifies canonical target store contains new follow-up and caller-shard target store does not.
- ✅ Run related-scan and targeted verification for target_path sharding
  > Ran final related scan and verification. Remaining getExternalRoot() uses are current-project roots, test shadow-root assertion, helper fallback, or existing advance-meta text. Target create/read/mutation call sites use getExternalRootForProject. Formatted touched files and verified targeted tests, format, typecheck, lint, and spec JSON validity.

## Specs Modified


## Wisdom Accumulated

- **[pattern]** When fixing cross-project ADV routing under per-project OpenCode shards, make spec law cover both the canonical sharded target path and the legacy fallback/non-migration behavior. Otherwise the implementation can accidentally overreach into shadow-state migration or break non-sharded sessions.
- **[pattern]** For per-project OpenCode shard routing, derive target sibling shards structurally with dirname(getDataHome()) + targetProjectId, not string replacement. Validate canonical shard shape with parent basename `opencode-projects` and 40-hex shard basename; fallback preserves non-canonical/legacy sessions.
- **[pattern]** For target_path reads/mutations, preserve current-project getExternalRoot() behavior and switch only target-project externalRoot construction to the canonical target helper. Tests should assert exact target sibling shard paths for both snapshot/disk and Temporal-backed store creation, not just substring containment.
- **[gotcha]** Cross-project create tests using createTestProject fixtures may have stub `.git` dirs without root commits, so getProjectId() returns null in Vitest. To exercise shard-aware target root logic, convert the temp source/target fixtures into real git repos with one commit before calling adv_change_create.
