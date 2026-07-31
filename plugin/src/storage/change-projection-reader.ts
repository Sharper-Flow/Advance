/**
 * Pure disk readers for active change projections.
 *
 * These helpers intentionally have no Temporal dependency and no write-side
 * policy beyond the legacy normalizers that `loadChange` applies when it
 * repairs an on-disk record in place. They are the only import surface for
 * routine read-model consumers.
 */

import { join } from "path";
import { readdir, readFile } from "fs/promises";
import {
  ChangeSchema,
  normalizePersistedSubagentReportState,
  normalizeLegacyChangeStatus,
} from "../types";
import type { Change } from "../types";
import { ZodError } from "zod";
import { atomicWriteFile } from "../utils/fs";
import { createLogger } from "../utils/debug-log";

const logger = createLogger("change-projection-reader");

// =============================================================================
// Result Types
// =============================================================================

/**
 * Result type for load operations that can fail with schema validation errors.
 * Errors are returned as data, not logged to console, so AI agents can see them.
 */
export type LoadResult<T> =
  | {
      success: true;
      data: T;
      source?:
        | "workflow"
        | "disk"
        | "archive"
        | "active_projection"
        | "retired_projection"
        | "read_model";
    }
  | {
      success: false;
      error: string;
      type: "not_found" | "schema_error" | "read_error";
      source?: "disk" | "archive" | "read_model";
      degraded?: unknown;
    };

/**
 * Predicate: true when a LoadResult carries a schema_error.
 *
 * Workflow-touching callers MUST check this before falling through to a
 * Temporal query: schema errors are not recoverable through a workflow
 * round-trip and surface as generic "Failed to query Workflow" errors when
 * masked (issue #258 Defect 1).
 */
export function isSchemaError<T>(
  result: LoadResult<T>,
): result is { success: false; error: string; type: "schema_error" } {
  return !result.success && result.type === "schema_error";
}

/**
 * Format a Zod validation error into a human-readable string for AI agents.
 */
function formatZodError(
  error: ZodError,
  context: { type: string; id: string; path: string },
): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.join(".");
    return `  - ${path || "(root)"}: ${issue.message}`;
  });
  return (
    `Schema validation failed for ${context.type} "${context.id}":\n` +
    `File: ${context.path}\n` +
    `Issues:\n${issues.join("\n")}\n` +
    `Hint: Ensure the ${context.type}.json matches the schema.`
  );
}

/**
 * Rewrite historical 6-gate migration artifacts into the current 7-gate shape.
 */
function normalizeLegacyGateData(value: unknown): [unknown, boolean] {
  let changed = false;

  if (Array.isArray(value)) {
    const next = value.map((item) => {
      const [normalized, itemChanged] = normalizeLegacyGateData(item);
      changed = changed || itemChanged;
      return normalized;
    });
    return [next, changed];
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};

    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (key === "migrated_from" || key === "absorbed_completions") {
        changed = true;
        continue;
      }

      if (key === "status" && raw === "legacy") {
        out[key] = "done";
        changed = true;
        continue;
      }

      const [normalized, childChanged] = normalizeLegacyGateData(raw);
      out[key] = normalized;
      changed = changed || childChanged;
    }

    return [out, changed];
  }

  return [value, false];
}

/**
 * Normalize the change record's OWN root `status` before schema validation.
 */
function normalizeLegacyChangeRootStatus(value: unknown): [unknown, boolean] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [value, false];
  }
  const record = value as Record<string, unknown>;
  const normalizedStatus = normalizeLegacyChangeStatus(record.status);
  if (normalizedStatus !== record.status) {
    return [{ ...record, status: normalizedStatus }, true];
  }
  return [value, false];
}

// =============================================================================
// Change Operations
// =============================================================================

export async function listChangeDirs(changesDir: string): Promise<string[]> {
  try {
    const entries = await readdir(changesDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.warn(
        `Unexpected error reading changes directory: ${(err as Error).message}`,
      );
    }
    return [];
  }
}

/**
 * Resolve a partial change ID to a full change ID.
 */
export async function resolveChangeId(
  changesDir: string,
  partialId: string,
): Promise<{ id: string | null; candidates: string[] }> {
  const dirs = await listChangeDirs(changesDir);

  if (dirs.includes(partialId)) {
    return { id: partialId, candidates: [partialId] };
  }

  const prefixMatches = dirs.filter((d) =>
    d.toLowerCase().startsWith(partialId.toLowerCase()),
  );
  if (prefixMatches.length === 1) {
    return { id: prefixMatches[0], candidates: prefixMatches };
  }
  if (prefixMatches.length > 1) {
    return { id: null, candidates: prefixMatches };
  }

  return { id: null, candidates: [] };
}

export async function loadChange(
  changesDir: string,
  changeId: string,
): Promise<LoadResult<Change | null>> {
  const changePath = join(changesDir, changeId, "change.json");

  try {
    const content = await readFile(changePath, "utf-8");
    const parsed = JSON.parse(content);
    const [gateNormalized, gateChanged] = normalizeLegacyGateData(parsed);
    const [reportNormalized, reportChanged] =
      normalizePersistedSubagentReportState(gateNormalized);
    const [normalized, statusChanged] =
      normalizeLegacyChangeRootStatus(reportNormalized);
    const changed = gateChanged || reportChanged || statusChanged;

    if (changed) {
      await atomicWriteFile(changePath, JSON.stringify(normalized, null, 2));
    }

    return { success: true, data: ChangeSchema.parse(normalized) };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        error: formatZodError(error, {
          type: "change",
          id: changeId,
          path: changePath,
        }),
        type: "schema_error",
      };
    } else if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { success: true, data: null };
    } else {
      return {
        success: false,
        error: `Failed to read change ${changeId}: ${error instanceof Error ? error.message : String(error)}`,
        type: "read_error",
      };
    }
  }
}

export async function loadAllChanges(
  changesDir: string,
): Promise<Map<string, Change>> {
  const changes = new Map<string, Change>();
  const dirs = await listChangeDirs(changesDir);

  for (const dir of dirs) {
    const change = await loadChange(changesDir, dir);
    if (change.success && change.data) {
      changes.set(change.data.id, change.data);
    }
  }

  return changes;
}
