/**
 * Pure disk readers for active change projections.
 *
 * These helpers have no write-side policy. Legacy normalizers are applied
 * in-memory during read so poisoned or
 * pre-migration records still parse, but readers never mutate disk. All durable
 * projection writes route through the storage-owned writer paths (atomic writer
 * / conditional commit primitive). They are the only import surface for routine
 * read-model consumers.
 */

import { join } from "path";
import { readdir, open } from "fs/promises";
import {
  ChangeSchema,
  normalizePersistedSubagentReportState,
  normalizeLegacyChangeStatus,
} from "../types";
import type { Change } from "../types";
import { ZodError } from "zod";
import { createLogger } from "../utils/debug-log";

const logger = createLogger("change-projection-reader");

// =============================================================================
// Bounded projection/document read primitive
// =============================================================================

/**
 * Default byte limit for active-projection JSON documents (change.json,
 * spec.json, epic projections). Large enough for realistic ADV projections with
 * many tasks and reports; small enough to prevent unbounded reads from
 * blocking ADV operations on runaway/corrupt files.
 */
export const PROJECTION_DOCUMENT_BYTE_LIMIT = 8 * 1024 * 1024; // 8 MiB

export type ProjectionDocumentReadOutcome =
  | { kind: "ok"; content: string; bytesRead: number }
  | { kind: "not_found" }
  | { kind: "oversized"; limit: number; actual: number }
  | { kind: "corrupt"; error: string }
  | { kind: "unreadable"; error: string };

// =============================================================================
// Warning propagation for aggregate/list projection reads
// =============================================================================

export type ProjectionDocumentWarningKind =
  | "oversized"
  | "corrupt"
  | "unreadable";

export type ProjectionDocumentWarning = {
  path: string;
  kind: ProjectionDocumentWarningKind;
  limit?: number;
  actual?: number;
  error?: string;
};

export function outcomeToWarning(
  path: string,
  outcome: Exclude<
    ProjectionDocumentReadOutcome,
    { kind: "ok" } | { kind: "not_found" }
  >,
): ProjectionDocumentWarning {
  if (outcome.kind === "oversized") {
    return {
      path,
      kind: "oversized",
      limit: outcome.limit,
      actual: outcome.actual,
    };
  }
  return { path, kind: outcome.kind, error: outcome.error };
}

export function loadFailureToWarning(
  path: string,
  failure: { type: string; error: string },
): ProjectionDocumentWarning {
  switch (failure.type) {
    case "oversized":
      return { path, kind: "oversized", error: failure.error };
    case "corrupt":
    case "schema_error":
      return { path, kind: "corrupt", error: failure.error };
    case "unreadable":
    case "read_error":
    default:
      return { path, kind: "unreadable", error: failure.error };
  }
}

/**
 * Byte-bounded disk read for a projection/document file.
 *
 * Opens the file once, checks its size against `limitBytes`, and only buffers
 * content when it fits. The read loop caps the in-memory buffer at `limitBytes`
 * and performs a one-byte probe after filling the cap; if the file grew during
 * the read (or stat was stale), the probe returns a byte and the function
 * reports `oversized` without ever buffering beyond the cap. Returns typed
 * outcomes for oversized, corrupt, or unreadable files so callers can fail-closed
 * with actionable diagnostics instead of blocking on an unbounded `readFile`.
 */
