/**
 * CLI-safe projection boundary for root `bin/adv`.
 *
 * Re-exports the resume-projection kernel and its work-graph types so the
 * standalone CLI can consume them without reaching past the approved boundary
 * set. The re-exported module graph is pure (no storage, no tools, no plugin
 * init).
 *
 * rq-cliSourceBoundary01
 */

export type { WorkNodeRef, ResumeProjection } from "../types/work-graph";
export {
  buildResumeProjection,
  type ChangeNodeInput,
  type EpicNodeInput,
  type EpicEntryInput,
  type ShellEntryInput,
  type ChangeEntryInput,
  nodeRefKey,
} from "../projection/resume-projection";

// Keep canonical test-identity recognition available to the standalone CLI
// without allowing it to deep-import plugin internals.
export {
  SYNTHETIC_TEST_PROJECT_ID,
  SYNTHETIC_TEST_PROJECT_ID_PREFIX,
} from "../utils/project-id";
