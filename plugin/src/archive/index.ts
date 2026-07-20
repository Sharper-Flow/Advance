/**
 * Archive Module
 *
 * Delta application and documentation generation.
 */

// Main orchestrator
export {
  archiveChange,
  archiveBundleExists,
  findArchiveBundle,
  reconcileInRepoArchive,
  generateContractTraceability,
  getArchiveContractProofErrors,
} from "./archive";
export {
  readProjectionManifest,
  verifyProjectionAtGitCommit,
  verifyProjectionAtPaths,
  resolveGitCommitSha,
} from "./projection-proof";
export { canonicalSha256 } from "./projection";
export {
  reconcileHistoricalArchiveDeltas,
  HistoricalConflictDispositionSchema,
  type HistoricalConflictDisposition,
} from "./historical-repair";
export { withArchiveProjectionLock } from "./projection-lock";
