/**
 * Storage-owned migration for artifact metadata written before disk became
 * the durable artifact source.
 *
 * The migration only changes metadata.source. Projection documents and
 * materialized artifact files are never rewritten. Every projection read is
 * byte-bounded, schema-validated, and written through the shared atomic file
 * writer; malformed projections are reported and left untouched.
 */

import { join } from "node:path";
import { readdir } from "node:fs/promises";

import { ChangeSchema } from "../types";
import { atomicWriteFile } from "../utils/fs";
import { createLogger } from "../utils/debug-log";
import {
  normalizeProjectionDocument,
  readBoundedProjectionDocument,
} from "./change-projection-reader";

const logger = createLogger("artifact-metadata-migration");

/** Keep startup work bounded while covering both active and archive trees. */
export const ARTIFACT_METADATA_MIGRATION_MAX_PROJECTIONS = 1000;
const ARTIFACT_METADATA_MIGRATION_MARKER_VERSION = 1;

export interface ArtifactMetadataMigrationFailure {
  path: string;
  reason: string;
}

export interface ArtifactMetadataMigrationReport {
  scanned: number;
  migrated: number;
  failed: ArtifactMetadataMigrationFailure[];
  truncated: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function projectionPath(parent: string, id: string): string {
  return join(parent, id, "change.json");
}

async function hasCompletionMarker(markerPath: string): Promise<boolean> {
  const result = await readBoundedProjectionDocument(markerPath);
  if (result.kind !== "ok") return false;
  try {
    const marker = asRecord(JSON.parse(result.content));
    return marker?.version === ARTIFACT_METADATA_MIGRATION_MARKER_VERSION;
  } catch {
    return false;
  }
}

async function writeCompletionMarker(
  markerPath: string,
  report: ArtifactMetadataMigrationReport,
): Promise<void> {
  try {
    await atomicWriteFile(
      markerPath,
      JSON.stringify({ version: ARTIFACT_METADATA_MIGRATION_MARKER_VERSION }),
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    report.failed.push({ path: markerPath, reason });
    logger.warn(
      `Artifact metadata migration could not write completion marker ${markerPath}: ${reason}`,
    );
  }
}

async function migrateProjection(
  path: string,
): Promise<"unchanged" | "migrated" | { reason: string }> {
  const readResult = await readBoundedProjectionDocument(path);
  if (readResult.kind === "not_found") return "unchanged";
  if (readResult.kind !== "ok") {
    return {
      reason:
        readResult.kind === "oversized"
          ? `projection exceeds ${readResult.limit} bytes`
          : `${readResult.kind}: ${readResult.error}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readResult.content);
  } catch (error) {
    return {
      reason: `corrupt JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const raw = asRecord(parsed);
  if (!raw) return { reason: "projection root must be an object" };

  const [normalized] = normalizeProjectionDocument(parsed);
  const validation = ChangeSchema.safeParse(normalized);
  if (!validation.success) {
    return { reason: "projection failed ChangeSchema validation" };
  }

  if (raw.artifacts === undefined) return "unchanged";
  const rawArtifacts = asRecord(raw.artifacts);
  if (!rawArtifacts) return { reason: "artifacts must be an object" };

  let changed = false;
  const artifacts: Record<string, unknown> = { ...rawArtifacts };
  for (const [kind, rawMetadata] of Object.entries(rawArtifacts)) {
    if (rawMetadata === undefined) continue;
    const metadata = asRecord(rawMetadata);
    if (!metadata) {
      return { reason: `artifacts.${kind} metadata must be an object` };
    }
    if (metadata.source === undefined || metadata.source === "disk") continue;
    if (typeof metadata.source !== "string") {
      return { reason: `artifacts.${kind}.source must be a string` };
    }
    // Only the historical Temporal metadata is stale. Archive and recovery
    // provenance remains meaningful and must not be rewritten.
    if (metadata.source !== "temporal") continue;
    artifacts[kind] = { ...metadata, source: "disk" };
    changed = true;
  }

  if (!changed) return "unchanged";

  // Only the source metadata is replaced; all projection documents and other
  // fields are carried over byte-for-byte at the parsed JSON value level.
  await atomicWriteFile(path, JSON.stringify({ ...raw, artifacts }, null, 2));
  return "migrated";
}

async function migrateDirectory(
  directory: string,
  report: ArtifactMetadataMigrationReport,
): Promise<void> {
  let ids: string[];
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    ids = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    const reason = error instanceof Error ? error.message : String(error);
    report.failed.push({ path: directory, reason });
    logger.warn(
      `Artifact metadata migration could not list ${directory}: ${reason}`,
    );
    return;
  }
  const boundedIds = ids.slice(0, ARTIFACT_METADATA_MIGRATION_MAX_PROJECTIONS);
  if (boundedIds.length < ids.length) report.truncated = true;

  for (const id of boundedIds) {
    const path = projectionPath(directory, id);
    report.scanned += 1;
    try {
      const result = await migrateProjection(path);
      if (result === "migrated") {
        report.migrated += 1;
      } else if (typeof result === "object") {
        report.failed.push({ path, reason: result.reason });
        logger.warn(
          `Artifact metadata migration skipped ${path}: ${result.reason}`,
        );
      }
    } catch (error) {
      // Fail closed: a write or unexpected read failure never causes a partial
      // object to replace the original projection.
      const reason = error instanceof Error ? error.message : String(error);
      report.failed.push({ path, reason });
      logger.warn(`Artifact metadata migration failed for ${path}: ${reason}`);
    }
  }
}

export async function migrateArtifactMetadataProjections(
  activeDirectory: string,
  archiveDirectory: string,
  completionMarkerPath?: string,
): Promise<ArtifactMetadataMigrationReport> {
  const report: ArtifactMetadataMigrationReport = {
    scanned: 0,
    migrated: 0,
    failed: [],
    truncated: false,
  };
  if (
    completionMarkerPath &&
    (await hasCompletionMarker(completionMarkerPath))
  ) {
    return report;
  }
  await migrateDirectory(activeDirectory, report);
  await migrateDirectory(archiveDirectory, report);
  if (report.truncated) {
    logger.warn(
      `Artifact metadata migration scan capped at ${ARTIFACT_METADATA_MIGRATION_MAX_PROJECTIONS} projections per directory`,
    );
  }
  if (completionMarkerPath && report.failed.length === 0 && !report.truncated) {
    await writeCompletionMarker(completionMarkerPath, report);
  }
  return report;
}
