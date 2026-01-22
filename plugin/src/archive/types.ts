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
  operation: "add" | "modify" | "remove";
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
  };
  /** Whether to perform a dry run (no writes) */
  dryRun?: boolean;
}
