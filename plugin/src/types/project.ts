/**
 * Project Domain Types
 *
 * RelatedRepo, SlopScanConfig (private), FeatureFlags, ProjectConfig,
 * ProjectMetadataEntry.
 */

import { z } from "zod";

// =============================================================================
// Related Repositories (Cross-Repo Routing)
// =============================================================================

/**
 * A related repository that tasks in this project may target.
 * Generic model — any repo/path pair, not hardcoded to specific projects.
 */
export const RelatedRepoSchema = z
  .object({
    /** Short identifier used in task metadata (e.g., "backend", "api", "db") */
    id: z.string(),
    /** Absolute path to the repository root */
    path: z.string(),
    /** Human-readable role description (e.g., "Backend API server", "Database migrations") */
    role: z.string().optional(),
    /** Whether this repo is trusted for automated cross-project operations (e.g., mesh issue creation) */
    trusted: z.boolean().default(false),
    /** GitHub repo in owner/name format for GH CLI operations (e.g., "org/backend-api") */
    gh_repo: z
      .string()
      .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
      .optional(),
  })
  .passthrough();

export type RelatedRepo = z.infer<typeof RelatedRepoSchema>;

// =============================================================================
// Slop Scan Config
// =============================================================================

/**
 * Per-project threshold overrides for /adv-slop-scan.
 *
 * Defaults are calibrated to avoid false positives on normal single-guard
 * or single-catch patterns. Override in project.json under features.slop_scan.
 *
 * Example:
 * {
 *   "features": {
 *     "slop_scan": {
 *       "nesting_depth_threshold": 6,
 *       "complexity_threshold": 15
 *     }
 *   }
 * }
 */
const SlopScanConfigSchema = z
  .object({
    /**
     * Maximum nesting depth before flagging as MAINT-004.
     * Default: 4 — functions with 4+ levels of nesting are flagged.
     * Increase for domains (parsers, compilers) that legitimately need deeper nesting.
     */
    nesting_depth_threshold: z.number().int().min(1).default(4),
    /**
     * Minimum number of redundant guard patterns on the same value before
     * flagging as QUAL-011 (defensive_overkill).
     * Default: 3 — a single null check is legitimate; 3+ on the same value is slop.
     */
    defensive_guard_threshold: z.number().int().min(1).default(3),
    /**
     * Cyclomatic complexity ceiling before flagging as MAINT-004.
     * Default: 10 — aligns with ESLint complexity rule default.
     */
    complexity_threshold: z.number().int().min(1).default(10),
    /**
     * Per-file timeout in milliseconds for AST tool invocations.
     * If exceeded, the file falls back to degraded (brace/indent counter) detection.
     * Default: 10000ms (10 seconds).
     */
    ast_timeout_ms: z.number().int().min(1).default(10000),
  })
  .passthrough(); // Forward compatibility: unknown keys pass through

type _SlopScanConfig = z.infer<typeof SlopScanConfigSchema>;

// =============================================================================
// Feature Flags
// =============================================================================

/**
 * Per-project feature flag overrides.
 * All flags default to current ADV behavior — no behavior change without explicit opt-in.
 *
 * Add to project.json under the "features" key:
 * {
 *   "features": {
 *     "tdd_enforcement": "advisory",
 *     "worktree_auto_create": false,
 *     "slop_scan": {
 *       "nesting_depth_threshold": 6
 *     }
 *   }
 * }
 */
export const FeatureFlagsSchema = z
  .object({
    /**
     * TDD enforcement mode.
     * - "strict" (default): Red/green phases required; doom-loop escalation at 3 attempts
     * - "advisory": TDD encouraged but not enforced; warnings emitted instead of blocks
     * - "off": TDD skipped entirely; tasks complete without test evidence
     */
    tdd_enforcement: z.enum(["strict", "advisory", "off"]).default("strict"),
    /**
     * Whether /adv-apply automatically creates a git worktree for high-risk changes.
     * Default: true (current behavior)
     */
    worktree_auto_create: z.boolean().default(true),
    /**
     * Gate enforcement mode.
     * - "strict" (default): Gates must be completed in sequence; archive blocked until all pass
     * - "advisory": Gate status shown but not enforced; archive allowed with warnings
     */
    gate_enforcement: z.enum(["strict", "advisory"]).default("strict"),
    /**
     * Whether wisdom entries are accumulated and promoted across changes.
     * Default: true (current behavior)
     */
    wisdom_accumulation: z.boolean().default(true),
    /**
     * Clarify enforcement mode.
     * - "off" (default): Clarify checks skipped entirely; no findings emitted
     * - "advisory": Ambiguity findings surfaced as warnings in tool output; no blocking
     * - "strict": Ambiguity findings block the prep gate until resolved via /adv-clarify
     */
    clarify_enforcement: z
      .enum(["off", "advisory", "strict"])
      .default("advisory"),
    /**
     * Threshold overrides for /adv-slop-scan detection.
     * All thresholds have smart defaults; override only what differs from project norms.
     */
    slop_scan: SlopScanConfigSchema.default(() =>
      SlopScanConfigSchema.parse({}),
    ),
  })
  .passthrough(); // Allow future flags without breaking existing configs

export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;

// =============================================================================
// Project Configuration
// =============================================================================

export const ProjectConfigSchema = z
  .object({
    $schema: z.string().optional(),
    name: z.string(),
    version: z.string().optional(),
    specs_dir: z.string().default(".adv/specs"),
    changes_dir: z.string().default(".adv/changes"),
    archive_dir: z.string().default(".adv/archive"),
    docs_dir: z.string().default("docs/specs"),
    db_dir: z.string().default(".adv/db"),
    project_file: z.string().default("project.md"),
    /** Related repositories for cross-repo task routing */
    related_repos: z.array(RelatedRepoSchema).optional(),
    /** Per-project feature flag overrides. All flags default to current ADV behavior. */
    features: FeatureFlagsSchema.default(() => FeatureFlagsSchema.parse({})),
  })
  .passthrough(); // Allow extra fields for forward/backward compatibility

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

// =============================================================================
// Project Metadata Entry
// =============================================================================

/**
 * A single project metadata entry — lightweight, timestamped fact about
 * something that happened to this project (scan run, external event, etc.).
 * Stored in a flat JSON file for easy inspection and cross-worktree sharing.
 */
export const ProjectMetadataEntrySchema = z
  .object({
    /** Unique key identifying the metadata category (e.g., "slop-scan", "arch-scan") */
    key: z.string().min(1).max(64),
    /** ISO8601 timestamp when this entry was written */
    timestamp: z.string(),
    /** Integer count (e.g., number of findings, number of files scanned) */
    count: z.number().int().min(0),
    /** Human-readable one-line summary (max 200 chars) */
    summary: z.string().min(1).max(200),
    /** Who wrote this entry — defaults to "agent" */
    written_by: z.enum(["agent", "user", "system"]).default("agent"),
  })
  .passthrough(); // Allow extra fields for forward/backward compatibility

export type ProjectMetadataEntry = z.infer<typeof ProjectMetadataEntrySchema>;
