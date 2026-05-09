/**
 * GitHub Project Config — typed storage for ADV's link to a GH Project v2 board.
 *
 * Replaces the misuse of `project_metadata['github_project']` for typed
 * config. The legacy summary-string store enforces `summary: max(200)`
 * which silently rejects entries longer than that on read (validates
 * write but `safeParse` skip on read returns `{}`). For typed config,
 * we need a dedicated file with a dedicated schema.
 *
 * rq-issueChangeLinkage03: this config MUST live in `.adv/github-project.json`
 * with its own Zod schema. `project_metadata['github_project']` is a
 * read-only legacy fallback that migrates forward on first read; the
 * legacy entry is NOT deleted post-migration (validator-confirmed:
 * leaving inert data is safer than partial-failure cleanup).
 */

import { existsSync } from "fs";
import { mkdir, readFile } from "fs/promises";
import { dirname, join } from "path";
import { z } from "zod";
import { atomicWriteFile, acquireFileLock } from "../utils/fs";
import { appendDebugLog } from "../utils/debug-log";

// =============================================================================
// Schema
// =============================================================================

export const GitHubProjectConfigSchema = z.object({
  owner: z.string().min(1),
  project_number: z.number().int().positive(),
  project_id: z.string().min(1),
  title: z.string().min(1),
  fields: z.object({
    adv_type: z.string(),
    priority: z.string(),
    value: z.string(),
    time_criticality: z.string(),
    rroe: z.string(),
    effort: z.string(),
    wsjf: z.string(),
  }),
  adv_type_options: z.record(z.string(), z.string()),
  priority_options: z.record(z.string(), z.string()),
  persisted_by: z.string().optional(),
  persisted_at: z.string().optional(),
});

export type GitHubProjectConfig = z.infer<typeof GitHubProjectConfigSchema>;

// =============================================================================
// Path helpers
// =============================================================================

function configPath(repoRoot: string): string {
  return join(repoRoot, ".adv", "github-project.json");
}

// =============================================================================
// Read
// =============================================================================

/**
 * Read the GitHub Project linkage config.
 *
 * Resolution order:
 *   1. `.adv/github-project.json` — preferred typed-config file.
 *   2. `project_metadata['github_project']` — legacy summary-string fallback.
 *      If present and parseable, the entry is migrated forward to the
 *      preferred path on this read; the legacy entry is left in place.
 *   3. null — neither location has a usable entry.
 *
 * Returns `null` (not error) for the not-found case so callers can
 * choose whether to treat it as a hard error or a "needs bootstrap"
 * hint. Both `adv_roadmap source: 'live'` and `/adv-triage` Phase 0
 * use the null return to surface actionable error messages.
 */
export async function readGitHubProjectConfig(
  repoRoot: string,
  externalRoot: string | null,
): Promise<GitHubProjectConfig | null> {
  // Step 1: preferred path.
  const path = configPath(repoRoot);
  if (existsSync(path)) {
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw);
      const result = GitHubProjectConfigSchema.safeParse(parsed);
      if (result.success) return result.data;
      appendDebugLog(
        "github-project-config",
        `Schema-invalid .adv/github-project.json at ${path}: ${result.error.message}`,
      );
      return null;
    } catch (err) {
      appendDebugLog(
        "github-project-config",
        `Failed to read .adv/github-project.json at ${path}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // Step 2: legacy fallback. Only attempt when externalRoot is configured,
  // since that's where project_metadata.json lives in the modern project layout.
  //
  // Important: we read the legacy file RAW (not via readProjectMetadata)
  // because the legacy schema enforces `summary: max(200)` which silently
  // rejects long config blobs on read. The actual production data we
  // need to migrate is exactly that long, so we must bypass the legacy
  // schema and validate against GitHubProjectConfigSchema directly.
  if (!externalRoot) return null;
  const legacyPath = join(externalRoot, "project-metadata.json");
  if (!existsSync(legacyPath)) return null;

  let legacyRaw: string;
  try {
    legacyRaw = await readFile(legacyPath, "utf8");
  } catch (err) {
    appendDebugLog(
      "github-project-config",
      `Failed to read legacy project_metadata at ${legacyPath}: ${(err as Error).message}`,
    );
    return null;
  }

  let legacyDoc: unknown;
  try {
    legacyDoc = JSON.parse(legacyRaw);
  } catch (err) {
    appendDebugLog(
      "github-project-config",
      `Legacy project_metadata at ${legacyPath} is not valid JSON: ${(err as Error).message}`,
    );
    return null;
  }

  if (
    !legacyDoc ||
    typeof legacyDoc !== "object" ||
    Array.isArray(legacyDoc)
  ) {
    return null;
  }

  const legacyEntry = (legacyDoc as Record<string, unknown>)["github_project"];
  if (
    !legacyEntry ||
    typeof legacyEntry !== "object" ||
    typeof (legacyEntry as { summary?: unknown }).summary !== "string"
  ) {
    return null;
  }

  let migrated: GitHubProjectConfig;
  try {
    const parsedSummary = JSON.parse(
      (legacyEntry as { summary: string }).summary,
    );
    const result = GitHubProjectConfigSchema.safeParse(parsedSummary);
    if (!result.success) {
      appendDebugLog(
        "github-project-config",
        `Legacy github_project summary failed schema validation: ${result.error.message}`,
      );
      return null;
    }
    migrated = result.data;
  } catch (err) {
    appendDebugLog(
      "github-project-config",
      `Legacy github_project summary is not valid JSON: ${(err as Error).message}`,
    );
    return null;
  }

  // Migrate forward (one-shot). Don't delete legacy entry — leaving it
  // is inert (reads always prefer the new file); deleting adds
  // partial-failure risk for zero benefit.
  try {
    await writeGitHubProjectConfig(repoRoot, migrated);
    appendDebugLog(
      "github-project-config",
      `Migrated legacy github_project entry forward to ${path}`,
    );
  } catch (err) {
    appendDebugLog(
      "github-project-config",
      `Migration write to ${path} failed (returning legacy data anyway): ${(err as Error).message}`,
    );
    // Continue — return the parsed legacy data so the caller works
    // even if the migration write itself fails.
  }

  return migrated;
}

// =============================================================================
// Write
// =============================================================================

/**
 * Atomically write the GitHub Project linkage config to
 * `.adv/github-project.json`. Uses the canonical
 * `acquireFileLock` + `atomicWriteFile` pattern (matches
 * `project-metadata.ts:122-147`).
 *
 * The `.adv/` directory is created on demand if missing.
 */
export async function writeGitHubProjectConfig(
  repoRoot: string,
  config: GitHubProjectConfig,
): Promise<void> {
  const path = configPath(repoRoot);
  await mkdir(dirname(path), { recursive: true });

  const releaseLock = await acquireFileLock(path);
  try {
    await atomicWriteFile(path, JSON.stringify(config, null, 2));
  } finally {
    await releaseLock();
  }
}
