/**
 * Archive Types
 *
 * Types for delta application and documentation generation.
 */

import type { Change, Spec } from "../types";

// =============================================================================
// Delta Application Result
// =============================================================================

export interface DeltaApplicationResult {
  /** Whether the delta was successfully applied */
  success: boolean;
  /** The delta that was applied */
  deltaId: string;
  /** Operation performed */
  operation: "add" | "modify" | "remove" | "rename";
  /** Target requirement ID (for modify/remove) */
  targetId?: string;
  /** New requirement ID (for add) */
  newId?: string;
  /** Error message if failed */
  error?: string;
}

export interface SpecUpdateResult {
  /** Capability name */
  capability: string;
  /** Original spec version */
  originalVersion: string;
  /** New spec version */
  newVersion: string;
  /** Individual delta results */
  deltaResults: DeltaApplicationResult[];
  /** Updated spec (if successful) */
  updatedSpec?: Spec;
}

// =============================================================================
// Archive Result
// =============================================================================

export interface ArchiveOperationResult {
  /** Whether the archive operation succeeded */
  success: boolean;
  /** Change that was archived */
  changeId: string;
  /** Specs that were updated */
  specsUpdated: SpecUpdateResult[];
  /** Documentation files generated */
  docsGenerated: string[];
  /** Path to the archived change */
  archivePath: string;
  /** Errors encountered */
  errors: string[];
  /** Timestamp of archive operation */
  archivedAt: string;
  /** Number of wisdom entries auto-promoted to project level */
  wisdomPromoted?: number;
  /** Multi-repo archive refs/preflight metadata, when change has scope_repos */
  multiRepo?: MultiRepoArchiveMetadata;
}

export interface MultiRepoArchiveRepoMetadata {
  repo_id: string;
  role?: "primary" | "secondary";
  path: string;
  repo_project_id?: string;
  required: boolean;
  merge_order?: number;
  branch: string;
  default_branch: string;
  default_head?: string;
  head_before: string;
  head_after: string;
  ff_only_preflight: {
    passed: boolean;
    command: string;
    error?: string;
  };
}

export interface MultiRepoArchiveVerificationEvidence {
  task_id: string;
  verification: string;
}

export interface MultiRepoArchiveMetadata {
  product_id?: string;
  collected_at: string;
  repos: MultiRepoArchiveRepoMetadata[];
  verification_evidence: MultiRepoArchiveVerificationEvidence[];
}

// =============================================================================
// Doc Generation Options
// =============================================================================

export interface DocGenerationOptions {
  /** Output directory for docs */
  outputDir: string;
  /** Include table of contents */
  includeToc?: boolean;
  /** Include scenario details */
  includeScenarios?: boolean;
  /** Template style */
  template?: "default" | "minimal" | "detailed";
}

export interface GeneratedDoc {
  /** Capability name */
  capability: string;
  /** Output file path */
  filePath: string;
  /** Content that was written */
  content: string;
}

// =============================================================================
// Archive Context
// =============================================================================

export interface ArchiveContext {
  /** The change being archived */
  change: Change;
  /** Existing specs (loaded from disk) */
  specs: Map<string, Spec>;
  /** Project paths */
  paths: {
    specs: string;
    archive: string;
    docs: string;
    /** Source changes directory — when provided, sibling files (proposal.md, problem-statement.md) are copied to archive */
    changes?: string;
    /** Project wisdom file path — when provided, convention/pattern wisdom is auto-promoted during archive */
    wisdom?: string;
    /** In-repo archive path — when provided, an identical bundle is written to this path within the repository */
    inRepoArchive?: string;
  };
  /** Whether to perform a dry run (no writes) */
  dryRun?: boolean;
  /** Product id for multi-repo archive metadata. */
  productId?: string;
}
