/**
 * Archive Module
 *
 * Delta application and documentation generation.
 */

// Main orchestrator
export { archiveChange } from "./archive";

// Delta application
export { applyDelta, applyDeltasToSpec, createSpecFromDeltas } from "./delta";

// Documentation generation
export { generateSpecDoc, generateAllDocs, generateSpecDocFile } from "./docs";

// Types
export type {
  DeltaApplicationResult,
  SpecUpdateResult,
  ArchiveOperationResult,
  DocGenerationOptions,
  GeneratedDoc,
  ArchiveContext,
} from "./types";