export async function readBoundedProjectionDocument(
  filePath: string,
  limitBytes: number = PROJECTION_DOCUMENT_BYTE_LIMIT,
): Promise<ProjectionDocumentReadOutcome> {
  try {
    const handle = await open(filePath, "r");
    try {
      const stats = await handle.stat();
      if (!stats.isFile()) {
        return {
          kind: "unreadable",
          error: `not a regular file: ${filePath}`,
        };
      }
      if (stats.size > limitBytes) {
        return { kind: "oversized", limit: limitBytes, actual: stats.size };
      }

      // Bounded buffer: never allocate more than the cap for a single read.
      const buffer = Buffer.alloc(limitBytes);
      let totalRead = 0;

      while (totalRead < limitBytes) {
        const { bytesRead } = await handle.read(
          buffer,
          totalRead,
          limitBytes - totalRead,
          totalRead,
        );
        if (bytesRead === 0) {
          break;
        }
        totalRead += bytesRead;
      }

      // If the cap was filled, probe the next byte. A non-zero probe proves the
      // file is larger than the cap (grew during read or a race after stat).
      if (totalRead === limitBytes) {
        const probe = Buffer.alloc(1);
        const { bytesRead } = await handle.read(probe, 0, 1, limitBytes);
        if (bytesRead > 0) {
          const finalStats = await handle.stat();
          return {
            kind: "oversized",
            limit: limitBytes,
            actual: finalStats.size,
          };
        }
      }

      const content = buffer.toString("utf-8", 0, totalRead);
      return { kind: "ok", content, bytesRead: totalRead };
    } finally {
      await handle.close();
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { kind: "not_found" };
    }
    if (error instanceof SyntaxError) {
      return {
        kind: "corrupt",
        error: error instanceof Error ? error.message : String(error),
      };
    }
    return {
      kind: "unreadable",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

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
        | "disk"
        | "archive"
        | "active_projection"
        | "retired_projection"
        | "read_model";
      warnings?: ProjectionDocumentWarning[];
    }
  | {
      success: false;
      error: string;
      type:
        | "not_found"
        | "schema_error"
        | "read_error"
        | "oversized"
        | "corrupt"
        | "unreadable";
      source?: "disk" | "archive" | "read_model";
      degraded?: unknown;
    };

/**
 * Predicate: true when a LoadResult carries a schema_error.
 *
 * Callers MUST check this before falling through to another read source:
 * schema errors are not recoverable by retrying the same projection read and
 * should surface directly (issue #258 Defect 1).
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

/**
 * Apply in-memory legacy normalization to a parsed change projection.
 *
 * Returns the normalized value and whether any change was applied. This is a
 * pure transform; it does not touch disk. Callers that need to persist the
 * normalized form must use the storage-owned atomic writer.
 */
export function normalizeProjectionDocument(
  value: unknown,
): [unknown, boolean] {
  const [gateNormalized, gateChanged] = normalizeLegacyGateData(value);
  const [reportNormalized, reportChanged] =
    normalizePersistedSubagentReportState(gateNormalized);
  const [normalized, statusChanged] =
    normalizeLegacyChangeRootStatus(reportNormalized);
  return [normalized, gateChanged || reportChanged || statusChanged];
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

  const readResult = await readBoundedProjectionDocument(changePath);
  if (readResult.kind !== "ok") {
    switch (readResult.kind) {
      case "not_found":
        return { success: true, data: null };
      case "oversized":
        return {
          success: false,
          error: `Change projection ${changeId} exceeds byte limit: ${readResult.actual} bytes > ${readResult.limit} bytes (${changePath})`,
          type: "oversized",
        };
      case "corrupt":
        return {
          success: false,
          error: `Change projection ${changeId} is corrupt: ${readResult.error} (${changePath})`,
          type: "corrupt",
        };
      case "unreadable":
        return {
          success: false,
          error: `Failed to read change ${changeId}: ${readResult.error} (${changePath})`,
          type: "unreadable",
        };
      default: {
        const _exhaustive: never = readResult;
        return {
          success: false,
          error: `Unexpected projection read outcome for ${changeId} (${changePath})`,
          type: "read_error",
        };
      }
    }
  }

  try {
    const parsed = JSON.parse(readResult.content);
    const [normalized] = normalizeProjectionDocument(parsed);
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
    }
    return {
      success: false,
      error: `Failed to parse change ${changeId}: ${error instanceof Error ? error.message : String(error)}`,
      type: "corrupt",
    };
  }
}

export type SummaryCandidateExclusion = {
  id: string;
  reason: "canonical_missing" | "canonical_terminal" | "canonical_error";
  detail?:
    | "schema_error"
    | "oversized"
    | "corrupt"
    | "unreadable"
    | "read_error";
};

export type SummaryCandidateClassification = {
  valid: string[];
  excluded: SummaryCandidateExclusion[];
};

export async function classifySummaryCandidates(
  changesDir: string,
  candidateIds: string[],
): Promise<SummaryCandidateClassification> {
  const valid: string[] = [];
  const excluded: SummaryCandidateExclusion[] = [];

  for (const id of candidateIds) {
    const result = await loadChange(changesDir, id);

    if (result.success) {
      if (!result.data) {
        excluded.push({ id, reason: "canonical_missing" });
      } else if (
        result.data.status === "archived" ||
        result.data.status === "closed"
      ) {
        excluded.push({ id, reason: "canonical_terminal" });
      } else {
        valid.push(id);
      }
      continue;
    }

    if (result.type === "not_found") {
      excluded.push({ id, reason: "canonical_missing" });
    } else {
      excluded.push({ id, reason: "canonical_error", detail: result.type });
    }
  }

  return { valid, excluded };
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
