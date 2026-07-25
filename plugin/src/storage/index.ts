/**
 * Storage Module Exports
 */

export { createStore, type Store, type SearchResult } from "./store";
export {
  loadProjectConfig,
  saveProjectConfig,
  loadSpec,
  saveSpec,
  loadAllSpecs,
  loadChange,
  saveChange,
  loadAllChanges,
  createChangeScaffold,
  getProjectPaths,
  resolveChangeId,
  type ProjectPaths,
} from "./json";
export {
  commitChangeProjection,
  PROJECTION_COMMIT_MAX_AUDIT_ENTRIES,
  type ProjectionCommitAuthority,
  type ProjectionCommitOutcome,
  type ProjectionCommitVerifyContext,
  type ProjectionCommitVerifyResult,
  type CommitChangeProjectionOptions,
} from "./change-projection-transaction";
